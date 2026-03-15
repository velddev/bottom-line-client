import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { join } from 'path';

// PROTO_PATH is injected by Electron when running in the app.
// When running the server standalone, fall back to a path relative to cwd.
const PROTO_PATH = process.env.PROTO_PATH ?? join(process.cwd(), '..', 'trademmo.proto');

const packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: Number,
  enums: String,
  defaults: true,
  oneofs: true,
});

const proto = grpc.loadPackageDefinition(packageDef).trademmo;
const creds = grpc.credentials.createSsl();
const TARGET = 'api.ventured.gg:443';

export const stubs = {
  auth:      new proto.AuthService(TARGET, creds),
  player:    new proto.PlayerService(TARGET, creds),
  city:      new proto.CityService(TARGET, creds),
  tile:      new proto.TileService(TARGET, creds),
  building:  new proto.BuildingService(TARGET, creds),
  market:    new proto.MarketService(TARGET, creds),
  agreement: new proto.TradeAgreementService(TARGET, creds),
  research:  new proto.ResearchService(TARGET, creds),
  marketing: new proto.MarketingService(TARGET, creds),
  politics:  new proto.PoliticsService(TARGET, creds),
  bank:      new proto.BankService(TARGET, creds),
  events:    new proto.GameEventService(TARGET, creds),
  chat:      new proto.ChatService(TARGET, creds),
};

export function makeMeta(apiKey) {
  const meta = new grpc.Metadata();
  if (apiKey) meta.add('x-api-key', apiKey);
  return meta;
}

const DEBUG = process.env.GRPC_DEBUG === '1' || process.env.NODE_ENV === 'development';

const STATUS_NAMES = {
  0: 'OK', 1: 'CANCELLED', 2: 'UNKNOWN', 3: 'INVALID_ARGUMENT',
  4: 'DEADLINE_EXCEEDED', 5: 'NOT_FOUND', 6: 'ALREADY_EXISTS',
  7: 'PERMISSION_DENIED', 8: 'RESOURCE_EXHAUSTED', 9: 'FAILED_PRECONDITION',
  10: 'ABORTED', 11: 'OUT_OF_RANGE', 12: 'UNIMPLEMENTED', 13: 'INTERNAL',
  14: 'UNAVAILABLE', 15: 'DATA_LOSS', 16: 'UNAUTHENTICATED',
};

function redact(obj) {
  const copy = { ...obj };
  if (copy.api_key) copy.api_key = '[redacted]';
  return copy;
}

function ts() {
  return new Date().toISOString().slice(11, 23);
}

export function rpc(stub, method, request, apiKey) {
  const start = Date.now();
  if (DEBUG) {
    console.log(`[gRPC ${ts()}] → ${method}`, redact(request));
  }
  return new Promise((resolve, reject) => {
    const call = stub[method](request, makeMeta(apiKey), (err, res) => {
      const ms = Date.now() - start;
      if (err) {
        const status = STATUS_NAMES[err.code] ?? err.code;
        console.error(
          `[gRPC ${ts()}] ✗ ${method} (${ms}ms) ${status}: ${err.details}`,
          DEBUG ? { metadata: err.metadata?.getMap?.() } : '',
        );
        reject(err);
      } else {
        if (DEBUG) console.log(`[gRPC ${ts()}] ✓ ${method} (${ms}ms)`, res);
        resolve(res);
      }
    });

    if (DEBUG && call?.on) {
      call.on('metadata', (md) => {
        console.log(`[gRPC ${ts()}]   ← ${method} headers`, md.getMap());
      });
    }
  });
}

// Stream lifecycle logging for event subscriptions (dev only)
export function wrapStream(stream, label) {
  if (!DEBUG || !stream) return stream;
  console.log(`[gRPC ${ts()}] ⇄ stream:${label} opened`);
  stream.on('metadata', (md) =>
    console.log(`[gRPC ${ts()}] ⇄ stream:${label} headers`, md.getMap()));
  stream.on('error', (err) => {
    const status = STATUS_NAMES[err.code] ?? err.code;
    console.error(`[gRPC ${ts()}] ⇄ stream:${label} error ${status}: ${err.details}`);
  });
  stream.on('end', () =>
    console.log(`[gRPC ${ts()}] ⇄ stream:${label} ended`));
  return stream;
}
