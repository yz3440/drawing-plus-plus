import p5 from 'p5';
import { canvasHeight, GRAVITY, settings } from '../constants';
import { Point, getWave } from '../util';
import {
  SubPolygonAnalyzer,
  SubPolygonAnalysisResult,
} from './SubPolygonAnalyzer';
import { ShapeAudio } from './ShapeAudio';
import { WaveVisualizer, VisualizerTransform } from './WaveVisualizer';

// Static ID counter
let nextDrawingId = 1;

export class Drawing {
  // Unique identifier
  readonly id: number;

  p: p5;

  // Raw drawing points
  points: Point[];

  // Analysis results (populated after finishDrawing)
  private analysis: SubPolygonAnalysisResult | null = null;

  // Audio & visualization components
  private audio: ShapeAudio | null = null;
  private visualizer: WaveVisualizer | null = null;

  // Physics for non-valid shapes (falling animation)
  private fallingTranslationY: number = 0;
  private fallingVelocityY: number = 0;
  private fallingAccelerationY: number = GRAVITY;

  // Visual fade-out for extra lines
  private extraLinePolygonOpacity: number = 100;

  // Drawing state
  doneDrawing: boolean = false;
  highlighted: boolean = false;

  // Transformation state
  shapeTranslationX: number = 0;
  shapeTranslationY: number = 0;
  rotation: number = 0;
  scale: number = 1;

  // Memoization cache for transformed geometry
  private _cachedTransformedPolygon: Point[] | null = null;
  private _cachedCentroid: Point | null = null;
  private _lastTransformHash: string = '';

  constructor(p: p5) {
    this.id = nextDrawingId++;
    this.p = p;
    this.points = [];
  }

  // Expose analysis properties for external access
  get isValidShape(): boolean {
    return this.analysis?.isValidShape ?? false;
  }

  get tipAngle(): number {
    return this.analysis?.tipAngle ?? 0;
  }

  get initialRotation(): number {
    return this.analysis?.initialRotation ?? 0;
  }

  get firstPolygonPoints(): Point[] | null {
    return this.analysis?.firstPolygonPoints ?? null;
  }

  get finalSimplifiedPoints(): Point[] | null {
    return this.analysis?.finalSimplifiedPoints ?? null;
  }

  /**
   * Creates a hash of current transformation values for memoization.
   */
  private getTransformHash(): string {
    return `${this.shapeTranslationX.toFixed(
      2
    )}_${this.shapeTranslationY.toFixed(2)}_${this.rotation.toFixed(
      4
    )}_${this.scale.toFixed(4)}`;
  }

  /**
   * Updates the memoized geometry cache if transformation changed.
   */
  private updateGeometryCache(): void {
    const hash = this.getTransformHash();
    if (hash === this._lastTransformHash) return;

    this._lastTransformHash = hash;

    // Get the polygon to transform (prefer firstPolygonPoints, fallback to finalSimplifiedPoints)
    const sourcePolygon = this.firstPolygonPoints ?? this.finalSimplifiedPoints;
    if (!sourcePolygon || sourcePolygon.length === 0) {
      this._cachedTransformedPolygon = null;
      this._cachedCentroid = null;
      return;
    }

    // Transform each point: scale, rotate, then translate
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);

    this._cachedTransformedPolygon = sourcePolygon.map((pt) => {
      // Scale
      const sx = pt.x * this.scale;
      const sy = pt.y * this.scale;
      // Rotate
      const rx = sx * cos - sy * sin;
      const ry = sx * sin + sy * cos;
      // Translate
      return new Point(
        rx + this.shapeTranslationX,
        ry + this.shapeTranslationY
      );
    });

