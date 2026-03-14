import { grpcErrToHttp } from './grpc-client.js';

export function getApiKey(req) {
  const auth = req.headers.authorization ?? '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

/** Wraps an async route handler with standard error handling. */
export function handle(fn) {
  return async (req, res) => {
    try {
      const result = await fn(req);
      res.json(result);
    } catch (err) {
      const status = grpcErrToHttp(err);
      res.status(status).json({ error: err.details ?? err.message ?? 'Unknown error' });
    }
  };
}
