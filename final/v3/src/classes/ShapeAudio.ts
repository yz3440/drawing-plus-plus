import p5 from 'p5';
import { WaveSamplePoint, generateWaveBuffer, Point } from '../util';
export { Point };
import { settings, FM_NOTES, canvasHeight } from '../constants';
import { Metronome } from './Metronome';
import { AudioMixer } from './AudioMixer';

/**
 * Snaps a ratio to the nearest integer ratio.
 * For ratios >= 1: returns 1, 2, 3, 4, 5, ...
 * For ratios < 1: returns 1/2, 1/3, 1/4, 1/5, ...
 */
function snapToIntegerRatio(ratio: number): number {
  if (ratio >= 1) {
    // Snap to nearest integer (1, 2, 3, 4, ...)
    return Math.max(1, Math.round(ratio));
  } else {
    // Snap to nearest 1/n (1/2, 1/3, 1/4, ...)
    const inverseRatio = 1 / ratio;
    const n = Math.max(2, Math.round(inverseRatio));
    return 1 / n;
  }
}

/**
 * Gets the frequency for a given Y position based on FM_NUM_LINES.
 * Divides the canvas into N lines and returns the frequency of the closest line.
 */
export function getFrequencyForY(y: number): {
  freq: number;
  lineIndex: number;
  lineY: number;
} {
  const numLines = settings.FM_NUM_LINES;
  const notes = FM_NOTES.slice(0, numLines);

  // Calculate which line is closest
  const lineSpacing = canvasHeight / (numLines + 1);
  const lineIndex = Math.round(y / lineSpacing) - 1;
  const clampedIndex = Math.max(0, Math.min(numLines - 1, lineIndex));

  // Line Y position (1-indexed from top)
  const lineY = (clampedIndex + 1) * lineSpacing;

  return {
    freq: notes[clampedIndex]?.freq ?? 220,
    lineIndex: clampedIndex,
    lineY,
  };
}

/**
 * Gets the Y positions of all frequency lines.
 */
export function getFrequencyLinePositions(): {
  y: number;
  freq: number;
  name: string;
}[] {
  const numLines = settings.FM_NUM_LINES;
  const notes = FM_NOTES.slice(0, numLines);
  const lineSpacing = canvasHeight / (numLines + 1);

  return notes.map((note, i) => ({
    y: (i + 1) * lineSpacing,
    freq: note.freq,
    name: note.name,
  }));
}

export interface ShapeAudioConfig {
  wave: WaveSamplePoint[];
  perimeter: number;
  referencePerimeter?: number;
}

export interface CurrentWavePosition {
  pt: Point;
  ptProjected: Point;
}

/**
 * Gets the current position on the wave for a given progress (0-1).
 * Returns the interpolated point on the original polygon and the simplified shape.
 */
export function getWavePositionAtProgress(
  wave: WaveSamplePoint[],
  progress: number
): CurrentWavePosition | null {
  if (wave.length < 2) return null;

  const totalLength = wave[wave.length - 1].t;
  const currentT = progress * totalLength;

  // Find the current sample index
  let sampleIndex = 0;
  for (let i = 0; i < wave.length - 1; i++) {
    if (wave[i].t <= currentT && wave[i + 1].t > currentT) {
      sampleIndex = i;
      break;
    }
  }

  const s1 = wave[sampleIndex];
  const s2 = wave[sampleIndex + 1] || s1;

  if (!s1.pt || !s2.pt || !s1.ptProjectedOnSegment || !s2.ptProjectedOnSegment) {
    return null;
  }

  // Interpolate for smoother position
  const segmentDuration = s2.t - s1.t;
  const segmentProgress =
    segmentDuration > 0 ? (currentT - s1.t) / segmentDuration : 0;

  // Interpolate between points on the polygon
  const polyX = s1.pt.x + (s2.pt.x - s1.pt.x) * segmentProgress;
  const polyY = s1.pt.y + (s2.pt.y - s1.pt.y) * segmentProgress;

  // Interpolate between points on the simplified shape
  const projX =
    s1.ptProjectedOnSegment.x +
    (s2.ptProjectedOnSegment.x - s1.ptProjectedOnSegment.x) * segmentProgress;
  const projY =
    s1.ptProjectedOnSegment.y +
    (s2.ptProjectedOnSegment.y - s1.ptProjectedOnSegment.y) * segmentProgress;

  return {
    pt: new Point(polyX, polyY),
    ptProjected: new Point(projX, projY),
  };
}

