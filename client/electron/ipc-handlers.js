import { ipcMain, BrowserWindow } from 'electron';
import { stubs, rpc, makeMeta } from '../../server/src/grpc-client.js';
import { toProtoEnum, normalizeResponse } from '../../server/src/util.js';

function sendToRenderer(channel, data) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, data);
  }
}

// Reference-counted event stream (multiple components can subscribe, one gRPC stream)
let streamState = { stream: null, count: 0 };

function handle(channel, fn) {
  ipcMain.handle(channel, async (_, data) => {
    try {
      return await fn(data);
    } catch (err) {
      throw new Error(err.details ?? err.message ?? 'Unknown error');
    }
  });
}

export function registerIpcHandlers() {
  // ─── Player ───────────────────────────────────────────────────────────────
  handle('api:registerPlayer', async ({ username }) =>
    normalizeResponse(await rpc(stubs.player, 'Register', { username, city_id: '' }, '')));

  handle('api:getProfile', async ({ apiKey }) =>
    normalizeResponse(await rpc(stubs.player, 'GetProfile', {}, apiKey)));

  handle('api:getInventory', async ({ building_id = '', apiKey }) =>
    normalizeResponse(await rpc(stubs.player, 'GetInventory', { building_id }, apiKey)));

  handle('api:getCompanyHistory', async ({ limit = 60, apiKey }) =>
    normalizeResponse(await rpc(stubs.player, 'GetCompanyHistory', { limit }, apiKey)));

  // ─── Buildings ────────────────────────────────────────────────────────────
  handle('api:listBuildings', async ({ apiKey }) =>
    normalizeResponse(await rpc(stubs.building, 'ListBuildings', {}, apiKey)));

  handle('api:getBuilding', async ({ building_id, apiKey }) =>
    normalizeResponse(await rpc(stubs.building, 'GetStatus', { building_id }, apiKey)));

  handle('api:constructBuilding', async ({ city_id, building_type, name, tile_id, apiKey }) =>
    normalizeResponse(await rpc(stubs.building, 'Construct', {
      city_id, name, tile_id,
      building_type: toProtoEnum('building_type', building_type),
    }, apiKey)));

  handle('api:configureBuilding', async ({ building_id, recipe_id, workers_assigned, apiKey }) =>
    normalizeResponse(await rpc(stubs.building, 'Configure', { building_id, recipe_id, workers_assigned }, apiKey)));

  handle('api:listRecipes', async ({ type = '', apiKey }) =>
    normalizeResponse(await rpc(stubs.building, 'ListRecipes', {
      building_type: toProtoEnum('building_type', type),
    }, apiKey)));

  handle('api:getSupplyLinks', async ({ building_id, apiKey }) =>
    normalizeResponse(await rpc(stubs.building, 'GetSupplyLinks', { building_id }, apiKey)));

  handle('api:addSupplyLink', async ({ building_id, resource_type, supplier_building_id, apiKey }) =>
    normalizeResponse(await rpc(stubs.building, 'AddSupplyLink', {
      consumer_building_id: building_id,
      resource_type: toProtoEnum('resource_type', resource_type),
      supplier_building_id,
    }, apiKey)));

  handle('api:removeSupplyLink', async ({ supply_link_id, apiKey }) =>
    normalizeResponse(await rpc(stubs.building, 'RemoveSupplyLink', { supply_link_id }, apiKey)));

  handle('api:listPotentialSuppliers', async ({ city_id, resource_type, apiKey }) =>
    normalizeResponse(await rpc(stubs.building, 'ListPotentialSuppliers', {
      city_id,
      resource_type: toProtoEnum('resource_type', resource_type),
    }, apiKey)));

  handle('api:getAutoSellConfigs', async ({ building_id, apiKey }) =>
    normalizeResponse(await rpc(stubs.building, 'GetAutoSellConfigs', { building_id }, apiKey)));

  handle('api:setAutoSellConfig', async ({ building_id, resource_type, price_per_unit, is_enabled, apiKey }) =>
    normalizeResponse(await rpc(stubs.building, 'SetAutoSellConfig', {
      building_id,
      resource_type: toProtoEnum('resource_type', resource_type),
      price_per_unit,
      is_enabled,
    }, apiKey)));

  handle('api:getBuildingSales', async ({ building_id, history_ticks = 20, apiKey }) =>
    normalizeResponse(await rpc(stubs.building, 'GetBuildingSales', { building_id, history_ticks }, apiKey)));

  // ─── Market ───────────────────────────────────────────────────────────────
  handle('api:listOfferings', async ({ city_id = '', resource_type = '', apiKey }) =>
    normalizeResponse(await rpc(stubs.market, 'ListOfferings', {
      city_id,
      resource_type: toProtoEnum('resource_type', resource_type),
    }, apiKey)));

  handle('api:cancelOffering', async ({ offering_id, apiKey }) =>
    normalizeResponse(await rpc(stubs.market, 'CancelOffering', { offering_id }, apiKey)));

  handle('api:purchase', async ({ buyer_building_id, offering_id, quantity, apiKey }) =>
    normalizeResponse(await rpc(stubs.market, 'Purchase', { buyer_building_id, offering_id, quantity }, apiKey)));

  handle('api:getMarketShare', async ({ city_id = '', resource_type = '', history_ticks = 20, apiKey }) =>
    normalizeResponse(await rpc(stubs.market, 'GetMarketShare', {
      city_id,
      resource_type: toProtoEnum('resource_type', resource_type),
      history_ticks,
    }, apiKey)));

  // ─── Trade Agreements ─────────────────────────────────────────────────────
  handle('api:listAgreements', async ({ role = '', apiKey }) =>
    normalizeResponse(await rpc(stubs.agreement, 'List', {
      role: toProtoEnum('role', role),
    }, apiKey)));

  handle('api:createAgreement', async ({
    buyer_player_id, resource_type, discount_rate = 0,
    require_non_competition = false, require_msrp = false, msrp_price = 0,
    disallow_white_labeling = false, expires_at_tick = 0, apiKey,
  }) =>
    normalizeResponse(await rpc(stubs.agreement, 'Create', {
      buyer_player_id,
      resource_type: toProtoEnum('resource_type', resource_type),
      discount_rate,
      require_non_competition, require_msrp, msrp_price,
      disallow_white_labeling, expires_at_tick,
    }, apiKey)));

  handle('api:respondAgreement', async ({ agreement_id, response, apiKey }) =>
    normalizeResponse(await rpc(stubs.agreement, 'Respond', {
      agreement_id,
      response: toProtoEnum('response', response),
    }, apiKey)));

  handle('api:cancelAgreement', async ({ agreement_id, apiKey }) =>
    normalizeResponse(await rpc(stubs.agreement, 'Cancel', { agreement_id }, apiKey)));

  // ─── Research ─────────────────────────────────────────────────────────────
  handle('api:listResearch', async ({ apiKey }) =>
    normalizeResponse(await rpc(stubs.research, 'ListResearch', {}, apiKey)));

  handle('api:startResearch', async ({ resource_type, workers_assigned = 0, budget_per_tick = 0, apiKey }) =>
    normalizeResponse(await rpc(stubs.research, 'StartResearch', {
      resource_type: toProtoEnum('resource_type', resource_type),
      workers_assigned,
      budget_per_tick,
    }, apiKey)));

  handle('api:pauseResearch', async ({ project_id, pause, apiKey }) =>
    normalizeResponse(await rpc(stubs.research, 'PauseResearch', { project_id, pause }, apiKey)));

  // ─── Marketing ────────────────────────────────────────────────────────────
  handle('api:listBrands', async ({ apiKey }) =>
    normalizeResponse(await rpc(stubs.marketing, 'ListBrands', {}, apiKey)));

  handle('api:createBrand', async ({ name, resource_type, apiKey }) =>
    normalizeResponse(await rpc(stubs.marketing, 'CreateBrand', {
      name,
      resource_type: toProtoEnum('resource_type', resource_type),
    }, apiKey)));

  handle('api:getBrandValue', async ({ brand_id, apiKey }) =>
    normalizeResponse(await rpc(stubs.marketing, 'GetBrandValue', { brand_id }, apiKey)));

  handle('api:createCampaign', async ({ brand_id, campaign_name, budget_per_tick = 0, workers_allocated = 0, apiKey }) =>
    normalizeResponse(await rpc(stubs.marketing, 'CreateCampaign', {
      brand_id, campaign_name, budget_per_tick, workers_allocated,
    }, apiKey)));

  handle('api:pauseCampaign', async ({ campaign_id, pause, apiKey }) =>
    normalizeResponse(await rpc(stubs.marketing, 'PauseCampaign', { campaign_id, pause }, apiKey)));

  // ─── Politics ─────────────────────────────────────────────────────────────
  handle('api:getGovernment', async ({ city_id = '', apiKey }) =>
    normalizeResponse(await rpc(stubs.politics, 'GetGovernment', { city_id }, apiKey)));

  handle('api:getElection', async ({ city_id = '', apiKey }) =>
    normalizeResponse(await rpc(stubs.politics, 'GetElection', { city_id }, apiKey)));

  handle('api:runForElection', async ({ election_id, apiKey }) =>
    normalizeResponse(await rpc(stubs.politics, 'RunForElection', { election_id }, apiKey)));

  handle('api:enactPolicy', async ({ city_id = '', consumer_tax_rate = 0, profit_tax_rate = 0, land_tax_rate = 0, employee_tax_rate = 0, apiKey }) =>
    normalizeResponse(await rpc(stubs.politics, 'EnactPolicy', {
      city_id, consumer_tax_rate, profit_tax_rate, land_tax_rate, employee_tax_rate,
    }, apiKey)));

  // ─── Chat ─────────────────────────────────────────────────────────────────
  handle('api:sendChatMessage', async ({ content = '', to_player_id = '', apiKey }) =>
    normalizeResponse(await rpc(stubs.chat, 'SendMessage', { content, to_player_id }, apiKey)));

  handle('api:getChatMessages', async ({ city_id = '', to_player_id = '', limit = 50, before_id = '', apiKey }) =>
    normalizeResponse(await rpc(stubs.chat, 'GetMessages', { city_id, to_player_id, limit, before_id }, apiKey)));

  handle('api:listDmConversations', async ({ apiKey }) =>
    normalizeResponse(await rpc(stubs.chat, 'ListDmConversations', {}, apiKey)));

  // ─── Bank ─────────────────────────────────────────────────────────────────
  handle('api:getLoan', async ({ city_id, apiKey }) =>
    normalizeResponse(await rpc(stubs.bank, 'GetLoan', { city_id }, apiKey)));

  handle('api:borrowCapital', async ({ city_id, amount, apiKey }) =>
    normalizeResponse(await rpc(stubs.bank, 'BorrowCapital', { city_id, amount }, apiKey)));

  handle('api:repayDebt', async ({ city_id, amount, apiKey }) =>
    normalizeResponse(await rpc(stubs.bank, 'RepayDebt', { city_id, amount }, apiKey)));

  // ─── Cities ───────────────────────────────────────────────────────────────
  handle('api:listCities', async () =>
    normalizeResponse(await rpc(stubs.city, 'ListCities', {}, '')));

  handle('api:getCityStats', async ({ city_id }) =>
    normalizeResponse(await rpc(stubs.city, 'GetCityStats', { city_id }, '')));

  handle('api:listCityBuildings', async ({ city_id }) =>
    normalizeResponse(await rpc(stubs.city, 'ListCityBuildings', { city_id }, '')));

  // ─── Tiles ────────────────────────────────────────────────────────────────
  handle('api:listTiles', async ({ city_id, min_x = 0, min_y = 0, max_x = 119, max_y = 119 }) =>
    normalizeResponse(await rpc(stubs.tile, 'ListTiles', {
      city_id,
      min_x: Number(min_x),
      min_y: Number(min_y),
      max_x: Number(max_x),
      max_y: Number(max_y),
    }, '')));

  handle('api:getTile', async ({ tile_id }) =>
    normalizeResponse(await rpc(stubs.tile, 'GetTile', { tile_id }, '')));

  handle('api:purchaseTile', async ({ tile_id, apiKey }) =>
    normalizeResponse(await rpc(stubs.tile, 'PurchaseTile', { tile_id }, apiKey)));

  // ─── Events ───────────────────────────────────────────────────────────────
  ipcMain.handle('api:subscribeEvents', (event, { cityId, apiKey }) => {
    streamState.count++;
    if (!streamState.stream) {
      const stream = stubs.events.Subscribe({ city_id: cityId }, makeMeta(apiKey));
      streamState.stream = stream;
      stream.on('data', (data) => sendToRenderer('api:event', normalizeResponse(data)));
      stream.on('error', () => { streamState.stream = null; streamState.count = 0; sendToRenderer('api:event-error', {}); });
      stream.on('end', () => { streamState.stream = null; streamState.count = 0; });
    }
    return true;
  });

  ipcMain.handle('api:unsubscribeEvents', () => {
    streamState.count = Math.max(0, streamState.count - 1);
    if (streamState.count === 0 && streamState.stream) {
      streamState.stream.cancel();
      streamState.stream = null;
    }
  });
}
