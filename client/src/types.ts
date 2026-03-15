// ─── Proto message types ───────────────────────────────────────────────────

export interface PlayerProfile {
  player_id: string;
  username: string;
  balance: number;
  public_perception: number;
  city_id: string;
  joined_at_tick: number;
}

export interface InventoryItem {
  building_id: string;
  building_name: string;
  resource_type: string;
  quantity: number;
  quality: number;
  brand_id: string;
}

export interface BuildingStatus {
  building_id: string;
  name: string;
  building_type: string;
  status: string;
  active_recipe: string;
  workers: number;
  level: number;
  ticks_to_ready: number;
  tile_id: string;       // empty = not placed on a tile
  tile_grid_x: number;
  tile_grid_y: number;
  construction_ticks_remaining: number; // > 0 only when status === 'under_construction'
  output_type: string;   // normalized resource type string, e.g. 'cattle', 'grain', '' if no recipe
  population_capacity: number; // citizens housed (residential buildings only; 0 otherwise)
}

export interface RecipeInfo {
  recipe_id: string;
  name: string;
  building_type: string;
  output_type: string;
  output_min: number;
  output_max: number;
  ticks_required: number;
  ingredients: IngredientInfo[];
}

export interface IngredientInfo {
  resource_type: string;
  quantity: number;
}

export interface Offering {
  offering_id: string;
  seller_name: string;
  resource_type: string;
  price_per_unit: number;
  quantity: number;
  quality: number;
  brand_name: string;
  visibility: string;
}

export interface AgreementSummary {
  agreement_id: string;
  creator_player_id: string;
  buyer_player_id: string;
  resource_type: string;
  discount_rate: number;
  status: string;
  require_non_competition: boolean;
  require_msrp: boolean;
  msrp_price: number;
  disallow_white_labeling: boolean;
  expires_at_tick: number;
}

export interface ResearchProgress {
  project_id: string;
  resource_type: string;
  level: number;
  progress: number;
  is_active: boolean;
  budget_per_tick: number;
  workers: number;
}

export interface BrandSummary {
  brand_id: string;
  name: string;
  resource: string;
  brand_weight: number;
  market_share: number;
}

export interface BrandValueResponse {
  brand_id: string;
  brand_name: string;
  resource_category: string;
  brand_weight: number;
  market_share: number;
}

export interface GovernmentInfo {
  ruling_player_id: string;
  ruling_player_name: string;
  consumer_tax_rate: number;
  profit_tax_rate: number;
  land_tax_rate: number;
  employee_tax_rate: number;
  approval_city: number;
  approval_people: number;
  approval_business: number;
  term_start_tick: number;
  term_end_tick: number;
}

export interface ElectionInfo {
  election_id: string;
  status: string;
  voting_start: number;
  voting_end: number;
  winner_player_id: string;
  last_polled_tick: number;
  player_has_voted: boolean;
  candidates: CandidateInfo[];
}

export interface CandidateInfo {
  player_id: string;
  player_name: string;
  perception: number;
  votes: number;
  player_votes: number;
  citizen_votes: number;
  poll_percent: number;
}

// ─── City ─────────────────────────────────────────────────────────────────────

export interface CityInfo {
  city_id: string;
  name: string;
  population: number;
  gdp_per_tick: number;
  current_tick: number;
}

export interface CityStats extends CityInfo {
  building_count: number;
  player_count: number;
}

export interface CityBuildingInfo {
  building_id: string;
  name: string;
  owner_name: string;
  building_type: string;
  status: string;
  level: number;
  is_government: boolean;
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  message_id: string;
  city_id: string;
  from_player_id: string;
  from_player_name: string;
  to_player_id: string;    // empty = public city chat
  to_player_name: string;
  content: string;
  sent_at_tick: number;
  created_at: { seconds: number; nanos: number };
}

/** Subset of ChatMessage carried inside the SSE event stream */
export interface ChatMessageEvent {
  message_id: string;
  from_player_id: string;
  from_player_name: string;
  to_player_id: string;
  to_player_name: string;
  content: string;
  sent_at_tick: number;
}

export interface DmConversation {
  partner_player_id: string;
  partner_player_name: string;
  last_message: string;
  last_sent_at_tick: number;
}

