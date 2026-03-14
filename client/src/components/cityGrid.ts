// Shared constants and coordinate mapping for the 3D city grid.
// Game tiles are arranged in blocks with road gaps between them.

export const GAME_GRID = 120;       // 120×120 game tiles
export const BLOCK_SIZE = 5;        // tiles per city block
export const ROAD_WIDTH = 1;        // road occupies 1 unit between blocks
export const BLOCKS_PER_AXIS = GAME_GRID / BLOCK_SIZE; // 24

// Total visual world size: 120 tiles + 23 road gaps = 143
export const WORLD_SIZE = GAME_GRID + (BLOCKS_PER_AXIS - 1) * ROAD_WIDTH;

// Convert game grid position → world (visual) position
export function tileToWorld(gx: number, gy: number): [number, number] {
  const wx = gx + Math.floor(gx / BLOCK_SIZE) * ROAD_WIDTH;
  const wz = gy + Math.floor(gy / BLOCK_SIZE) * ROAD_WIDTH;
  return [wx, wz];
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

  // Road strip positions along each axis
  const roadStrips: number[] = [];
  for (let block = 0; block < BLOCKS_PER_AXIS - 1; block++) {
    roadStrips.push((block + 1) * BLOCK_SIZE + block * ROAD_WIDTH);
  }
  const roadStripSet = new Set(roadStrips);

  for (const rz of roadStrips) {
    for (let wx = 0; wx < WORLD_SIZE; wx++) {
      if (roadStripSet.has(wx)) {
        crossroads.push({ x: wx, z: rz, rotation: 0 });
      } else {
        straights.push({ x: wx, z: rz, rotation: 0 }); // horizontal
      }
    }
  }

  for (const rx of roadStrips) {
    for (let wz = 0; wz < WORLD_SIZE; wz++) {
      if (roadStripSet.has(wz)) continue; // already placed as crossroad
      straights.push({ x: rx, z: wz, rotation: Math.PI / 2 }); // vertical
    }
  }

  return { straights, crossroads };
}
