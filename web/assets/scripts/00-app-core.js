
(()=>{const el=document.getElementById('app'),KEY='hamkkebom-cloud';function hbRestoreLocalState(defaults,read){
 let raw;
 try{raw=read()}catch{return {state:{...defaults},warning:'이 기기의 저장 데이터에 접근할 수 없어요. 저장 여부를 확인해 주세요.'}}
 if(raw===null||raw===undefined||raw==='')return {state:{...defaults},warning:''};
 let stored;
 try{stored=JSON.parse(raw)}catch{return {state:{...defaults},warning:'기존 여행 데이터 형식을 읽지 못했어요. 새로 저장하기 전에 확인해 주세요.'}}
 if(!stored||typeof stored!=='object'||Array.isArray(stored))return {state:{...defaults},warning:'기존 여행 데이터 형식을 읽지 못했어요. 새로 저장하기 전에 확인해 주세요.'};
 const state={...defaults,...stored};
 let repaired=false;
 // Preserve all record objects, including legacy and protected itinerary stops.
 // Only malformed non-record elements are discarded from the in-memory view.
 for(const key of ['chosen','stops']){
  const old=state[key];
  const valid=key==='chosen'?v=>typeof v==='string'&&v.trim().length>0:v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const clean=Array.isArray(old)?old.filter(valid):[];
  if(!Array.isArray(old)||clean.length!==old.length)repaired=true;
  state[key]=clean;
 }
 if(!['서울','경기'].includes(state.region)){state.region=defaults.region;repaired=true;}
 return {state,warning:repaired?'기존 여행 데이터 일부의 형식이 올바르지 않아 읽을 수 있는 항목만 표시해요. 일정을 확인한 후 저장해 주세요.':''};
}
const hbRestoredState= {state:hbOwnerDefaults(),warning:''};
let s=hbRestoredState.state,hbOwnerStateLoaded=false;
let hbOwnerWarning=null;
function hbOwnerDefaults(){return {region:'서울',date:hbTodaySeoul(),hbDateExplicit:false,hbDraftActive:false,hbStep:1,hbPlanStart:'',hbPlanEnd:'',walk:'15',stairs:'avoid',chosen:[],stops:[]};}
function hbIsShareReceiver(p){return p.startsWith('/share/')&&p!=='/share/create';}
function hbEnsureOwnerState(p){
 const receiver=hbIsShareReceiver(p);
 if(hbOwnerWarning)hbOwnerWarning.hidden=receiver;
 if(receiver||hbOwnerStateLoaded)return false;
 const restored=hbRestoreLocalState(hbOwnerDefaults(),()=>localStorage.getItem(KEY));
 s=restored.state;hbOwnerStateLoaded=true;
 if(restored.warning&&el?.parentNode){const notice=document.createElement('p');notice.className='warn';notice.setAttribute('role','status');notice.textContent=restored.warning;el.parentNode.insertBefore(notice,el);hbOwnerWarning=notice;}
 return true;
}
let places=[],loading=false,issue='',weather='';const save=()=>localStorage.setItem(KEY,JSON.stringify(s)),path=()=>location.hash.slice(1)||'/',go=x=>{location.hash='#'+x;render()},safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),button=(id,name,alt=false)=>'<button '+(alt?'class="light" ':'')+'id="'+id+'">'+name+'</button>',panel=(h,b)=>'<section class="panel"><h2>'+h+'</h2>'+b+'</section>';
function hbPlaceDataMessage(){
 const status=loading?'장소를 불러오는 중이에요.':issue?'조회 실패: '+safe(issue):
  hbPlacesLoadedRegion===s.region?(places.length?'장소 '+places.length+'곳을 불러왔어요.':'조회된 장소가 없어요.'):'아직 장소를 조회하지 않았어요.';
 return '<div id="hb-place-data-state" role="'+(issue?'alert':'status')+'" class="message '+(issue?'error':'')+'">'+status+'</div>';
}

function prefs(){
 return '<div class="row"><div class="field"><label for="region">여행 지역</label><select id="region"><option>서울</option><option>경기</option></select></div>'+
  '<div class="field"><label for="date">여행 날짜</label><input type="date" id="date" min="'+hbTodaySeoul()+'" required aria-describedby="hb-date-help" value="'+safe(s.date)+'"><small id="hb-date-help">한국 시간 기준 · 오늘부터 선택할 수 있어요.</small></div>'+
  button('refresh',issue?'다시 조회':'장소 조회')+'</div>'+hbPlaceDataMessage();
}

function hbKeepItineraryContext(){
 if(!Array.isArray(s.stops)||!s.stops.length)return;
 s.hbPlanInfo={...s.hbPlanInfo,date:s.hbPlanInfo?.date||s.date,region:s.hbPlanInfo?.region||s.region};
}

function bindPrefs(){
 const region=document.getElementById('region');
 if(!region)return;
 region.value=s.region;
 region.onchange=()=>{
  if(s.region===region.value)return;
  hbKeepItineraryContext();
  s.region=region.value;
  s.chosen=[];
  s.hbBrowseQuery='';
  s.hbBrowseLimit=30;
  save();
  load();
 };
 document.getElementById('date').onchange=event=>{
  hbKeepItineraryContext();
  s.date=event.target.value;
  s.hbDateExplicit=true;
  delete s.hbDateRefreshedFrom;
  save();
  if(!hbTravelDateError(s.date))getWeather();
 };
 document.getElementById('refresh').onclick=load;
}
function home(){el.innerHTML='<section class="hb-landing-hero" aria-labelledby="hb-landing-title"><span class="hb-landing-eyebrow">'+hbIcon('flower')+'부모님과 함께하는 편안한 여행, 함께봄</span><h1 id="hb-landing-title">좋은 곳보다,<br>함께 가기 편한 곳.</h1><p class="hb-landing-intro">계단, 화장실, 쉬어갈 곳까지. 부모님과 함께 갈 때 필요한 정보를 살펴보고 우리 가족에게 맞는 여행 일정을 만들어보세요.</p><div class="hb-landing-benefits" aria-label="함께봄의 주요 기능"><div class="hb-benefit">'+hbIcon('walk')+'<strong>걷기 조건 선택</strong></div><div class="hb-benefit">'+hbIcon('stairs')+'<strong>계단·경사 정보</strong></div><div class="hb-benefit">'+hbIcon('restroom')+'<strong>화장실·휴식시설</strong></div><div class="hb-benefit">'+hbIcon('weather')+'<strong>날씨·일정 조정</strong></div></div><div class="hb-landing-actions"><button id="mom-start" class="hb-landing-cta" type="button">'+hbIcon('heart')+'부모님 맞춤 여행 만들기 <span aria-hidden="true">→</span></button>'+(s.hbDraftActive===true?'<button id="hb-resume-travel" class="hb-landing-link" type="button">작성 중인 여행 이어서 작성</button>':'')+'<button id="hb-map-go" class="hb-landing-link" type="button">지도에서 여행지 둘러보기</button></div><p class="hb-landing-note">※ 이동 편의 정보는 장소별로 확인 범위가 달라요. 미확인 정보는 구분해서 보여드려요.</p></section><section class="hb-landing-how" aria-label="함께봄 사용 방법"><h2>여행 준비부터 여행 중까지</h2><div class="hb-how-grid"><div>'+hbIcon('pin')+'<strong>편한 장소 살펴보기</strong><p>알려진 편의시설 정보와 확인이 필요한 부분을 함께 살펴봐요.</p></div><div>'+hbIcon('calendar')+'<strong>우리 가족 일정 만들기</strong><p>방문 순서와 식사, 쉬는 시간을 고려해 일정을 준비해요.</p></div><div>'+hbIcon('heart')+'<strong>피곤하면 일정 가볍게</strong><p>그날 컨디션에 맞춰 남은 일정을 줄이는 변경안을 확인해요.</p></div></div></section><section class="panel hb-nearby-panel"><div class="row hb-nearby-head"><div><strong>'+hbIcon('pin')+'내 주변 관광지 지도</strong><div class="muted" id="nearby-status">위치를 확인하고 있어요…</div></div><div class="actions hb-actions-flush"><button class="light" id="locate-again">내 위치 다시 찾기</button><button class="light" id="locate-seoul">서울 중심 보기</button><button class="light" id="hb-search-map-center" type="button" disabled>이 지도 위치에서 다시 검색</button></div></div><div id="nearby-map"></div><div class="muted hb-map-credit">지도: 네이버지도 · 관광지: 한국관광공사 TourAPI · GPS는 허용 시에만 조회하며 저장하지 않아요.</div></section><section class="panel"><h2 class="hb-section-title">내 주변 여행지 · 식당</h2><div class="actions hb-actions-tight"><button id="near-spot" class="light" aria-pressed="true">관광지·문화시설</button><button id="near-food" class="light" aria-pressed="false">식당</button><button id="near-all" class="light" aria-pressed="false">전체</button></div><div id="featured-summary" class="muted hb-featured-summary"></div><div id="featured-quicklinks" class="hb-featured-quicklinks" aria-label="대표 관광지 바로가기"></div><div id="nearby-list"><p class="muted">실제 장소를 찾는 중이에요.</p></div></section><div class="actions">'+button('start','부모님 맞춤 여행 만들기 →')+'</div>';document.getElementById('start').onclick=hbBeginNewTravel;document.getElementById('mom-start').onclick=hbBeginNewTravel;const resume=document.getElementById('hb-resume-travel');if(resume)resume.onclick=hbResumeTravel;document.getElementById('hb-map-go').onclick=()=>{let map=document.getElementById('nearby-map'), target=map||document.getElementById('nearby-list');if(!target)return;target.setAttribute('tabindex','-1');target.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});target.focus({preventScroll:true})};document.getElementById('locate-again').onclick=()=>requestLocation(true);document.getElementById('locate-seoul').onclick=()=>{nearbyMode='서울 시청 중심 (기본 위치)';fetchNearby(37.5665,126.9780,false)};document.getElementById('hb-search-map-center').onclick=hbSearchMapCenter;['all','spot','food'].forEach(f=>document.getElementById('near-'+f).onclick=()=>hbSelectNearbyCategory(f));mountNearbyMap();if(typeof window!=='undefined'&&window.HBRichPlaceDetail)hbRichDiscoveryAttach();if(!geoStarted){geoStarted=true;requestLocation(false)}else{setNearbyStatus();drawNearbyList()}}
// One icon set for the whole UI (replaces emoji): 24px grid, 2px stroke,
// currentColor. Decorative only, so always hidden from assistive tech.
const HB_ICON_PATHS={
 pin:'<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
 heart:'<path d="M12 20s-7.5-4.6-9.2-9.4A4.9 4.9 0 0 1 12 7.4a4.9 4.9 0 0 1 9.2 3.2C19.5 15.4 12 20 12 20z"/>',
 walk:'<circle cx="13" cy="4.5" r="2"/><path d="M10 21l2.2-6.5L15 17v4M8 12.5l2.4-4 3.6.8 2 3.7M12.2 14.5l-1.8-6"/>',
 stairs:'<path d="M3 20h5v-4h4v-4h4V8h5"/>',
 restroom:'<circle cx="7" cy="5" r="2"/><path d="M5 9h4v6H8v6H6v-6H5z"/><circle cx="17" cy="5" r="2"/><path d="M17 9l-3 7h2v5h2v-5h2z"/><path d="M12 4v17"/>',
 weather:'<circle cx="8.5" cy="8.5" r="3"/><path d="M8.5 2.5v1M3 8.5h1M4.6 4.6l.7.7"/><path d="M8 20h9a4 4 0 0 0 .3-8 5 5 0 0 0-9.4 1.6A3.2 3.2 0 0 0 8 20z"/>',
 calendar:'<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
 flower:'<circle cx="12" cy="12" r="2.4"/><path d="M12 9.6C10 6.6 11 3.6 12 3c1 .6 2 3.6 0 6.6zM14.4 12c3-2 6-1 6.6 0-.6 1-3.6 2-6.6 0zM12 14.4c2 3 1 6 0 6.6-1-.6-2-3.6 0-6.6zM9.6 12c-3 2-6 1-6.6 0 .6-1 3.6-2 6.6 0z"/>',
 food:'<path d="M3 12h18a9 9 0 0 1-18 0zM9 8.5c0-1.8 1.6-2 1.6-4M14 8.5c0-1.8 1.6-2 1.6-4"/>',
 leaf:'<path d="M5 19C5 10.5 10 5.2 20 4c-.8 10-6 15-15 15zM5 19l8-8"/>',
 star:'<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>'
};
function hbIcon(name){
 const path=HB_ICON_PATHS[name];
 return path?'<svg class="hb-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+path+'</svg>':'';
}
function hbAccessFacts(place){
  return Array.isArray(place?.accessFacts)?place.accessFacts.filter(f=>f&&typeof f==='object'):[];
}

function hbScopedMobility(value){
  return value?.status==='verified'&&typeof value.scope==='string'&&value.scope.trim()!==''&&typeof value.verifiedAt==='string'&&/^\d{4}-\d{2}-\d{2}/.test(value.verifiedAt)&&Number.isFinite(Date.parse(value.verifiedAt))&&Date.parse(value.verifiedAt)<=Date.now()+86400000;
}

const hbMobilityAidLabels={none:'사용 안 함',cane:'지팡이',walker:'보행 보조기',wheelchair:'휠체어',other:'기타 보조기구'};

function hbEvaluatePlace(p,profile){
  const facts=hbAccessFacts(p);
  const needs=Array.isArray(profile.needs)?profile.needs:[];
  const fields=facts.map(f=>String(f.label||'')+' '+String(f.description||''));
  const has=(r)=>fields.some(x=>r.test(x));
  const mobility=p.mobilityAssessment;
  const aid=profile.mobilityAid;
  const hasAid=Boolean(aid&&aid!=='none');
  const stepFreeRequired=aid==='wheelchair'||aid==='walker';
  const stale=p.accessStatus==='stale'||facts.some(f=>f.status==='stale');
  const documented=!stale&&hbScopedMobility(mobility);
  const aidVerified=!hasAid||aid!=='other'&&documented&&
    Array.isArray(mobility.verifiedMobilityAids)&&mobility.verifiedMobilityAids.includes(aid)&&
    (!stepFreeRequired||mobility.stairsRequired===false);
  const conflict=p.accessStatus==='conflicting'||facts.some(f=>f.status==='conflicting');
  const excludes=!conflict&&documented&&(profile.stairsMode==='impossible'||aid==='wheelchair')&&mobility.stairsRequired===true;
  const checks=[['toilet',/화장실/,'화장실'],['rest',/휴식|휴게|쉼터|벤치/,'휴식 공간'],['elevator',/엘리베이터|승강기/,'엘리베이터'],['dropoff',/승하차|하차\s*지점|차량\s*진입/,'하차 지점'],['wheelchair',/휠체어|무단차|단차\s*없/,'휠체어 관련 정보']];
  const found=checks.filter(([key,re])=>needs.includes(key)&&has(re)).map(x=>x[2]);
  const missing=checks.filter(([key,re])=>needs.includes(key)&&!has(re)).map(x=>x[2]+' 정보 미확인');
  const verified=!!(documented&&Number.isFinite(mobility.walkMinutes)&&mobility.walkMinutes>=0&&Number(profile.walk)>0&&mobility.walkMinutes<=Number(profile.walk)&&(['impossible','avoid'].includes(profile.stairsMode)?mobility.stairsRequired===false:profile.stairsMode==='possible'));
  const facilityVerified=checks.filter(([key])=>needs.includes(key)).every(([key])=>mobility&&Array.isArray(mobility.verifiedFacilities)&&mobility.verifiedFacilities.includes(key));
  // Facility labels alone cannot verify a complete route's slope or environment.
  const slopeNeedsReview=profile.slopePreference==='avoid_steep';
  const environmentNeedsReview=['indoor','outdoor'].includes(profile.indoorPreference);
  const status=excludes?'excluded':!conflict&&verified&&aidVerified&&facilityVerified&&!slopeNeedsReview&&!environmentNeedsReview?'confirmed':'review';
  const gaps=[];
  if(conflict)gaps.push('출처의 설명이 달라 방문 전 확인 필요');
  if(excludes)gaps.push('검증된 동선에 필수 계단 있음');
  if(hasAid&&!aidVerified&&!excludes)gaps.push((hbMobilityAidLabels[aid]||'보조기구')+'로 이동 가능한 범위 확인 필요');
  if(stale)gaps.push('오래된 정보라 최신 상태 확인 필요');
  if(slopeNeedsReview)gaps.push('가파른 경사 여부 확인 필요');
  if(environmentNeedsReview)gaps.push(profile.indoorPreference==='indoor'?'실내 동선·시설 확인 필요':'야외 동선·시설 확인 필요');
  if(!profile.stairsMode)gaps.push('계단 이용 가능 조건 미선택');
  else if(profile.stairsMode==='impossible'&&!verified)gaps.push('계단 없는 전체 이동 동선 확인 필요');
  else if(profile.stairsMode==='avoid'&&!verified)gaps.push('계단·경사 실제 이동 동선 확인 필요');
  if(!verified)gaps.push('연속 보행시간·실제 이동 거리 확인 필요');
  gaps.push(...missing);
  if(!facts.length)gaps.push('장소 편의시설 상세 공공자료 없음');
  const score=Math.min(facts.length,5)*2+found.length*4+(p.accessStatus==='info'?1:0);
  return {status,score,found,gaps,sourceReported:facts.length>0,conflict,scope:status==='confirmed'||status==='excluded'?mobility.scope:null};
}

