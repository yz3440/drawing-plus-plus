import p5 from 'p5';
import { canvasHeight, GRAVITY, settings } from '../constants';
import { Point, getWave, WaveSamplePoint } from '../util';
import {
  SubPolygonAnalyzer,
  SubPolygonAnalysisResult,
} from './SubPolygonAnalyzer';
import { ShapeAudio } from './ShapeAudio';
import { WaveVisualizer, VisualizerTransform } from './WaveVisualizer';
import { Metronome } from './Metronome';

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
  private motionLoopBars: number = 0; // Duration of motion loop in bars (rounded to nearest bar)
  private pendingRecordingMode: boolean = false; // When true, next drag will record motion

  // Transformation state
  shapeTranslationX: number = 0;
  shapeTranslationY: number = 0;
  rotation: number = 0;
  scale: number = 1;

  // Memoization cache for transformed geometry
  private _cachedTransformedPolygon: Point[] | null = null;
  private _cachedCentroid: Point | null = null;
  private _lastTransformHash: string = '';

  // Wave amplitude scaling (for wobble intensity)
  private originalWave: WaveSamplePoint[] | null = null;
  private waveAmplitudeScale: number = 1.0;
  private scaledPolygonPoints: Point[] | null = null; // Computed from scaled wave

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

        // Store original wave for amplitude scaling
        this.originalWave = wave;
        // Initialize scaled polygon points (1:1 with original at scale 1.0)
        this.scaledPolygonPoints = wave.map((s) => s.pt);

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
    // Use scaled polygon points if available, otherwise fall back to original
    const pointsToDraw = this.scaledPolygonPoints ?? this.firstPolygonPoints;
    if (!pointsToDraw) return;

    this.p.push();
    if (this.pendingRecordingMode) {
      this.p.fill(255, 100, 0, 100); // Orange fill when ready to record
      this.p.stroke(255, 150, 0);
    } else if (this.highlighted) {
      this.p.fill(255, 0, 0, 80); // Transparent red fill when hovered
      this.p.stroke(255);
    } else {
      this.p.noFill();
      this.p.stroke(255);
    }
    this.p.beginShape();
    for (const pt of pointsToDraw) {
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
   * Only records motion if pendingRecordingMode is true.
   * If not in recording mode, clears any existing recorded path.
   */
  startDrag(x: number, y: number): void {
    this.isDragging = true;
    this.dragOffsetX = x - this.shapeTranslationX;
    this.dragOffsetY = y - this.shapeTranslationY;

    // Only start recording if in pending recording mode
    if (this.pendingRecordingMode) {
      this.isRecording = true;
      this.recordedPath = [];
      this.recordingStartTime = this.p.millis();

      // Record initial position
      this.recordedPath.push({
        x: this.shapeTranslationX,
        y: this.shapeTranslationY,
        t: 0,
      });
    } else {
      // Not in recording mode - clear any existing recording
      // (user is repositioning the shape, old animation no longer makes sense)
      if (this.recordedPath.length > 0) {
        this.recordedPath = [];
        this.motionLoopBars = 0;
        console.log('Cleared recording (shape repositioned)');
      }
    }
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

    // Stop recording and normalize the path (only if we were recording)
    if (this.isRecording && this.recordedPath.length > 1) {
      this.isRecording = false;
      this.pendingRecordingMode = false; // Clear recording mode after successful recording
      const recordingDurationMs = this.p.millis() - this.recordingStartTime;
      const recordingDurationSec = recordingDurationMs / 1000;

      // Calculate duration in bars and round to nearest bar (minimum 1 bar)
      const barDuration = Metronome.getBarDuration();
      const rawBars = recordingDurationSec / barDuration;
      this.motionLoopBars = Math.max(1, Math.round(rawBars));

      // Normalize time values to 0-1
      const maxT = this.recordedPath[this.recordedPath.length - 1].t;
      if (maxT > 0) {
        for (const pos of this.recordedPath) {
          pos.t = pos.t / maxT;
        }
      }

      console.log(
        `Recorded ${
          this.recordedPath.length
        } positions over ${recordingDurationMs}ms (${rawBars.toFixed(
          2
        )} bars → ${this.motionLoopBars} bars)`
      );
    } else if (this.isRecording) {
      // Recording was started but not enough data
      this.recordedPath = [];
      this.isRecording = false;
      this.pendingRecordingMode = false;
      this.motionLoopBars = 0;
    }
    // If not recording, just end the drag (translate-only mode)
  }

  /**
   * Clears the recorded motion path.
   */
  clearRecordedPath(): void {
    this.recordedPath = [];
    this.motionLoopBars = 0;
  }

  /**
   * Returns true if this drawing has a recorded motion path.
   */
  hasRecordedPath(): boolean {
    return this.recordedPath.length > 1;
  }

  /**
   * Enables pending recording mode. The next drag on this shape will record motion.
   */
  enableRecordingMode(): void {
    this.pendingRecordingMode = true;
  }

  /**
   * Disables pending recording mode.
   */
  disableRecordingMode(): void {
    this.pendingRecordingMode = false;
  }

  /**
   * Returns true if the shape is waiting to record motion on next drag.
   */
  isPendingRecording(): boolean {
    return this.pendingRecordingMode;
  }

  /**
   * Updates position based on recorded path and current metronome progress.
   * The motion loop duration is independent of audio/visual animation settings.
   * Call this every frame when not dragging.
   */
  private updateMotionPlayback(): void {
    if (
      this.isDragging ||
      this.recordedPath.length < 2 ||
      this.motionLoopBars <= 0
    )
      return;

    // Get current progress through the motion loop (0-1)
    // Uses the original recording duration (rounded to bars), independent of audio loop
    const progress = Metronome.getProgress(
      this.p.millis(),
      this.motionLoopBars
    );

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
   * Updates the scale of the drawing and recalculates audio duration.
   * The audio loop duration is based on effective perimeter (original perimeter * scale).
   * @param newScale - The new scale value (1.0 = original size)
   * @param pivotX - Optional X coordinate of the pivot point (world space). If provided, scales around this point.
   * @param pivotY - Optional Y coordinate of the pivot point (world space). If provided, scales around this point.
   */
  updateScale(newScale: number, pivotX?: number, pivotY?: number): void {
    // Clamp scale to reasonable bounds
    const clampedScale = Math.max(0.1, Math.min(20.0, newScale));

    if (clampedScale === this.scale) return;

    // If pivot point is provided, adjust translation to scale around that point
    if (pivotX !== undefined && pivotY !== undefined) {
      const scaleRatio = clampedScale / this.scale;

      // Scale around pivot: newTranslation = (oldTranslation - pivot) * scaleRatio + pivot
      this.shapeTranslationX =
        (this.shapeTranslationX - pivotX) * scaleRatio + pivotX;
      this.shapeTranslationY =
        (this.shapeTranslationY - pivotY) * scaleRatio + pivotY;
    }

    this.scale = clampedScale;

    // Invalidate geometry cache
    this._lastTransformHash = '';

    // Update audio loop duration based on new effective perimeter
    if (this.audio && this.analysis) {
      const originalPerimeter = this.audio.getPerimeter();
      const effectivePerimeter = originalPerimeter * this.scale;
      this.audio.updateEffectivePerimeter(effectivePerimeter);
    }
  }

  /**
   * Gets the current scale of the drawing.
   */
  getScale(): number {
    return this.scale;
  }

  /**
   * Sets the gain (volume) for this shape's audio (0-1).
   */
  setGain(gain: number): void {
    this.audio?.setUserGain(gain);
  }

  /**
   * Gets the current gain (volume) for this shape's audio (0-1).
   */
  getGain(): number {
    return this.audio?.getUserGain() ?? 1.0;
  }

  /**
   * Sets the wave amplitude scale (wobble intensity).
   * Scale of 1.0 = original shape, < 1.0 = smoother, > 1.0 = more wobble.
   * This regenerates the shape geometry and audio.
   * @param scale - The amplitude scale (typically 0.0 to 3.0)
   */
  setWaveAmplitudeScale(scale: number): void {
    if (!this.originalWave || this.originalWave.length === 0) return;

    const clampedScale = Math.max(0, Math.min(20.0, scale));
    if (clampedScale === this.waveAmplitudeScale) return;

    this.waveAmplitudeScale = clampedScale;

    // Create scaled wave by adjusting amplitudes and point positions
    const scaledWave: WaveSamplePoint[] = this.originalWave.map((sample) => {
      // Scale the offset from the simplified edge
      // newPt = ptProjectedOnSegment + (pt - ptProjectedOnSegment) * scale
      const offsetX = sample.pt.x - sample.ptProjectedOnSegment.x;
      const offsetY = sample.pt.y - sample.ptProjectedOnSegment.y;

      const newPt = new Point(
        sample.ptProjectedOnSegment.x + offsetX * clampedScale,
        sample.ptProjectedOnSegment.y + offsetY * clampedScale
      );

      return {
        t: sample.t,
        amplitude: sample.amplitude * clampedScale,
        pt: newPt,
        ptProjectedOnSegment: sample.ptProjectedOnSegment,
      };
    });

    // Update scaled polygon points for visual display
    this.scaledPolygonPoints = scaledWave.map((s) => s.pt);

    // Update audio with new wave and amplitude scale
    // The amplitude scale affects modulation depth (not normalized away)
    if (this.audio) {
      this.audio.updateWave(scaledWave, clampedScale);
    }

    // Update visualizer with new wave
    if (this.visualizer) {
      this.visualizer.updateWave(scaledWave);
    }

    // Invalidate geometry cache (shape changed)
    this._lastTransformHash = '';

    console.log(`Wave amplitude scale: ${clampedScale.toFixed(2)}`);
  }

  /**
   * Gets the current wave amplitude scale.
   */
  getWaveAmplitudeScale(): number {
    return this.waveAmplitudeScale;
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
