import type {
  PlayerProfile, BuildingStatus, RecipeInfo, Offering,
  AgreementSummary, ResearchProgress, BrandSummary, BrandValueResponse,
  GovernmentInfo, ElectionInfo, CityInfo, CityStats, CityBuildingInfo,
  TileInfo, ListTilesResponse, MarketShareResponse, LoanInfo, LoanActionResponse,
  SupplyLinkInfo, PotentialSupplier, AutoSellConfigInfo, GetBuildingSalesResponse,
  CompanyTickSnapshot, GameEvent, TileMarketScore, DemandUtilizationPoint,
} from './types';
import { createHttpApi } from './api-http';
import { createIpcApi } from './api-ipc';
import type { IApiService } from './api-interface';

declare global {
  interface Window {
    electron?: { isElectron: boolean };
    electronAPI?: {
      invoke: (channel: string, data?: unknown) => Promise<unknown>;
      onEvent: (cb: (data: unknown) => void) => () => void;
      onEventError: (cb: (data: unknown) => void) => () => void;
      onDiscordAuth: (cb: (data: { code: string }) => void) => () => void;
    };
  }
}

export const api: IApiService = window.electron?.isElectron
  ? createIpcApi()
  : createHttpApi();

// ─── Backward-compat named exports (all screens import from here) ─────────────

export const registerPlayer: IApiService['registerPlayer'] = (...args) => api.registerPlayer(...args);
export const getProfile: IApiService['getProfile'] = () => api.getProfile();
export const getInventory: IApiService['getInventory'] = (...args) => api.getInventory(...args);
export const getCompanyHistory: IApiService['getCompanyHistory'] = (...args) => api.getCompanyHistory(...args);
export const listBuildings: IApiService['listBuildings'] = () => api.listBuildings();
export const getBuilding: IApiService['getBuilding'] = (...args) => api.getBuilding(...args);
export const constructBuilding: IApiService['constructBuilding'] = (...args) => api.constructBuilding(...args);
export const configureBuilding: IApiService['configureBuilding'] = (...args) => api.configureBuilding(...args);
export const listRecipes: IApiService['listRecipes'] = (...args) => api.listRecipes(...args);
export const listOfferings: IApiService['listOfferings'] = (...args) => api.listOfferings(...args);
export const cancelOffering: IApiService['cancelOffering'] = (...args) => api.cancelOffering(...args);
export const purchase: IApiService['purchase'] = (...args) => api.purchase(...args);
export const getMarketShare: IApiService['getMarketShare'] = (...args) => api.getMarketShare(...args);
export const listAgreements: IApiService['listAgreements'] = (...args) => api.listAgreements(...args);
export const createAgreement: IApiService['createAgreement'] = (...args) => api.createAgreement(...args);
export const respondAgreement: IApiService['respondAgreement'] = (...args) => api.respondAgreement(...args);
export const cancelAgreement: IApiService['cancelAgreement'] = (...args) => api.cancelAgreement(...args);
export const listResearch: IApiService['listResearch'] = () => api.listResearch();
export const startResearch: IApiService['startResearch'] = (...args) => api.startResearch(...args);
export const pauseResearch: IApiService['pauseResearch'] = (...args) => api.pauseResearch(...args);
export const listBrands: IApiService['listBrands'] = () => api.listBrands();
export const createBrand: IApiService['createBrand'] = (...args) => api.createBrand(...args);
export const getBrandValue: IApiService['getBrandValue'] = (...args) => api.getBrandValue(...args);
export const createCampaign: IApiService['createCampaign'] = (...args) => api.createCampaign(...args);
export const pauseCampaign: IApiService['pauseCampaign'] = (...args) => api.pauseCampaign(...args);
export const getGovernment: IApiService['getGovernment'] = (...args) => api.getGovernment(...args);
export const getElection: IApiService['getElection'] = (...args) => api.getElection(...args);
export const runForElection: IApiService['runForElection'] = (...args) => api.runForElection(...args);
export const castVote: IApiService['castVote'] = (...args) => api.castVote(...args);
export const enactPolicy: IApiService['enactPolicy'] = (...args) => api.enactPolicy(...args);
export const getLoan: IApiService['getLoan'] = (...args) => api.getLoan(...args);
export const borrowCapital: IApiService['borrowCapital'] = (...args) => api.borrowCapital(...args);
export const repayDebt: IApiService['repayDebt'] = (...args) => api.repayDebt(...args);
export const listCities: IApiService['listCities'] = () => api.listCities();
export const getCityStats: IApiService['getCityStats'] = (...args) => api.getCityStats(...args);
export const listCityBuildings: IApiService['listCityBuildings'] = (...args) => api.listCityBuildings(...args);
export const listTiles: IApiService['listTiles'] = (...args) => api.listTiles(...args);
export const getTile: IApiService['getTile'] = (...args) => api.getTile(...args);
export const purchaseTile: IApiService['purchaseTile'] = (...args) => api.purchaseTile(...args);
export const getSupplyLinks: IApiService['getSupplyLinks'] = (...args) => api.getSupplyLinks(...args);
export const addSupplyLink: IApiService['addSupplyLink'] = (...args) => api.addSupplyLink(...args);
export const removeSupplyLink: IApiService['removeSupplyLink'] = (...args) => api.removeSupplyLink(...args);
export const listPotentialSuppliers: IApiService['listPotentialSuppliers'] = (...args) => api.listPotentialSuppliers(...args);
export const getAutoSellConfigs: IApiService['getAutoSellConfigs'] = (...args) => api.getAutoSellConfigs(...args);
export const setAutoSellConfig: IApiService['setAutoSellConfig'] = (...args) => api.setAutoSellConfig(...args);
export const getBuildingSales: IApiService['getBuildingSales'] = (...args) => api.getBuildingSales(...args);
export const sendChatMessage: IApiService['sendChatMessage'] = (...args) => api.sendChatMessage(...args);
export const getChatMessages: IApiService['getChatMessages'] = (...args) => api.getChatMessages(...args);
export const listDmConversations: IApiService['listDmConversations'] = () => api.listDmConversations();
export const findPlayerByHandle: IApiService['findPlayerByHandle'] = (...args) => api.findPlayerByHandle(...args);
export const subscribeToEvents: IApiService['subscribeToEvents'] = (...args) => api.subscribeToEvents(...args);

export function useApi(): IApiService {
  return api;
}

// Re-use the HTTP base request for these two helpers
const HTTP_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'https://api.ventured.gg/v1';

function httpGet<T>(path: string): Promise<T> {
  return fetch(`${HTTP_BASE}${path}`).then(async (res) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error ?? 'Request failed');
    }
    return res.json() as Promise<T>;
  });
}

export const getTileMarketScore = (cityId: string, tileId: string) =>
  httpGet<TileMarketScore>(`/cities/${cityId}/tiles/${tileId}/market-score`);

export const getDemandUtilization = (cityId: string, historyTicks = 10) =>
  httpGet<{ data: DemandUtilizationPoint[] }>(`/cities/${cityId}/demand-utilization?history_ticks=${historyTicks}`);
