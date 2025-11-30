import p5 from 'p5';
import { CANVAS_HEIGHT, GRAVITY } from '../constants';
import { Point, getWave } from '../util';
import { TriangleAnalyzer, TriangleAnalysisResult } from './TriangleAnalyzer';
import { ShapeAudio } from './ShapeAudio';
import { WaveVisualizer, VisualizerTransform } from './WaveVisualizer';

export class Drawing {
  p: p5;

  // Raw drawing points
  points: Point[];

  // Analysis results (populated after finishDrawing)
  private analysis: TriangleAnalysisResult | null = null;

  // Audio & visualization components
  private audio: ShapeAudio | null = null;
  private visualizer: WaveVisualizer | null = null;

  // Physics for non-triangle shapes (falling animation)
  private fallingTranslationY: number = 0;
  private fallingVelocityY: number = 0;
  private fallingAccelerationY: number = GRAVITY;

  // Visual fade-out for extra lines
  private extraLinePolygonOpacity: number = 100;

  // Drawing state
  doneDrawing: boolean = false;

  // Transformation state (used by Pie for positioning)
  shapeTranslationX: number = 0;
  shapeTranslationY: number = 0;
  rotation: number = 0;
  scale: number = 1;
  startAngle: number = 0;

  constructor(p: p5) {
    this.p = p;
    this.points = [];
  }

  // Expose analysis properties for external access (e.g., Pie)
  get isTriangle(): boolean {
    return this.analysis?.isTriangle ?? false;
  }

  get smallestAngle(): number {
    return this.analysis?.smallestAngle ?? 0;
  }

  get initialRotation(): number {
    return this.analysis?.initialRotation ?? 0;
  }

  get firstPolygonPoints(): Point[] | null {
    return this.analysis?.firstPolygonPoints ?? null;
  }

  get simplifiedTrianglePoints(): Point[] | null {
    return this.analysis?.simplifiedTrianglePoints ?? null;
  }

  get triangularity(): number {
    return this.analysis?.triangularity ?? 0;
  }

  addPoint(x: number, y: number): void {
    if (
      this.points.length === 0 ||
      this.points[this.points.length - 1].x !== x ||
      this.points[this.points.length - 1].y !== y
    ) {
      this.points.push(new Point(x, y));
    }
  }

  finishDrawing(): void {
    this.doneDrawing = true;

    // Analyze the drawn shape
    this.analysis = TriangleAnalyzer.analyze(this.points);

    if (!this.analysis.isTriangle || !this.analysis.smallestAngleTipPoint) {
      console.log('triangularity', this.analysis.triangularity);
      return;
    }

    console.log('triangularity', this.analysis.triangularity);

    // Translate everything to center on the tip point
    this.shapeTranslationX = this.analysis.smallestAngleTipPoint.x;
    this.shapeTranslationY = this.analysis.smallestAngleTipPoint.y;

    const { translatedPoints } = TriangleAnalyzer.translateToTip(
      this.analysis,
      this.points
    );
    this.points = translatedPoints;

    // Initialize audio and visualizer if we have valid triangle points
    if (
      this.analysis.firstPolygonPoints &&
      this.analysis.simplifiedTrianglePoints
    ) {
      const wave = getWave(
        this.analysis.firstPolygonPoints,
        this.analysis.simplifiedTrianglePoints as [Point, Point, Point]
      );

      if (wave) {
        console.log('wave', wave);

        this.audio = new ShapeAudio(this.p, {
          wave,
          perimeter: this.analysis.lengthOfSimplifiedTriangle,
        });

        this.visualizer = new WaveVisualizer(this.p, wave);
      }
    }
  }

  draw(): void {
    // Update audio params every frame to react to GUI changes
    this.audio?.updateParams();

    this.p.push();

    if (this.doneDrawing && this.isTriangle) {
      this.p.push();
      this.p.translate(this.shapeTranslationX, this.shapeTranslationY);
      this.p.scale(this.scale);
      this.p.rotate(this.rotation);
    } else if (this.doneDrawing && !this.isTriangle) {
      // Non-triangle shapes fall off screen
      this.fallingVelocityY += this.fallingAccelerationY;
      this.fallingTranslationY += this.fallingVelocityY;
      this.p.translate(0, this.fallingTranslationY);
    }

    // Fade out extra lines after drawing is done
    if (this.extraLinePolygonOpacity > 0 && this.doneDrawing) {
      this.extraLinePolygonOpacity -= 5;
    }

    // Draw the raw stroke path
    this.drawStrokePath();

    // Draw the first polygon (closed shape)
    this.drawFirstPolygon();

    // Draw the simplified triangle
    this.drawSimplifiedTriangle();

    if (this.doneDrawing && this.isTriangle) {
      this.p.pop();
    }

    // Draw audio visualizer
    this.drawVisualizer();

    this.p.pop();
  }

  private drawStrokePath(): void {
    if (!this.points.length) return;

    this.p.push();
    this.p.noFill();
    if (this.doneDrawing) {
      this.p.stroke(255, 255, 255, this.extraLinePolygonOpacity);
    } else {
      this.p.stroke(255);
    }
    this.p.beginShape();
    for (const pt of this.points) {
      this.p.vertex(pt.x, pt.y);
    }
    this.p.endShape();
    this.p.pop();
  }

  private drawFirstPolygon(): void {
    if (!this.firstPolygonPoints) return;

    this.p.push();
    this.p.noFill();
    this.p.stroke(255);
    this.p.beginShape();
    for (const pt of this.firstPolygonPoints) {
      this.p.vertex(pt.x, pt.y);
    }
    this.p.endShape(this.p.CLOSE);
    this.p.pop();
  }

  private drawSimplifiedTriangle(): void {
    if (!this.simplifiedTrianglePoints) return;

    this.p.push();
    this.p.noFill();
    this.p.stroke(0, 255, 0, 200);
    this.p.beginShape();
    for (const pt of this.simplifiedTrianglePoints) {
      this.p.vertex(pt.x, pt.y);
    }
    this.p.endShape(this.p.CLOSE);
    this.p.pop();
  }

  private drawVisualizer(): void {
    if (
      !this.visualizer ||
      !this.audio ||
      !this.doneDrawing ||
      !this.isTriangle
    ) {
      return;
    }

    const progress = this.audio.getProgress(this.p.millis());
    const transform: VisualizerTransform = {
      translationX: this.shapeTranslationX,
      translationY: this.shapeTranslationY,
      scale: this.scale,
      rotation: this.rotation,
    };

    this.visualizer.draw(progress, transform);
  }

  isOffScreen(): boolean {
    return this.fallingTranslationY > CANVAS_HEIGHT;
  }

  /**
   * Clean up audio resources when this drawing is removed.
   */
  dispose(): void {
    this.audio?.dispose();
    this.audio = null;
    this.visualizer = null;
  }
}
