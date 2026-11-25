// Share links embed an immutable, read-only schedule in the URL fragment.
const MAX_SHARED_STOPS = 60;
const MAX_SHARE_CODE = 24000;
const enc = value => {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const dec = code => {
  if (code.length > MAX_SHARE_CODE || !/^[A-Za-z0-9_-]+$/.test(code)) throw Error('Invalid share code');
  const bytes = Uint8Array.from(atob(code.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes));
};

function shareData(date, stops) {
  const validDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  if (!validDate || !Array.isArray(stops) || !stops.length || stops.length > MAX_SHARED_STOPS) {
    throw Error('Invalid itinerary');
  }
  const publicStops = stops.map(stop => {
    if (!stop || typeof stop.time !== 'string' || !/^([01]?\d|2[0-3]):[0-5]\d$/.test(stop.time)
        || typeof stop.name !== 'string' || !stop.name.trim() || stop.name.length > 300) throw Error('Invalid stop');
    return {time:stop.time.padStart(5,'0'), name:stop.name.trim()};
  });
  return {v:1, date, stops:publicStops};
}

function hbSharedPlaceFields(placeId, location, address) {
  if (typeof placeId !== 'string' || !/^tour-\d{1,12}$/.test(placeId)) return {};
  const coordinates = hbMapCoordinates(location);
  // Only catalog-approved public addresses are copied at creation time.
  // Do not copy address, coordinates, or other fields from the owner's draft.
  const publicAddress = typeof address === 'string' && address.trim() && address.length <= 200
    && !/[\u0000-\u001f\u007f]/.test(address) ? address.trim() : null;
  return {placeId, ...(coordinates ? {coordinates} : {}), ...(publicAddress ? {address:publicAddress} : {})};
}

function hbShareMapData(date, stops, catalog, sharedAt) {
  const schedule = shareData(date, stops);
  const publicPlaces = new Map(catalog.map(place => [place.id, place]));
  const publicStops = schedule.stops.map((stop, index) => {
    const item = stops[index];
    if (item.isPlaceholder) return stop;
    const match = publicPlaces.get(item.placeId || item.id);
    // Use the public catalog. A saved stop's private or stale coordinates
    // may be useful to its owner but are never copied into a share link.
    return match ? {...stop, ...hbSharedPlaceFields(match.id, match, match.address)} : stop;
  });
  return {v:2, date, sharedAt, stops:publicStops};
}

function hbReadShareMap(data) {
  const schedule = shareData(data.date, data.stops);
  if (typeof data.sharedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(data.sharedAt)
      || !Number.isFinite(Date.parse(data.sharedAt)) || new Date(data.sharedAt).toISOString() !== data.sharedAt) {
    throw Error('Invalid share timestamp');
  }
  const stops = schedule.stops.map((stop, index) => {
    const {placeId, coordinates, address} = data.stops[index];
    return {...stop, ...hbSharedPlaceFields(placeId, coordinates, address)};
  });
  return {...schedule, v:2, sharedAt:data.sharedAt, stops};
}

function share() {
  let url;
  try {
    const region = s.hbPlanInfo?.region || s.region;
    const catalog = hbPlacesLoadedRegion === region ? places : [];
    const code = enc(hbShareMapData(s.hbPlanInfo?.date || s.date, s.stops, catalog, new Date().toISOString()));
    if (code.length > MAX_SHARE_CODE) throw Error('Schedule exceeds link limit');
    const base = new URL(location.pathname, location.origin);
    base.hash = '/share/' + code;
    url = base.href;
  } catch {
    el.innerHTML = '<h1>가족에게 일정 공유</h1><p id="hb-share-error">여행 날짜와 시간, 장소명이 있는 일정을 먼저 준비해 주세요. 일정이 너무 길면 링크로 만들 수 없어요.</p><p><a class="hb-back-link" href="#/plan"><span aria-hidden="true">←</span> 내 일정으로 돌아가기</a></p>';
    return;
  }
  el.innerHTML = '<h1>가족에게 일정 공유</h1>'
    + '<section class="panel" aria-labelledby="hb-share-link-title"><h2 id="hb-share-link-title">읽기 전용 일정 링크</h2>'
    + '<p>이 링크에는 여행 날짜, 시간, 장소 이름, 링크 생성 시각과 공개 관광지 위치·주소가 들어 있어요. 받은 사람은 일정을 볼 수 있고 다른 사람에게 전달할 수 있어요.</p>'
    + '<p>만료나 회수 기능이 없어요. 내 일정을 수정해도 이미 보낸 링크의 일정은 그대로예요.</p>'
    + '<label><input type="checkbox" id="hb-share-confirm"> 공유 링크에 담기는 정보를 확인했어요.</label>'
    + '<div id="hb-share-controls" hidden><div class="field"><label for="hb-share-url">공유 링크</label>'
    + '<input id="hb-share-url" class="link" type="url" readonly value="' + safe(url) + '"></div>'
    + '<div class="actions"><button id="copy" type="button">링크 복사</button>'
    + '<a id="hb-share-open" href="' + safe(url) + '" target="_blank" rel="noopener noreferrer">공유 일정 미리 보기</a></div>'
    + '<p id="hb-share-copy-status" role="status"></p></div></section><p><a class="hb-back-link" href="#/plan"><span aria-hidden="true">←</span> 내 일정으로 돌아가기</a></p>';
  const input = document.getElementById('hb-share-url');
  const status = document.getElementById('hb-share-copy-status');
  document.getElementById('hb-share-confirm').onchange = event => {
    document.getElementById('hb-share-controls').hidden = !event.target.checked;
  };
  document.getElementById('copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(url);
      status.textContent = '링크를 복사했어요.';
    } catch {
      input.focus();
      input.select();
      status.textContent = '자동으로 복사하지 못했어요. 선택한 링크를 길게 누르거나 복사 단축키로 복사해 주세요.';
    }
  };
}

