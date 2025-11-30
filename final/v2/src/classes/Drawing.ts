import p5 from 'p5';
import { CANVAS_HEIGHT, GRAVITY, TRIANGULARITY_THRESHOLD } from '../constants';
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
  getWave,
  WaveSamplePoint,
} from '../util';

export class Drawing {
  p: p5;
  points: Point[];
  firstPolygonPoints: Point[] | null;
  simplifiedPoints: Point[] | null;
  simplifiedTrianglePoints: Point[] | null;

  fallingTranslationY: number;
  fallingVelocityY: number;
  fallingAccelerationY: number;
  extraLinePolygonOpacity: number;
  finishFrameCount: number;

  shapeTranslationX: number;
  shapeTranslationY: number;
  rotation: number;
  scale: number;
  doneDrawing: boolean;
  isTriangle: boolean;

  triangularity: number;
  areaOfFirstPolygon: number;
  areadOfSimplifiedTriangle: number;
  smallestAngle: number;
  smallestAngleTipPoint: Point | null;
  initialRotation: number;
  startAngle: number;
  wave: WaveSamplePoint[] | null = null;

  constructor(p: p5) {
    this.p = p;
    // Points & Shape Geometry
    this.points = [];
    this.firstPolygonPoints = null;
    this.simplifiedPoints = null;
    this.simplifiedTrianglePoints = null;

    // Physics & Animation
    this.fallingTranslationY = 0;
    this.fallingVelocityY = 0;
    this.fallingAccelerationY = GRAVITY;
    this.extraLinePolygonOpacity = 100;
    this.finishFrameCount = 0;

    // Transformation & State
    this.shapeTranslationX = 0;
    this.shapeTranslationY = 0;
    this.rotation = 0;
    this.scale = 1;
    this.doneDrawing = false;
    this.isTriangle = false;

    // Analysis & Metrics
    this.triangularity = 0;
    this.areaOfFirstPolygon = 0;
    this.areadOfSimplifiedTriangle = 0;
    this.smallestAngle = 0;
    this.smallestAngleTipPoint = null;
    this.initialRotation = 0;
    this.startAngle = 0;
  }

  addPoint(x: number, y: number) {
    if (
      this.points.length === 0 ||
      this.points[this.points.length - 1].x !== x ||
      this.points[this.points.length - 1].y !== y
    ) {
      this.points.push(new Point(x, y));
    }
  }