/** Local-only typed form contract. This is not a server eligibility assessment. */
function hbTodaySeoul(){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const value=key=>parts.find(p=>p.type===key)?.value;
  return value('year')+'-'+value('month')+'-'+value('day');
}
function hbTravelDateError(date,today=hbTodaySeoul()){
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return '올바른 여행 날짜를 선택해 주세요.';
  const parsed=new Date(date+'T00:00:00Z');
  if(!Number.isFinite(+parsed)||parsed.toISOString().slice(0,10)!==date)return '올바른 여행 날짜를 선택해 주세요.';
  return date<today?'과거 날짜예요. 오늘 또는 이후 날짜를 선택해 주세요.':'';
}
function hbRefreshAutomaticDate(state,today=hbTodaySeoul()){
  // An explicit date is never silently rewritten, including a cleared field.
  if(state.hbDateExplicit===true||!hbTravelDateError(state.date,today))return state;
  const next={...state,date:today,hbDateExplicit:false,hbStep:1,hbDateRefreshedFrom:state.date||null};
  if(Array.isArray(state.stops)&&state.stops.length)
    next.hbPlanInfo={...state.hbPlanInfo,date:state.hbPlanInfo?.date||state.date,region:state.hbPlanInfo?.region||state.region};
  return next;
}
function hbBeginNewTravel(){
  // Single-plan local storage: keep all existing saved stops/context until the
  // separate, already protected schedule replacement flow is confirmed.
  if(Array.isArray(s.chosen)&&s.chosen.length&&!confirm('새 여행 조건을 시작할까요? 담은 장소 선택은 초기화되지만 저장한 일정은 유지돼요.'))return;
  const before=s;
  const next={...s,date:hbTodaySeoul(),hbDateExplicit:false,hbDraftActive:true,hbStep:1,hbPlanStart:'',hbPlanEnd:'',chosen:[],hbMustVisitIds:[]};
  delete next.hbDateRefreshedFrom;
  if(Array.isArray(s.stops)&&s.stops.length)
    next.hbPlanInfo={...s.hbPlanInfo,date:s.hbPlanInfo?.date||s.date,region:s.hbPlanInfo?.region||s.region};
  s=next;
  try{save()}catch{s=before;alert('새 여행 조건을 저장하지 못했어요. 기존 일정은 유지돼요.');return;}
  go('/new');return true;
}
function hbResumeTravel(){
  if(s.hbDraftActive!==true)return false;
  go('/new');return true;
}
function hbTimeInputErrors(start,end){
  const minute=value=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value)?Number(value.slice(0,2))*60+Number(value.slice(3)):null;
  const a=minute(start),b=minute(end);
  if(start!=null&&start!==''&&a===null||end!=null&&end!==''&&b===null)return ['올바른 시간을 선택해 주세요.'];
  if(a!==null&&b!==null&&a>=b)return ['종료 시간은 시작보다 늦어야 해요. 다음 날까지 이어지는 일정은 아직 지원하지 않아요.'];
  return [];
}
function hbTravelInput(profile,today=hbTodaySeoul()){
  const errors=[];
  const allowed=(value,choices)=>choices.includes(value)?value:null;
  const text=value=>typeof value==='string'?value:'';
  const region=allowed(profile.region,['서울','경기']);
  if(!region)errors.push('여행 지역을 선택해 주세요.');
  const date=text(profile.date);
  const dateError=hbTravelDateError(date,today);
  if(dateError)errors.push(dateError);
  errors.push(...hbTimeInputErrors(profile.hbPlanStart??'',profile.hbPlanEnd??''));
  const duration=allowed(profile.hbDuration||'day',['day','overnight']);
  const transport=allowed(profile.hbTransport||'car',['car','transit','mixed']);
  const party=Number(profile.hbParty||2);
  if(!duration)errors.push('여행 형태를 다시 선택해 주세요.');
  if(!transport)errors.push('이동 수단을 다시 선택해 주세요.');
  if(!Number.isInteger(party)||party<2||party>12)errors.push('동행 인원은 2명에서 12명까지 선택해 주세요.');
  const walk=profile.hbWalkConfirmed?allowed(String(profile.walk),['5','10','15','20','30']):null;
  const stairs=allowed(profile.hbStairsChoice,['impossible','avoid','possible']);
  if(!walk)errors.push('한 번에 걸을 수 있는 시간을 직접 선택해 주세요.');
  if(!stairs)errors.push('계단 이용 조건을 직접 선택해 주세요.');
  const foodCodes=['less_spicy','easy_to_chew','vegetarian'];
  const foods=Array.isArray(profile.hbFoodPreferences)?[...new Set(profile.hbFoodPreferences.filter(x=>foodCodes.includes(x)))]:[];
  return {errors,input:{
    region,date,tripType:duration,transport:transport==='transit'?'public_transit':transport,
    partySize:Number.isInteger(party)&&party>=2&&party<=12?party:null,
    walkingMinutes:walk?Number(walk):null,stairs,
    slopePreference:allowed(profile.hbSlopePreference,['avoid_steep','flexible']),
    mobilityAid:allowed(profile.hbMobilityAid,['none','cane','walker','wheelchair','other']),
    restIntervalMinutes:[30,45,60].includes(Number(profile.hbRestIntervalMinutes))?Number(profile.hbRestIntervalMinutes):null,
    indoorPreference:allowed(profile.hbIndoorPreference,['any','indoor','outdoor']),
    placePreference:allowed(profile.hbInterest,['all','spot','food'])||'all',
    foodPreferences:foods
  }};
}
// Only an explicitly active draft can resume a later stage. Legacy hbStep
// alone is not proof that a new trip's required inputs were reviewed.
function hbWizardStep(state,today=hbTodaySeoul()){
  if(state.hbDraftActive!==true||![2,3].includes(Number(state.hbStep)))return 1;
  const result=hbTravelInput(state,today);
  const basicIssues=result.errors.filter(x=>!x.includes('걸을 수 있는 시간')&&!x.includes('계단 이용 조건'));
  if(basicIssues.length)return 1;
  if(Number(state.hbStep)===3&&result.errors.length)return 2;
  return Number(state.hbStep);
}
function newPlan(){
  s=hbRefreshAutomaticDate(s);
  const dateIssue=hbTravelDateError(s.date);
  const timeIssues=hbTimeInputErrors(s.hbPlanStart??'',s.hbPlanEnd??'');
  const step=hbWizardStep(s);
  s.hbStep=step;s.hbDraftActive=true;
  s.momNeeds=Array.isArray(s.momNeeds)?s.momNeeds:[];
  s.hbFoodPreferences=Array.isArray(s.hbFoodPreferences)?[...new Set(s.hbFoodPreferences.filter(x=>['less_spicy','easy_to_chew','vegetarian'].includes(x)))]:[];
  const walkChoices=[['5','5분 이하'],['10','10분 정도'],['15','15분 정도'],['20','20분 정도'],['30','30분 이상']];
  const stairChoices=[['possible','계단 이용 가능'],['avoid','가능하면 계단 피하기'],['impossible','계단 이용 불가']];
  const card=(items,key,value)=>items.map(([id,name])=>'<button type="button" class="hb-choice '+(value===id?'chosen':'')+'" data-hb-'+key+'="'+id+'" aria-pressed="'+String(value===id)+'">'+safe(name)+'</button>').join('');
  const refreshChoice=selector=>{newPlan();document.querySelector(selector)?.focus()};
  const changeStep=next=>{s.hbStep=next;s.hbDraftActive=true;save();newPlan();el.querySelector('h2')?.focus()};
  const prev=step>1?'<button class="light" type="button" id="hb-prev">← 이전 단계</button>':'';
  const intro='<h1>부모님과 여행 만들기</h1><p class="muted">여행 지역과 이동 조건부터 확인해요. 방문 가능한 동선이 검증됐다는 뜻은 아니에요.</p><ol class="hb-progress" aria-label="여행 만들기 3단계 중 '+step+'단계">'+['여행 정보','이동 조건','선호사항'].map((name,i)=>'<li'+(i+1===step?' aria-current="step"':i+1<step?' class="hb-step-done"':'')+'><span class="hb-step-num" aria-hidden="true">'+(i+1)+'</span>'+name+'</li>').join('')+'</ol>';
  if(step===1){
    el.innerHTML=intro+'<section class="panel"><h2 tabindex="-1">1. 여행 정보</h2>'+prefs()+(s.hbDateRefreshedFrom?'<p role="status">이전에 저장된 날짜를 오늘로 갱신했어요. 기존 일정의 날짜는 그대로 유지돼요.</p>':'')+'<div class="actions"><button class="light" type="button" id="hb-date-today">오늘</button><button class="light" type="button" id="hb-date-tomorrow">내일</button></div><div class="row"><div class="field"><label for="hb-trip-start">첫 방문지 시작 희망 시간 (선택)</label><input type="time" id="hb-trip-start" value="'+safe(s.hbPlanStart??'')+'"></div><div class="field"><label for="hb-trip-end">일정 종료 희망 시간 (선택)</label><input type="time" id="hb-trip-end" value="'+safe(s.hbPlanEnd??'')+'"></div></div><p class="muted">시간을 비워 두면 선택한 장소에 맞춰 시간표 초안을 제안해요. 직접 입력하면 새벽·저녁 시간도 가능해요. 첫 방문지 기준이며 집에서 출발·귀가하는 이동시간은 아직 계산하지 않아요.</p><div class="row"><div class="field"><label for="hb-duration">여행 형태</label><select id="hb-duration"><option value="day">당일 여행</option><option value="overnight">숙박 여행</option></select></div><div class="field"><label for="hb-transport">주요 이동 수단</label><select id="hb-transport"><option value="car">자동차</option><option value="transit">대중교통</option><option value="mixed">상황에 따라 선택</option></select></div><div class="field"><label for="hb-party">동행 인원</label><select id="hb-party"><option value="2">2명</option><option value="3">3명</option><option value="4">4명</option><option value="5">5명</option><option value="6">6명</option><option value="7">7명</option><option value="8">8명</option><option value="9">9명</option><option value="10">10명</option><option value="11">11명</option><option value="12">12명</option></select></div></div><div class="actions"><button type="button" id="hb-next">다음: 이동 조건 →</button></div><p class="muted" id="hb-step-error" role="alert"></p></section>'+(typeof weatherCard==='function'?weatherCard():'');
    bindPrefs();
    const dateField=document.getElementById('date');
    const chooseDate=value=>{dateField.value=value;dateField.onchange({target:dateField});document.getElementById('hb-step-error').textContent='';};
    document.getElementById('hb-date-today').onclick=()=>chooseDate(hbTodaySeoul());
    document.getElementById('hb-date-tomorrow').onclick=()=>chooseDate(new Date(Date.parse(hbTodaySeoul()+'T00:00:00Z')+86400000).toISOString().slice(0,10));
    for(const [id,key] of [['hb-trip-start','hbPlanStart'],['hb-trip-end','hbPlanEnd']]){
      const field=document.getElementById(id);
      field.onchange=()=>{s[key]=field.value;save();document.getElementById('hb-step-error').textContent=hbTimeInputErrors(s.hbPlanStart??'',s.hbPlanEnd??'').join(' ');};
    }
    document.getElementById('hb-step-error').textContent=[dateIssue,...timeIssues].filter(Boolean).join(' ');
    const ids=[['hb-duration','hbDuration','day'],['hb-transport','hbTransport','car'],['hb-party','hbParty','2']];
    ids.forEach(([id,key,defaultValue])=>{const x=document.getElementById(id);x.value=s[key]||defaultValue;x.onchange=()=>{s[key]=x.value;save()}});
    document.getElementById('hb-next').onclick=()=>{s=hbRefreshAutomaticDate(s);dateField.value=s.date;dateField.min=hbTodaySeoul();const result=hbTravelInput(s);const issues=result.errors.filter(x=>!x.includes('걸을 수 있는 시간')&&!x.includes('계단 이용 조건'));if(issues.length){document.getElementById('hb-step-error').textContent=issues.join(' ');return;}changeStep(2)};
    return;
  }
  if(step===2){
    el.innerHTML=intro+'<section class="panel"><h2 tabindex="-1">2. 이동 조건</h2><p class="muted">필수 항목이에요. 실제 보행 거리와 계단 여부는 장소별 확인이 필요해요.</p><h3>한 번에 얼마나 걸을 수 있나요?</h3><div class="hb-choice-grid">'+card(walkChoices,'walk',s.hbWalkConfirmed?s.walk:null)+'</div><h3>계단 이용은 어떤가요?</h3><div class="hb-choice-grid">'+card(stairChoices,'stairs',s.hbStairsChoice)+'</div><div class="actions">'+prev+'<button type="button" id="hb-next">다음: 선호사항 →</button></div><p id="hb-step-error" class="warn" role="alert" hidden></p></section>';
    document.querySelectorAll('[data-hb-walk]').forEach(b=>b.onclick=()=>{s.walk=b.dataset.hbWalk;s.hbWalkConfirmed=true;save();refreshChoice('[data-hb-walk="'+b.dataset.hbWalk+'"]')});
    document.querySelectorAll('[data-hb-stairs]').forEach(b=>b.onclick=()=>{s.hbStairsChoice=b.dataset.hbStairs;s.stairs=s.hbStairsChoice==='possible'?'possible':'avoid';save();refreshChoice('[data-hb-stairs="'+b.dataset.hbStairs+'"]')});
    document.getElementById('hb-prev').onclick=()=>{changeStep(1)};
    document.getElementById('hb-next').onclick=()=>{s=hbRefreshAutomaticDate(s);if(hbTravelDateError(s.date)||s.hbStep===1){newPlan();document.getElementById('date')?.focus();return;}const issues=hbTravelInput(s).errors;if(issues.length){const m=document.getElementById('hb-step-error');m.hidden=false;m.textContent=issues.join(' ');return;}changeStep(3)};
    return;
  }
  const needs=[['toilet','화장실 가까이'],['rest','쉴 곳 많게'],['dropoff','입구 가까운 하차'],['elevator','엘리베이터'],['wheelchair','휠체어 편의시설']];
  const optionalFields=[
    ['hb-slope-pref','hbSlopePreference','경사는 어떤가요?',[
      ['','선택하지 않음'],['avoid_steep','가파른 경사 피하기'],['flexible','특별한 제한 없음']]],
    ['hb-rest-interval','hbRestIntervalMinutes','얼마나 자주 쉬면 좋을까요?',[
      ['','선택하지 않음'],['30','약 30분마다'],['45','약 45분마다'],['60','약 60분마다']]],
    ['hb-indoor-pref','hbIndoorPreference','어떤 장소를 선호하나요?',[
      ['','선택하지 않음'],['any','실내외 모두'],['indoor','실내 위주'],['outdoor','야외 위주']]]
  ];
  const optionalMarkup='<h3>추가 여행 선호 (선택)</h3><p class="muted">선택 내용은 이 기기에 저장돼요. 휴식 간격은 일정 초안에 반영돼요.</p><div class="row">'+optionalFields.map(([id,key,label,options])=>{
    const selected=s[key]==null?'':String(s[key]);
    return '<div class="field"><label for="'+id+'">'+safe(label)+'</label><select id="'+id+'" data-hb-pref="'+key+'">'+options.map(([value,name])=>'<option value="'+safe(value)+'"'+(selected===value?' selected':'')+'>'+safe(name)+'</option>').join('')+'</select></div>';
  }).join('')+'</div>';
  const aidOptions=[['','선택하지 않음'],['none','사용 안 함'],['cane','지팡이'],['walker','보행 보조기'],['wheelchair','휠체어'],['other','기타']];
  const foodOptions=[['less_spicy','덜 매운 음식'],['easy_to_chew','씹기 편한 음식'],['vegetarian','채식']];
  const aidValue=aidOptions.some(([id])=>id===s.hbMobilityAid)?s.hbMobilityAid:'';
  const mobilityMarkup='<div class="field"><label for="hb-mobility-aid">이동 보조기구 (선택)</label><select id="hb-mobility-aid">'+aidOptions.map(([id,label])=>'<option value="'+safe(id)+'"'+(id===aidValue?' selected':'')+'>'+safe(label)+'</option>').join('')+'</select></div>';
  const extraMarkup='<h3>식사 선호 (선택)</h3><p class="muted">식사 선호는 현재 식당 자동 필터로 적용되지 않아요. 식당 방문 전에 메뉴를 확인해 주세요.</p><div class="hb-choice-grid">'+foodOptions.map(([id,label])=>'<button type="button" class="hb-choice '+(s.hbFoodPreferences.includes(id)?'chosen':'')+'" data-hb-food="'+id+'" aria-pressed="'+String(s.hbFoodPreferences.includes(id))+'">'+safe(label)+'</button>').join('')+'</div>';
  el.innerHTML=intro+'<section class="panel"><h2 tabindex="-1">3. 선호사항</h2><p class="muted">편의시설 정보는 확인된 자료 범위 안에서 참고할 수 있어요. 추가 선택은 선택사항이에요.</p>'+mobilityMarkup+'<h3>어떤 장소를 먼저 볼까요?</h3><div class="hb-choice-grid">'+card([['all','관광지와 식당 모두'],['spot','관광지·문화시설'],['food','식당']], 'interest',s.hbInterest||'all')+'</div><h3>중요한 편의시설이 있나요?</h3><div class="hb-choice-grid">'+needs.map(([id,name])=>'<button type="button" class="hb-choice '+(s.momNeeds.includes(id)?'chosen':'')+'" data-hb-need="'+id+'" aria-pressed="'+String(s.momNeeds.includes(id))+'">'+safe(name)+'</button>').join('')+'</div>'+optionalMarkup+extraMarkup+'<div class="actions">'+prev+'<button type="button" id="hb-finish">이 조건으로 장소 살펴보기 →</button></div><p class="muted">추천 목록의 ‘확인 필요’ 장소는 안전·접근성이 검증된 곳이 아니에요.</p><p id="hb-finish-error" role="alert" class="warn"></p></section>';
  document.querySelectorAll('[data-hb-interest]').forEach(b=>b.onclick=()=>{s.hbInterest=b.dataset.hbInterest;s.hbBrowseFilter=s.hbInterest;save();refreshChoice('[data-hb-interest="'+b.dataset.hbInterest+'"]')});
  document.querySelectorAll('[data-hb-need]').forEach(b=>b.onclick=()=>{let n=b.dataset.hbNeed;s.momNeeds=s.momNeeds.includes(n)?s.momNeeds.filter(x=>x!==n):[...s.momNeeds,n];save();refreshChoice('[data-hb-need="'+n+'"]')});
  document.querySelectorAll('[data-hb-pref]').forEach(node=>node.onchange=()=>{
    const key=node.dataset.hbPref;
    if(!optionalFields.some(([,allowed])=>allowed===key))return;
    s[key]=key==='hbRestIntervalMinutes'?(node.value?Number(node.value):null):(node.value||null);
    save();
  });
  document.getElementById('hb-mobility-aid').onchange=e=>{s.hbMobilityAid=e.target.value||null;save()};
  document.querySelectorAll('[data-hb-food]').forEach(node=>node.onclick=()=>{const key=node.dataset.hbFood;s.hbFoodPreferences=s.hbFoodPreferences.includes(key)?s.hbFoodPreferences.filter(x=>x!==key):[...s.hbFoodPreferences,key];save();refreshChoice('[data-hb-food="'+key+'"]')});
  document.getElementById('hb-prev').onclick=()=>{changeStep(2)};
  document.getElementById('hb-finish').onclick=()=>{s=hbRefreshAutomaticDate(s);if(hbTravelDateError(s.date)||s.hbStep===1){newPlan();document.getElementById('date')?.focus();return;}const result=hbTravelInput(s);if(result.errors.length){document.getElementById('hb-finish-error').textContent=result.errors.join(' ');return;}s.hbBrowseLimit=30;s.hbBrowseFilter=s.hbInterest||'all';s.hbDraftActive=false;s.hbStep=1;save();go('/places')};
}
function hbBrowseText(value){
  return String(value??'').normalize('NFKC').toLocaleLowerCase('ko').replace(/\s+/g,'').trim();
}


function hbValidPlaceId(id){
  return typeof id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(id);
}
function hbUniquePlaceIds(ids){
  return [...new Set((Array.isArray(ids)?ids:[]).filter(hbValidPlaceId))];
}
function hbSearchPlaces(list,filter,query){
  const term=hbBrowseText(query);
  return (Array.isArray(list)?list:[]).filter(place=>{
    if(!place||!hbValidPlaceId(place.id)||typeof place.name!=='string'||!place.name.trim())return false;
    const category=filter==='all'||filter==='spot'&&place.kind!=='food'||filter==='culture'&&place.kind==='culture'||filter==='food'&&place.kind==='food'||filter==='access'&&hbAccessFacts(place).length>0;
    return category&&(!term||[place.name,place.address].some(value=>hbBrowseText(value).includes(term)));
  });
}
function hbPlaceCategory(place){
  return place.kind==='food'?'식당':place.kind==='culture'?'문화시설':'관광지';
}
function hbPlaceDetailPath(id){
  return '#/place/'+encodeURIComponent(id);
}

const hbRecommendationReasons={
  documented_route:'서버 자료에서 선택한 이동 조건과 일치하는 동선이 확인됐어요. 실제 현장 상황은 다시 확인해 주세요.',
  required_stairs:'검증된 이동 구간에 필수 계단이 있어 선택한 조건과 충돌해요.',
  conflicting_evidence:'접근성 자료가 서로 상충해 방문 전 확인이 필요해요.',
  stale_evidence:'접근성 자료가 오래되어 현재 동선을 다시 확인해야 해요.',
  mobility_aid_unverified:'선택한 보조기구로 이동할 수 있는 동선이 검증되지 않았어요.',
  insufficient_evidence:'계단·연속 보행시간·이동 동선에 관한 근거가 부족해요.',
  server_not_assessed:'이 장소는 서버 추천 판정 대상에 없어요. 접근성을 별도로 확인해 주세요.',
  local_unverified:'서버가 확인하지 못한 임시 목록이에요. 실제 접근성이 검증된 추천이 아니에요.',
  missing_reason:'서버 판정의 검증 근거가 누락되어 확인이 필요해요.',
  classification_mismatch:'서버 판정과 장소 자료의 접근성 정보가 일치하지 않아 확인이 필요해요.'
};
let hbRecommendationState=null;
let hbRecommendationSequence=0;

function hbRecommendationKey(input){
  return JSON.stringify(input);
}
function hbNormalizeRecommendationResponse(data){
  if(!data||typeof data!=='object'||!['eligible','needsReview','excluded'].every(key=>Array.isArray(data[key])))
    throw Error('invalid_recommendation_response');
  const byId=new Map();
  for(const group of ['eligible','needsReview','excluded']){
    for(const item of data[group]){
      if(!hbValidPlaceId(item?.id))continue;
      if(byId.has(item.id)){
        if(byId.get(item.id).group!==group)throw Error('conflicting_recommendation_groups');
        continue;
      }
      const reason=typeof item.reason==='string'?item.reason:
        Array.isArray(item.reasonCodes)&&typeof item.reasonCodes[0]==='string'?item.reasonCodes[0]:null;
      // A missing/unknown proof must never be upgraded to a verified result.
      const supported=(group==='eligible'&&reason==='documented_route')||
        (group==='excluded'&&reason==='required_stairs');
      const status=group==='needsReview'||supported?group:'needsReview';
      byId.set(item.id,{group,status,reason:reason||'missing_reason'});
    }
  }
  const appliedFoodPreferences=Array.isArray(data.appliedFoodPreferences)?data.appliedFoodPreferences.filter(x=>['less_spicy','easy_to_chew','vegetarian'].includes(x)):[];
  return {byId,foodPreferencesApplied:data.foodPreferencesApplied===true&&appliedFoodPreferences.length>0,appliedFoodPreferences};
}
function hbReconcileRecommendation(place,profile,serverState){
  const local=hbEvaluatePlace(place,profile);
  const server=serverState?.state==='ready'?serverState.result.byId.get(place.id):null;
  if(server){
    const stale=place.accessStatus==='stale'||hbAccessFacts(place).some(f=>f.status==='stale');
    const disagreement=server.status!=='needsReview'&&(local.conflict||stale||local.status==='excluded'&&server.status==='eligible');
    const status=disagreement?'needsReview':server.status;
    const reason=disagreement?(local.conflict?'conflicting_evidence':stale?'stale_evidence':'classification_mismatch'):server.reason;
    return {...local,status,reason,origin:'server',scope:status==='excluded'?local.scope:null,
      gaps:status==='needsReview'?local.gaps:[]};
  }
  // A locally plausible route is not an authoritative eligibility decision.
  const localExclusion=local.status==='excluded'&&serverState?.state!=='ready';
  return {...local,status:localExclusion?'excluded':'needsReview',
    reason:localExclusion?'required_stairs':serverState?.state==='ready'?'server_not_assessed':'local_unverified',
    origin:'local',scope:localExclusion?local.scope:null};
}
function hbQueueRecommendation(input){
  const key=hbRecommendationKey(input);
  if(hbRecommendationState?.key===key)return;
  const request=++hbRecommendationSequence;
  hbRecommendationState={key,state:'loading'};
  queueMicrotask(async()=>{
    if(hbRecommendationState?.key!==key||hbRecommendationSequence!==request)return;
    try{
      const response=await hbTravelRequest('/api/recommend',input);
      const result=hbNormalizeRecommendationResponse(response);
      if(hbRecommendationState?.key!==key||hbRecommendationSequence!==request)return;
      hbRecommendationState={key,state:'ready',result};
    }catch(error){
      if(hbRecommendationState?.key!==key||hbRecommendationSequence!==request)return;
      hbRecommendationState={key,state:'error',message:'서버 추천을 확인하지 못했어요.'};
    }
    if(path()==='/places'&&hbRecommendationState?.key===key)browse();
  });
}

