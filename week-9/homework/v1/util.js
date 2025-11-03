/**
 * MARK: Basic
 */

function distSquared(x1, y1, x2, y2) {
  return (x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2);
}

function dist(x1, y1, x2, y2) {
  return Math.sqrt(distSquared(x1, y1, x2, y2));
}

function pointDistanceToLine(x0, y0, x1, y1, x2, y2) {
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

function getLineIntersection(p1, p2, p3, p4) {
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
function extractFirstPolygon(points) {
  if (points.length === 3) {
    points.push(points[0]);
  } else if (points.length < 4) {
    return null;
  }

  // Check each pair of line segments for intersection
  for (let i = 0; i < points.length - 3; i++) {
    for (let j = i + 2; j < points.length - 1; j++) {
      // Skip adjacent segments
      if (j === i + 1) continue;

      const intersection = getLineIntersection(
        points[i],
        points[i + 1],
        points[j],
        points[j + 1]
      );

      if (intersection) {
        // Found an intersection - extract the polygon
        const polygon = [];

        // Add the intersection point as the first vertex
        polygon.push({
          x: intersection.x,
          y: intersection.y,
        });

        // Add all points between the two intersecting segments
        for (let k = i + 1; k <= j; k++) {
          polygon.push(points[k]);
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

function shiftPolygon(polygon, indexShift) {
  return polygon.map((point, index) => {
    return {
      x: point.x,
      y: point.y,
    };
  });
}

function makeSureCounterClockwise(vertices) {
  const area = calculatePolygonArea(vertices);
  if (area < 0) {
    vertices.reverse();
  }
  return vertices;
}

function isValidPolygon(vertices) {
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

function calculateTriangleArea(p1, p2, p3) {
  return (
    0.5 *
    Math.abs((p2.x - p1.x) * (p3.y - p1.y) - (p3.x - p1.x) * (p2.y - p1.y))
  );
}

function ensureCyclic(points) {
  if (points[0] !== points[points.length - 1]) {
    points.push(points[0]);
  }
  return points;
}

function ensureNonCyclic(points) {
  if (points[0] === points[points.length - 1]) {
    points.pop();
  }
  return points;
}

function ensureCounterClockwise(points) {
  if (signedPolygonArea(points) < 0) {
    points.reverse();
  }
  return points;
}

function signedPolygonArea(vertices) {
  let area = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }
  return area / 2;
}

function positivePolygonArea(vertices) {
  return Math.abs(signedPolygonArea(vertices));
}

/**
 * MARK: Simplification
 */

/**
 * Simplifies a polygon with a given epsilon with the Douglas-Peucker algorithm
 */
function simplifyPolygonWithEpsilon(points, epsilon = 1) {
  // using douglas-peucker algorithm
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

function shiftPolygon(polygon, indexShift) {
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

function simplifyPolygonUntilNumberOfPoints(
  points,
  n,
  epsilon = 1,
  increment = 0.1
) {
  let iterations = 0;
  let maxIterations = 1000;
  while (points.length > n && iterations < maxIterations) {
    const nextPoints = simplifyPolygonWithEpsilon(points, epsilon);
    if (nextPoints.length >= n) {
      points = shiftPolygon(nextPoints, 1);
      epsilon += increment;
    } else {
      points = shiftPolygon(points, 1);
      epsilon -= increment;
      increment *= 0.8;
      epsilon += increment;
    }
    iterations++;
  }
  console.log('points.length', points.length);
  console.log('n', n);
  console.log('iterations', iterations);
  return points;
}

function boundingBoxAndCenterOfPolygon(vertices) {
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
function convexHull(points) {
  // Handle edge cases
  if (!points || points.length < 3) {
    return points || [];
  }

  // Helper function: Calculate cross product of vectors OA and OB
  // where O = p1, A = p2 - p1, B = p3 - p1
  function crossProduct(p1, p2, p3) {
    return (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
  }

  // Helper function: Calculate squared distance between two points
  function squaredDistance(p1, p2) {
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

function getPositiveAngleFromThreePoints(p, p1, p2) {
  return Math.abs(getAngleFromThreePoints(p, p1, p2));
}

function getAngleFromThreePoints(p, p1, p2) {
  const v1x = p1.x - p.x;
  const v1y = p1.y - p.y;
  const v2x = p2.x - p.x;
  const v2y = p2.y - p.y;
  const angle = Math.atan2(v2y, v2x) - Math.atan2(v1y, v1x);
  return angle;
}

function getAngle(p1, p2) {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x);
}

function ensureWithinPi(angle) {
  if (angle > Math.PI) {
    ensureWithinPi(angle - 2 * Math.PI);
  }
  if (angle <= -Math.PI) {
    ensureWithinPi(angle + 2 * Math.PI);
  }
  return angle;
}
