import {
  Point,
  extractFirstPolygon,
  ensureCounterClockwise,
  ensureCyclic,
  boundingBoxAndCenterOfPolygon,
  positivePolygonArea,
  convexHull,
  simplifyPolygonWithEpsilon,
  simplifyPolygonUntilNumberOfPoints,
  ensureNonCyclic,
  getPositiveAngleFromThreePoints,
  getAngle,
  shiftPolygon,
  polygonLength,
} from '../util';
import { settings } from '../constants';

export interface TriangleAnalysisResult {
  isTriangle: boolean;
  triangularity: number;
  firstPolygonPoints: Point[] | null;
  simplifiedPoints: Point[] | null;
  simplifiedTrianglePoints: Point[] | null;
  areaOfFirstPolygon: number;
  areaOfSimplifiedTriangle: number;
  lengthOfSimplifiedTriangle: number;
  tipAngle: number;
  tipPoint: Point | null;
  initialRotation: number;
}

/**
 * Analyzes a set of points to determine if they form a triangle
 * and extracts relevant geometric properties.
 */
export class TriangleAnalyzer {
  /**
   * Analyzes the given points and returns triangle analysis results.
   * Points are mutated in place to be translated relative to the tip point.
   */
  static analyze(points: Point[]): TriangleAnalysisResult {
    const result: TriangleAnalysisResult = {
      isTriangle: false,
      triangularity: 0,
      firstPolygonPoints: null,
      simplifiedPoints: null,
      simplifiedTrianglePoints: null,
      areaOfFirstPolygon: 0,
      areaOfSimplifiedTriangle: 0,
      lengthOfSimplifiedTriangle: 0,
      tipAngle: 0,
      tipPoint: null,
      initialRotation: 0,
    };

    // Find first polygon from the drawn path
    const firstPolygon = extractFirstPolygon(points);
    let firstPolygonPoints = firstPolygon?.vertices ?? null;

    if (!firstPolygonPoints) {
      return result;
    }

    firstPolygonPoints = ensureCyclic(
      ensureCounterClockwise(firstPolygonPoints)
    );

    // Compute bounding box for epsilon calculations
    const bbOfFirstPolygon = boundingBoxAndCenterOfPolygon(firstPolygonPoints);
    result.firstPolygonPoints = firstPolygonPoints;
    result.areaOfFirstPolygon = positivePolygonArea(firstPolygonPoints);

    // Compute convex hull
    const convexHullPoints = convexHull(firstPolygonPoints);

    // Radius calculation for simplification thresholds
    const radius =
      Math.min(bbOfFirstPolygon.width, bbOfFirstPolygon.height) / 2 || 1;

    // Simplify polygon
    result.simplifiedPoints = simplifyPolygonWithEpsilon(
      convexHullPoints,
      radius * 0.1
    );

    result.simplifiedTrianglePoints = simplifyPolygonUntilNumberOfPoints(
      result.simplifiedPoints,
      3,
      radius * 0.1,
      radius * 0.1 * 0.1
    );

    result.simplifiedTrianglePoints = ensureNonCyclic(
      ensureCounterClockwise(result.simplifiedTrianglePoints)
    );

    // Check if simplified polygon is a triangle
    if (result.simplifiedTrianglePoints.length !== 3) {
      result.triangularity = 0;
      return result;
    }

    result.areaOfSimplifiedTriangle = positivePolygonArea(
      result.simplifiedTrianglePoints
    );
    result.lengthOfSimplifiedTriangle = polygonLength(
      result.simplifiedTrianglePoints
    );

    // Calculate triangularity
    const areaOfConvexHull = positivePolygonArea(convexHullPoints);
    result.triangularity = areaOfConvexHull / result.areaOfSimplifiedTriangle;
    if (result.triangularity > 1) {
      result.triangularity = 1 / result.triangularity;
    }

    result.isTriangle =
      result.triangularity > settings.TRIANGULARITY_THRESHOLD &&
      result.lengthOfSimplifiedTriangle > 100;
    if (!result.isTriangle) {
      return result;
    }

    // Find tip using smallest angle method (default)
    TriangleAnalyzer.findTipBySmallestAngle(result);

    return result;
  }

