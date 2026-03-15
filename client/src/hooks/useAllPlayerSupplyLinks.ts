import { useQueries } from '@tanstack/react-query';
import { getSupplyLinks } from '../api';
import type { BuildingStatus } from '../types';

export interface SupplyRoute {
  id: string;
  fromX: number; // supplier grid X
  fromY: number; // supplier grid Y
  toX: number;   // consumer grid X
  toY: number;   // consumer grid Y
  resourceType: string;
}

/** Returns supply routes for all placed player buildings, fetched in parallel. */
export function useAllPlayerSupplyLinks(buildings: BuildingStatus[]): SupplyRoute[] {
  const placed = buildings.filter(b => !!b.tile_id);

  const results = useQueries({
    queries: placed.map(b => ({
      queryKey: ['supply-links', b.building_id],
      queryFn: () => getSupplyLinks(b.building_id),
      staleTime: 60_000,
    })),
  });

  const routes: SupplyRoute[] = [];
  placed.forEach((building, i) => {
    const links = results[i]?.data?.links;
    if (!links) return;
    for (const link of links) {
      if (!link.supplier_tile_x && !link.supplier_tile_y) continue;
      if (
        link.supplier_tile_x === building.tile_grid_x &&
        link.supplier_tile_y === building.tile_grid_y
      ) continue; // same tile, skip
      routes.push({
        id: link.supply_link_id,
        fromX: link.supplier_tile_x,
        fromY: link.supplier_tile_y,
        toX: building.tile_grid_x,
        toY: building.tile_grid_y,
        resourceType: link.resource_type,
      });
    }
  });

  return routes;
}
