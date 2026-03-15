import type {
  PlayerProfile, BuildingStatus, RecipeInfo, Offering,
  AgreementSummary, ResearchProgress, BrandSummary, BrandValueResponse,
  GovernmentInfo, ElectionInfo, CityInfo, CityStats, CityBuildingInfo,
  TileInfo, ListTilesResponse, MarketShareResponse, LoanInfo, LoanActionResponse,
  SupplyLinkInfo, PotentialSupplier, AutoSellConfigInfo, GetBuildingSalesResponse,
  CompanyTickSnapshot, GameEvent, ChatMessage, DmConversation,
} from './types';
import type { IApiService } from './api-interface';

const BASE = '/api';

function headers(): HeadersInit {
  const key = localStorage.getItem('api_key') ?? '';
  return { 'Content-Type': 'application/json', ...(key && { Authorization: `Bearer ${key}` }) };
}

async function req<T>(method: string, path: string, body?: unknown, params?: Record<string, string>): Promise<T> {
  let url = `${BASE}${path}`;
  if (params && Object.keys(params).length) url += `?${new URLSearchParams(params)}`;
  const res = await fetch(url, { method, headers: headers(), ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
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

export function createHttpApi(): IApiService {
  return {
    // ─── Player ─────────────────────────────────────────────────────────────
    registerPlayer: (username) =>
      post<{ player_id: string; api_key: string }>('/player/register', { username }),

    getProfile: () =>
      get<PlayerProfile>('/player/profile'),

    getInventory: (building_id?) =>
      get<{ items: { building_id: string; building_name: string; resource_type: string; quantity: number; quality: number; brand_id: string }[] }>(
        '/player/inventory', building_id ? { building_id } : {}),

    getCompanyHistory: (limit = 60) =>
      get<{ snapshots: CompanyTickSnapshot[] }>('/player/performance', { limit: String(limit) }),

    // ─── Buildings ──────────────────────────────────────────────────────────
    listBuildings: () =>
      get<{ buildings: BuildingStatus[] }>('/buildings'),

    getBuilding: (id) =>
      get<BuildingStatus>(`/buildings/${id}`),

    constructBuilding: (city_id, building_type, name, tile_id) =>
      post<{ building_id: string; construction_ticks_remaining: number }>('/buildings', { city_id, building_type, name, tile_id }),

    configureBuilding: async (id, recipe_id, workers_assigned) => {
      const result = await put<{ success: boolean }>(`/buildings/${id}/configure`, { recipe_id, workers_assigned });
      if (!result.success) throw new Error('Failed to configure building — recipe may not be valid for this building type.');
      return result;
    },

    listRecipes: (type?) =>
      get<{ recipes: RecipeInfo[] }>('/buildings/recipes', type ? { type } : {}),

    // ─── Market ─────────────────────────────────────────────────────────────
    listOfferings: (city_id, resource_type?) =>
      get<{ offerings: Offering[] }>('/market/offerings', { city_id, ...(resource_type ? { resource_type } : {}) }),

    cancelOffering: (id) =>
      del<{ success: boolean }>(`/market/offerings/${id}`),

    purchase: (buyer_building_id, offering_id, quantity) =>
      post<{ total_paid: number; quality: number }>('/market/purchase', { buyer_building_id, offering_id, quantity }),

    getMarketShare: (city_id, resource_type = '', history_ticks = 20) =>
      get<MarketShareResponse>('/market/share', { city_id, ...(resource_type ? { resource_type } : {}), history_ticks: String(history_ticks) }),

    // ─── Trade Agreements ───────────────────────────────────────────────────
    listAgreements: (role?) =>
      get<{ agreements: AgreementSummary[] }>('/agreements', role ? { role } : {}),

    createAgreement: (data) =>
      post<{ agreement_id: string }>('/agreements', { ...data, msrp_price: Math.round(data.msrp_price * 100) }),

    respondAgreement: (id, response) =>
      put<{ success: boolean }>(`/agreements/${id}/respond`, { response }),

    cancelAgreement: (id) =>
      del<{ success: boolean }>(`/agreements/${id}`),

    // ─── Research ───────────────────────────────────────────────────────────
    listResearch: () =>
      get<{ projects: ResearchProgress[] }>('/research'),

    startResearch: (resource_type, workers_assigned, budget_per_tick) =>
      post<{ project_id: string }>('/research', { resource_type, workers_assigned, budget_per_tick: Math.round(budget_per_tick * 100) }),

    pauseResearch: (id, pause) =>
      put<{ success: boolean }>(`/research/${id}/pause`, { pause }),

    // ─── Marketing ──────────────────────────────────────────────────────────
    listBrands: () =>
      get<{ brands: BrandSummary[] }>('/marketing/brands'),

    createBrand: (name, resource_type) =>
      post<{ brand_id: string }>('/marketing/brands', { name, resource_type }),

    getBrandValue: (id) =>
      get<BrandValueResponse>(`/marketing/brands/${id}/value`),

    createCampaign: (brand_id, campaign_name, budget_per_tick, workers_allocated) =>
      post<{ campaign_id: string }>('/marketing/campaigns', { brand_id, campaign_name, budget_per_tick: Math.round(budget_per_tick * 100), workers_allocated }),

    pauseCampaign: (id, pause) =>
      put<{ success: boolean }>(`/marketing/campaigns/${id}/pause`, { pause }),

    // ─── Politics ───────────────────────────────────────────────────────────
    getGovernment: (city_id?) =>
      get<GovernmentInfo>('/politics/government', city_id ? { city_id } : {}),

    getElection: (city_id?) =>
      get<ElectionInfo>('/politics/election', city_id ? { city_id } : {}),

    runForElection: (election_id) =>
      post<{ success: boolean; message: string }>('/politics/run', { election_id }),

    castVote: (election_id, candidate_id) =>
      post<{ success: boolean; message: string }>('/politics/vote', { election_id, candidate_id }),

    enactPolicy:(city_id, consumer_tax_rate, profit_tax_rate, land_tax_rate, employee_tax_rate) =>
      post<{ success: boolean; message: string }>('/politics/policy', { city_id, consumer_tax_rate, profit_tax_rate, land_tax_rate, employee_tax_rate }),

    // ─── Bank ───────────────────────────────────────────────────────────────
    getLoan: (city_id) =>
      get<LoanInfo>('/bank/loan', { city_id }),

    borrowCapital: (city_id, amount) =>
      post<LoanActionResponse>('/bank/borrow', { city_id, amount }),

    repayDebt: (city_id, amount) =>
      post<LoanActionResponse>('/bank/repay', { city_id, amount }),

    // ─── Cities ─────────────────────────────────────────────────────────────
    listCities: () =>
      get<{ cities: CityInfo[] }>('/cities'),

    getCityStats: (city_id) =>
      get<CityStats>(`/cities/${city_id}/stats`),

    listCityBuildings: (city_id) =>
      get<{ buildings: CityBuildingInfo[] }>(`/cities/${city_id}/buildings`),

    // ─── Tiles ──────────────────────────────────────────────────────────────
    listTiles: (city_id, min_x, min_y, max_x, max_y) =>
      get<ListTilesResponse>('/tiles', { city_id, min_x: String(min_x), min_y: String(min_y), max_x: String(max_x), max_y: String(max_y) }),

    getTile: (tile_id) =>
      get<TileInfo>(`/tiles/${tile_id}`),

    purchaseTile: (tile_id) =>
      post<{ tile_id: string; new_balance: number }>(`/tiles/${tile_id}/purchase`, {}),

    // ─── Supply Links ───────────────────────────────────────────────────────
    getSupplyLinks: (buildingId) =>
      get<{ links: SupplyLinkInfo[] }>(`/buildings/${buildingId}/supply-links`),

    addSupplyLink: (buildingId, resourceType, supplierBuildingId) =>
      post<{ supply_link_id: string }>(`/buildings/${buildingId}/supply-links`, {
        resource_type: resourceType,
        supplier_building_id: supplierBuildingId,
      }),

    removeSupplyLink: (linkId) =>
      del<{ success: boolean }>(`/buildings/supply-links/${linkId}`),

    listPotentialSuppliers: (cityId, resourceType) =>
      get<{ suppliers: PotentialSupplier[] }>(`/buildings/potential-suppliers?city_id=${cityId}&resource_type=${resourceType}`),

    getAutoSellConfigs: (buildingId) =>
      get<{ configs: AutoSellConfigInfo[] }>(`/buildings/${buildingId}/auto-sell`),

    setAutoSellConfig: (buildingId, resource_type, price_per_unit, is_enabled) =>
      put<{ success: boolean }>(`/buildings/${buildingId}/auto-sell`, { resource_type, price_per_unit, is_enabled }),

    getBuildingSales: (buildingId, historyTicks = 20) =>
      get<GetBuildingSalesResponse>(`/buildings/${buildingId}/sales?history_ticks=${historyTicks}`),

    // ─── Chat ────────────────────────────────────────────────────────────────
    sendChatMessage: (content, to_player_id = '') =>
      post<{ success: boolean; message: string }>('/chat/send', { content, to_player_id }),

    getChatMessages: (city_id, to_player_id = '', limit = 50, before_id = '') => {
      const p = new URLSearchParams({ city_id, to_player_id, limit: String(limit), before_id });
      return get<{ messages: ChatMessage[] }>(`/chat/messages?${p}`);
    },

    listDmConversations: () =>
      get<{ conversations: DmConversation[] }>(`/chat/conversations`),

    // ─── Events ─────────────────────────────────────────────────────────────
    subscribeToEvents: (cityId, apiKey, onEvent, onConnect, onDisconnect) => {
      const params = new URLSearchParams({ city_id: cityId, api_key: apiKey });
      const source = new EventSource(`${BASE}/events/stream?${params}`);
      source.onopen = () => onConnect?.();
      source.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as GameEvent;
          onEvent(event);
        } catch { /* ignore malformed */ }
      };
      source.onerror = () => {
        onDisconnect?.();
        source.close();
      };
      return () => { source.close(); };
    },
  };
}
