export const GRAVITY = 1;
export const AREA_RATIO_THRESHOLD = 0.9; // Default threshold for area preservation

// Tip selection methods
export type TipSelectionMethod = 'smallest_angle' | 'closest_edge';
export const TIP_SELECTION_METHODS: TipSelectionMethod[] = [
  'smallest_angle',
  'closest_edge',
];

// Create a settings object for dat.gui to bind to
export const settings = {
  BPM: 120,
  AREA_RATIO_THRESHOLD: AREA_RATIO_THRESHOLD,
  TIP_SELECTION_METHOD: 'closest_edge' as TipSelectionMethod,
  AUTO_CLOSE_PATH: true,
};

// Dynamic canvas dimensions (will be set by main.ts)
export let canvasWidth = window.innerWidth;
export let canvasHeight = window.innerHeight;

export function updateCanvasDimensions(width: number, height: number): void {
  canvasWidth = width;
  canvasHeight = height;
}