/**
 * Handles audio synthesis for a shape.
 * Supports two modes:
 * - Waveform: AM synthesis where the shape's wave modulates a carrier tone's amplitude
 * - FM: True FM synthesis where the shape's wave modulates a carrier's frequency,
 *       with the base frequency controlled by the shape's centroid Y position
 * Syncs to the global Metronome for synchronized playback.
 */
export class ShapeAudio {
  private p: p5;
  private audioSources: (AudioBufferSourceNode | OscillatorNode)[] = [];
  private gainNode: GainNode | null = null;
  private modulator: AudioBufferSourceNode | null = null;
  private referencePerimeter: number;
  private perimeter: number;
  private lastBPM: number = 0;
  private lastSynthMode: string = '';
  private lastVisualMultiplier: number = 1;

  // FM mode specific
  private fmCarrier: OscillatorNode | null = null;
  private fmModulator: AudioBufferSourceNode | null = null;
  private fmModGain: GainNode | null = null; // Controls FM depth
  private fmGain: GainNode | null = null;
  private currentFrequency: number = 220;

  /** Loop duration in bars (1/3, 1/2, 1, 2, 3, ...) */
  loopBars: number = 1;
  wave: WaveSamplePoint[];

  constructor(p: p5, config: ShapeAudioConfig) {
    this.p = p;
    this.wave = config.wave;
    this.perimeter = config.perimeter;
    this.referencePerimeter = config.referencePerimeter ?? 1000;

    // Calculate loop duration in bars (snapped to integer ratio)
    const perimeterRatio = this.perimeter / this.referencePerimeter;
    this.loopBars = snapToIntegerRatio(perimeterRatio);
    console.log('loopBars:', this.loopBars);

    this.lastSynthMode = settings.SYNTHESIS_MODE;
    this.lastVisualMultiplier = settings.VISUAL_ANIMATION_MULTIPLIER;
    this.initAudio();
  }

  private initAudio(): void {
    // Initialize the global audio mixer
    AudioMixer.init(this.p);

    if (settings.SYNTHESIS_MODE === 'fm') {
      this.initFMAudio();
    } else {
      this.initWaveformAudio();
    }
    this.p.userStartAudio();
  }

  private initWaveformAudio(): void {
    const bufferData = generateWaveBuffer(this.wave);
    const ctx = this.p.getAudioContext() as unknown as AudioContext;
    const audioBuffer = ctx.createBuffer(1, bufferData.length, 44100);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    audioBuffer.copyToChannel(bufferData as any, 0);

    // Register with mixer and get recommended gain
    const sourceGain = AudioMixer.registerSource();
    const mixerOutput = AudioMixer.getOutput();

    // Master gain node - connects to mixer instead of destination
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = sourceGain;
    if (mixerOutput) {
      this.gainNode.connect(mixerOutput);
    } else {
      this.gainNode.connect(ctx.destination);
    }

    // AM Synthesis: Shape modulates the volume of an audible tone

    // 1. Carrier (The audible tone)
    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = 220;
    carrier.start();

    // 2. Modulator (The Shape - Rhythm)
    const modulator = ctx.createBufferSource();
    modulator.buffer = audioBuffer;
    modulator.loop = true;

    // Calculate loop duration in seconds based on bars and current BPM
    // Audio is NOT affected by VISUAL_ANIMATION_MULTIPLIER
    const barDuration = Metronome.getBarDuration();
    const loopDuration = this.loopBars * barDuration;
    this.lastBPM = settings.BPM;

    // Buffer is 1 second long, rate = 1 / duration
    modulator.playbackRate.value = 1 / loopDuration;

    // Start the buffer at the correct phase to sync with the global Metronome
    // Buffer is 1 second long, so offset = progress * 1 second
    const currentProgress = Metronome.getProgress(
      this.p.millis(),
      this.loopBars
    );
    const bufferOffset = currentProgress * 1; // 1 second buffer
    modulator.start(0, bufferOffset);
    this.modulator = modulator;

    // 3. VCA (Voltage Controlled Amplifier)
    const vca = ctx.createGain();
    vca.gain.value = 0; // Start at silence, let modulator drive amplitude

    carrier.connect(vca);
    modulator.connect(vca.gain); // Shape controls the volume (Ring Modulation)
    vca.connect(this.gainNode);

    this.audioSources.push(carrier);
    this.audioSources.push(modulator);
  }

