'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const mapSource = fs.readFileSync(path.join(__dirname, '../web/assets/core-src/50-map-and-startup.js'), 'utf8');
const homeSource = fs.readFileSync(path.join(__dirname, '../web/assets/core-src/00-bootstrap.js'), 'utf8');
const start = mapSource.indexOf('function hbSearchMapCenter(){');
const end = mapSource.indexOf('\nfunction dropNearbyMap(){', start);
assert.ok(start >= 0 && end > start, 'map center search function must exist');
const validStart = mapSource.indexOf('function hbValidMapPoint(');
const validEnd = mapSource.indexOf('\nfunction setNearbyStatus()', validStart);
assert.ok(validStart >= 0 && validEnd > validStart);
const snippet = mapSource.slice(validStart, validEnd) + '\n' + mapSource.slice(start, end);

function invoke(map) {
  const observed = {calls: [], updates: 0};
  const context = vm.createContext({
    nearbyMap: map,
    nearbyMode: '서울 시청 중심',
    nearbyError: '',
    fetchNearby: (...args) => observed.calls.push(args),
    setNearbyStatus: () => { observed.updates++; },
  });
  vm.runInContext(snippet + '\nhbSearchMapCenter()', context);
  return {observed, mode: context.nearbyMode, error: context.nearbyError};
}

test('map requery uses the visible map center, never stale GPS or Seoul coordinates', () => {
  const {observed, mode} = invoke({
    getCenter: () => ({lat: () => 37.77125, lng: () => 127.12455}),
  });
  assert.deepEqual(observed.calls, [[37.77125, 127.12455, false, '지도 중심']]);
  assert.equal(mode, '현재 지도 중심 기준');
});

test('map center requery does nothing before the SDK has mounted', () => {
  assert.deepEqual(invoke(null).observed.calls, []);
});

test('invalid SDK map coordinates never trigger a server request', () => {
  for (const [lat, lng] of [[Infinity,127],[91,127],[37,181],[NaN,127],[null,127],[37,null],['37',127]]) {
    const {observed, error} = invoke({getCenter: () => ({lat: () => lat, lng: () => lng})});
    assert.deepEqual(observed.calls, []);
    assert.match(error, /좌표|위치/);
    assert.equal(observed.updates, 1);
  }
});

test('SDK map getter failure is recoverable and does not trigger a request', () => {
  const {observed, error} = invoke({getCenter: () => { throw Error('SDK failure'); }});
  assert.deepEqual(observed.calls, []);
  assert.match(error, /좌표|위치/);
  assert.equal(observed.updates, 1);
});

test('home exposes a map-first explicit search, disabled until map is ready', () => {
  assert.match(homeSource, /id="hb-search-map-center"[^>]*disabled/);
  assert.match(homeSource, /getElementById\('hb-search-map-center'\)\.onclick=hbSearchMapCenter/);
  assert.match(mapSource, /searchButton\.disabled=true/);
  assert.match(mapSource, /searchButton\.disabled=false/);
  assert.match(mapSource, /nearbyCenterLabel=centerLabel\|\|/);
});

 test('SDK coordinate method failure is recoverable and makes no request', () => {
  for (const map of [{getCenter:()=>({lat:()=>{throw Error('invalid');},lng:()=>127})},{getCenter:()=>({lat:37,lng:127})},{getCenter:()=>null}]) {
    const {observed,error}=invoke(map);
    assert.deepEqual(observed.calls,[]);
    assert.match(error,/좌표|위치/);
    assert.equal(observed.updates,1);
  }
});
