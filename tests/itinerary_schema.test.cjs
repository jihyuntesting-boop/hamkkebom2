'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {
  ZONE, ItineraryValidationError, parseItinerary, validateItinerary,
  migrateLegacyDraft, prepareItineraryUpdate, diffItineraries,
  requestFingerprint,
} = require('../web/server/itinerary-schema.cjs');

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const date = '2026-11-24';
const iso = '2026-11-24T00:00:00.000Z';
const later = '2026-11-24T00:01:00.000Z';
const key = 'client-request-00000001';
function stop(n, patch = {}) {
  return {
    id: id(100 + n), placeId: `tour-${n}`, position: n,
    kind: 'spot', name: `장소 ${n}`, plannedArrival: n === 1 ? '09:00' : '11:00',
    stayMinutes: 60, restMinutes: 0, travelTimeStatus: n === 1 ? 'not_applicable' : 'unknown',
    travelMinutes: null, travelSource: null, travelCheckedAt: null,
    transitionBufferMinutes: n === 1 ? 0 : 25,
    completed: false, mustVisit: false, reserved: false, verificationItems: [], ...patch,
  };
}
function itinerary(patch = {}) {
  return {
    id: id(1), ownerId: id(2), ownerKind: 'account', ownerAuthRef: `auth:${id(2)}`,
    tripDate: date, region: '서울', timezone: ZONE, version: 1,
    createdAt: iso, updatedAt: iso, status: 'active', deletedAt: null,
    retentionUntil: null, stops: [stop(1), stop(2)], ...patch,
  };
}
function edit(source, changes, opts = {}) {
  return prepareItineraryUpdate(source, {expectedVersion: source.version, idempotencyKey: key, changes},
    {actorId: source.ownerId, now: later, ...opts});
}
function errorCode(raw) { return validateItinerary(raw).errors[0]?.code; }

test('valid itinerary normalizes with KST wall-clock time, owner identity, and explicit null travel', () => {
  const raw = itinerary();
  const parsed = parseItinerary(raw);
  assert.deepEqual(parsed, raw);
  assert.equal(parsed.timezone, 'Asia/Seoul');
  assert.equal(parsed.stops[1].travelTimeStatus, 'unknown');
  assert.equal(parsed.stops[1].travelMinutes, null);
  assert.deepEqual(validateItinerary(raw), {ok: true, value: raw, errors: []});
});

test('invalid itinerary UUID, owner UUID, identity reference and extra fields are rejected', () => {
  assert.equal(errorCode(itinerary({id: 'guessable-1'})), 'invalid_uuid');
  assert.equal(errorCode(itinerary({ownerId: 'guest-email@example.com'})), 'invalid_uuid');
  assert.equal(errorCode(itinerary({ownerAuthRef: ''})), 'invalid_string');
  assert.equal(errorCode({...itinerary(), secretToken: 'do-not-accept'}), 'unknown_field');
  assert.equal(errorCode(itinerary({ownerKind: 'public'})), 'invalid_enum');
});

test('duplicate stop ID or place ID, missing order and swapped positions are rejected', () => {
  assert.equal(errorCode(itinerary({stops: [stop(1), stop(2, {id: id(101)})]})), 'duplicate_stop_id');
  assert.equal(errorCode(itinerary({stops: [stop(1), stop(2, {placeId: 'tour-1'})]})), 'duplicate_place_id');
  assert.equal(errorCode(itinerary({stops: [stop(1, {position: 2}), stop(2, {position: 1})]})), 'position_conflict');
});

test('invalid trip dates, invalid wall-clock times, duration and overlaps fail closed', () => {
  assert.equal(errorCode(itinerary({tripDate: '2026-02-31'})), 'invalid_date');
  assert.equal(errorCode(itinerary({timezone: 'UTC'})), 'invalid_enum');
  assert.equal(errorCode(itinerary({stops: [stop(1, {plannedArrival: '25:30'}), stop(2)]})), 'invalid_time');
  assert.equal(errorCode(itinerary({stops: [stop(1, {stayMinutes: 0}), stop(2)]})), 'invalid_integer');
  assert.equal(errorCode(itinerary({stops: [stop(1, {stayMinutes: 240}), stop(2, {plannedArrival: '12:00'})]})), 'time_overlap');
  assert.equal(errorCode(itinerary({stops: [stop(1, {plannedArrival: '23:50'}), stop(2)]})), 'outside_day_window');
  assert.equal(errorCode(itinerary({stops: [stop(1), stop(2, {transitionBufferMinutes: -1})]})), 'invalid_integer');
});

