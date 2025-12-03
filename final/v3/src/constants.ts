export const GRAVITY = 1;
export const TRIANGULARITY_THRESHOLD = 0.65;

// Tip selection methods
export type TipSelectionMethod = 'smallest_angle' | 'closest_edge';
export const TIP_SELECTION_METHODS: TipSelectionMethod[] = [
  'smallest_angle',
  'closest_edge',
];

// Create a settings object for dat.gui to bind to
export const settings = {
  BPM: 120,
  TRIANGULARITY_THRESHOLD: TRIANGULARITY_THRESHOLD,
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