function shared(code) {
  try {
    const data = dec(code);
    if (data?.v !== 1 && data?.v !== 2) throw Error('Unsupported share link');
    const {date, stops, sharedAt} = data.v === 2 ? hbReadShareMap(data) : shareData(data.date, data.stops);
    const names = stops.map(stop => '<li class="hb-share-stop"><time datetime="' + stop.time + '">'
      + stop.time + '</time> <strong class="hb-break-anywhere">' + safe(stop.name) + '</strong></li>').join('');
    el.innerHTML = '<section id="hb-share-receiver" aria-labelledby="hb-share-heading">'
      + '<h1 id="hb-share-heading">가족 여행 일정</h1><p><time datetime="' + date + '">' + date + '</time> · 읽기 전용</p>'
      + (sharedAt ? '<p class="muted">링크 생성 <time datetime="' + safe(sharedAt) + '">' +
        safe(new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'}).format(new Date(sharedAt))) +
        '</time> (한국 시간)</p><div id="hb-shared-map-slot"></div>' :
        '<div class="panel"><h2>방문 일정</h2><ol>' + names + '</ol></div>')
      + '<p class="warn">출발 전 이동시간과 각 장소의 편의시설을 확인해 주세요. 일정을 보낸 뒤의 변경 사항은 여기에 반영되지 않아요.</p>'
      + '<p><a id="hb-own-trip" href="#/new">우리 부모님 여행도 만들기</a></p></section>';
    if (sharedAt) hbRenderItineraryMap(document.getElementById('hb-shared-map-slot'), stops, []);
  } catch {
    el.innerHTML = '<h1>공유 링크를 열 수 없어요</h1><p id="hb-share-error">보낸 사람에게 링크를 다시 받아 주세요.</p><p><a href="#/">홈으로 가기</a></p>';
  }
}

function render(){if(path()!=='/')dropNearbyMap();let p=path();if(p!=='/plan')hbDropPlanMap();if(p==='/')home();else if(p==='/new')newPlan();else if(p==='/places')browse();else if(p.startsWith('/place/'))detail(hbDecodePlaceId(p.slice(7)));else if(p==='/plan')plan();else if(p==='/travel')travel();else if(p==='/share/create')share();else if(p.startsWith('/share/'))shared(p.slice(7));else home()}
async function get(u){
 const response=await fetch(u);
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw Error(data?.error||'서버 오류 '+response.status);
 if(!data||typeof data!=='object')throw Error('응답 자료를 읽을 수 없어요.');
 return data;
}

let hbPlacesLoadedRegion=null;
let hbPlaceRequest=0;

function hbRefreshPlacesView(){
 if(path()==='/places'||path().startsWith('/place/'))render();
 else if(path()==='/new'){
  const message=document.getElementById('hb-place-data-state');
  if(message)message.outerHTML=hbPlaceDataMessage();
 }
}

async function load(){
 const request=++hbPlaceRequest,region=s.region;
 const stillCurrent=()=>request===hbPlaceRequest&&region===s.region;
 loading=true;
 issue='';
 hbRefreshPlacesView();
 try{
  const data=await get('/api/data?type=places&region='+encodeURIComponent(region));
  if(!stillCurrent())return;
  if(!Array.isArray(data.places))throw Error('장소 목록 자료를 읽을 수 없어요.');
  const records=new Map();
  function add(place){
   if(!place||typeof place.id!=='string'||!place.id||typeof place.name!=='string'||!place.name)return;
   const previous=records.get(place.id);
   if(!previous){records.set(place.id,place);return;}
   let combined=previous;
   if(hbAccessFacts(place).length>hbAccessFacts(previous).length){
    combined={...combined,accessFacts:place.accessFacts,accessStatus:place.accessStatus,reason:place.reason||previous.reason};
   }
   if(!combined.imageUrl&&place.imageUrl){
    combined={...combined,imageUrl:place.imageUrl,imageLicense:place.imageLicense,imageSource:place.imageSource};
   }
   records.set(place.id,combined);
  }
  const catalogFile={서울:'/catalog/seoul.json',경기:'/catalog/gyeonggi.json'}[region];
  const [catalog,featured]=await Promise.all([
   catalogFile?get(catalogFile).catch(()=>[]):[],
   region==='서울'?get('/api/featured.js?lat=37.5665&lng=126.9780').catch(()=>null):null
  ]);
  if(!stillCurrent())return;
  const catalogPlaces=Array.isArray(catalog)?catalog.filter(Boolean):[];
  const catalogById=new Map(catalogPlaces.map(place=>[place.id,place]));
  window.hbCatalogImages=Object.create(null);
  for(const place of catalogPlaces){
   if(place.imageUrl)window.hbCatalogImages[String(place.id).replace(/^tour-/,'')]={imageUrl:place.imageUrl,license:place.imageLicense,source:place.imageSource};
  }
  const featuredPlaces=Array.isArray(featured?.places)?featured.places:[];
  for(const place of featuredPlaces){
   if(!place)continue;
   const linked=catalogById.get(place.id);
   add({...place,kind:place.kind||'spot',accessFacts:[],accessStatus:'unknown',
    ...(linked?{imageUrl:linked.imageUrl,imageLicense:linked.imageLicense,imageSource:linked.imageSource}:{}),
    reason:'서울 대표 관광지예요. 접근성 및 보행 동선은 방문 전 확인이 필요해요.'});
  }
  catalogPlaces.forEach(add);
  data.places.forEach(add);
  for(const place of places){
   if(Array.isArray(s.chosen)&&s.chosen.includes(place.id)&&!records.has(place.id)&&place.hbPickedRegion===region)add(place);
  }
  places=[...records.values()];
  hbPlacesLoadedRegion=region;
 }catch(error){
  if(!stillCurrent())return;
  places=[];
  issue=error.message||'장소를 불러올 수 없어요.';
  hbPlacesLoadedRegion=null;
 }finally{
  if(stillCurrent()){
   loading=false;
   hbRefreshPlacesView();
   if(path()==='/plan')hbRenderPlanMap();
   if(path()==='/travel')hbRefreshTravelConditionMap?.();
  }
 }
 if(stillCurrent())getWeather();
}
let forecast = {key:"", state:"unknown"};
let weatherRequest = 0;
function weatherScope() {
  if (path()==='/plan' && s.stops.length && s.hbPlanInfo?.date) return {region:s.hbPlanInfo.region || s.region,date:s.hbPlanInfo.date};
  return s;
}
const currentWeatherKey = () => JSON.stringify([weatherScope().region, weatherScope().date]);
function weatherText() {
  if (forecast.key !== currentWeatherKey()) return '여행일 예보를 확인하고 있어요…';
  if (forecast.state === 'unknown') return '선택한 날짜의 예보를 확인할 수 없어요.';
  if (forecast.state === 'loading') return '여행일 예보를 확인하고 있어요…';
  if (forecast.state === 'error') return '날씨를 불러오지 못했어요. 출발 전에 다시 확인해 주세요.';
  return forecast.summary;
}
function weatherCard() {
  if (forecast.key !== currentWeatherKey()) queueMicrotask(() => {
    if (document.querySelector('[data-hb-weather]') && forecast.key !== currentWeatherKey()) getWeather();
  });
  return '<section class="panel hb-weather-card"><h2>여행일 날씨</h2><p data-hb-weather role="status">'
    + safe(weatherText()) + '</p><p class="muted">날씨 요약 출처: 기상청 예보 자료. 발표·유효 시각이 표시되지 않으면 출발 전 최신 예보를 확인해 주세요.</p></section>';
}
async function getWeather() {
  const key = currentWeatherKey();
  const id = ++weatherRequest;
  const update = value => {
    if (id !== weatherRequest) return;
    forecast = {key, ...value};
    if (key === currentWeatherKey()) {
      document.querySelectorAll('[data-hb-weather]').forEach(node => { node.textContent = weatherText(); });
    }
  };
  const {region, date} = weatherScope();
  if (!date) {
    update({state:'unknown'});
    return;
  }
  update({state:'loading'});
  try {
    const params = new URLSearchParams({type:'weather', region, date});
    const data = await get('/api/data?' + params);
    const summary = typeof data?.summary === 'string' ? data.summary.trim() : '';
    const missing = !summary || summary === '선택 날짜 단기예보 없음';
    update(missing ? {state:'unknown'} : {state:'available', summary});
  } catch {
    update({state:'error'});
  }
}

async function hbTravelRequest(url,input){
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(18000)});
  if(!response.ok)throw Error('Travel API unavailable');
  return response.json();
}
