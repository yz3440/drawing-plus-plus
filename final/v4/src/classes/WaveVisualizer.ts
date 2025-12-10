import p5 from 'p5';
import { WaveSamplePoint } from '../util';

export interface VisualizerTransform {
  translationX: number;
  translationY: number;
  scale: number;
  rotation: number;
}

/**
 * Renders the audio wave visualization for a triangle shape.
 * Shows two dots: one traveling along the original polygon path,
 * and one traveling along the simplified triangle, connected by a line.
 */
export class WaveVisualizer {
  private p: p5;
  private wave: WaveSamplePoint[];

  constructor(p: p5, wave: WaveSamplePoint[]) {
    this.p = p;
    this.wave = wave;
  }

  /**
   * Updates the wave data (used when amplitude scale changes).
   */
  updateWave(wave: WaveSamplePoint[]): void {
    this.wave = wave;
  }

  /**
   * Draws the wave visualization at the given progress (0-1).
   */
  draw(progress: number, transform: VisualizerTransform): void {
    if (this.wave.length < 2) return;

    const totalLength = this.wave[this.wave.length - 1].t;
    const currentT = progress * totalLength;

    // Find the current sample index
    let sampleIndex = 0;
    for (let i = 0; i < this.wave.length - 1; i++) {
      if (this.wave[i].t <= currentT && this.wave[i + 1].t > currentT) {
        sampleIndex = i;
        break;
      }
    }

    const s1 = this.wave[sampleIndex];
    const s2 = this.wave[sampleIndex + 1] || s1;

    // Interpolate for smoother position
    const segmentDuration = s2.t - s1.t;
    const segmentProgress =
      segmentDuration > 0 ? (currentT - s1.t) / segmentDuration : 0;

    if (
      !s1.pt ||
      !s2.pt ||
      !s1.ptProjectedOnSegment ||
      !s2.ptProjectedOnSegment
    ) {
      return;
    }

    // Interpolate between points on the polygon (The jagged path)
    const polyX = s1.pt.x + (s2.pt.x - s1.pt.x) * segmentProgress;
    const polyY = s1.pt.y + (s2.pt.y - s1.pt.y) * segmentProgress;

    // Interpolate between points on the triangle (The smooth path)
    const triX =
      s1.ptProjectedOnSegment.x +
      (s2.ptProjectedOnSegment.x - s1.ptProjectedOnSegment.x) * segmentProgress;
    const triY =
      s1.ptProjectedOnSegment.y +
      (s2.ptProjectedOnSegment.y - s1.ptProjectedOnSegment.y) * segmentProgress;

    this.p.push();

    this.p.translate(transform.translationX, transform.translationY);
    this.p.scale(transform.scale);
    this.p.rotate(transform.rotation);

    // Draw Visualizer on Polygon (Jagged) - White dot
    this.p.fill(255);
    this.p.noStroke();
    this.p.circle(polyX, polyY, 5);

    // Draw Visualizer on Triangle (Smooth) - Green dot
    this.p.fill(0, 255, 0);
    this.p.circle(triX, triY, 5);

    // Draw connecting line
    this.p.stroke(255);
    this.p.line(polyX, polyY, triX, triY);

    this.p.pop();
  }
}
