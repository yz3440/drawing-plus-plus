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

// Create a settings object for dat.gui to bind to
export const settings = {
  BPM: 120,
  AREA_RATIO_THRESHOLD: AREA_RATIO_THRESHOLD,
  TIP_SELECTION_METHOD: 'closest_edge' as TipSelectionMethod,
  AUTO_CLOSE_PATH: true,
  AREA_CALCULATION_METHOD: 'original_polygon' as AreaCalculationMethod,
};

// Dynamic canvas dimensions (will be set by main.ts)
export let canvasWidth = window.innerWidth;
export let canvasHeight = window.innerHeight;

export function updateCanvasDimensions(width: number, height: number): void {
  canvasWidth = width;
  canvasHeight = height;
}
