'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../web/assets/core-src/50-map-and-startup.js'), 'utf8');
function slice(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a !== -1 && b > a, 'expected map code boundary: ' + start);
  return source.slice(a, b);
}
function context(extra = {}) {
  return vm.createContext({console, setTimeout, clearTimeout, Promise, ...extra});
}
function run(code, env) {
  vm.runInContext(code, env);
  return env;
}
const valid = slice('function hbValidMapPoint(', '\nfunction setNearbyStatus()');
const gps = slice('function requestLocation(){', '\nfunction leaflet()');
const search = slice('function hbSearchMapCenter(){', '\nfunction dropNearbyMap(){');
const fetchCode = slice('async function fetchNearby(', '\nfunction drawNearbyList(){');
const visible = slice('function hbNearbyVisiblePlaces(){', '\nfunction hbRememberNearbyPlace(');
const sdk = slice('let naverSdkPromise=null;', '\nlet hbPlanMapView=null;');

test('GPS permission allowed uses real valid coordinates', () => {
  let success, requested;
  const env = context({
    nearbyRequestId: 0, featuredRequestId: 0, nearbyLoading: false,
    nearbyError: '', nearbyMode: '', setNearbyStatus(){}, drawNearbyList(){},
    fetchNearby(...args){ requested=args; },
    navigator:{geolocation:{getCurrentPosition(ok){success=ok;}}}
  });
  run(valid + gps + '\nrequestLocation()',env);
  success({coords:{latitude:37.5,longitude:127.1}});
  assert.deepEqual(requested, [37.5,127.1,true]);
});
test('GPS denied and timed out use Seoul fallback and never call it current location', () => {
  for(const code of [1,3]){
    let fail, requested;
    const env = context({
      nearbyRequestId:0,featuredRequestId:0,nearbyMode:'',nearbyLoading:false,
      setNearbyStatus(){},drawNearbyList(){},fetchNearby(...args){requested=args;},
      navigator:{geolocation:{getCurrentPosition(ok,error){fail=error;}}}
    });
    run(valid+gps+'\nrequestLocation()',env);
    fail({code});
    assert.deepEqual(requested,[37.5665,126.978,false]);
    assert.match(env.nearbyMode,/서울 시청/);
  }
});
test('missing GPS and invalid GPS coordinates also use fallback', () => {
  for(const geo of [null, {getCurrentPosition(ok){ok({coords:{latitude:999,longitude:127}})}}]){
    let requested;
    const env=context({nearbyRequestId:0,featuredRequestId:0,
      setNearbyStatus(){},drawNearbyList(){},fetchNearby(...args){requested=args;},
      navigator:geo?{geolocation:geo}:{}});
    run(valid+gps+'\nrequestLocation()',env);
    assert.deepEqual(requested,[37.5665,126.978,false]);
  }
});
test('map center requery preserves PR #31 semantics',()=>{
  let requested;
  const env=context({nearbyMap:{getCenter(){return {lat:()=>37.9,lng:()=>127.2}}},
    fetchNearby(...args){requested=args;},setNearbyStatus(){},nearbyError:'',nearbyMode:''});
  run(valid+search+'\nhbSearchMapCenter()',env);
  assert.deepEqual(requested,[37.9,127.2,false,'지도 중심']);
});
test('rapid successive nearby searches cannot replace latest results', {timeout: 2000}, async ()=>{
  const pending=[];
  const env=context({
    nearbyRequestId:0,featuredRequestId:0,nearbyCenterLabel:'',nearbyCenter:[],nearFilter:'spot',nearbyResultCategory:null,nearbyResultMeta:null,nearbyResultCenterLabel:'',
    nearbyUser:false,nearbyLoading:false,nearbyError:'',nearbyItems:[],
    featuredPlaces:[],featuredLoading:false,featuredError:'',
    setNearbyStatus(){},drawNearbyList(){},updateNearbyPins(){},
    get(url){return new Promise(resolve=>pending.push({url,resolve}));}
  });
  run(fetchCode,env);
  const first=vm.runInContext('fetchNearby(37.5,127,false)',env);
  const second=vm.runInContext('fetchNearby(37.6,127.1,false)',env);
  assert.equal(pending.length,4, 'each search requests nearby and featured');
  const resolve = (route,lat,id) => {
    const matches=pending.filter(p=>p.url.startsWith('/api/'+route+'.js?') && p.url.includes('lat='+lat));
    assert.equal(matches.length,1);
    matches[0].resolve({places:[{id,kind:'spot'}]});
  };
  resolve('nearby','37.6000','new');
  resolve('featured','37.6000','new-featured');
  await second;
  resolve('nearby','37.5000','old');
  resolve('featured','37.5000','old-featured');
  await first;
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(env.nearbyItems[0].id,'new');
  assert.equal(env.featuredPlaces[0].id,'new-featured');
  assert.equal(env.nearbyLoading,false);
  assert.equal(env.featuredLoading,false);
});
test('filtered map pins and list share stable place IDs',()=>{
  const env=context({nearFilter:'food',
    nearbyItems:[{id:'food-1',name:'식당',kind:'food'},{id:'spot-1',name:'정원',kind:'spot'}],
    featuredPlaces:[{id:'feature-1',name:'명소'}]});
  run(visible,env);
  assert.deepEqual(Array.from(vm.runInContext('hbNearbyVisiblePlaces().map(p=>p.id)',env)),['food-1']);
  env.nearFilter='spot';
  assert.deepEqual(Array.from(vm.runInContext('hbNearbyVisiblePlaces().map(p=>p.id)',env)),['spot-1','feature-1']);
  env.nearFilter='all';
  assert.deepEqual(Array.from(vm.runInContext('hbNearbyVisiblePlaces().map(p=>p.id)',env)),
    ['food-1','spot-1','feature-1']);
  assert.match(source,/nearbyMapMarkers\.set\(p\.id,marker\)/);
  assert.match(source,/data-near-map/);
  assert.match(source,/hbSelectNearbyPlace\(b\.dataset\.nearMap,true\)/);
});
test('SDK successful loading and failed loading both settle; failure allows retry', async ()=>{
  const scripts=[];
  const env=context({
    window:{naver:null},hbPlanMapView:null,
    document:{head:{appendChild(node){scripts.push(node);}},createElement(){return {remove(){}};}},
  });
  run(sdk,env);
  const p=vm.runInContext('loadNaverMap()',env);
  env.window.naver={maps:{Map:function Map(){}}};
  scripts[0].onload();
  assert.ok((await p).Map);
  env.window.naver=null;
  vm.runInContext('naverSdkPromise=null',env);
  const bad=vm.runInContext('loadNaverMap()',env);
  scripts[1].onerror();
  await assert.rejects(bad,/Map unavailable/);
  const retry=vm.runInContext('loadNaverMap()',env);
  env.window.naver={maps:{Map:function Map(){}}};
  scripts[2].onload();
  assert.ok((await retry).Map);
});
test('map reentry destroys prior instance and ignores obsolete SDK resolution',()=>{
  assert.match(source,/\+\+nearbyMapEpoch/);
  assert.match(source,/epoch!==nearbyMapEpoch/);
  assert.match(source,/removeListener/);
  assert.match(source,/map\?\.destroy\(\)/);
  assert.match(source,/host\.dataset\.mapState='error'/);
});
test('map error preserves selectable cards and itinerary actions',()=>{
  assert.match(source,/목록과 일정 담기는 계속 이용할 수 있어요/);
  assert.match(source,/data-near-pick/);
  assert.match(source,/s\.chosen\.push\(p\.id\)/);
  assert.match(source,/장소 상세 보기/);
  assert.match(source,/지도 다시 불러오기/);
});


