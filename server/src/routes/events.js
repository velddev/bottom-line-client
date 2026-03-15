import { Router } from 'express';
import { stubs, makeMeta } from '../grpc-client.js';
import { normalizeResponse } from '../util.js';

const router = Router();

// SSE stream — passes api_key as query param since EventSource can't set headers
router.get('/stream', (req, res) => {
  const apiKey = req.query.api_key ?? '';
  const cityId = req.query.city_id ?? '';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Heartbeat to keep connection alive through proxies
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);

  const stream = stubs.events.Subscribe({ city_id: cityId }, makeMeta(apiKey));

  stream.on('data', (event) => {
    res.write(`data: ${JSON.stringify(normalizeResponse(event))}\n\n`);
  });

  stream.on('error', (err) => {
    console.error('Event stream error:', err.message);
    res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
    clearInterval(heartbeat);
    res.end();
  });

  stream.on('end', () => {
    clearInterval(heartbeat);
    res.end();
  });

  req.on('close', () => {
    clearInterval(heartbeat);
    stream.cancel();
  });
});

export default router;
