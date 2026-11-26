const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../web/assets/core-src/40-sharing-and-data.js'), 'utf8');
const engine = fs.readFileSync(path.join(__dirname, '../web/assets/core-src/30-itinerary-engine-and-ui.js'), 'utf8');
const coordinateHelper = engine.slice(0, engine.indexOf('function hbCreateSchedule'));
const escapeHtml = value => String(value).replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function setup({clipboard, execResult = false, mapFailure = false, stops, places = [], tripDate = '2026-11-24'} = {}) {
  const controls = new Map();
  const actions = [];
  const maps = [];
  const storage = {reads:0, writes:0};
  const make = id => {
    const attributes = {};
    return {
      id, style:{}, innerHTML:'', textContent:'', hidden:true,
      focus() { actions.push('focus:' + id); },
      select() { actions.push('select:' + id); },
      setSelectionRange(a,b) { actions.push('range:' + a + ':' + b); },
      setAttribute(key,value) { attributes[key] = String(value); },
      getAttribute(key) { return attributes[key] || null; },
    };
  };
  const document = {
    getElementById(id) {
      if (!controls.has(id)) controls.set(id, make(id));
      return controls.get(id);
    },
    querySelectorAll() { return []; },
    execCommand(command) {
      actions.push('exec:' + command);
      if (execResult instanceof Error) throw execResult;
      return execResult;
    },
  };
  const s = {date:tripDate, region:'서울', walk:'15', stairs:'avoid',
    mobilityAid:'walker', privateNotes:'비공개 일정 메모', ownerToken:'SECRET_OWNER',
    stops: stops ?? [{time:'9:00', name:'광장', ownerToken:'SECRET_STOP'}]};
  const ctx = vm.createContext({
    el:{}, document, navigator:{clipboard},
    location:new URL('https://example.test/app?privateToken=SECRET_QUERY#/share/create'),
    URL, URLSearchParams, TextEncoder, TextDecoder, atob, btoa,
    queueMicrotask, JSON, s, places, path:()=>'/places', safe:escapeHtml,
    hbRenderItineraryMap:(...args) => {
      maps.push(args);
      if (mapFailure) throw Error('SDK unavailable');
    },
    localStorage:{
      getItem() { storage.reads++; throw Error('Receiver must not load localStorage'); },
      setItem() { storage.writes++; throw Error('Receiver must not write localStorage'); },
      removeItem() { storage.writes++; throw Error('Receiver must not remove localStorage'); },
    },
  });
  vm.runInContext(coordinateHelper + source +
    '\nhbPlacesLoadedRegion="서울"; this.shareApi={share,shared,enc,dec,shareData,hbShareMapData,hbReadShareMap};',ctx);
  return {...ctx.shareApi, ctx, s, el:ctx.el, controls, actions, maps, storage};
}
function shareLink(env) {
  env.share();
  const match = env.el.innerHTML.match(/id="hb-share-url"[^>]*value="([^"]+)"/);
  assert.ok(match, 'share link must be rendered');
  const url = new URL(match[1]);
  return {url, code:url.hash.slice('#/share/'.length), payload:env.dec(url.hash.slice('#/share/'.length))};
}
const clone = value => JSON.parse(JSON.stringify(value));

