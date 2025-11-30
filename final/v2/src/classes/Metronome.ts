import { settings } from '../constants';

/**
 * Global metronome that provides a synchronized musical clock.
 * All shapes sync their loops to this clock to stay in phase.
 *
 * Time is tracked in "bars" (4 beats). When BPM changes, the bar position
 * is preserved so all shapes maintain their relative phase.
 */
class MetronomeClass {
  private accumulatedBars: number = 0;
  private lastUpdateTimeMs: number = 0;
  private lastBPM: number = 0;
  private isRunning: boolean = false;

  /**
   * Starts or resets the metronome. Should be called once when the app starts.
   */
  start(currentTimeMs: number): void {
    this.lastUpdateTimeMs = currentTimeMs;
    this.lastBPM = settings.BPM;
    this.accumulatedBars = 0;
    this.isRunning = true;
  }

  /**
   * Updates the metronome. Call this every frame.
   * Handles BPM changes by accumulating bars at the old BPM before switching.
   */
  update(currentTimeMs: number): void {
    if (!this.isRunning) {
      this.start(currentTimeMs);
      return;
    }

    // Check if BPM changed
    if (settings.BPM !== this.lastBPM) {
      // Accumulate bars at the old BPM before switching
      const elapsedSinceLastUpdate =
        (currentTimeMs - this.lastUpdateTimeMs) / 1000;
      const barDurationAtOldBPM = (60 / this.lastBPM) * 4;
      this.accumulatedBars += elapsedSinceLastUpdate / barDurationAtOldBPM;

      // Reset timing reference for new BPM
      this.lastUpdateTimeMs = currentTimeMs;
      this.lastBPM = settings.BPM;
    }
  }

  /**
   * Gets the current position in bars (fractional).
   * This is the global musical position that all shapes sync to.
   */
  getBars(currentTimeMs: number): number {
    if (!this.isRunning) return 0;

    const elapsedSinceLastUpdate =
      (currentTimeMs - this.lastUpdateTimeMs) / 1000;
    const barDuration = (60 / settings.BPM) * 4;
    const barsSinceLastUpdate = elapsedSinceLastUpdate / barDuration;

    return this.accumulatedBars + barsSinceLastUpdate;
  }

  /**
   * Gets the progress (0-1) for a loop of the given duration in bars.
   * All shapes with the same loopBars will be perfectly in sync.
   */
  getProgress(currentTimeMs: number, loopBars: number): number {
    if (loopBars <= 0) return 0;
    const bars = this.getBars(currentTimeMs);
    return (bars % loopBars) / loopBars;
  }

  /**
   * Gets the current bar duration in seconds (based on BPM).
   */
  getBarDuration(): number {
    return (60 / settings.BPM) * 4;
  }

  /**
   * Returns whether the metronome is running.
   */
  get running(): boolean {
    return this.isRunning;
  }
}

// Singleton instance
export const Metronome = new MetronomeClass();
