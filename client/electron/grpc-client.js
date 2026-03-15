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

export function rpc(stub, method, request, apiKey) {
  const start = Date.now();
  if (DEBUG) {
    const display = { ...request };
    if (display.api_key) display.api_key = '[redacted]';
    console.log(`[gRPC] → ${method}`, display);
  }
  return new Promise((resolve, reject) => {
    stub[method](request, makeMeta(apiKey), (err, res) => {
      const ms = Date.now() - start;
      if (err) {
        console.error(`[gRPC] ✗ ${method} (${ms}ms) code=${err.code} ${err.details}`);
        reject(err);
      } else {
        if (DEBUG) console.log(`[gRPC] ✓ ${method} (${ms}ms)`, res);
        resolve(res);
      }
    });
  });
}
