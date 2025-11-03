const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

let currentDrawing = null;
let drawings = [];

class Pie {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 0;
    this.startAngle = 0;
    this.endAngle = 0;
    this.occupiedAngle = 0;
    this.scale = 1;

    this.drawings = [];
  }

  canAddDrawing(drawing) {
    return this.occupiedAngle + drawing.smallestAngle <= Math.PI * 2;
  }

  addDrawing(drawing) {
    drawing.startAngle = this.occupiedAngle;
    this.occupiedAngle += drawing.smallestAngle;

    this.drawings.push(drawing);
  }

  draw() {
    const rotationLerpFactor = 0.05;
    const scaleLerpFactor = 0.2;
    const translationLerpFactor = 0.1;

    // push();
    // stroke(255);
    // strokeWeight(2);
    // translate(this.x, this.y);
    // line(0, 0, 100, 0);
    // rotate(-this.occupiedAngle);
    // line(0, 0, 100, 0);
    // pop();

    for (let drawing of this.drawings) {
      drawing.rotation = lerp(
        drawing.rotation,
        ensureWithinPi(-drawing.startAngle - drawing.initialRotation),
        rotationLerpFactor
      );
      drawing.scale = lerp(drawing.scale, this.scale, scaleLerpFactor);
      drawing.shapeTranslationX = lerp(
        drawing.shapeTranslationX,
        this.x,
        translationLerpFactor
      );
      drawing.shapeTranslationY = lerp(
        drawing.shapeTranslationY,
        this.y,
        translationLerpFactor
      );
      drawing.draw();
    }
  }
}

