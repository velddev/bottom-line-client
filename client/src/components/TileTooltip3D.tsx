import { Html } from '@react-three/drei';
import type { TileInfo } from '../types';
import { BUILDING_ICONS, fmtMoney } from '../types';
import { tileToWorld } from './cityGrid';

interface TileTooltip3DProps {
  hoveredTile: TileInfo | null;
  selectedTile: TileInfo | null;
}

export default function TileTooltip3D({ hoveredTile, selectedTile }: TileTooltip3DProps) {
  const tile = hoveredTile;
  if (!tile || tile.tile_id === selectedTile?.tile_id) return null;

  const [wx, wz] = tileToWorld(tile.grid_x, tile.grid_y);
  const x = wx + 0.5;
  const z = wz + 0.5;
  const y = tile.building_id ? 1.5 : 0.5;

  const icon = tile.building_type
    ? BUILDING_ICONS[tile.building_type.toLowerCase()] ?? '🏢'
    : null;

  return (
    <Html
      position={[x, y, z]}
      center
      distanceFactor={undefined}
      style={{ pointerEvents: 'none' }}
    >
      <div className="bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg px-3 py-2 shadow-xl text-xs whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          {icon && <span className="text-sm">{icon}</span>}
          <span className="text-white font-semibold">
            {tile.building_name || `(${tile.grid_x}, ${tile.grid_y})`}
          </span>
        </div>
        {tile.owner_name && (
          <p className="text-gray-400 mt-0.5">{tile.owner_name}</p>
        )}
        {tile.is_for_sale && (
          <p className="text-cyan-400 mt-0.5">{fmtMoney(tile.purchase_price)}</p>
        )}
      </div>
    </Html>
  );
}
