import { Router } from 'express';
import { stubs, rpc } from '../grpc-client.js';
import { handle } from '../util.js';

const router = Router();

// Returns all configured auth methods and their client IDs
router.get('/methods', handle(async (_req) => {
  return rpc(stubs.auth, 'GetAuthMethods', {}, '');
}));

// Returns the OAuth client_id for the given provider (used by web/Activity clients)
router.get('/client-id', handle(async (req) => {
  const provider = req.query.provider ?? 'DISCORD';
  return rpc(stubs.auth, 'GetOAuthClientId', { provider }, '');
}));

// Exchanges an OAuth authorization code for a player_id + api_key
router.post('/exchange', handle(async (req) => {
  const { provider = 'DISCORD', code, redirect_uri, display_name = '' } = req.body;
  return rpc(stubs.auth, 'ExchangeOAuthCode', { provider, code, redirect_uri, display_name }, '');
}));

// OAuth callback — receives the ?code= redirect from Discord and forwards it to
// the opener window via postMessage, then closes itself.
router.get('/callback', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html><html><body><script>
    const code = new URLSearchParams(window.location.search).get('code');
    if (code && window.opener) {
      window.opener.postMessage({ type: 'discord-oauth-code', code }, window.location.origin);
    }
    window.close();
  </script></body></html>`);
});

export default router;
