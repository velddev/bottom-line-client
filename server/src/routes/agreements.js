import { Router } from 'express';
import { stubs, rpc } from '../grpc-client.js';
import { getApiKey, handle, toProtoEnum } from '../util.js';

const router = Router();

router.get('/', handle(async (req) => {
  const { role = '' } = req.query;
  return rpc(stubs.agreement, 'List', {
    role: toProtoEnum('role', role),
  }, getApiKey(req));
}));

router.post('/', handle(async (req) => {
  const {
    buyer_player_id, resource_type, discount_rate = 0,
    require_non_competition = false, require_msrp = false, msrp_price = 0,
    disallow_white_labeling = false, expires_at_tick = 0,
  } = req.body;
  return rpc(stubs.agreement, 'Create', {
    buyer_player_id,
    resource_type: toProtoEnum('resource_type', resource_type),
    discount_rate,
    require_non_competition, require_msrp, msrp_price,
    disallow_white_labeling, expires_at_tick,
  }, getApiKey(req));
}));

router.put('/:id/respond', handle(async (req) => {
  const { response } = req.body;
  return rpc(stubs.agreement, 'Respond', {
    agreement_id: req.params.id,
    response: toProtoEnum('response', response),
  }, getApiKey(req));
}));

router.delete('/:id', handle(async (req) => {
  return rpc(stubs.agreement, 'Cancel', { agreement_id: req.params.id }, getApiKey(req));
}));

export default router;
