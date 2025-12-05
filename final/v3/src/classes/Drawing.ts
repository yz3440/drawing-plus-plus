import p5 from 'p5';
import { canvasHeight, GRAVITY, settings } from '../constants';
import { Point, getWave } from '../util';
import {
  SubPolygonAnalyzer,
  SubPolygonAnalysisResult,
} from './SubPolygonAnalyzer';
import { ShapeAudio } from './ShapeAudio';
import { WaveVisualizer, VisualizerTransform } from './WaveVisualizer';

/** Recorded position with normalized time (0-1) */
interface RecordedPosition {
  x: number;
  y: number;
  t: number; // normalized time 0-1
}

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

  // Dragging state
  isDragging: boolean = false;
  private dragOffsetX: number = 0;
  private dragOffsetY: number = 0;

  // Motion recording state
  private recordedPath: RecordedPosition[] = [];
  private isRecording: boolean = false;
  private recordingStartTime: number = 0;

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

    // Update FM frequency based on the traveling point's Y position
    this.updateFMFrequencyFromWavePosition();

    // Update position from recorded motion path (if any)
    this.updateMotionPlayback();

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
   * Starts dragging the shape from the given position.
   */
  startDrag(x: number, y: number): void {
    this.isDragging = true;
    this.dragOffsetX = x - this.shapeTranslationX;
    this.dragOffsetY = y - this.shapeTranslationY;

    // Start recording motion
    this.isRecording = true;
    this.recordedPath = [];
    this.recordingStartTime = this.p.millis();

    // Record initial position
    this.recordedPath.push({
      x: this.shapeTranslationX,
      y: this.shapeTranslationY,
      t: 0,
    });
  }

  /**
   * Updates the shape position during dragging.
   */
  updateDrag(x: number, y: number): void {
    if (!this.isDragging) return;

    this.shapeTranslationX = x - this.dragOffsetX;
    this.shapeTranslationY = y - this.dragOffsetY;

    // Record position during drag
    if (this.isRecording) {
      const elapsed = this.p.millis() - this.recordingStartTime;
      this.recordedPath.push({
        x: this.shapeTranslationX,
        y: this.shapeTranslationY,
        t: elapsed, // Will be normalized when recording ends
      });
    }

    // Invalidate geometry cache
    this._lastTransformHash = '';

    // Update FM frequency based on new centroid position
    if (settings.SYNTHESIS_MODE === 'fm') {
      this.audio?.updateFMFrequency(this.getCentroid());
    }
  }

  /**
   * Ends dragging the shape.
   */
  endDrag(): void {
    this.isDragging = false;

    // Stop recording and normalize the path
    if (this.isRecording && this.recordedPath.length > 1) {
      this.isRecording = false;
      const recordingDuration = this.p.millis() - this.recordingStartTime;

      // Normalize time values to 0-1
      const maxT = this.recordedPath[this.recordedPath.length - 1].t;
      if (maxT > 0) {
        for (const pos of this.recordedPath) {
          pos.t = pos.t / maxT;
        }
      }

      console.log(
        `Recorded ${this.recordedPath.length} positions over ${recordingDuration}ms`
      );
    } else {
      // Not enough data to make a meaningful animation
      this.recordedPath = [];
      this.isRecording = false;
    }
  }

  /**
   * Clears the recorded motion path.
   */
  clearRecordedPath(): void {
    this.recordedPath = [];
  }

  /**
   * Returns true if this drawing has a recorded motion path.
   */
  hasRecordedPath(): boolean {
    return this.recordedPath.length > 1;
  }

  /**
   * Updates position based on recorded path and current audio progress.
   * Call this every frame when not dragging.
   */
  private updateMotionPlayback(): void {
    if (this.isDragging || this.recordedPath.length < 2 || !this.audio) return;

    // Get current progress through the loop (0-1)
    const progress = this.audio.getProgress(this.p.millis());

    // Find the two recorded positions to interpolate between
    let p1 = this.recordedPath[0];
    let p2 = this.recordedPath[1];

    for (let i = 0; i < this.recordedPath.length - 1; i++) {
      if (
        this.recordedPath[i].t <= progress &&
        this.recordedPath[i + 1].t > progress
      ) {
        p1 = this.recordedPath[i];
        p2 = this.recordedPath[i + 1];
        break;
      }
    }

    // Handle wrap-around (when progress is past the last recorded point)
    if (progress >= this.recordedPath[this.recordedPath.length - 1].t) {
      p1 = this.recordedPath[this.recordedPath.length - 1];
      p2 = this.recordedPath[0];
    }

    // Interpolate position
    const segmentDuration = p2.t - p1.t;
    let localProgress = 0;
    if (segmentDuration > 0) {
      localProgress = (progress - p1.t) / segmentDuration;
    } else if (p2.t < p1.t) {
      // Wrapping from end to start
      const wrapDuration = 1 - p1.t + p2.t;
      if (progress >= p1.t) {
        localProgress = (progress - p1.t) / wrapDuration;
      } else {
        localProgress = (1 - p1.t + progress) / wrapDuration;
      }
    }

    // Clamp and apply easing for smoother motion
    localProgress = Math.max(0, Math.min(1, localProgress));

    // Linear interpolation
    this.shapeTranslationX = p1.x + (p2.x - p1.x) * localProgress;
    this.shapeTranslationY = p1.y + (p2.y - p1.y) * localProgress;

    // Invalidate geometry cache
    this._lastTransformHash = '';

    // Update FM frequency based on interpolated position
    if (settings.SYNTHESIS_MODE === 'fm') {
      this.audio?.updateFMFrequency(this.getCentroid());
    }
  }

  /**
   * Updates FM audio based on current centroid (call when mode changes).
   */
  updateFMAudio(): void {
    if (settings.SYNTHESIS_MODE === 'fm' && this.audio) {
      this.audio.updateFMFrequency(this.getCentroid());
    }
  }

  /**
   * Updates FM frequency based on the current traveling point's Y position.
   * Transforms local wave position to world coordinates.
   */
  private updateFMFrequencyFromWavePosition(): void {
    if (settings.SYNTHESIS_MODE !== 'fm' || !this.audio || !this.isValidShape) {
      return;
    }

    const wavePos = this.audio.getCurrentWavePosition(this.p.millis());
    if (!wavePos) return;

    // Transform local point to world coordinates
    // The shape uses: translate, scale, rotate (in p5 order)
    // Which means: rotate first, then scale, then translate
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);

    // Use the projected point (on simplified shape) for smoother pitch changes
    const localX = wavePos.ptProjected.x;
    const localY = wavePos.ptProjected.y;

    // Scale
    const sx = localX * this.scale;
    const sy = localY * this.scale;

    // Rotate
    const ry = sx * sin + sy * cos;

    // Translate (only need Y for frequency)
    const worldY = ry + this.shapeTranslationY;

    this.audio.updateFMFrequencyFromY(worldY);
  }

  /**
   * Force update audio parameters (call when settings change).
   */
  updateAudioParams(): void {
    this.audio?.updateParams();
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
