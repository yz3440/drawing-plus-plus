import p5 from 'p5';
import { WaveSamplePoint, generateWaveBuffer } from '../util';
import { settings } from '../constants';

export interface ShapeAudioConfig {
  wave: WaveSamplePoint[];
  perimeter: number;
  referencePerimeter?: number;
}

/**
 * Handles audio synthesis for a triangle shape.
 * Uses AM synthesis where the shape's wave modulates a carrier tone.
 */
export class ShapeAudio {
  private p: p5;
  private audioSources: (AudioBufferSourceNode | OscillatorNode)[] = [];
  private gainNode: GainNode | null = null;
  private modulator: AudioBufferSourceNode | null = null;
  private referencePerimeter: number;
  private perimeter: number;

  loopDuration: number = 0;
  startTime: number = 0;
  wave: WaveSamplePoint[];

  constructor(p: p5, config: ShapeAudioConfig) {
    this.p = p;
    this.wave = config.wave;
    this.perimeter = config.perimeter;
    this.referencePerimeter = config.referencePerimeter ?? 1000;

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
    // This allows the shape to be heard as a rhythmic pattern

    // 1. Carrier (The audible tone)
    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = 220;
    carrier.start();

    // 2. Modulator (The Shape - Rhythm)
    const modulator = ctx.createBufferSource();
    modulator.buffer = audioBuffer;
    modulator.loop = true;

    // Calculate duration based on perimeter
    // 1000 pixels perimeter = 1 bar (varies with BPM)
    const barDuration = (60 / settings.BPM) * 4;
    // Snap perimeter ratio to closest power of two (0.25, 0.5, 1, 2, 4, ...)
    const perimeterRatio = this.perimeter / this.referencePerimeter;
    const snappedRatio = Math.pow(2, Math.round(Math.log2(perimeterRatio)));
    console.log('snappedRatio', snappedRatio);
    const loopDuration = snappedRatio * barDuration;
    this.loopDuration = loopDuration;
    this.startTime = this.p.millis() / 1000;

    // Buffer is 1 second long, rate = 1 / duration
    modulator.playbackRate.value = 1 / loopDuration;
    modulator.start();
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
   */
  updateParams(): void {
    if (!this.modulator || this.loopDuration <= 0) return;

    // Recalculate loop duration based on new BPM
    const barDuration = (60 / settings.BPM) * 4;
    const loopDuration =
      (this.perimeter / this.referencePerimeter) * barDuration;

    this.loopDuration = loopDuration;
    this.modulator.playbackRate.value = 1 / loopDuration;
  }

  /**
   * Gets the current progress through the loop (0-1).
   */
  getProgress(currentTimeMs: number): number {
    if (this.loopDuration <= 0) return 0;
    const currentTime = currentTimeMs / 1000;
    const elapsedTime = currentTime - this.startTime;
    return (elapsedTime % this.loopDuration) / this.loopDuration;
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
