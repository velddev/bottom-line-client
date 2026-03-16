import type { TileInfo } from '../types';

const GOVERNMENT_ID = '00000000-0000-0000-0000-000000000001';

export type BuildingCategory = 'store' | 'field' | 'factory' | 'warehouse'
  | 'residential_low' | 'residential_medium' | 'residential_high';

// Construction durations (must match server ConstructionTicks)
export const CONSTRUCTION_TICKS: Record<string, number> = {
  field: 3,
  factory: 10,
  store: 5,
  warehouse: 7,
  residential_low: 2,
  residential_medium: 5,
  residential_high: 10,
};

export interface TilePlacementScore {
  tile: TileInfo;
  score: number;       // raw score
  normalized: number;  // 0..1 normalized (0 = worst, 1 = best)
}

// ── Scoring algorithm (mirrors backend TileMarketValueService) ──────────────

const PROXIMITY_RADIUS = 16;

function euclidean(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

/**
 * Compute a suitability score for placing `buildingType` on a tile.
 * Uses the same proximity/decay logic as the server's TileMarketValueService:
 *   decay = 1 - distance/16 (linear, capped at 16 tiles)
 *
 * Building-specific weights:
 *   Store:   +100 landmark, +30 residential, +10 store, -20 field/factory
 *   Factory: -50 landmark, -20 residential, +15 factory (cluster), -10 store
 *   Field:   -50 landmark, -20 residential, +10 field (cluster), -10 store
 */
function computeSuitability(
  gx: number,
  gy: number,
  buildingType: BuildingCategory,
  allTiles: Map<string, TileInfo>,
): number {
  let score = 0;

  for (const t of allTiles.values()) {
    if (!t.building_type) continue;
    const dist = euclidean(gx, gy, t.grid_x, t.grid_y);
    if (dist > PROXIMITY_RADIUS || dist < 0.001) continue;

    const decay = 1 - dist / PROXIMITY_RADIUS;
    const bt = t.building_type.toLowerCase();
    const isLandmark = bt === 'landmark';
    const isResidential = bt.startsWith('residential');
    const isStore = bt === 'store';
    const isField = bt === 'field';
    const isFactory = bt === 'factory';

    const popFactor = t.population_capacity > 0
      ? Math.min(t.population_capacity / 25, 5) // normalize: 25 pop = 1x, cap at 5x
      : 1;

    switch (buildingType) {
      case 'store':
        // Stores thrive near people and landmarks
        if (isLandmark)     score += 100 * decay;
        if (isResidential)  score += 30 * decay * popFactor;
        if (isStore)        score += 10 * decay;  // stores benefit from clustering (foot traffic)
        if (isField || isFactory) score -= 20 * decay;
        break;

      case 'factory':
        // Factories prefer industrial zones, away from residential
        if (isLandmark)     score -= 50 * decay;
        if (isResidential)  score -= 20 * decay * popFactor;
        if (isFactory)      score += 15 * decay;  // industrial clustering
        if (isStore)        score -= 10 * decay;
        if (isField)        score += 10 * decay;  // near raw materials
        break;

      case 'field':
        // Fields prefer rural areas
        if (isLandmark)     score -= 50 * decay;
        if (isResidential)  score -= 20 * decay * popFactor;
        if (isField)        score += 10 * decay;  // farming cluster
        if (isFactory)      score += 5 * decay;   // near processing
        if (isStore)        score -= 10 * decay;
        break;

      case 'warehouse':
        // Warehouses near production
        if (isFactory || isField) score += 20 * decay;
        if (isStore)        score += 5 * decay;
        break;

      case 'residential_low':
      case 'residential_medium':
      case 'residential_high':
        // Same as server: +100 landmark, -30 field/factory, +20 store
        if (isLandmark)     score += 100 * decay;
        if (isField || isFactory) score -= 30 * decay;
        if (isStore)        score += 20 * decay;
        break;
    }
  }

  return score;
}

/**
 * Compute suitability scores for all buildable tiles.
 * Returns scores with normalized 0..1 values for heatmap coloring.
 */
export function computeHeatmap(
  buildingType: BuildingCategory,
  allTiles: Map<string, TileInfo>,
  myPlayerId: string,
): TilePlacementScore[] {
  const scores: TilePlacementScore[] = [];

  for (const tile of allTiles.values()) {
    if (!canBuildOnTile(tile, myPlayerId)) continue;

    const s = computeSuitability(tile.grid_x, tile.grid_y, buildingType, allTiles);
    scores.push({ tile, score: s, normalized: 0 });
  }

  if (scores.length === 0) return scores;

  // Normalize to 0..1
  let minScore = Infinity, maxScore = -Infinity;
  for (const s of scores) {
    if (s.score < minScore) minScore = s.score;
    if (s.score > maxScore) maxScore = s.score;
  }
  const range = maxScore - minScore;
  if (range > 0) {
    for (const s of scores) {
      s.normalized = (s.score - minScore) / range;
    }
  } else {
    for (const s of scores) s.normalized = 0.5;
  }

  return scores;
}

/**
 * Get the top N recommended tiles for a building type.
 */
export function getRecommendedTiles(
  buildingType: BuildingCategory,
  allTiles: Map<string, TileInfo>,
  myPlayerId: string,
  topN = 5,
): TilePlacementScore[] {
  const all = computeHeatmap(buildingType, allTiles, myPlayerId);
  all.sort((a, b) => b.score - a.score);
  return all.slice(0, topN);
}

/**
 * Check whether a tile is valid for building placement.
 */
export function canBuildOnTile(tile: TileInfo, myPlayerId: string): boolean {
  if (tile.building_id) return false;
  if (tile.owner_player_id === myPlayerId) return true;
  if (tile.is_for_sale) return true;
  return false;
}
