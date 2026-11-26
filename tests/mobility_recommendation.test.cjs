'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const {classify} = require('../web/server/travel.cjs');

const source = fs.readFileSync(path.join(__dirname, '../web/assets/core-src/10-recommendation-and-profile.js'), 'utf8');
const browser = vm.createContext({});
vm.runInContext(source, browser);

const route = {
  status: 'verified', scope: '동문 하차 지점부터 1층 안내데스크',
  verifiedAt: '2026-11-23', walkMinutes: 10, stairsRequired: false,
  verifiedMobilityAids: ['wheelchair', 'walker'],
};
const place = {id: 'tour-100', accessFacts: [{label:'휠체어 대여'}], mobilityAssessment: route};

function status(candidate, mobilityAid, stairs = 'possible') {
  const local = browser.hbEvaluatePlace(candidate, {walk: 15, stairsMode: stairs, needs: [], mobilityAid});
  const remote = classify(candidate, {walkingMinutes: 15, stairs, mobilityAid});
  assert.equal(remote.status, {confirmed:'eligible', review:'needsReview', excluded:'excluded'}[local.status]);
  return local;
}

test('facility mention cannot confirm that the route can be used with a wheelchair', () => {
  assert.equal(status({...place, mobilityAssessment: undefined}, 'wheelchair').status, 'review');
  const generic = {...place, mobilityAssessment: {...route, verifiedMobilityAids: []}};
  assert.equal(status(generic, 'wheelchair').status, 'review');
  assert.equal(status(generic, 'walker').status, 'review');
});

test('step-free assistive-device assessment retains the verified scope', () => {
  assert.equal(status(place, 'wheelchair').scope, route.scope);
  assert.equal(status(place, 'walker').status, 'confirmed');
  assert.equal(status({...place, mobilityAssessment: {...route, stairsRequired: undefined}}, 'walker').status, 'review');
  assert.equal(status(place, 'other').status, 'review');
});

test('confirmed mandatory stairs conflict with wheelchair use even if some stairs are otherwise possible', () => {
  const stairs = {...place, mobilityAssessment: {...route, stairsRequired: true}};
  assert.equal(status(stairs, 'wheelchair').status, 'excluded');
  assert.equal(status(stairs, 'walker').status, 'review');
  assert.equal(status(stairs, 'walker', 'impossible').status, 'excluded');
});

test('stale or conflicting evidence cannot confirm or rule out a route', () => {
  for (const accessStatus of ['stale', 'conflicting']) {
    assert.equal(status({...place, accessStatus}, 'wheelchair').status, 'review');
    const candidate = {...place, accessStatus, mobilityAssessment: {...route, stairsRequired: true}};
    assert.equal(status(candidate, 'wheelchair').status, 'review');
  }
});
