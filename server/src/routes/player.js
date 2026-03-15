import { Router } from 'express';
import { stubs, rpc } from '../grpc-client.js';
import { getApiKey, handle } from '../util.js';

const router = Router();

router.post('/register', handle(async (req) => {
  const { username, city_id } = req.body;
  return rpc(stubs.player, 'Register', { username, city_id }, '');
}));

router.get('/profile', handle(async (req) => {
  return rpc(stubs.player, 'GetProfile', {}, getApiKey(req));
}));

router.get('/inventory', handle(async (req) => {
  const { building_id = '' } = req.query;
  return rpc(stubs.player, 'GetInventory', { building_id }, getApiKey(req));
}));

router.get('/performance', handle(async (req) => {
  const limit = Number(req.query.limit) || 60;
  return rpc(stubs.player, 'GetCompanyHistory', { limit }, getApiKey(req));
}));

router.get('/lookup', handle(async (req) => {
  const { handle } = req.query;
  return rpc(stubs.player, 'FindPlayerByHandle', { handle: handle ?? '' }, getApiKey(req));
}));

export default router;
