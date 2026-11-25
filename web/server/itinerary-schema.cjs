'use strict';

/** ARCH-03 / PLAN-01: pure, DB-independent server-side itinerary contract.
 * Not an HTTP API, authentication implementation, or persistence adapter.
 * The caller MUST authenticate the principal and commit the prepared update
 * together with its idempotency record in one conditional DB transaction.
 */
const {createHash} = require('node:crypto');

const ZONE = 'Asia/Seoul';
const MAX_STOPS = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLACE_ID = /^[a-zA-Z0-9_-]{1,80}$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY = /^\d{4}-\d\d-\d\d$/;
const TIMESTAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const REGIONS = ['서울', '경기'];
const KINDS = ['spot', 'culture', 'food', 'rest'];
const ROUTE_STATUSES = ['not_applicable', 'unknown', 'estimated'];
const VERIFY_CODES = ['arrival', 'entrance', 'stairs', 'walking_route', 'slope', 'rest_area', 'restroom', 'opening_hours', 'travel_time', 'meal', 'other'];
const VERIFY_STATUSES = ['unknown', 'source_reported', 'verified', 'conflicting', 'stale'];
const STOP_FIELDS = ['id', 'placeId', 'position', 'kind', 'name', 'plannedArrival', 'stayMinutes', 'restMinutes', 'travelTimeStatus', 'travelMinutes', 'travelSource', 'travelCheckedAt', 'transitionBufferMinutes', 'completed', 'mustVisit', 'reserved', 'verificationItems'];
const ITINERARY_FIELDS = ['id', 'ownerId', 'ownerKind', 'ownerAuthRef', 'tripDate', 'region', 'timezone', 'version', 'createdAt', 'updatedAt', 'status', 'deletedAt', 'retentionUntil', 'stops'];
const UPDATE_FIELDS = ['expectedVersion', 'idempotencyKey', 'changes'];