let hbSelectionListOpen=false;
function browse(){
  const filter=['all','spot','culture','food','access'].includes(s.hbBrowseFilter)?s.hbBrowseFilter:(s.hbInterest||'all');
  const query=typeof s.hbBrowseQuery==='string'?s.hbBrowseQuery:'';
  const chosen=hbUniquePlaceIds(s.chosen);
  const must=hbUniquePlaceIds(s.hbMustVisitIds).filter(id=>chosen.includes(id));
  const profile={
    walk:s.hbWalkConfirmed?s.walk:null,stairsMode:s.hbStairsChoice,needs:s.momNeeds,mobilityAid:s.hbMobilityAid,
    slopePreference:s.hbSlopePreference,indoorPreference:s.hbIndoorPreference
  };
  const ready=!loading&&!issue&&hbPlacesLoadedRegion===s.region;
  const travel=hbTravelInput(s);
  const requestInput={...travel.input,placePreference:'all',facilityNeeds:Array.isArray(s.momNeeds)?s.momNeeds.filter(x=>['toilet','rest','dropoff','elevator','wheelchair'].includes(x)):[]};
  const requestKey=hbRecommendationKey(requestInput);
  if(ready&&!travel.errors.length)hbQueueRecommendation(requestInput);
  const serverState=ready&&!travel.errors.length&&hbRecommendationState?.key===requestKey?hbRecommendationState:null;
  const filtered=ready?hbSearchPlaces(places,filter,query):[];
  const ranked=filtered.map(p=>({p,e:hbReconcileRecommendation(p,profile,serverState)}))
    .sort((a,b)=>b.e.score-a.e.score||String(a.p.name||'').localeCompare(String(b.p.name||''),'ko'));
  const good=ranked.filter(x=>x.e.status==='eligible');
  const review=ranked.filter(x=>x.e.status==='needsReview');
  const excluded=ranked.filter(x=>x.e.status==='excluded');
  const limited=Math.max(10,Number(s.hbBrowseLimit)||30);
  const available=new Map((Array.isArray(places)?places:[]).filter(p=>p&&hbValidPlaceId(p.id)).map(p=>[p.id,p]));
  const selections=chosen.map(id=>({id,place:available.get(id)}));
  const foodPrefs=Array.isArray(s.hbFoodPreferences)?s.hbFoodPreferences.filter(x=>['less_spicy','easy_to_chew','vegetarian'].includes(x)):[];
  const foodUnsupported=foodPrefs.length&&!(serverState?.state==='ready'&&serverState.result.foodPreferencesApplied&&foodPrefs.every(x=>serverState.result.appliedFoodPreferences.includes(x)));
  const card=({p,e})=>{
    const picked=chosen.includes(p.id);
    const status=e.status==='eligible'?'서버 기준 조건 일치':e.status==='excluded'?'이동 조건 충돌':e.reason==='conflicting_evidence'||e.conflict?'자료 상충 · 확인 필요':'접근성 확인 필요';
    const description=hbRecommendationReasons[e.reason]||hbRecommendationReasons.missing_reason;
    return '<article class="card hb-recommend-card"><div class="hb-card-top"><span class="chip">'+hbPlaceCategory(p)+'</span><span class="hb-recommend-state">'+status+'</span></div>'+
      '<h3>'+safe(p.name)+'</h3><p class="muted">'+safe(p.address||'주소 미확인')+'</p>'+
      '<p class="muted">'+safe(description)+'</p>'+
      (e.scope?'<p>확인 범위: '+safe(e.scope)+'</p>':'')+
      (e.found.length?'<p>관련 편의시설 안내 (동선 검증과 별개): '+safe(e.found.join(', '))+'</p>':'')+
      (e.gaps.length?'<p class="muted">'+safe(e.gaps.slice(0,3).join(' · '))+'</p>':'')+
      '<div class="actions"><a class="light" data-hb-info="'+safe(p.id)+'" href="'+safe(hbPlaceDetailPath(p.id))+'">상세 정보</a>'+
      (e.status==='excluded'&&!picked?'':'<button type="button" data-hb-pick="'+safe(p.id)+'" aria-pressed="'+picked+'">'+(picked?'선택 취소':'일정에 담기')+'</button>')+'</div></article>';
  };
  const section=(title,arr,empty='')=>'<section class="hb-result-section"><h2>'+title+' <span class="hb-result-count">'+arr.length+'곳</span></h2>'+
    (arr.length?'<div class="grid">'+arr.slice(0,limited).map(card).join('')+'</div>':'<p class="muted">'+empty+'</p>')+'</section>';
  const noResults=ready&&!ranked.length;
  const results=!ready?'':noResults?
    panel('검색 결과 0건',places.length?'<p>현재 검색어·분류에 맞는 장소가 없어요. 조건을 자동으로 완화하지 않았어요.</p>':'<p>이 지역에서 조회된 장소가 없어요. 다른 지역을 직접 선택해 보세요.</p>'):
    (good.length?section('서버 자료 기준 조건 일치',good):'')+
    (review.length?section('방문 전 확인할 장소',review):'')+
    (excluded.length?'<details class="hb-conflict"><summary>확인된 이동 조건 충돌 '+excluded.length+'곳</summary><div class="grid">'+excluded.slice(0,limited).map(card).join('')+'</div></details>':'')+
    (Math.max(good.length,review.length,excluded.length)>limited?'<button type="button" class="light" id="hb-more">장소 더 보기</button>':'');
  const extraPrefs=[
    s.hbMobilityAid&&s.hbMobilityAid!=='none'?hbMobilityAidLabels[s.hbMobilityAid]:null,
    s.hbSlopePreference==='avoid_steep'?'가파른 경사 피하기 (실제 경사 미검증)':null,
    [30,45,60].includes(Number(s.hbRestIntervalMinutes))?'휴식 간격 '+Number(s.hbRestIntervalMinutes)+'분 (일정 초안)':null,
    s.hbIndoorPreference==='indoor'?'실내 위주':s.hbIndoorPreference==='outdoor'?'야외 위주':null
  ].filter(Boolean);
  const stairs={impossible:'이용 불가',avoid:'피하기',possible:'이용 가능'}[s.hbStairsChoice]||'미선택';
  const foodNote=foodUnsupported?'<p class="warn" role="status">선택한 음식 선호는 자동 필터 미지원이에요. 방문 전 식당 메뉴를 직접 확인해 주세요.</p>':
    foodPrefs.length?'<p class="muted">서버가 음식 선호 반영을 보고했어요. 실제 메뉴는 방문 전 확인해 주세요.</p>':'';
  const selectedList=selections.length?'<ul class="hb-selected-places">'+selections.map(({id,place})=>
    '<li><span>'+safe(place?.name||'현재 자료에서 조회되지 않은 장소')+'</span> '+
    '<button type="button" class="light" data-hb-must="'+safe(id)+'" aria-pressed="'+String(must.includes(id))+'"'+(!place?' disabled':'')+'>'+(must.includes(id)?'필수 방문지 ✓':'필수 방문지 지정')+'</button> '+
    '<button type="button" class="light" data-hb-unpick="'+safe(id)+'">선택 취소</button></li>'
  ).join('')+'</ul>':'<p>상세 정보를 확인하고 일정에 넣을 장소를 담아보세요.</p>';
  const canBuild=ready&&selections.some(x=>x.place);
  const tray='<section class="hb-selection-tray" aria-labelledby="hb-selection-title">'+
    '<div class="hb-selection-bar"><h2 id="hb-selection-title">일정에 담은 장소 <span class="hb-selection-count">'+chosen.length+'</span>곳</h2>'+
    '<button type="button" id="build"'+(canBuild?'':' disabled')+'>선택한 장소로 일정 만들기</button></div>'+
    (selections.length?'<details class="hb-selection-list"'+(hbSelectionListOpen?' open':'')+'><summary>담은 장소 보기</summary>'+selectedList+'</details>':
      '<p class="muted hb-selection-hint">아래 목록에서 일정에 담기를 누르면 여기에 바로 반영돼요.</p>')+'</section>';
  const serverStatus=!ready?'장소 자료 조회 대기':
    travel.errors.length?'이동 조건을 입력하면 서버 판정을 확인할 수 있어요. '+safe(travel.errors.join(' ')):
    serverState?.state==='loading'?'서버에서 이동 조건을 확인하고 있어요. 조회 전 목록은 모두 임시 참고용이에요.':
    serverState?.state==='error'?'서버 추천 API 오류 · 임시 장소 목록만 표시합니다. 확정 적합 판정은 제공하지 않아요.':
    serverState?.state==='ready'?'서버 추천 판정: 조건 일치 '+[...serverState.result.byId.values()].filter(x=>x.status==='eligible').length+
      '곳 · 방문 전 확인 '+[...serverState.result.byId.values()].filter(x=>x.status==='needsReview').length+
      '곳 · 조건 충돌 '+[...serverState.result.byId.values()].filter(x=>x.status==='excluded').length+'곳.':
    '이동 조건 확인 대기';
  const serverZero=serverState?.state==='ready'&&serverState.result.byId.size===0;
  const retry=serverState?.state==='error'?'<button type="button" id="hb-recommend-retry" class="light">서버 추천 다시 확인</button>':'';
  el.innerHTML='<h1>여행 장소 찾기</h1>'+prefs()+
    '<div class="hb-profile-summary"><strong>여행 조건</strong><p>'+safe(s.date)+' · '+safe(s.hbPlanStart||'시작 제안받기')+' ~ '+safe(s.hbPlanEnd||'종료 제안받기')+'</p><p>걷기 '+safe(s.hbWalkConfirmed?s.walk+'분':'미선택')+' · 계단 '+safe(stairs)+
    (extraPrefs.length?' · '+safe(extraPrefs.join(' / ')):'')+'</p><button type="button" class="light" id="hb-edit-profile">조건 수정</button></div>'+tray+
    '<section class="panel"><h2>이동 조건 추천 판정</h2><p id="hb-recommend-status" role="'+(serverState?.state==='error'?'alert':'status')+'">'+serverStatus+'</p>'+retry+
    (serverZero?'<p class="muted">서버 추천 결과 0건이에요. 아래에 서버에서 판정하지 않은 장소가 있더라도 조건 일치로 간주하지 않아요.</p>':'')+
    '<p class="muted">현장 동선·영업시간·실제 보행 거리는 별도로 확인해 주세요.</p></section>'+
    (typeof weatherCard==='function'?weatherCard():'')+
    '<form class="row" role="search" id="hb-browse-search"><div class="field"><label for="hb-place-search">장소 이름 또는 주소</label><input type="search" id="hb-place-search" maxlength="100" value="'+safe(query)+'"></div>'+
    '<button type="submit" id="hb-place-search-submit">검색</button>'+(query?'<button type="button" class="light" id="hb-search-reset">검색 지우기</button>':'')+'</form>'+
    '<div class="hb-filter-bar" role="group" aria-label="장소 필터">'+[['all','전체'],['spot','관광지'],['culture','문화시설'],['food','식당'],['access','편의시설 안내 있음']].map(([id,label])=>
    '<button type="button" data-hb-filter="'+id+'" class="light '+(filter===id?'hb-filter-active':'')+'" aria-pressed="'+String(filter===id)+'">'+label+'</button>').join('')+'</div>'+
    '<p class="muted">미확인 장소는 자동으로 조건을 완화해 추천하지 않아요. 편의시설 존재만으로 휠체어 동선을 보장하지 않아요.</p>'+foodNote+
    '<p role="status">'+(ready?ranked.length+'곳이 현재 검색·분류에 표시돼요.':'')+'</p><div id="hb-place-results" aria-busy="'+loading+'">'+results+'</div>';
  bindPrefs();
  const trayList=el.querySelector('.hb-selection-list');
  if(trayList)trayList.ontoggle=()=>{hbSelectionListOpen=trayList.open};
  const datePicker=document.getElementById('date');
  if(datePicker){const onDateChange=datePicker.onchange;datePicker.onchange=event=>{onDateChange?.(event);browse()};}
  const retryButton=document.getElementById('hb-recommend-retry');
  if(retryButton)retryButton.onclick=()=>{hbRecommendationState=null;hbRecommendationSequence++;browse()};
  document.getElementById('hb-edit-profile').onclick=()=>{s.hbStep=1;s.hbDraftActive=true;save();go('/new')};
  function updateAndFocus(selector){
    save();browse();document.querySelector(selector)?.focus();
  }
  document.getElementById('hb-browse-search').onsubmit=event=>{
    event.preventDefault();
    s.hbBrowseQuery=document.getElementById('hb-place-search').value.trim();
    s.hbBrowseLimit=30;
    updateAndFocus('#hb-place-search');
  };
  const reset=document.getElementById('hb-search-reset');
  if(reset)reset.onclick=()=>{s.hbBrowseQuery='';s.hbBrowseLimit=30;updateAndFocus('#hb-place-search')};
  document.querySelectorAll('[data-hb-filter]').forEach(b=>b.onclick=()=>{
    s.hbBrowseFilter=b.dataset.hbFilter;s.hbBrowseLimit=30;
    updateAndFocus('[data-hb-filter="'+b.dataset.hbFilter+'"]');
  });
  document.querySelectorAll('[data-hb-pick],[data-hb-unpick]').forEach(b=>b.onclick=()=>{
    const id=b.dataset.hbPick||b.dataset.hbUnpick;
    const fromTray=!!b.closest?.('.hb-selection-tray');
    if(!hbValidPlaceId(id))return;
    const next=hbUniquePlaceIds(s.chosen);
    const wasPicked=next.includes(id);
    if(!wasPicked&&!available.has(id))return;
    if(!wasPicked&&serverState?.state==='ready'&&serverState.result.byId.get(id)?.status==='excluded')return;
    s.chosen=wasPicked?next.filter(x=>x!==id):[...next,id];
    s.hbMustVisitIds=hbUniquePlaceIds(s.hbMustVisitIds).filter(x=>s.chosen.includes(x));
    save();
    browse();
    const button=fromTray?['.hb-selection-tray [data-hb-unpick]','.hb-selection-tray summary','#build'].map(q=>document.querySelector(q)).find(Boolean):[...document.querySelectorAll('[data-hb-pick]')].find(node=>node.dataset.hbPick===id);
    (button||document.getElementById('hb-place-search'))?.focus();
  });
  document.querySelectorAll('[data-hb-must]').forEach(b=>b.onclick=()=>{
    const id=b.dataset.hbMust;
    if(!chosen.includes(id)||!available.has(id))return;
    s.hbMustVisitIds=must.includes(id)?must.filter(x=>x!==id):[...must,id];
    save();browse();
    [...document.querySelectorAll('[data-hb-must]')].find(node=>node.dataset.hbMust===id)?.focus();
  });
  const more=document.getElementById('hb-more');
  if(more)more.onclick=()=>{s.hbBrowseLimit=limited+30;updateAndFocus('#hb-more, #build')};
  document.getElementById('build').onclick=()=>{
    const blocked=chosen.find(id=>serverState?.state==='ready'&&serverState.result.byId.get(id)?.status==='excluded');
    if(blocked){alert('이동 조건과 충돌하는 장소가 선택돼 있어요. 해당 장소 선택을 취소해 주세요.');return false;}
    const selectedMust=hbUniquePlaceIds(s.hbMustVisitIds).filter(id=>chosen.includes(id));
    const success=hbApplyScheduleFromSelection();
    if(!success)return false;
    if(selectedMust.length){
      s.stops=s.stops.map(stop=>({...stop,must:stop.must||selectedMust.includes(stop.placeId)}));
      try{save();go('/plan')}catch{alert('필수 방문지 표시를 저장하지 못했어요. 저장 상태를 확인해 주세요.');return false;}
    }
    return true;
  };
}
function hbDecodePlaceId(value){
 try{return decodeURIComponent(value)}catch{return null}
}

function hbEvidenceStatus(fact){
 if(fact.status==='conflicting')return '출처 상충';
 if(fact.status==='stale')return '오래된 정보';
 if(fact.status==='unknown')return '확인 필요';
 const verifiedStatus={verified_yes:'이용 가능 확인',verified_no:'이용 불가 확인'}[fact.status];
 if(verifiedStatus){
  return typeof fact.scope==='string'&&fact.scope.trim()&&Number.isFinite(Date.parse(fact.verifiedAt))?
   verifiedStatus:'검증 범위 확인 필요';
 }
 return '자료 안내 있음';
}

function hbEvidenceSourceLink(value){
 try{
  const url=new URL(value);
  return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;
 }catch{return null}
}

function hbDetailAccessGuide(place){
 const guides=window.hbLocalAccessGuides;
 return guides&&Object.hasOwn(guides,place.id)?guides[place.id]:null;
}

function hbDetailMap(location,label){
 if(!location||location.lat==null||location.lng==null||
  String(location.lat).trim()===''||String(location.lng).trim()==='')return '';
 const lat=Number(location.lat),lng=Number(location.lng);
 if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lng)||Math.abs(lng)>180)return '';
 return '<a href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(lat+','+lng)+
  '" target="_blank" rel="noopener noreferrer">'+safe(label)+'</a>';
}

function hbDetailTopics(fact){
 if(fact.topic)return [fact.topic];
 const label=(fact.label||'')+' '+(fact.description||'');
 return [
  ['dropoff',/하차|승하차|주차|정류장/],['entrance',/출입|입구/],['distance',/거리|보행시간/],
  ['stairs',/계단/],['slope',/경사/],['threshold',/단차|문턱/],['wheelchair',/휠체어/],
  ['rest',/휴식|쉼터|휴게|벤치|앉을/],['toilet',/화장실/],['elevator',/엘리베이터|승강기/]
 ].filter(([,pattern])=>pattern.test(label)).map(([topic])=>topic);
}

function hbDetailSummary(facts, topics){
 const related=facts.filter(fact=>hbDetailTopics(fact).some(topic=>topics.includes(topic)));
 const states=related.map(hbEvidenceStatus);
 const contradiction=topics.some(topic=>{
  const statesForTopic=related.filter(fact=>hbDetailTopics(fact).includes(topic)).map(hbEvidenceStatus);
  return statesForTopic.includes('이용 가능 확인')&&statesForTopic.includes('이용 불가 확인');
 });
 if(states.includes('출처 상충')||contradiction)return '자료가 서로 달라요';
 if(states.includes('이용 불가 확인'))return '이용 제한 자료가 있어요';
 if(states.some(status=>status==='자료 안내 있음'||status==='이용 가능 확인'))return '관련 안내가 있어요';
 if(states.includes('오래된 정보'))return '최신 상태 확인이 필요해요';
 return '방문 전 확인이 필요해요';
}

function hbArrivalMapLink(place, guide){
 const parking=guide?.arrival?.mapQuery;
 const query=parking||[place.name,place.address].filter(Boolean).join(' ').trim();
 if(!query)return '';
 return '<a class="hb-access-map-source" href="https://map.naver.com/p/search/'+encodeURIComponent(query)+
  '" target="_blank" rel="noopener noreferrer">'+(parking?'네이버 지도에서 주차장 찾기':'네이버 지도에서 장소 찾기')+'</a>';
}

function hbArrivalMarkup(place, guide, facts){
 const location=(label,point)=>{
  if(!point?.name)return '';
  const link=hbDetailMap(point,label+' 위치 보기');
  return '<p><strong>'+label+'</strong> '+safe(point.name)+(link?' · '+link:'')+'</p>';
 };
 const mobilityTopics=['dropoff','entrance','stairs','slope','threshold','wheelchair','elevator'];
 const mobilityStatus=hbDetailSummary(facts,mobilityTopics);
 const showGuide=guide?.map&&!['자료가 서로 달라요','이용 제한 자료가 있어요'].includes(mobilityStatus);
 const hasRoute=showGuide&&guide.map.connections?.length;
 const restroom=guide?.restroom;
 const restroomSource=hbEvidenceSourceLink(restroom?.sourceUrl);
 const restroomStatus=hbDetailSummary(facts,['toilet']);
 return '<section class="panel hb-detail-access" aria-labelledby="hb-detail-access-title">'+
  '<h2 id="hb-detail-access-title">도착 안내</h2>'+
  location('주차',guide?.arrival)+location('입구',guide?.entrance)+
  hbArrivalMapLink(place,guide)+
  (hasRoute?'':'<p class="warn">주차장에서 입구까지 계단 없는 길은 확인이 필요해요.</p>')+
  (restroom?.location&&restroomSource&&!['자료가 서로 달라요','이용 제한 자료가 있어요'].includes(restroomStatus)?
   '<h3>장애인 화장실</h3><p>'+safe(restroom.location)+'</p>'+
   '<p class="muted">화장실까지 계단 없는 길은 확인이 필요해요.</p>'+
   '<a class="hb-access-map-source" href="'+safe(restroomSource)+'" target="_blank" rel="noopener noreferrer">화장실 안내 출처</a>':'')+
  '</section>'+(showGuide?hbAccessMapMarkup(guide):'');
}

function hbAccessMapMarkup(guide){
 const map=guide?.map;
 if(!map)return '';
 const image=hbEvidenceSourceLink(map.image);
 const official=hbEvidenceSourceLink(map.official);
 return '<section class="hb-access-map panel" aria-labelledby="hb-access-map-title">'+
  '<h2 id="hb-access-map-title">'+(map.connections?.length?'계단 없이 입구까지':'데크 입구 안내')+'</h2>'+
  '<p class="muted">'+safe(map.caption)+'</p>'+
  '<p class="hb-access-map-key">공식 자료를 바탕으로 안내해요. 현장 상황은 달라질 수 있어요.</p>'+
  '<ol class="hb-access-map-stops" aria-label="이동 지점">'+map.stops.map((stop,index)=>
   '<li'+(map.connections?.includes(index)?' class="hb-access-map-linked"':'')+'>'+
   '<button type="button" class="light" data-access-map-stop="'+index+'" aria-pressed="'+(index===0)+'"><span aria-hidden="true">'+(index+1)+'</span><strong>'+safe(stop[0])+'</strong></button>'+
   (map.connections?.includes(index)?'<span class="hb-access-map-connection">공식 안내에서 연결 확인</span>':'')+'</li>'
  ).join('')+'</ol>'+
  '<p class="hb-access-map-note" role="status">'+safe(map.stops[0][1])+'</p>'+
  (image?'<details class="hb-access-floor" open><summary>공식 층별 지도 보기</summary><figure><a href="'+safe(image)+'" target="_blank" rel="noopener noreferrer"><img src="'+safe(image)+'" alt="국립중앙박물관 공식 층별 배치도. 1층 주출입구, 열린마당, 상설전시실 위치가 표시돼요." loading="lazy"></a><figcaption>지도를 누르면 크게 볼 수 있어요.</figcaption></figure></details>':'')+
  (official?'<a class="hb-access-map-source" href="'+safe(official)+'" target="_blank" rel="noopener noreferrer">'+safe(map.linkLabel)+'</a>':'')+
  '</section>';
}

function hbBindAccessMap(guide){
 const map=guide?.map;
 const section=el.querySelector('.hb-access-map');
 if(!map||!section)return;
 const buttons=section.querySelectorAll('[data-access-map-stop]');
 const note=section.querySelector('.hb-access-map-note');
 const figure=section.querySelector('figure');
 const image=figure?.querySelector('img');
 if(image){
  const showMapFallback=()=>{
   figure.textContent='지도 이미지를 불러오지 못했어요. 아래 공식 안내에서 지도를 볼 수 있어요.';
  };
  image.addEventListener('error',showMapFallback,{once:true});
  if(image.complete&&!image.naturalWidth)showMapFallback();
 }
 for(const button of buttons){
  button.onclick=()=>{
   for(const other of buttons)other.setAttribute('aria-pressed',String(other===button));
   note.textContent=map.stops[Number(button.dataset.accessMapStop)][1];
  };
 }
}


