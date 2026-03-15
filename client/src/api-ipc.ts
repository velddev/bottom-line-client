import type {
  PlayerProfile, BuildingStatus, RecipeInfo, Offering,
  AgreementSummary, ResearchProgress, BrandSummary, BrandValueResponse,
  GovernmentInfo, ElectionInfo, CityInfo, CityStats, CityBuildingInfo,
  TileInfo, ListTilesResponse, MarketShareResponse, LoanInfo, LoanActionResponse,
  SupplyLinkInfo, PotentialSupplier, AutoSellConfigInfo, GetBuildingSalesResponse,
  CompanyTickSnapshot, GameEvent, ChatMessage, DmConversation,
} from './types';
import type { IApiService } from './api-interface';

declare global {
  interface Window {
    electronAPI?: {
      invoke: (channel: string, data?: unknown) => Promise<unknown>;
      onEvent: (cb: (data: unknown) => void) => () => void;
      onEventError: (cb: (data: unknown) => void) => () => void;
      onDiscordAuth: (cb: (data: { code: string }) => void) => () => void;
    };
  }
}

function invoke<T>(channel: string, data?: unknown): Promise<T> {
  return window.electronAPI!.invoke(channel, data) as Promise<T>;
}

function apiKey(): string {
  return localStorage.getItem('api_key') ?? '';
}

