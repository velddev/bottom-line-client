// Shared constants and coordinate mapping for the 3D city grid.
//
// X direction: 5-tile blocks with 1-wide road gaps (unchanged).
// Y direction: 10-tile cycles — 3 for-sale tiles then 7 government tiles,
//   with 1-wide roads between the blue and green sections.
//   Pattern: [3 blue] [road] [7 green] [road] repeat.

export const GAME_GRID = 120;       // 120×120 game tiles
export const BLOCK_SIZE = 5;        // X: tiles per city block
export const ROAD_WIDTH = 1;        // road width (always 1)
export const BLOCKS_PER_AXIS = GAME_GRID / BLOCK_SIZE; // 24
export const RENDER_CHUNK = 20;     // tiles per render chunk axis
export const CHUNKS_PER_AXIS = GAME_GRID / RENDER_CHUNK; // 6

// Y cycle: 10 game tiles → 3 for-sale + 7 government
const Y_CYCLE = 10;
const Y_BLUE = 3; // for-sale tiles per Y cycle
const Y_CYCLES = GAME_GRID / Y_CYCLE; // 12

// World size: 120 tiles + 23 roads = 143 (same in both axes)
export const WORLD_SIZE = GAME_GRID + (BLOCKS_PER_AXIS - 1) * ROAD_WIDTH;

// Convert game grid position → world (visual) position
export function tileToWorld(gx: number, gy: number): [number, number] {
  // X: blocks of 5 with 1-wide road gaps
  const wx = gx + Math.floor(gx / BLOCK_SIZE) * ROAD_WIDTH;

  // Y: 10-tile cycles with roads after tile 2 and tile 9
  const cycleIdx = Math.floor(gy / Y_CYCLE);
  const posInCycle = gy % Y_CYCLE;
  const roadsBefore = cycleIdx * 2 + (posInCycle >= Y_BLUE ? 1 : 0);
  const wz = gy + roadsBefore;

  return [wx, wz];
}

// Convert world (visual) position → game grid position (inverse of tileToWorld)
export function worldToTile(wx: number, wz: number): [number, number] {
  // X: blocks of 6 world units (5 tiles + 1 road)
  const blockX = Math.floor(wx / (BLOCK_SIZE + ROAD_WIDTH));
  const posInBlockX = wx - blockX * (BLOCK_SIZE + ROAD_WIDTH);
  const gx = Math.min(GAME_GRID - 1, Math.max(0,
    blockX * BLOCK_SIZE + Math.min(posInBlockX, BLOCK_SIZE - 1)));

  // Y: 12 world-unit cycles (10 tiles + 2 roads)
  const worldCycle = Y_CYCLE + 2; // 12
  const cycleY = Math.floor(wz / worldCycle);
  const posInCycleY = wz - cycleY * worldCycle;
  let gy: number;
  if (posInCycleY < Y_BLUE) {
    gy = cycleY * Y_CYCLE + posInCycleY;
  } else if (posInCycleY === Y_BLUE) {
    // Road after blue section
    gy = cycleY * Y_CYCLE + Y_BLUE - 1;
  } else if (posInCycleY <= Y_BLUE + 1 + (Y_CYCLE - Y_BLUE) - 1) {
    gy = cycleY * Y_CYCLE + Y_BLUE + (posInCycleY - Y_BLUE - 1);
  } else {
    // Road between cycles
    gy = cycleY * Y_CYCLE + Y_CYCLE - 1;
  }
  gy = Math.min(GAME_GRID - 1, Math.max(0, Math.round(gy)));

  return [gx, gy];
}
function getXRoadStrips(): number[] {
  const strips: number[] = [];
  for (let block = 0; block < BLOCKS_PER_AXIS - 1; block++) {
    strips.push((block + 1) * BLOCK_SIZE + block * ROAD_WIDTH);
  }
  return strips;
}

function getYRoadStrips(): number[] {
  const strips: number[] = [];
  for (let cycle = 0; cycle < Y_CYCLES; cycle++) {
    // Road after 3 blue tiles
    strips.push(cycle * (Y_CYCLE + 2) + Y_BLUE);
    // Road after 7 green tiles (between cycles, not after last cycle)
    if (cycle < Y_CYCLES - 1) {
      strips.push(cycle * (Y_CYCLE + 2) + Y_CYCLE + 1);
    }
  }
  return strips;
}

// Get road placements classified by type for instanced rendering.
export interface RoadPlacement {
  x: number;
  z: number;
  rotation: number;
}

export function computeRoadPlacements(): {
  straights: RoadPlacement[];
  crossroads: RoadPlacement[];
} {
  const straights: RoadPlacement[] = [];
  const crossroads: RoadPlacement[] = [];

  const xRoads = getXRoadStrips();
  const yRoads = getYRoadStrips();
  const xSet = new Set(xRoads);
  const ySet = new Set(yRoads);

  // Horizontal roads (along X at fixed Z positions)
  for (const rz of yRoads) {
    for (let wx = 0; wx < WORLD_SIZE; wx++) {
      if (xSet.has(wx)) {
        crossroads.push({ x: wx, z: rz, rotation: 0 });
      } else {
        straights.push({ x: wx, z: rz, rotation: 0 });
      }
    }
  }

  // Vertical roads (along Z at fixed X positions)
  for (const rx of xRoads) {
    for (let wz = 0; wz < WORLD_SIZE; wz++) {
      if (ySet.has(wz)) continue; // already placed as crossroad
      straights.push({ x: rx, z: wz, rotation: Math.PI / 2 });
    }
  }

  return { straights, crossroads };
}

/** Split a full tiles Map into chunk-keyed sub-arrays by grid position. */
export function splitTilesIntoChunks(
  tiles: Map<string, import('../types').TileInfo>,
): Map<string, import('../types').TileInfo[]> {
  const chunks = new Map<string, import('../types').TileInfo[]>();
  for (const tile of tiles.values()) {
    const cx = Math.floor(tile.grid_x / RENDER_CHUNK);
    const cy = Math.floor(tile.grid_y / RENDER_CHUNK);
    const key = `${cx}_${cy}`;
    let arr = chunks.get(key);
    if (!arr) { arr = []; chunks.set(key, arr); }
    arr.push(tile);
  }
  return chunks;
}
