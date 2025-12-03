export const GRAVITY = 1;
export const AREA_RATIO_THRESHOLD = 0.9; // Default threshold for area preservation
export const MIN_POLYGON_AREA = 500; // Minimum area for a polygon to be considered valid (to ignore tiny loops)

// Tip selection methods
export type TipSelectionMethod = 'smallest_angle' | 'closest_edge';
export const TIP_SELECTION_METHODS: TipSelectionMethod[] = [
  'smallest_angle',
  'closest_edge',
];

export type AreaCalculationMethod = 'convex_hull' | 'original_polygon';
export const AREA_CALCULATION_METHODS: AreaCalculationMethod[] = [
  'convex_hull',
  'original_polygon',
];

// Synthesis modes
export type SynthesisMode = 'waveform' | 'fm';
export const SYNTHESIS_MODES: SynthesisMode[] = ['waveform', 'fm'];

// Musical notes for FM mode (pentatonic scale for pleasant sounds)
export const FM_NOTES = [
  { name: 'C3', freq: 130.81 },
  { name: 'D3', freq: 146.83 },
  { name: 'E3', freq: 164.81 },
  { name: 'G3', freq: 196.0 },
  { name: 'A3', freq: 220.0 },
  { name: 'C4', freq: 261.63 },
  { name: 'D4', freq: 293.66 },
  { name: 'E4', freq: 329.63 },
  { name: 'G4', freq: 392.0 },
  { name: 'A4', freq: 440.0 },
  { name: 'C5', freq: 523.25 },
  { name: 'D5', freq: 587.33 },
];

// Create a settings object for dat.gui to bind to
export const settings = {
  BPM: 120,
  AREA_RATIO_THRESHOLD: AREA_RATIO_THRESHOLD,
  TIP_SELECTION_METHOD: 'closest_edge' as TipSelectionMethod,
  AUTO_CLOSE_PATH: true,
  AREA_CALCULATION_METHOD: 'original_polygon' as AreaCalculationMethod,
  // Synthesis mode settings
  SYNTHESIS_MODE: 'fm' as SynthesisMode,
  FM_NUM_LINES: 8, // Number of frequency lines in FM mode
  VISUAL_ANIMATION_MULTIPLIER: 2, // Multiplier for visual animation duration (does not affect audio)
};

// Dynamic canvas dimensions (will be set by main.ts)
export let canvasWidth = window.innerWidth;
export let canvasHeight = window.innerHeight;

export function updateCanvasDimensions(width: number, height: number): void {
  canvasWidth = width;
  canvasHeight = height;
}
