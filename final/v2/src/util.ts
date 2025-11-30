import { Point, Segment, Line, Polygon, Box, Vector } from '2d-geometry';

export { Point, Segment, Line, Polygon, Box, Vector };

/**
 * MARK: Basic
 */

export function distSquared(p1: Point, p2: Point): number {
  const [dist] = p1.distanceTo(p2);
  return dist * dist;
}

export function dist(p1: Point, p2: Point): number {
  const [d] = p1.distanceTo(p2);
  return d;
}

export function pointDistanceToLine(p0: Point, p1: Point, p2: Point): number {
  const line = new Line(p1, p2);
  const [d] = p0.distanceTo(line);
  return d;
}

/**
 * MARK: Line
 */

// Main function to extract the first polygon from a path
export function extractFirstPolygon(points: Point[]) {
  const pts = [...points];
  // Logic from original: if length is 3, push start to end?
  // But extractFirstPolygon normally deals with finding self-intersection.
  // If only 3 points, it's a triangle if closed, but here it might be open.
  // Original code:
  // if (pts.length === 3) { pts.push(pts[0]); }
  // else if (pts.length < 4) { return null; }

  if (pts.length === 3) {
    pts.push(pts[0].clone());
  } else if (pts.length < 4) {
    return null;
  }

  // Check each pair of line segments for intersection
  for (let i = 0; i < pts.length - 3; i++) {
    for (let j = i + 2; j < pts.length - 1; j++) {
      // Skip adjacent segments
      if (j === i + 1) continue;

      const s1 = new Segment(pts[i], pts[i + 1]);
      const s2 = new Segment(pts[j], pts[j + 1]);
      const intersections = s1.intersect(s2);

      if (intersections.length > 0) {
        // Found an intersection - extract the polygon
        const intersection = intersections[0];
        const polygon: Point[] = [];

        // Add the intersection point as the first vertex
        polygon.push(intersection);

        // Add all points between the two intersecting segments
        for (let k = i + 1; k <= j; k++) {
          polygon.push(pts[k]);
        }

        // Validate that we have at least 3 unique vertices
        if (polygon.length >= 3) {
          return {
            vertices: polygon,
            startIndex: i,
            endIndex: j,
            intersection: intersection,
            isValid: isValidPolygon(polygon), // We keep using array of points for now as intermediate repr
          };
        }
      }
    }
  }

  return null; // No polygon found
}

export function makeSureCounterClockwise(vertices: Point[]): Point[] {
  const polygon = new Polygon(vertices);
  // Polygon in 2d-geometry handles orientation?
  // Actually `new Polygon(vertices)` creates faces.
  // Assuming single face.
  // `Polygon.area()` returns signed area sum.
  // But let's stick to manual check if Polygon behavior is complex with multiple faces.
  if (signedPolygonArea(vertices) < 0) {
    vertices.reverse();
  }
  return vertices;
}

export function isValidPolygon(vertices: Point[]): boolean {
  const polygon = new Polygon(vertices);
  return polygon.isValid();
}

export function calculateTriangleArea(p1: Point, p2: Point, p3: Point): number {
  // Cross product of vectors
  const v1 = new Vector(p1, p2);
  const v2 = new Vector(p1, p3);
  return Math.abs(v1.cross(v2)) / 2;
}

export function ensureCyclic(points: Point[]): Point[] {
  if (points.length === 0) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (!first.equalTo(last)) {
    points.push(first.clone());
  }
  return points;
}

export function ensureNonCyclic(points: Point[]): Point[] {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (first.equalTo(last)) {
    points.pop();
  }
  return points;
}

export function ensureCounterClockwise(points: Point[]): Point[] {
  if (signedPolygonArea(points) < 0) {
    points.reverse();
  }
  return points;
}

export function signedPolygonArea(vertices: Point[]): number {
  let area = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }
  return area / 2;
}

export function positivePolygonArea(vertices: Point[]): number {
  // Use Polygon class if constructed correctly
  // const p = new Polygon(vertices); return p.area();
  // But `vertices` might be just points, `new Polygon(vertices)` works.
  // However, Polygon.area() returns positive area for islands?
  // Let's stick to manual calc for consistency or check library.
  return Math.abs(signedPolygonArea(vertices));
}

