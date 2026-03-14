import { Router } from 'express';
import { stubs, rpc } from '../grpc-client.js';
import { getApiKey, handle } from '../util.js';

const router = Router();

router.get('/loan', handle(async (req) => {
  const { city_id = '' } = req.query;
  return rpc(stubs.bank, 'GetLoan', { city_id }, getApiKey(req));
}));

router.post('/borrow', handle(async (req) => {
  const { city_id, amount } = req.body;
  return rpc(stubs.bank, 'BorrowCapital', { city_id, amount }, getApiKey(req));
}));

router.post('/repay', handle(async (req) => {
  const { city_id, amount } = req.body;
  return rpc(stubs.bank, 'RepayDebt', { city_id, amount }, getApiKey(req));
}));

export default router;
