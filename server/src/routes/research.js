import { Router } from 'express';
import { stubs, rpc } from '../grpc-client.js';
import { getApiKey, handle, toProtoEnum } from '../util.js';

const router = Router();

router.get('/', handle(async (req) => {
  return rpc(stubs.research, 'ListResearch', {}, getApiKey(req));
}));

router.get('/:type', handle(async (req) => {
  return rpc(stubs.research, 'GetProgress', {
    resource_type: toProtoEnum('resource_type', req.params.type),
  }, getApiKey(req));
}));

router.post('/', handle(async (req) => {
  const { resource_type, workers_assigned = 0, budget_per_tick = 0 } = req.body;
  return rpc(stubs.research, 'StartResearch', {
    resource_type: toProtoEnum('resource_type', resource_type),
    workers_assigned,
    budget_per_tick,
  }, getApiKey(req));
}));

router.put('/:id/pause', handle(async (req) => {
  const { pause = true } = req.body;
  return rpc(stubs.research, 'PauseResearch',
    { project_id: req.params.id, pause },
    getApiKey(req));
}));

export default router;
