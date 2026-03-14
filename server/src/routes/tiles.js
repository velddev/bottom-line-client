import { Router } from 'express';
import { stubs, rpc } from '../grpc-client.js';
import { getApiKey, handle } from '../util.js';

const router = Router();

// List tiles within a viewport grid bounds — no auth required
// Query params: city_id, min_x, min_y, max_x, max_y
router.get('/', handle(async (req) => {
  const { city_id, min_x = 0, min_y = 0, max_x = 119, max_y = 119 } = req.query;
  return rpc(stubs.tile, 'ListTiles', {
    city_id,
    min_x: Number(min_x),
    min_y: Number(min_y),
    max_x: Number(max_x),
    max_y: Number(max_y),
  }, '');
}));

// Get a single tile — no auth required
router.get('/:id', handle(async (req) => {
  return rpc(stubs.tile, 'GetTile', { tile_id: req.params.id }, '');
}));

// Purchase a tile — requires auth
router.post('/:id/purchase', handle(async (req) => {
  const apiKey = getApiKey(req);
  return rpc(stubs.tile, 'PurchaseTile', { tile_id: req.params.id }, apiKey);
}));

export default router;