export function createIpcApi(): IApiService {
  return {
    // ─── Auth ───────────────────────────────────────────────────────────────
    getOAuthClientId: (provider) =>
      invoke<{ client_id: string }>('api:getOAuthClientId', { provider }),

    exchangeOAuthCode: (provider, code, redirectUri, displayName = '') =>
      invoke<{ player_id: string; api_key: string }>(
        'api:exchangeOAuthCode', { provider, code, redirectUri, displayName }),

    openDiscordOAuth: (clientId) =>
      invoke<{ ok: boolean }>('api:openDiscordOAuth', { clientId }),

    // ─── Player ─────────────────────────────────────────────────────────────
    registerPlayer: (username) =>
      invoke<{ player_id: string; api_key: string }>('api:registerPlayer', { username }),

    getProfile: () =>
      invoke<PlayerProfile>('api:getProfile', { apiKey: apiKey() }),

    getInventory: (building_id?) =>
      invoke<{ items: { building_id: string; building_name: string; resource_type: string; quantity: number; quality: number; brand_id: string }[] }>(
        'api:getInventory', { building_id, apiKey: apiKey() }),

    getCompanyHistory: (limit = 60) =>
      invoke<{ snapshots: CompanyTickSnapshot[] }>('api:getCompanyHistory', { limit, apiKey: apiKey() }),

    // ─── Buildings ──────────────────────────────────────────────────────────
    listBuildings: () =>
      invoke<{ buildings: BuildingStatus[] }>('api:listBuildings', { apiKey: apiKey() }),

    getBuilding: (id) =>
      invoke<BuildingStatus>('api:getBuilding', { building_id: id, apiKey: apiKey() }),

    constructBuilding: (city_id, building_type, name, tile_id) =>
      invoke<{ building_id: string; construction_ticks_remaining: number }>(
        'api:constructBuilding', { city_id, building_type, name, tile_id, apiKey: apiKey() }),

    configureBuilding: async (id, recipe_id, workers_assigned) => {
      const result = await invoke<{ success: boolean }>('api:configureBuilding', {
        building_id: id, recipe_id, workers_assigned, apiKey: apiKey(),
      });
      if (!result.success) throw new Error('Failed to configure building — recipe may not be valid for this building type.');
      return result;
    },

    listRecipes: (type?) =>
      invoke<{ recipes: RecipeInfo[] }>('api:listRecipes', { type, apiKey: apiKey() }),

    // ─── Market ─────────────────────────────────────────────────────────────
    listOfferings: (city_id, resource_type?) =>
      invoke<{ offerings: Offering[] }>('api:listOfferings', { city_id, resource_type, apiKey: apiKey() }),

    cancelOffering: (id) =>
      invoke<{ success: boolean }>('api:cancelOffering', { offering_id: id, apiKey: apiKey() }),

    purchase: (buyer_building_id, offering_id, quantity) =>
      invoke<{ total_paid: number; quality: number }>('api:purchase', { buyer_building_id, offering_id, quantity, apiKey: apiKey() }),

    getMarketShare: (city_id, resource_type = '', history_ticks = 20) =>
      invoke<MarketShareResponse>('api:getMarketShare', { city_id, resource_type, history_ticks, apiKey: apiKey() }),

    // ─── Trade Agreements ───────────────────────────────────────────────────
    listAgreements: (role?) =>
      invoke<{ agreements: AgreementSummary[] }>('api:listAgreements', { role, apiKey: apiKey() }),

    createAgreement: (data) =>
      invoke<{ agreement_id: string }>('api:createAgreement', {
        ...data,
        msrp_price: Math.round(data.msrp_price * 100),
        apiKey: apiKey(),
      }),

    respondAgreement: (id, response) =>
      invoke<{ success: boolean }>('api:respondAgreement', { agreement_id: id, response, apiKey: apiKey() }),

    cancelAgreement: (id) =>
      invoke<{ success: boolean }>('api:cancelAgreement', { agreement_id: id, apiKey: apiKey() }),

    // ─── Research ───────────────────────────────────────────────────────────
    listResearch: () =>
      invoke<{ projects: ResearchProgress[] }>('api:listResearch', { apiKey: apiKey() }),

    startResearch: (resource_type, workers_assigned, budget_per_tick) =>
      invoke<{ project_id: string }>('api:startResearch', {
        resource_type, workers_assigned,
        budget_per_tick: Math.round(budget_per_tick * 100),
        apiKey: apiKey(),
      }),

    pauseResearch: (id, pause) =>
      invoke<{ success: boolean }>('api:pauseResearch', { project_id: id, pause, apiKey: apiKey() }),

    // ─── Marketing ──────────────────────────────────────────────────────────
    listBrands: () =>
      invoke<{ brands: BrandSummary[] }>('api:listBrands', { apiKey: apiKey() }),

    createBrand: (name, resource_type) =>
      invoke<{ brand_id: string }>('api:createBrand', { name, resource_type, apiKey: apiKey() }),

    getBrandValue: (id) =>
      invoke<BrandValueResponse>('api:getBrandValue', { brand_id: id, apiKey: apiKey() }),

    createCampaign: (brand_id, campaign_name, budget_per_tick, workers_allocated) =>
      invoke<{ campaign_id: string }>('api:createCampaign', {
        brand_id, campaign_name,
        budget_per_tick: Math.round(budget_per_tick * 100),
        workers_allocated,
        apiKey: apiKey(),
      }),

    pauseCampaign: (id, pause) =>
      invoke<{ success: boolean }>('api:pauseCampaign', { campaign_id: id, pause, apiKey: apiKey() }),

    // ─── Politics ───────────────────────────────────────────────────────────
    getGovernment: (city_id?) =>
      invoke<GovernmentInfo>('api:getGovernment', { city_id, apiKey: apiKey() }),

    getElection: (city_id?) =>
      invoke<ElectionInfo>('api:getElection', { city_id, apiKey: apiKey() }),

    runForElection: (election_id) =>
      invoke<{ success: boolean; message: string }>('api:runForElection', { election_id, apiKey: apiKey() }),

    castVote: (election_id, candidate_id) =>
      invoke<{ success: boolean; message: string }>('api:castVote', { election_id, candidate_id, apiKey: apiKey() }),

    enactPolicy:(city_id, consumer_tax_rate, profit_tax_rate, land_tax_rate, employee_tax_rate) =>
      invoke<{ success: boolean; message: string }>('api:enactPolicy', {
        city_id, consumer_tax_rate, profit_tax_rate, land_tax_rate, employee_tax_rate, apiKey: apiKey(),
      }),

    // ─── Bank ───────────────────────────────────────────────────────────────
    getLoan: (city_id) =>
      invoke<LoanInfo>('api:getLoan', { city_id, apiKey: apiKey() }),

    borrowCapital: (city_id, amount) =>
      invoke<LoanActionResponse>('api:borrowCapital', { city_id, amount, apiKey: apiKey() }),

    repayDebt: (city_id, amount) =>
      invoke<LoanActionResponse>('api:repayDebt', { city_id, amount, apiKey: apiKey() }),

    // ─── Cities ─────────────────────────────────────────────────────────────
    listCities: () =>
      invoke<{ cities: CityInfo[] }>('api:listCities', {}),

    getCityStats: (city_id) =>
      invoke<CityStats>('api:getCityStats', { city_id }),

    listCityBuildings: (city_id) =>
      invoke<{ buildings: CityBuildingInfo[] }>('api:listCityBuildings', { city_id }),

    // ─── Tiles ──────────────────────────────────────────────────────────────
    listTiles: (city_id, min_x, min_y, max_x, max_y) =>
      invoke<ListTilesResponse>('api:listTiles', { city_id, min_x, min_y, max_x, max_y }),

    getTile: (tile_id) =>
      invoke<TileInfo>('api:getTile', { tile_id }),

    purchaseTile: (tile_id) =>
      invoke<{ tile_id: string; new_balance: number }>('api:purchaseTile', { tile_id, apiKey: apiKey() }),

    // ─── Supply Links ───────────────────────────────────────────────────────
    getSupplyLinks: (buildingId) =>
      invoke<{ links: SupplyLinkInfo[] }>('api:getSupplyLinks', { building_id: buildingId, apiKey: apiKey() }),

    addSupplyLink: (buildingId, resourceType, supplierBuildingId) =>
      invoke<{ supply_link_id: string }>('api:addSupplyLink', {
        building_id: buildingId,
        resource_type: resourceType,
        supplier_building_id: supplierBuildingId,
        apiKey: apiKey(),
      }),

    removeSupplyLink: (linkId) =>
      invoke<{ success: boolean }>('api:removeSupplyLink', { supply_link_id: linkId, apiKey: apiKey() }),

    listPotentialSuppliers: (cityId, resourceType) =>
      invoke<{ suppliers: PotentialSupplier[] }>('api:listPotentialSuppliers', {
        city_id: cityId, resource_type: resourceType, apiKey: apiKey(),
      }),

    getAutoSellConfigs: (buildingId) =>
      invoke<{ configs: AutoSellConfigInfo[] }>('api:getAutoSellConfigs', { building_id: buildingId, apiKey: apiKey() }),

    setAutoSellConfig: (buildingId, resource_type, price_per_unit, is_enabled) =>
      invoke<{ success: boolean }>('api:setAutoSellConfig', {
        building_id: buildingId, resource_type, price_per_unit, is_enabled, apiKey: apiKey(),
      }),

    getBuildingSales: (buildingId, historyTicks = 20) =>
      invoke<GetBuildingSalesResponse>('api:getBuildingSales', { building_id: buildingId, history_ticks: historyTicks, apiKey: apiKey() }),

    // ─── Chat ────────────────────────────────────────────────────────────────
    sendChatMessage: (content, to_player_id = '') =>
      invoke<{ success: boolean; message: string }>('api:sendChatMessage', { content, to_player_id, apiKey: apiKey() }),

    getChatMessages: (city_id, to_player_id = '', limit = 50, before_id = '') =>
      invoke<{ messages: ChatMessage[] }>('api:getChatMessages', { city_id, to_player_id, limit, before_id, apiKey: apiKey() }),

    listDmConversations: () =>
      invoke<{ conversations: DmConversation[] }>('api:listDmConversations', { apiKey: apiKey() }),

    findPlayerByHandle: (handle) =>
      invoke<{ found: boolean; player_id: string; username: string; city_id: string }>(
        'api:findPlayerByHandle', { handle, apiKey: apiKey() }),

    // ─── Events ─────────────────────────────────────────────────────────────
    subscribeToEvents: (cityId, apiKey, onEvent, onConnect, onDisconnect) => {
      window.electronAPI!.invoke('api:subscribeEvents', { cityId, apiKey }).then(() => {
        onConnect?.();
      });
      const stopEvents = window.electronAPI!.onEvent((data) => onEvent(data as GameEvent));
      const stopErrors = window.electronAPI!.onEventError(() => {
        onDisconnect?.();
      });
      return () => {
        window.electronAPI!.invoke('api:unsubscribeEvents');
        stopEvents();
        stopErrors();
      };
    },
  };
}
