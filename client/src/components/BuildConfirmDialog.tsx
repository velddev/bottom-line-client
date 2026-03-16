import { useState } from 'react';
import Modal, { Field, Input } from './Modal';
import { BUILDING_ICONS, fmtMoney } from '../types';
import type { TileInfo } from '../types';
import type { BuildingCategory } from '../utils/tilePlacement';
import { CONSTRUCTION_TICKS } from '../utils/tilePlacement';

interface Props {
  tile: TileInfo;
  buildingType: BuildingCategory;
  myPlayerId: string;
  isPending: boolean;
  error: string | null;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

export default function BuildConfirmDialog({
  tile,
  buildingType,
  myPlayerId,
  isPending,
  error,
  onConfirm,
  onCancel,
}: Props) {
  const [name, setName] = useState('');

  const needsPurchase = tile.owner_player_id !== myPlayerId;
  const constructionDays = CONSTRUCTION_TICKS[buildingType] ?? 5;
  const icon = BUILDING_ICONS[buildingType] ?? '🏢';
  const typeLabel = buildingType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <Modal
      title={`${icon} Build ${typeLabel}`}
      onClose={onCancel}
      onSubmit={() => onConfirm(name.trim())}
      submitLabel={isPending ? 'Building…' : 'Confirm'}
      submitDisabled={isPending || !name.trim()}
    >
      <div className="space-y-3">
        {/* Location info */}
        <div className="bg-gray-100 rounded-lg p-3 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-gray-600">Location</span>
            <span className="text-gray-900">Tile ({tile.grid_x}, {tile.grid_y})</span>
          </div>

          {needsPurchase && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-600">Land cost</span>
              <span className="text-cyan-400 font-semibold">{fmtMoney(tile.purchase_price)}</span>
            </div>
          )}

          {!needsPurchase && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-600">Land cost</span>
              <span className="text-emerald-400 font-semibold">Owned ✓</span>
            </div>
          )}

          <div className="flex justify-between text-xs">
            <span className="text-gray-600">Construction</span>
            <span className="text-gray-900">{constructionDays} day{constructionDays !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Name input */}
        <Field label="Building name">
          <Input
            placeholder={`My ${typeLabel}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>

        {error && (
          <p className="text-rose-500 text-xs">{error}</p>
        )}
      </div>
    </Modal>
  );
}
