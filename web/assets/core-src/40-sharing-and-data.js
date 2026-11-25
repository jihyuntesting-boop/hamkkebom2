// Share links contain a static, read-only snapshot in the URL fragment.
// No server token, expiry, revocation or live synchronization is provided.
const MAX_SHARED_STOPS = 60;
const MAX_SHARE_CODE = 24000;
const MAX_SHARE_URL = 25000;
const enc = value => {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const dec = code => {
  if (typeof code !== 'string' || !code || code.length > MAX_SHARE_CODE
      || !/^[A-Za-z0-9_-]+$/.test(code)) throw Error('Invalid share code');
  const bytes = Uint8Array.from(atob(code.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes));
};

function shareData(date, stops) {
  const validDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  if (!validDate || !Array.isArray(stops) || !stops.length || stops.length > MAX_SHARED_STOPS) {
    throw Error('Invalid itinerary');
  }
  // Strict public whitelist: never spread draft stops, profile fields or storage.
  const publicStops = stops.map(stop => {
    if (!stop || typeof stop.time !== 'string' || !/^([01]?\d|2[0-3]):[0-5]\d$/.test(stop.time)
        || typeof stop.name !== 'string' || !stop.name.trim() || stop.name.length > 300) throw Error('Invalid stop');
    return {time:stop.time.padStart(5,'0'), name:stop.name.trim()};
  });
  return {v:1, date, stops:publicStops};
}

function hbSharedPlaceFields(placeId, location, address, notice) {
  if (typeof placeId !== 'string' || !/^tour-\d{1,12}$/.test(placeId)) return {};
  const coordinates = hbMapCoordinates(location);
  const publicAddress = typeof address === 'string' && address.trim() && address.length <= 200
    && !/[\u0000-\u001f\u007f]/.test(address) ? address.trim() : null;
  const publicNotice = typeof notice === 'string' && notice.trim() && notice.length <= 240
    && !/[\u0000-\u001f\u007f]/.test(notice) ? notice.trim() : null;
  return {placeId, ...(coordinates ? {coordinates} : {}),
    ...(publicAddress ? {address:publicAddress} : {}), ...(publicNotice ? {notice:publicNotice} : {})};
}

function hbPublicShareNotice(place) {
  // Opt-in only: a public catalog entry must explicitly mark its notice
  // public AND verified. User-entered memo, reason and access profile never qualify.
  const note = place?.shareNotice;
  return note?.public === true && note?.verification === 'verified' ? note.text : null;
}

function hbShareMapData(date, stops, catalog, sharedAt) {
  const schedule = shareData(date, stops);
  // Loaded public place records only. Saved owner-only picked records may also
  // be present in the places array and must not supply address/coordinates.
  const publicPlaces = new Map(catalog.filter(place => place && !place.hbPickedRegion
    && typeof place.id === 'string' && /^tour-\d{1,12}$/.test(place.id))
    .map(place => [place.id, place]));
  const publicStops = schedule.stops.map((stop, index) => {
    const item = stops[index];
    if (item.isPlaceholder) return stop;
    const match = publicPlaces.get(item.placeId || item.id);
    return match ? {...stop, ...hbSharedPlaceFields(match.id, match, match.address, hbPublicShareNotice(match))} : stop;
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
    const {placeId, coordinates, address, notice} = data.stops[index];
    return {...stop, ...hbSharedPlaceFields(placeId, coordinates, address, notice)};
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
    if (url.length > MAX_SHARE_URL) throw Error('Schedule exceeds link limit');
  } catch (error) {
    const message = error?.message === 'Schedule exceeds link limit'
      ? '공유 링크가 길이 제한을 넘었어요. 정보를 잘라 보내지 않았습니다. 방문지 수나 이름을 줄여 다시 시도해 주세요.'
      : '여행 날짜와 시간, 장소명이 있는 유효한 일정을 먼저 준비해 주세요.';
    el.innerHTML = '<h1>가족에게 일정 공유</h1><p id="hb-share-error" role="alert">'
      + safe(message) + '</p><p><a class="hb-back-link" href="#/plan"><span aria-hidden="true">←</span> 내 일정으로 돌아가기</a></p>';
    return;
  }
  el.innerHTML = '<h1>가족에게 일정 공유</h1>'
    + '<section class="panel" aria-labelledby="hb-share-link-title"><h2 id="hb-share-link-title">읽기 전용 일정 링크</h2>'
    + '<p>이 링크에는 여행 날짜, 시간, 장소 이름, 링크 생성 시각과 공개 장소 목록에서 확인한 위치·주소 및 승인된 공개 주의사항만 포함돼요.</p>'
    + '<p>이 링크를 가진 사람은 누구나 볼 수 있고 다시 전달할 수 있어요. 만료나 회수 기능이 없어요. 내 일정을 수정해도 이미 보낸 링크의 일정은 그대로예요.</p>'
    + '<label><input type="checkbox" id="hb-share-confirm"> 공유 링크에 담기는 정보를 확인했어요.</label>'
    + '<div id="hb-share-controls" hidden><div class="field"><label for="hb-share-url">공유 링크</label>'
    + '<input id="hb-share-url" class="link" type="url" readonly value="' + safe(url) + '" style="max-width:100%"></div>'
    + '<div class="actions"><button id="copy" type="button">링크 복사</button>'
    + '<a id="hb-share-open" href="' + safe(url) + '" target="_blank" rel="noopener noreferrer">공유 일정 미리 보기</a></div>'
    + '<p id="hb-share-copy-status" role="status" aria-live="polite"></p></div></section>'
    + '<p><a class="hb-back-link" href="#/plan"><span aria-hidden="true">←</span> 내 일정으로 돌아가기</a></p>';
  const input = document.getElementById('hb-share-url');
  const status = document.getElementById('hb-share-copy-status');
  document.getElementById('hb-share-confirm').onchange = event => {
    document.getElementById('hb-share-controls').hidden = !event.target.checked;
  };
  document.getElementById('copy').onclick = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(url);
      status.textContent = '링크를 복사했어요.';
      return;
    } catch {
      // execCommand works on some browsers where the async Clipboard API is
      // blocked. A false result is not success: keep the link selected.
      try {
        input.focus();
        input.select();
        input.setSelectionRange?.(0, url.length);
        if (typeof document.execCommand === 'function' && document.execCommand('copy')) {
          status.textContent = '링크를 복사했어요.';
          return;
        }
      } catch {}
      status.textContent = '자동으로 복사하지 못했어요. 선택된 링크를 복사 단축키로 복사해 주세요. 휴대폰에서는 링크 입력창을 길게 눌러 복사할 수 있어요.';
    }
  };
}