class ItineraryValidationError extends Error {
  constructor(code, at, message) {
    super(message || code);
    this.name = 'ItineraryValidationError';
    this.code = code;
    this.path = at;
  }
}
function invalid(code, path, message) { throw new ItineraryValidationError(code, path, message); }
function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
function object(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid('invalid_object', path);
  return value;
}
function only(value, keys, path) {
  for (const key of Object.keys(value)) if (!keys.includes(key)) invalid('unknown_field', `${path}.${key}`);
}
function uuid(value, path) {
  if (typeof value !== 'string' || !UUID.test(value)) invalid('invalid_uuid', path);
  return value.toLowerCase();
}
function choice(value, options, path) {
  if (!options.includes(value)) invalid('invalid_enum', path);
  return value;
}
function integer(value, min, max, path) {
  if (!Number.isSafeInteger(value) || value < min || value > max) invalid('invalid_integer', path);
  return value;
}
function bool(value, path) {
  if (typeof value !== 'boolean') invalid('invalid_boolean', path);
  return value;
}
function str(value, max, path) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) invalid('invalid_string', path);
  return value.trim();
}
function localDate(value, path) {
  if (typeof value !== 'string' || !DAY.test(value)) invalid('invalid_date', path);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== value) invalid('invalid_date', path);
  return value;
}
function instant(value, path) {
  if (typeof value !== 'string' || !TIMESTAMP.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) invalid('invalid_timestamp', path);
  return value;
}
function nullableInstant(value, path) { return value == null ? null : instant(value, path); }
function clock(value, path) {
  const match = typeof value === 'string' && TIME.exec(value);
  if (!match) invalid('invalid_time', path);
  return {value, minutes: Number(match[1]) * 60 + Number(match[2])};
}
function verifyItems(input, path) {
  if (input == null) return [];
  if (!Array.isArray(input) || input.length > 16) invalid('invalid_verification_items', path);
  const seen = new Set();
  return input.map((entry, i) => {
    const p = `${path}[${i}]`;
    object(entry, p); only(entry, ['code', 'status'], p);
    const code = choice(entry.code, VERIFY_CODES, `${p}.code`);
    const status = choice(entry.status, VERIFY_STATUSES, `${p}.status`);
    if (seen.has(code)) invalid('duplicate_verification', p);
    seen.add(code);
    return {code, status};
  });
}
function parseStop(raw, path) {
  object(raw, path); only(raw, STOP_FIELDS, path);
  const id = uuid(raw.id, `${path}.id`);
  const placeId = raw.placeId == null ? null : str(raw.placeId, 80, `${path}.placeId`);
  if (placeId !== null && !PLACE_ID.test(placeId)) invalid('invalid_place_id', `${path}.placeId`);
  const kind = choice(raw.kind, KINDS, `${path}.kind`);
  const stayMinutes = integer(raw.stayMinutes, 5, 240, `${path}.stayMinutes`);
  const restMinutes = integer(raw.restMinutes, 0, 240, `${path}.restMinutes`);
  if ((kind === 'rest' && restMinutes !== stayMinutes) || (kind !== 'rest' && restMinutes !== 0)) invalid('inconsistent_rest_duration', `${path}.restMinutes`);
  const routeStatus = choice(raw.travelTimeStatus, ROUTE_STATUSES, `${path}.travelTimeStatus`);
  let travelMinutes = null, travelSource = null, travelCheckedAt = null;
  if (routeStatus === 'estimated') {
    travelMinutes = integer(raw.travelMinutes, 1, 1440, `${path}.travelMinutes`);
    travelSource = choice(raw.travelSource, ['naver_directions'], `${path}.travelSource`);
    travelCheckedAt = instant(raw.travelCheckedAt, `${path}.travelCheckedAt`);
  } else if (raw.travelMinutes != null || raw.travelSource != null || raw.travelCheckedAt != null) {
    invalid('unverified_travel_time', `${path}.travelMinutes`);
  }
  return {
    id, placeId,
    position: integer(raw.position, 1, MAX_STOPS, `${path}.position`), kind,
    name: str(raw.name, 160, `${path}.name`),
    plannedArrival: clock(raw.plannedArrival, `${path}.plannedArrival`).value,
    stayMinutes, restMinutes, travelTimeStatus: routeStatus,
    travelMinutes, travelSource, travelCheckedAt,
    transitionBufferMinutes: integer(raw.transitionBufferMinutes, 0, 180, `${path}.transitionBufferMinutes`),
    completed: bool(raw.completed, `${path}.completed`),
    mustVisit: bool(raw.mustVisit, `${path}.mustVisit`),
    reserved: bool(raw.reserved, `${path}.reserved`),
    verificationItems: verifyItems(raw.verificationItems, `${path}.verificationItems`),
  };
}
function parseStops(input, path = 'stops') {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_STOPS) invalid('invalid_stops', path);
  const ids = new Set(), placeIds = new Set();
  const stops = input.map((raw, index) => {
    const stop = parseStop(raw, `${path}[${index}]`);
    if (ids.has(stop.id)) invalid('duplicate_stop_id', `${path}[${index}].id`);
    ids.add(stop.id);
    if (stop.placeId !== null) {
      if (placeIds.has(stop.placeId)) invalid('duplicate_place_id', `${path}[${index}].placeId`);
      placeIds.add(stop.placeId);
    }
    if (stop.position !== index + 1) invalid('position_conflict', `${path}[${index}].position`);
    const begin = clock(stop.plannedArrival, `${path}[${index}].plannedArrival`).minutes;
    if (begin < 540 || begin + stop.stayMinutes > 1080) invalid('outside_day_window', `${path}[${index}].plannedArrival`);
    if (index > 0) {
      const prev = input[index - 1];
      const prevBegin = clock(prev.plannedArrival, `${path}[${index - 1}].plannedArrival`).minutes;
      const minTravel = stop.travelTimeStatus === 'estimated' ? stop.travelMinutes : 0;
      // A buffer is NOT a verified journey time. Never convert unknown to zero.
      const requiredGap = Math.max(stop.transitionBufferMinutes, minTravel);
      if (begin < prevBegin + prev.stayMinutes + requiredGap) invalid('time_overlap', `${path}[${index}].plannedArrival`);
      if (stop.travelTimeStatus === 'not_applicable' && stop.placeId != null && stop.placeId !== prev.placeId)
        invalid('travel_status_missing', `${path}[${index}].travelTimeStatus`);
    } else if (stop.travelTimeStatus === 'estimated') {
      invalid('first_stop_has_route', `${path}[${index}].travelTimeStatus`);
    }
    return stop;
  });
  return stops;
}
function parseItinerary(raw) {
  object(raw, 'itinerary'); only(raw, ITINERARY_FIELDS, 'itinerary');
  const createdAt = instant(raw.createdAt, 'createdAt');
  const updatedAt = instant(raw.updatedAt, 'updatedAt');
  if (updatedAt < createdAt) invalid('timestamp_order', 'updatedAt');
  const status = choice(raw.status, ['active', 'deleted'], 'status');
  const deletedAt = nullableInstant(raw.deletedAt, 'deletedAt');
  const retentionUntil = nullableInstant(raw.retentionUntil, 'retentionUntil');
  if ((status === 'deleted') !== (deletedAt !== null)) invalid('deletion_state_mismatch', 'deletedAt');
  if (deletedAt && deletedAt < createdAt) invalid('timestamp_order', 'deletedAt');
  if (retentionUntil && retentionUntil < createdAt) invalid('timestamp_order', 'retentionUntil');
  return {
    id: uuid(raw.id, 'id'),
    ownerId: uuid(raw.ownerId, 'ownerId'),
    ownerKind: choice(raw.ownerKind, ['account', 'guest'], 'ownerKind'),
    // Server-side opaque identity reference; NEVER a password or bearer token.
    ownerAuthRef: str(raw.ownerAuthRef, 128, 'ownerAuthRef'),
    tripDate: localDate(raw.tripDate, 'tripDate'),
    region: choice(raw.region, REGIONS, 'region'),
    timezone: choice(raw.timezone, [ZONE], 'timezone'),
    version: integer(raw.version, 1, Number.MAX_SAFE_INTEGER, 'version'),
    createdAt, updatedAt, status, deletedAt, retentionUntil,
    stops: parseStops(raw.stops),
  };
}
function validateItinerary(value) {
  try { return {ok: true, value: parseItinerary(value), errors: []}; }
  catch (error) {
    if (!(error instanceof ItineraryValidationError)) throw error;
    return {ok: false, errors: [{code: error.code, path: error.path}]};
  }
}
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
  const encoded = JSON.stringify(value);
  if (encoded === undefined) invalid('invalid_json', 'request');
  return encoded;
}
function requestFingerprint(request) {
  return createHash('sha256').update(stableJson({expectedVersion: request.expectedVersion, changes: request.changes})).digest('hex');
}
function protectedStop(stop) { return stop.completed || stop.mustVisit || stop.reserved; }
function protectPrevious(original, next) {
  const byId = new Map(next.stops.map(s => [s.id, s]));
  for (const old of original.stops) {
    if (!protectedStop(old)) continue;
    const newer = byId.get(old.id);
    if (!newer || stableJson(old) !== stableJson(newer)) invalid('protected_stop_modified', `stops.${old.id}`);
  }
  if (original.stops.some(protectedStop) && (original.tripDate !== next.tripDate || original.region !== next.region))
    invalid('protected_trip_modified', 'changes');
}
function travelEvidence(original, next, trusted) {
  const byId = new Map(original.stops.map(s => [s.id, s]));
  for (const s of next.stops) {
    if (s.travelTimeStatus !== 'estimated') continue;
    const prev = byId.get(s.id);
    const originalIndex = original.stops.findIndex(x => x.id === s.id);
    const nextIndex = next.stops.findIndex(x => x.id === s.id);
    const origin = originalIndex > 0 ? original.stops[originalIndex - 1].placeId : null;
    const nextOrigin = nextIndex > 0 ? next.stops[nextIndex - 1].placeId : null;
    const unchanged = prev && origin === nextOrigin && prev.placeId === s.placeId && prev.position === s.position &&
      prev.travelTimeStatus === s.travelTimeStatus && prev.travelMinutes === s.travelMinutes &&
      prev.travelSource === s.travelSource && prev.travelCheckedAt === s.travelCheckedAt;
    const evidence = trusted?.[s.id];
    if (!unchanged && (!evidence || evidence.fromPlaceId !== nextOrigin || evidence.placeId !== s.placeId || evidence.position !== s.position ||
        evidence.minutes !== s.travelMinutes || evidence.source !== s.travelSource || evidence.checkedAt !== s.travelCheckedAt))
      invalid('untrusted_travel_estimate', `stops.${s.id}.travelMinutes`);
  }
}
/** Called *only after* trusted authentication; returns a plan, never writes data. */
function prepareItineraryUpdate(currentRaw, request, {actorId, previousRequest = null, now, verifiedTravel = null} = {}) {
  const current = parseItinerary(currentRaw);
  if (!actorId) return {ok: false, status: 401, code: 'authentication_required'};
  if (typeof actorId !== 'string' || actorId.toLowerCase() !== current.ownerId)
    return {ok: false, status: 403, code: 'forbidden'};
  if (current.status !== 'active') return {ok: false, status: 410, code: 'itinerary_deleted'};
  let result;
  try {
    object(request, 'request'); only(request, UPDATE_FIELDS, 'request');
    integer(request.expectedVersion, 1, Number.MAX_SAFE_INTEGER, 'expectedVersion');
    if (typeof request.idempotencyKey !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(request.idempotencyKey))
      invalid('invalid_idempotency_key', 'idempotencyKey');
    object(request.changes, 'changes'); only(request.changes, ['tripDate', 'region', 'stops'], 'changes');
    if (!Object.keys(request.changes).length) invalid('empty_changes', 'changes');
    const fingerprint = requestFingerprint(request);
    if (previousRequest && previousRequest.key === request.idempotencyKey &&
        previousRequest.itineraryId === current.id && previousRequest.actorId === current.ownerId) {
      if (previousRequest.fingerprint !== fingerprint) return {ok: false, status: 409, code: 'idempotency_key_reused'};
      return {ok: true, status: 200, replay: true, receipt: previousRequest.receipt};
    }
    if (request.expectedVersion !== current.version)
      return {ok: false, status: 409, code: 'version_conflict', conflict: {
        expectedVersion: request.expectedVersion, actualVersion: current.version,
        // Authenticated owner only; never return this from public share endpoint.
        serverSnapshot: current,
        requestedChanges: request.changes,
      }};
    if (current.version === Number.MAX_SAFE_INTEGER) invalid('version_overflow', 'version');
    const next = parseItinerary({
      ...current,
      ...request.changes,
      version: current.version + 1,
      updatedAt: instant(now, 'now'),
    });
    if (next.updatedAt < current.updatedAt) invalid('nonmonotonic_update', 'now');
    protectPrevious(current, next);
    travelEvidence(current, next, verifiedTravel);
    // A client cannot mark access/stair/walking facts as verified without new
    // server-side evidence. Existing catalog-derived statuses may be retained.
    const priorStops = new Map(current.stops.map(s => [s.id, s]));
    for (const stop of next.stops) {
      const prior = priorStops.get(stop.id);
      for (const fact of stop.verificationItems) {
        if (fact.status !== 'verified') continue;
        const retained = prior && prior.placeId === stop.placeId &&
          prior.verificationItems.some(item => item.code === fact.code && item.status === 'verified');
        const approved = verifiedTravel?.verificationItems?.[stop.id]?.includes(fact.code);
        if (!retained && !approved) invalid('untrusted_access_verification', `stops.${stop.id}.verificationItems`);
      }
    }
    const receipt = {id: current.id, version: next.version, updatedAt: next.updatedAt};
    result = {ok: true, status: 200, replay: false, next,
      receipt,
      idempotencyRecord: {itineraryId: current.id, actorId: current.ownerId,
        key: request.idempotencyKey, fingerprint, receipt}};
  } catch (error) {
    if (!(error instanceof ItineraryValidationError)) throw error;
    return {ok: false, status: 400, code: error.code, path: error.path};
  }
  return result;
}
/** Comparison for authenticated owner conflict UI, not for public DTO. */
function diffItineraries(beforeRaw, afterRaw) {
  const before = parseItinerary(beforeRaw), after = parseItinerary(afterRaw);
  if (before.id !== after.id || before.ownerId !== after.ownerId) invalid('different_itinerary', 'id');
  const left = new Map(before.stops.map(s => [s.id, s]));
  const right = new Map(after.stops.map(s => [s.id, s]));
  const changes = [];
  for (const [id, old] of left) {
    if (!right.has(id)) { changes.push({stopId: id, type: 'removed'}); continue; }
    const next = right.get(id);
    const fields = STOP_FIELDS.filter(k => stableJson(old[k]) !== stableJson(next[k]));
    if (fields.length) changes.push({stopId: id, type: 'changed', fields});
  }
  for (const [id] of right) if (!left.has(id)) changes.push({stopId: id, type: 'added'});
  return {
    fromVersion: before.version, toVersion: after.version,
    itineraryFields: ['tripDate', 'region', 'status'].filter(k => before[k] !== after[k]),
    stops: changes,
  };
}
/** One-time migration *proposal*. IDs and owner identity MUST come from trusted server context. */
function migrateLegacyDraft(local, context) {
  object(local, 'local'); object(context, 'context');
  const sourceStops = local.stops;
  if (!Array.isArray(sourceStops) || sourceStops.length < 1 || sourceStops.length > MAX_STOPS)
    invalid('invalid_stops', 'local.stops');
  if (!Array.isArray(context.stopIds) || context.stopIds.length !== sourceStops.length)
    invalid('missing_server_stop_ids', 'context.stopIds');
  const warnings = [];
  const stops = sourceStops.map((stop, i) => {
    object(stop, `local.stops[${i}]`);
    const kind = stop.kind || 'spot';
    const arrival = stop.plannedArrival || stop.time;
    if (stop.plannedArrival && stop.time && stop.plannedArrival !== stop.time)
      warnings.push({stopIndex: i, code: 'local_arrival_mismatch'});
    const stay = stop.stayMinutes;
    const estimated = stop.travelTimeStatus === 'estimated';
    // Local time estimates are never accepted as verified server evidence.
    if (estimated) warnings.push({stopIndex: i, code: 'legacy_estimate_downgraded'});
    const placeId = stop.isPlaceholder ? null : stop.placeId || (PLACE_ID.test(stop.id || '') ? stop.id : null);
    const status = estimated ? 'unknown' :
      stop.travelTimeStatus === 'not_applicable' ? 'not_applicable' : 'unknown';
    return {
      id: context.stopIds[i], placeId, position: i + 1, kind,
      name: stop.name, plannedArrival: arrival, stayMinutes: stay,
      restMinutes: kind === 'rest' ? stay : 0,
      travelTimeStatus: status, travelMinutes: null, travelSource: null, travelCheckedAt: null,
      transitionBufferMinutes: stop.transitionBufferMinutes ?? 0,
      completed: stop.done === true, mustVisit: stop.must === true,
      reserved: stop.reserved === true || stop.booked === true,
      verificationItems: (stop.travelTimeStatus === 'unknown' || estimated) ?
        [{code: 'travel_time', status: 'unknown'}] : [],
    };
  });
  const itinerary = parseItinerary({
    id: context.itineraryId, ownerId: context.ownerId,
    ownerKind: context.ownerKind, ownerAuthRef: context.ownerAuthRef,
    tripDate: local.hbPlanInfo?.date || local.date,
    region: local.hbPlanInfo?.region || local.region,
    timezone: ZONE, version: 1,
    createdAt: context.now, updatedAt: context.now,
    status: 'active', deletedAt: null, retentionUntil: null, stops,
  });
  return {itinerary, warnings,
    legacyStopMapping: sourceStops.map((s, i) => ({localId: String(s.id ?? ''), stopId: itinerary.stops[i].id}))};
}
module.exports = {
  ZONE, MAX_STOPS, ItineraryValidationError,
  parseItinerary, validateItinerary, prepareItineraryUpdate,
  requestFingerprint, diffItineraries, migrateLegacyDraft,
};
