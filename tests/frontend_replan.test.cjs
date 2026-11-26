"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = path.join(__dirname, "../web/assets/core-src/20-detail-and-replan.js");

function setup(stops) {
  const context = vm.createContext({
    s: {region: "경기", date: "2026-11-25", hbPlanInfo: {region: "서울", date: "2026-11-24"}, stops},
    KEY: "test-trip",
    saved: null,
    shouldFail: false,
  });
  vm.runInContext("const save = () => { if (shouldFail) throw Error('disk'); saved = JSON.stringify(s) }; const localStorage = {getItem: () => saved};", context);
  vm.runInContext(fs.readFileSync(source, "utf8"), context, {filename: source});
  return context;
}

const itinerary = [
  {id: "done", done: true, kind: "spot", time: "09:00"},
  {id: "must", must: true, kind: "spot", time: "10:00"},
  {id: "first-option", kind: "spot", time: "11:00"},
  {id: "reserved", booked: true, kind: "spot", time: "12:00"},
  {id: "lunch", kind: "food", time: "13:00"},
  {id: "rest", kind: "rest", isRestCandidate: true, time: "14:00"},
  {id: "second-option", kind: "spot", time: "15:00"},
];

test("all fatigue levels preserve protected times and leave input immutable", () => {
  const context = setup(itinerary);
  const before = JSON.stringify(itinerary);
  for (const [level, removed] of [["low", []], ["mid", ["second-option"]], ["high", ["first-option", "second-option"]]]) {
    const result = context.hbProposal(level, itinerary, []);
    assert.deepEqual(Array.from(result.removed, stop => stop.id), removed);
    for (const stop of [itinerary[0], itinerary[1], itinerary[3]]) {
      assert.ok(result.kept.includes(stop));
      assert.ok(result.protected.includes(stop));
    }
    assert.ok(result.kept.includes(itinerary[4]));
    assert.ok(result.kept.includes(itinerary[5]));
  }
  assert.equal(JSON.stringify(itinerary), before);
});

test("proposal signatures use the itinerary date and detect changes from another tab", () => {
  const context = setup(itinerary);
  const signature = context.hbTripSignature(context.s);
  assert.deepEqual(JSON.parse(signature).slice(0, 2), ["서울", "2026-11-24"]);
  vm.runInContext("save()", context);
  assert.equal(context.hbSavedTripMatches(signature), true);
  context.saved = JSON.stringify({...context.s, hbPlanInfo: {...context.s.hbPlanInfo, date: "2026-11-26"}});
  assert.equal(context.hbSavedTripMatches(signature), false);
  context.saved = JSON.stringify({...context.s, stops: []});
  assert.equal(context.hbSavedTripMatches(signature), false);
});

test("failed local save keeps the previous stops and undo metadata", () => {
  const context = setup(itinerary);
  context.s.hbReplanUndo = {before: itinerary};
  const originalState = context.s;
  context.shouldFail = true;
  assert.equal(context.hbSaveTripStops([], null), false);
  assert.equal(context.s, originalState);
  context.shouldFail = false;
  assert.equal(context.hbSaveTripStops([], null), true);
  assert.equal(JSON.parse(context.saved).stops.length, 0);
});

test("next stop skips completed visits and finishes the trip", () => {
  const context = setup(itinerary);
  assert.equal(context.hbNextStop(itinerary), 1);
  assert.equal(context.hbNextStop(itinerary.map(stop => ({...stop, done: true}))), -1);
  assert.equal(context.hbNextStop([]), -1);
});

test("condition alternatives require nearby sourced rest or verified step-free scope", () => {
  const context = setup(itinerary);
  const core = name => fs.readFileSync(path.join(__dirname, "../web/assets/core-src", name), "utf8");
  vm.runInContext(core("30-itinerary-engine-and-ui.js").split("function hbCreateSchedule")[0], context);
  vm.runInContext(core("10-recommendation-and-profile.js").split("const hbMobilityAidLabels")[0], context);
  context.window = {hbLocalAccessGuides: {resting: {facts: [{
    topic: "rest", status: "source_reported", description: "운영기관 휴게 공간 안내",
    sourceUrl: "https://example.org/rest",
  }]}}};
  context.URL = URL;
  const origin = {id: "done", lat: 37.5, lng: 127};
  const verified = {status: "verified", scope: "입구에서 안내소", verifiedAt: "2026-11-20",
    stairsRequired: false, walkMinutes: 4};
  const near = {lat: 37.501, lng: 127};
  const catalog = [origin,
    {...near, id: "unverified", name: "외부 식당", kind: "food"},
    {...near, id: "resting", name: "근거 있는 쉼터"},
    {...near, id: "step-free", name: "계단 없는 구간", mobilityAssessment: verified},
    {...near, id: "stale", name: "오래된 자료", accessStatus: "stale", mobilityAssessment: verified},
    {...near, id: "stairs", name: "필수 계단", mobilityAssessment: {...verified, stairsRequired: true}},
    {...near, id: "conflict", name: "상충", mobilityAssessment: verified,
      accessFacts: [{topic: "stairs", status: "conflicting"}]},
    {...near, lat: 37.9, id: "distant", name: "먼 곳", mobilityAssessment: verified},
  ];
  const ids = level => Array.from(context.hbReplanAlternatives(level, itinerary, catalog), entry => entry.place.id);
  assert.deepEqual(ids("low"), []);
  assert.deepEqual(ids("mid"), ["resting", "step-free"]);
  assert.deepEqual(ids("high"), ["resting"]);
  assert.match(context.hbReplanAlternatives("mid", itinerary, catalog)[1].note, /입구에서 안내소.*4분/);
});

test("selecting an alternative replaces the first removed stop and protects original times", () => {
  const context = setup(itinerary);
  const proposal = context.hbProposal("high", itinerary, []);
  const alternative = {place: {id: "alternative", name: "새 쉼터"}, point: {lat: 37.5, lng: 127}, rest: true};
  const stops = context.hbReplanResult(itinerary, proposal, alternative);
  assert.deepEqual(Array.from(stops, stop => stop.id), ["done", "must", "alternative", "reserved", "lunch", "rest"]);
  assert.equal(stops[2].plannedArrival, "11:00");
  assert.equal(stops[2].kind, "rest");
  assert.equal(stops[3].time, "12:00");
  assert.equal(stops[3].booked, true);
  assert.equal(itinerary[2].id, "first-option");
  const duplicate = {...alternative, place: {id: "reserved", name: "이미 예약된 장소"}};
  assert.equal(context.hbReplanResult(itinerary, proposal, duplicate).filter(stop => stop.id === "reserved").length, 1);
});
