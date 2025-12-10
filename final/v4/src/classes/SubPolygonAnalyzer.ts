import {
  Point,
  extractFirstPolygon,
  ensureCounterClockwise,
  ensureCyclic,
  positivePolygonArea,
  convexHull,
  ensureNonCyclic,
  getPositiveAngleFromThreePoints,
  getAngle,
  shiftPolygon,
  polygonLength,
  simplifyPolygonUntilAreaRatio,
} from '../util';
import { settings } from '../constants';

export interface SubPolygonAnalysisResult {
  isValidShape: boolean;
  firstPolygonPoints: Point[] | null;
  simplifiedPoints: Point[] | null;
  finalSimplifiedPoints: Point[] | null;
  areaOfFirstPolygon: number;
  areaOfFinalSimplified: number;
  lengthOfFinalSimplified: number;
  tipAngle: number;
  tipPoint: Point | null;
  initialRotation: number;
}

/**
 * Analyzes a set of points to determine if they form a valid polygon
 * and extracts relevant geometric properties.
 */
export class SubPolygonAnalyzer {
  /**
   * Analyzes the given points and returns analysis results.
   * Points are mutated in place to be translated relative to the tip point.
   */
  static analyze(points: Point[]): SubPolygonAnalysisResult {
    const result: SubPolygonAnalysisResult = {
      isValidShape: false,
      firstPolygonPoints: null,
      simplifiedPoints: null,
      finalSimplifiedPoints: null,
      areaOfFirstPolygon: 0,
      areaOfFinalSimplified: 0,
      lengthOfFinalSimplified: 0,
      tipAngle: 0,
      tipPoint: null,
      initialRotation: 0,
    };

    // Find first polygon from the drawn path
    const firstPolygon = extractFirstPolygon(points);
    let firstPolygonPoints = firstPolygon?.vertices ?? null;

    if (!firstPolygonPoints) {
      // If no closed polygon is found (no self-intersections),
      // try to close the start and end points to form a loop automatically.
      if (settings.AUTO_CLOSE_PATH && points.length >= 3) {
        firstPolygonPoints = [...points];
      } else {
        return result;
      }
    }

    firstPolygonPoints = ensureCyclic(
      ensureCounterClockwise(firstPolygonPoints)
    );

    // Compute bounding box for epsilon calculations (only used if needed, keeping computation if other logic depends on it later, but here only radius was derived)
    // const bbOfFirstPolygon = boundingBoxAndCenterOfPolygon(firstPolygonPoints);
    result.firstPolygonPoints = firstPolygonPoints;
    result.areaOfFirstPolygon = positivePolygonArea(firstPolygonPoints);

    // Compute convex hull
    const convexHullPoints = convexHull(firstPolygonPoints);

    // No longer presimplifying with epsilon
    // We use the first polygon directly as the starting point for area-based simplification
    // This allows us to detect concave shapes that would be lost if we started from the convex hull
    result.simplifiedPoints = firstPolygonPoints;

    // Simplify based on area ratio threshold
    // This replaces "simplifyPolygonUntilNumberOfPoints(..., 3)"
    // We try to simplify to fewer points as long as area ratio is preserved
    const hullArea = positivePolygonArea(convexHullPoints);
    const firstPolygonArea = result.areaOfFirstPolygon;

    const referenceArea =
      settings.AREA_CALCULATION_METHOD === 'convex_hull'
        ? hullArea
        : firstPolygonArea;

    result.finalSimplifiedPoints = simplifyPolygonUntilAreaRatio(
      result.simplifiedPoints,
      referenceArea,
      settings.AREA_RATIO_THRESHOLD
    );

    result.finalSimplifiedPoints = ensureNonCyclic(
      ensureCounterClockwise(result.finalSimplifiedPoints)
    );

    // Check if result is valid (at least 3 points)
    if (result.finalSimplifiedPoints.length < 3) {
      result.isValidShape = false;
      return result;
    }

    result.areaOfFinalSimplified = positivePolygonArea(
      result.finalSimplifiedPoints
    );
    result.lengthOfFinalSimplified = polygonLength(
      result.finalSimplifiedPoints
    );

    result.isValidShape = result.lengthOfFinalSimplified > 100;

    if (!result.isValidShape) {
      return result;
    }

    // Find tip using smallest angle method (default)
    SubPolygonAnalyzer.findTipBySmallestAngle(result);

    return result;
  }