// Agent X: opt-in nationwide discovery; existing recommendation and selection remain authoritative.
let hbRichSelected=null,hbRichDispose=null,hbRichSearchDispose=null;
function hbRichCleanup(){
 if(typeof hbRichDispose==='function')hbRichDispose();hbRichDispose=null;
 if(typeof hbRichSearchDispose==='function')hbRichSearchDispose();hbRichSearchDispose=null;
}
function hbRichIdentity(p){
 const types={spot:'12',culture:'14',food:'39'};
 const kind=p&&Object.hasOwn(types,p.kind)?types[p.kind]:null;
 return p&&/^tour-\d{1,12}$/.test(p.id)&&kind&&(!p.contentTypeId||p.contentTypeId===kind)?{contentId:p.id.slice(5),contentTypeId:kind}:null;
}
function hbRichMatchesRegion(p,region){
 return String(p?.areaCode??'')===({서울:'1',경기:'31'}[region]||'-');
}
function hbRichMapAdapter({container,points,onSelect}){
 let disposed=false,map=null;const markers=[],listeners=[];
 const clear=()=>{for(const l of listeners.splice(0)){try{window.naver?.maps?.Event?.removeListener(l)}catch{}}for(const m of markers.splice(0)){try{m.setMap(null)}catch{}}try{map?.destroy()}catch{}map=null;};
 const valid=points.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&p.lat>=32&&p.lat<=39&&p.lng>=124&&p.lng<=133);
 if(!valid.length){container.textContent='지도에 표시할 좌표가 없어요.';return ()=>{};}
 container.style.minHeight='240px';container.setAttribute('aria-label','네이버 장소와 시설 지도');
 container.textContent='지도를 불러오는 중이에요.';
 loadNaverMap().then(M=>{
  if(disposed||!container.isConnected)return;
  container.replaceChildren();
  map=new M.Map(container,{center:new M.LatLng(valid[0].lat,valid[0].lng),zoom:15,scrollWheel:false});
  const bounds=new M.LatLngBounds();
  for(const p of valid){
   const pos=new M.LatLng(p.lat,p.lng);bounds.extend(pos);
   const symbol=({spot:'관',culture:'문',food:'식',parking:'P',dropoff:'하',entrance:'입',public_toilet:'WC',accessible_toilet:'♿',rest:'쉼',wheelchair:'♿',attraction:'관'})[p.kind]||'•';
   const marker=new M.Marker({map,position:pos,title:String(p.name||''),icon:{content:'<span style="display:inline-grid;place-items:center;min-width:34px;height:34px;background:var(--hb-primary);color:var(--hb-ink);border:2px solid var(--hb-ink);border-radius:50%;font-weight:700">'+symbol+'</span>',anchor:new M.Point(17,17)}});
   markers.push(marker);listeners.push(M.Event.addListener(marker,'click',()=>{if(!disposed)onSelect(p.id);}));
  }
  if(valid.length>1)map.fitBounds(bounds,{top:32,right:32,bottom:32,left:32});
 }).catch(()=>{clear();if(!disposed&&container.isConnected)container.textContent='지도를 불러오지 못했어요. 아래 목록을 이용해 주세요.';});
 return ()=>{disposed=true;clear();};
}
function hbRichDetailAttach(place,auto){
 const identity=hbRichIdentity(place),component=window.HBRichPlaceDetail;
 if(!identity||!component||typeof component.mount!=='function')return;
 const host=document.createElement('section');host.className='panel';host.setAttribute('aria-label','관광공사 추가 상세정보');
 const trigger=document.createElement('button');trigger.type='button';trigger.className='light';trigger.textContent='운영시간·요금·시설 더 보기';
 const status=document.createElement('p');status.setAttribute('role','status');
 const body=document.createElement('div');host.append(trigger,status,body);
 const arrival=el.querySelector('.hb-detail-access');if(arrival)arrival.insertAdjacentElement('beforebegin',host);else el.append(host);
 let disposed=false,controller=null,unmount=null,loaded=false;
 hbRichDispose=()=>{disposed=true;controller?.abort();if(typeof unmount==='function')unmount();};
 trigger.onclick=async()=>{
  if(loaded||controller)return;
  trigger.disabled=true;status.textContent='공식 관광정보를 확인 중이에요.';controller=new AbortController();
  try{
   const q=new URLSearchParams({action:'detail',...identity});
   const response=await fetch('/api/rich-tour?'+q,{signal:controller.signal,credentials:'same-origin'});
   if(!response.ok)throw Error('unavailable');
   const data=await response.json();
   if(disposed||!host.isConnected)return;
   if(data.id!==place.id||data.contentTypeId!==identity.contentTypeId)throw Error('identity');
   unmount=component.mount(body,{data,photoAlreadyShown:true,mapAdapter:hbRichMapAdapter});
   loaded=true;trigger.hidden=true;status.textContent='공식 자료 기준 추가 정보예요. 기존 접근성 주의사항도 함께 확인해 주세요.';
  }catch(e){if(!disposed&&host.isConnected)status.textContent='추가 정보를 지금 조회할 수 없어요. 기존 장소 안내는 계속 이용할 수 있어요.';}
  finally{controller=null;if(!disposed&&!loaded)trigger.disabled=false;}
 };
 if(auto)trigger.click();
}
function hbRichDiscoveryAttach(){
 if(!window.HBRichPlaceDetail||!document.getElementById('nearby-map'))return;
 const host=document.createElement('section');host.className='panel';host.id='hb-rich-discovery';
 host.innerHTML='<details><summary>전국 여행지 찾아보기</summary><p class="muted">전국 관광지·문화시설·식당 탐색. 실제 API 사용 권한이 확인된 환경에서만 조회돼요.</p><div class="field"><label for="hb-rich-mode">검색 방식</label><select id="hb-rich-mode"><option value="area">지역</option><option value="keyword">장소명</option><option value="location">위 지도 중심</option></select></div><div class="field"><label for="hb-rich-area">시·도</label><select id="hb-rich-area"><option value="">전국</option></select><button class="light" type="button" id="hb-rich-areas">지역 목록 불러오기</button></div><div class="field"><label for="hb-rich-district">시·군·구</label><select id="hb-rich-district"><option value="">전체</option></select></div><div class="field"><label for="hb-rich-keyword">장소명</label><input id="hb-rich-keyword" maxlength="100" type="search"></div><div class="field"><label for="hb-rich-kind">장소 유형</label><select id="hb-rich-kind"><option value="12">관광지</option><option value="14">문화시설</option><option value="39">식당</option></select></div><div class="actions"><button type="button" id="hb-rich-search">검색</button><button class="light" type="button" id="hb-rich-next" hidden>다음 결과 더 보기</button></div><p id="hb-rich-status" role="status"></p><div id="hb-rich-map"></div><div id="hb-rich-list"></div></details>';
 const near=document.getElementById('nearby-map').closest('section');if(!near)return;near.insertAdjacentElement('afterend',host);
 const at=id=>host.querySelector('#hb-rich-'+id);
 const status=at('status'),list=at('list'),mapHost=at('map'),next=at('next');
 let disposed=false,searchEpoch=0,areaEpoch=0,mapDispose=null,page=0,params=null,records=new Map(),searchAbort=null,areaAbort=null;
 hbRichSearchDispose=()=>{disposed=true;searchAbort?.abort();areaAbort?.abort();if(typeof mapDispose==='function')mapDispose();};
 async function request(query,signal){
  const res=await fetch('/api/rich-tour?'+new URLSearchParams(query),{credentials:'same-origin',signal});
  if(!res.ok)throw Error('unavailable');return res.json();
 }
 async function loadAreas(region){
  const epoch=++areaEpoch;areaAbort?.abort();areaAbort=new AbortController();
  const select=region?at('district'):at('area');
  status.textContent='지역 목록을 불러오는 중이에요.';
  try{const data=await request({action:'areas',numOfRows:'40',...(region?{areaCode:region}:{})},areaAbort.signal);
   if(disposed||epoch!==areaEpoch)return;
   select.replaceChildren();const first=document.createElement('option');first.value='';first.textContent=region?'전체':'전국';select.append(first);
   for(const item of data.areas||[]){if(!Number.isInteger(item.code)||typeof item.name!=='string')continue;const option=document.createElement('option');option.value=String(item.code);option.textContent=item.name;select.append(option);}
   status.textContent='지역을 선택해 주세요.';
  }catch{if(!disposed&&epoch===areaEpoch)status.textContent='지역 목록을 불러올 수 없어요. 기존 주변 검색은 이용할 수 있어요.';}
 }
 at('areas').onclick=()=>loadAreas('');
 at('area').onchange=()=>{at('district').replaceChildren();const option=document.createElement('option');option.value='';option.textContent='전체';at('district').append(option);if(at('area').value)loadAreas(at('area').value);};
 function readParams(){
  const mode=at('mode').value,q={action:'search',mode,contentTypeId:at('kind').value,numOfRows:'20'};
  if(mode==='location'){const point=nearbyMap?.getCenter?.();const lat=point?.lat?.(),lng=point?.lng?.();if(!Number.isFinite(lat)||!Number.isFinite(lng))throw Error('먼저 위 지도를 불러와 주세요.');q.lat=lat.toFixed(4);q.lng=lng.toFixed(4);}
  else{if(at('area').value)q.areaCode=at('area').value;if(at('district').value&&q.areaCode)q.sigunguCode=at('district').value;if(mode==='keyword'){q.keyword=at('keyword').value.trim();if(!q.keyword)throw Error('장소명을 입력해 주세요.');}}
  return q;
 }
 function select(id){
  const p=records.get(id);if(!p)return;hbRichSelected=p;
  if(hbRichMatchesRegion(p,s.region))hbRememberNearbyPlace(p);
  location.hash='#/place/'+encodeURIComponent(id);
 }
 function draw(){
  if(typeof mapDispose==='function')mapDispose();mapDispose=null;mapHost.replaceChildren();list.replaceChildren();
  const items=[...records.values()];
  if(!items.length){mapHost.style.minHeight='0';list.textContent='조회된 장소가 없어요.';return;}
  const mapped=items.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&p.lat>=32&&p.lat<=39&&p.lng>=124&&p.lng<=133);
  if(mapped.length)mapDispose=hbRichMapAdapter({container:mapHost,points:mapped,onSelect:select});else{mapHost.style.minHeight='0';mapHost.textContent='좌표를 확인한 장소가 없어요.';}
  for(const p of items){const b=document.createElement('button');b.type='button';b.className='light';b.style.cssText='display:block;width:100%;min-height:var(--hb-touch);text-align:left;white-space:normal;margin-block:8px';b.textContent=p.name+' · '+(p.address||'주소 미확인')+(mapped.includes(p)?'':' · 좌표 미확인');b.onclick=()=>select(p.id);list.append(b);}
 }
 async function run(reset){
  if(reset){try{params=readParams();}catch(e){status.textContent=e.message;return;}page=0;records=new Map();next.hidden=true;draw();}
  if(!params)return;
  const epoch=++searchEpoch;searchAbort?.abort();searchAbort=new AbortController();next.disabled=true;status.textContent='전국 관광정보를 확인 중이에요.';
  try{const result=await request({...params,pageNo:String(page+1)},searchAbort.signal);
   if(disposed||epoch!==searchEpoch)return;
   if(!Array.isArray(result.places)||result.pageNo!==page+1)throw Error('invalid page');
   for(const p of result.places){if(hbRichIdentity(p)&&typeof p.name==='string'&&p.name&&!records.has(p.id))records.set(p.id,p);}
   page++;draw();next.hidden=!result.hasNext||page>=5;status.textContent='현재 조회 '+records.size+'곳 · '+(result.hasNext?(page>=5?'5페이지 조회 제한에 도달했어요. 검색 조건을 좁혀 주세요.':'다음 페이지가 있어요.'): '마지막 페이지예요.');
  }catch{if(!disposed&&epoch===searchEpoch)status.textContent='관광정보를 조회할 수 없어요. 기존 주변 검색은 계속 이용할 수 있어요.';}
  finally{if(!disposed&&epoch===searchEpoch)next.disabled=false;}
 }
 at('search').onclick=()=>run(true);next.onclick=()=>run(false);
}

function detail(id){
 if(typeof hbRichDispose==='function')hbRichDispose();hbRichDispose=null;
 const back='<p><a id="hb-detail-back" class="hb-back-link" href="#/places"><span aria-hidden="true">←</span> 장소 목록</a></p>';
 const selectedRich=hbRichSelected?.id===id?hbRichSelected:null;
 const place=id?(places.find(value=>value.id===id)||selectedRich):null;
 if(!place||!selectedRich&&(loading||issue)){
  if(loading||hbPlacesLoadedRegion===null&&!issue&&id){
   el.innerHTML=back+'<h1>장소 상세 정보</h1><p role="status">장소 정보를 불러오는 중이에요.</p>';
  }else if(issue){
   el.innerHTML=back+'<h1>장소 정보를 가져오지 못했어요</h1><p role="alert">'+safe(issue)+'</p>'+button('hb-detail-retry','다시 조회');
   document.getElementById('hb-detail-retry').onclick=load;
  }else{
   el.innerHTML=back+'<h1>장소를 찾지 못했어요</h1><p>링크를 확인하거나 장소 목록에서 다시 검색해 주세요.</p>';
  }
  return;
 }
 const guide=hbDetailAccessGuide(place);
 const localFacts=Array.isArray(guide?.facts)?guide.facts.filter(fact=>fact&&typeof fact==='object'):[];
 const facts=[...localFacts,...hbAccessFacts(place)];
 const renderFact=fact=>{
  const href=hbEvidenceSourceLink(fact.sourceUrl);
  const source=fact.source||'출처 상세 미제공';
  const status=hbEvidenceStatus(fact);
  return '<article class="hb-evidence-row"><div class="hb-evidence-head"><strong>'+safe(fact.label||'편의시설')+
   '</strong><span class="hb-evidence-status">'+status+'</span></div><p>'+safe(fact.description||'설명 없음')+'</p>'+
   '<p class="muted">출처 '+(href?'<a href="'+safe(href)+'" target="_blank" rel="noopener noreferrer">'+safe(source)+'</a>':safe(source))+'</p>'+
   (fact.collectedAt?'<p class="muted">수집일 '+safe(fact.collectedAt)+'</p>':'')+
   (fact.verifiedAt?'<p class="muted">자료에 기록된 확인일 '+safe(fact.verifiedAt)+'</p>':'')+
   (fact.scope?'<p class="muted">확인 범위 '+safe(fact.scope)+'</p>':'')+'</article>';
 };
 const specs=[
  ['하차 지점에서 입구까지',['dropoff','entrance','distance'],'하차 지점과 연결되는 입구, 실제 보행 거리, 경사·문턱 및 차량 접근 가능 여부'],
  ['계단·경사·문턱과 휠체어 이동',['stairs','slope','threshold','wheelchair','elevator'],'계단 없는 대체 동선, 경사와 문턱, 문 폭 또는 승강기, 입구에서 관람 지점까지 보행 거리'],
  ['화장실과 쉴 곳',['toilet','rest'],'휠체어 이용 화장실, 앉아 쉴 곳의 위치와 이용 가능 여부']
 ];
 const chosen=Array.isArray(s.chosen)?s.chosen:[];
 const picked=chosen.includes(id);
 const assessment=hbEvaluatePlace(place,{
  walk:s.hbWalkConfirmed?s.walk:null,stairsMode:s.hbStairsChoice,needs:s.momNeeds,
  slopePreference:s.hbSlopePreference,indoorPreference:s.hbIndoorPreference,mobilityAid:s.hbMobilityAid
 });
 const regionAllowed=!selectedRich||hbRichMatchesRegion(selectedRich,s.region);
 const canPick=picked||regionAllowed&&assessment.status!=='excluded';
 const other=facts.filter(fact=>!hbDetailTopics(fact).some(topic=>specs.some(([,topics])=>topics.includes(topic))));
 el.innerHTML=back+'<span class="chip">'+hbPlaceCategory(place)+'</span><h1>'+safe(place.name)+'</h1>'+
  '<p>'+safe(place.address||'주소 미확인')+'</p>'+
  '<div class="actions">'+
  (canPick?'<button type="button" id="pick" aria-pressed="'+picked+'">'+(picked?'선택 취소':'일정에 담기')+'</button>':'')+'</div>'+
  '<p id="hb-detail-selection" role="status"></p>'+
  (!regionAllowed?'<p class="warn">현재 일정 작성은 선택한 서울·경기 지역에서 지원해요. 다른 지역은 상세정보를 살펴볼 수 있어요.</p>':'')+
  hbArrivalMarkup(place,guide,facts)+
  (assessment.status==='excluded'?'<p class="warn">선택한 계단 이용 조건과 검증된 이동 동선이 충돌해요.</p>':
   assessment.conflict?'<p class="warn">출처의 설명이 달라요. 방문 전에 직접 확인해 주세요.</p>':'')+
  specs.map(([title,topics,check])=>{
   const related=facts.filter(fact=>hbDetailTopics(fact).some(topic=>topics.includes(topic)));
   if(!related.length)return '';
   return '<details class="panel hb-detail-evidence"><summary><strong>'+title+'</strong></summary>'+
    related.map(renderFact).join('')+
    '<p class="muted">방문 전 확인: '+check+'</p></details>';
  }).join('')+
  panel('정보 출처',(place.matched?'<p>장소와 편의시설 정보는 공공 관광 자료를 바탕으로 제공돼요.</p>':'')+
   (other.length?other.map(renderFact).join(''):facts.length?'<p>자료별 출처와 확인 범위는 각 항목에서 확인할 수 있어요.</p>':'<p>현재 제공된 편의시설 상세 자료가 없어요.</p>'));
 hbBindAccessMap(guide);
 if(typeof window!=='undefined'&&window.HBRichPlaceDetail)hbRichDetailAttach(place,Boolean(selectedRich));
 const pick=document.getElementById('pick');
 if(pick)pick.onclick=()=>{
  if(!picked&&selectedRich&&regionAllowed)hbRememberNearbyPlace(selectedRich);
  s.chosen=picked?chosen.filter(value=>value!==id):[...chosen,id];
  save();
  detail(id);
  (document.getElementById('pick')||document.getElementById('hb-detail-back'))?.focus();
  document.getElementById('hb-detail-selection').textContent=picked?'일정에서 선택을 취소했어요.':'일정에 장소를 담았어요.';
 };
}
// RPL-01: legacy and PLAN-01 status aliases have the same protected meaning.
function hbCompleted(stop){return !!(stop&&(stop.done||stop.completed))}
function hbMustVisit(stop){return !!(stop&&(stop.must||stop.mustVisit))}
function hbReserved(stop){return !!(stop&&(stop.reserved||stop.booked))}
function hbProtected(stop){return hbCompleted(stop)||hbMustVisit(stop)||hbReserved(stop)}
function hbValidReplanStops(items){
 return Array.isArray(items)&&items.every(stop=>stop&&typeof stop==='object'&&!Array.isArray(stop));
}
function hbPlanContext(state){return {region:state.hbPlanInfo?.region||state.region,date:state.hbPlanInfo?.date||state.date}}
function hbTripSignature(state){
 const {region,date}=hbPlanContext(state);
 return JSON.stringify([region,date,Array.isArray(state.stops)?state.stops:[]]);
}
function hbSavedTripMatches(signature){
 try{
  const stored=localStorage.getItem(KEY);
  return stored===null||hbTripSignature(JSON.parse(stored))===signature;
 }catch{return false}
}
function hbSaveTripStops(stops,undo=null){
 if(!hbValidReplanStops(stops))return false;
 const previous=s;
 s={...s,stops,hbReplanUndo:undo};
 try{save();return true}catch{s=previous;return false}
}
function hbNextStop(items){return hbValidReplanStops(items)?items.findIndex(stop=>!hbCompleted(stop)):-1}
function hbProposal(level,items,all=[]){
 if(!hbValidReplanStops(items)||!['low','mid','high'].includes(level))throw Error('invalid');
 const catalog=Array.isArray(all)?all:[];
 const optional=items.map((v,i)=>({v,i})).filter(({v})=>{
  const kind=v.kind||(catalog.find(p=>p&&p.id===(v.placeId||v.id))||{}).kind;
  return !hbProtected(v)&&!v.isRestCandidate&&!v.isPlaceholder&&kind!=='food'&&kind!=='rest';
 });
 const count=level==='low'?0:level==='mid'?Math.ceil(optional.length/2):optional.length;
 const removedIndices=new Set((count?optional.slice(-count):[]).map(entry=>entry.i));
 return {kept:items.filter((_,i)=>!removedIndices.has(i)),removed:items.filter((_,i)=>removedIndices.has(i)),protected:items.filter(hbProtected)};
}
function hbReplanAlternatives(level,items,catalog){
 if(!['mid','high'].includes(level)||!hbValidReplanStops(items)||!Array.isArray(catalog))return [];
 const locations=new Map(catalog.filter(place=>place&&place.id).map(place=>[place.id,place]));
 const coordinates=stop=>stop&&!stop.isPlaceholder?
  hbMapCoordinates(stop.coordinates)||hbMapCoordinates(locations.get(stop.placeId||stop.id)):null;
 const lastCompleted=items.findLast(stop=>hbCompleted(stop)&&coordinates(stop));
 const next=items.find(stop=>!hbCompleted(stop)&&coordinates(stop));
 const origin=coordinates(lastCompleted||next);
 if(!origin)return [];
 const scheduled=new Set(items.map(stop=>stop.placeId||stop.id));
 const radians=Math.PI/180;
 function nearby(point){
  const dy=(point.lat-origin.lat)*radians,dx=(point.lng-origin.lng)*radians;
  const halfArc=Math.sin(dy/2)**2+Math.cos(origin.lat*radians)*Math.cos(point.lat*radians)*Math.sin(dx/2)**2;
  return 12742*Math.asin(Math.min(1,Math.sqrt(halfArc)));
 }
 return catalog.flatMap(place=>{
  if(!place||scheduled.has(place.id)||!place.id||!place.name||['conflicting','stale'].includes(place.accessStatus))return [];
  const point=hbMapCoordinates(place);
  if(!point)return [];
  const km=nearby(point);
  if(km>2)return [];
  const guide=hbDetailAccessGuide(place);
  const localFacts=Array.isArray(guide?.facts)?guide.facts.filter(f=>f&&typeof f==='object'):[];
  const facts=[...localFacts,...hbAccessFacts(place)];
  const relevant=['rest','wheelchair','stairs','threshold','elevator','entrance','distance'];
  const blocked=facts.some(fact=>hbDetailTopics(fact).some(topic=>relevant.includes(topic))&&
   ['conflicting','stale','verified_no'].includes(fact.status));
  if(blocked||place.mobilityAssessment?.stairsRequired===true)return [];
  const rest=facts.find(fact=>(localFacts.includes(fact)&&fact.status==='source_reported'||
   hbEvidenceStatus(fact)==='이용 가능 확인')&&hbDetailTopics(fact).includes('rest')&&hbEvidenceSourceLink(fact.sourceUrl));
  const mobility=place.mobilityAssessment;
  const documentedWalk=hbScopedMobility(mobility)&&mobility.stairsRequired===false&&
   Number.isFinite(mobility.walkMinutes)&&mobility.walkMinutes>=0;
  // A step-free segment is not automatically an accessible place to rest.
  if(!rest&&(level==='high'||!documentedWalk))return [];
  const note=[rest?.description,documentedWalk?'자료상 확인된 계단 없는 구간: '+mobility.scope+' (도보 '+mobility.walkMinutes+'분)':null]
   .filter(Boolean).join(' ');
  return [{place,point,km,rest:Boolean(rest),note,source:rest?hbEvidenceSourceLink(rest.sourceUrl):null}];
 }).sort((a,b)=>a.km-b.km).slice(0,3);
}
function hbReplanResult(items,proposal,alternative){
 if(!hbValidReplanStops(items)||!proposal||!Array.isArray(proposal.removed))throw Error('invalid');
 const firstRemoved=proposal.removed[0];
 const dropped=new Set(proposal.removed);
 const place=alternative?.place;
 const choose=place&&place.id&&alternative.point&&firstRemoved&&!hbProtected(firstRemoved)&&
  !items.some(stop=>(stop.placeId||stop.id)===place.id);
 return items.flatMap(stop=>{
  if(hbProtected(stop)||!dropped.has(stop))return [stop];
  if(!choose||stop!==firstRemoved)return [];
  const {point,rest}=alternative;
  return [{
   id:place.id,placeId:place.id,name:place.name,address:place.address||null,coordinates:point,
   kind:rest?'rest':place.kind||'spot',isRestCandidate:!!rest,isPlaceholder:false,
   time:stop.time,plannedArrival:stop.plannedArrival||stop.time,stayMinutes:stop.stayMinutes,
   restMinutes:rest?stop.stayMinutes:0,travelTimeStatus:'unknown',transitionBufferMinutes:stop.transitionBufferMinutes,
   done:false,completed:false,must:false,mustVisit:false,reserved:false,booked:false
  }];
 }).map((stop,index)=>({...stop,position:index+1}));
}
// The map's itinerary list uses the same applied result as the side-by-side comparison.
// Removed originals are an explicitly labeled overlay, never proposed visits.
function hbReplanMapStops(items,proposal,result,alternative){
 const alternativeId=alternative?.place?.id;
 return [
  ...result.map((stop,index)=>{
   const inserted=alternativeId&&stop.id===alternativeId;
   const status=inserted?(alternative.rest?'휴식 후보':'대체 후보'):'유지';
   return {...stop,mapLabel:status+' '+(index+1),
    mapNote:inserted?'변경 후 일정에 추가할 '+status+'예요. 이동시간·당일 운영·현장 접근은 확인이 필요해요.':
     '변경 후 일정에 유지되는 방문지예요.'};
  }),
  ...proposal.removed.map(stop=>({...stop,mapLabel:'제외',
   mapNote:'원래 일정의 방문지예요. 변경안을 적용하면 일정에서 제외돼요.'}))
 ];
}
function hbReplanPreservesProtected(before,after){
 if(!hbValidReplanStops(before)||!hbValidReplanStops(after))return false;
 let last=-1;
 for(const stop of before.filter(hbProtected)){
  const index=after.findIndex((candidate,i)=>i>last&&
   (candidate.placeId||candidate.id)===(stop.placeId||stop.id));
  if(index<0)return false;
  const oldFields={...stop},newFields={...after[index]};
  delete oldFields.position;delete newFields.position;
  if(JSON.stringify(oldFields)!==JSON.stringify(newFields))return false;
  last=index;
 }
 return true;
}
function hbApplyReplan(signature,items,proposal,alternative){
 if(!hbValidReplanStops(items)||!proposal||!Array.isArray(proposal.removed)||
  hbTripSignature(s)!==signature||!hbSavedTripMatches(signature))
  return {ok:false,error:'다른 탭에서 일정이 바뀌었거나 상태가 올바르지 않아요. 새로고침 후 확인해 주세요.'};
 if(proposal.removed.some(hbProtected))return {ok:false,error:'보호된 일정은 제외할 수 없어요.'};
 let now;
 try{now=hbReplanResult(items,proposal,alternative)}catch{return {ok:false,error:'변경안을 확인할 수 없어요.'}}
 if(!hbReplanPreservesProtected(items,now))return {ok:false,error:'완료·필수·예약 일정이 변경되어 적용하지 않았어요.'};
 const {region,date}=hbPlanContext(s);
 if(JSON.stringify(items)===JSON.stringify(now))return {ok:false,error:'변경되는 일정이 없어요. 원안을 유지했어요.'};
 const undo={before:items.map(stop=>({...stop})),after:JSON.stringify(now),region,date,appliedAt:new Date().toISOString()};
 if(!hbSaveTripStops(now,undo))return {ok:false,error:'저장에 실패해 기존 일정을 유지했어요.'};
 return {ok:true,stops:now};
}
function hbUndoReplan(){
 const undo=s.hbReplanUndo;
 const {region,date}=hbPlanContext(s);
 if(!undo||undo.region!==region||undo.date!==date||!hbValidReplanStops(undo.before)||
  !hbValidReplanStops(s.stops)||undo.after!==JSON.stringify(s.stops)||
  !hbSavedTripMatches(hbTripSignature(s)))
  return {ok:false,error:'다른 변경이 있어 자동 복구할 수 없어요. 새로고침하고 일정을 확인해 주세요.'};
 if(!hbSaveTripStops(undo.before.map(stop=>({...stop}))))
  return {ok:false,error:'되돌린 일정을 저장하지 못했어요.'};
 return {ok:true};
}

