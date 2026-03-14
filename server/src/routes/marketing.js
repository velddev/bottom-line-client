import { Router } from 'express';
import { stubs, rpc } from '../grpc-client.js';
import { getApiKey, handle } from '../util.js';

const router = Router();

router.get('/brands', handle(async (req) => {
  return rpc(stubs.marketing, 'ListBrands', {}, getApiKey(req));
}));

router.post('/brands', handle(async (req) => {
  const { name, resource_type } = req.body;
  return rpc(stubs.marketing, 'CreateBrand', { name, resource_type }, getApiKey(req));
}));

router.get('/brands/:id/value', handle(async (req) => {
  return rpc(stubs.marketing, 'GetBrandValue', { brand_id: req.params.id }, getApiKey(req));
}));

router.post('/campaigns', handle(async (req) => {
  const { brand_id, campaign_name, budget_per_tick = 0, workers_allocated = 0 } = req.body;
  return rpc(stubs.marketing, 'CreateCampaign',
    { brand_id, campaign_name, budget_per_tick, workers_allocated },
    getApiKey(req));
}));

router.put('/campaigns/:id/pause', handle(async (req) => {
  const { pause = true } = req.body;
  return rpc(stubs.marketing, 'PauseCampaign',
    { campaign_id: req.params.id, pause },
    getApiKey(req));
}));

export default router;