test('MVP-15: creates a snapshot URL without query params and reports Clipboard success', async () => {
  let copied;
  const env = setup({clipboard:{async writeText(value) { copied = value; }}});
  const original = JSON.stringify(env.s);
  const {url,payload} = shareLink(env);
  assert.equal(url.search, '');
  assert.match(url.hash,/^#\/share\/[A-Za-z0-9_-]+$/);
  assert.equal(payload.v,2);
  assert.deepEqual(clone(payload.stops),[{time:'09:00',name:'광장'}]);
  assert.ok(payload.sharedAt && Number.isFinite(Date.parse(payload.sharedAt)));
  assert.doesNotMatch(url.href,/SECRET_QUERY|SECRET_OWNER|SECRET_STOP|mobilityAid|privateNotes|stairs/);
  assert.match(env.el.innerHTML,/만료나 회수 기능이 없어요/);
  env.controls.get('hb-share-confirm').onchange({target:{checked:true}});
  assert.equal(env.controls.get('hb-share-controls').hidden,false);
  await env.controls.get('copy').onclick();
  assert.equal(copied,url.href);
  assert.equal(env.controls.get('hb-share-copy-status').textContent,'링크를 복사했어요.');
  assert.equal(JSON.stringify(env.s),original);
  assert.equal(env.storage.writes,0);
});

test('MVP-15: Clipboard denied, legacy copy succeeds only if execCommand returns true', async () => {
  const env = setup({clipboard:{async writeText(){throw Error('Denied');}},execResult:true});
  const {url} = shareLink(env);
  await env.controls.get('copy').onclick();
  assert.match(env.controls.get('hb-share-copy-status').textContent,/링크를 복사했어요/);
  assert.ok(env.actions.includes('select:hb-share-url'));
  assert.ok(env.actions.includes('range:0:' + url.href.length));
  assert.ok(env.actions.includes('exec:copy'));
});

test('MVP-15: both Clipboard paths fail and selected link offers manual copy', async () => {
  const env = setup({execResult:false});
  shareLink(env);
  await env.controls.get('copy').onclick();
  assert.match(env.controls.get('hb-share-copy-status').textContent,/자동으로 복사하지 못했어요/);
  assert.ok(env.actions.includes('select:hb-share-url'));
  assert.doesNotMatch(env.controls.get('hb-share-copy-status').textContent,/^링크를 복사했어요/);
});

test('MVP-15: links over the limit fail without truncating the snapshot', () => {
  const env = setup({stops:Array.from({length:60},(_,i)=>({time:'10:00',name:'가'.repeat(297)+String(i).padStart(3,'0')}))});
  env.share();
  assert.match(env.el.innerHTML,/길이 제한/);
  assert.match(env.el.innerHTML,/정보를 잘라 보내지 않았습니다/);
  assert.doesNotMatch(env.el.innerHTML,/id="hb-share-url"/);
});

test('MVP-15: a separate browser reads only its fragment and never touches storage or owner state', () => {
  const sender = setup({stops:[{time:'9:05',name:'오전 방문',address:'작성자 개인 주소'},
    {time:'11:30',name:'두 번째 방문'}]});
  const {code,payload} = shareLink(sender);
  const recipient = setup({stops:[{time:'18:00',name:'다른 기기의 개인 일정'}]});
  const original = JSON.stringify(recipient.s);
  recipient.shared(code);
  assert.match(recipient.el.innerHTML,/2026-11-24/);
  assert.match(recipient.el.innerHTML,/오전 방문/);
  assert.match(recipient.el.innerHTML,/두 번째 방문/);
  assert.match(recipient.el.innerHTML,/09:05/);
  assert.match(recipient.el.innerHTML,/11:30/);
  assert.match(recipient.el.innerHTML,/방문 순서와 주소/);
  assert.match(recipient.el.innerHTML,/읽기 전용/);
  assert.doesNotMatch(recipient.el.innerHTML,/다른 기기의 개인 일정|작성자 개인 주소|SECRET_OWNER/);
  assert.equal(JSON.stringify(recipient.s),original);
  assert.deepEqual(recipient.storage,{reads:0,writes:0});
  assert.equal(recipient.maps.length,1);
  assert.deepEqual(clone(recipient.maps[0][1]),clone(payload.stops));
  assert.deepEqual(Array.from(recipient.maps[0][2]),[]);
  assert.doesNotMatch(recipient.el.innerHTML,/<button[^>]+(?:delete|remove|edit|move|reorder)|href="#\/plan"/);
});

test('MVP-15: catalog-only address, ordered times and Naver map links are visible without SDK', () => {
  const sender=setup({
    stops:[{time:'09:00',name:'박물관',placeId:'tour-123',address:'비공개 집 주소',coordinates:{lat:1,lng:1}},
      {time:'12:00',name:'점심',isPlaceholder:true,placeId:'tour-456'},
      {time:'14:00',name:'긴 주소의 장소',placeId:'tour-789'}],
    places:[{id:'tour-123',lat:37.523,lng:126.979,address:'서울특별시 용산구 서빙고로 137'},
      {id:'tour-456',address:'비공개 식당'},
      {id:'tour-789',address:'서울 '+ '중구 '.repeat(40)}],
  });
  const {code,payload}=shareLink(sender);
  assert.equal(payload.stops[0].address,'서울특별시 용산구 서빙고로 137');
  assert.deepEqual(clone(payload.stops[0].coordinates),{lat:37.523,lng:126.979});
  assert.equal(payload.stops[1].address,undefined);
  assert.equal(payload.stops[2].address,('서울 ' + '중구 '.repeat(40)).trim());
  const recipient=setup({mapFailure:true});
  recipient.shared(code);
  const html=recipient.el.innerHTML;
  assert.match(html,/<ol id="hb-shared-fallback-list"/);
  assert.match(html,/09:00[\s\S]*12:00[\s\S]*14:00/);
  assert.match(html,/서울특별시 용산구 서빙고로 137/);
  assert.match(html,/map\.naver\.com\/p\/search\//);
  assert.match(html,/overflow-wrap:anywhere/);
  assert.doesNotMatch(html,/비공개 집 주소|비공개 식당/);
  assert.match(recipient.controls.get('hb-shared-map-slot').innerHTML,/지도를 표시하지 못했어요/);
});

test('MVP-15: explicit public verified notes are included, drafts and unverified notes are excluded', () => {
  const sender=setup({stops:[
    {time:'09:00',name:'관광지',placeId:'tour-101',notice:'비공개 건강 정보',ownerToken:'HIDDEN'},
    {time:'10:00',name:'관광지2',placeId:'tour-102',memo:'비공개 메모'},
    {time:'11:00',name:'개인 보관 장소',placeId:'tour-103',address:'집 주소'}],
  places:[
    {id:'tour-101',address:'공개 주소',shareNotice:{public:true,verification:'verified',text:'정문 앞 공사 안내'}},
    {id:'tour-102',shareNotice:{public:true,verification:'unverified',text:'검증되지 않은 개인 주장'}},
    {id:'tour-103',hbPickedRegion:'서울',address:'사적 장소의 주소',lat:38,lng:127,
      shareNotice:{public:true,verification:'verified',text:'사적인 주의사항'}},
  ]});
  const {code,payload}=shareLink(sender);
  assert.deepEqual(Object.keys(payload).sort(),['date','sharedAt','stops','v']);
  assert.deepEqual(Object.keys(payload.stops[0]).sort(),['address','name','notice','placeId','time']);
  assert.equal(payload.stops[0].notice,'정문 앞 공사 안내');
  assert.deepEqual(clone(payload.stops[1]),{time:'10:00',name:'관광지2',placeId:'tour-102'});
  assert.deepEqual(clone(payload.stops[2]),{time:'11:00',name:'개인 보관 장소'});
  const bytes=JSON.stringify(payload);
  for(const marker of ['HIDDEN','비공개','사적인','개인 주장','mobilityAid','stairs','ownerToken','privateNotes','memo','walk'])
    assert.equal(bytes.includes(marker),false,'leaked '+marker);
  const receiver=setup();
  receiver.shared(code);
  assert.match(receiver.el.innerHTML,/정문 앞 공사 안내/);
  assert.doesNotMatch(receiver.el.innerHTML,/비공개|사적인|검증되지 않은/);
});

test('MVP-15: crafted HTML, URL and internal keys cannot execute or become edit links', () => {
  const env=setup();
  const code=env.enc({v:2,date:'2026-11-24',sharedAt:'2026-11-24T01:00:00.000Z',
    profile:'PRIVATE',editToken:'SECRET',stops:[{time:'09:00',
      name:'<img src=x onerror=alert(1)>',notice:'<svg onload=alert(2)>',
      placeId:'tour-100',address:'"><script>alert(3)</script>',editUrl:'javascript:alert(4)',
      coordinates:{lat:37.5,lng:126.9}}]});
  env.shared(code);
  const html=env.el.innerHTML;
  assert.match(html,/&lt;img/);
  assert.match(html,/&lt;svg/);
  assert.match(html,/&lt;script&gt;/);
  assert.doesNotMatch(html,/<img src=x|<svg onload|<script>|javascript:alert|SECRET|PRIVATE|editToken/);
  assert.doesNotMatch(html,/href="#\/plan"|href="javascript:/);
  assert.match(html,/href="https:\/\/map.naver.com\/p\/search\//);
});

test('MVP-15: invalid, empty, oversized, malformed and unsupported links show only a recovery state', () => {
  const env=setup();
  const examples=['','x'.repeat(24001),'===','%%%','abCD','a'.repeat(2001)+'!',
    env.enc({v:3,date:'2026-11-24',stops:[{time:'09:00',name:'A'}]}),
    env.enc({v:1,date:'2026-02-31',stops:[{time:'09:00',name:'A'}]}),
    env.enc({v:1,date:'2026-11-24',stops:[]}),
    env.enc({v:2,date:'2026-11-24',sharedAt:'2026-11-24T01:00:00.000Z',stops:[null]}),
    env.enc({v:2,date:'2026-11-24',sharedAt:'bad',stops:[{time:'09:00',name:'A'}]}),
    env.enc({v:1,date:'2026-11-24',stops:[{time:'25:00',name:'A'}]})];
  for(const code of examples){
    env.shared(code);
    assert.match(env.el.innerHTML,/id="hb-share-error"/);
    assert.doesNotMatch(env.el.innerHTML,/hb-own-trip|hb-share-large-text|hb-shared-fallback-list/);
  }
  assert.throws(()=>env.shareData('2026-11-24',Array(61).fill({time:'09:00',name:'A'})));
});

test('MVP-15: large print can be toggled without editing or truncating long text', () => {
  const longName='긴 이름 '.repeat(40)+'끝';
  const env=setup({stops:[{time:'09:00',name:longName,placeId:'tour-900'}],
    places:[{id:'tour-900',address:'서울특별시 '+ '아주 긴 주소 '.repeat(14)}]});
  const {code}=shareLink(env);
  const receiver=setup();
  receiver.shared(code);
  const toggle=receiver.controls.get('hb-share-large-text');
  const root=receiver.controls.get('hb-share-receiver');
  assert.match(receiver.el.innerHTML,/큰 글씨로 보기/);
  assert.match(receiver.el.innerHTML,/max-width:100%/);
  assert.match(receiver.el.innerHTML,/아주 긴 주소/);
  assert.match(receiver.el.innerHTML,/끝/);
  toggle.onclick();
  assert.equal(root.style.fontSize,'1.35rem');
  assert.equal(toggle.getAttribute('aria-pressed'),'true');
  toggle.onclick();
  assert.equal(root.style.fontSize,'');
  assert.equal(toggle.getAttribute('aria-pressed'),'false');
  assert.equal(receiver.storage.writes,0);
});

test('MVP-15: old v1 share links still work and expose no draft state', () => {
  const env=setup();
  env.shared(env.enc({v:1,date:'2026-11-24',mobilityAid:'wheelchair',
    stops:[{time:'9:00',name:'기존 일정 <강당>',ownerToken:'LEAK'}]}));
  assert.match(env.el.innerHTML,/09:00/);
  assert.match(env.el.innerHTML,/기존 일정 &lt;강당&gt;/);
  assert.match(env.el.innerHTML,/읽기 전용/);
  assert.doesNotMatch(env.el.innerHTML,/wheelchair|LEAK|<input|href="#\/plan"/);
  assert.equal(env.maps.length,0);
});
