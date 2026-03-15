import { Router } from 'express';
import { stubs, rpc } from '../grpc-client.js';
import { getApiKey, handle } from '../util.js';

const router = Router();

router.get('/government', handle(async (req) => {
  const { city_id = '' } = req.query;
  return rpc(stubs.politics, 'GetGovernment', { city_id }, getApiKey(req));
}));

router.get('/election', handle(async (req) => {
  const { city_id = '' } = req.query;
  return rpc(stubs.politics, 'GetElection', { city_id }, getApiKey(req));
}));

router.post('/run', handle(async (req) => {
  const { election_id } = req.body;
  return rpc(stubs.politics, 'RunForElection', { election_id }, getApiKey(req));
}));

router.post('/policy', handle(async (req) => {
  const { city_id = '', consumer_tax_rate = 0, profit_tax_rate = 0, land_tax_rate = 0, employee_tax_rate = 0 } = req.body;
  return rpc(stubs.politics, 'EnactPolicy',
    { city_id, consumer_tax_rate, profit_tax_rate, land_tax_rate, employee_tax_rate },
    getApiKey(req));
}));

router.post('/vote', handle(async (req) => {
  const { election_id = '', candidate_id = '' } = req.body;
  return rpc(stubs.politics, 'CastVote', { election_id, candidate_id }, getApiKey(req));
}));

export default router;