let hbRefreshTravelConditionMap=null;
function plan(){
 const stops=Array.isArray(s.stops)?s.stops:[];
 const {region,date}=hbPlanContext(s);
 const undo=s.hbReplanUndo&&hbValidReplanStops(s.hbReplanUndo.before)&&s.hbReplanUndo.date===date&&s.hbReplanUndo.region===region&&s.hbReplanUndo.after===JSON.stringify(stops);
 hbDropPlanMap();
 el.innerHTML='<h1>가족 여행 일정</h1><p>'+safe(region)+' · '+safe(date)+'</p><div id="hb-plan-map-slot"></div>'+(typeof weatherCard==='function'?weatherCard(region,date):'')+'<p class="warn">이동시간·실제 보행거리·운영시간은 확인 전이에요. 현재 방문 시간은 임시 계획이에요.</p>'+(stops.length?stops.map((x,i)=>'<article class="panel hb-itinerary-row" data-hb-stop-kind="'+safe(['food','rest','spot','travel','move','transport'].includes(x.kind)?x.kind:'unknown')+'"><div><h3>'+safe(x.time||'시간 미정')+' · '+safe(x.name||'장소명 미확인')+'</h3><p class="muted">교통편 및 체류시간 별도 확인</p></div><div class="hb-itinerary-flags"><label><input type="checkbox" data-done="'+i+'" '+(hbCompleted(x)?'checked':'')+'> 완료</label><label><input type="checkbox" data-must="'+i+'" '+(hbMustVisit(x)?'checked':'')+'> 필수</label><label><input type="checkbox" data-reserved="'+i+'" '+(x.reserved||x.booked?'checked':'')+'> 예약됨</label><button type="button" class="light" data-remove="'+i+'" '+(hbProtected(x)?'disabled':'')+'>삭제</button></div></article>').join(''):panel('일정이 비어 있어요','추천 장소를 먼저 담아 주세요.'))+(undo?panel('최근 일정 변경','<p>부모님 컨디션에 따라 이 기기에서 수정한 일정이에요.</p><button type="button" class="light" id="hb-rpl-undo">이전 일정 되돌리기</button>'):'')+'<div class="actions">'+button('add','장소 더 담기',true)+button('fatigue','컨디션에 맞게 일정 조정')+button('share','가족에게 공유')+'</div>';
 document.getElementById('add').onclick=()=>go('/places');document.getElementById('fatigue').onclick=()=>go('/travel');document.getElementById('share').onclick=()=>go('/share/create');
 document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{let i=+b.dataset.remove;if(hbProtected(s.stops[i]))return;
  const stops=s.stops.filter((_,index)=>index!==i).map((stop,index)=>({...stop,position:index+1}));
  if(!hbSaveTripStops(stops)){alert('일정을 저장하지 못했어요. 기존 일정을 유지했어요.');return}
  plan()});
 ['done','must','reserved'].forEach(k=>document.querySelectorAll('[data-'+k+']').forEach(b=>b.onchange=()=>{const index=+b.dataset[k];
  if(!s.stops[index])return;
  const stops=s.stops.map((stop,i)=>i===index?{...stop,[k]:b.checked,...(k==='reserved'?{booked:b.checked}:k==='done'?{completed:b.checked}:{mustVisit:b.checked})}:stop);
  if(!hbSaveTripStops(stops)){b.checked=!b.checked;alert('보호 표시를 저장하지 못했어요.');return}
  plan();
  el.querySelector('[data-'+k+'="'+index+'"]')?.focus()}));
 if(undo)document.getElementById('hb-rpl-undo').onclick=()=>{
  if(!confirm('컨디션 조정 전 일정으로 되돌릴까요?'))return;
  const result=hbUndoReplan();
  if(!result.ok){alert(result.error);return}
  plan();
  document.getElementById('fatigue')?.focus();
 };
}
function travel(){
 hbDropPlanMap();
 hbRefreshTravelConditionMap=null;
 const items=Array.isArray(s.stops)?s.stops:[],nextIndex=hbNextStop(items),next=items[nextIndex];
 const signature=hbTripSignature(s);
 const mapQuery=next&&!next.isPlaceholder&&(next.address||next.placeId||places.some(place=>place.id===next.id))?
  [next.name,next.address].filter(Boolean).join(' '):null;
 const nextCard=next?panel('다음 일정',
  '<h3 id="hb-travel-next" tabindex="-1">'+safe(next.name||'장소명 미확인')+'</h3>'+
  '<p>예정 시간: '+safe(next.plannedArrival||next.time||'미정')+'</p>'+
  (next.address?'<p>'+safe(next.address)+'</p>':'<p class="muted">주소 미확인</p>')+
  '<p class="muted">현재 위치 및 이동시간은 확인되지 않았어요.</p>'+
  '<div class="actions">'+(mapQuery?'<a target="_blank" rel="noopener noreferrer" href="https://map.naver.com/p/search/'+encodeURIComponent(mapQuery)+'">지도에서 장소 찾기</a>':'')+
  button('hb-travel-complete','이 일정 완료 표시')+'</div>'
 ):panel(items.length?'여행 일정을 모두 마쳤어요':'다음 일정 없음',
  '<p id="hb-travel-next" tabindex="-1">'+(items.length?'일정표에서 지나온 일정을 다시 볼 수 있어요.':'먼저 여행 장소를 일정에 담아 주세요.')+'</p>'
 );
 const canReplan=Boolean(next);
 el.innerHTML='<h1>여행 중 안내</h1>'+nextCard+(items.length?'<div id="hb-travel-condition-map"></div>':'')+'<p id="hb-travel-status" role="status"></p>'+
  '<div class="actions">'+button('hb-travel-plan','일정표로 돌아가기',true)+'</div>'+
  (canReplan?'<h2>컨디션에 따라 일정 조절</h2>'+panel('지금 컨디션을 선택해 주세요',
   '<div class="hb-fatigue-buttons"><button type="button" data-hb-fatigue="low" aria-pressed="false">괜찮아요</button><button type="button" data-hb-fatigue="mid" aria-pressed="false">조금 힘들어요</button><button type="button" data-hb-fatigue="high" aria-pressed="false">많이 힘들어요</button></div><div id="hb-replan-preview" aria-live="polite"></div>'
  ):items.length?'':button('hb-go-pick','장소 선택하기'));
 document.getElementById('hb-travel-plan').onclick=()=>go('/plan');
 if(!items.length){document.getElementById('hb-go-pick').onclick=()=>go('/places');return}
 const mapSlot=document.getElementById('hb-travel-condition-map');
 const catalog=()=>hbPlacesLoadedRegion===hbPlanContext(s).region?places:[];
 let level=null;
 const showMap=(stops=items,options={})=>hbRenderItineraryMap(mapSlot,stops,catalog(),{title:'여행 중 일정 지도',...options});
 hbRefreshTravelConditionMap=()=>{if(level)preview(level);else showMap()};
 showMap();
 if(!canReplan)return;
 document.getElementById('hb-travel-complete').onclick=()=>{
  const status=document.getElementById('hb-travel-status');
  if(hbTripSignature(s)!==signature||!hbSavedTripMatches(signature)){
   status.textContent='다른 탭에서 일정이 바뀌었어요. 새로고침하고 다음 일정을 확인해 주세요.';return;
  }
  const stops=items.map((stop,index)=>index===nextIndex?{...stop,done:true,completed:true}:stop);
  if(!hbSaveTripStops(stops)){status.textContent='완료 상태를 저장하지 못했어요. 다시 시도해 주세요.';return}
  travel();
  document.getElementById('hb-travel-next')?.focus();
  document.getElementById('hb-travel-status').textContent=(next.name||'일정')+' 완료를 이 기기에 저장했어요.';
 };
 function preview(nextLevel){
  level=nextLevel;
  const {region,date}=hbPlanContext(s);
  const proposal=hbProposal(level,items,catalog());
  const alternatives=proposal.removed.length?hbReplanAlternatives(level,items,catalog()):[];
  const compare=document.getElementById('hb-replan-preview');
  const showList=stops=>stops.length?'<ul>'+stops.map(stop=>'<li>'+safe(stop.time||'시간 미정')+' · '+
   safe(stop.name||'장소명 미확인')+(hbProtected(stop)?' <span class="hb-protected">보호: '+
   [hbCompleted(stop)?'완료':null,hbMustVisit(stop)?'필수':null,hbReserved(stop)?'예약':null].filter(Boolean).join('/')+'</span>':'')+'</li>').join('')+'</ul>':
   '<p class="muted">해당 장소 없음</p>';
  let selected=-1;
  compare.innerHTML='<section class="hb-rpl-card"><h3>변경안 미리보기</h3>'+
   '<div class="hb-replan-compare"><div><h3>기존 일정</h3>'+showList(items)+'</div>'+
   '<div><h3>변경 후 일정</h3><div data-replan-result></div><h3>제외 제안</h3>'+showList(proposal.removed)+'</div></div>'+
   (alternatives.length?'<fieldset><legend>변경 방법</legend><label><input type="radio" name="hb-replan-choice" value="-1" checked> 방문 줄이기</label>'+
    alternatives.map(({place,rest,km,note,source},index)=>'<p><label><input type="radio" name="hb-replan-choice" value="'+index+'"> <strong>'+
     safe(place.name)+'</strong>로 교체 · '+(rest?'휴식 공간 안내 있음':'계단 없는 구간 확인')+
     ' · 직선거리 약 '+km.toFixed(1)+'km (실제 이동거리 미확인)</label><br>'+safe(note)+
     (source?' <a href="'+safe(source)+'" target="_blank" rel="noopener noreferrer">출처</a>':'')+'</p>').join('')+'</fieldset>':
    level!=='low'&&proposal.removed.length?'<p>확인된 대안 없음. 방문을 줄이거나 쉬기·숙소 복귀·귀가를 검토해 주세요.</p>':'')+
   '<p class="warn">완료·필수·예약 일정은 보호돼요. 대안까지의 이동시간과 당일 운영 여부는 방문 전 확인해 주세요.</p>'+
   '<div class="actions"><button type="button" class="light" id="hb-rpl-cancel">취소</button>'+
   (proposal.removed.length?'<button type="button" id="hb-rpl-confirm">이 변경안 적용</button>':'<p>현재 일정을 유지해요.</p>')+
   '</div></section>';
  const result=()=>hbReplanResult(items,proposal,alternatives[selected]);
  const update=()=>{
   const proposed=result();
   compare.querySelector('[data-replan-result]').innerHTML=showList(proposed);
   for(const input of compare.querySelectorAll('[name="hb-replan-choice"]'))input.checked=Number(input.value)===selected;
   hbDropPlanMap();
   showMap(hbReplanMapStops(items,proposal,proposed,alternatives[selected]),{
    title:'변경안 지도 · 적용 전 미리보기'
   });
  };
  for(const input of compare.querySelectorAll('[name="hb-replan-choice"]'))input.onchange=()=>{
   selected=Number(input.value);update();
  };
  update();
  document.getElementById('hb-rpl-cancel').onclick=()=>{
   level=null;
   compare.innerHTML='';
   const active=el.querySelector('[data-hb-fatigue][aria-pressed="true"]');
   active?.setAttribute('aria-pressed','false');
   hbDropPlanMap();
   showMap();
   active?.focus();
  };
  const apply=document.getElementById('hb-rpl-confirm');if(!apply)return;
  apply.onclick=()=>{
   const outcome=hbApplyReplan(signature,items,proposal,alternatives[selected]);
   if(!outcome.ok){
    document.getElementById('hb-travel-status').textContent=outcome.error;
    return;
   }
   go('/plan');
  };
 }
 document.querySelectorAll('[data-hb-fatigue]').forEach(button=>button.onclick=()=>{
  document.querySelectorAll('[data-hb-fatigue]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));
  preview(button.dataset.hbFatigue);
 });
}
function hbClock(n){const h=Math.floor(n/60),m=n%60;return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')}
function hbMapCoordinates(location){
 if(!location||location.lat==null||location.lng==null)return null;
 const {lat,lng}=location;
 if(![lat,lng].every(value=>typeof value==='number'||typeof value==='string'&&value.trim()))return null;
 const pair={lat:Number(lat),lng:Number(lng)};
 return Number.isFinite(pair.lat)&&Math.abs(pair.lat)<=90&&Number.isFinite(pair.lng)&&Math.abs(pair.lng)<=180&&
  (pair.lat!==0||pair.lng!==0)?pair:null;
}
function hbCreateSchedule(ids, all, opt={}){
 const errors=[],warnings=[],unique=[];
 for(const id of ids||[]){if(!unique.includes(id))unique.push(id)}
 const selected=unique.map(id=>all.find(p=>p.id===id));
 if(selected.some(x=>!x)){errors.push('선택한 장소 중 최신 목록에서 찾을 수 없는 곳이 있어요.');return {stops:[],errors,warnings}}
 const sights=selected.filter(p=>p.kind!=='food'),foods=selected.filter(p=>p.kind==='food');
 if(!sights.length)errors.push('관광지·문화시설을 최소 한 곳 선택해 주세요.');
 if(sights.length>2)errors.push('하루 초안에는 관광지·문화시설을 최대 2곳까지 넣을 수 있어요. 선택을 줄여 주세요.');
 if(foods.length>1)errors.push('식당은 한 곳만 선택해 주세요.');
 // Apply rest preference to draft sight dwell only; actual walking/travel is unverified.
 const restInterval=[30,45,60].includes(Number(opt.restIntervalMinutes))?Number(opt.restIntervalMinutes):null;
 const sightStay=restInterval??60;
 const autoStart=opt.start==null||opt.start==='',autoEnd=opt.end==null||opt.end==='';
 const limit=autoEnd?1439:hbDraftMinute(opt.end);
 const start=autoStart?600:hbDraftMinute(opt.start);
 if(start===null||limit===null||!autoStart&&start>=limit)errors.push('종료 시간은 시작보다 늦어야 해요. 날짜가 바뀌는 일정은 아직 지원하지 않아요.');
 if(errors.length)return {stops:[],errors,warnings};
 if(autoStart){
  for(const n of [600,540,480,420,360,300,240,180,120,60,0].filter(n=>n<limit)){
   const candidate=hbCreateSchedule(ids,all,{...opt,start:hbClock(n)});
   if(!candidate.errors.length){
    candidate.summary.windowStart=null;
    candidate.warnings.unshift('시작 시간을 정하지 않아 '+hbClock(n)+' 시작 초안을 제안했어요. 실제 출발 위치·영업시간은 확인이 필요해요.');
    return candidate;
   }
  }
  return {stops:[],errors:['선택한 종료 희망 시간까지 일정을 구성하기 어려워요. 장소를 줄이거나 시간을 조정해 주세요.'],warnings};
 }
 let now=start;const result=[];
 const append=(kind,place,duration,name,travelGap,meta={})=>{
  if(travelGap)now+=travelGap;
  const index=result.length;
  result.push({id:place?.id||kind+'-draft-'+index,placeId:place?.id||null,kind,name:place?.name||name,address:place?.address||null,coordinates:hbMapCoordinates(place),time:hbClock(now),plannedArrival:hbClock(now),stayMinutes:duration,restMinutes:kind==='rest'?duration:0,transitionBufferMinutes:travelGap||0,travelTimeStatus:travelGap?'unknown':'not_applicable',isRestCandidate:kind==='rest',isPlaceholder:!place,position:index+1,done:false,must:false,reserved:false,booked:false,...meta});
  now+=duration
 };
 append(sights[0].kind||'spot',sights[0],sightStay,'',0);
 append('rest',null,20,'휴식 시간 (장소 미정)',0);
 const afterMeal=sights[1]?25+sightStay+15:0;
 const lunchStart=Math.max(now,705)+25;
 const includeMeal=foods.length>0||(start<780&&now>=570&&lunchStart+60+afterMeal<=limit);
 if(includeMeal){
  if(now>=570&&now<705)now=705;
  const mealLabel=now+25>=1020?'저녁 식사 (식당 미정)':now+25<660?'아침 식사 (식당 미정)':'점심 식사 (식당 미정)';
  append('food',foods[0]||null,60,mealLabel,25);
 }
 if(sights[1]){append(sights[1].kind||'spot',sights[1],sightStay,'',25);append('rest',null,15,'휴식 시간 (장소 미정)',0)}
 if(now>limit){errors.push('선택한 종료 희망 시간 '+hbClock(limit)+' 안에 일정이 들어가지 않아요. 시간을 늘리거나 장소를 줄여 주세요.');return {stops:[],errors,warnings}}
 if(restInterval)warnings.push('요청한 휴식 간격 '+restInterval+'분에 맞춰 관광지 체류시간 초안을 '+sightStay+'분으로 조정하고 방문 뒤 휴식을 배치했어요. 방문지 안에서 필요한 휴식과 실제 이동·보행시간은 계산하지 않았어요.');
 else if(opt.restIntervalMinutes!=null&&opt.restIntervalMinutes!=='')warnings.push('저장된 휴식 간격을 확인할 수 없어 기본 관광지 체류시간 60분으로 구성했어요. 조건을 다시 확인해 주세요.');
 if(opt.slopePreference==='avoid_steep')warnings.push('경사 회피 선호가 있지만 실제 경사·계단 없는 동선이 검증되지 않았어요. 방문 전 확인이 필요해요.');
 if(['indoor','outdoor'].includes(opt.indoorPreference))warnings.push('실내외 선호를 선택했지만 장소·이동 구간의 실내외 상태는 검증되지 않았어요.');
 warnings.push('장소 간 이동은 실제 경로 소요시간이 아니라 임시 여유 시간 25분으로 배치했어요. 실제 이동·보행시간은 미확인입니다.');
 warnings.push('모든 방문지의 영업시간·시설 운영·예약 가능 여부는 확인 전이에요.');
 warnings.push('휴식 블록은 휴식 장소가 지정된 상태가 아니에요.');
 if(!foods.length&&includeMeal)warnings.push('식당을 선택하지 않아 식사 블록을 임시로 만들었어요.');
 if(!includeMeal)warnings.push('선택한 시간대에는 식사 블록을 자동으로 넣지 않았어요. 필요하면 식당을 직접 선택해 주세요.');
 if(opt.tripType==='overnight')warnings.push('현재는 숙박 여행이라도 첫날 일정 초안만 생성해요.');
 return {stops:result,errors,warnings,summary:{start:hbClock(start),end:hbClock(now),windowStart:hbClock(start),windowEnd:autoEnd?null:hbClock(limit),sightCount:sights.length,foodSelected:!!foods.length}}
}
// Compare schedules against verified regional hourly slots, not safety or opening hours.
function hbWeatherTimeCandidates(ids,all,opt,snapshot,key,now=Date.now()){
 if(!snapshot||snapshot.key!==key||snapshot.state!=='available'||snapshot.alerts?.status==='active'||
    !Array.isArray(snapshot.data?.hourly))return [];
 let region,date;try{[region,date]=JSON.parse(key);}catch{return [];}
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(now))return [];
 const hours=new Map(), day=Date.parse(date+'T00:00:00+09:00');
 for(const slot of snapshot.data.hourly){
  if(typeof slot.at!=='string'||!slot.at.startsWith(date+'T')||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):00:00\+09:00$/.test(slot.at))continue;
  const minute=hbDraftMinute(slot.at.slice(11,16));
  if(hours.has(minute))return [];
  const pop=slot.precipitationProbabilityPercent,temp=slot.temperatureC;
  if(!Number.isFinite(pop)||pop<0||pop>100||!Number.isFinite(temp)||!['없음','비','비 또는 눈','눈','소나기'].includes(slot.precipitationType))continue;
  hours.set(minute,slot);
 }
 const fixed=opt.start!=null&&opt.start!=='';
 const starts=fixed?[hbDraftMinute(opt.start)]:Array.from(hours.keys());
 const candidates=[];
 for(const minute of starts){
  if(minute===null||day+minute*60000<now)continue;
  const draft=hbCreateSchedule(ids,all,{...opt,start:hbClock(minute)});
  if(draft.errors.length)continue;
  const end=hbDraftMinute(draft.summary.end),covered=[];
  for(let t=Math.floor(minute/60)*60;t<end;t+=60){
   const slot=hours.get(t);
   if(!slot){covered.length=0;break;}
   covered.push(slot);
  }
  if(!covered.length)continue;
  const wet=covered.filter(v=>v.precipitationType!=='없음'||v.precipitationProbabilityPercent>=60).length;
  const tempBurden=covered.filter(v=>v.temperatureC>=30||v.temperatureC<=-5).length;
  const maxPop=Math.max(...covered.map(v=>v.precipitationProbabilityPercent));
  candidates.push({start:draft.summary.start,end:draft.summary.end,wetHours:wet,temperatureBurdenHours:tempBurden,maxPop,
   score:wet*100+tempBurden*100+maxPop,draft});
 }
 candidates.sort((a,b)=>a.score-b.score||Math.abs(hbDraftMinute(a.start)-600)-Math.abs(hbDraftMinute(b.start)-600)||a.start.localeCompare(b.start));
 const result=[],bands=new Set();
 for(const c of candidates){
  const band=Math.floor(hbDraftMinute(c.start)/180);
  if(bands.has(band))continue;
  result.push(c);bands.add(band);if(result.length===3)break;
 }
 return result;
}
/** Fully client-side draft editor; authoritative server editing comes later. */
function hbDraftMinute(time){
 const m=/^([0-2]\d):([0-5]\d)$/.exec(String(time||''));
 if(!m)return null;
 const n=Number(m[1])*60+Number(m[2]);return n<1440?n:null;
}
function hbEditDraftStop(items,index,action,value,window={}){
 const fail=message=>({ok:false,error:message,stops:items});
 if(!Array.isArray(items)||!Number.isInteger(index)||index<0||index>=items.length)return fail('수정할 일정을 찾을 수 없어요.');
 const draft=items.map(v=>({...v})),locked=x=>!!(x&&(x.done||x.must||x.reserved||x.booked));
 if(locked(draft[index]))return fail('완료·필수·예약 일정은 보호 중이에요. 수정하려면 보호 표시를 직접 해제해 주세요.');
 let focusIndex=index;
 if(action==='arrival'){
  const minute=hbDraftMinute(value);
  if(minute===null)return fail('도착 시간은 24시간 형식으로 입력해 주세요.');
  draft[index].time=hbClock(minute);
  draft[index].plannedArrival=hbClock(minute);
 }else if(action==='duration'){
  const n=Number(value);
  if(!Number.isInteger(n)||n<5||n>240)return fail('체류·휴식 시간은 5~240분 사이의 정수로 입력해 주세요.');
  draft[index].stayMinutes=n;
  if(draft[index].kind==='rest')draft[index].restMinutes=n;
 }else if(action==='up'||action==='down'){
  const other=index+(action==='up'?-1:1);
  if(other<0||other>=draft.length)return fail('더 이상 이동할 수 없어요.');
  if(locked(draft[other]))return fail('완료·필수·예약 표시가 있는 일정과 순서를 바꿀 수 없어요.');
  // Swap places, not their time slots. The original slots and unknown travel
  // buffers remain explicit; a swap which causes overlap is rejected.
  const slots=draft.map(x=>({time:x.time,plannedArrival:x.plannedArrival,transitionBufferMinutes:x.transitionBufferMinutes,travelTimeStatus:x.travelTimeStatus}));
  [draft[index],draft[other]]=[draft[other],draft[index]];
  draft.forEach((stop,i)=>Object.assign(stop,slots[i]));
  // A swap invalidates all previously confirmed origin/destination pairings.
  for(const stop of draft)if(stop.travelTimeStatus==='estimated'||stop.travelFromId){
   stop.transitionBufferMinutes=25;stop.travelTimeStatus='unknown';
   delete stop.travelTimeMinutes;delete stop.travelSource;delete stop.travelCheckedAt;
   delete stop.travelFromId;delete stop.travelToId;
  }
  focusIndex=other;
 }else return fail('지원하지 않는 일정 편집 동작이에요.');
 for(let i=0;i<draft.length;i++){
  const stop=draft[i],start=hbDraftMinute(stop.plannedArrival||stop.time),duration=Number(stop.stayMinutes);
  const lower=hbDraftMinute(window.windowStart)??0,upper=hbDraftMinute(window.windowEnd)??1439;
  if(start===null||start<lower||start>upper)return fail('방문 시간이 여행 시작·종료 희망 범위를 벗어나요.');
  if(!Number.isInteger(duration)||duration<=0||duration>240||start+duration>upper)return fail('체류시간이 종료 희망 시간을 넘거나 유효하지 않아요.');
  const buffer=Number(stop.transitionBufferMinutes||0);
  if(!Number.isFinite(buffer)||buffer<0)return fail('이동 여유 시간이 유효하지 않아요.');
  if(i){
   const before=draft[i-1],prevStart=hbDraftMinute(before.plannedArrival||before.time);
   if(prevStart+Number(before.stayMinutes)+buffer>start)
    return fail('앞 일정의 체류시간과 임시 이동 여유가 다음 일정과 겹쳐요. 시간을 다시 조정해 주세요.');
  }
  stop.position=i+1;
 }
 return {ok:true,stops:draft,focusIndex};
}

