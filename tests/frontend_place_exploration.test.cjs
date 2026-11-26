"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const assets = path.join(__dirname, "../web/assets/core-src");
const context = vm.createContext({ URL });
for (const script of ["10-recommendation-and-profile.js", "20-detail-and-replan.js"]) {
  vm.runInContext(fs.readFileSync(path.join(assets, script), "utf8"), context);
}

const place = { id: "tour-101", name: "두 번째 관광지", address: "서울 강남구", kind: "spot" };
const food = { id: "tour-102", name: "Han River 식당", address: "경기", kind: "food" };
const bookshop = { id: "tour-103", name: "서점", kind: "culture", accessFacts: [{ label: "주차" }] };
const records = [place, food, bookshop];
const strict = { walk: 15, stairsMode: "impossible", needs: [] };

test("search handles Korean spacing, English case, address, and category together", () => {
  const ids = (filter, query) => Array.from(context.hbSearchPlaces(records, filter, query), p => p.id);
  assert.deepEqual(ids("all", " 두번째 "), [place.id]);
  assert.deepEqual(ids("food", "HAN river"), [food.id]);
  assert.deepEqual(ids("spot", "서울 강남구"), [place.id]);
  assert.deepEqual(ids("access", "서점"), [bookshop.id]);
  assert.deepEqual(ids("food", "서울"), []);
});

test("public text and conflicts cannot prove that a place meets the mobility profile", () => {
  const assessment = context.hbEvaluatePlace({
    ...place,
    accessFacts: [null, { label: "계단", description: "계단 이용이 필수가 아님" }],
  }, strict);
  assert.equal(assessment.status, "review");
  assert.notEqual(assessment.gaps.indexOf("계단 없는 전체 이동 동선 확인 필요"), -1);
  const mobilityAssessment = {
    status: "verified", scope: "주차장에서 관람 구간까지", verifiedAt: "2026-11-23",
    walkMinutes: 10, stairsRequired: true,
  };
  assert.equal(context.hbEvaluatePlace({ ...place, mobilityAssessment }, strict).status, "excluded");
  assert.equal(context.hbEvaluatePlace({
    ...place, mobilityAssessment, accessFacts: [{ status: "conflicting" }],
  }, strict).status, "review");
  assert.equal(context.hbEvaluatePlace({
    ...place, mobilityAssessment: { ...mobilityAssessment, stairsRequired: false },
  }, strict).status, "confirmed");
});

test("evidence statuses and source hyperlinks require the supported metadata", () => {
  assert.equal(context.hbEvidenceStatus({ status: "verified_yes" }), "검증 범위 확인 필요");
  assert.equal(context.hbEvidenceStatus({ status: "conflicting" }), "출처 상충");
  assert.equal(context.hbEvidenceStatus({ status: "stale" }), "오래된 정보");
  assert.equal(context.hbEvidenceStatus({
    status: "verified_no", verifiedAt: "2026-11-23", scope: "북문 계단 구간",
  }), "이용 불가 확인");
  assert.equal(context.hbEvidenceSourceLink("https://www.data.go.kr/data/"), "https://www.data.go.kr/data/");
  for (const address of ["javascript:alert(1)", "https://user:password@example.com/", "/untrusted"]) {
    assert.equal(context.hbEvidenceSourceLink(address), null);
  }
  const id = "한글 #/장소";
  assert.equal(context.hbDecodePlaceId(context.hbPlaceDetailPath(id).slice(8)), id);
  assert.equal(context.hbDecodePlaceId("%ZZ"), null);
});