function hbSharedMapLink(stop) {
  // Do not treat the recipient's local places, draft address or a supplied URL
  // as trusted; search the public address / position via a fixed HTTPS host.
  if (!stop.address && !stop.coordinates && !stop.placeId) return '';
  const query = stop.address ? [stop.name, stop.address].join(' ')
    : stop.coordinates ? stop.coordinates.lat + ',' + stop.coordinates.lng : stop.name;
  return 'https://map.naver.com/p/search/' + encodeURIComponent(query);
}

function hbShareReadOnlyStop(stop) {
  const mapUrl = hbSharedMapLink(stop);
  return '<li class="hb-share-stop" style="overflow-wrap:anywhere;word-break:break-word;margin-block:0.8em">'
    + '<time datetime="' + safe(stop.time) + '">' + safe(stop.time) + '</time> '
    + '<strong style="overflow-wrap:anywhere">' + safe(stop.name) + '</strong>'
    + (stop.address ? '<p style="overflow-wrap:anywhere">공개 장소 주소: ' + safe(stop.address) + '</p>'
      : '<p class="muted">주소 정보 없음 · 출발 전 확인 필요</p>')
    + (stop.notice ? '<p>공유된 현장 주의사항 (방문 전 재확인): ' + safe(stop.notice) + '</p>' : '')
    + (mapUrl ? '<p><a href="' + safe(mapUrl) + '" target="_blank" rel="noopener noreferrer" style="overflow-wrap:anywhere">네이버지도에서 장소 확인</a></p>' : '')
    + '</li>';
}

