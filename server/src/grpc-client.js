import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROTO_PATH = join(__dirname, '../../trademmo.proto');

const packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: Number,
  enums: String,
  defaults: true,
  oneofs: true,
});

const proto = grpc.loadPackageDefinition(packageDef).trademmo;
const creds = grpc.credentials.createSsl();
const TARGET = 'play.veld.gg:443';

export const stubs = {
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
};

export function makeMeta(apiKey) {
  const meta = new grpc.Metadata();
  if (apiKey) meta.add('x-api-key', apiKey);
  return meta;
}

export function rpc(stub, method, request, apiKey) {
  return new Promise((resolve, reject) => {
    stub[method](request, makeMeta(apiKey), (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}

// Map gRPC status codes to HTTP status codes
export function grpcErrToHttp(err) {
  const MAP = { 1: 499, 2: 500, 3: 400, 4: 504, 5: 404, 6: 409, 7: 403, 16: 401 };
  return MAP[err.code] ?? 500;
}