  private initFMAudio(): void {
    const bufferData = generateWaveBuffer(this.wave);
    const ctx = this.p.getAudioContext() as unknown as AudioContext;
    const audioBuffer = ctx.createBuffer(1, bufferData.length, 44100);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    audioBuffer.copyToChannel(bufferData as any, 0);

    // Register with mixer and get recommended gain
    const sourceGain = AudioMixer.registerSource();
    const mixerOutput = AudioMixer.getOutput();

    // Master gain node - connects to mixer instead of destination
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = sourceGain;
    if (mixerOutput) {
      this.gainNode.connect(mixerOutput);
    } else {
      this.gainNode.connect(ctx.destination);
    }

    // FM Synthesis: Shape wave modulates the carrier frequency
    // The base frequency is controlled by the traveling point's Y position

    // 1. Carrier oscillator (the audible tone)
    this.fmCarrier = ctx.createOscillator();
    this.fmCarrier.type = 'sine';
    this.fmCarrier.frequency.value = this.currentFrequency;

    // 2. Modulator (the shape's wave) - this modulates the carrier's frequency
    this.fmModulator = ctx.createBufferSource();
    this.fmModulator.buffer = audioBuffer;
    this.fmModulator.loop = true;

    // Calculate loop duration - must match visual animation for sync
    const barDuration = Metronome.getBarDuration();
    const effectiveLoopBars =
      this.loopBars * settings.VISUAL_ANIMATION_MULTIPLIER;
    const loopDuration = effectiveLoopBars * barDuration;
    this.lastBPM = settings.BPM;
    this.fmModulator.playbackRate.value = 1 / loopDuration;

    // Start the buffer at the correct phase to sync with the visual animation
    const currentProgress = Metronome.getProgress(
      this.p.millis(),
      effectiveLoopBars
    );
    const bufferOffset = currentProgress * 1; // 1 second buffer
    this.fmModulator.start(0, bufferOffset);

    // 3. Modulation depth gain (controls how much the wave affects the frequency)
    // FM depth is proportional to carrier frequency for consistent modulation index
    this.fmModGain = ctx.createGain();
    this.fmModGain.gain.value = this.currentFrequency * 0.5; // Modulation depth = 50% of carrier freq

    // 4. Output gain
    this.fmGain = ctx.createGain();
    this.fmGain.gain.value = 1.0;

    // Connect: modulator -> modGain -> carrier.frequency
    this.fmModulator.connect(this.fmModGain);
    this.fmModGain.connect(this.fmCarrier.frequency);

    // Connect: carrier -> output gain -> master
    this.fmCarrier.connect(this.fmGain);
    this.fmGain.connect(this.gainNode);

    this.fmCarrier.start();

    this.audioSources.push(this.fmCarrier);
    this.audioSources.push(this.fmModulator);
  }

  /**
   * Updates the FM frequency based on centroid position.
   * Call this when the shape is dragged.
   * @deprecated Use updateFMFrequencyFromY for dynamic pitch based on traveling point
   */
  updateFMFrequency(centroid: Point | null): void {
    if (!centroid || settings.SYNTHESIS_MODE !== 'fm' || !this.fmCarrier)
      return;

    this.updateFMFrequencyFromY(centroid.y);
  }

