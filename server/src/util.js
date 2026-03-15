import { grpcErrToHttp } from './grpc-client.js';

export function getApiKey(req) {
  const auth = req.headers.authorization ?? '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

// ── Enum normalization ────────────────────────────────────────────────────────
// The proto enum names follow the pattern PREFIX_TYPE_VALUE (e.g., RESOURCE_TYPE_GRAIN).
// We normalise these down to the bare lowercase value (e.g., "grain") so the
// React client never needs to change when the server-side protos are strict-typed.

/** Strips proto enum prefix and lowercases the value.
 *  "RESOURCE_TYPE_ANIMAL_FEED" → "animal_feed"
 *  Any string that doesn't match the pattern is returned unchanged.
 */
function stripEnumPrefix(val) {
  if (typeof val !== 'string') return val;
  const match = val.match(/^[A-Z][A-Z0-9]+_[A-Z][A-Z0-9]+_(.+)$/);
  return match ? match[1].toLowerCase() : val;
}

/** Recursively normalise all enum-like strings in a plain JS object/array. */
export function normalizeResponse(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(normalizeResponse);
  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = normalizeResponse(v);
    return out;
  }
  return stripEnumPrefix(obj);
}

// Lookup tables: lowercase value → proto enum name (for request conversion)
const RESOURCE_TYPE = {
  grain: 'RESOURCE_TYPE_GRAIN', water: 'RESOURCE_TYPE_WATER',
  animal_feed: 'RESOURCE_TYPE_ANIMAL_FEED', cattle: 'RESOURCE_TYPE_CATTLE',
  meat: 'RESOURCE_TYPE_MEAT', leather: 'RESOURCE_TYPE_LEATHER',
  food: 'RESOURCE_TYPE_FOOD',
};
const BUILDING_TYPE = {
  field: 'BUILDING_TYPE_FIELD', factory: 'BUILDING_TYPE_FACTORY',
  store: 'BUILDING_TYPE_STORE', warehouse: 'BUILDING_TYPE_WAREHOUSE',
  landmark: 'BUILDING_TYPE_LANDMARK', bank: 'BUILDING_TYPE_BANK',
};
const OFFERING_VISIBILITY = {
  public: 'OFFERING_VISIBILITY_PUBLIC', private: 'OFFERING_VISIBILITY_PRIVATE',
  agreement_only: 'OFFERING_VISIBILITY_AGREEMENT_ONLY',
};
const AGREEMENT_RESPONSE = {
  accept: 'AGREEMENT_RESPONSE_ACCEPT', reject: 'AGREEMENT_RESPONSE_REJECT',
};
const AGREEMENT_ROLE = {
  creator: 'AGREEMENT_ROLE_CREATOR', buyer: 'AGREEMENT_ROLE_BUYER',
};

/** Converts a plain-string enum value to the proto enum name expected by grpc-js.
 *  field         → e.g. "grain" → "RESOURCE_TYPE_GRAIN"
 *  value         → string value from the React client
 *  Returns the proto name, or the original value if no mapping found.
 */
export function toProtoEnum(field, value) {
  if (!value) return value;
  const map = {
    resource_type: RESOURCE_TYPE, output_type: RESOURCE_TYPE,
    building_type: BUILDING_TYPE,
    visibility: OFFERING_VISIBILITY,
    response: AGREEMENT_RESPONSE,
    role: AGREEMENT_ROLE,
  }[field];
  return map?.[value.toLowerCase()] ?? value;
}

/** Wraps an async route handler with standard error handling and response normalisation. */
export function handle(fn) {
  return async (req, res) => {
    try {
      const result = await fn(req);
      res.json(normalizeResponse(result));
    } catch (err) {
      const status = grpcErrToHttp(err);
      res.status(status).json({ error: err.details ?? err.message ?? 'Unknown error' });
    }
  };
}
