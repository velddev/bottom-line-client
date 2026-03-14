import { Router } from 'express';
import { stubs, rpc } from '../grpc-client.js';
import { getApiKey, handle } from '../util.js';

const router = Router();

router.get('/offerings', handle(async (req) => {
  const { city_id = '', resource_type = '' } = req.query;
  return rpc(stubs.market, 'ListOfferings', { city_id, resource_type }, getApiKey(req));
}));

router.post('/offerings', handle(async (req) => {
  const { building_id, resource_type, price_per_unit, quantity, visibility = 'public', trade_agreement_id = '' } = req.body;
  return rpc(stubs.market, 'CreateOffering',
    { building_id, resource_type, price_per_unit, quantity, visibility, trade_agreement_id },
    getApiKey(req));
}));

router.delete('/offerings/:id', handle(async (req) => {
  return rpc(stubs.market, 'CancelOffering', { offering_id: req.params.id }, getApiKey(req));
}));

router.post('/purchase', handle(async (req) => {
  const { buyer_building_id, offering_id, quantity } = req.body;
  return rpc(stubs.market, 'Purchase', { buyer_building_id, offering_id, quantity }, getApiKey(req));
}));

router.get('/share', handle(async (req) => {
  const { city_id = '', resource_type = '', history_ticks = 20 } = req.query;
  return rpc(stubs.market, 'GetMarketShare',
    { city_id, resource_type, history_ticks: parseInt(history_ticks, 10) },
    getApiKey(req));
}));

export default router;