  /**
   * Updates the FM frequency based on a Y position in world coordinates.
   * Call this each frame with the current traveling point's world Y.
   */
  updateFMFrequencyFromY(worldY: number): void {
    if (settings.SYNTHESIS_MODE !== 'fm' || !this.fmCarrier) return;

    const { freq } = getFrequencyForY(worldY);

    // Smooth frequency transition
    const ctx = this.p.getAudioContext() as unknown as AudioContext;
    this.fmCarrier.frequency.setTargetAtTime(freq, ctx.currentTime, 0.02);

    // Also update modulation depth to maintain consistent modulation index
    if (this.fmModGain) {
      this.fmModGain.gain.setTargetAtTime(freq * 0.5, ctx.currentTime, 0.02);
    }

    this.currentFrequency = freq;
  }

  /**
   * Gets the current position on the wave for the given time.
   * Returns local coordinates (before shape transformation).
   * @param currentTimeMs - should be p.millis() for sync with visuals
   */
  getCurrentWavePosition(currentTimeMs: number): CurrentWavePosition | null {
    const progress = this.getProgress(currentTimeMs);
    return getWavePositionAtProgress(this.wave, progress);
  }

  /**
   * Updates audio parameters in response to settings changes (e.g., BPM, mode, multiplier).
   * Call this every frame.
   */
  updateParams(): void {
    // Check if synthesis mode changed - need to reinitialize
    if (settings.SYNTHESIS_MODE !== this.lastSynthMode) {
      this.dispose();
      this.lastSynthMode = settings.SYNTHESIS_MODE;
      this.lastVisualMultiplier = settings.VISUAL_ANIMATION_MULTIPLIER;
      this.initAudio();
      return;
    }

    // Check if visual multiplier changed - need to reinitialize for FM mode
    if (
      settings.SYNTHESIS_MODE === 'fm' &&
      settings.VISUAL_ANIMATION_MULTIPLIER !== this.lastVisualMultiplier
    ) {
      this.dispose();
      this.lastVisualMultiplier = settings.VISUAL_ANIMATION_MULTIPLIER;
      this.initAudio();
      return;
    }

    // Update if BPM changed
    if (settings.BPM !== this.lastBPM) {
      const barDuration = Metronome.getBarDuration();

      if (settings.SYNTHESIS_MODE === 'waveform' && this.modulator) {
        const loopDuration = this.loopBars * barDuration;
        this.modulator.playbackRate.value = 1 / loopDuration;
      } else if (settings.SYNTHESIS_MODE === 'fm' && this.fmModulator) {
        const effectiveLoopBars =
          this.loopBars * settings.VISUAL_ANIMATION_MULTIPLIER;
        const loopDuration = effectiveLoopBars * barDuration;
        this.fmModulator.playbackRate.value = 1 / loopDuration;
      }

      this.lastBPM = settings.BPM;
    }
  }

  /**
   * Gets the current progress through the animation loop (0-1).
   * Uses the global Metronome for synchronized playback.
   * Returns 0 if animation is disabled (multiplier = 0).
   * Loops normally (0→1, 0→1) to stay in sync with audio.
   */
  getProgress(currentTimeMs: number): number {
    if (settings.VISUAL_ANIMATION_MULTIPLIER === 0) {
      return 0;
    }
    // Apply the multiplier to stretch the visual animation duration
    const effectiveLoopBars =
      this.loopBars * settings.VISUAL_ANIMATION_MULTIPLIER;
    return Metronome.getProgress(currentTimeMs, effectiveLoopBars);
  }

  /**
   * Gets the audio loop duration in seconds at current BPM.
   * Note: This is the audio duration, not affected by visual animation multiplier.
   */
  getLoopDuration(): number {
    return this.loopBars * Metronome.getBarDuration();
  }

  /**
   * Gets the current FM frequency (for visualization).
   */
  getCurrentFrequency(): number {
    return this.currentFrequency;
  }

  /**
   * Stops all audio sources and cleans up.
   */
  dispose(): void {
    // Unregister from mixer
    AudioMixer.unregisterSource();

    for (const source of this.audioSources) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Source may already be stopped
      }
    }
    this.audioSources = [];

    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }

    if (this.fmGain) {
      this.fmGain.disconnect();
      this.fmGain = null;
    }

    if (this.fmModGain) {
      this.fmModGain.disconnect();
      this.fmModGain = null;
    }

    this.modulator = null;
    this.fmCarrier = null;
    this.fmModulator = null;
  }
}
