export const CANVAS_WIDTH = 1200;
export const CANVAS_HEIGHT = 800;
export const GRAVITY = 1;
export const TRIANGULARITY_THRESHOLD = 0.5;

// Create a settings object for dat.gui to bind to
export const settings = {
  BPM: 120,
  TRIANGULARITY_THRESHOLD: TRIANGULARITY_THRESHOLD,
};

// Export BPM as a getter/setter to maintain backward compatibility if needed,
// or just use settings.BPM directly in new code.
// For existing code that imports BPM, we can leave this but we should probably refactor to use settings object
// so updates are reflected.
// However, standard exports are read-only bindings in ESM.
// So code must import `settings` to see changes.
export const BPM = 120;