test('invalid JSON, timestamps and preservation state reject without mutating input', () => {
  assert.equal(errorCode(itinerary({createdAt: '2026-02-31T00:00:00.000Z'})), 'invalid_timestamp');
  assert.equal(errorCode(itinerary({status: 'deleted'})), 'deletion_state_mismatch');
  assert.equal(errorCode(itinerary({updatedAt: '2026-11-23T00:00:00.000Z'})), 'timestamp_order');
  const raw = itinerary(); raw.stops[1].verificationItems = [{code: 'stairs', status: 'verified', private: true}];
  assert.equal(errorCode(raw), 'unknown_field');
  assert.equal(raw.stops[1].verificationItems[0].private, true);
});

test('unknown route is not zero minutes; verified estimate needs source and clock', () => {
  assert.equal(errorCode(itinerary({stops: [stop(1), stop(2, {travelMinutes: 0})]})), 'unverified_travel_time');
  assert.equal(errorCode(itinerary({stops: [stop(1), stop(2, {travelTimeStatus: 'estimated', travelMinutes: null})]})), 'invalid_integer');
  const verified = itinerary({stops: [stop(1), stop(2, {
    travelTimeStatus: 'estimated', travelMinutes: 35,
    travelSource: 'naver_directions', travelCheckedAt: iso,
  })]});
  assert.equal(validateItinerary(verified).ok, true);
  assert.equal(errorCode(itinerary({stops: [stop(1), stop(2, {
    plannedArrival: '10:20', travelTimeStatus: 'estimated', travelMinutes: 35,
    travelSource: 'naver_directions', travelCheckedAt: iso,
  })]})), 'time_overlap');
});

test('optimistic concurrency returns 409 with authenticated owner-only comparison payload', () => {
  const raw = itinerary({version: 3});
  const response = prepareItineraryUpdate(raw, {expectedVersion: 2, idempotencyKey: key, changes: {region: '경기'}},
    {actorId: raw.ownerId, now: later});
  assert.equal(response.status, 409);
  assert.equal(response.code, 'version_conflict');
  assert.equal(response.conflict.actualVersion, 3);
  assert.equal(response.conflict.serverSnapshot.ownerId, raw.ownerId);
  assert.equal(raw.region, '서울');
});

test('unauthenticated and cross-owner edits cannot inspect or modify the itinerary', () => {
  const raw = itinerary();
  const request = {expectedVersion: 1, idempotencyKey: key, changes: {region: '경기'}};
  assert.deepEqual(prepareItineraryUpdate(raw, request, {now: later}),
    {ok: false, status: 401, code: 'authentication_required'});
  assert.deepEqual(prepareItineraryUpdate(raw, request, {actorId: id(9), now: later}),
    {ok: false, status: 403, code: 'forbidden'});
});

test('valid update increments version but leaves original untouched', () => {
  const raw = itinerary(); const before = structuredClone(raw);
  const out = edit(raw, {region: '경기'});
  assert.equal(out.ok, true);
  assert.equal(out.replay, false);
  assert.equal(out.next.version, 2);
  assert.equal(out.next.region, '경기');
  assert.equal(out.next.createdAt, iso);
  assert.equal(out.idempotencyRecord.fingerprint.length, 64);
  assert.deepEqual(raw, before);
});

