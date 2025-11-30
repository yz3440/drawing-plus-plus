import p5 from 'p5';
import { WaveSamplePoint, generateWaveBuffer } from '../util';
import { settings } from '../constants';
import { Metronome } from './Metronome';

export interface ShapeAudioConfig {
  wave: WaveSamplePoint[];
  perimeter: number;
  referencePerimeter?: number;
}

/**
 * Handles audio synthesis for a triangle shape.
 * Uses AM synthesis where the shape's wave modulates a carrier tone.
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

  /** Loop duration in bars (power of two: 0.25, 0.5, 1, 2, 4, ...) */
  loopBars: number = 1;
  wave: WaveSamplePoint[];

  constructor(p: p5, config: ShapeAudioConfig) {
    this.p = p;
    this.wave = config.wave;
    this.perimeter = config.perimeter;
    this.referencePerimeter = config.referencePerimeter ?? 1000;

    // Calculate loop duration in bars (snapped to power of two)
    const perimeterRatio = this.perimeter / this.referencePerimeter;
    this.loopBars = Math.pow(2, Math.round(Math.log2(perimeterRatio)));
    console.log('loopBars (power of 2):', this.loopBars);

    this.initAudio();
  }

  private initAudio(): void {
    const bufferData = generateWaveBuffer(this.wave);
    const ctx = this.p.getAudioContext() as unknown as AudioContext;
    const audioBuffer = ctx.createBuffer(1, bufferData.length, 44100);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    audioBuffer.copyToChannel(bufferData as any, 0);

    // Master gain node
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = 1.0;
    this.gainNode.connect(ctx.destination);

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

    this.p.userStartAudio();
  }

  /**
   * Updates audio parameters in response to settings changes (e.g., BPM).
   * Call this every frame.
   */
  updateParams(): void {
    if (!this.modulator) return;

    // Only update if BPM changed
    if (settings.BPM !== this.lastBPM) {
      const barDuration = Metronome.getBarDuration();
      const loopDuration = this.loopBars * barDuration;
      this.modulator.playbackRate.value = 1 / loopDuration;
      this.lastBPM = settings.BPM;
    }
  }

  /**
   * Gets the current progress through the loop (0-1).
   * Uses the global Metronome for synchronized playback.
   */
  getProgress(currentTimeMs: number): number {
    return Metronome.getProgress(currentTimeMs, this.loopBars);
  }

  /**
   * Gets the loop duration in seconds at current BPM.
   */
  getLoopDuration(): number {
    return this.loopBars * Metronome.getBarDuration();
  }

  /**
   * Stops all audio sources and cleans up.
   */
  dispose(): void {
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

    this.modulator = null;
  }
}
