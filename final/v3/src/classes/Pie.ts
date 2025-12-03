import p5 from 'p5';
import { Drawing } from './Drawing';
import { ensureWithinPi } from '../util';

/**
 * Singleton Pie that holds all triangle drawings arranged radially.
 * Can grow beyond 360 degrees (drawings stack in layers).
 */
class PieClass {
  private _p: p5 | null = null;
  x: number = 0;
  y: number = 0;
  radius: number = 0;
  startAngle: number = 0;
  endAngle: number = 0;
  occupiedAngle: number = 0;
  scale: number = 1;
  drawings: Drawing[] = [];

  /**
   * Initialize the singleton with p5 instance and position.
   * Must be called once before using the Pie.
   */
  init(p: p5, x: number, y: number): void {
    this._p = p;
    this.x = x;
    this.y = y;
    this.radius = 0;
    this.startAngle = 0;
    this.endAngle = 0;
    this.occupiedAngle = 0;
    this.scale = 1;
    this.drawings = [];
  }

  /**
   * Update the Pie's center position (e.g., on window resize).
   */
  setPosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  private get p(): p5 {
    if (!this._p) {
      throw new Error('Pie not initialized. Call Pie.init(p) first.');
    }
    return this._p;
  }

  addDrawing(drawing: Drawing): void {
    drawing.startAngle = this.occupiedAngle;
    this.occupiedAngle += drawing.tipAngle;
    this.drawings.push(drawing);
  }

  removeDrawing(drawing: Drawing): void {
    const index = this.drawings.indexOf(drawing);
    if (index !== -1) {
      drawing.dispose();
      this.drawings.splice(index, 1);
      // Recalculate angles for remaining drawings
      this.recalculateAngles();
    }
  }

  private recalculateAngles(): void {
    this.occupiedAngle = 0;
    for (const drawing of this.drawings) {
      drawing.startAngle = this.occupiedAngle;
      this.occupiedAngle += drawing.tipAngle;
    }
  }

  draw(): void {
    const rotationLerpFactor = 0.05;
    const scaleLerpFactor = 0.2;
    const translationLerpFactor = 0.1;

    for (const drawing of this.drawings) {
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

// Singleton instance
export const Pie = new PieClass();
