import { Router } from 'express';
import { stubs, rpc } from '../grpc-client.js';
import { getApiKey, handle } from '../util.js';

const router = Router();

router.get('/', handle(async (req) => {
  return rpc(stubs.building, 'ListBuildings', {}, getApiKey(req));
}));

router.post('/', handle(async (req) => {
  const { city_id, building_type, name, tile_id } = req.body;
  return rpc(stubs.building, 'Construct', { city_id, building_type, name, tile_id }, getApiKey(req));
}));

// List available recipes (optionally filtered by building type)
router.get('/recipes', handle(async (req) => {
  const { type = '' } = req.query;
  return rpc(stubs.building, 'ListRecipes', { building_type: type }, getApiKey(req));
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
