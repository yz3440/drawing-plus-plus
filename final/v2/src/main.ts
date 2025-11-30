import p5 from 'p5';
import _ from 'lodash';
import {
  ensureWithinPi,
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
  Point,
} from './util';
import './style.css';

const sketch = (p: p5) => {
  const CANVAS_WIDTH = 800;
  const CANVAS_HEIGHT = 600;

  let currentDrawing: Drawing | null = null;
  let drawings: Drawing[] = [];

  class Pie {
    x: number;
    y: number;
    radius: number;
    startAngle: number;
    endAngle: number;
    occupiedAngle: number;
    scale: number;
    drawings: Drawing[];

    constructor(x: number, y: number) {
      this.x = x;
      this.y = y;
      this.radius = 0;
      this.startAngle = 0;
      this.endAngle = 0;
      this.occupiedAngle = 0;
      this.scale = 1;

      this.drawings = [];
    }

    canAddDrawing(drawing: Drawing) {
      return this.occupiedAngle + drawing.smallestAngle <= Math.PI * 2;
    }

    addDrawing(drawing: Drawing) {
      drawing.startAngle = this.occupiedAngle;
      this.occupiedAngle += drawing.smallestAngle;

      this.drawings.push(drawing);
    }

    draw() {
      const rotationLerpFactor = 0.05;
      const scaleLerpFactor = 0.2;
      const translationLerpFactor = 0.1;

      for (let drawing of this.drawings) {
        drawing.rotation = p.lerp(
          drawing.rotation,
          ensureWithinPi(-drawing.startAngle - drawing.initialRotation),
          rotationLerpFactor
        );
        drawing.scale = p.lerp(drawing.scale, this.scale, scaleLerpFactor);
        drawing.shapeTranslationX = p.lerp(
          drawing.shapeTranslationX,
          this.x,
          translationLerpFactor
        );
        drawing.shapeTranslationY = p.lerp(
          drawing.shapeTranslationY,
          this.y,
          translationLerpFactor
        );
        drawing.draw();
      }
    }
  }

  let currentPie = new Pie(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
  let pies: Pie[] = [];
  let pieShelfX = 100;
  let pieShelfY = 100;
  const g = 1;

  const TRIANGULARITY_THRESHOLD = 0.65;

  class Drawing {
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
    startAngle: number; // added property as it is used in Pie

    constructor() {
      // Points & Shape Geometry
      this.points = [];
      this.firstPolygonPoints = null;
      this.simplifiedPoints = null;
      this.simplifiedTrianglePoints = null;

      // Physics & Animation
      this.fallingTranslationY = 0;
      this.fallingVelocityY = 0;
      this.fallingAccelerationY = g;
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
        this.points.push({ x, y });
      }
    }

    finishDrawing() {
      this.finishFrameCount = p.frameCount;
      this.doneDrawing = true;

      // Find first polygon
      const firstPolygon = extractFirstPolygon(this.points);
      let firstPolygonPoints = firstPolygon?.vertices ?? null;

      if (!firstPolygonPoints) {
        return;
      }

      firstPolygonPoints = _.flow([ensureCounterClockwise, ensureCyclic])(
        firstPolygonPoints
      );

      // Simplify first polygon to 3 points
      const bbOfFirstPolygon =
        boundingBoxAndCenterOfPolygon(firstPolygonPoints);
      this.firstPolygonPoints = firstPolygonPoints;
      this.areaOfFirstPolygon = positivePolygonArea(firstPolygonPoints);
      const convexHullPoints = convexHull(this.firstPolygonPoints);

      this.simplifiedPoints = simplifyPolygonWithEpsilon(
        convexHullPoints,
        bbOfFirstPolygon.radius * 0.1
      );
      this.simplifiedTrianglePoints = simplifyPolygonUntilNumberOfPoints(
        this.simplifiedPoints,
        3,
        bbOfFirstPolygon.radius * 0.1,
        bbOfFirstPolygon.radius * 0.1 * 0.1
      );
      this.simplifiedTrianglePoints = _.flow([
        ensureCounterClockwise,
        ensureNonCyclic,
      ])(this.simplifiedTrianglePoints);

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
          this.simplifiedTrianglePoints[
            i % this.simplifiedTrianglePoints.length
          ];
        const p1 =
          this.simplifiedTrianglePoints[
            (i + 2) % this.simplifiedTrianglePoints.length
          ];
        const p2 =
          this.simplifiedTrianglePoints[
            (i + 1) % this.simplifiedTrianglePoints.length
          ];
        const angle = getPositiveAngleFromThreePoints(pt, p1, p2);
        console.log('angle', (angle * 180) / Math.PI);
        if (angle < this.smallestAngle) {
          this.smallestAngle = angle;
          this.smallestAngleTipPoint = pt;
          this.initialRotation = getAngle(pt, p1);
        }
      }

      console.log('smallestAngle', (this.smallestAngle * 180) / Math.PI);
      console.log('smallestAngleTipPoint', this.smallestAngleTipPoint);

      if (this.smallestAngleTipPoint) {
        this.shapeTranslationX = this.smallestAngleTipPoint.x;
        this.shapeTranslationY = this.smallestAngleTipPoint.y;
        const shiftOrigin = (pt: Point) => {
          return {
            x: pt.x - this.shapeTranslationX,
            y: pt.y - this.shapeTranslationY,
          };
        };
        this.points = this.points.map(shiftOrigin);
        if (this.firstPolygonPoints) {
          this.firstPolygonPoints = this.firstPolygonPoints.map(shiftOrigin);
        }
        if (this.simplifiedPoints) {
          this.simplifiedPoints = this.simplifiedPoints.map(shiftOrigin);
        }
        if (this.simplifiedTrianglePoints) {
          this.simplifiedTrianglePoints =
            this.simplifiedTrianglePoints.map(shiftOrigin);
        }
      }
    }

    draw() {
      p.push();
      if (this.doneDrawing && this.isTriangle) {
        p.translate(this.shapeTranslationX, this.shapeTranslationY);
        p.scale(this.scale);
        p.rotate(this.rotation);
        p.fill(255, 0, 0);
        p.noStroke();
        // circle(0, 0, 300);
      }

      if ((!this.firstPolygonPoints || !this.isTriangle) && this.doneDrawing) {
        this.fallingVelocityY += this.fallingAccelerationY;
        this.fallingTranslationY += this.fallingVelocityY;
        p.translate(0, this.fallingTranslationY);
      }

      if (this.extraLinePolygonOpacity > 0 && this.doneDrawing) {
        this.extraLinePolygonOpacity -= 5;
      }

      if (this.points) {
        p.push();
        p.noFill();
        if (this.doneDrawing) {
          p.stroke(255, 255, 255, this.extraLinePolygonOpacity);
        } else {
          p.stroke(255);
        }
        p.beginShape();
        for (let i = 0; i < this.points.length; i++) {
          p.vertex(this.points[i].x, this.points[i].y);
        }
        p.endShape(p.OPEN);
        p.pop();
      }

      if (this.firstPolygonPoints) {
        p.push();
        p.noFill();
        p.stroke(255);
        p.beginShape();
        for (let i = 0; i < this.firstPolygonPoints.length; i++) {
          p.vertex(this.firstPolygonPoints[i].x, this.firstPolygonPoints[i].y);
        }
        p.endShape(p.CLOSE);
        p.pop();
      }

      p.pop();
    }

    isOffScreen() {
      return this.fallingTranslationY > CANVAS_HEIGHT;
    }
  }

  /*
   * MARK: P5.js sketch
   */
  p.setup = () => {
    let canvas = p.createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    canvas.parent('canvas-container');

    p.background(0);
  };

  p.draw = () => {
    p.background(0);
    p.cursor(p.CROSS);

    const allPies = [...pies, currentPie].filter(
      (pie): pie is Pie => pie !== null
    );
    for (let pie of allPies) {
      pie.draw();
    }

    p.background(0, 0, 0, 100);

    const allDrawings: Drawing[] = [...drawings];
    if (currentDrawing) {
      allDrawings.push(currentDrawing);
    }

    for (let drawing of allDrawings) {
      drawing.draw();
    }
    // Remove drawings that are off screen
    allDrawings
      .filter((drawing) => drawing.isOffScreen())
      .forEach((drawing) => {
        const idx = drawings.indexOf(drawing);
        if (idx !== -1) {
          drawings.splice(idx, 1);
        }
      });
  };

  /*
   * MARK: Drawing
   */

  p.mousePressed = () => {
    // p.mouseX/Y might need check if inside canvas? Usually p5 handles events on canvas if using instance but global listeners might need check.
    // In instance mode, p.mousePressed is called when mouse is pressed on canvas?
    // Documentation says: "If defined, it is called when the mouse is pressed."
    // It works globally on the page if attached to p, but limited to canvas context if we want?
    // The original script used global function which applies to whole page or canvas depending on setup.
    // Let's assume p5 handles it.
    if (currentDrawing) {
      continueDrawing(p.mouseX, p.mouseY);
    } else {
      startDrawing(p.mouseX, p.mouseY);
    }
  };

  p.mouseDragged = () => {
    if (currentDrawing) {
      continueDrawing(p.mouseX, p.mouseY);
    }
  };

  p.mouseReleased = () => {
    stopDrawing();
  };

  function startDrawing(x: number, y: number) {
    currentDrawing = new Drawing();
    currentDrawing.addPoint(x, y);
  }

  function continueDrawing(x: number, y: number) {
    if (currentDrawing) {
      currentDrawing.addPoint(x, y);
    }
  }

  function stopDrawing() {
    if (!currentDrawing) return;

    currentDrawing.finishDrawing();
    if (currentDrawing.isTriangle) {
      if (currentPie.canAddDrawing(currentDrawing)) {
        console.log('can');
        currentPie.addDrawing(currentDrawing);
      } else {
        currentPie.scale = 0.3;
        const newPie = new Pie(currentPie.x, currentPie.y);
        currentPie.x = pieShelfX;
        currentPie.y = pieShelfY;
        pieShelfX += 200;
        pies.push(currentPie);
        currentPie = newPie;
        currentPie.addDrawing(currentDrawing);
      }
    } else {
      drawings.push(currentDrawing);
    }
    currentDrawing = null;
    console.log(drawings);
  }
};

new p5(sketch);