  finishDrawing() {
    this.finishFrameCount = this.p.frameCount;
    this.doneDrawing = true;

    // Find first polygon
    const firstPolygon = extractFirstPolygon(this.points);
    let firstPolygonPoints = firstPolygon?.vertices ?? null;

    if (!firstPolygonPoints) {
      return;
    }

    firstPolygonPoints = ensureCyclic(
      ensureCounterClockwise(firstPolygonPoints)
    );

    // Simplify first polygon to 3 points
    const bbOfFirstPolygon = boundingBoxAndCenterOfPolygon(firstPolygonPoints);
    this.firstPolygonPoints = firstPolygonPoints;
    this.areaOfFirstPolygon = positivePolygonArea(firstPolygonPoints);
    const convexHullPoints = convexHull(this.firstPolygonPoints);

    // radius calculation
    const radius =
      Math.min(bbOfFirstPolygon.width, bbOfFirstPolygon.height) / 2 || 1;

    this.simplifiedPoints = simplifyPolygonWithEpsilon(
      convexHullPoints,
      radius * 0.1
    );
    this.simplifiedTrianglePoints = simplifyPolygonUntilNumberOfPoints(
      this.simplifiedPoints,
      3,
      radius * 0.1,
      radius * 0.1 * 0.1
    );

    this.simplifiedTrianglePoints = ensureNonCyclic(
      ensureCounterClockwise(this.simplifiedTrianglePoints)
    );

    // Check if simplified polygon is a triangle
    if (this.simplifiedTrianglePoints.length !== 3) {
      this.triangularity = 0;
      return;
    }

    this.areadOfSimplifiedTriangle = positivePolygonArea(
      this.simplifiedTrianglePoints
    );

    const areaOfConvexHull = positivePolygonArea(convexHullPoints);
    this.triangularity = areaOfConvexHull / this.areadOfSimplifiedTriangle;
    if (this.triangularity > 1) {
      this.triangularity = 1 / this.triangularity;
    }
    console.log('triangularity', this.triangularity);

    this.isTriangle = this.triangularity > TRIANGULARITY_THRESHOLD;

    if (!this.isTriangle) {
      return;
    }
    this.smallestAngle = Math.PI;
    for (let i = 0; i < this.simplifiedTrianglePoints.length; i++) {
      const pt =
        this.simplifiedTrianglePoints[i % this.simplifiedTrianglePoints.length];
      const p1 =
        this.simplifiedTrianglePoints[
          (i + 2) % this.simplifiedTrianglePoints.length
        ];
      const p2 =
        this.simplifiedTrianglePoints[
          (i + 1) % this.simplifiedTrianglePoints.length
        ];
      const angle = getPositiveAngleFromThreePoints(pt, p1, p2);
      // console.log('angle', (angle * 180) / Math.PI);
      if (angle < this.smallestAngle) {
        this.smallestAngle = angle;
        this.smallestAngleTipPoint = pt;
        this.initialRotation = getAngle(pt, p1);
      }
    }

    // console.log('smallestAngle', (this.smallestAngle * 180) / Math.PI);
    // console.log('smallestAngleTipPoint', this.smallestAngleTipPoint);

    if (this.smallestAngleTipPoint) {
      this.shapeTranslationX = this.smallestAngleTipPoint.x;
      this.shapeTranslationY = this.smallestAngleTipPoint.y;

      // Use translate method
      const tx = -this.shapeTranslationX;
      const ty = -this.shapeTranslationY;

      this.points = this.points.map((p) => p.translate(tx, ty));
      if (this.firstPolygonPoints) {
        this.firstPolygonPoints = this.firstPolygonPoints.map((p) =>
          p.translate(tx, ty)
        );
      }
      if (this.simplifiedPoints) {
        this.simplifiedPoints = this.simplifiedPoints.map((p) =>
          p.translate(tx, ty)
        );
      }
      if (this.simplifiedTrianglePoints) {
        this.simplifiedTrianglePoints = this.simplifiedTrianglePoints.map((p) =>
          p.translate(tx, ty)
        );
      }

      this.wave = getWave(
        this.firstPolygonPoints,
        this.simplifiedTrianglePoints as [Point, Point, Point]
      );
      console.log('wave', this.wave);
    }
  }

  draw() {
    this.p.push();
    if (this.doneDrawing && this.isTriangle) {
      this.p.translate(this.shapeTranslationX, this.shapeTranslationY);
      this.p.scale(this.scale);
      this.p.rotate(this.rotation);
      this.p.fill(255, 0, 0);
      this.p.noStroke();
      // circle(0, 0, 300);
    }

    if ((!this.firstPolygonPoints || !this.isTriangle) && this.doneDrawing) {
      this.fallingVelocityY += this.fallingAccelerationY;
      this.fallingTranslationY += this.fallingVelocityY;
      this.p.translate(0, this.fallingTranslationY);
    }

    if (this.extraLinePolygonOpacity > 0 && this.doneDrawing) {
      this.extraLinePolygonOpacity -= 5;
    }

    if (this.points) {
      this.p.push();
      this.p.noFill();
      if (this.doneDrawing) {
        this.p.stroke(255, 255, 255, this.extraLinePolygonOpacity);
      } else {
        this.p.stroke(255);
      }
      this.p.beginShape();
      for (let i = 0; i < this.points.length; i++) {
        this.p.vertex(this.points[i].x, this.points[i].y);
      }
      this.p.endShape();
      this.p.pop();
    }

    if (this.firstPolygonPoints) {
      this.p.push();
      this.p.noFill();
      this.p.stroke(255);
      this.p.beginShape();
      for (let i = 0; i < this.firstPolygonPoints.length; i++) {
        this.p.vertex(
          this.firstPolygonPoints[i].x,
          this.firstPolygonPoints[i].y
        );
      }
      this.p.endShape(this.p.CLOSE);
      this.p.pop();
    }

    this.p.pop();
  }

  isOffScreen() {
    return this.fallingTranslationY > CANVAS_HEIGHT;
  }
}