export interface GameEvent {
  event_id: string;
  tick: number;
  occurred_at: { seconds: number; nanos: number };
  tick_completed?: { city_id: string };
  resource_produced?: { building_id: string; player_id: string; resource_type: string; quantity: number; quality: number };
  trade_completed?: { buyer_building_id: string; seller_building_id: string; resource_type: string; quantity: number; total_price: number };
  market_price_changed?: { city_id: string; resource_type: string; old_median_price: number; new_median_price: number };
  building_constructed?: { building_id: string; player_id: string; building_type: string; building_name: string; city_id: string };
  building_construction_started?: { city_id: string; building_id: string; player_id: string; building_name: string; building_type: string; construction_ticks_remaining: number };
  building_status_changed?: { city_id: string; building_id: string; player_id: string; building_name: string; building_type: string; old_status: string; new_status: string };
  election_announced?: { election_id: string; city_id: string; voting_start_tick: number };
  election_concluded?: { election_id: string; city_id: string; winner_player_id: string };
  agreement_changed?: { agreement_id: string; creator_player_id: string; buyer_player_id: string; new_status: string };
  brand_value_changed?: { brand_id: string; player_id: string; resource_category: string; old_weight: number; new_weight: number };
  taxes_collected?: { city_id: string; total_collected: number };
  tile_changed?: { city_id: string; tile_id: string; grid_x: number; grid_y: number; owner_player_id: string; owner_name: string; is_for_sale: boolean; purchase_price: number; building_id: string; building_name: string; building_type: string; building_status: string };
  chat_message?: ChatMessageEvent;
}

// ─── Tiles ────────────────────────────────────────────────────────────────────

export interface TileInfo {
  tile_id: string;
  city_id: string;
  grid_x: number;
  grid_y: number;
  owner_player_id: string;        // empty string = government
  owner_name: string;
  is_reserved_for_citizens: boolean;
  is_for_sale: boolean;
  purchase_price: number;
  building_id: string;            // empty string = no building
  building_name: string;
  building_type: string;
  building_status: string;
}

export interface ListTilesResponse {
  tiles: TileInfo[];
  tile_origin_lat: number;
  tile_origin_lon: number;
  tile_grid_cols: number;
  tile_grid_rows: number;
  tile_size_meters: number;
}

export interface MarketShareDataPoint {
  player_id: string;
  player_name: string;
  resource_type: string;
  sale_volume: number;
  share_percent: number;
  tick: number;
}

export interface MarketShareResponse {
  data: MarketShareDataPoint[];
}

export interface LoanInfo {
  balance: number;
  interest_rate: number;
  interest_per_tick: number;
  max_borrow: number;
  player_balance: number;
}

export interface LoanActionResponse {
  new_loan_balance: number;
  player_balance: number;
  message: string;
}

export interface SupplyLinkInfo {
  supply_link_id: string;
  consumer_building_id: string;
  resource_type: string;
  supplier_building_id: string;
  supplier_building_name: string;
  supplier_tile_x: number;
  supplier_tile_y: number;
  priority: number;
  supplier_current_price: number;
}

export interface PotentialSupplier {
  building_id: string;
  building_name: string;
  tile_x: number;
  tile_y: number;
  owner_name: string;
  price_per_unit: number;
  quantity_available: number;
}

export interface AutoSellConfigInfo {
  resource_type: string;
  price_per_unit: number;
  is_enabled: boolean;
}

export interface SalesTick {
  tick: number;
  resource_type: string;
  sale_volume: number;
  revenue_cents: number;
}

export interface GetBuildingSalesResponse {
  ticks: SalesTick[];
}

export interface CompanyTickSnapshot {
  tick: number;
  store_revenue_cents: number;
  supply_line_sales_cents: number;
  consumer_tax_cents: number;
  land_tax_cents: number;
  supply_purchases_cents: number;
  marketing_spend_cents: number;
  research_spend_cents: number;
  loan_interest_cents: number;
  total_revenue_cents: number;
  total_expenses_cents: number;
  net_profit_cents: number;
  balance_before_tick: number;
  balance_after_tick: number;
}

// ─── UI helpers ───────────────────────────────────────────────────────────

export const BUILDING_TYPES = ['factory', 'field', 'store', 'warehouse'] as const;
export const BUILDING_ICONS: Record<string, string> = {
  factory: '🏭', field: '🌾', store: '🏪', warehouse: '📦', landmark: '🏛️', bank: '🏦',
  residential_low: '🏠', residential_medium: '🏘️', residential_high: '🏙️',
};

export interface TileMarketScore {
  score: number;
  best_allowed_tier: string; // e.g. 'residential_high'
}

export interface DemandUtilizationPoint {
  resource_type: string;
  total_demand: number;
  fulfilled_demand: number;
  utilization_pct: number;
  tick: number;
}

export const RESOURCE_COLORS: Record<string, string> = {
  grain:       'text-yellow-400',
  water:       'text-blue-400',
  animal_feed: 'text-lime-400',
  cattle:      'text-orange-400',
  meat:        'text-red-400',
  leather:     'text-amber-500',
  food:        'text-green-400',
};

export function resourceColor(r: string): string {
  return RESOURCE_COLORS[r.toLowerCase()] ?? 'text-slate-300';
}

export function fmtMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function fmtQuality(q: number): string {
  return q.toFixed(2);
}
