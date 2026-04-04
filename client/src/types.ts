// ─── Proto message types ───────────────────────────────────────────────────

export interface PlayerProfile {
  player_id: string;
  username: string;
  balance: number;
  public_perception: number;
  city_id: string;
  joined_at_tick: number;
  /** True for government and other non-playable system players */
  is_system: boolean;
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

  // Landlord / Rent fields (residential only)
  units: number;                    // rentable units (1/4/20)
  occupied_units: number;           // units with tenants
  rent_per_unit_cents: number;      // monthly rent per unit in cents
  freshness: number;                // 0–100 building condition
  construction_cost_cents: number;  // cost to build in cents
  for_sale_price_cents: number;     // 0 = not listed for sale
  is_renovating: boolean;
  renovation_ticks_remaining: number;
  built_at_tick: number;

  // Citizen wealth class counts (residential only)
  citizens_lower_bottom: number;
  citizens_lower: number;
  citizens_middle: number;
  citizens_upper: number;
  citizens_one_percent: number;
  citizens_point_one_percent: number;
  average_daily_spend_cents: number;
  spending_modifier: number;
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

export interface BuyOrderInfo {
  buy_order_id: string;
  buyer_building_id: string;
  resource_type: string;
  max_price_per_unit: number;
  quantity_per_tick: number;
  visibility: string;
  match_preference: string;
  is_active: boolean;
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

export interface UtilityInfo {
  name: string;
  consumption: number;
  capacity: number;
  rate_cents: number;
  utilization_pct: number;
  is_overloaded: boolean;
  effective_rate_cents: number;
}

export interface UtilitiesResponse {
  utilities: UtilityInfo[];
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
  // Citizen / Property management events
  tenant_rent_default?: { city_id: string; building_id: string; player_id: string; building_name: string; citizen_class: string; count: number };
  tenant_promoted?: { city_id: string; building_id: string; player_id: string; building_name: string; from_class: string; to_class: string; count: number };
  tenant_demoted?: { city_id: string; building_id: string; player_id: string; building_name: string; from_class: string; to_class: string; count: number };
  vacancy_spiral?: { city_id: string; building_id: string; player_id: string; building_name: string; occupancy_pct: number; citizens_left: number };
  tenant_moved_in?: { city_id: string; building_id: string; player_id: string; building_name: string; citizen_class: string; count: number };
  tenant_upgraded_housing?: { city_id: string; building_id: string; player_id: string; building_name: string; citizen_class: string; count: number };
  migration_influx?: { city_id: string; citizen_class: string; count: number; quality_of_life: number };
  migration_exodus?: { city_id: string; citizen_class: string; count: number; quality_of_life: number };
  crime_wave?: { city_id: string; building_id: string; player_id: string; building_name: string; lower_bottom_pct: number };
  spending_modifier_event?: { city_id: string; building_id: string; player_id: string; building_name: string; modifier: number; duration_ticks: number; reason: string };
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
  building_player_id: string;
  building_player_name: string;
  building_level: number;
  /** Tick when construction completes; 0 if already built */
  construction_ready_at_tick: number;
  population_capacity: number;    // residential buildings only
  is_government_port: boolean;
  active_recipe: string;          // recipe id currently in use (empty if none)
  output_type: string;            // resource this building produces (empty if no recipe)
  building_output_types: string[]; // all resource types this building can produce
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

// (Supply links removed — replaced by BuyOrders)

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
  market_sales_revenue_cents: number;
  rental_income_cents: number;
  consumer_tax_cents: number;
  land_tax_cents: number;
  supply_purchases_cents: number;
  marketing_spend_cents: number;
  research_spend_cents: number;
  loan_interest_cents: number;
  transport_fees_cents: number;
  utility_cost_cents: number;
  upkeep_cents: number;
  rental_tax_cents: number;
  total_revenue_cents: number;
  total_expenses_cents: number;
  net_profit_cents: number;
  balance_before_tick: number;
  balance_after_tick: number;
}

// ── Store Insights ───────────────────────────────────────────────────────

export interface ClassPopulation {
  citizen_class: string;
  count: number;
  daily_budget_cents: number;
}

export interface ResourceInsight {
  resource_type: string;
  your_price_cents: number;
  fair_price_cents: number;
  market_avg_cents: number;
  your_quality: number;
  median_quality: number;
  your_brand_share: number;
  daily_demand: number;
  your_last_sale: number;
}

export interface StoreInsightsResponse {
  nearby_population: number;
  nearby_by_class: ClassPopulation[];
  resource_insights: ResourceInsight[];
  tips: string[];
  competitor_count: number;
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

const EPOCH = new Date(2000, 0, 1); // Jan 1, 2000
export function tickToDate(tick: number): string {
  const d = new Date(EPOCH);
  d.setDate(d.getDate() + tick);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