    // Calculate centroid
    let cx = 0;
    let cy = 0;
    for (const pt of this._cachedTransformedPolygon) {
      cx += pt.x;
      cy += pt.y;
    }
    this._cachedCentroid = new Point(
      cx / this._cachedTransformedPolygon.length,
      cy / this._cachedTransformedPolygon.length
    );
  }

  /**
   * Gets the transformed polygon (memoized).
   */
  getTransformedPolygon(): Point[] | null {
    this.updateGeometryCache();
    return this._cachedTransformedPolygon;
  }

  /**
   * Gets the centroid of the transformed polygon (memoized).
   */
  getCentroid(): Point | null {
    this.updateGeometryCache();
    return this._cachedCentroid;
  }

  /**
   * Tests if a point is inside the transformed polygon using ray casting.
   */
  containsPoint(x: number, y: number): boolean {
    const polygon = this.getTransformedPolygon();
    if (!polygon || polygon.length < 3) return false;

    let inside = false;
    const n = polygon.length;

    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;

      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }

    return inside;
  }

  /**
   * Gets the distance from a point to the centroid.
   */
  distanceToCentroid(x: number, y: number): number {
    const centroid = this.getCentroid();
    if (!centroid) return Infinity;
    const dx = x - centroid.x;
    const dy = y - centroid.y;
    return Math.sqrt(dx * dx + dy * dy);
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
    this.analysis = SubPolygonAnalyzer.analyze(this.points);

    if (!this.analysis.isValidShape || !this.analysis.tipPoint) {
      return;
    }

    // Apply selected tip selection method
    if (
      settings.TIP_SELECTION_METHOD === 'closest_edge' &&
      this.points.length > 0
    ) {
      SubPolygonAnalyzer.findTipByClosestEdge(this.analysis, this.points[0]);
    }

    // Translate everything to center on the tip point
    this.shapeTranslationX = this.analysis.tipPoint.x;
    this.shapeTranslationY = this.analysis.tipPoint.y;

    const { translatedPoints } = SubPolygonAnalyzer.translateToTip(
      this.analysis,
      this.points
    );
    this.points = translatedPoints;

    // Initialize audio and visualizer if we have valid polygon points
    if (
      this.analysis.firstPolygonPoints &&
      this.analysis.finalSimplifiedPoints
    ) {
      const wave = getWave(
        this.analysis.firstPolygonPoints,
        this.analysis.finalSimplifiedPoints
      );

      if (wave) {
        console.log('wave', wave);

        this.audio = new ShapeAudio(this.p, {
          wave,
          perimeter: this.analysis.lengthOfFinalSimplified,
        });

        this.visualizer = new WaveVisualizer(this.p, wave);
      }
    }
  }

  draw(): void {
    // Update audio params every frame to react to GUI changes
    this.audio?.updateParams();

    this.p.push();

    if (this.doneDrawing && this.isValidShape) {
      this.p.push();
      this.p.translate(this.shapeTranslationX, this.shapeTranslationY);
      this.p.scale(this.scale);
      this.p.rotate(this.rotation);
    } else if (this.doneDrawing && !this.isValidShape) {
      // Non-valid shapes fall off screen
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

    // Draw the simplified polygon (the "shape")
    this.drawSimplifiedPolygon();

    if (this.doneDrawing && this.isValidShape) {
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
    if (this.highlighted) {
      this.p.fill(255, 0, 0, 80); // Transparent red fill when hovered
    } else {
      this.p.noFill();
    }
    this.p.stroke(255);
    this.p.beginShape();
    for (const pt of this.firstPolygonPoints) {
      this.p.vertex(pt.x, pt.y);
    }
    this.p.endShape(this.p.CLOSE);
    this.p.pop();
  }

  private drawSimplifiedPolygon(): void {
    if (!this.finalSimplifiedPoints) return;

    this.p.push();
    this.p.noFill();
    this.p.stroke(0, 255, 0, 200);
    this.p.beginShape();
    for (const pt of this.finalSimplifiedPoints) {
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
      !this.isValidShape
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
    return this.fallingTranslationY > canvasHeight;
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