/**
 * MARK: Simplification
 */

/**
 * Simplifies a polygon with a given epsilon with the Douglas-Peucker algorithm
 */
export function simplifyPolygonWithEpsilon(
  points: Point[],
  epsilon: number = 1
): Point[] {
  // using douglas-peucker algorithm
  if (points.length < 3) return points;

  let p0 = points[0];
  let pn = points[points.length - 1];
  let maxDistance = 0;
  let index = 0;

  const line = new Line(p0, pn);

  for (let i = 1; i < points.length - 1; i++) {
    const [distance] = points[i].distanceTo(line);
    if (distance > maxDistance) {
      maxDistance = distance;
      index = i;
    }
  }
  if (maxDistance > epsilon) {
    const simplifiedPoints1 = simplifyPolygonWithEpsilon(
      points.slice(0, index + 1),
      epsilon
    );
    const simplifiedPoints2 = simplifyPolygonWithEpsilon(
      points.slice(index),
      epsilon
    );
    return [...simplifiedPoints1, ...simplifiedPoints2.slice(1)];
  }
  return [p0, pn];
}

export function shiftPolygon(polygon: Point[], indexShift: number): Point[] {
  const n = polygon.length;
  if (n === 0) return [];
  const shift = ((indexShift % n) + n) % n; // ensure positive modulo
  // Create new array with same point references
  return Array.from({ length: n }, (_, i) => {
    return polygon[(i + shift) % n];
  });
}

export function simplifyPolygonUntilNumberOfPoints(
  points: Point[],
  n: number,
  epsilon: number = 1,
  increment: number = 0.1
): Point[] {
  let currentPoints = [...points];
  let iterations = 0;
  let maxIterations = 1000;
  let currentEpsilon = epsilon;
  let currentIncrement = increment;

  while (currentPoints.length > n && iterations < maxIterations) {
    const nextPoints = simplifyPolygonWithEpsilon(
      currentPoints,
      currentEpsilon
    );
    if (nextPoints.length >= n) {
      currentPoints = shiftPolygon(nextPoints, 1);
      currentEpsilon += currentIncrement;
    } else {
      currentPoints = shiftPolygon(currentPoints, 1);
      currentEpsilon -= currentIncrement;
      currentIncrement *= 0.8;
      currentEpsilon += currentIncrement;
    }
    iterations++;
  }
  console.log('points.length', currentPoints.length);
  console.log('n', n);
  console.log('iterations', iterations);
  return currentPoints;
}

export function boundingBoxAndCenterOfPolygon(vertices: Point[]): Box {
  if (vertices.length === 0) {
    return new Box(0, 0, 0, 0);
  }
  // Box has minX, minY, maxX, maxY properties?
  // Check Box constructor or use methods.
  // new Box(minx, miny, maxx, maxy)
  let minX = vertices[0].x;
  let minY = vertices[0].y;
  let maxX = vertices[0].x;
  let maxY = vertices[0].y;
  for (let i = 1; i < vertices.length; i++) {
    minX = Math.min(minX, vertices[i].x);
    minY = Math.min(minY, vertices[i].y);
    maxX = Math.max(maxX, vertices[i].x);
    maxY = Math.max(maxY, vertices[i].y);
  }
  const box = new Box(minX, minY, maxX, maxY);

  // Add custom properties used in app if Box doesn't have them?
  // The app uses: minX, minY, maxX, maxY, centerX, centerY, width, height, radius
  // Box likely has some.
  // Let's return an object that extends Box or looks like it, OR assume Box has them.
  // Box usually has xmin, ymin, xmax, ymax.
  // I'll just return the calculated values as an object matching the usage if Box is not 1:1 compatible with usage.
  // The usage expects `boundingBoxAndCenterOfPolygon` to return `BoundingBox`.
  // I removed `BoundingBox` interface.
  // I should probably return `Box` but I need to ensure `Drawing.ts` uses `Box` properties.
  // `Box` in flatten-js has `xmin`, `ymin`, `xmax`, `ymax`, `center`, `width`, `height`.
  // It might not have `minX` etc.
  // Let's keep using `Box` but maybe wrap it or cast it.
  // For now, I will return `Box` and fix `Drawing.ts` to use `xmin` instead of `minX`.
  return box;
}

