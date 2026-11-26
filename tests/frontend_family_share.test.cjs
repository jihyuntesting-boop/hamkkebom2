const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../web/assets/core-src/40-sharing-and-data.js'), 'utf8');
const engine = fs.readFileSync(path.join(__dirname, '../web/assets/core-src/30-itinerary-engine-and-ui.js'), 'utf8');
const mapCoordinatesSource = engine.slice(0, engine.indexOf('function hbCreateSchedule'));
const controls = new Map();
const storage = JSON.stringify({walk:'15', stairs:'avoid'});
function setup({clipboard, stops, places = []} = {}) {
  controls.clear();
  const el = {};
  const calls = [];
  const renders = [];
  const document = {
    getElementById(id) {
      if (!controls.has(id)) controls.set(id, {
        focus() { calls.push('focus'); },
        select() { calls.push('select'); },
      });
      return controls.get(id);
    },
    querySelectorAll() { return [this.getElementById('weather')]; },
  };
  const ctx = vm.createContext({
    el, document, location: new URL('https://example.test/?private=x#/share/create'),
    navigator: {clipboard}, URL, URLSearchParams, TextEncoder, TextDecoder, atob, btoa,
    queueMicrotask, JSON, localStorage:{getItem:()=>storage},
    s:{date:'2026-11-23',region:'서울',walk:'15',stops:stops || [{time:'9:00',
      name:'남산 한옥 <정원>', reserved:true, accessFacts:[{source:'private'}]}]},
    path:()=>'/places', places,
    hbRenderItineraryMap:(...args)=>renders.push(args),
    safe: value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),
  });
  vm.runInContext(mapCoordinatesSource + source +
    '\nhbPlacesLoadedRegion = "서울"; this.api={share,shared,enc,dec,shareData,getWeather,weatherText};', ctx);
  return {ctx, el, calls, renders, ...ctx.api};
}

test('sender cuts query and private data and selects URL when copy fails', async () => {
  const {share, dec, el, calls} = setup();
  share();
  assert.match(el.innerHTML, /만료나 회수 기능이 없어요/);
  const href = el.innerHTML.match(/id="hb-share-url"[^>]*value="([^"]+)"/)[1];
  const url = new URL(href);
  assert.equal(url.search, '');
  const {sharedAt, ...payload} = JSON.parse(JSON.stringify(dec(url.hash.split('/')[2])));
  assert.equal(new Date(sharedAt).toISOString(), sharedAt);
  assert.deepEqual(payload, {
    v:2, date:'2026-11-23', stops:[{time:'09:00',name:'남산 한옥 <정원>'}],
  });
  controls.get('hb-share-confirm').onchange({target:{checked:true}});
  assert.equal(controls.get('hb-share-controls').hidden, false);
  await controls.get('copy').onclick();
  assert.deepEqual(calls,['focus','select']);
  assert.match(controls.get('hb-share-copy-status').textContent,/자동으로 복사하지 못했어요/);
});

test('recipient reads version 1 and renders user fields as text', () => {
  const {enc, shared, el} = setup();
  shared(enc({v:1, region:'old field', walk:'private', date:'2026-11-23',
    stops:[{time:'10:30', name:'긴 일정 <이름>'}]}));
  assert.match(el.innerHTML, /<time datetime="10:30">10:30<\/time>/);
  assert.match(el.innerHTML, /긴 일정 &lt;이름&gt;/);
  assert.doesNotMatch(el.innerHTML, /old field|private|<input|<script/);
  assert.match(el.innerHTML, /id="hb-own-trip" href="#\/new"/);
});

test('version 2 shares catalog coordinates without exposing saved coordinates or private fields', () => {
  const {share, shared, dec, el, renders} = setup({
    stops:[
      {time:'09:00', name:'박물관', placeId:'tour-129703', address:'비공개 입력 주소', coordinates:{lat:1,lng:1}, ownerToken:'private'},
      {time:'10:00', name:'휴식', id:'rest-draft-1', coordinates:{lat:37,lng:127}, isPlaceholder:true},
      {time:'11:00', name:'확인되지 않은 장소', id:'tour-999', coordinates:{lat:38,lng:126}},
    ],
    places:[{id:'tour-129703', lat:37.523, lng:126.979, address:'서울특별시 용산구 서빙고로 137'}],
  });
  share();
  const code = new URL(el.innerHTML.match(/id="hb-share-url"[^>]*value="([^"]+)"/)[1]).hash.split('/')[2];
  const payload = JSON.parse(JSON.stringify(dec(code)));
  assert.deepEqual(payload.stops, [
    {time:'09:00', name:'박물관', placeId:'tour-129703', coordinates:{lat:37.523,lng:126.979}, address:'서울특별시 용산구 서빙고로 137'},
    {time:'10:00', name:'휴식'},
    {time:'11:00', name:'확인되지 않은 장소'},
  ]);
  shared(code);
  assert.match(el.innerHTML, /읽기 전용/);
  assert.match(el.innerHTML, /링크 생성/);
  assert.match(el.innerHTML, /hb-shared-map-slot/);
  assert.doesNotMatch(el.innerHTML, /<input|ownerToken|private|비공개 입력 주소/);
  assert.doesNotMatch(JSON.stringify(payload), /비공개 입력 주소/);
  assert.equal(renders.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(renders[0][1])), payload.stops);
  assert.equal(renders[0][2].length, 0);
});