  /**
   * Finds the tip by selecting the vertex with the smallest interior angle.
   */
  private static findTipBySmallestAngle(
    result: SubPolygonAnalysisResult
  ): void {
    if (!result.finalSimplifiedPoints) return;

    const n = result.finalSimplifiedPoints.length;
    result.tipAngle = Math.PI;

    for (let i = 0; i < n; i++) {
      const pt = result.finalSimplifiedPoints[i];
      const p1 = result.finalSimplifiedPoints[(i + n - 1) % n]; // Previous
      const p2 = result.finalSimplifiedPoints[(i + 1) % n]; // Next

      const angle = getPositiveAngleFromThreePoints(pt, p2, p1); // Order matters?
      // getPositiveAngleFromThreePoints(p, p1, p2) usually means angle at p between p->p1 and p->p2

      if (angle < result.tipAngle) {
        result.tipAngle = angle;
        result.tipPoint = pt;
        // Initial rotation to align tip up?
        // This depends on how we want to orient arbitrary polygons.
        // Assuming we want to orient based on the "tip" (smallest angle).
        // Let's align the bisector of the angle or one of the edges?
        // The original code used `getAngle(pt, p1)` where p1 was `(i+2)%3`.
        // For triangle p, p1, p2: p->(i), p2->(i+1), p1->(i+2).
        // So it aligned with the edge "across" or "next"?
        // Let's align so the tip points "up" or similar.
        // For consistency with triangle logic, let's use bisector or just one edge.
        // Original: `result.initialRotation = getAngle(pt, p1);`
        // where p1 was `(i+2)%3` (previous point).
        result.initialRotation = getAngle(pt, p1);
      }
    }
  }

  /**
   * Finds the tip by selecting the vertex opposite to the edge closest to the first drawing point.
   * Note: "Opposite" is well-defined for triangles. For general polygons, we pick the vertex
   * "farthest" or geometrically opposite?
   * Or just find the vertex whose adjacent edges are NOT the closest edge?
   * For N-gon, if we pick an edge, "opposite" might be a vertex or an edge.
   * Let's adapt: Find the edge closest to firstPoint.
   * Then pick the vertex maximizing distance from that edge? Or the "middle" vertex of the remaining chain?
   * For triangle: Edge (i+1, i+2) -> Opposite vertex i.
   * For now, let's use the vertex with max distance from the closest edge.
   */
  static findTipByClosestEdge(
    result: SubPolygonAnalysisResult,
    firstPoint: Point
  ): void {
    if (
      !result.finalSimplifiedPoints ||
      result.finalSimplifiedPoints.length < 3
    )
      return;

    const pts = result.finalSimplifiedPoints;
    let minDistance = Infinity;
    let closestEdgeIndex = -1;

    // Find closest edge
    for (let i = 0; i < pts.length; i++) {
      const edgeStart = pts[i];
      const edgeEnd = pts[(i + 1) % pts.length];

      const distance = SubPolygonAnalyzer.pointToSegmentDistance(
        firstPoint,
        edgeStart,
        edgeEnd
      );

      if (distance < minDistance) {
        minDistance = distance;
        closestEdgeIndex = i;
      }
    }

    // Find vertex farthest from this edge to be the "tip"
    const edgeStart = pts[closestEdgeIndex];
    const edgeEnd = pts[(closestEdgeIndex + 1) % pts.length];

    let maxDist = -1;
    let tipIndex = -1;

    for (let i = 0; i < pts.length; i++) {
      if (i === closestEdgeIndex || i === (closestEdgeIndex + 1) % pts.length)
        continue;

      const d = SubPolygonAnalyzer.pointToSegmentDistance(
        pts[i],
        edgeStart,
        edgeEnd
      );
      if (d > maxDist) {
        maxDist = d;
        tipIndex = i;
      }
    }

    // Fallback if something weird happens
    if (tipIndex === -1) tipIndex = (closestEdgeIndex + 2) % pts.length;

    const pt = pts[tipIndex];
    const p_prev = pts[(tipIndex + pts.length - 1) % pts.length];
    const p_next = pts[(tipIndex + 1) % pts.length];

    result.tipPoint = pt;
    result.tipAngle = getPositiveAngleFromThreePoints(pt, p_next, p_prev);
    result.initialRotation = getAngle(pt, p_prev);
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
    result: SubPolygonAnalysisResult,
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

    if (result.finalSimplifiedPoints) {
      result.finalSimplifiedPoints = shiftPolygon(
        result.finalSimplifiedPoints,
        result.finalSimplifiedPoints.findIndex((p) =>
          p.equalTo(result.tipPoint!)
        )
      ).map((p) => p.translate(tx, ty));
    }

    return { tx, ty, translatedPoints };
  }
}