// MVP-11 / PLAN-03: bounded, read-only Directions preview; never mutate saved state here.
function hbPlanTravelEdges(items){
 const visits=(Array.isArray(items)?items:[]).flatMap((stop,index)=>{
  const id=stop?.placeId;
  return !stop?.isPlaceholder&&typeof id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(id)?[{id,index}]:[];
 });
 return visits.slice(1).map((to,i)=>({
  from:visits[i].id,to:to.id,fromIndex:visits[i].index,toIndex:to.index,
  status:'unknown',minutes:null
 }));
}
function hbPlanTravelBatches(items){
 const edges=hbPlanTravelEdges(items),batches=[];
 // /api/travel-times accepts only 2–3 distinct IDs. Bound total requests to 4.
 for(let i=0;i<edges.length&&batches.length<4;){
  const first=edges[i],second=edges[i+1];
  if(first.from===first.to){i++;continue}
  if(second&&first.to===second.from&&first.from!==second.to&&second.from!==second.to){
   batches.push({stopIds:[first.from,first.to,second.to],edgeIndexes:[i,i+1]});
   i+=2;
  }else{batches.push({stopIds:[first.from,first.to],edgeIndexes:[i]});i++}
 }
 return {edges,batches};
}
function hbPlanDistanceLabel(leg){
 const m=leg?.distanceMeters;
 if(leg?.status!=='estimated'||leg.source!=='naver_directions'||!Number.isSafeInteger(m)||m<1||m>1500000)return '자동차 거리 미확인';
 return '자동차 경로 '+(m<1000?m+'m':(m/1000).toFixed(1)+'km');
}
function hbValidatePlanTravelResponse(payload,stopIds){
 if(!payload||!['estimated','incomplete'].includes(payload.status)||
  !Array.isArray(payload.segments)||payload.segments.length!==stopIds.length-1)
  throw Error('invalid_travel_response');
 const legs=payload.segments.map((leg,index)=>{
  if(!leg||leg.from!==stopIds[index]||leg.to!==stopIds[index+1])
   throw Error('invalid_travel_leg');
  if(leg.status==='unknown'){
   if(leg.minutes!==null||leg.source!=null||leg.distanceMeters!=null)throw Error('invalid_unknown_leg');
   return {from:leg.from,to:leg.to,status:'unknown',minutes:null};
  }
  if(leg.status!=='estimated'||leg.source!=='naver_directions'||
   !Number.isSafeInteger(leg.minutes)||leg.minutes<1||leg.minutes>1440||
   typeof leg.checkedAt!=='string'||!Number.isFinite(Date.parse(leg.checkedAt))||
   Date.parse(leg.checkedAt)>Date.now()+300000)throw Error('invalid_estimate');
  if(leg.distanceMeters!=null&&(!Number.isSafeInteger(leg.distanceMeters)||leg.distanceMeters<1||leg.distanceMeters>1500000))throw Error('invalid_distance');
  return {from:leg.from,to:leg.to,status:'estimated',minutes:leg.minutes,
   source:leg.source,checkedAt:leg.checkedAt,...(leg.distanceMeters!=null?{distanceMeters:leg.distanceMeters}:{})};
 });
 if((payload.status==='estimated')!==legs.every(leg=>leg.status==='estimated'))
  throw Error('invalid_overall_status');
 return legs;
}
async function hbFetchPlanTravelTimes(items,context,request=hbTravelRequest){
 const {edges,batches}=hbPlanTravelBatches(items);
 const fallback=status=>({status,segments:edges});
 if(context?.transport!=='car')return fallback('unsupported_mode');
 if(!['서울','경기'].includes(context?.region))return fallback('invalid_context');
 if(!edges.length)return fallback('insufficient_stops');
 if(!batches.length)return fallback('incomplete');
 const result=edges.map(leg=>({...leg}));
 for(const batch of batches){
  let data;
  try{data=await request('/api/travel-times',{
   region:context.region,transport:'car',stopIds:batch.stopIds
  })}catch{return fallback('network_error')}
  if(data?.status==='provider_disabled')return fallback('provider_disabled');
  if(data?.status==='unsupported_mode')return fallback('unsupported_mode');
  let legs;
  try{legs=hbValidatePlanTravelResponse(data,batch.stopIds)}
  catch{return fallback('invalid_response')}
  batch.edgeIndexes.forEach((edgeIndex,i)=>Object.assign(result[edgeIndex],legs[i]));
 }
 const requested=new Set(batches.flatMap(batch=>batch.edgeIndexes));
 return {status:result.every(leg=>leg.status==='estimated')?'estimated':'incomplete',
  segments:result,limited:edges.some((leg,i)=>leg.from!==leg.to&&!requested.has(i))};
}
function hbPreviewPlanTravel(items,travel,window={}){
 const before=Array.isArray(items)?items:[];
 const candidate=before.map(stop=>({...stop})),warnings=[],edges=hbPlanTravelEdges(before);
 if(!travel||!['estimated','incomplete'].includes(travel.status)||!Array.isArray(travel.segments))
  return {stops:candidate,warnings:[{code:'unavailable',message:'경로 조회 결과가 없어 원래 일정을 유지해요.',blocking:true}],
   changed:false,canApply:false,verifiedCount:0};
 const verified=new Map();
 for(const edge of edges){
  const leg=travel.segments.find(x=>x.toIndex===edge.toIndex&&x.fromIndex===edge.fromIndex&&
   x.from===edge.from&&x.to===edge.to);
  if(leg?.status==='estimated'&&leg.source==='naver_directions'&&
   Number.isSafeInteger(leg.minutes)&&leg.minutes>=1&&leg.minutes<=1440&&
   typeof leg.checkedAt==='string'&&Number.isFinite(Date.parse(leg.checkedAt))&&
   Date.parse(leg.checkedAt)<=Date.now()+300000)verified.set(edge.toIndex,leg);
  else warnings.push({code:'unknown',index:edge.toIndex,
   message:(before[edge.toIndex]?.name||'다음 방문지')+' 이동 구간은 확인되지 않아 충돌 여부를 확정할 수 없어요.',blocking:false});
 }
 let previousEnd=null;
 for(let i=0;i<candidate.length;i++){
  const stop=candidate[i],original=before[i],start=hbDraftMinute(original.plannedArrival||original.time);
  const duration=Number(original.stayMinutes);
  if(start===null||!Number.isSafeInteger(duration)||duration<1||duration>240){
   warnings.push({code:'invalid_schedule',index:i,message:'일정 방문 시각 또는 체류시간이 올바르지 않아요. 직접 수정해 주세요.',blocking:true});
   previousEnd=null;continue;
  }
  const actual=verified.get(i);
  const buffer=actual?.minutes??Number(original.transitionBufferMinutes??0);
  if(!Number.isSafeInteger(buffer)||buffer<0||buffer>1440){
   warnings.push({code:'invalid_buffer',index:i,message:'이동 여유시간이 올바르지 않아요. 직접 수정해 주세요.',blocking:true});
   previousEnd=null;continue;
  }
  // Unknown legs preserve the original gap; never add a placeholder buffer
  // twice or claim it is a newly confirmed journey duration.
  const prior=i?before[i-1]:null;
  const priorStart=prior?hbDraftMinute(prior.plannedArrival||prior.time):null;
  const priorDuration=prior?Number(prior.stayMinutes):0;
  const oldEnd=priorStart===null?null:priorStart+priorDuration;
  const originalGap=Number.isFinite(oldEnd)?Math.max(0,start-oldEnd):0;
  const proposed=previousEnd===null?start:Math.max(start,previousEnd+(actual?buffer:originalGap));
  if(i){
   const prevStart=hbDraftMinute(before[i-1].plannedArrival||before[i-1].time);
   const prevDuration=Number(before[i-1].stayMinutes);
   if(prevStart!==null&&Number.isSafeInteger(prevDuration)&&prevStart+prevDuration>start)
    warnings.push({code:'overlap',index:i,message:original.name+'의 기존 방문 시각이 이전 장소 체류 종료보다 빨라요.',blocking:false});
   if(actual&&previousEnd!==null&&previousEnd+actual.minutes>start)
    warnings.push({code:'travel_conflict',index:i,message:original.name+'까지 확인된 자동차 이동시간으로 방문이 늦어져요.',blocking:false});
  }
  const lower=hbDraftMinute(window.windowStart)??0,upper=hbDraftMinute(window.windowEnd)??1439;
  if(proposed+duration>upper||proposed<lower)
   warnings.push({code:'day_limit',index:i,message:original.name+'이(가) 여행 시작·종료 희망 범위('+hbClock(lower)+'~'+hbClock(upper)+')를 벗어나요. 수동 편집이 필요해요.',blocking:true});
  const protectedStop=!!(original.done||original.must||original.reserved||original.booked);
  if(protectedStop){
   if(proposed!==start)warnings.push({code:'protected',index:i,
    message:original.name+'은(는) 완료·필수·예약 일정이어서 방문 시각을 바꿀 수 없어요. 직접 편집해 주세요.',blocking:true});
  }else{
   if(proposed!==start){stop.time=hbClock(proposed);stop.plannedArrival=hbClock(proposed)}
   if(actual){
    stop.transitionBufferMinutes=actual.minutes;
    stop.travelTimeMinutes=actual.minutes;
    stop.travelTimeStatus='estimated';
    stop.travelSource='naver_directions';
    stop.travelCheckedAt=actual.checkedAt;
    stop.travelFromId=actual.from;
    stop.travelToId=actual.to;
   }
  }
  previousEnd=proposed+duration;
 }
 const changed=JSON.stringify(candidate)!==JSON.stringify(before);
 return {stops:candidate,warnings,changed,verifiedCount:verified.size,
  canApply:changed&&verified.size>0&&!warnings.some(w=>w.blocking)};
}

