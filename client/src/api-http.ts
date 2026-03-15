import type {
  PlayerProfile, BuildingStatus, RecipeInfo, Offering,
  AgreementSummary, ResearchProgress, BrandSummary, BrandValueResponse,
  GovernmentInfo, ElectionInfo, CityInfo, CityStats, CityBuildingInfo,
  TileInfo, ListTilesResponse, MarketShareResponse, LoanInfo, LoanActionResponse,
  SupplyLinkInfo, PotentialSupplier, AutoSellConfigInfo, GetBuildingSalesResponse,
  CompanyTickSnapshot, GameEvent, ChatMessage, DmConversation,
} from './types';
import type { IApiService } from './api-interface';

// API base — auto-detects Discord Activity proxy or uses direct URL.
// Discord Activities can't call external APIs directly due to CSP;
// they must go through Discord's URL mapping proxy.
function getApiBase(): string {
  // Discord Activity: use proxy path (requires URL mapping in Developer Portal)
  // Must check this BEFORE env var — .env.production bakes in api.ventured.gg
  if (new URLSearchParams(window.location.search).has('frame_id')) {
    return '/.proxy/api/v1';
  }

  return (import.meta.env.VITE_API_BASE as string | undefined) ?? 'https://api.ventured.gg/v1';
}

const BASE = getApiBase();

function headers(): HeadersInit {
  const key = localStorage.getItem('api_key') ?? '';
  return {
    'Content-Type': 'application/json',
    ...(key && { 'x-api-key': key }),
  };
}

async function req<T>(method: string, path: string, body?: unknown, params?: Record<string, string>): Promise<T> {
  let url = `${BASE}${path}`;
  if (params && Object.keys(params).length) url += `?${new URLSearchParams(params)}`;
  const res = await fetch(url, {
    method,
    headers: headers(),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Request failed');
  }
  return normalizeResponse(await res.json()) as T;
}

const get  = <T>(path: string, params?: Record<string, string>) => req<T>('GET',    path, undefined, params);
const post = <T>(path: string, body: unknown)                   => req<T>('POST',   path, body);
const put  = <T>(path: string, body: unknown)                   => req<T>('PUT',    path, body);
const del  = <T>(path: string)                                  => req<T>('DELETE', path);

// ── Response normalization ────────────────────────────────────────────────────
// 1. camelCase keys → snake_case  (transcoding returns camelCase)
// 2. RESOURCE_TYPE_GRAIN → grain  (strip proto enum prefixes)

function toSnakeCase(s: string): string {
  return s.replace(/([A-Z])/g, c => `_${c.toLowerCase()}`);
}

function stripEnumPrefix(val: string): string {
  // Two-segment prefix: "RESOURCE_TYPE_GRAIN" → "grain"
  const m = val.match(/^[A-Z][A-Z0-9]+_[A-Z][A-Z0-9]+_(.+)$/);
  if (m) return m[1].toLowerCase();
  // All-uppercase single enum name: "DISCORD" → "discord"
  if (/^[A-Z][A-Z0-9_]*$/.test(val)) return val.toLowerCase();
  return val;
}

function normalizeResponse(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(normalizeResponse);
  if (typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[toSnakeCase(k)] = normalizeResponse(v);
    }
    return out;
  }
  if (typeof obj === 'string') return stripEnumPrefix(obj);
  return obj;
}

// ── Request enum conversion ───────────────────────────────────────────────────
// The proto parser accepts the full enum name (RESOURCE_TYPE_GRAIN) but not
// the simplified lowercase form used by the UI ("grain"). We convert before sending.

const RESOURCE_TYPE: Record<string, string> = {
  grain:       'RESOURCE_TYPE_GRAIN',
  water:       'RESOURCE_TYPE_WATER',
  animal_feed: 'RESOURCE_TYPE_ANIMAL_FEED',
  cattle:      'RESOURCE_TYPE_CATTLE',
  meat:        'RESOURCE_TYPE_MEAT',
  leather:     'RESOURCE_TYPE_LEATHER',
  food:        'RESOURCE_TYPE_FOOD',
};
const BUILDING_TYPE: Record<string, string> = {
  field:     'BUILDING_TYPE_FIELD',
  factory:   'BUILDING_TYPE_FACTORY',
  store:     'BUILDING_TYPE_STORE',
  warehouse: 'BUILDING_TYPE_WAREHOUSE',
  landmark:  'BUILDING_TYPE_LANDMARK',
  bank:      'BUILDING_TYPE_BANK',
};

