import { useQuery } from '@tanstack/react-query';
import {
  getBuilding, listRecipes, getBuyOrders, getBuildingOfferings,
  getUtilities, getInventory,
} from '../api';
import type { RecipeInfo, BuyOrderInfo, Offering } from '../types';
import { Spinner } from './ui';
import {
  ElectricityUtilityRow,
  WaterUtilityRow,
  AutoSellOfferingRow,
  StoreResourceCard,
  IngredientBuyRow,
  RecipePicker,
  StoreAnalyticsPanel,
} from './orders';

const CONSUMER_GOODS = ['food', 'meat', 'leather'];

// ── Main BuyOrderSection component ────────────────────────────────────────────
export default function BuyOrderSection({
  buildingId,
  buildingType,
  cityId,
}: {
  buildingId: string;
  buildingType: string;
  cityId: string;
}) {
  const { data: bldg } = useQuery({
    queryKey: ['building', buildingId],
    queryFn: () => getBuilding(buildingId),
  });

  const { data: recipesResp } = useQuery({
    queryKey: ['recipes', buildingType],
    queryFn: () => listRecipes(buildingType),
    enabled: !!buildingType,
    staleTime: 300_000,
  });

  const { data: buyOrdersResp } = useQuery({
    queryKey: ['buy-orders', buildingId],
    queryFn: () => getBuyOrders(buildingId),
    staleTime: 30_000,
  });

  const { data: inventoryResp } = useQuery({
    queryKey: ['inventory', buildingId],
    queryFn: () => getInventory(buildingId),
    staleTime: 30_000,
  });

  const orders: BuyOrderInfo[] = buyOrdersResp?.orders ?? [];

  // Build stock map: resource_type → total quantity in this building
  const stockMap: Record<string, number> = {};
  for (const item of inventoryResp?.items ?? []) {
    stockMap[item.resource_type] = (stockMap[item.resource_type] ?? 0) + item.quantity;
  }

  const { data: utilitiesData } = useQuery({
    queryKey: ['utilities', cityId],
    queryFn: () => getUtilities(cityId),
    staleTime: 60_000,
  });
  const electricityRateCents = utilitiesData?.utilities?.find(
    (u: { name: string }) => u.name.toLowerCase() === 'electricity'
  )?.rate_cents ?? null;

  const { data: offeringsResp } = useQuery({
    queryKey: ['building-offerings', buildingId],
    queryFn: () => getBuildingOfferings(buildingId),
    staleTime: 30_000,
  });

  const existingOfferings: Offering[] = offeringsResp?.offerings ?? [];

  if (!bldg) {
    return (
      <div className="flex items-center gap-2 text-gray-500 text-xs">
        <Spinner size="sm" /> Loading…
      </div>
    );
  }

  // Stores: combined buy + sell per consumer good
  if (buildingType === 'store') {
    const ordersByResource = Object.fromEntries(
      orders.map(o => [o.resource_type, o]),
    );
    const offeringsByResource = Object.fromEntries(
      existingOfferings.map(o => [o.resource_type, o]),
    );

    return (
      <div>
        <ElectricityUtilityRow buildingType={buildingType} electricityRateCents={electricityRateCents} />

        <p className="text-[10px] uppercase tracking-wider text-gray-600 font-semibold mb-1">
          Store Inventory
          <span className="font-normal normal-case tracking-normal ml-1 text-gray-500">— buy from market, sell to citizens</span>
        </p>

        <div className="divide-y divide-gray-300">
          {CONSUMER_GOODS.map(res => (
            <StoreResourceCard
              key={res}
              buildingId={buildingId}
              resourceType={res}
              currentStock={stockMap[res] ?? 0}
              existingOrder={ordersByResource[res]}
              existingOffering={offeringsByResource[res]}
              electricityRateCents={electricityRateCents}
            />
          ))}
        </div>

        <StoreAnalyticsPanel buildingId={buildingId} />
      </div>
    );
  }

  const recipe = (recipesResp?.recipes ?? []).find((r: RecipeInfo) => r.recipe_id === bldg.active_recipe);

  if (!recipe) {
    return (
      <div>
        <ElectricityUtilityRow buildingType={buildingType} electricityRateCents={electricityRateCents} />
        <RecipePicker
          buildingId={buildingId}
          buildingType={buildingType}
          currentWorkers={bldg.workers}
          recipes={recipesResp?.recipes ?? []}
        />
      </div>
    );
  }

  const waterIngredient = recipe.ingredients.find((i: { resource_type: string }) => i.resource_type === 'water');
  const nonWaterIngredients = recipe.ingredients.filter((i: { resource_type: string }) => i.resource_type !== 'water');

  const waterRateCents = utilitiesData?.utilities?.find(
    (u: { name: string }) => u.name.toLowerCase() === 'water'
  )?.rate_cents ?? null;

  return (
    <div>
      <ElectricityUtilityRow buildingType={buildingType} electricityRateCents={electricityRateCents} />

      {/* Production pipeline: output sell + ingredient buy in one block */}
      <div className="bg-gray-200 border border-gray-300 rounded-lg px-3 py-2 mb-3">
        <p className="text-xs text-gray-600 mb-1">
          Produces <span className="text-gray-900 font-semibold capitalize">{recipe.output_type}</span>
          <span className="text-gray-500 ml-1 font-mono">× {recipe.output_min}–{recipe.output_max} / {recipe.ticks_required}d</span>
        </p>
        <AutoSellOfferingRow
          buildingId={buildingId}
          resourceType={recipe.output_type}
          existingOffering={existingOfferings.find(o => o.resource_type === recipe.output_type)}
        />
      </div>

      {/* Utilities */}
      {waterIngredient && (
        <WaterUtilityRow quantity={waterIngredient.quantity} waterRateCents={waterRateCents} />
      )}

      {/* Ingredient buy orders — inline per ingredient */}
      {nonWaterIngredients.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-600 font-semibold mb-2">
            Ingredients
            <span className="font-normal normal-case tracking-normal ml-1 text-gray-500">— auto-purchase each day</span>
          </p>
          {nonWaterIngredients.map((ing: { resource_type: string; quantity: number }) => {
            const existingOrder = orders.find(o => o.resource_type === ing.resource_type);
            return (
              <IngredientBuyRow
                key={ing.resource_type}
                buildingId={buildingId}
                resourceType={ing.resource_type}
                recipeQuantity={ing.quantity}
                currentStock={stockMap[ing.resource_type] ?? 0}
                existingOrder={existingOrder}
              />
            );
          })}
        </div>
      )}

      {recipe.ingredients.length === 0 && (
        <p className="text-gray-500 text-xs">No ingredients needed.</p>
      )}
    </div>
  );
}