test('share address is optional, bounded and never taken from a private stop', () => {
  const {share, dec, el} = setup({
    stops:[
      {time:'09:00', name:'주소가 있는 곳', placeId:'tour-101', address:'개인 집 주소'},
      {time:'10:00', name:'너무 긴 주소', placeId:'tour-102', address:'비공개 상세주소'},
      {time:'11:00', name:'출처 없는 곳', placeId:'tour-103', address:'개인 주소'},
    ],
    places:[
      {id:'tour-101', address:'서울특별시 종로구 세종로 1'},
      {id:'tour-102', address:'가'.repeat(201)},
    ],
  });
  share();
  const code = new URL(el.innerHTML.match(/id="hb-share-url"[^>]*value="([^"]+)"/)[1]).hash.split('/')[2];
  const payload = JSON.parse(JSON.stringify(dec(code)));
  assert.deepEqual(payload.stops, [
    {time:'09:00', name:'주소가 있는 곳', placeId:'tour-101', address:'서울특별시 종로구 세종로 1'},
    {time:'10:00', name:'너무 긴 주소', placeId:'tour-102'},
    {time:'11:00', name:'출처 없는 곳'},
  ]);
  assert.doesNotMatch(JSON.stringify(payload), /개인 집 주소|비공개 상세주소|개인 주소/);
});

test('version 2 ignores invalid place IDs and coordinates while keeping the schedule', () => {
  const {enc, shared, el, renders} = setup();
  shared(enc({v:2, date:'2026-11-23', sharedAt:'2026-11-23T01:00:00.000Z', stops:[
    {time:'09:00', name:'장소 A', placeId:'private-1', coordinates:{lat:37,lng:127}},
    {time:'10:00', name:'장소 B', placeId:'tour-200', coordinates:{lat:100,lng:127}},
  ]}));
  assert.match(el.innerHTML, /hb-shared-map-slot/);
  assert.deepEqual(JSON.parse(JSON.stringify(renders[0][1])), [
    {time:'09:00', name:'장소 A'},
    {time:'10:00', name:'장소 B', placeId:'tour-200'},
  ]);
});

test('invalid, empty, overly long and unsupported links present an error', () => {
  const {enc, shared, share, el, shareData} = setup({stops:[]});
  share();
  assert.match(el.innerHTML,/hb-share-error/);
  for (const code of ['', 'not an encoded link', 'x'.repeat(24001),
    enc({v:2,date:'2026-11-23',stops:[]}),
    enc({v:2,date:'2026-11-23',sharedAt:'2026-02-31T01:00:00.000Z',stops:[{time:'10:00',name:'장소'}]}),
    enc({v:1,date:'2026-02-31',stops:[{time:'10:00',name:'장소'}]}),
    enc({v:1,date:'2026-11-23',stops:[{time:'25:00',name:'장소'}]})]) {
    shared(code);
    assert.match(el.innerHTML,/hb-share-error/);
  }
  assert.throws(() => shareData('2026-11-23',Array(61).fill({time:'10:00',name:'장소'})));
});

test('weather distinctly represents loading, old results, no data and errors', async () => {
  const {ctx, getWeather, weatherText} = setup();
  let resolveFirst;
  const pending = new Promise(resolve => { resolveFirst = resolve; });
  ctx.get = () => pending;
  const first = getWeather();
  assert.match(weatherText(), /확인하고 있어요/);
  ctx.s.date='2026-11-24';
  ctx.get = async () => ({summary:''});
  await getWeather();
  assert.match(weatherText(), /예보를 확인할 수 없어요/);
  resolveFirst({summary:'이전 날짜 예보'});
  await first;
  assert.doesNotMatch(weatherText(), /이전 날짜/);
  ctx.get = async () => { throw Error('upstream'); };
  await getWeather();
  assert.match(weatherText(), /날씨를 불러오지 못했어요/);
});

test('weather remains tied to itinerary metadata across views and retries', async () => {
  const {ctx, getWeather, weatherText} = setup();
  ctx.s.hbPlanInfo = {date:'2026-11-22',region:'경기'};
  ctx.path = () => '/plan';
  let resolve;
  const calls=[];
  ctx.get = request => {
    const url = new URL(request,'https://example.test'),params=url.searchParams;
    assert.equal(params.get('region'),'경기');
    assert.equal(params.get('date'),'2026-11-22');
    calls.push(params.get('type'));
    if(params.get('type')==='alerts')return Promise.resolve({status:'unknown'});
    return new Promise(done => { resolve = done; });
  };
  const pending = getWeather();
  ctx.path = () => '/places';
  resolve({mode:'live',status:'available',summary:'기온 8°C',issuedAt:'2026-11-22T08:00:00+09:00',evidence:{representativeAt:'2026-11-22T09:00:00+09:00'}});
  await pending;
  assert.doesNotMatch(weatherText(), /8°C/);
  ctx.path = () => '/plan';
  assert.deepEqual(calls,['weather','alerts']);
  assert.match(weatherText(),/기온 8°C/);
  assert.doesNotMatch(weatherText(),/특보 상태 확인 필요|대표/);
  ctx.get = async request => new URL(request,'https://example.test').searchParams.get('type')==='alerts'?{status:'unknown'}:{mode:'live',status:'no_forecast',summary:null};
  await getWeather();
  assert.match(weatherText(), /예보 제공 범위를 확인해 주세요/);
});
