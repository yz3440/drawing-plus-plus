export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  radius: number;
}

/**
 * MARK: Basic
 */

export function distSquared(x1: number, y1: number, x2: number, y2: number): number {
  return (x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2);
}

export function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt(distSquared(x1, y1, x2, y2));
}

export function pointDistanceToLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const denominator = dist(x1, y1, x2, y2);
  if (denominator === 0) {
    return dist(x0, y0, x1, y1);
  }
  const numerator = Math.abs(
    (y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1
  );
  return numerator / denominator;
}

/**
 * MARK: Line
 */

export function getLineIntersection(
  p1: Point,
  p2: Point,
  p3: Point,
  p4: Point
): (Point & { t: number; u: number }) | null {
  const x1 = p1.x,
    y1 = p1.y;
  const x2 = p2.x,
    y2 = p2.y;
  const x3 = p3.x,
    y3 = p3.y;
  const x4 = p4.x,
    y4 = p4.y;

  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

  // Lines are parallel
  if (Math.abs(denominator) < 1e-10) return null;

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denominator;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denominator;

  // Check if intersection point is within both line segments
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      x: x1 + t * (x2 - x1),
      y: y1 + t * (y2 - y1),
      t: t,
      u: u,
    };
  }

  return null;
}

// Main function to extract the first polygon from a path
export function extractFirstPolygon(points: Point[]) {
  // Create a copy to modify if needed (though original implementation pushed to input array in one case)
  // The original code modifies `points` if length is 3.
  const pts = [...points];
  if (pts.length === 3) {
    pts.push(pts[0]);
  } else if (pts.length < 4) {
    return null;
  }

  // Check each pair of line segments for intersection
  for (let i = 0; i < pts.length - 3; i++) {
    for (let j = i + 2; j < pts.length - 1; j++) {
      // Skip adjacent segments
      if (j === i + 1) continue;

      const intersection = getLineIntersection(
        pts[i],
        pts[i + 1],
        pts[j],
        pts[j + 1]
      );

      if (intersection) {
        // Found an intersection - extract the polygon
        const polygon: Point[] = [];

        // Add the intersection point as the first vertex
        polygon.push({
          x: intersection.x,
          y: intersection.y,
        });

        // Add all points between the two intersecting segments
        for (let k = i + 1; k <= j; k++) {
          polygon.push(pts[k]);
        }

        // Close the polygon by adding the intersection point again
        // (optional, depending on your needs)

        // Validate that we have at least 3 unique vertices
        if (polygon.length >= 3) {
          return {
            vertices: polygon,
            startIndex: i,
            endIndex: j,
            intersection: intersection,
            isValid: isValidPolygon(polygon),
          };
        }
      }
    }
  }

  return null; // No polygon found
}

export function makeSureCounterClockwise(vertices: Point[]): Point[] {
  const area = calculatePolygonArea(vertices); // Note: calculatePolygonArea was not defined in original util.js but used in makeSureCounterClockwise. It likely meant signedPolygonArea.
  // Checking original util.js content...
  // It calls `calculatePolygonArea(vertices)` on line 125.
  // But `calculatePolygonArea` is NOT defined in the file provided!
  // `signedPolygonArea` IS defined.
  // I will assume `calculatePolygonArea` was intended to be `signedPolygonArea`.
  if (area < 0) {
    vertices.reverse();
  }
  return vertices;
}

// Polyfill for missing function if needed, or alias
function calculatePolygonArea(vertices: Point[]): number {
    return signedPolygonArea(vertices);
}

export function isValidPolygon(vertices: Point[]): boolean {
  if (vertices.length < 3) return false;

  // Check if all points are not collinear
  // (A valid polygon needs non-collinear points)
  for (let i = 0; i < vertices.length - 2; i++) {
    const area = calculateTriangleArea(
      vertices[i],
      vertices[i + 1],
      vertices[i + 2]
    );
    if (Math.abs(area) > 1e-10) {
      return true; // Found non-collinear points
    }
  }

  return false;
}

export function calculateTriangleArea(p1: Point, p2: Point, p3: Point): number {
  return (
    0.5 *
    Math.abs((p2.x - p1.x) * (p3.y - p1.y) - (p3.x - p1.x) * (p2.y - p1.y))
  );
}

export function ensureCyclic(points: Point[]): Point[] {
  // Comparing references might not work if points are different objects with same coords.
  // But original code used object equality `points[0] !== points[points.length - 1]`.
  // I'll stick to that or coordinate check. Original: reference check.
  // Wait, if points are `{x,y}` literals, reference check is always true (not equal) unless same object instance.
  // In `extractFirstPolygon`, we create new objects.
  // Let's assume reference check or value check.
  if (points.length === 0) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (first.x !== last.x || first.y !== last.y) {
     // Actually, let's just push a copy of the first point
     points.push({ ...points[0] });
  }
  return points;
}

export function ensureNonCyclic(points: Point[]): Point[] {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (first.x === last.x && first.y === last.y) {
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
  return Math.abs(signedPolygonArea(vertices));
}

/**
 * MARK: Simplification
 */

/**
 * Simplifies a polygon with a given epsilon with the Douglas-Peucker algorithm
 */
export function simplifyPolygonWithEpsilon(points: Point[], epsilon: number = 1): Point[] {
  // using douglas-peucker algorithm
  if (points.length < 3) return points;
  
  let p0 = points[0];
  let pn = points[points.length - 1];
  let maxDistance = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const distance = pointDistanceToLine(
      points[i].x,
      points[i].y,
      p0.x,
      p0.y,
      pn.x,
      pn.y
    );
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
  return Array.from({ length: n }, (_, i) => {
    const idx = (i + shift) % n;
    return {
      x: polygon[idx].x,
      y: polygon[idx].y,
    };
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
    const nextPoints = simplifyPolygonWithEpsilon(currentPoints, currentEpsilon);
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

export function boundingBoxAndCenterOfPolygon(vertices: Point[]): BoundingBox {
  if (vertices.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0, centerX: 0, centerY: 0, width: 0, height: 0, radius: 0 };
  }
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
  const width = maxX - minX;
  const height = maxY - minY;
  return {
    minX,
    minY,
    maxX,
    maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    width,
    height,
    radius: Math.min(width, height) / 2 || 1,
  };
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
    return (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
  }

  // Helper function: Calculate squared distance between two points
  function squaredDistance(p1: Point, p2: Point) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return dx * dx + dy * dy;
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
  // This ensures we only keep corner points
  let i = hull.length - 1;
  while (i >= 2) {
    const cross = crossProduct(hull[i], hull[0], hull[1]);
    if (cross === 0) {
      // The first point after start is collinear with start and last point
      // Keep only the furthest one
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

export function getPositiveAngleFromThreePoints(p: Point, p1: Point, p2: Point): number {
  let angle = Math.abs(getAngleFromThreePoints(p, p1, p2));
  if (angle > Math.PI) {
    angle = 2 * Math.PI - angle;
  }
  return angle;
}

export function getAngleFromThreePoints(p: Point, p1: Point, p2: Point): number {
  const v1x = p1.x - p.x;
  const v1y = p1.y - p.y;
  const v2x = p2.x - p.x;
  const v2y = p2.y - p.y;
  const angle = Math.atan2(v2y, v2x) - Math.atan2(v1y, v1x);
  return angle;
}

export function getAngle(p1: Point, p2: Point): number {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x);
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

