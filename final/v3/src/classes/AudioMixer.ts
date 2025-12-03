import p5 from 'p5';

/**
 * Global audio mixer singleton that manages output levels
 * to prevent clipping when multiple shapes are playing.
 */
class AudioMixerSingleton {
  private masterGain: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private ctx: AudioContext | null = null;
  private activeSourceCount: number = 0;
  private initialized: boolean = false;

  /**
   * Initialize the mixer with the p5 audio context.
   * Safe to call multiple times - will only initialize once.
   */
  init(p: p5): void {
    if (this.initialized) return;

    this.ctx = p.getAudioContext() as unknown as AudioContext;

    // Create a limiter/compressor to prevent harsh clipping
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6; // Start compressing at -6dB
    this.limiter.knee.value = 6; // Soft knee for smoother compression
    this.limiter.ratio.value = 12; // High ratio for limiting
    this.limiter.attack.value = 0.003; // Fast attack
    this.limiter.release.value = 0.1; // Quick release
    this.limiter.connect(this.ctx.destination);

    // Create master gain node
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.8; // Start at 80% to leave headroom
    this.masterGain.connect(this.limiter);

    this.initialized = true;
  }

  /**
   * Get the output node that shapes should connect to.
   */
  getOutput(): AudioNode | null {
    return this.masterGain;
  }

  /**
   * Get the audio context.
   */
  getContext(): AudioContext | null {
    return this.ctx;
  }

  /**
   * Register a new audio source (call when creating a shape's audio).
   * Returns the recommended gain for this source.
   */
  registerSource(): number {
    this.activeSourceCount++;
    this.updateMasterGain();
    return this.getSourceGain();
  }

  /**
   * Unregister an audio source (call when disposing a shape's audio).
   */
  unregisterSource(): void {
    this.activeSourceCount = Math.max(0, this.activeSourceCount - 1);
    this.updateMasterGain();
  }

  /**
   * Get the recommended gain for each source based on active count.
   */
  private getSourceGain(): number {
    // Each source gets an equal share, with some headroom
    // Using 0.7 / count gives good results without clipping
    if (this.activeSourceCount <= 1) return 0.7;
    return 0.7 / Math.sqrt(this.activeSourceCount);
  }

  /**
   * Update the master gain based on number of active sources.
   */
  private updateMasterGain(): void {
    if (!this.masterGain || !this.ctx) return;

    // Adjust master gain inversely with source count
    // This provides automatic ducking as more shapes are added
    let targetGain: number;
    if (this.activeSourceCount <= 1) {
      targetGain = 0.8;
    } else if (this.activeSourceCount <= 3) {
      targetGain = 0.7;
    } else {
      // For many sources, reduce further but not too much
      targetGain = 0.6 / Math.log2(this.activeSourceCount);
    }

    // Smooth transition to prevent clicks
    this.masterGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.1);
  }

  /**
   * Get current number of active sources.
   */
  getActiveSourceCount(): number {
    return this.activeSourceCount;
  }
}

// Export singleton instance
export const AudioMixer = new AudioMixerSingleton();