function enumVal(map: Record<string, string>, val: string | undefined): string | undefined {
  if (!val) return val;
  return map[val.toLowerCase()] ?? val;
}

export function createHttpApi(): IApiService {
  return {
    // ─── Auth ───────────────────────────────────────────────────────────────
    getAuthMethods: () =>
      get<{ methods: { provider: string; client_id: string }[] }>('/auth/methods'),

    getOAuthClientId: (provider = 'DISCORD') =>
      get<{ client_id: string }>(`/auth/oauth/${encodeURIComponent(provider)}/client-id`),

    exchangeOAuthCode: (provider, code, redirectUri, displayName = '') =>
      post<{ player_id: string; api_key: string }>('/auth/oauth/exchange', {
        provider, code, redirect_uri: redirectUri, display_name: displayName,
      }),

    openDiscordOAuth: (clientId) =>
      new Promise((resolve, reject) => {
        // Redirect URI must point to the API server's callback (registered in Discord portal)
        const redirectUri = new URL(`${BASE}/auth/callback`, window.location.origin).href;
        // Determine the API server's origin (for accepting postMessage from the popup)
        const apiOrigin = BASE.startsWith('http') ? new URL(BASE).origin : window.location.origin;

        const params = new URLSearchParams({
          client_id:     clientId,
          redirect_uri:  redirectUri,
          response_type: 'code',
          scope:         'identify',
          state:         window.location.origin, // tells the server where to postMessage
        });
        const popup = window.open(
          `https://discord.com/oauth2/authorize?${params}`,
          'discord-oauth',
          'width=500,height=700,popup=1',
        );
        if (!popup) { reject(new Error('Popup blocked — please allow popups for this site')); return; }

        const onMessage = (ev: MessageEvent<{ type: string; code: string }>) => {
          // Accept from own origin (dev proxy) or the API server origin (production)
          if (ev.origin !== window.location.origin && ev.origin !== apiOrigin) return;
          if (ev.data?.type !== 'discord-oauth-code') return;
          window.removeEventListener('message', onMessage);
          clearInterval(closedCheck);
          resolve({ ok: true, code: ev.data.code, redirectUri });
        };

        const closedCheck = setInterval(() => {
          if (popup.closed) {
            clearInterval(closedCheck);
            window.removeEventListener('message', onMessage);
            reject(new Error('Login cancelled'));
          }
        }, 500);

        window.addEventListener('message', onMessage);
      }),

    // ─── Player ─────────────────────────────────────────────────────────────
    registerPlayer: (username) =>
      post<{ player_id: string; api_key: string }>('/players', { username }),

    getProfile: () =>
      get<PlayerProfile>('/players/me'),

    getInventory: (building_id?) =>
      get<{ items: { building_id: string; building_name: string; resource_type: string; quantity: number; quality: number; brand_id: string }[] }>(
        '/players/me/inventory', building_id ? { building_id } : {}),

    getCompanyHistory: (limit = 60) =>
      get<{ snapshots: CompanyTickSnapshot[] }>('/players/me/company/history', { limit: String(limit) }),

    // ─── Buildings ──────────────────────────────────────────────────────────
    listBuildings: () =>
      get<{ buildings: BuildingStatus[] }>('/buildings'),

    getBuilding: (id) =>
      get<BuildingStatus>(`/buildings/${id}`),

    constructBuilding: (city_id, building_type, name, tile_id) =>
      post<{ building_id: string; construction_ticks_remaining: number }>('/buildings', {
        city_id,
        building_type: enumVal(BUILDING_TYPE, building_type),
        name,
        tile_id,
      }),

    configureBuilding: async (id, recipe_id, workers_assigned) => {
      const result = await put<{ success: boolean }>(`/buildings/${id}/config`, { recipe_id, workers_assigned });
      if (!result.success) throw new Error('Failed to configure building — recipe may not be valid for this building type.');
      return result;
    },

    listRecipes: (type?) =>
      get<{ recipes: RecipeInfo[] }>('/recipes', type ? { building_type: enumVal(BUILDING_TYPE, type) ?? type } : {}),

    // ─── Market ─────────────────────────────────────────────────────────────
    listOfferings: (city_id, resource_type?) =>
      get<{ offerings: Offering[] }>(`/cities/${city_id}/offerings`,
        resource_type ? { resource_type: enumVal(RESOURCE_TYPE, resource_type) ?? resource_type } : {}),

    cancelOffering: (id) =>
      del<{ success: boolean }>(`/offerings/${id}`),

    purchase: (buyer_building_id, offering_id, quantity) =>
      post<{ total_paid: number; quality: number }>(`/offerings/${offering_id}/purchase`, {
        buyer_building_id,
        quantity,
      }),

    getMarketShare: (city_id, resource_type = '', history_ticks = 20) =>
      get<MarketShareResponse>(`/cities/${city_id}/market-share`, {
        ...(resource_type ? { resource_type: enumVal(RESOURCE_TYPE, resource_type) ?? resource_type } : {}),
        history_ticks: String(history_ticks),
      }),

    // ─── Trade Agreements ───────────────────────────────────────────────────
    listAgreements: (role?) =>
      get<{ agreements: AgreementSummary[] }>('/agreements', role ? { role } : {}),

    createAgreement: (data) =>
      post<{ agreement_id: string }>('/agreements', { ...data, msrp_price: Math.round(data.msrp_price * 100) }),

    respondAgreement: (id, response) =>
      put<{ success: boolean }>(`/agreements/${id}/response`, { response }),

    cancelAgreement: (id) =>
      del<{ success: boolean }>(`/agreements/${id}`),

    // ─── Research ───────────────────────────────────────────────────────────
    listResearch: () =>
      get<{ projects: ResearchProgress[] }>('/research'),

    startResearch: (resource_type, workers_assigned, budget_per_tick) =>
      post<{ project_id: string }>('/research', {
        resource_type: enumVal(RESOURCE_TYPE, resource_type),
        workers_assigned,
        budget_per_tick: Math.round(budget_per_tick * 100),
      }),

    pauseResearch: (id, pause) =>
      put<{ success: boolean }>(`/research/${id}/pause`, { pause }),

    // ─── Marketing ──────────────────────────────────────────────────────────
    listBrands: () =>
      get<{ brands: BrandSummary[] }>('/brands'),

    createBrand: (name, resource_type) =>
      post<{ brand_id: string }>('/brands', {
        name,
        resource_type: enumVal(RESOURCE_TYPE, resource_type),
      }),

    getBrandValue: (id) =>
      get<BrandValueResponse>(`/brands/${id}`),

    createCampaign: (brand_id, campaign_name, budget_per_tick, workers_allocated) =>
      post<{ campaign_id: string }>('/campaigns', {
        brand_id,
        campaign_name,
        budget_per_tick: Math.round(budget_per_tick * 100),
        workers_allocated,
      }),

    pauseCampaign: (id, pause) =>
      put<{ success: boolean }>(`/campaigns/${id}/pause`, { pause }),

    // ─── Politics ───────────────────────────────────────────────────────────
    getGovernment: (city_id?) =>
      get<GovernmentInfo>(`/cities/${city_id ?? 'default'}/government`),

    getElection: (city_id?) =>
      get<ElectionInfo>(`/cities/${city_id ?? 'default'}/election`),

    runForElection: (election_id) =>
      post<{ success: boolean; message: string }>(`/elections/${election_id}/candidates`, {}),

    castVote: (election_id, candidate_id) =>
      post<{ success: boolean; message: string }>(`/elections/${election_id}/votes`, { candidate_id }),

    enactPolicy: (city_id, consumer_tax_rate, profit_tax_rate, land_tax_rate, employee_tax_rate) =>
      put<{ success: boolean; message: string }>(`/cities/${city_id}/government/policy`, {
        consumer_tax_rate, profit_tax_rate, land_tax_rate, employee_tax_rate,
      }),

    // ─── Bank ───────────────────────────────────────────────────────────────
    getLoan: (city_id) =>
      get<LoanInfo>(`/cities/${city_id}/bank/loan`),

    borrowCapital: (city_id, amount) =>
      post<LoanActionResponse>(`/cities/${city_id}/bank/borrow`, { amount }),

    repayDebt: (city_id, amount) =>
      post<LoanActionResponse>(`/cities/${city_id}/bank/repay`, { amount }),

    // ─── Cities ─────────────────────────────────────────────────────────────
    listCities: () =>
      get<{ cities: CityInfo[] }>('/cities'),

    getCityStats: (city_id) =>
      get<CityStats>(`/cities/${city_id}`),

    listCityBuildings: (city_id) =>
      get<{ buildings: CityBuildingInfo[] }>(`/cities/${city_id}/buildings`),

    // ─── Tiles ──────────────────────────────────────────────────────────────
    listTiles: (city_id, min_x, min_y, max_x, max_y) =>
      get<ListTilesResponse>(`/cities/${city_id}/tiles`, {
        min_x: String(min_x), min_y: String(min_y),
        max_x: String(max_x), max_y: String(max_y),
      }),

    getTile: (tile_id) =>
      get<TileInfo>(`/tiles/${tile_id}`),

    purchaseTile: (tile_id) =>
      post<{ tile_id: string; new_balance: number }>(`/tiles/${tile_id}/purchase`, {}),

    // ─── Supply Links ───────────────────────────────────────────────────────
    getSupplyLinks: (buildingId) =>
      get<{ links: SupplyLinkInfo[] }>(`/buildings/${buildingId}/supply-links`),

    addSupplyLink: (buildingId, resourceType, supplierBuildingId) =>
      post<{ supply_link_id: string }>(`/buildings/${buildingId}/supply-links`, {
        resource_type:        enumVal(RESOURCE_TYPE, resourceType),
        supplier_building_id: supplierBuildingId,
      }),

    removeSupplyLink: (linkId) =>
      del<{ success: boolean }>(`/supply-links/${linkId}`),

    listPotentialSuppliers: (cityId, resourceType) =>
      get<{ suppliers: PotentialSupplier[] }>(
        `/cities/${cityId}/suppliers/${enumVal(RESOURCE_TYPE, resourceType) ?? resourceType}`),

    getAutoSellConfigs: (buildingId) =>
      get<{ configs: AutoSellConfigInfo[] }>(`/buildings/${buildingId}/auto-sell`),

    setAutoSellConfig: (buildingId, resource_type, price_per_unit, is_enabled) =>
      put<{ success: boolean }>(`/buildings/${buildingId}/auto-sell`, {
        resource_type: enumVal(RESOURCE_TYPE, resource_type),
        price_per_unit,
        is_enabled,
      }),

    getBuildingSales: (buildingId, historyTicks = 20) =>
      get<GetBuildingSalesResponse>(`/buildings/${buildingId}/sales`, { history_ticks: String(historyTicks) }),

    // ─── Chat ────────────────────────────────────────────────────────────────
    sendChatMessage: (content, to_player_id = '') =>
      post<{ success: boolean; message: string }>('/chat', { content, to_player_id }),

    getChatMessages: (city_id, to_player_id = '', limit = 50, before_id = '') =>
      get<{ messages: ChatMessage[] }>(`/chat/${city_id}/messages`, {
        ...(to_player_id ? { to_player_id } : {}),
        limit: String(limit),
        ...(before_id ? { before_id } : {}),
      }),

    listDmConversations: () =>
      get<{ conversations: DmConversation[] }>('/chat/conversations'),

    findPlayerByHandle: (handle) =>
      get<{ found: boolean; player_id: string; username: string; city_id: string }>(
        `/players/handle/${encodeURIComponent(handle)}`),

    // ─── Events ─────────────────────────────────────────────────────────────
    subscribeToEvents: (cityId, apiKey, onEvent, onConnect, onDisconnect) => {
      const params = new URLSearchParams({ city_id: cityId, api_key: apiKey });
      const source = new EventSource(`${BASE}/events/stream?${params}`);
      source.onopen = () => onConnect?.();
      source.onmessage = (e) => {
        try {
          const event = normalizeResponse(JSON.parse(e.data)) as GameEvent;
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
