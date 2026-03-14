import { Router } from 'express';
import { stubs, rpc } from '../grpc-client.js';
import { getApiKey, handle } from '../util.js';

const router = Router();

// List all cities — no auth required
router.get('/', handle(async (_req) => {
  return rpc(stubs.city, 'ListCities', {}, '');
}));

// Economy + population stats for one city — no auth required
router.get('/:id/stats', handle(async (req) => {
  return rpc(stubs.city, 'GetCityStats', { city_id: req.params.id }, '');
}));

// All buildings on the map for a city — no auth required
router.get('/:id/buildings', handle(async (req) => {
  return rpc(stubs.city, 'ListCityBuildings', { city_id: req.params.id }, '');
}));

export default router;