test('retry with same key and same fingerprint replays receipt; reused key with new payload gets 409', () => {
  const raw = itinerary();
  const first = edit(raw, {region: '경기'});
  const retry = prepareItineraryUpdate(first.next,
    {expectedVersion: 1, idempotencyKey: key, changes: {region: '경기'}},
    {actorId: raw.ownerId, previousRequest: first.idempotencyRecord, now: later});
  assert.equal(retry.ok, true);
  assert.equal(retry.replay, true);
  assert.deepEqual(retry.receipt, first.receipt);
  const collision = prepareItineraryUpdate(first.next,
    {expectedVersion: 1, idempotencyKey: key, changes: {region: '서울'}},
    {actorId: raw.ownerId, previousRequest: first.idempotencyRecord, now: later});
  assert.equal(collision.status, 409);
  assert.equal(collision.code, 'idempotency_key_reused');
  assert.equal(requestFingerprint({expectedVersion: 1, changes: {region: '경기'}}),
    requestFingerprint({changes: {region: '경기'}, expectedVersion: 1}));
});

test('completed, must-visit and reserved stops may not be removed, reordered, edited or bypassed', () => {
  for (const flag of ['completed', 'mustVisit', 'reserved']) {
    const raw = itinerary({stops: [stop(1, {[flag]: true}), stop(2)]});
    const copy = structuredClone(raw);
    const remove = edit(raw, {stops: [stop(2, {position: 1, plannedArrival: '09:00', travelTimeStatus: 'not_applicable', transitionBufferMinutes: 0})]});
    assert.equal(remove.code, 'protected_stop_modified', flag);
    const update = edit(raw, {stops: [stop(1, {[flag]: true, name: '무단 변경'}), stop(2)]});
    assert.equal(update.code, 'protected_stop_modified', flag);
    assert.equal(edit(raw, {tripDate: '2026-11-25'}).code, 'protected_trip_modified');
    assert.deepEqual(raw, copy);
  }
});

test('invalid edits are 400 and never alter the source record', () => {
  const raw = itinerary(); const before = structuredClone(raw);
  const bad = edit(raw, {stops: [stop(1, {plannedArrival: '23:40'}), stop(2)]});
  assert.equal(bad.status, 400);
  assert.equal(bad.code, 'outside_day_window');
  assert.equal(edit(raw, {ownerId: id(9)}).code, 'unknown_field');
  assert.equal(edit(raw, {}).code, 'empty_changes');
  assert.deepEqual(raw, before);
});

test('external claimed travel time cannot be persisted without server trusted matching evidence', () => {
  const raw = itinerary();
  const proposed = [stop(1), stop(2, {
    travelTimeStatus: 'estimated', travelMinutes: 20,
    travelSource: 'naver_directions', travelCheckedAt: iso,
  })];
  assert.equal(edit(raw, {stops: proposed}).code, 'untrusted_travel_estimate');
  const ok = edit(raw, {stops: proposed}, {verifiedTravel: {
    [id(102)]: {fromPlaceId: 'tour-1', placeId: 'tour-2', position: 2,
      minutes: 20, source: 'naver_directions', checkedAt: iso},
  }});
  assert.equal(ok.ok, true);
  assert.equal(ok.next.stops[1].travelMinutes, 20);
});

test('deleted itinerary returns 410 without allowing resurrect or mutation', () => {
  const deleted = itinerary({status: 'deleted', deletedAt: later});
  const response = prepareItineraryUpdate(deleted, {expectedVersion: 1, idempotencyKey: key,
    changes: {region: '경기'}}, {actorId: deleted.ownerId, now: later});
  assert.equal(response.status, 410);
  assert.equal(deleted.region, '서울');
});