  /**
   * Finds the tip by selecting the vertex with the smallest interior angle.
   */
  private static findTipBySmallestAngle(result: TriangleAnalysisResult): void {
    if (!result.simplifiedTrianglePoints) return;

    result.tipAngle = Math.PI;
    for (let i = 0; i < result.simplifiedTrianglePoints.length; i++) {
      const pt =
        result.simplifiedTrianglePoints[
          i % result.simplifiedTrianglePoints.length
        ];
      const p1 =
        result.simplifiedTrianglePoints[
          (i + 2) % result.simplifiedTrianglePoints.length
        ];
      const p2 =
        result.simplifiedTrianglePoints[
          (i + 1) % result.simplifiedTrianglePoints.length
        ];
      const angle = getPositiveAngleFromThreePoints(pt, p1, p2);

      if (angle < result.tipAngle) {
        result.tipAngle = angle;
        result.tipPoint = pt;
        result.initialRotation = getAngle(pt, p1);
      }
    }
  }

  /**
   * Finds the tip by selecting the vertex opposite to the edge closest to the first drawing point.
   */
  static findTipByClosestEdge(
    result: TriangleAnalysisResult,
    firstPoint: Point
  ): void {
    if (
      !result.simplifiedTrianglePoints ||
      result.simplifiedTrianglePoints.length !== 3
    )
      return;

    const pts = result.simplifiedTrianglePoints;
    let minDistance = Infinity;
    let closestEdgeOppositeIndex = 0;

    // For each edge, calculate distance from firstPoint to that edge
    // The edge opposite to vertex i is formed by vertices (i+1) and (i+2)
    for (let i = 0; i < 3; i++) {
      const edgeStart = pts[(i + 1) % 3];
      const edgeEnd = pts[(i + 2) % 3];

      const distance = TriangleAnalyzer.pointToSegmentDistance(
        firstPoint,
        edgeStart,
        edgeEnd
      );

      if (distance < minDistance) {
        minDistance = distance;
        closestEdgeOppositeIndex = i;
      }
    }

    // The tip is the vertex opposite to the closest edge
    const tipIndex = closestEdgeOppositeIndex;
    const pt = pts[tipIndex];
    const p1 = pts[(tipIndex + 2) % 3];
    const p2 = pts[(tipIndex + 1) % 3];

    result.tipPoint = pt;
    result.tipAngle = getPositiveAngleFromThreePoints(pt, p1, p2);
    result.initialRotation = getAngle(pt, p1);
  }

  /**
   * Calculates the distance from a point to a line segment.
   */
  private static pointToSegmentDistance(
    point: Point,
    segStart: Point,
    segEnd: Point
  ): number {
    const dx = segEnd.x - segStart.x;
    const dy = segEnd.y - segStart.y;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
      // Segment is a point
      return Math.sqrt(
        (point.x - segStart.x) ** 2 + (point.y - segStart.y) ** 2
      );
    }

    // Project point onto line, clamping t to [0, 1] for segment
    let t =
      ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) /
      lengthSquared;
    t = Math.max(0, Math.min(1, t));

    const projX = segStart.x + t * dx;
    const projY = segStart.y + t * dy;

    return Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2);
  }

  /**
   * Translates all polygon arrays so that the tip point is at the origin.
   * Returns the translation offset applied.
   */
  static translateToTip(
    result: TriangleAnalysisResult,
    points: Point[]
  ): { tx: number; ty: number; translatedPoints: Point[] } {
    if (!result.tipPoint) {
      return { tx: 0, ty: 0, translatedPoints: points };
    }

    const tx = -result.tipPoint.x;
    const ty = -result.tipPoint.y;

    const translatedPoints = points.map((p) => p.translate(tx, ty));

    if (result.firstPolygonPoints) {
      result.firstPolygonPoints = shiftPolygon(
        result.firstPolygonPoints,
        result.firstPolygonPoints.findIndex((p) => p.equalTo(result.tipPoint!))
      ).map((p) => p.translate(tx, ty));
    }

    if (result.simplifiedPoints) {
      result.simplifiedPoints = shiftPolygon(
        result.simplifiedPoints,
        result.simplifiedPoints.findIndex((p) => p.equalTo(result.tipPoint!))
      ).map((p) => p.translate(tx, ty));
    }

    if (result.simplifiedTrianglePoints) {
      result.simplifiedTrianglePoints = shiftPolygon(
        result.simplifiedTrianglePoints,
        result.simplifiedTrianglePoints.findIndex((p) =>
          p.equalTo(result.tipPoint!)
        )
      ).map((p) => p.translate(tx, ty));
    }

    return { tx, ty, translatedPoints };
  }
}
