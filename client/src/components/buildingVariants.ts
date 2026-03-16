// Deterministic building model variants and rotation based on tile position.
// Variant = (gx + gy) % available_models
// Rotation = face toward adjacent road, fallback (gx + gy) % 4 * 90°

import { BLOCK_SIZE, GAME_GRID } from './cityGrid';

const Y_CYCLE = 10;
const Y_BLUE = 3;

export interface ModelVariant {
  path: string;
  scale: number;
  yOffset: number;
}

export const VARIANT_MAP: Record<string, ModelVariant[]> = {
  factory: [
    { path: '/models/buildings/industrial/building-a.glb', scale: 0.5, yOffset: 0 },
    { path: '/models/buildings/industrial/building-b.glb', scale: 0.5, yOffset: 0 },
    { path: '/models/buildings/industrial/building-c.glb', scale: 0.5, yOffset: 0 },
    { path: '/models/buildings/industrial/building-e.glb', scale: 0.5, yOffset: 0 },
    { path: '/models/buildings/industrial/building-f.glb', scale: 0.5, yOffset: 0 },
  ],
  store: [
    { path: '/models/buildings/commercial/building-a.glb', scale: 0.5, yOffset: 0 },
    { path: '/models/buildings/commercial/building-b.glb', scale: 0.5, yOffset: 0 },
    { path: '/models/buildings/commercial/building-e.glb', scale: 0.5, yOffset: 0 },
    { path: '/models/buildings/commercial/building-h.glb', scale: 0.5, yOffset: 0 },
  ],
  warehouse: [
    { path: '/models/buildings/industrial/building-d.glb', scale: 0.5, yOffset: 0 },
    { path: '/models/buildings/industrial/building-g.glb', scale: 0.5, yOffset: 0 },
    { path: '/models/buildings/industrial/building-h.glb', scale: 0.5, yOffset: 0 },
    { path: '/models/buildings/industrial/building-j.glb', scale: 0.5, yOffset: 0 },
  ],
  landmark: [
    { path: '/models/buildings/commercial/building-skyscraper-a.glb', scale: 0.5, yOffset: 0 },
  ],
  bank: [
    { path: '/models/buildings/commercial/building-d.glb', scale: 0.5, yOffset: 0 },
    { path: '/models/buildings/commercial/building-k.glb', scale: 0.5, yOffset: 0 },
    { path: '/models/buildings/commercial/building-l.glb', scale: 0.5, yOffset: 0 },
  ],
  residential_low: [
    { path: '/models/buildings/suburban/building-type-a.glb', scale: 0.5, yOffset: 0 },
    { path: '/models/buildings/suburban/building-type-b.glb', scale: 0.5, yOffset: 0 },
    { path: '/models/buildings/suburban/building-type-c.glb', scale: 0.5, yOffset: 0 },
    { path: '/models/buildings/suburban/building-type-d.glb', scale: 0.5, yOffset: 0 },
    { path: '/models/buildings/suburban/building-type-e.glb', scale: 0.5, yOffset: 0 },
    { path: '/models/buildings/suburban/building-type-f.glb', scale: 0.5, yOffset: 0 },
  ],
  residential_medium: [
    { path: '/models/buildings/commercial/building-c.glb', scale: 0.5, yOffset: 0 },
    { path: '/models/buildings/commercial/building-f.glb', scale: 0.5, yOffset: 0 },
    { path: '/models/buildings/commercial/building-g.glb', scale: 0.5, yOffset: 0 },
    { path: '/models/buildings/commercial/building-i.glb', scale: 0.5, yOffset: 0 },
  ],
  residential_high: [
    { path: '/models/buildings/commercial/building-skyscraper-b.glb', scale: 0.5, yOffset: 0 },
    { path: '/models/buildings/commercial/building-skyscraper-c.glb', scale: 0.5, yOffset: 0 },
    { path: '/models/buildings/commercial/building-skyscraper-d.glb', scale: 0.5, yOffset: 0 },
    { path: '/models/buildings/commercial/building-skyscraper-e.glb', scale: 0.5, yOffset: 0 },
  ],
};

/** All unique model paths for preloading */
export const ALL_MODEL_PATHS: string[] = [
  ...new Set(Object.values(VARIANT_MAP).flat().map(v => v.path)),
];

/** Deterministic variant index: (gx + gy) % variantCount */
export function getVariantIndex(gx: number, gy: number, variantCount: number): number {
  return (gx + gy) % variantCount;
}

/** Get the model variant for a building type at tile (gx, gy) */
export function getModelVariant(type: string, gx: number, gy: number): ModelVariant | null {
  const variants = VARIANT_MAP[type];
  if (!variants || variants.length === 0) return null;
  return variants[getVariantIndex(gx, gy, variants.length)];
}

/**
 * Deterministic Y-axis rotation based on road adjacency.
 * Buildings face the nearest adjacent road.
 * Fallback: (gx + gy) % 4 * 90°
 *
 * Three.js Y-rotation convention (+Y up, right-hand rule):
 *   0      → front faces -Z (north)
 *   -π/2   → front faces +X (east)
 *   π      → front faces +Z (south)
 *   π/2    → front faces -X (west)
 */
export function getBuildingRotation(gx: number, gy: number): number {
  const posInCycle = ((gy % Y_CYCLE) + Y_CYCLE) % Y_CYCLE;
  const posInBlock = ((gx % BLOCK_SIZE) + BLOCK_SIZE) % BLOCK_SIZE;

  // South (+Z): road after Y positions 2 and 9
  if (posInCycle === Y_BLUE - 1 || (posInCycle === Y_CYCLE - 1 && gy < GAME_GRID - 1)) {
    return Math.PI;
  }
  // North (-Z): road before Y positions 3 and 0
  if (posInCycle === Y_BLUE || (posInCycle === 0 && gy > 0)) {
    return 0;
  }
  // East (+X): last tile in X block
  if (posInBlock === BLOCK_SIZE - 1 && gx < GAME_GRID - 1) {
    return -Math.PI / 2;
  }
  // West (-X): first tile in X block
  if (posInBlock === 0 && gx > 0) {
    return Math.PI / 2;
  }

  // Fallback: deterministic rotation from position
  return ((gx + gy) % 4) * (Math.PI / 2);
}