test('legacy local draft maps done/must/booked, allocates fresh stop IDs and downgrades untrusted ETA', () => {
  const local = {
    region: '경기', date: '2026-11-25',
    hbPlanInfo: {date: '2026-11-24', region: '서울'},
    stops: [
      {id: 'tour-1', placeId: 'tour-1', kind: 'spot', name: '박물관',
        time: '09:00', plannedArrival: '09:00', stayMinutes: 60,
        done: true, must: true, reserved: true, transitionBufferMinutes: 0,
        travelTimeStatus: 'not_applicable', ownerToken: 'private'},
      {id: 'rest-draft-1', placeId: null, kind: 'rest', isPlaceholder: true,
        name: '휴식 시간 (장소 미정)', time: '11:00', stayMinutes: 20,
        booked: true, transitionBufferMinutes: 0, travelTimeStatus: 'estimated',
        travelMinutes: 7, privateCoordinates: {lat: 37, lng: 127}},
    ],
  };
  const context = {itineraryId: id(1), ownerId: id(2), ownerKind: 'account',
    ownerAuthRef: `auth:${id(2)}`, stopIds: [id(101), id(102)], now: iso};
  const original = structuredClone(local);
  const migrated = migrateLegacyDraft(local, context);
  assert.equal(migrated.itinerary.region, '서울');
  assert.equal(migrated.itinerary.tripDate, '2026-11-24');
  assert.equal(migrated.itinerary.stops[0].id, id(101));
  assert.equal(migrated.itinerary.stops[0].completed, true);
  assert.equal(migrated.itinerary.stops[0].mustVisit, true);
  assert.equal(migrated.itinerary.stops[1].reserved, true);
  assert.equal(migrated.itinerary.stops[1].restMinutes, 20);
  assert.equal(migrated.itinerary.stops[1].travelTimeStatus, 'unknown');
  assert.equal(migrated.itinerary.stops[1].travelMinutes, null);
  assert.deepEqual(migrated.warnings, [{stopIndex: 1, code: 'legacy_estimate_downgraded'}]);
  assert.doesNotMatch(JSON.stringify(migrated.itinerary), /ownerToken|privateCoordinates|private/);
  assert.deepEqual(local, original);
  assert.equal(migrated.legacyStopMapping[0].localId, 'tour-1');
});

test('legacy input lacking server-side assigned identity or invalid local timestamps fails closed', () => {
  const legacy = {date, region: '서울', stops: [{name: '장소', kind: 'spot',
    time: '09:00', stayMinutes: 60, transitionBufferMinutes: 0}]};
  assert.throws(() => migrateLegacyDraft(legacy, {}),
    error => error instanceof ItineraryValidationError && error.code === 'missing_server_stop_ids');
  const ctx = {itineraryId: id(1), ownerId: id(2), ownerKind: 'account',
    ownerAuthRef: 'auth:trusted', stopIds: [id(101)], now: iso};
  assert.equal(migrateLegacyDraft(legacy, ctx).itinerary.stops[0].travelTimeStatus, 'unknown');
  assert.throws(() => migrateLegacyDraft({...legacy, date: '2026-02-30'}, ctx),
    error => error.code === 'invalid_date');
});

test('conflict comparison lists added/removed/changed stable stop IDs without guessing resolution', () => {
  const first = itinerary();
  const second = itinerary({version: 2, updatedAt: later,
    stops: [stop(1, {name: '변경된 장소'})]});
  const diff = diffItineraries(first, second);
  assert.deepEqual(diff.stops, [
    {stopId: id(101), type: 'changed', fields: ['name']},
    {stopId: id(102), type: 'removed'},
  ]);
  assert.equal(diff.toVersion, 2);
});

test('untrusted accessibility verification cannot be invented by client', () => {
  const raw = itinerary();
  const forged = [stop(1), stop(2, {verificationItems: [{code: 'stairs', status: 'verified'}]})];
  assert.equal(edit(raw, {stops: forged}).code, 'untrusted_access_verification');
  const allowed = edit(raw, {stops: forged}, {verifiedTravel: {
    verificationItems: {[id(102)]: ['stairs']},
  }});
  assert.equal(allowed.ok, true);
});

test('moving a leg origin invalidates a previously verified ETA even with unchanged target and time', () => {
  const raw = itinerary({stops: [stop(1), stop(2, {travelTimeStatus: 'estimated',
    travelMinutes: 20, travelSource: 'naver_directions', travelCheckedAt: iso})]});
  const nextStops = [stop(1, {placeId: 'tour-999'}), stop(2, {travelTimeStatus: 'estimated',
    travelMinutes: 20, travelSource: 'naver_directions', travelCheckedAt: iso})];
  assert.equal(edit(raw, {stops: nextStops}).code, 'untrusted_travel_estimate');
});
