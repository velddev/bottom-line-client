import { Router } from 'express';
import { stubs, rpc } from '../grpc-client.js';
import { getApiKey, handle, toProtoEnum } from '../util.js';

const router = Router();

router.get('/', handle(async (req) => {
  return rpc(stubs.building, 'ListBuildings', {}, getApiKey(req));
}));

router.post('/', handle(async (req) => {
  const { city_id, building_type, name, tile_id } = req.body;
  return rpc(stubs.building, 'Construct', {
    city_id, name, tile_id,
    building_type: toProtoEnum('building_type', building_type),
  }, getApiKey(req));
}));

// List available recipes (optionally filtered by building type)
router.get('/recipes', handle(async (req) => {
  const { type = '' } = req.query;
  return rpc(stubs.building, 'ListRecipes', {
    building_type: toProtoEnum('building_type', type),
  }, getApiKey(req));
}));

// Supply link management
router.get('/:id/supply-links', handle(async (req) => {
  return rpc(stubs.building, 'GetSupplyLinks', { building_id: req.params.id }, getApiKey(req));
}));

router.post('/:id/supply-links', handle(async (req) => {
  const { resource_type, supplier_building_id } = req.body;
  return rpc(stubs.building, 'AddSupplyLink', {
    consumer_building_id: req.params.id,
    resource_type: toProtoEnum('resource_type', resource_type),
    supplier_building_id,
  }, getApiKey(req));
}));

router.delete('/supply-links/:linkId', handle(async (req) => {
  return rpc(stubs.building, 'RemoveSupplyLink', { supply_link_id: req.params.linkId }, getApiKey(req));
}));

router.get('/potential-suppliers', handle(async (req) => {
  const { city_id, resource_type } = req.query;
  return rpc(stubs.building, 'ListPotentialSuppliers', {
    city_id,
    resource_type: toProtoEnum('resource_type', resource_type),
  }, getApiKey(req));
}));

router.get('/:id/auto-sell', handle(async (req) => {
  return rpc(stubs.building, 'GetAutoSellConfigs', { building_id: req.params.id }, getApiKey(req));
}));

router.put('/:id/auto-sell', handle(async (req) => {
  const { resource_type, price_per_unit, is_enabled } = req.body;
  return rpc(stubs.building, 'SetAutoSellConfig', {
    building_id: req.params.id,
    resource_type: toProtoEnum('resource_type', resource_type),
    price_per_unit,
    is_enabled,
  }, getApiKey(req));
}));

router.get('/:id/sales', handle(async (req) => {
  const history_ticks = parseInt(req.query.history_ticks ?? '20', 10);
  return rpc(stubs.building, 'GetBuildingSales', {
    building_id: req.params.id,
    history_ticks,
  }, getApiKey(req));
}));

router.get('/tile-market-score', handle(async (req) => {
  const { city_id = '', tile_id = '' } = req.query;
  return rpc(stubs.building, 'GetTileMarketScore', { city_id, tile_id }, getApiKey(req));
}));

router.get('/:id', handle(async (req) => {
  return rpc(stubs.building, 'GetStatus', { building_id: req.params.id }, getApiKey(req));
}));

router.put('/:id/configure', handle(async (req) => {
  const { recipe_id = '', workers_assigned = 0 } = req.body;
  return rpc(stubs.building, 'Configure',
    { building_id: req.params.id, recipe_id, workers_assigned },
    getApiKey(req));
}));

export default router;