function hbApplyScheduleFromSelection(){
 const beforeRefresh=s;
 s=hbRefreshAutomaticDate(s);
 if(s!==beforeRefresh){s.hbStep=1;go('/new');return false;}
 const dateError=hbTravelDateError(s.date);
 if(dateError){alert(dateError);s.hbStep=1;go('/new');return false;}
 const timeIssues=hbTimeInputErrors(s.hbPlanStart??'',s.hbPlanEnd??'');
 if(timeIssues.length){alert(timeIssues.join(' '));return false;}
 const selected=Array.isArray(s.chosen)?s.chosen:[];
 const profile={
  walk:s.hbWalkConfirmed?s.walk:null,stairsMode:s.hbStairsChoice,needs:s.momNeeds,
  slopePreference:s.hbSlopePreference,indoorPreference:s.hbIndoorPreference,mobilityAid:s.hbMobilityAid
 };
 const blocked=places.find(place=>selected.includes(place.id)&&hbEvaluatePlace(place,profile).status==='excluded');
 if(blocked){
  alert(blocked.name+'의 이동 조건이 현재 선택과 맞지 않아요. 장소 목록에서 선택을 취소한 뒤 다시 시도해 주세요.');
  return false;
 }
 const plan=hbCreateSchedule(selected,places,{start:s.hbPlanStart??'',end:s.hbPlanEnd??'',tripType:s.hbDuration||'day',restIntervalMinutes:s.hbRestIntervalMinutes,slopePreference:s.hbSlopePreference,indoorPreference:s.hbIndoorPreference});
 if(plan.errors.length){alert(plan.errors.join('\n'));return false;}
 if(typeof hbWeatherRecommendation==='function'&&typeof forecast!=='undefined'){
  const weatherChoice=hbWeatherRecommendation(forecast,JSON.stringify([s.region,s.date]));
  if(['caution','adverse'].includes(weatherChoice.kind))plan.warnings.unshift(weatherChoice.message);
 }
 if(Array.isArray(s.stops)&&s.stops.some(x=>x.done||x.must||x.reserved||x.booked)){alert('이미 완료·필수·예약 표시가 있는 일정이 있어 자동 재생성할 수 없어요. 기존 일정을 보호하려면 직접 확인하고 수정해 주세요.');return false;}
 if(Array.isArray(s.stops)&&s.stops.length&&!confirm('현재 일정 초안을 새로 구성할까요? 기존 시간표는 변경됩니다.'))return false;
 const previous=s;
 s={...s,stops:plan.stops,hbPlanWarnings:plan.warnings,hbPlanInfo:{...plan.summary,region:s.region,date:s.date,transport:s.hbTransport,createdAt:new Date().toISOString()},hbReplanUndo:null};
 try{save()}catch{ s=previous;alert('초안 저장에 실패했어요. 기존 일정을 유지해요.');return false;}
 go('/plan');return true;
}
let hbPlanEditMode=false,hbPlanChecksOpen=false;
function hbPlanViewEnhance(){
 const oldView=plan;
 plan=function(){
  oldView();
  const now=Array.isArray(s.stops)?s.stops:[];
  const selection=s.hbPlanStart??'',endSelection=s.hbPlanEnd??'';
  const edges=hbPlanTravelEdges(now);
  const someConfirmed=now.some((stop,i)=>stop.travelTimeStatus==='estimated'&&
   edges.some(edge=>edge.toIndex===i&&edge.from===stop.travelFromId&&edge.to===stop.travelToId));
  const displayWarnings=(Array.isArray(s.hbPlanWarnings)?s.hbPlanWarnings:[]).map(w=>
   someConfirmed&&w.startsWith('장소 간 이동은 실제 경로 소요시간이 아니라')?
    '일부 자동차 이동 구간은 네이버 Directions 결과가 반영됐어요. 나머지 구간과 현장 보행시간은 여전히 미확인이에요.':w);
  if(someConfirmed){
   const oldCaution=Array.from(el.querySelectorAll('p.warn')).find(node=>
    node.textContent.includes('이동시간·실제 보행거리·운영시간은 확인 전이에요.'));
   if(oldCaution)oldCaution.textContent='일부 자동차 이동시간만 확인됐어요. 실제 보행거리·미확인 이동 구간·운영시간은 방문 전 확인해 주세요.';
  }
  const html='<section class="panel hb-plan-generator"><h2>하루 여행 일정 자동 구성</h2><p>관광지 최대 2곳과 시간대에 맞는 식사·휴식 시간을 배치해요. 전체 동선은 <strong>사용자가 확인할 초안</strong>이에요. 일부 자동차 이동 구간만 별도로 확인·반영할 수 있어요.</p><label for="hb-plan-start">첫 방문지 시작 희망 시간 (선택)</label> <input type="time" id="hb-plan-start" value="'+safe(selection)+'"> <label for="hb-plan-end">종료 희망 시간 (선택)</label> <input type="time" id="hb-plan-end" value="'+safe(endSelection)+'"> <button type="button" id="hb-plan-regenerate">선택한 장소로 일정 재구성</button>'+(s.hbDuration==='overnight'?'<p class="warn">숙박 여행을 선택했지만 현재는 첫날 하루 일정만 구성돼요.</p>':'')+(displayWarnings.length?'<details class="hb-plan-warnings"'+(hbPlanChecksOpen?' open':'')+'><summary>방문 전 확인할 점 <span class="hb-plan-check-count">'+displayWarnings.length+'개</span></summary><ul>'+displayWarnings.map(w=>'<li>'+safe(w)+'</li>').join('')+'</ul></details>':'')+'</section>';
  el.insertAdjacentHTML(now.length?'beforeend':'afterbegin',html);
  const generator=el.querySelector('.hb-plan-generator');
  generator.insertAdjacentHTML('afterbegin','<div class="hb-plan-view-controls" aria-label="일정표 표시 방식">'+(now.length?'<button type="button" id="hb-edit-toggle" class="light" aria-pressed="'+String(hbPlanEditMode)+'">'+(hbPlanEditMode?'편집 끝내기':'일정 편집')+'</button>':'')+'<button type="button" id="hb-large-toggle" class="light" aria-pressed="'+String(!!s.hbLargePlanMode)+'">'+(s.hbLargePlanMode?'일반 글씨로 보기':'부모님 큰 글씨로 보기')+'</button><button type="button" id="hb-print-itinerary" class="light">일정표 인쇄</button></div>');
  const checkNode=generator.querySelector('.hb-plan-warnings');
  if(checkNode)checkNode.ontoggle=()=>{hbPlanChecksOpen=checkNode.open};
  const editToggle=document.getElementById('hb-edit-toggle');
  if(editToggle)editToggle.onclick=()=>{hbPlanEditMode=!hbPlanEditMode;plan();document.getElementById('hb-edit-toggle')?.focus()};
  document.getElementById('hb-large-toggle').onclick=()=>{s.hbLargePlanMode=!s.hbLargePlanMode;try{save()}catch{alert('글씨 크기 설정을 저장하지 못했어요.');}plan()};
  document.getElementById('hb-print-itinerary').onclick=()=>{if(checkNode)checkNode.open=true;window.print()};
  document.getElementById('hb-plan-start').onchange=e=>{s.hbPlanStart=e.target.value;save()};
  document.getElementById('hb-plan-end').onchange=e=>{s.hbPlanEnd=e.target.value;save()};
  document.getElementById('hb-plan-regenerate').onclick=hbApplyScheduleFromSelection;
  const liveNote=document.createElement('p');
  liveNote.id='hb-plan-edit-feedback';liveNote.className='hb-plan-edit-feedback';
  liveNote.setAttribute('role','status');liveNote.setAttribute('aria-live','polite');
  el.querySelector('.hb-plan-generator').append(liveNote);
  el.querySelector('.hb-plan-generator').insertAdjacentHTML('beforeend','<p class="hb-plan-local-notice">시간과 방문 순서를 직접 수정할 수 있어요. 수정 내용은 <strong>이 기기에만 저장</strong>되며 가족과 자동 동기화되지 않아요. 이동시간은 일부 구간만 확인됐을 수 있어요.</p>');
  const routeStops=now.filter(stop=>stop.placeId&&!stop.isPlaceholder);
  if(routeStops.length>=2){
   generator.insertAdjacentHTML('beforeend','<section class="hb-plan-travel"><h3>자동차 이동시간 반영 미리보기</h3><p>네이버 Directions에서 확인된 구간만 반영해요. 임시 이동 여유시간·장소 미정 휴식·영업시간은 실제 경로 확인으로 간주하지 않아요.</p><button type="button" class="light" id="hb-route-estimate">자동차 이동시간 확인 및 변경안 보기</button><div id="hb-route-result" role="status" aria-live="polite"></div></section>');
   const routeButton=document.getElementById('hb-route-estimate');
   routeButton.onclick=async()=>{
    const output=document.getElementById('hb-route-result');
    const signature=hbTripSignature(s);
    const transport=s.hbPlanInfo?.transport||s.hbTransport||'car';
    const context={region:s.hbPlanInfo?.region||s.region,transport:transport==='transit'?'public_transit':transport};
    routeButton.disabled=true;
    output.textContent='자동차 이동시간을 확인하는 중이에요.';
    try{
     const travel=await hbFetchPlanTravelTimes(now,context);
     if(document.getElementById('hb-route-result')!==output||hbTripSignature(s)!==signature)return;
     const message={
      provider_disabled:'이 환경에서는 자동차 경로 서비스가 비활성화되어 있어요. 기존 시간표를 유지해요.',
      unsupported_mode:'이 교통수단은 지원하지 않아요. 현재 자동차 이동시간만 조회할 수 있어요.',
      network_error:'이동시간 조회에 실패했어요. 기존 시간표를 유지해요. 다시 시도해 주세요.',
      invalid_response:'경로 제공 서비스의 응답을 확인할 수 없어 기존 시간표를 유지해요.',
      invalid_context:'지역 설정을 확인해 주세요. 기존 시간표를 유지해요.',
      insufficient_stops:'조회할 방문지가 부족해요. 기존 시간표를 유지해요.'
     }[travel.status];
     if(message){output.textContent=message;return}
     const preview=hbPreviewPlanTravel(now,travel,s.hbPlanInfo||{});
     const segments=travel.segments.map(leg=>{
      const from=now[leg.fromIndex]?.name||leg.from,to=now[leg.toIndex]?.name||leg.to;
      return '<li>'+safe(from)+' → '+safe(to)+': '+(leg.status==='estimated'?
       '확인됨 · 네이버 자동차 경로 약 '+safe(leg.minutes)+'분 · '+safe(hbPlanDistanceLabel(leg)):'미확인 · 이동거리·시간을 확정할 수 없음')+'</li>';
     }).join('');
     const before=now.map(stop=>'<li>'+safe(stop.plannedArrival||stop.time||'시간 미정')+
      ' · '+safe(stop.name||'장소')+(stop.done||stop.must||stop.reserved||stop.booked?' (보호 일정)':'')+'</li>').join('');
     const after=preview.stops.map((stop,i)=>'<li>'+safe(stop.plannedArrival||stop.time||'시간 미정')+
      ' · '+safe(stop.name||'장소')+
      ((stop.plannedArrival||stop.time)!==(now[i].plannedArrival||now[i].time)?
       ' <strong>(기존 '+safe(now[i].plannedArrival||now[i].time)+'에서 변경)</strong>':'')+'</li>').join('');
     const warnings=preview.warnings.map(w=>'<li>'+safe(w.message)+'</li>').join('');
     output.innerHTML='<h4>구간별 조회 결과</h4><ul>'+segments+'</ul>'+
      (travel.limited?'<p class="warn">일부 구간은 조회 제한으로 미확인이에요. 필요한 경우 직접 경로를 확인해 주세요.</p>':'')+
      '<div class="hb-replan-compare"><div><h4>변경 전 일정</h4><ol>'+before+'</ol></div>'+
      '<div><h4>반영 후 예상 일정</h4><ol>'+after+'</ol></div></div>'+
      (warnings?'<h4>충돌·확인 필요</h4><ul>'+warnings+'</ul>':'<p>확인된 구간에 따른 시간 충돌은 발견하지 못했어요.</p>')+
      '<p class="muted">운영시간·예약 가능 여부 및 장소 미정 구간은 검증되지 않았어요. 교통 상황에 따라 실제 소요시간은 달라질 수 있어요.</p>'+
      (preview.canApply?'<div class="actions"><button type="button" id="hb-route-apply">이 변경안 적용</button><button type="button" class="light" id="hb-route-cancel">취소</button></div>':
       '<p class="warn">'+(preview.warnings.some(w=>w.blocking)?
        '보호 일정·시간 제한에 영향이 있어 자동 적용할 수 없어요. 방문 시각을 직접 편집해 주세요.':
        '적용할 수 있는 확인된 변경이 없어요. 원래 일정을 유지해요.')+'</p><button type="button" class="light" id="hb-route-cancel">닫기</button>');
     output.querySelector('#hb-route-cancel').onclick=()=>{output.textContent='변경안을 취소했어요. 기존 일정은 유지돼요.'};
     if(preview.canApply)output.querySelector('#hb-route-apply').onclick=()=>{
      if(hbTripSignature(s)!==signature||!hbSavedTripMatches(signature)){
       output.textContent='다른 탭이나 화면에서 일정이 바뀌었어요. 새로고침 후 다시 확인해 주세요.';return;
      }
      if(!hbSaveTripStops(preview.stops,null)){
       output.textContent='저장에 실패했어요. 기존 일정은 유지돼요. 저장 공간을 확인해 주세요.';return;
      }
      plan();
      document.getElementById('hb-plan-edit-feedback').textContent='확인된 자동차 이동시간을 반영한 변경안을 이 기기에 저장했어요.';
     };
    }catch{output.textContent='미리보기를 표시하지 못했어요. 기존 시간표를 유지해요.'}
    finally{routeButton.disabled=false}
   };
  }
  const apply=(index,action,value,input)=>{
   const outcome=hbEditDraftStop(s.stops,index,action,value,s.hbPlanInfo||{});
   if(!outcome.ok){
    liveNote.textContent=outcome.error;
    if(input){
     const old=s.stops[index];
     input.value=action==='arrival'?(old.plannedArrival||old.time||''):(Number(old.stayMinutes)||60);
    }
    return;
   }
   const oldStops=s.stops,oldUndo=s.hbReplanUndo;
   s.stops=outcome.stops;s.hbReplanUndo=null;
   try{save()}catch{
    s.stops=oldStops;s.hbReplanUndo=oldUndo;
    liveNote.textContent='저장하지 못했어요. 이전 일정을 유지해요. 저장 공간을 확인해 주세요.';
    return;
   }
   plan();
   const next=document.getElementById('hb-stop-time-'+outcome.focusIndex);
   if(next)next.focus();
   const feedback=document.getElementById('hb-plan-edit-feedback');
   if(feedback)feedback.textContent='일정 수정 내용을 이 기기에 저장했어요.';
  };
  document.querySelectorAll('.hb-itinerary-row').forEach((node,i)=>{
   const stop=now[i];if(!stop)return;
   let facts=['예정 체류 '+(Number(stop.stayMinutes)||'?')+'분'];
   if(stop.travelTimeStatus==='unknown')facts.push('이전 장소에서 이동시간 미확인 (임시 여유 '+stop.transitionBufferMinutes+'분)');
   if(stop.travelTimeStatus==='estimated'){
    const edge=hbPlanTravelEdges(now).find(e=>e.toIndex===i);
    if(edge&&stop.travelFromId===edge.from&&stop.travelToId===edge.to)
     facts.push('확인됨: 네이버 자동차 경로 약 '+stop.travelTimeMinutes+'분 (조회 '+(stop.travelCheckedAt||'시각 미확인')+')');
    else facts.push('경로 정보가 현재 방문 순서와 맞지 않아요. 이동시간을 다시 확인해 주세요.');
   }
   if(stop.kind==='rest'&&stop.isPlaceholder)facts.push('휴식할 실제 위치는 아직 미정');
   if(stop.isPlaceholder&&stop.kind==='food')facts.push('식당 미지정');
   const parent=node.querySelector('.hb-itinerary-flags');
   if(!parent)return;
   parent.insertAdjacentHTML('beforebegin','<p class="hb-plan-meta">'+safe(facts.join(' · '))+'</p>');
   if(!hbPlanEditMode)node.querySelector('[data-remove]')?.setAttribute('hidden','');
   const locked=!!(stop.done||stop.must||stop.reserved||stop.booked);
   if(locked){
    parent.insertAdjacentHTML('beforebegin','<p class="hb-plan-protected">보호 중: 완료·필수·예약 표시를 해제해야 시간과 순서를 수정할 수 있어요.</p>');
    return;
   }
   if(!hbPlanEditMode)return;
   const prev=now[i-1],next=now[i+1];
   const edit='<div class="hb-stop-editor"><div class="hb-stop-fields">'+
    '<div class="hb-stop-field"><label for="hb-stop-time-'+i+'">도착 예정</label><input id="hb-stop-time-'+i+'" data-hb-time="'+i+'" type="time" value="'+safe(stop.plannedArrival||stop.time||'')+'"></div>'+
    '<div class="hb-stop-field"><label for="hb-stop-stay-'+i+'">'+(stop.kind==='rest'?'휴식시간 (분)':'체류시간 (분)')+'</label><input id="hb-stop-stay-'+i+'" data-hb-stay="'+i+'" type="number" min="5" max="240" step="5" value="'+safe(stop.stayMinutes||60)+'"></div>'+
    '</div><div class="hb-stop-actions"><button type="button" class="light" data-hb-move-up="'+i+'" '+(!prev||prev.done||prev.must||prev.reserved||prev.booked?'disabled':'')+' aria-label="'+safe(stop.name)+' 순서 위로">↑ 위로</button>'+
    '<button type="button" class="light" data-hb-move-down="'+i+'" '+(!next||next.done||next.must||next.reserved||next.booked?'disabled':'')+' aria-label="'+safe(stop.name)+' 순서 아래로">↓ 아래로</button></div></div>';
   parent.insertAdjacentHTML('beforebegin',edit);
  });
  document.querySelectorAll('[data-hb-time]').forEach(input=>input.onchange=()=>apply(Number(input.dataset.hbTime),'arrival',input.value,input));
  document.querySelectorAll('[data-hb-stay]').forEach(input=>input.onchange=()=>apply(Number(input.dataset.hbStay),'duration',input.value,input));
  document.querySelectorAll('[data-hb-move-up]').forEach(button=>button.onclick=()=>apply(Number(button.dataset.hbMoveUp),'up',null,null));
  document.querySelectorAll('[data-hb-move-down]').forEach(button=>button.onclick=()=>apply(Number(button.dataset.hbMoveDown),'down',null,null));
  // Wrap existing DOM nodes instead of replacing innerHTML: preserve all
  // existing click/change handlers from the original plan and edit controls.
  const layout=document.createElement('section');
  layout.className=(s.hbLargePlanMode?'hb-large-plan':'hb-regular-plan')+(hbPlanEditMode?' hb-plan-editing':'');
  layout.setAttribute('aria-label','여행 일정표');
  while(el.firstChild)layout.appendChild(el.firstChild);
  el.appendChild(layout);
  // Move existing DOM nodes, never recreate handlers or provider output.
  const title=layout.querySelector(':scope > h1'),dateLine=title?.nextElementSibling;
  const routeNode=generator.querySelector('.hb-plan-travel');
  const mapSlot=layout.querySelector('#hb-plan-map-slot');
  const weatherNodes=[...layout.children].filter(n=>n.classList.contains('hb-weather-card'));
  if(title&&dateLine)dateLine.after(generator);
  if(checkNode)generator.after(checkNode);
  if(routeNode)layout.append(routeNode);
  if(mapSlot)layout.append(mapSlot);
  for(const node of weatherNodes)layout.append(node);
  hbRenderPlanMap();
 };
}
hbPlanViewEnhance();
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
let geoStarted=false,nearbyMode='위치 확인 중',nearbyItems=[],nearbyCenter=[37.5665,126.978],nearbyUser=false,nearbyLoading=false,nearbyError='',nearFilter='spot',leafletPromise=null,nearbyMap=null,nearbyLayer=null,nearbyRequestId=0,featuredPlaces=[],featuredMode=false,featuredLoading=false,featuredError='',featuredRequestId=0;
let nearbyCenterLabel='서울 시청',nearbyPinWarning='',nearbyResultMeta=null,nearbyResultCenterLabel='서울 시청',nearbyResultCategory=null;
let nearbyMapEpoch=0,nearbyMapListeners=[],nearbyMapMarkers=new Map(),nearbySelectedId=null;
function hbValidMapPoint(lat,lng){
 return Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180;
}
function setNearbyStatus(){
  const status=document.getElementById('nearby-status');
  if(!status)return;
  status.setAttribute('role','status');
  status.textContent=nearbyLoading
    ? nearbyMode+' · 실제 관광정보를 확인 중이에요…'
    : nearbyError
      ? nearbyMode+' · '+nearbyError
      : nearbyMode+' · 주변 '+nearbyItems.length+'곳 · 유명 명소 '+featuredPlaces.length+'곳 (별도 선정)';
  if(nearbyResultMeta?.partial)status.textContent+=' · 일부 자료만 표시'+(nearbyResultMeta.failures?.length?' (일부 유형 조회 실패)':'');
  if(nearbyResultMeta?.hiddenPastEvents)status.textContent+=' · 이전 연도 행사명 '+nearbyResultMeta.hiddenPastEvents+'건 제외 (일정 미확인)';
  if(nearbyResultMeta?.supplementedIds?.length)status.textContent+=' · 공식 키워드 조회 자료 '+nearbyResultMeta.supplementedIds.length+'곳 보강';
  if((nearbyError||nearbyLoading)&&nearbyItems.length&&nearbyResultCategory===nearFilter)status.textContent+=' · 마지막 정상 조회: '+nearbyResultCenterLabel;
  if(nearbyPinWarning)status.textContent+=' · '+nearbyPinWarning;
}
function requestLocation(){
  const request=++nearbyRequestId;
  ++featuredRequestId;
  nearbyMode='현재 위치 확인 중';
  nearbyError='';
  nearbyLoading=true;
  setNearbyStatus();
  drawNearbyList();
  const fallback=message=>{
    if(request!==nearbyRequestId)return;
    nearbyMode=message;
    fetchNearby(37.5665,126.978,false);
  };
  if(!navigator.geolocation){
    fallback('기기 위치를 사용할 수 없어 서울 시청 중심을 표시해요.');
    return;
  }
  try{
    navigator.geolocation.getCurrentPosition(position=>{
      if(request!==nearbyRequestId)return;
      const lat=position?.coords?.latitude,lng=position?.coords?.longitude;
      if(!hbValidMapPoint(lat,lng)){
        fallback('현재 위치 좌표를 확인할 수 없어 서울 시청 중심을 표시해요.');
        return;
      }
      nearbyMode='내 현재 위치 기준';
      fetchNearby(lat,lng,true);
    },error=>{
      const messages={
        1:'위치 권한이 꺼져 있어 서울 시청 중심을 표시해요.',
        2:'현재 위치를 확인할 수 없어 서울 시청 중심을 표시해요.',
        3:'위치 확인이 오래 걸려 서울 시청 중심을 표시해요.'
      };
      fallback(messages[error?.code]||messages[2]);
    },{enableHighAccuracy:false,timeout:9000,maximumAge:180000});
  }catch{
    fallback('위치를 확인할 수 없어 서울 시청 중심을 표시해요.');
  }
}
function leaflet(){if(window.L)return Promise.resolve(window.L);if(leafletPromise)return leafletPromise;leafletPromise=new Promise((resolve,reject)=>{let css=document.createElement('link');css.rel='stylesheet';css.href='https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';document.head.appendChild(css);let js=document.createElement('script');js.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';js.integrity='sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';js.crossOrigin='';js.onload=()=>resolve(window.L);js.onerror=()=>reject(Error('지도 라이브러리를 불러올 수 없어'));document.head.appendChild(js)});return leafletPromise}

let naverSdkPromise=null;
let naverSdkAuthFailed=false;
let failNaverLoad=null;
function loadNaverMap(){
  window.navermap_authFailure=()=>{
    naverSdkAuthFailed=true;
    naverSdkPromise=null;
    if(failNaverLoad)failNaverLoad();
    hbPlanMapView?.failure?.();
    const host=document.getElementById('nearby-map');
    if(host&&host.dataset.mapState==='ready'){
      dropNearbyMap();
      renderNearbyMapFailure(host,'auth');
    }
  };
  if(naverSdkPromise)return naverSdkPromise;
  if(window.naver?.maps?.Map&&!naverSdkAuthFailed)return Promise.resolve(window.naver.maps);
  naverSdkPromise=new Promise((resolve,reject)=>{
    naverSdkAuthFailed=false;
    const script=document.createElement('script');
    script.src='https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=YOUR_NAVER_MAP_CLIENT_ID';
    script.async=true;
    let settled=false;
    const fail=()=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      failNaverLoad=null;
      script.remove();
      reject(Error('Map unavailable'));
    };
    const timer=setTimeout(fail,10000);
    failNaverLoad=fail;
    script.onload=()=>{
      if(settled)return;
      if(!window.naver?.maps?.Map||naverSdkAuthFailed){fail();return;}
      settled=true;
      clearTimeout(timer);
      failNaverLoad=null;
      resolve(window.naver.maps);
    };
    script.onerror=fail;
    document.head.appendChild(script);
  }).catch(error=>{
    naverSdkPromise=null;
    throw error;
  });
  return naverSdkPromise;
}
let hbPlanMapView=null;

function hbClearPlanMap(view){
 for(const listener of view.listeners||[]){
  try{window.naver?.maps?.Event?.removeListener?.(listener)}catch{}
 }
 if(view.listeners)view.listeners.length=0;
 for(const marker of view.markers.splice(0)){
  try{marker.setMap(null)}catch{}
 }
 try{view.map?.destroy()}catch{}
 view.map=null;
}

function hbDropPlanMap(){
 const view=hbPlanMapView;
 hbPlanMapView=null;
 if(view)hbClearPlanMap(view);
}

function hbPlanMapStops(stops, catalog){
 const byId=new Map(catalog.map(place=>[place.id,place]));
 return stops.map((stop,index)=>{
  const id=stop.placeId||stop.id;
  const place=stop.isPlaceholder?null:byId.get(id);
  return {stop,index,place:place||{id,name:stop.name,address:stop.address},
   coordinates:stop.isPlaceholder?null:hbMapCoordinates(place)||hbMapCoordinates(stop.coordinates)};
 });
}

function hbRenderPlanMap(){
 const slot=document.getElementById('hb-plan-map-slot');
 const catalog=hbPlacesLoadedRegion===hbPlanContext(s).region?places:[];
 hbRenderItineraryMap(slot,s.stops,catalog);
}

function hbRenderItineraryMap(slot, stops, catalog, options={}){
 if(!slot||!Array.isArray(stops)||!stops.length)return;
 const selected=options.selectedIndex??(hbPlanMapView?.slot===slot?hbPlanMapView.selected:null);
 const entries=hbPlanMapStops(stops,catalog);
 const mapped=entries.filter(entry=>entry.coordinates);
 hbDropPlanMap();
 slot.innerHTML='<section class="panel hb-trip-map-panel" aria-labelledby="hb-trip-map-title">'+
  '<h2 id="hb-trip-map-title">'+safe(options.title||'일정 지도')+'</h2>'+
  '<div id="hb-trip-map" aria-label="네이버 일정 지도"></div>'+
  '<button type="button" class="light" id="hb-trip-overview" hidden>일정 전체 보기</button>'+
  '<div id="hb-trip-arrival" aria-live="polite"></div><ol class="hb-trip-map-list">'+entries.map(({stop,index,coordinates,place})=>
   '<li><button type="button" class="light" data-trip-stop="'+index+'" aria-pressed="false">'+
   '<span class="hb-trip-number">'+safe(stop.mapLabel||index+1)+'</span><time>'+safe(stop.plannedArrival||stop.time||'미정')+'</time> '+
   '<strong>'+safe(stop.name||'장소명 미확인')+'</strong>'+
   (place?.address||stop.address?'<small class="hb-trip-address">주소 '+safe(place?.address||stop.address)+'</small>':'')+
   (coordinates?'':' <small>'+(stop.isPlaceholder?'장소 미정':'지도 위치 미확인')+'</small>')+'</button></li>').join('')+
  '</ol></section>';
 const host=slot.querySelector('#hb-trip-map');
 const card=slot.querySelector('#hb-trip-arrival');
 const overview=slot.querySelector('#hb-trip-overview');
 const buttons=Array.from(slot.querySelectorAll('[data-trip-stop]'));
 const view={slot,map:null,markers:[],listeners:[],selected:null};
 hbPlanMapView=view;
 const current=()=>hbPlanMapView===view&&host.isConnected;
 const select=(index,notify=false)=>{
  const entry=entries[index];
  if(!entry||!current())return;
  view.selected=index;
  if(notify)options.onSelect?.(entry);
  overview.hidden=false;
  buttons.forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
  const {place,stop,coordinates}=entry;
  if(stop.isPlaceholder){
   card.innerHTML='<p>장소가 정해지면 도착 안내를 볼 수 있어요.</p>';
   if(view.map)drawOverview();
   return;
  }
  const guide=hbDetailAccessGuide(place);
  const facts=[...(guide?.facts||[]),...hbAccessFacts(place)];
  card.innerHTML='<h3>'+safe(stop.name||place.name)+'</h3>'+
   (stop.mapNote?'<p>'+safe(stop.mapNote)+'</p>':'')+hbArrivalMarkup(place,guide,facts);
  hbBindAccessMap(guide);
  if(view.map){
   if(coordinates)drawSelected(entry,guide,facts);
   else drawOverview();
  }
 };
 const failure=()=>{
  if(!current()||host.dataset.mapState==='error')return;
  hbClearPlanMap(view);
  host.dataset.mapState='error';
  host.innerHTML='<p role="status">지도를 불러오지 못했어요. 아래 목록과 도착 안내는 계속 이용할 수 있어요.</p><button type="button" class="light">다시 불러오기</button>';
  host.querySelector('button').onclick=()=>{hbRenderItineraryMap(slot,stops,catalog,{...options,selectedIndex:view.selected});slot.querySelector('#hb-trip-map')?.focus()};
 };
 view.failure=failure;
 let M;
 const clearAmenities=()=>{
  for(const marker of view.markers.splice(mapped.length))marker.setMap(null);
 };
 const fitOptions={top:44,left:44,right:44,bottom:44};
 const drawOverview=()=>{
  try{
   clearAmenities();
   const first=mapped[0].coordinates;
   view.map.setCenter(new M.LatLng(first.lat,first.lng));
   view.map.setZoom(14);
   if(mapped.length>1){
    const bounds=new M.LatLngBounds();
    for(const {coordinates} of mapped)bounds.extend(new M.LatLng(coordinates.lat,coordinates.lng));
    view.map.fitBounds(bounds,fitOptions);
   }
  }catch{failure()}
 };
 overview.onclick=()=>{
  view.selected=null;
  buttons.forEach(button=>button.setAttribute('aria-pressed','false'));
  card.replaceChildren();
  if(view.map)drawOverview();
  host.focus({preventScroll:true});
  overview.hidden=true;
 };
 const drawSelected=(entry,guide,facts)=>{
  try{
   clearAmenities();
   const conflicting=hbDetailSummary(facts,['dropoff','entrance','threshold','stairs','slope','wheelchair','elevator','toilet']);
   const amenities=[['주차·하차',guide?.arrival],['입구',guide?.entrance],['화장실',guide?.restroom]];
   const bounds=new M.LatLngBounds();
   const center=new M.LatLng(entry.coordinates.lat,entry.coordinates.lng);
   bounds.extend(center);
   let count=1;
   if(!['자료가 서로 달라요','이용 제한 자료가 있어요'].includes(conflicting)){
    for(const [label,location] of amenities){
     const point=hbMapCoordinates(location);
     if(!point)continue;
     const position=new M.LatLng(point.lat,point.lng);
     bounds.extend(position);
     count++;
     view.markers.push(new M.Marker({map:view.map,position,title:label,
      icon:{content:'<span class="hb-trip-amenity">'+label+'</span>',anchor:new M.Point(35,15)},zIndex:150}));
    }
   }
   if(count>1)view.map.fitBounds(bounds,fitOptions);
   else{view.map.setCenter(center);view.map.setZoom(16);}
  }catch{failure()}
 };
 host.tabIndex=-1;
 if(!mapped.length){
  host.dataset.mapState='empty';
  host.innerHTML='<p role="status">지도에 표시할 방문지 위치를 확인하지 못했어요.</p>';
 }else{
  host.dataset.mapState='loading';
  host.innerHTML='<p role="status">네이버지도를 불러오는 중이에요…</p>';
  loadNaverMap().then(sdk=>{
   if(!current())return;
   if(naverSdkAuthFailed){failure();return;}
   M=sdk;
   host.replaceChildren();
   const first=mapped[0].coordinates;
   view.map=new M.Map(host,{center:new M.LatLng(first.lat,first.lng),zoom:14,minZoom:6,maxZoom:20,scrollWheel:false});
   for(const {coordinates,index,stop} of mapped){
    const position=new M.LatLng(coordinates.lat,coordinates.lng);
    const label=stop.mapLabel||index+1;
    const marker=new M.Marker({map:view.map,position,title:(stop.mapLabel||label+'번')+' '+stop.name,
     icon:{content:'<span class="hb-trip-number">'+safe(label)+'</span>',anchor:new M.Point(16,16)}});
    view.markers.push(marker);
    view.listeners.push(M.Event.addListener(marker,'click',()=>{if(current())select(index,true)}));
   }
   drawOverview();
   if(!view.map)return;
   host.dataset.mapState='ready';
   if(view.selected!==null)select(view.selected);
  }).catch(failure);
 }
 buttons.forEach((button,index)=>button.onclick=()=>select(index,true));
 if(selected!==null)select(selected);
}


function createToiletOverlay({fetchImpl = globalThis.fetch, replacePins, setStatus}) {
  let enabled = false, version = 0, request = null;
  function stop() { ++version; request?.abort(); request = null; replacePins([]); }
  function toggle(on) { enabled = Boolean(on); stop(); setStatus(enabled ? 'idle' : 'disabled'); }
  async function refresh(lat, lng) {
    if (!enabled) return;
    stop();
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) { setStatus('unavailable'); return; }
    const current = version;
    const controller = new AbortController(); request = controller;
    setStatus('loading');
    try {
      const q = new URLSearchParams({lat: String(lat), lng: String(lng), radius: '2000', limit: '50'});
      const response = await fetchImpl('/api/toilets?' + q, {signal: controller.signal, cache: 'no-store'});
      if (current !== version) return;
      if (!response.ok) { setStatus('unavailable'); return; }
      const body = await response.json();
      if (current !== version) return;
      if (body.status !== 'ok' || body.coverage !== 'partial_seoul_gyeonggi' || !Array.isArray(body.items) || body.items.length > 50) { setStatus('unavailable'); return; }
      const pins = body.items.filter(p => p && p.category === 'public_toilet' && typeof p.id === 'string' && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && p.accessibleRoute === 'unknown');
      if (pins.length !== body.items.length || new Set(pins.map(p => p.id)).size !== pins.length) { setStatus('unavailable'); return; }
      const detail = body.coverageDetail || null;
      if (detail && (detail.complete !== false || typeof detail.region !== 'string' || typeof detail.attribution !== 'string' || typeof detail.sourceUrl !== 'string')) { setStatus('unavailable'); return; }
      if (pins.some(p => p.coordinatePrecision === 'facility_location' && (!detail || !p.coordinateEvidence?.attribution))) { setStatus('unavailable'); return; }
      replacePins(pins);
      setStatus(pins.length ? 'partial' : 'empty_in_partial_coverage', detail);
    } catch (error) { if (current === version) setStatus('unavailable'); }
    finally { if (current === version) request = null; }
  }
  function dispose() { enabled = false; stop(); setStatus('disabled'); }
  return {toggle, refresh, dispose};
}

let hbToiletOverlayView=null;
function hbMountToiletOverlay(map,M,host){
  // Optional layer. Never break the map or itinerary if this renderer is unavailable.
  if(!host?.insertAdjacentElement||!document.createElement)return;
  const panel=document.createElement('section');
  panel.id='hb-toilet-overlay';
  panel.className='panel';
  const toggle=document.createElement('button');
  toggle.type='button';toggle.className='light';
  toggle.textContent='공중화장실 보기';toggle.setAttribute('aria-pressed','false');
  toggle.style.minHeight='44px';
  const status=document.createElement('p');
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const list=document.createElement('div');
  panel.append(toggle,status,list);
  host.insertAdjacentElement('afterend',panel);
  let enabled=false,disposed=false,timer=null,listener=null,markers=[],links=[];
  const clear=()=>{
    for(const marker of markers){try{marker.setMap(null)}catch{}}
    markers=[];list.replaceChildren();links=[];
  };
  const replacePins=pins=>{
    clear();if(disposed)return;
    try{
      for(const p of pins){
        const marker=new M.Marker({map,position:new M.LatLng(p.lat,p.lng),title:String(p.name||'공중화장실'),
          icon:{content:'<div style="background:#fff;border:2px solid #285C50;border-radius:8px;padding:4px;font-size:16px">🚻</div>',anchor:new M.Point(15,15)},zIndex:350});
        markers.push(marker);
        const item=document.createElement('p');
        const label=document.createElement('strong');label.textContent=String(p.name||'공중화장실');item.append(label);
        const info=document.createElement('span');
        info.textContent=' · '+String(p.address||'주소 미확인')+' · 시설 위치·입구 미확인 · 접근 경로 미확인'+(p.coordinateEvidence?.sourceDatasetUpdatedAt?' · 자료 기준 '+String(p.coordinateEvidence.sourceDatasetUpdatedAt):'')+(p.accessibleFacilityReport?.note?' · '+String(p.accessibleFacilityReport.note):'');
        item.append(info);list.append(item);
      }
    }catch(e){clear();throw e;}
  };
  const setStatus=(state,detail)=>{
    for(const link of links)link.remove();links=[];
    const prefix=detail?.region?String(detail.region)+' 일부 확인 자료':'서울·경기 일부 확인 자료';
    const suffix=' · 시설 위치(화장실 입구 아님) · 직선거리 · 접근 경로 미확인';
    status.textContent=({disabled:'화장실 표시 꺼짐',idle:'화장실 위치 확인 준비',loading:'화장실 위치를 확인 중이에요',unavailable:'화장실 위치 자료를 불러올 수 없어요',partial:prefix+suffix,empty_in_partial_coverage:prefix+'에서 검색 결과 없음'+suffix})[state]||'화장실 위치 자료를 확인할 수 없어요';
    if((state==='partial'||state==='empty_in_partial_coverage')&&detail?.sourceUrl){
      try{const url=new URL(detail.sourceUrl);if(url.protocol==='https:'&&!url.username&&!url.password){const a=document.createElement('a');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent='출처: '+String(detail.attribution||'공공데이터');status.append(' · ',a);links.push(a);}}catch{}
    }
  };
  const overlay=createToiletOverlay({replacePins,setStatus});
  const refresh=()=>{
    if(!enabled||disposed)return;
    try{const center=map.getCenter();void overlay.refresh(center.lat(),center.lng());}
    catch{void overlay.refresh(NaN,NaN);}
  };
  const schedule=()=>{if(!enabled||disposed)return;clearTimeout(timer);timer=setTimeout(refresh,250);};
  toggle.onclick=()=>{
    enabled=!enabled;clearTimeout(timer);overlay.toggle(enabled);
    toggle.setAttribute('aria-pressed',String(enabled));toggle.textContent=enabled?'공중화장실 숨기기':'공중화장실 보기';
    if(enabled)refresh();
  };
  try{listener=M.Event?.addListener?.(map,'idle',schedule)}catch{}
  hbToiletOverlayView={dispose(){
    disposed=true;enabled=false;clearTimeout(timer);
    try{if(listener!=null)M.Event?.removeListener?.(listener)}catch{}
    overlay.dispose();panel.remove();
  }};
}

function hbSearchMapCenter(){
  if(!nearbyMap)return;
  let lat,lng;
  try{const point=nearbyMap.getCenter();lat=point?.lat?.();lng=point?.lng?.()}catch{
    nearbyError='지도 중심 위치를 읽지 못했어요. 서울 중심 보기나 지도 다시 불러오기를 이용해 주세요.';
    setNearbyStatus();
    return;
  }
  if(!hbValidMapPoint(lat,lng)){
    nearbyError='지도 중심 위치를 읽지 못했어요. 서울 중심 보기나 지도 다시 불러오기를 이용해 주세요.';
    setNearbyStatus();
    return;
  }
  nearbyMode='현재 지도 중심 기준';
  fetchNearby(lat,lng,false,'지도 중심');
}

function dropNearbyMap(){
  if(typeof hbToiletOverlayView!=='undefined'&&hbToiletOverlayView){try{hbToiletOverlayView.dispose()}catch{}hbToiletOverlayView=null;}
  ++nearbyMapEpoch;
  const map=nearbyMap;
  const markers=nearbyLayer||[];
  nearbyMap=null;
  nearbyLayer=null;
  nearbyPinWarning='';
  nearbyMapMarkers.clear();
  for(const listener of nearbyMapListeners.splice(0)){
    try{window.naver?.maps?.Event?.removeListener?.(listener)}catch{}
  }
  // SDK objects may be partially initialized when the user leaves the map.
  for(const marker of markers){
    try{marker.setMap(null)}catch{}
  }
  try{map?.destroy()}catch{}
}
function renderNearbyMapFailure(host,reason='sdk'){
  if(!host||document.getElementById('nearby-map')!==host)return;
  host.dataset.mapState='error';
  const searchButton=document.getElementById('hb-search-map-center');
  if(searchButton)searchButton.disabled=true;
  const detail=reason==='auth'?'네이버지도 인증을 확인하지 못했어요. 접속 주소 또는 지도 서비스 설정을 확인해 주세요. ':'지도 연결을 확인해 주세요. ';
  host.innerHTML='<div style="padding:22px;max-width:520px"><p role="status"><strong>지도를 표시할 수 없어요.</strong> '+detail+'아래의 장소 목록과 일정 담기는 계속 이용할 수 있어요.</p><button id="hb-map-retry" type="button" class="light">지도 다시 불러오기</button></div>';
  host.querySelector('button').onclick=()=>{
    host.setAttribute('tabindex','-1');
    host.focus({preventScroll:true});
    mountNearbyMap();
  };
}
function hbNearbyMobileNavigation(){
  const host=document.getElementById('nearby-map'),list=document.getElementById('nearby-list');
  if(!host||!list||!window.matchMedia?.('(max-width: 767px)').matches)return;
  const jump=target=>{
    target.setAttribute('tabindex','-1');
    target.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
    target.focus({preventScroll:true});
  };
  if(!document.getElementById('hb-nearby-to-list')){
    host.insertAdjacentHTML('afterend','<button type="button" class="light" id="hb-nearby-to-list" style="margin-top:10px;min-height:44px">목록 보기 ↓</button>');
    document.getElementById('hb-nearby-to-list').onclick=()=>jump(list);
  }
  if(!document.getElementById('hb-nearby-to-map')){
    list.insertAdjacentHTML('beforebegin','<button type="button" class="light" id="hb-nearby-to-map" style="margin-bottom:12px;min-height:44px">지도 보기 ↑</button>');
    document.getElementById('hb-nearby-to-map').onclick=()=>jump(host);
  }
}
function mountNearbyMap(){
  dropNearbyMap();
  const epoch=nearbyMapEpoch;
  const host=document.getElementById('nearby-map');
  if(!host)return;
  hbNearbyMobileNavigation();
  const searchButton=document.getElementById('hb-search-map-center');
  if(searchButton)searchButton.disabled=true;
  host.dataset.mapState='loading';
  host.innerHTML='<p role="status" style="padding:22px">네이버 지도를 불러오는 중이에요…</p>';
  loadNaverMap().then(M=>{
    if(epoch!==nearbyMapEpoch||document.getElementById('nearby-map')!==host)return;
    if(naverSdkAuthFailed)throw Error('Map authentication failed');
    host.replaceChildren();
    nearbyMap=new M.Map(host,{center:new M.LatLng(...nearbyCenter),zoom:nearbyUser?15:14,minZoom:10,maxZoom:20,zoomControl:true,zoomControlOptions:{position:M.Position.TOP_RIGHT},scaleControl:true,scrollWheel:false,logoControl:true,mapDataControl:true});
    nearbyLayer=[];
    if(naverSdkAuthFailed)throw Error('Map authentication failed');
    updateNearbyPins();
    if(epoch!==nearbyMapEpoch||!nearbyMap)return;
    if(naverSdkAuthFailed)throw Error('Map authentication failed');
    host.dataset.mapState='ready';
    if(searchButton)searchButton.disabled=false;
    try{hbMountToiletOverlay(nearbyMap,M,host)}catch{}
  }).catch(()=>{
    if(epoch!==nearbyMapEpoch||document.getElementById('nearby-map')!==host)return;
    dropNearbyMap();
    renderNearbyMapFailure(host,naverSdkAuthFailed?'auth':'sdk');
  });
}
function hbNearbyVisiblePlaces(){
  const base=nearFilter==='famous'?featuredPlaces:nearbyItems.filter(p=>
    nearFilter==='all'||nearFilter==='food'&&p.kind==='food'||nearFilter==='spot'&&['spot','culture'].includes(p.kind)
  ).slice(0,30);
  const items=['all','spot'].includes(nearFilter)?[...base,...featuredPlaces]:base;
  const unique=new Map();
  for(const p of items){
    if(!p||typeof p.id!=='string'||!p.id||typeof p.name!=='string'||!p.name||unique.has(p.id))continue;
    unique.set(p.id,p);
  }
  return [...unique.values()];
}
function hbRememberNearbyPlace(p){
  if(!p||typeof p.id!=='string'||!p.id)return;
  if(!places.some(value=>value.id===p.id)){
    places.push({...p,hbPickedRegion:s.region,accessFacts:[],accessStatus:'unknown'});
  }
}
function hbSelectNearbyPlace(id,focusMap=false){
  const p=hbNearbyVisiblePlaces().find(value=>value.id===id);
  if(!p)return null;
  nearbySelectedId=id;
  drawNearbyList();
  const marker=nearbyMapMarkers.get(id);
  if(marker&&nearbyMap){
    try{
      marker.setZIndex?.(900);
      if(focusMap){
        const M=window.naver.maps;
        nearbyMap.panTo?.(new M.LatLng(p.lat,p.lng));
        nearbyMap.setZoom?.(16);
      }
    }catch{}
  }
  return p;
}
function hbNearbyDetailLink(p){
  return '#/place/'+encodeURIComponent(p.id);
}
// A pin or popup is an optional overlay. Never tear down a working base map
// because a single record, overlay constructor, or event binding failed.
function hbSetNearbyPinWarning(failed){
  nearbyPinWarning=failed?'일부 지도 표시를 갱신하지 못했어요. 장소 목록을 이용해 주세요.':'';
  setNearbyStatus();
}
function updateNearbyPins(recenter=true){
  if(!nearbyMap||!window.naver?.maps)return;
  try{hbSetNearbyPinWarning(setNearbyPins(recenter))}catch{hbSetNearbyPinWarning(true)}
}
function setNearbyPins(recenter=true){
  if(!nearbyMap||!window.naver?.maps)return false;
  const M=window.naver.maps,map=nearbyMap;
  let failed=false;
  for(const listener of nearbyMapListeners.splice(0)){
    try{M.Event?.removeListener?.(listener)}catch{failed=true}
  }
  if(nearbyLayer)for(const marker of nearbyLayer){
    try{marker.setMap(null)}catch{failed=true}
  }
  nearbyLayer=[];
  nearbyMapMarkers.clear();
  if(recenter){
    try{
      map.setCenter(new M.LatLng(nearbyCenter[0],nearbyCenter[1]));
      map.setZoom(nearbyUser?15:14);
    }catch{failed=true}
  }
  try{
    const self=new M.Marker({map,position:new M.LatLng(nearbyCenter[0],nearbyCenter[1]),
      icon:{content:'<div class="hb-current">📍 '+safe(nearbyCenterLabel)+(nearbyUser?'':' 기준')+'</div>',anchor:new M.Point(49,37)},zIndex:999});
    nearbyLayer.push(self);
  }catch{failed=true}
  const items=hbNearbyVisiblePlaces();
  let labels=0;
  for(const p of items){
    if(!hbValidMapPoint(p.lat,p.lng))continue;
    try{
      const featured=!!p.featured,distance=Number(p.distanceKm);
      const near=!featured&&Number.isFinite(distance)&&distance>=0&&distance<=1.3&&labels<13;
      if(near)labels++;
      const selected=nearbySelectedId===p.id;
      const color=selected?' style="outline:3px solid #285C50;outline-offset:2px"':'';
      const icon=featured?'<div class="hb-featured-marker"'+color+'>📍 '+safe(p.name)+'</div>':
        near?'<div class="hb-naver-place '+(p.kind==='food'?'hb-food':'hb-spot')+'"'+color+'>'+(p.kind==='food'?'🍚 ':'🌿 ')+safe(p.name)+'</div>':
        '<div class="hb-naver-dot '+(p.kind==='food'?'hb-food':'hb-spot')+'"'+color+'></div>';
      const marker=new M.Marker({map,position:new M.LatLng(p.lat,p.lng),title:p.name,
        icon:{content:icon,anchor:new M.Point(featured?78:near?65:6,featured?36:near?33:6)},
        zIndex:selected?900:featured?500:near?200-Math.round(distance*30):20});
      marker.hbPlaceId=p.id;
      nearbyLayer.push(marker);
      nearbyMapMarkers.set(p.id,marker);
      nearbyMapListeners.push(M.Event.addListener(marker,'click',()=>{
        if(nearbyMap!==map||!hbNearbyVisiblePlaces().some(item=>item.id===p.id))return;
        hbRememberNearbyPlace(p);
        hbSelectNearbyPlace(p.id,true);
        // Selection may rebuild pins; open on the currently registered marker.
        try{
          const active=nearbyMapMarkers.get(p.id);
          if(nearbyMap!==map||!active)return;
          const info=new M.InfoWindow({content:'<div style="padding:12px;max-width:260px;color:#284238"><b>'+safe(p.name)+'</b><p style="margin:4px 0;font-size:12px">'+safe(p.address||'주소 없음')+'</p><small>직선거리 '+safe(p.distanceKm)+'km · 실제 보행 동선 미확인</small><p><a href="'+safe(hbNearbyDetailLink(p))+'">장소 상세 보기</a></p></div>',borderWidth:0,backgroundColor:'#fff'});
          info.open(map,active);
        }catch{hbSetNearbyPinWarning(true)}
      }));
    }catch{failed=true}
  }
  return failed;
}
function showFamousOnMap(){if(!nearbyMap||!window.naver?.maps||!featuredPlaces.length)return;let M=window.naver.maps;let bounds=new M.LatLngBounds();bounds.extend(new M.LatLng(nearbyCenter[0],nearbyCenter[1]));for(let p of featuredPlaces)bounds.extend(new M.LatLng(p.lat,p.lng));nearbyMap.fitBounds(bounds,{top:70,right:45,bottom:60,left:45})}

function hbSelectNearbyCategory(filter){
  if(!['all','spot','food'].includes(filter)||filter===nearFilter)return;
  nearFilter=filter;featuredMode=false;nearbySelectedId=null;
  nearbyItems=[];nearbyResultMeta=null;nearbyResultCategory=null;
  fetchNearby(nearbyCenter[0],nearbyCenter[1],nearbyUser,nearbyCenterLabel,false);
}
async function fetchNearby(lat,lng,isUser,centerLabel,refreshFeatured=true){
  const n=++nearbyRequestId,category=nearFilter==='food'?'food':nearFilter==='all'?'all':'spot';
  nearbyCenterLabel=centerLabel||(isUser?'내 위치':'서울 시청');nearbyCenter=[lat,lng];nearbyUser=isUser;
  nearbyLoading=true;nearbyError='';
  if(nearbyResultCategory!==category){nearbyItems=[];nearbyResultMeta=null;}
  if(refreshFeatured){featuredPlaces=[];featuredLoading=true;featuredError='';loadFeatured(lat,lng,++featuredRequestId);}
  setNearbyStatus();drawNearbyList();updateNearbyPins();
  try{
    const d=await get('/api/nearby.js?lat='+encodeURIComponent(lat.toFixed(4))+'&lng='+encodeURIComponent(lng.toFixed(4))+'&category='+category);
    if(n!==nearbyRequestId)return;
    if(!Array.isArray(d.places))throw Error('invalid nearby response');
    // Defensive filter even if an older backend or unexpected provider response leaks food.
    const items=d.places.filter(p=>p&& (category==='all'||category==='food'&&p.kind==='food'||category==='spot'&&['spot','culture'].includes(p.kind)));
    if(!items.length&&d.meta?.failures?.length)throw Error('partial empty response');
    nearbyItems=items;nearbyResultCategory=category;nearbyResultMeta=d.meta||null;nearbyResultCenterLabel=nearbyCenterLabel;
    if(!items.length)nearbyError=d.meta?.partial?'일부 자료에서 장소를 찾지 못했어요. 전체 장소가 없다는 뜻은 아니에요.':'이 반경에서 조회된 장소가 없어요';
  }catch(e){
    if(n!==nearbyRequestId)return;
    nearbyError='주변 장소를 불러오지 못했어요. 위치를 다시 선택해 주세요.';
  }finally{
    if(n===nearbyRequestId){nearbyLoading=false;setNearbyStatus();updateNearbyPins();drawNearbyList();}
  }
}
async function loadFeatured(lat,lng,id){try{let r=await get('/api/featured.js?lat='+encodeURIComponent(lat.toFixed(4))+'&lng='+encodeURIComponent(lng.toFixed(4)));if(id!==featuredRequestId)return;featuredPlaces=r.places||[];featuredError=featuredPlaces.length?'':'근처에서 검증된 유명 명소를 찾지 못했어요'}catch(e){if(id!==featuredRequestId)return;featuredError='대표 관광지 자료를 불러오지 못했어요.'}finally{if(id===featuredRequestId){featuredLoading=false;setNearbyStatus();updateNearbyPins();drawNearbyList()}}}
function drawNearbyList(){['all','spot','food'].forEach(f=>document.getElementById('near-'+f)?.setAttribute('aria-pressed',String(nearFilter===f)));updateNearbyPins(false);let box=document.getElementById('nearby-list');if(!box)return;let sum=document.getElementById('featured-summary');if(sum)sum.textContent=featuredLoading?'📍 주변 대표 관광지를 불러오는 중이에요…':featuredPlaces.length?'📍 대표 관광지 '+featuredPlaces.length+'곳 · 관광지 편집 선정 (공식 인기순위 아님)':featuredError;let quick=document.getElementById('featured-quicklinks');if(quick){quick.innerHTML=featuredPlaces.map((p,i)=>'<button type="button" class="light hb-famous-chip" data-featured-jump="'+i+'">'+safe(p.name)+'</button>').join('');quick.querySelectorAll('[data-featured-jump]').forEach(b=>b.onclick=()=>{let p=featuredPlaces[Number(b.dataset.featuredJump)];if(!p)return;if(nearbyMap&&window.naver?.maps){nearbyMap.setCenter(new window.naver.maps.LatLng(p.lat,p.lng));nearbyMap.setZoom(15)}document.getElementById('nearby-map')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})})};const filtered=nearFilter==='famous'?featuredPlaces:nearbyItems.filter(p=>nearFilter==='all'||nearFilter==='food'&&p.kind==='food'||nearFilter==='spot'&&['spot','culture'].includes(p.kind));if(nearFilter==='famous'&&featuredLoading){box.innerHTML='<p class="muted">유명 관광지를 검색하고 있어요…</p>';return}if(nearFilter!=='famous'&&nearbyLoading&&!filtered.length){box.innerHTML='<p class="muted">주변 관광지와 식당을 찾고 있어요…</p>';return}if(!filtered.length){box.innerHTML='<p class="muted">'+(nearFilter==='famous'?safe(featuredError||'근처 검증된 유명 관광지를 찾지 못했어요.'):safe(nearbyError||'이 조건에서 검색된 장소가 없어요.'))+'</p>';return}box.innerHTML='<div class="grid">'+filtered.slice(0,30).map(p=>'<div class="card"'+(nearbySelectedId===p.id?' style="outline:2px solid #285C50"':'')+'><span class="chip">'+(p.featured?'⭐ 주요 관광명소':p.kind==='food'?'🍚 음식점':safe(p.subtype||(p.kind==='culture'?'문화시설':'관광지')))+'</span><h3>'+safe(p.name)+'</h3><p class="muted">'+safe(p.address||'주소 미제공')+'</p>'+(p.discoverySource==='keyword_snapshot'?'<p class="muted">공식 키워드 조회 보강 · '+safe(p.collectedAt||'조회일 미확인')+' · 현재 정보 확인 필요</p>':'')+'<p class="muted">'+safe(p.featured?nearbyCenterLabel:nearbyResultCenterLabel)+'에서 직선거리 '+safe(p.distanceKm)+'km · 보행 거리 및 접근성 미확인</p><div class="actions">'+(p.featured?'<button class="light" data-zoom-featured="'+safe(p.id)+'">지도에서 보기</button>':'')+'<a href="'+safe(hbNearbyDetailLink(p))+'">장소 상세 보기</a><a target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(p.lat+','+p.lng)+'">장소 보기 ↗</a><button class="light" data-near-map="'+safe(p.id)+'" aria-pressed="'+String(nearbySelectedId===p.id)+'">지도에서 선택</button><button type="button" class="light" data-near-pick="'+safe(p.id)+'">'+(s.chosen.includes(p.id)?'선택됨':'일정에 담기')+'</button></div></div>').join('')+'</div>';box.querySelectorAll('[data-near-map]').forEach(b=>b.onclick=()=>hbSelectNearbyPlace(b.dataset.nearMap,true));box.querySelectorAll('[data-near-pick]').forEach(b=>b.onclick=()=>{let p=[...featuredPlaces,...nearbyItems].find(v=>v.id===b.dataset.nearPick);if(!p)return;if(!s.chosen.includes(p.id))s.chosen.push(p.id);if(!places.some(v=>v.id===p.id))places.push({...p,hbPickedRegion:s.region,accessFacts:[],accessStatus:'unknown'});save();drawNearbyList()});box.querySelectorAll('[data-zoom-featured]').forEach(b=>b.onclick=()=>{let p=featuredPlaces.find(v=>v.id===b.dataset.zoomFeatured);if(p&&nearbyMap&&window.naver?.maps){nearbyMap.setCenter(new window.naver.maps.LatLng(p.lat,p.lng));nearbyMap.setZoom(16);document.getElementById('nearby-map')?.scrollIntoView({behavior:'smooth',block:'center'})}})}


function hbBindNewTripNav(){
// Header travel creation is an explicit new-trip action, not a raw resume link.
const hbNewTripNav=document.querySelector('header nav a[href="#/new"]');
if(hbNewTripNav)hbNewTripNav.addEventListener('click',event=>{
 event.preventDefault();
 const initialized=hbEnsureOwnerState('/new');
 if(hbBeginNewTravel()===true&&initialized&&hbPlacesLoadedRegion!==s.region)load();
});
}
addEventListener('hashchange',render);hbBindNewTripNav();render()
})();
