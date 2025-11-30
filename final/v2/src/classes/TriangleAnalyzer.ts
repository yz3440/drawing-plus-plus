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
  smallestAngle: number;
  smallestAngleTipPoint: Point | null;
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
      smallestAngle: 0,
      smallestAngleTipPoint: null,
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

    result.isTriangle = result.triangularity > settings.TRIANGULARITY_THRESHOLD;

    if (!result.isTriangle) {
      return result;
    }

    // Find the smallest angle and its tip point
    result.smallestAngle = Math.PI;
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

      if (angle < result.smallestAngle) {
        result.smallestAngle = angle;
        result.smallestAngleTipPoint = pt;
        result.initialRotation = getAngle(pt, p1);
      }
    }

    return result;
  }

  /**
   * Translates all polygon arrays so that the tip point is at the origin.
   * Returns the translation offset applied.
   */
  static translateToTip(
    result: TriangleAnalysisResult,
    points: Point[]
  ): { tx: number; ty: number; translatedPoints: Point[] } {
    if (!result.smallestAngleTipPoint) {
      return { tx: 0, ty: 0, translatedPoints: points };
    }

    const tx = -result.smallestAngleTipPoint.x;
    const ty = -result.smallestAngleTipPoint.y;

    const translatedPoints = points.map((p) => p.translate(tx, ty));

    if (result.firstPolygonPoints) {
      result.firstPolygonPoints = shiftPolygon(
        result.firstPolygonPoints,
        result.firstPolygonPoints.findIndex((p) =>
          p.equalTo(result.smallestAngleTipPoint!)
        )
      ).map((p) => p.translate(tx, ty));
    }

    if (result.simplifiedPoints) {
      result.simplifiedPoints = shiftPolygon(
        result.simplifiedPoints,
        result.simplifiedPoints.findIndex((p) =>
          p.equalTo(result.smallestAngleTipPoint!)
        )
      ).map((p) => p.translate(tx, ty));
    }

    if (result.simplifiedTrianglePoints) {
      result.simplifiedTrianglePoints = shiftPolygon(
        result.simplifiedTrianglePoints,
        result.simplifiedTrianglePoints.findIndex((p) =>
          p.equalTo(result.smallestAngleTipPoint!)
        )
      ).map((p) => p.translate(tx, ty));
    }

    return { tx, ty, translatedPoints };
  }
}
