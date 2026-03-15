// ── Enum normalization ────────────────────────────────────────────────────────
// Strips proto enum prefixes so the React client sees clean lowercase values.
// e.g. "RESOURCE_TYPE_ANIMAL_FEED" → "animal_feed"

function stripEnumPrefix(val) {
  if (typeof val !== 'string') return val;
  // Two-segment prefix: "RESOURCE_TYPE_GRAIN" → "grain"
  const match = val.match(/^[A-Z][A-Z0-9]+_[A-Z][A-Z0-9]+_(.+)$/);
  if (match) return match[1].toLowerCase();
  // All-uppercase single enum name: "DISCORD" → "discord"
  if (/^[A-Z][A-Z0-9_]*$/.test(val)) return val.toLowerCase();
  return val;
}

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

// ── Request enum conversion ───────────────────────────────────────────────────
// Converts plain lowercase values to the full proto enum name expected by grpc-js.
// e.g. "grain" → "RESOURCE_TYPE_GRAIN"

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
