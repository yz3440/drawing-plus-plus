import p5 from 'p5';
import { Drawing } from './Drawing';
import { ensureWithinPi } from '../util';

export class Pie {
  p: p5;
  x: number;
  y: number;
  radius: number;
  startAngle: number;
  endAngle: number;
  occupiedAngle: number;
  scale: number;
  drawings: Drawing[];

  constructor(p: p5, x: number, y: number) {
    this.p = p;
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
      drawing.rotation = this.p.lerp(
        drawing.rotation,
        ensureWithinPi(-drawing.startAngle - drawing.initialRotation),
        rotationLerpFactor
      );
      drawing.scale = this.p.lerp(drawing.scale, this.scale, scaleLerpFactor);
      drawing.shapeTranslationX = this.p.lerp(
        drawing.shapeTranslationX,
        this.x,
        translationLerpFactor
      );
      drawing.shapeTranslationY = this.p.lerp(
        drawing.shapeTranslationY,
        this.y,
        translationLerpFactor
      );
      drawing.draw();
    }
  }
}