// Reproduce the home map disappearing after asynchronously loaded place pins.
// Use the actual source functions with fault injection, not a fake success path.
test('a bad marker or popup does not destroy the base map or remaining pins',()=>{
  const map={setCenter(){},setZoom(){},destroy(){assert.fail('base map destroyed')}};
  const placeList=[{id:'bad',name:'bad',lat:37.5,lng:127,distanceKm:1},
    {id:'good',name:'good',lat:37.51,lng:127,distanceKm:1}];
  const env=context({
    nearbyMap:map,nearbyLayer:[],nearbyMapListeners:[],nearbyMapMarkers:new Map(),
    nearbyCenter:[37.5,127],nearbyCenterLabel:'서울',nearbyUser:false,
    nearbySelectedId:null,nearbyPinWarning:'',setNearbyStatus(){},
    safe:String,hbNearbyVisiblePlaces:()=>placeList,hbRememberNearbyPlace(){},
    hbSelectNearbyPlace(){},hbNearbyDetailLink:()=> '#/place/good',
    dropNearbyMap(){assert.fail('base map dropped')},
    renderNearbyMapFailure(){assert.fail('base map replaced')},
    window:{naver:{maps:{
      LatLng:class {},Point:class {},
      Marker:class {constructor(opts){if(opts.title==='bad')throw Error('bad marker');this.opts=opts}setMap(){}},
      InfoWindow:class {constructor(){throw Error('bad popup')}},
      Event:{addListener(marker,event,fn){marker.click=fn;return marker},removeListener(){}}
    }}}
  });
  run(valid+slice('function hbSetNearbyPinWarning(', 'function showFamousOnMap()'),env);
  vm.runInContext('updateNearbyPins()',env);
  assert.equal(env.nearbyMap,map);
  assert.ok(env.nearbyMapMarkers.has('good'));
  assert.equal(env.nearbyMapMarkers.has('bad'),false);
  assert.match(env.nearbyPinWarning,/일부 지도 표시/);
  env.nearbyMapMarkers.get('good').click();
  assert.equal(env.nearbyMap,map);
  placeList.shift();
  vm.runInContext('updateNearbyPins(false)',env);
  assert.equal(env.nearbyPinWarning,'');
  assert.ok(env.nearbyMapMarkers.has('good'));
});
test('recenter failure preserves map and pins',()=>{
  const map={setCenter(){throw Error('center unavailable')},setZoom(){}};
  const env=context({
    nearbyMap:map,nearbyLayer:[],nearbyMapListeners:[],nearbyMapMarkers:new Map(),
    nearbyCenter:[37.5,127],nearbyCenterLabel:'서울',nearbyUser:false,
    nearbySelectedId:null,nearbyPinWarning:'',setNearbyStatus(){},safe:String,
    hbNearbyVisiblePlaces:()=>[{id:'good',name:'good',lat:37.51,lng:127,distanceKm:1}],
    window:{naver:{maps:{LatLng:class {},Point:class {},Marker:class {},Event:{addListener(){}}}}}
  });
  run(valid+slice('function hbSetNearbyPinWarning(', 'function showFamousOnMap()'),env);
  vm.runInContext('updateNearbyPins()',env);
  assert.equal(env.nearbyMap,map);
  assert.ok(env.nearbyMapMarkers.has('good'));
  assert.match(env.nearbyPinWarning,/일부 지도 표시/);
});


test('failed same-category requery preserves last successful place and origin label',async()=>{
 const env=context({nearbyRequestId:0,featuredRequestId:0,nearbyCenterLabel:'서울 시청',nearbyCenter:[37.5,127],nearbyUser:false,nearFilter:'spot',nearbyResultCategory:'spot',nearbyResultMeta:{partial:false},nearbyResultCenterLabel:'내 위치',nearbyItems:[{id:'saved',kind:'spot'}],nearbyLoading:false,nearbyError:'',featuredPlaces:[],featuredLoading:false,featuredError:'',setNearbyStatus(){},drawNearbyList(){},updateNearbyPins(){},get:async()=>{throw Error('upstream');}});
 run(fetchCode,env);
 await vm.runInContext("fetchNearby(37.6,127,false,'지도 중심',false)",env);
 assert.equal(env.nearbyItems[0].id,'saved');assert.equal(env.nearbyResultCenterLabel,'내 위치');assert.match(env.nearbyError,/불러오지 못/);
});
