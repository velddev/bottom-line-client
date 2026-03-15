import type {
  PlayerProfile, BuildingStatus, RecipeInfo, Offering,
  AgreementSummary, ResearchProgress, BrandSummary, BrandValueResponse,
  GovernmentInfo, ElectionInfo, CityInfo, CityStats, CityBuildingInfo,
  TileInfo, ListTilesResponse, MarketShareResponse, LoanInfo, LoanActionResponse,
  SupplyLinkInfo, PotentialSupplier, AutoSellConfigInfo, GetBuildingSalesResponse,
  CompanyTickSnapshot, GameEvent, ChatMessage, DmConversation, RoadNetworkResponse,
} from './types';

export interface IApiService {
  registerPlayer(username: string): Promise<{ player_id: string; api_key: string }>;
  getProfile(): Promise<PlayerProfile>;
  getInventory(building_id?: string): Promise<{ items: { building_id: string; building_name: string; resource_type: string; quantity: number; quality: number; brand_id: string }[] }>;
  getCompanyHistory(limit?: number): Promise<{ snapshots: CompanyTickSnapshot[] }>;
  listBuildings(): Promise<{ buildings: BuildingStatus[] }>;
  getBuilding(id: string): Promise<BuildingStatus>;
  constructBuilding(city_id: string, building_type: string, name: string, tile_id: string): Promise<{ building_id: string; construction_ticks_remaining: number }>;
  configureBuilding(id: string, recipe_id: string, workers_assigned: number): Promise<{ success: boolean }>;
  listRecipes(type?: string): Promise<{ recipes: RecipeInfo[] }>;
  listOfferings(city_id: string, resource_type?: string): Promise<{ offerings: Offering[] }>;
  cancelOffering(id: string): Promise<{ success: boolean }>;
  purchase(buyer_building_id: string, offering_id: string, quantity: number): Promise<{ total_paid: number; quality: number }>;
  getMarketShare(city_id: string, resource_type?: string, history_ticks?: number): Promise<MarketShareResponse>;
  listAgreements(role?: string): Promise<{ agreements: AgreementSummary[] }>;
  createAgreement(data: {
    buyer_player_id: string; resource_type: string; discount_rate: number;
    require_non_competition: boolean; require_msrp: boolean; msrp_price: number;
    disallow_white_labeling: boolean; expires_at_tick: number;
  }): Promise<{ agreement_id: string }>;
  respondAgreement(id: string, response: string): Promise<{ success: boolean }>;
  cancelAgreement(id: string): Promise<{ success: boolean }>;
  listResearch(): Promise<{ projects: ResearchProgress[] }>;
  startResearch(resource_type: string, workers_assigned: number, budget_per_tick: number): Promise<{ project_id: string }>;
  pauseResearch(id: string, pause: boolean): Promise<{ success: boolean }>;
  listBrands(): Promise<{ brands: BrandSummary[] }>;
  createBrand(name: string, resource_type: string): Promise<{ brand_id: string }>;
  getBrandValue(id: string): Promise<BrandValueResponse>;
  createCampaign(brand_id: string, campaign_name: string, budget_per_tick: number, workers_allocated: number): Promise<{ campaign_id: string }>;
  pauseCampaign(id: string, pause: boolean): Promise<{ success: boolean }>;
  getGovernment(city_id?: string): Promise<GovernmentInfo>;
  getElection(city_id?: string): Promise<ElectionInfo>;
  runForElection(election_id: string): Promise<{ success: boolean; message: string }>;
  castVote(election_id: string, candidate_id: string): Promise<{ success: boolean; message: string }>;
  enactPolicy(city_id: string, consumer_tax_rate: number, profit_tax_rate: number, land_tax_rate: number, employee_tax_rate: number): Promise<{ success: boolean; message: string }>;
  getLoan(city_id: string): Promise<LoanInfo>;
  borrowCapital(city_id: string, amount: number): Promise<LoanActionResponse>;
  repayDebt(city_id: string, amount: number): Promise<LoanActionResponse>;
  listCities(): Promise<{ cities: CityInfo[] }>;
  getCityStats(city_id: string): Promise<CityStats>;
  listCityBuildings(city_id: string): Promise<{ buildings: CityBuildingInfo[] }>;
  listTiles(city_id: string, min_x: number, min_y: number, max_x: number, max_y: number): Promise<ListTilesResponse>;
  getTile(tile_id: string): Promise<TileInfo>;
  purchaseTile(tile_id: string): Promise<{ tile_id: string; new_balance: number }>;
  getRoadNetwork(): Promise<RoadNetworkResponse>;
  getSupplyLinks(buildingId: string): Promise<{ links: SupplyLinkInfo[] }>;
  addSupplyLink(buildingId: string, resourceType: string, supplierBuildingId: string): Promise<{ supply_link_id: string }>;
  removeSupplyLink(linkId: string): Promise<{ success: boolean }>;
  listPotentialSuppliers(cityId: string, resourceType: string): Promise<{ suppliers: PotentialSupplier[] }>;
  getAutoSellConfigs(buildingId: string): Promise<{ configs: AutoSellConfigInfo[] }>;
  setAutoSellConfig(buildingId: string, resource_type: string, price_per_unit: number, is_enabled: boolean): Promise<{ success: boolean }>;
  getBuildingSales(buildingId: string, historyTicks?: number): Promise<GetBuildingSalesResponse>;
  // ─── Chat ─────────────────────────────────────────────────────────────────
  sendChatMessage(content: string, to_player_id?: string): Promise<{ success: boolean; message: string }>;
  getChatMessages(city_id: string, to_player_id?: string, limit?: number, before_id?: string): Promise<{ messages: ChatMessage[] }>;
  listDmConversations(): Promise<{ conversations: DmConversation[] }>;
  subscribeToEvents(
    cityId: string,
    apiKey: string,
    onEvent: (event: GameEvent) => void,
    onConnect?: () => void,
    onDisconnect?: () => void,
  ): () => void;
}