let currentPie = new Pie(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
let pies = [];
let pieShelfX = 100;
let pieShelfY = 100;
const g = 1;

const TRIANGULARITY_THRESHOLD = 0.65;

class Drawing {
  constructor() {
    this.points = [];

    this.fallingTranslationY = 0;
    this.fallingVelocityY = 0;
    this.fallingAccelerationY = g;

    this.shapeTranslationX = 0;
    this.shapeTranslationY = 0;

    this.rotation = 0;
    this.doneDrawing = false;
    this.extraLinePolygonOpacity = 100;
    this.scale = 1;
    this.isTriangle = false;
  }

  addPoint(x, y) {
    if (
      this.points.length === 0 ||
      this.points[this.points.length - 1].x !== x ||
      this.points[this.points.length - 1].y !== y
    ) {
      this.points.push({ x, y });
    }
  }

  finishDrawing() {
    this.finishFrameCount = frameCount;
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
    const bbOfFirstPolygon = boundingBoxAndCenterOfPolygon(firstPolygonPoints);
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
      const p =
        this.simplifiedTrianglePoints[i % this.simplifiedTrianglePoints.length];
      const p1 =
        this.simplifiedTrianglePoints[
          (i + 2) % this.simplifiedTrianglePoints.length
        ];
      const p2 =
        this.simplifiedTrianglePoints[
          (i + 1) % this.simplifiedTrianglePoints.length
        ];
      const angle = getPositiveAngleFromThreePoints(p, p1, p2);
      console.log('angle', (angle * 180) / Math.PI);
      if (angle < this.smallestAngle) {
        this.smallestAngle = angle;
        this.smallestAngleTipPoint = p;
        this.initialRotation = getAngle(p, p1);
      }
    }

    console.log('smallestAngle', (this.smallestAngle * 180) / Math.PI);
    console.log('smallestAngleTipPoint', this.smallestAngleTipPoint);

    this.shapeTranslationX = this.smallestAngleTipPoint.x;
    this.shapeTranslationY = this.smallestAngleTipPoint.y;
    const shiftOrigin = (p) => {
      return {
        x: p.x - this.shapeTranslationX,
        y: p.y - this.shapeTranslationY,
      };
    };
    this.points = this.points.map(shiftOrigin);
    this.firstPolygonPoints = this.firstPolygonPoints.map(shiftOrigin);
    this.simplifiedPoints = this.simplifiedPoints.map(shiftOrigin);
    this.simplifiedTrianglePoints =
      this.simplifiedTrianglePoints.map(shiftOrigin);
  }

  draw() {
    push();
    if (this.doneDrawing && this.isTriangle) {
      translate(this.shapeTranslationX, this.shapeTranslationY);
      scale(this.scale);
      rotate(this.rotation);
      fill(255, 0, 0);
      noStroke();
      // circle(0, 0, 300);
    }

    if ((!this.firstPolygonPoints || !this.isTriangle) && this.doneDrawing) {
      this.fallingVelocityY += this.fallingAccelerationY;
      this.fallingTranslationY += this.fallingVelocityY;
      translate(0, this.fallingTranslationY);
    }

    if (this.extraLinePolygonOpacity > 0 && this.doneDrawing) {
      this.extraLinePolygonOpacity -= 5;
    }

    if (this.points) {
      push();
      noFill();
      if (this.doneDrawing) {
        stroke(255, 255, 255, this.extraLinePolygonOpacity);
      } else {
        stroke(255);
      }
      beginShape();
      for (let i = 0; i < this.points.length; i++) {
        vertex(this.points[i].x, this.points[i].y);
      }
      endShape(OPEN);
      pop();
    }

    if (this.firstPolygonPoints) {
      push();
      noFill();
      stroke(255);
      beginShape();
      for (let i = 0; i < this.firstPolygonPoints.length; i++) {
        vertex(this.firstPolygonPoints[i].x, this.firstPolygonPoints[i].y);
      }
      endShape(CLOSE);
      pop();
    }

    // if (this.simplifiedPoints) {
    //   for (let i = 0; i < this.simplifiedPoints.length - 1; i++) {
    //     push();
    //     noFill();
    //     stroke(255, 0, 0);
    //     line(
    //       this.simplifiedPoints[i].x,
    //       this.simplifiedPoints[i].y,
    //       this.simplifiedPoints[i + 1].x,
    //       this.simplifiedPoints[i + 1].y
    //     );
    //     pop();
    //   }
    // }
    // if (this.simplifiedTrianglePoints) {
    //   push();
    //   if (this.isTriangle) {
    //     fill(0, 255, 0, 2);
    //   } else {
    //     noFill();
    //   }
    //   stroke(0, 255, 0, 100);
    //   beginShape();
    //   for (let i = 0; i < this.simplifiedTrianglePoints.length; i++) {
    //     // text(
    //     //   i,
    //     //   this.simplifiedTrianglePoints[i].x,
    //     //   this.simplifiedTrianglePoints[i].y
    //     // );
    //     vertex(
    //       this.simplifiedTrianglePoints[i].x,
    //       this.simplifiedTrianglePoints[i].y
    //     );
    //   }
    //   endShape(CLOSE);

    //   pop();
    // }
    pop();
  }

  isOffScreen() {
    return this.fallingTranslationY > CANVAS_HEIGHT;
  }
}

/*
 * MARK: P5.js sketch
 */
function setup() {
  let canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  canvas.parent('canvas-container');

  background(0);
}

function draw() {
  background(0);
  cursor(CROSS);

  const allPies = [...pies, currentPie].filter((pie) => pie !== null);
  for (let pie of allPies) {
    pie.draw();
  }

  background(0, 0, 0, 100);

  const allDrawings = [...drawings, currentDrawing].filter(
    (drawing) => drawing !== null
  );

  for (let drawing of allDrawings) {
    drawing.draw();
  }
  // Remove drawings that are off screen
  allDrawings
    .filter((drawing) => drawing.isOffScreen())
    .forEach((drawing) => {
      drawings.splice(drawings.indexOf(drawing), 1);
    });
}

/*
 * MARK: Drawing
 */

function mousePressed() {
  if (currentDrawing) {
    continueDrawing(mouseX, mouseY);
  } else {
    startDrawing(mouseX, mouseY);
  }
}

function mouseDragged() {
  if (currentDrawing) {
    continueDrawing(mouseX, mouseY);
  }
}

function mouseReleased() {
  stopDrawing();
}

function startDrawing(x, y) {
  currentDrawing = new Drawing();
  currentDrawing.addPoint(x, y);
}

function continueDrawing(x, y) {
  currentDrawing.addPoint(x, y);
}

function stopDrawing() {
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