function shared(code) {
  try {
    const data = dec(code);
    if (data?.v !== 1 && data?.v !== 2) throw Error('Unsupported share link');
    const {date, stops, sharedAt} = data.v === 2 ? hbReadShareMap(data) : shareData(data.date, data.stops);
    const names = stops.map(hbShareReadOnlyStop).join('');
    el.innerHTML = '<section id="hb-share-receiver" aria-labelledby="hb-share-heading"'
      + ' style="max-width:100%;overflow-wrap:anywhere;line-height:1.65">'
      + '<h1 id="hb-share-heading">가족 여행 일정</h1>'
      + '<p><time datetime="' + safe(date) + '">' + safe(date) + '</time> · 읽기 전용</p>'
      + (sharedAt ? '<p class="muted">링크 생성 <time datetime="' + safe(sharedAt) + '">'
        + safe(new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'}).format(new Date(sharedAt)))
        + '</time> (한국 시간)</p>' : '')
      + '<p>이 화면에서는 일정을 편집할 수 없어요. 원본을 수정해도 이 링크는 자동으로 바뀌지 않으며 만료·회수 기능도 없어요.</p>'
      + '<button id="hb-share-large-text" type="button" aria-pressed="false">큰 글씨로 보기</button>'
      + '<section class="panel" aria-labelledby="hb-share-list-heading"><h2 id="hb-share-list-heading">방문 순서와 주소</h2>'
      + '<ol id="hb-shared-fallback-list" style="max-width:100%;font-size:1.05em;line-height:1.7;padding-inline-start:1.7em">'
      + names + '</ol></section>'
      + (sharedAt ? '<div id="hb-shared-map-slot" aria-label="공유 일정 지도"></div>' : '')
      + '<p class="warn">출발 전 도로, 이동시간, 주차장·입구·계단·편의시설을 직접 확인해 주세요. 여기 없는 현장 안내는 확인되지 않은 정보예요.</p>'
      + '<p><a id="hb-own-trip" href="#/new">새 여행 만들기 (원본과 별개)</a></p></section>';
    const ownTrip=document.getElementById('hb-own-trip');
    if(ownTrip)ownTrip.onclick=event=>{event.preventDefault();hbEnsureOwnerState('/new');hbBeginNewTravel();if(!hbIsShareReceiver(path())&&hbPlacesLoadedRegion!==s.region)load();};
    const receiver = document.getElementById('hb-share-receiver');
    const large = document.getElementById('hb-share-large-text');
    large.onclick = () => {
      const on = large.getAttribute('aria-pressed') !== 'true';
      large.setAttribute('aria-pressed', String(on));
      large.textContent = on ? '기본 글씨로 보기' : '큰 글씨로 보기';
      receiver.style.fontSize = on ? '1.35rem' : '';
      receiver.style.lineHeight = on ? '1.8' : '1.65';
    };
    if (sharedAt) {
      try {
        hbRenderItineraryMap(document.getElementById('hb-shared-map-slot'), stops, []);
      } catch {
        const slot = document.getElementById('hb-shared-map-slot');
        if (slot) slot.innerHTML = '<p role="status">지도를 표시하지 못했어요. 위의 방문 순서·주소·지도 링크를 이용해 주세요.</p>';
      }
    }
  } catch {
    el.innerHTML = '<h1>공유 링크를 열 수 없어요</h1><p id="hb-share-error" role="alert">'
      + '링크가 비어 있거나 손상되었거나 길이 제한을 넘었어요. 보낸 사람에게 링크를 다시 받아 주세요.'
      + '</p><p><a href="#/">홈으로 가기</a></p>';
  }
}

function render(){if(typeof hbRichCleanup==='function')hbRichCleanup();const p=path();const initialize=hbEnsureOwnerState(p);if(initialize)queueMicrotask(()=>{if(!hbIsShareReceiver(path()))load();});if(p!=='/')dropNearbyMap();if(p!=='/plan')hbDropPlanMap();if(p==='/')home();else if(p==='/new')newPlan();else if(p==='/places')browse();else if(p.startsWith('/place/'))detail(hbDecodePlaceId(p.slice(7)));else if(p==='/plan')plan();else if(p==='/travel')travel();else if(p==='/share/create')share();else if(p.startsWith('/share/'))shared(p.slice(7));else home()}
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
let forecast = {key:"", state:"unknown", alerts:null};
let weatherRequest = 0;
function weatherScope() {
  if (path()==='/plan' && s.stops.length && s.hbPlanInfo?.date) return {region:s.hbPlanInfo.region || s.region,date:s.hbPlanInfo.date};
  return s;
}
const currentWeatherKey = () => JSON.stringify([weatherScope().region, weatherScope().date]);
function hbWeatherTime(value) {
  return typeof value==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/.test(value)
    ? value.slice(0,16).replace('T',' ')+' KST' : '미확인';
}
function weatherText() {
  if (forecast.key !== currentWeatherKey() || forecast.state==='loading') return '여행일 예보를 확인하고 있어요…';
  const f=forecast.data, a=forecast.alerts;
  let text;
  if(forecast.state==='error') text='날씨를 불러오지 못했어요. 출발 전에 다시 확인해 주세요.';
  else if(forecast.state==='stale') text='오래된 예보예요. 최신 정보를 다시 확인해 주세요.';
  else if(forecast.state==='no_forecast') text='선택한 날짜의 예보 제공 범위를 확인해 주세요.';
  else if(forecast.state==='available' && typeof f?.summary==='string' && f.summary.trim()){
    text=f.summary+' (발표 '+hbWeatherTime(f.issuedAt)+' / 대표 '+hbWeatherTime(f.evidence?.representativeAt)+')';
    if(['비','비 또는 눈','눈','소나기'].includes(f.precipitationType)) text+=' · 야외 동선을 줄이고 실내 대안을 확인해 주세요.';
  }else text='선택한 날짜의 예보를 확인할 수 없어요.';
  if(f?.location?.scope==='regional_reference')text+=' · 지역 기준점 예보';
  if(a?.status==='active' && Array.isArray(a.active) && a.active.length){
    const hazards=a.active.map(x=>x.hazard+x.severity).join(', ');
    text+=' · 기준 지역 특보: '+hazards+' / 발효 '+hbWeatherTime(a.effectiveAt)+' · 출발 전 일정 재검토 필요';
  }else if(a?.status==='none' && a.area?.verified)text+=' · 확인한 기준 지역에 발효 특보 없음 (다른 지역·미래 안전 보장 아님)';
  else if(a?.reason==='current_warning_only')text+=' · 특보는 여행일에 다시 확인해 주세요.';
  else if(a?.status==='stale')text+=' · 특보 자료가 오래되었어요.';
  else text+=' · 특보 상태 확인 필요';
  return text;
}
// Illustration state is derived only from the same scoped, available forecast DTO.
function hbWeatherArtKind(){
 if(forecast.key!==currentWeatherKey()||forecast.state!=='available')return 'weather';
 const f=forecast.data;
 if(!f||typeof f.summary!=='string'||!f.summary.trim())return 'weather';
 if(f.precipitationType==='눈')return 'snow';
 if(['비','비 또는 눈','소나기'].includes(f.precipitationType))return 'rain';
 if(/(?:^| · )맑음(?:$| · )/.test(f.summary))return 'sunny';
 if(/구름많음|흐림/.test(f.summary))return 'cloudy';
 return 'weather';
}
function hbWeatherRecommendation(snapshot,key){
  if(!snapshot||snapshot.key!==key)return {kind:'unknown',message:'여행일 예보를 확인한 뒤 날씨에 맞는 선택지를 보여드려요.'};
  const a=snapshot.alerts;
  if(a?.status==='active'&&Array.isArray(a.active)&&a.active.length)
    return {kind:'caution',message:'기상특보가 확인됐어요. 날짜 변경이나 이동을 줄인 코스를 먼저 검토해 주세요. 실내라고 안전이 보장되는 것은 아니에요.'};
  if(snapshot.state!=='available')return {kind:'unknown',message:'확인된 여행일 예보가 없어 날씨 기반 추천을 보류해요. 일반 여행지 탐색은 계속할 수 있어요.'};
  const f=snapshot.data||{};
  const precipitation=['비','비 또는 눈','눈','소나기'].includes(f.precipitationType);
  const probability=typeof f.precipitationProbabilityPercent==='number'&&f.precipitationProbabilityPercent>=60&&f.precipitationProbabilityPercent<=100;
  const temperature=typeof f.temperatureC==='number'&&Number.isFinite(f.temperatureC)?f.temperatureC:null;
  const hourlyBurden=Array.isArray(f.hourly)&&f.hourly.some(v=>['비','비 또는 눈','눈','소나기'].includes(v.precipitationType)||
    typeof v.precipitationProbabilityPercent==='number'&&v.precipitationProbabilityPercent>=60&&v.precipitationProbabilityPercent<=100||
    typeof v.temperatureC==='number'&&(v.temperatureC>=30||v.temperatureC<=-5));
  if(precipitation||probability||temperature!==null&&(temperature>=30||temperature<=-5)||hourlyBurden){
    return {kind:'adverse',message:'여행일 예보의 일부 시간대에 강수 또는 기온 부담 신호가 있어요. 문화시설 후보, 휴식이 포함된 짧은 코스, 날짜 변경을 비교해 보세요. 시설의 실내 여부와 실제 운영은 별도 확인이 필요해요.'};
  }
  return {kind:'regular',message:'대표 예보를 참고해 일반 여행지와 문화시설 후보를 비교할 수 있어요. 하루 전체 날씨나 특보 미발효를 보장하지 않아요.'};
}
function hbWeatherOptionsMarkup(){
 const rec=hbWeatherRecommendation(forecast,currentWeatherKey());
 const browsing=path()==='/places';
 const actions=browsing&&['adverse','caution','regular'].includes(rec.kind)?
  '<div class="actions"><button type="button" class="light" id="hb-weather-culture">문화시설 후보 보기</button><button type="button" class="light" id="hb-weather-all">전체 후보 비교</button>'+
  (rec.kind==='regular'?'':'<button type="button" class="light" id="hb-weather-short">짧은 코스 제안 보기</button><button type="button" class="light" id="hb-weather-date">날짜 다시 선택</button>')+'</div><div id="hb-weather-option-result" role="status"></div>':'';
 const timeOption=browsing&&rec.kind!=='caution'&&forecast.key===currentWeatherKey()&&forecast.state==='available'&&Array.isArray(forecast.data?.hourly)&&forecast.data.hourly.length?
    '<button type="button" class="light" id="hb-weather-times">시간대별 날씨와 일정 비교</button><div id="hb-weather-time-result" role="status"></div>':'';
 return '<p>'+safe(rec.message)+'</p>'+actions+timeOption;
}
function hbBindWeatherOptions(){
 const node=document.querySelector?.('[data-hb-weather-options]');
 if(!node)return;
 const bind=(id,fn)=>{const button=document.getElementById(id);if(button)button.onclick=fn;};
 const choose=filter=>{s.hbBrowseFilter=filter;s.hbBrowseQuery='';s.hbBrowseLimit=30;save();browse();document.getElementById('hb-place-search')?.focus();};
 bind('hb-weather-culture',()=>choose('culture'));
 bind('hb-weather-all',()=>choose('all'));
 bind('hb-weather-date',()=>{const field=document.getElementById('date');field?.focus();field?.scrollIntoView?.({block:'center'});});
 bind('hb-weather-times',()=>{
  const output=document.getElementById('hb-weather-time-result');
  if(!output)return;
  const ids=hbUniquePlaceIds(s.chosen),key=currentWeatherKey(),snapshot=forecast;
  const opt={start:s.hbPlanStart,end:s.hbPlanEnd,restIntervalMinutes:s.hbRestIntervalMinutes,tripType:s.hbDuration||'day'};
  if(!ids.length){output.textContent='먼저 여행지를 담아 주세요. 선택한 장소로 시간대별 초안을 비교할 수 있어요.';return;}
  const candidates=hbWeatherTimeCandidates(ids,places,opt,snapshot,key);
  if(!candidates.length){output.textContent='선택 조건의 전체 시간대를 확인할 수 있는 예보가 부족해요. 기존 시간표나 선택은 변경하지 않았어요.';return;}
  output.innerHTML='<p>지역 기준점 예보를 비교한 임시 시간표예요. 실제 출발지·영업시간·장소별 날씨 및 도로 상황은 확인 전이에요.</p>'+
   candidates.map((c,i)=>'<section class="panel"><strong>'+safe(c.start)+' ~ '+safe(c.end)+'</strong><p>강수 신호 '+safe(c.wetHours)+'시간대 · 최고 강수확률 '+safe(c.maxPop)+'% · 기온 부담 '+safe(c.temperatureBurdenHours)+'시간대</p><ol>'+c.draft.stops.map(stop=>'<li>'+safe(stop.time)+' · '+safe(stop.name)+'</li>').join('')+'</ol><button type="button" class="light" id="hb-weather-time-'+i+'">이 시작 시간 선택</button></section>').join('');
  candidates.forEach((c,i)=>bind('hb-weather-time-'+i,()=>{
   if(key!==currentWeatherKey()||snapshot!==forecast||JSON.stringify(ids)!==JSON.stringify(hbUniquePlaceIds(s.chosen))||
     opt.start!==s.hbPlanStart||opt.end!==s.hbPlanEnd||opt.restIntervalMinutes!==s.hbRestIntervalMinutes||opt.tripType!==(s.hbDuration||'day')){
    output.textContent='여행 조건이나 날씨 정보가 변경됐어요. 다시 비교해 주세요.';return;
   }
   const prior=s.hbPlanStart;s.hbPlanStart=c.start;
   try{save()}catch{s.hbPlanStart=prior;output.textContent='저장하지 못했어요. 기존 선택을 유지해요.';return;}
   browse();
  }));
 });
 bind('hb-weather-short',()=>{
  const output=document.getElementById('hb-weather-option-result');
  if(!output)return;
  const ids=hbUniquePlaceIds(s.chosen);
  const must=new Set(hbUniquePlaceIds(s.hbMustVisitIds));
  const selected=ids.map(id=>places.find(p=>p.id===id));
  const sights=selected.filter(p=>p&&p.kind!=='food');
  if(selected.some(p=>!p)||sights.length<2){
   output.textContent='문화시설이나 관광지 한 곳과 식사·휴식을 중심으로 담아보세요. 두 곳 이상 담으면 줄인 코스를 비교할 수 있어요.';return;
  }
  if(sights.filter(p=>must.has(p.id)).length>1){output.textContent='필수 방문지가 여러 곳 있어 자동 축소하지 않아요. 필수 일정은 그대로 유지해 주세요.';return;}
  const keep=sights.find(p=>must.has(p.id))||sights.find(p=>p.kind==='culture')||sights[0];
  const candidate=ids.filter(id=>id===keep.id||must.has(id)||places.find(p=>p.id===id)?.kind==='food');
  const draft=hbCreateSchedule(candidate,places,{start:s.hbPlanStart,end:s.hbPlanEnd,restIntervalMinutes:s.hbRestIntervalMinutes});
  if(draft.errors.length){output.textContent=draft.errors.join(' ');return;}
  const list=draft.stops.map(stop=>'<li>'+safe(stop.time)+' · '+safe(stop.name)+'</li>').join('');
  output.innerHTML='<p>선택한 장소 중 '+safe(keep.name)+' 중심의 짧은 초안이에요. 실제 운영·이동시간은 미확인입니다.</p><ol>'+list+'</ol><button type="button" class="light" id="hb-weather-apply-short">이 장소 선택으로 변경</button>';
  document.getElementById('hb-weather-apply-short').onclick=()=>{
   if(JSON.stringify(hbUniquePlaceIds(s.chosen))!==JSON.stringify(ids)||hbUniquePlaceIds(s.hbMustVisitIds).some(id=>!candidate.includes(id))){output.textContent='선택 조건이 변경됐어요. 다시 비교해 주세요.';return;}
   const previous=s.chosen;s.chosen=candidate;
   try{save()}catch{s.chosen=previous;output.textContent='저장하지 못했어요. 원래 선택을 유지해요.';return;}
   browse();
  };
 });
}
function weatherCard() {
  if (forecast.key !== currentWeatherKey()) queueMicrotask(() => {
    if (document.querySelector('[data-hb-weather]') && forecast.key !== currentWeatherKey()) getWeather();
  });
  queueMicrotask(()=>hbBindWeatherOptions());
  return '<section class="panel hb-weather-card"><h2>여행일 날씨 · 자동 조회</h2><p data-hb-weather role="status" data-hb-weather-art="'+hbWeatherArtKind()+'">'
    + safe(weatherText()) + '</p><p class="muted">출처: 기상청 예보·특보. 지역 기준점의 대표 예보이며 실제 목적지·방문 시각과 다를 수 있어요.</p><div data-hb-weather-options>'+hbWeatherOptionsMarkup()+'</div></section>';
}
async function getWeather() {
  const key=currentWeatherKey(), id=++weatherRequest;
  const update=value=>{
    if(id!==weatherRequest)return;
    forecast={...forecast,key,...value};
    if(key===currentWeatherKey()){
     document.querySelectorAll('[data-hb-weather]').forEach(node=>{node.textContent=weatherText();node.setAttribute?.('data-hb-weather-art',hbWeatherArtKind());});
     const options=document.querySelector?.('[data-hb-weather-options]');
     if(options){options.innerHTML=hbWeatherOptionsMarkup();hbBindWeatherOptions();}
    }
  };
  const {region,date}=weatherScope();
  if(!date||typeof hbTravelDateError==='function'&&hbTravelDateError(date)){update({state:'unknown',data:null,alerts:null});return;}
  update({state:'loading',data:null,alerts:null});
  const f=new URLSearchParams({type:'weather',region,date});
  const a=new URLSearchParams({type:'alerts',region,date});
  await Promise.allSettled([
    get('/api/data?'+f).then(data=>update({state:['available','stale','no_forecast'].includes(data.status)?data.status:'unknown',data})).catch(()=>update({state:'error',data:null})),
    get('/api/weather?'+a).then(alerts=>update({alerts})).catch(()=>update({alerts:{status:'error'}}))
  ]);
}

async function hbTravelRequest(url,input){
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(18000)});
  if(!response.ok)throw Error('Travel API unavailable');
  return response.json();
}
