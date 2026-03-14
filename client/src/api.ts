import type {
  PlayerProfile, BuildingStatus, RecipeInfo, Offering,
  AgreementSummary, ResearchProgress, BrandSummary, BrandValueResponse,
  GovernmentInfo, ElectionInfo, CityInfo, CityStats, CityBuildingInfo,
  TileInfo, ListTilesResponse, MarketShareResponse, LoanInfo, LoanActionResponse,
  SupplyLinkInfo, PotentialSupplier,
} from './types';

const BASE = '/api';

function headers(): HeadersInit {
  const key = localStorage.getItem('api_key') ?? '';
  return {
    'Content-Type': 'application/json',
    ...(key && { Authorization: `Bearer ${key}` }),
  };
}

async function req<T>(method: string, path: string, body?: unknown, params?: Record<string, string>): Promise<T> {
  let url = `${BASE}${path}`;
  if (params && Object.keys(params).length) {
    url += `?${new URLSearchParams(params)}`;
  }
  const res = await fetch(url, {
    method,
    headers: headers(),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Request failed');
  }
  return res.json() as Promise<T>;
}

const get  = <T>(path: string, params?: Record<string, string>) => req<T>('GET',    path, undefined, params);
const post = <T>(path: string, body: unknown)                   => req<T>('POST',   path, body);
const put  = <T>(path: string, body: unknown)                   => req<T>('PUT',    path, body);
const del  = <T>(path: string)                                  => req<T>('DELETE', path);

// ─── Player ───────────────────────────────────────────────────────────────

export const registerPlayer = (username: string) =>
  post<{ player_id: string; api_key: string }>('/player/register', { username });

export const getProfile = () =>
  get<PlayerProfile>('/player/profile');

export const getInventory = (building_id?: string) =>
  get<{ items: { building_id: string; building_name: string; resource_type: string; quantity: number; quality: number; brand_id: string }[] }>('/player/inventory', building_id ? { building_id } : {});

// ─── Buildings ────────────────────────────────────────────────────────────

export const listBuildings = () =>
  get<{ buildings: BuildingStatus[] }>('/buildings');

export const getBuilding = (id: string) =>
  get<BuildingStatus>(`/buildings/${id}`);

export const constructBuilding = (city_id: string, building_type: string, name: string, tile_id: string) =>
  post<{ building_id: string; construction_ticks_remaining: number }>('/buildings', { city_id, building_type, name, tile_id });

export const configureBuilding = async (id: string, recipe_id: string, workers_assigned: number) => {
  const result = await put<{ success: boolean }>(`/buildings/${id}/configure`, { recipe_id, workers_assigned });
  if (!result.success) throw new Error('Failed to configure building — recipe may not be valid for this building type.');
  return result;
};

export const listRecipes = (type?: string) =>
  get<{ recipes: RecipeInfo[] }>('/buildings/recipes', type ? { type } : {});

// ─── Market ───────────────────────────────────────────────────────────────

export const listOfferings = (city_id: string, resource_type?: string) =>
  get<{ offerings: Offering[] }>('/market/offerings', { city_id, ...(resource_type ? { resource_type } : {}) });

export const createOffering = (building_id: string, resource_type: string, price_per_unit: number, quantity: number, visibility = 'public', trade_agreement_id = '') =>
  post<{ offering_id: string }>('/market/offerings', { building_id, resource_type, price_per_unit: Math.round(price_per_unit * 100), quantity, visibility, trade_agreement_id });

export const cancelOffering = (id: string) =>
  del<{ success: boolean }>(`/market/offerings/${id}`);

export const purchase = (buyer_building_id: string, offering_id: string, quantity: number) =>
  post<{ total_paid: number; quality: number }>('/market/purchase', { buyer_building_id, offering_id, quantity });

export const getMarketShare = (city_id: string, resource_type = '', history_ticks = 20) =>
  get<MarketShareResponse>('/market/share', { city_id, ...(resource_type ? { resource_type } : {}), history_ticks: String(history_ticks) });

// ─── Trade Agreements ─────────────────────────────────────────────────────

export const listAgreements = (role?: string) =>
  get<{ agreements: AgreementSummary[] }>('/agreements', role ? { role } : {});

export const createAgreement = (data: {
  buyer_player_id: string; resource_type: string; discount_rate: number;
  require_non_competition: boolean; require_msrp: boolean; msrp_price: number;
  disallow_white_labeling: boolean; expires_at_tick: number;
}) => post<{ agreement_id: string }>('/agreements', {
  ...data,
  msrp_price: Math.round(data.msrp_price * 100),
});

export const respondAgreement = (id: string, response: string) =>
  put<{ success: boolean }>(`/agreements/${id}/respond`, { response });

export const cancelAgreement = (id: string) =>
  del<{ success: boolean }>(`/agreements/${id}`);

// ─── Research ─────────────────────────────────────────────────────────────

export const listResearch = () =>
  get<{ projects: ResearchProgress[] }>('/research');

export const startResearch = (resource_type: string, workers_assigned: number, budget_per_tick: number) =>
  post<{ project_id: string }>('/research', { resource_type, workers_assigned, budget_per_tick: Math.round(budget_per_tick * 100) });

export const pauseResearch = (id: string, pause: boolean) =>
  put<{ success: boolean }>(`/research/${id}/pause`, { pause });

// ─── Marketing ────────────────────────────────────────────────────────────

export const listBrands = () =>
  get<{ brands: BrandSummary[] }>('/marketing/brands');

export const createBrand = (name: string, resource_type: string) =>
  post<{ brand_id: string }>('/marketing/brands', { name, resource_type });

export const getBrandValue = (id: string) =>
  get<BrandValueResponse>(`/marketing/brands/${id}/value`);

export const createCampaign = (brand_id: string, campaign_name: string, budget_per_tick: number, workers_allocated: number) =>
  post<{ campaign_id: string }>('/marketing/campaigns', { brand_id, campaign_name, budget_per_tick: Math.round(budget_per_tick * 100), workers_allocated });

export const pauseCampaign = (id: string, pause: boolean) =>
  put<{ success: boolean }>(`/marketing/campaigns/${id}/pause`, { pause });

// ─── Politics ─────────────────────────────────────────────────────────────

export const getGovernment = (city_id?: string) =>
  get<GovernmentInfo>('/politics/government', city_id ? { city_id } : {});

export const getElection = (city_id?: string) =>
  get<ElectionInfo>('/politics/election', city_id ? { city_id } : {});

export const runForElection = (election_id: string) =>
  post<{ success: boolean; message: string }>('/politics/run', { election_id });

export const enactPolicy = (city_id: string, consumer_tax_rate: number, profit_tax_rate: number, land_tax_rate: number, employee_tax_rate: number) =>
  post<{ success: boolean; message: string }>('/politics/policy', { city_id, consumer_tax_rate, profit_tax_rate, land_tax_rate, employee_tax_rate });

// ─── Bank ─────────────────────────────────────────────────────────────────

export const getLoan = (city_id: string) =>
  get<LoanInfo>('/bank/loan', { city_id });

export const borrowCapital = (city_id: string, amount: number) =>
  post<LoanActionResponse>('/bank/borrow', { city_id, amount });

export const repayDebt = (city_id: string, amount: number) =>
  post<LoanActionResponse>('/bank/repay', { city_id, amount });

// ─── Cities ───────────────────────────────────────────────────────────────────

export const listCities = () =>
  get<{ cities: CityInfo[] }>('/cities');

export const getCityStats = (city_id: string) =>
  get<CityStats>(`/cities/${city_id}/stats`);

export const listCityBuildings = (city_id: string) =>
  get<{ buildings: CityBuildingInfo[] }>(`/cities/${city_id}/buildings`);

// ─── Tiles ────────────────────────────────────────────────────────────────────

export const listTiles = (city_id: string, min_x: number, min_y: number, max_x: number, max_y: number) =>
  get<ListTilesResponse>('/tiles', {
    city_id,
    min_x: String(min_x),
    min_y: String(min_y),
    max_x: String(max_x),
    max_y: String(max_y),
  });

export const getTile = (tile_id: string) =>
  get<TileInfo>(`/tiles/${tile_id}`);

export const purchaseTile = (tile_id: string) =>
  post<{ tile_id: string; new_balance: number }>(`/tiles/${tile_id}/purchase`, {});

// ─── Supply Links ─────────────────────────────────────────────────────────────

export const getSupplyLinks = (buildingId: string) =>
  get<{ links: SupplyLinkInfo[] }>(`/buildings/${buildingId}/supply-links`);

export const addSupplyLink = (buildingId: string, resourceType: string, supplierBuildingId: string) =>
  post<{ supply_link_id: string }>(`/buildings/${buildingId}/supply-links`, {
    resource_type: resourceType,
    supplier_building_id: supplierBuildingId,
  });

export const removeSupplyLink = (linkId: string) =>
  del<{ success: boolean }>(`/buildings/supply-links/${linkId}`);

export const listPotentialSuppliers = (cityId: string, resourceType: string) =>
  get<{ suppliers: PotentialSupplier[] }>(`/buildings/potential-suppliers?city_id=${cityId}&resource_type=${resourceType}`);
