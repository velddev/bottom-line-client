import type { TileInfo } from '../types';

const GOVERNMENT_ID = '00000000-0000-0000-0000-000000000001';

// Y-cycle layout: 10-tile cycles → 3 for-sale (blue) + 7 government (green)
const Y_CYCLE = 10;
const Y_BLUE = 3;

function isResidentialTile(tile: TileInfo): boolean {
  const t = tile.building_type?.toLowerCase() ?? '';
  return t.startsWith('residential');
}

function distanceSq(ax: number, ay: number, bx: number, by: number): number {
  return (ax - bx) ** 2 + (ay - by) ** 2;
}

// Compute the nearest government (green) row distance for a given grid Y
function nearestGovDistance(gy: number): number {
  const posInCycle = gy % Y_CYCLE;
  // Green rows are at positions 3..9 within each cycle
  if (posInCycle >= Y_BLUE) return 0; // already in green section
  return Y_BLUE - posInCycle;
}

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
  score: number;
}

/**
 * Score a tile for a given building type.
 * Higher score = better placement.
 */
function scoreTile(
  tile: TileInfo,
  buildingType: BuildingCategory,
  allTiles: Map<string, TileInfo>,
  myPlayerId: string,
): number {
  const isOwnedEmpty = tile.owner_player_id === myPlayerId && !tile.building_id;
  const isForSale = tile.is_for_sale && tile.owner_player_id !== myPlayerId;
  if (!isOwnedEmpty && !isForSale) return -1;
  if (tile.building_id) return -1;

  let score = 50;

  let residentialProximity = 0;
  let sameTypeCount = 0;
  const SCAN_RANGE = 15;

  for (const other of allTiles.values()) {
    const d2 = distanceSq(tile.grid_x, tile.grid_y, other.grid_x, other.grid_y);
    if (d2 > SCAN_RANGE * SCAN_RANGE) continue;

    if (isResidentialTile(other) || (other.owner_player_id === GOVERNMENT_ID && other.building_type)) {
      const popWeight = other.population_capacity > 0 ? other.population_capacity : 1;
      const dist = Math.sqrt(d2);
      if (dist > 0) {
        residentialProximity += popWeight / dist;
      }
    }

    if (other.building_type?.toLowerCase() === buildingType && d2 > 0 && d2 < 25) {
      sameTypeCount++;
    }
  }

  const govDist = nearestGovDistance(tile.grid_y);

  switch (buildingType) {
    case 'store':
      score += residentialProximity * 10;
      score -= govDist * 3;
      score -= sameTypeCount * 5;
      break;

    case 'field':
    case 'factory':
      score += govDist * 5;
      score -= residentialProximity * 2;
      score -= sameTypeCount * 2;
      score += Math.sqrt(distanceSq(tile.grid_x, tile.grid_y, 60, 60)) * 0.3;
      break;

    case 'warehouse':
      for (const other of allTiles.values()) {
        const d2 = distanceSq(tile.grid_x, tile.grid_y, other.grid_x, other.grid_y);
        if (d2 > SCAN_RANGE * SCAN_RANGE || d2 === 0) continue;
        const otherType = other.building_type?.toLowerCase() ?? '';
        if (otherType === 'factory' || otherType === 'field') {
          score += 5 / Math.sqrt(d2);
        }
      }
      score -= sameTypeCount * 3;
      break;

    case 'residential_low':
    case 'residential_medium':
    case 'residential_high':
      score += residentialProximity * 5;
      score -= govDist * 2;
      break;
  }

  if (tile.owner_player_id === myPlayerId) {
    score += 10; // Bonus for already-owned tiles
  }

  return Math.max(0, score);
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
  const scored: TilePlacementScore[] = [];

  for (const tile of allTiles.values()) {
    const s = scoreTile(tile, buildingType, allTiles, myPlayerId);
    if (s > 0) {
      scored.push({ tile, score: s });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
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
