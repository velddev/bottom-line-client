import { Router } from 'express';
import { stubs, rpc, makeMeta, grpcErrToHttp } from '../grpc-client.js';
import { normalizeResponse } from '../util.js';

const router = Router();

// POST /api/chat/send — send a public city message or DM
router.post('/send', async (req, res) => {
  const { content = '', to_player_id = '', apiKey } = req.body;
  try {
    const resp = await rpc(stubs.chat, 'SendMessage', { content, to_player_id }, apiKey);
    res.json(normalizeResponse(resp));
  } catch (err) {
    res.status(grpcErrToHttp(err)).json({ error: err.details ?? err.message });
  }
});

// GET /api/chat/messages?city_id=&to_player_id=&limit=&before_id=
router.get('/messages', async (req, res) => {
  const { city_id = '', to_player_id = '', limit = '50', before_id = '', apiKey } = req.query;
  try {
    const resp = await rpc(stubs.chat, 'GetMessages', {
      city_id,
      to_player_id,
      limit: parseInt(limit, 10),
      before_id,
    }, apiKey);
    res.json(normalizeResponse(resp));
  } catch (err) {
    res.status(grpcErrToHttp(err)).json({ error: err.details ?? err.message });
  }
});

// GET /api/chat/conversations — list DM conversation threads for the current player
router.get('/conversations', async (req, res) => {
  const { apiKey } = req.query;
  try {
    const resp = await rpc(stubs.chat, 'ListDmConversations', {}, apiKey);
    res.json(normalizeResponse(resp));
  } catch (err) {
    res.status(grpcErrToHttp(err)).json({ error: err.details ?? err.message });
  }
});

export default router;