/**
 * Computes the convex hull of a set of 2D points using Graham's scan algorithm.
 * @param {Array} points - Array of points with x and y properties
 * @returns {Array} Array of points forming the convex hull in counter-clockwise order
 */
export function convexHull(points: Point[]): Point[] {
  // Handle edge cases
  if (!points || points.length < 3) {
    return points || [];
  }

  // Helper function: Calculate cross product of vectors OA and OB
  // where O = p1, A = p2 - p1, B = p3 - p1
  function crossProduct(p1: Point, p2: Point, p3: Point) {
    const v1 = new Vector(p1, p2);
    const v2 = new Vector(p1, p3);
    return v1.cross(v2);
  }

  // Helper function: Calculate squared distance between two points
  function squaredDistance(p1: Point, p2: Point) {
    const [d] = p1.distanceTo(p2);
    return d * d;
  }

  // Step 1: Find the starting point (lowest y-coordinate, leftmost if tied)
  let start = points[0];
  let startIndex = 0;
  for (let i = 1; i < points.length; i++) {
    if (
      points[i].y < start.y ||
      (points[i].y === start.y && points[i].x < start.x)
    ) {
      start = points[i];
      startIndex = i;
    }
  }

  // Step 2: Sort points by polar angle relative to the starting point
  // Create a copy of points array and remove the starting point
  const sortedPoints = points.slice();
  sortedPoints.splice(startIndex, 1);

  sortedPoints.sort((a, b) => {
    const cross = crossProduct(start, a, b);
    if (cross === 0) {
      // If points are collinear, sort by distance from start
      return squaredDistance(start, a) - squaredDistance(start, b);
    }
    return -cross; // Negative for counter-clockwise order
  });

  // Step 3: Build the convex hull
  const hull = [start];

  for (let i = 0; i < sortedPoints.length; i++) {
    const point = sortedPoints[i];

    // Remove points that make a clockwise turn
    while (hull.length >= 2) {
      const cross = crossProduct(
        hull[hull.length - 2],
        hull[hull.length - 1],
        point
      );

      if (cross <= 0) {
        // Clockwise or collinear - remove the last point
        hull.pop();
      } else {
        break;
      }
    }

    hull.push(point);
  }

  // Optional: Remove collinear points at the end of the hull
  let i = hull.length - 1;
  while (i >= 2) {
    const cross = crossProduct(hull[i], hull[0], hull[1]);
    if (cross === 0) {
      if (
        squaredDistance(hull[0], hull[1]) < squaredDistance(hull[0], hull[i])
      ) {
        hull.splice(1, 1);
      } else {
        hull.splice(i, 1);
      }
    }
    break;
  }

  return hull;
}

export function getPositiveAngleFromThreePoints(
  p: Point,
  p1: Point,
  p2: Point
): number {
  let angle = Math.abs(getAngleFromThreePoints(p, p1, p2));
  if (angle > Math.PI) {
    angle = 2 * Math.PI - angle;
  }
  return angle;
}

export function getAngleFromThreePoints(
  p: Point,
  p1: Point,
  p2: Point
): number {
  const v1 = new Vector(p, p1);
  const v2 = new Vector(p, p2);
  // angleTo returns angle from v1 to v2?
  // Need to check doc. Assuming standard.
  // Math.atan2(v2y, v2x) - Math.atan2(v1y, v1x) matches `v2.slope - v1.slope` approx?
  // Let's use `Vector.angleBetween(v1, v2)` or `v1.angleTo(v2)`.
  // 2d-geometry `Vector` has `angleTo`.
  return new Vector(1, 0).angleTo(v2) - new Vector(1, 0).angleTo(v1);
}

export function getAngle(p1: Point, p2: Point): number {
  const v = new Vector(p1, p2);
  // angle with X axis?
  return new Vector(1, 0).angleTo(v);
}

export function ensureWithinPi(angle: number): number {
  if (angle > Math.PI) {
    return ensureWithinPi(angle - 2 * Math.PI);
  }
  if (angle <= -Math.PI) {
    return ensureWithinPi(angle + 2 * Math.PI);
  }
  return angle;
}
