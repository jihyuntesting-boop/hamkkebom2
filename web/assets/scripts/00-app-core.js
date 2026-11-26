
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
  hbPlacesLoadedRegion===s.region?(places.length?'':'조회된 장소가 없어요.'):'아직 장소를 조회하지 않았어요.';
 return '<div id="hb-place-data-state" role="'+(issue?'alert':'status')+'" class="message '+(issue?'error':'')+'"'+(status?'':' hidden')+'>'+status+'</div>';
}

function prefs(){
 return '<div class="row hb-prefs-row"><div class="field"><label for="region">여행 지역</label><select id="region"><option>서울</option><option>경기</option></select></div>'+
  '<div class="field"><label for="date">여행 날짜</label><input type="date" id="date" min="'+hbTodaySeoul()+'" required aria-describedby="hb-date-help" value="'+safe(s.date)+'"><small id="hb-date-help">한국 시간 기준 · 오늘부터 선택할 수 있어요.<span id="hb-date-weekday">'+(typeof hbTravelWeekday==='function'&&hbTravelWeekday(s.date)?' · 선택한 날: '+safe(s.date)+' ('+hbTravelWeekday(s.date).short+')':'')+'</span></small></div>'+
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
  if(typeof hbUpdateTripDateLabels==='function')hbUpdateTripDateLabels();
  if(!hbTravelDateError(s.date))getWeather();
 };
 document.getElementById('refresh').onclick=load;
}
// 2026-11-26 사용자 결정: 메인 홈에서 '전국 여행지 찾아보기'(hbRichDiscoveryAttach) 섹션을 표시하지 않는다. 되돌리려면 true.
const HB_HOME_RICH_DISCOVERY=false;
function home(){el.innerHTML='<section class="hb-landing-hero" aria-labelledby="hb-landing-title"><span class="hb-landing-eyebrow">'+hbIcon('flower')+'부모님과 함께하는 편안한 여행, 함께봄</span><h1 id="hb-landing-title">좋은 곳보다,<br>함께 가기 편한 곳.</h1><p class="hb-landing-intro">계단, 화장실, 쉬어갈 곳까지. 부모님과 함께 갈 때 필요한 정보를 살펴보고 우리 가족에게 맞는 여행 일정을 만들어보세요.</p><div class="hb-landing-benefits" aria-label="함께봄의 주요 기능"><div class="hb-benefit">'+hbIcon('walk')+'<strong>걷기 조건 선택</strong></div><div class="hb-benefit">'+hbIcon('stairs')+'<strong>계단·경사 정보</strong></div><div class="hb-benefit">'+hbIcon('restroom')+'<strong>화장실·휴식시설</strong></div><div class="hb-benefit">'+hbIcon('weather')+'<strong>날씨·일정 조정</strong></div></div><div class="hb-landing-actions"><button id="mom-start" class="hb-landing-cta" type="button">'+hbIcon('heart')+'부모님 맞춤 여행 만들기 <span aria-hidden="true">→</span></button>'+(s.hbDraftActive===true?'<button id="hb-resume-travel" class="hb-landing-link" type="button">작성 중인 여행 이어서 작성</button>':'')+'<button id="hb-map-go" class="hb-landing-link" type="button">지도에서 여행지 둘러보기</button></div><p class="hb-landing-note">※ 장소마다 제공되는 편의시설 정보를 출처와 함께 보여 드려요.</p></section><section class="hb-landing-how" aria-label="함께봄 사용 방법"><h2>여행 준비부터 여행 중까지</h2><div class="hb-how-grid"><div>'+hbIcon('pin')+'<strong>편한 장소 살펴보기</strong><p>장소마다 제공되는 편의시설 정보를 함께 살펴봐요.</p></div><div>'+hbIcon('calendar')+'<strong>우리 가족 일정 만들기</strong><p>방문 순서와 식사, 쉬는 시간을 고려해 일정을 준비해요.</p></div><div>'+hbIcon('heart')+'<strong>피곤하면 일정 가볍게</strong><p>그날 컨디션에 맞춰 남은 일정을 줄이는 변경안을 확인해요.</p></div></div></section><section class="panel hb-nearby-panel"><div class="row hb-nearby-head"><div><strong>'+hbIcon('pin')+'내 주변 관광지 지도</strong><div class="muted" id="nearby-status">위치를 확인하고 있어요…</div></div><div class="actions hb-actions-flush"><button class="light" id="locate-again">내 위치 다시 찾기</button><button class="light" id="locate-seoul">서울 중심 보기</button><button class="light" id="hb-search-map-center" type="button" disabled>이 지도 위치에서 다시 검색</button></div></div><div id="nearby-map"></div><div class="muted hb-map-credit">지도: 네이버지도 · 관광지: 한국관광공사 TourAPI · GPS는 허용 시에만 조회하며 저장하지 않아요.</div></section><section class="panel"><h2 class="hb-section-title">내 주변 여행지 · 식당</h2><div class="actions hb-actions-tight"><button id="near-spot" class="light" aria-pressed="true">관광지·문화시설</button><button id="near-food" class="light" aria-pressed="false">식당</button><button id="near-all" class="light" aria-pressed="false">전체</button></div><div id="featured-summary" class="muted hb-featured-summary"></div><div id="featured-quicklinks" class="hb-featured-quicklinks" aria-label="대표 관광지 바로가기"></div><div id="nearby-list"><p class="muted">실제 장소를 찾는 중이에요.</p></div></section><div class="actions">'+button('start','부모님 맞춤 여행 만들기 →')+'</div>';document.getElementById('start').onclick=hbBeginNewTravel;document.getElementById('mom-start').onclick=hbBeginNewTravel;const resume=document.getElementById('hb-resume-travel');if(resume)resume.onclick=hbResumeTravel;document.getElementById('hb-map-go').onclick=()=>{let map=document.getElementById('nearby-map'), target=map||document.getElementById('nearby-list');if(!target)return;target.setAttribute('tabindex','-1');target.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});target.focus({preventScroll:true})};document.getElementById('locate-again').onclick=()=>requestLocation(true);document.getElementById('locate-seoul').onclick=()=>{nearbyMode='서울 시청 중심 (기본 위치)';fetchNearby(37.5665,126.9780,false)};document.getElementById('hb-search-map-center').onclick=hbSearchMapCenter;['all','spot','food'].forEach(f=>document.getElementById('near-'+f).onclick=()=>hbSelectNearbyCategory(f));mountNearbyMap();if(HB_HOME_RICH_DISCOVERY&&typeof window!=='undefined'&&window.HBRichPlaceDetail)hbRichDiscoveryAttach();if(!geoStarted){geoStarted=true;requestLocation(false)}else{setNearbyStatus();drawNearbyList()}}
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
  const next={...s,date:hbTodaySeoul(),hbDateExplicit:false,hbDraftActive:true,hbStep:1,hbPlanStart:'',hbPlanEnd:'',hbDepartTime:'',hbReturnTime:'',hbReturnDay:0,chosen:[],hbMustVisitIds:[]};
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
  if(a!==null&&b!==null&&a>=b)return ['종료 시간은 시작보다 늦어야 해요. 하루 일정은 자정 전에 끝나도록 정해 주세요.'];
  return [];
}
// §5 typed or picked clock input → 24-hour HH:MM. Accepts 7:30, 07:30, 7.30,
// 0730, 730, 19:05, 7, 오전/오후 7:30, 7시 30분 and full-width digits.
function hbParseClockInput(raw){
  let text=String(raw??'').replace(/[０-９]/g,d=>String.fromCharCode(d.charCodeAt(0)-0xFEE0)).replace(/：/g,':').replace(/\s+/g,'').toLowerCase();
  if(!text)return {value:'',error:''};
  const format='시간은 7:30, 0730, 19:05처럼 입력해 주세요.';
  if(text.length>20)return {value:'',error:format};
  let meridiem=null;
  const mark=/^(오전|오후|am|pm)/.exec(text)||/(오전|오후|am|pm)$/.exec(text);
  if(mark){meridiem=/오후|pm/.test(mark[1])?'pm':'am';text=text.replace(mark[1],'');}
  text=text.replace(/^(\d{1,2})시(\d{1,2})분?$/,(_,h,m)=>h+':'+m.padStart(2,'0')).replace(/^(\d{1,2})시$/,'$1');
  const match=/^(\d{1,2})[:.](\d{2})$/.exec(text)||/^(\d{1,2})(\d{2})$/.exec(text);
  let hour,minute;
  if(match){hour=Number(match[1]);minute=Number(match[2]);}
  else if(/^\d{1,2}$/.test(text)){hour=Number(text);minute=0;}
  else return {value:'',error:format};
  if(hour===24&&minute===0)return {value:'',error:'24:00은 입력할 수 없어요. 자정은 00:00으로 입력해 주세요.'};
  if(minute>59)return {value:'',error:'분은 00~59 사이로 입력해 주세요.'};
  if(meridiem){
    if(hour<1||hour>12)return {value:'',error:'오전·오후와 함께 쓸 때는 1~12시로 입력해 주세요.'};
    hour=meridiem==='pm'?(hour===12?12:hour+12):(hour===12?0:hour);
  }
  if(hour>23)return {value:'',error:'시는 0~23 사이로 입력해 주세요.'};
  return {value:String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0'),error:''};
}
// Calendar weekday of a Seoul travel date (YYYY-MM-DD is already a Seoul
// calendar date, so UTC arithmetic on it yields the Seoul weekday).
const HB_WEEKDAYS=['일','월','화','수','목','금','토'];
function hbTravelWeekday(date,offset=0){
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isInteger(offset))return null;
  const base=Date.parse(date+'T00:00:00Z');
  if(!Number.isFinite(base)||new Date(base).toISOString().slice(0,10)!==date)return null;
  const day=new Date(base+offset*86400000),index=day.getUTCDay();
  return {date:day.toISOString().slice(0,10),index,short:HB_WEEKDAYS[index],
    label:(day.getUTCMonth()+1)+'월 '+day.getUTCDate()+'일 ('+HB_WEEKDAYS[index]+')'};
}
// Return day: 0 = travel date. Day trips may return the next day (after
// midnight); overnight trips up to the 7th day. Without an explicit later day,
// a return earlier than the departure is an error, never silently "next day".
function hbReturnDayLimit(tripType){return tripType==='overnight'?6:1}
function hbReturnDay(value,tripType){
  const n=Number(value??0);
  return Number.isInteger(n)&&n>=0&&n<=hbReturnDayLimit(tripType)?n:null;
}
// Home-based step-1 times (집 출발 / 집 도착 희망). Stored only when normalized.
function hbHomeTimeErrors(depart,back,returnDay=0,tripType='day'){
  const a=hbParseClockInput(depart),b=hbParseClockInput(back),errors=[],day=hbReturnDay(returnDay,tripType);
  if(a.error)errors.push('여행 출발 희망 시각: '+a.error);
  if(b.error)errors.push('집 도착 희망 시각: '+b.error);
  if(day===null)errors.push('집 도착 날짜를 다시 선택해 주세요.');
  else if(!errors.length&&!day&&a.value&&b.value&&a.value>=b.value)
    errors.push('종료 시간(집 도착 희망 시각)은 같은 날의 여행 출발 희망 시각보다 늦어야 해요. 자정을 넘겨 도착하려면 집 도착 날짜를 다음 날로 골라 주세요.');
  return errors;
}
function hbClockSummary(date,time,offset,verb){
  const day=hbTravelWeekday(date,offset);
  if(!day)return '여행 날짜를 먼저 선택해 주세요.';
  const parsed=hbParseClockInput(time);
  if(parsed.error)return day.label+' · 시각을 다시 확인해 주세요';
  return parsed.value?day.label+' '+parsed.value+' '+verb:day.label+' · 시각을 비우면 일정에 맞춰 제안해요';
}
/** P1-7 (2026-11-26): the single reader for the "여행 조건" time summary. 1단계 saves the home times in
 * hbDepartTime/hbReturnTime(+hbReturnDay). Older drafts may only hold hbPlanStart/hbPlanEnd, which mean the
 * first-visit window (a different value the engine still uses), so they are shown under their own label. */
function hbTripTimeSummary(state){
  const st=state||{};
  const parts=[typeof st.date==='string'?st.date:''];
  const depart=hbParseClockInput(st.hbDepartTime??''),back=hbParseClockInput(st.hbReturnTime??'');
  const day=hbReturnDay(st.hbReturnDay??0,st.hbDuration||'day')??0;
  if(!depart.error&&depart.value)parts.push('집 출발 '+depart.value);
  if(!back.error&&back.value)parts.push('집 도착 '+(day===1?'다음 날 ':day>1?day+'일 뒤 ':'')+back.value);
  if(parts.length===1){
    const a=hbParseClockInput(st.hbPlanStart??''),b=hbParseClockInput(st.hbPlanEnd??'');
    const first=!a.error&&a.value?a.value:'',last=!b.error&&b.value?b.value:'';
    parts.push(first||last?'첫 방문 '+(first||'자동')+' ~ '+(last||'자동'):'시간은 일정에 맞춰 제안해요');
  }
  return parts.filter(Boolean).join(' · ');
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
  errors.push(...hbHomeTimeErrors(profile.hbDepartTime??'',profile.hbReturnTime??'',profile.hbReturnDay??0,profile.hbDuration||'day'));
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
// UI-02 stepper navigation: the current and earlier steps are always reachable;
// a later step only when every earlier step is valid (same rule as "다음").
function hbStepTarget(state,n,current,today=hbTodaySeoul()){
  if(![1,2,3].includes(n))return {ok:false,reason:'이동할 단계를 찾을 수 없어요.'};
  if(n<=current)return {ok:true};
  const result=hbTravelInput(state,today);
  const basic=result.errors.filter(x=>!x.includes('걸을 수 있는 시간')&&!x.includes('계단 이용 조건'));
  if(basic.length)return {ok:false,step:1,reason:'먼저 1단계 여행 정보를 확인해 주세요. '+basic.join(' ')};
  if(n===3&&result.errors.length)return {ok:false,step:2,reason:'먼저 2단계 이동 조건을 선택해 주세요. '+result.errors.join(' ')};
  return {ok:true};
}
let hbStepNavBound=false;
function hbBindStepNav(){
  if(hbStepNavBound||!el||typeof el.addEventListener!=='function')return;
  hbStepNavBound=true;
  el.addEventListener('click',event=>{
    const button=event.target?.closest?.('[data-hb-goto-step]');
    if(!button||!el.contains(button))return;
    const n=Number(button.dataset.hbGotoStep),current=Number(s.hbStep)||1;
    if(n===current){el.querySelector('h2')?.focus();return}
    s=hbRefreshAutomaticDate(s);
    const target=hbStepTarget(s,n,current);
    if(!target.ok){
      // Open the step that still needs input when it is reachable (e.g. 1 → 3 with
      // step 2 incomplete opens step 2), otherwise stay; always explain next to the stepper.
      const fix=target.step&&target.step!==current&&hbStepTarget(s,target.step,current).ok?target.step:current;
      if(fix!==current){s.hbStep=fix;s.hbDraftActive=true;try{save()}catch{}newPlan();}
      hbShowStepNotice(target.reason,fix);
      return;
    }
    s.hbStep=n;s.hbDraftActive=true;
    try{save()}catch{}
    newPlan();
    el.querySelector('h2')?.focus();
  });
}
// The blocked-step reason is shown right under the stepper (not only in the
// form-bottom #hb-step-error) and focus moves to the first input still needed.
function hbStepFocusSelector(state,step){
  if(step===2)return state.hbWalkConfirmed?'[data-hb-stairs]':'[data-hb-walk]';
  if(step===1){
    if(hbTravelDateError(state.date))return '#date';
    if(hbHomeTimeErrors(state.hbDepartTime??'',state.hbReturnTime??'',state.hbReturnDay??0,state.hbDuration||'day').length)return '#hb-trip-start';
    return '#hb-next';
  }
  return 'h2';
}
function hbShowStepNotice(reason,step){
  const notice=document.getElementById('hb-step-nav-notice');
  if(notice){notice.hidden=false;notice.textContent=reason}
  const box=document.getElementById('hb-step-error');
  if(box){box.hidden=false;box.textContent=reason}
  const field=document.querySelector(hbStepFocusSelector(s,step));
  if(field&&typeof field.focus==='function')field.focus({preventScroll:true});
  if(notice&&typeof notice.scrollIntoView==='function')notice.scrollIntoView({block:'nearest'});
}
function hbReturnDayOptions(){
  const limit=hbReturnDayLimit(s.hbDuration||'day'),chosen=hbReturnDay(s.hbReturnDay,s.hbDuration||'day')??0;
  let html='';
  for(let n=0;n<=limit;n++){
    const day=hbTravelWeekday(s.date,n);
    html+='<option value="'+n+'"'+(n===chosen?' selected':'')+'>'+(n===0?'같은 날':n===1?'다음 날':(n+1)+'일차')+(day?' · '+day.label:'')+'</option>';
  }
  return html;
}
function hbClockField(id,label,value,help,withDay=false){
  const parsed=hbParseClockInput(value??'');
  return '<div class="field hb-clock-field"><label for="'+id+'">'+label+'</label><div class="hb-clock-inputs"><input type="text" id="'+id+'" inputmode="decimal" autocomplete="off" maxlength="20" placeholder="예: 07:30" aria-describedby="'+id+'-help hb-step-error"'+(parsed.error?' aria-invalid="true"':'')+' value="'+safe(value??'')+'">'+
    '<input type="time" id="'+id+'-picker" class="hb-clock-picker" aria-label="'+label.replace(/ \(선택\)$/,'')+' 시계로 고르기" value="'+safe(parsed.error?'':parsed.value)+'">'+(withDay?'<select id="'+id+'-day" class="hb-clock-day" aria-label="집 도착 날짜">'+hbReturnDayOptions()+'</select>':'')+'</div><small id="'+id+'-help">'+help+'</small><p class="hb-clock-summary" id="'+id+'-summary" aria-live="polite"></p></div>';
}
function hbUpdateTripDateLabels(){
  const weekday=document.getElementById('hb-date-weekday'),day=hbTravelWeekday(s.date);
  if(weekday)weekday.textContent=day?' · 선택한 날: '+day.date+' ('+day.short+')':' · 날짜를 먼저 선택해 주세요';
  const start=document.getElementById('hb-trip-start-summary'),end=document.getElementById('hb-trip-end-summary');
  if(start)start.textContent=hbClockSummary(s.date,s.hbDepartTime??'',0,'출발');
  if(end){
    const offset=hbReturnDay(s.hbReturnDay,s.hbDuration||'day');
    end.textContent=offset===null?'집 도착 날짜를 다시 선택해 주세요.':hbClockSummary(s.date,s.hbReturnTime??'',offset,'도착')+(offset===0?' · 같은 날로 해석해요':'');
  }
  // 출발지·출발/도착 희망 시각이 바뀌면 같은 이동시간 규칙(hbHomeLeg)으로 미리보기를 다시 그린다.
  const preview=document.getElementById('hb-trip-home-preview');
  if(preview&&typeof hbHomePreviewMarkup==='function'){const html=hbHomePreviewMarkup();if(preview.innerHTML!==html)preview.innerHTML=html;}
}
function hbBindClockFields(pairs){
  const refresh=()=>{const box=document.getElementById('hb-step-error');if(box)box.textContent=[...hbHomeTimeErrors(s.hbDepartTime??'',s.hbReturnTime??'',s.hbReturnDay??0,s.hbDuration||'day'),...hbTimeInputErrors(s.hbPlanStart??'',s.hbPlanEnd??'')].join(' ');hbUpdateTripDateLabels();};
  const daySelect=document.getElementById('hb-trip-end-day');
  if(daySelect)daySelect.onchange=()=>{s.hbReturnDay=Number(daySelect.value);try{save()}catch{}refresh();};
  refresh();
  for(const [id,key] of pairs){
    const field=document.getElementById(id),picker=document.getElementById(id+'-picker');
    if(!field)continue;
    const commit=(raw,normalize)=>{
      const parsed=hbParseClockInput(raw);
      s[key]=parsed.error?String(raw??'').trim().slice(0,20):parsed.value;
      try{save()}catch{}
      if(normalize&&!parsed.error)field.value=parsed.value;
      if(picker)picker.value=parsed.error?'':parsed.value;
      if(parsed.error)field.setAttribute('aria-invalid','true');else field.removeAttribute('aria-invalid');
      refresh();
    };
    // Typing never shows a format error mid-entry; the change event validates and normalizes.
    field.oninput=()=>{if(!hbParseClockInput(field.value).error)commit(field.value,false)};
    field.onchange=()=>commit(field.value,true);
    if(picker)picker.onchange=()=>{field.value=picker.value;commit(picker.value,true)};
  }
}
function newPlan(){
  s=hbRefreshAutomaticDate(s);
  const dateIssue=hbTravelDateError(s.date);
  const timeIssues=[...hbTimeInputErrors(s.hbPlanStart??'',s.hbPlanEnd??''),...hbHomeTimeErrors(s.hbDepartTime??'',s.hbReturnTime??'',s.hbReturnDay??0,s.hbDuration||'day')];
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
  hbBindStepNav();
  const stepLink=(name,i)=>{
    const n=i+1,target=hbStepTarget(s,n,step),current=n===step;
    return '<button type="button" class="hb-step-link" data-hb-goto-step="'+n+'"'+
      (current?' aria-label="'+n+'단계 '+name+' (현재 단계)"':target.ok?' aria-label="'+n+'단계 '+name+' 화면으로 이동"':' aria-disabled="true" aria-label="'+n+'단계 '+name+' (앞 단계를 먼저 완료해 주세요)" aria-describedby="hb-step-error"')+
      '><span class="hb-step-num" aria-hidden="true">'+n+'</span>'+name+'</button>';
  };
  const intro=hbDiscoveryPendingMarkup()+'<h1>부모님과 여행 만들기</h1><p class="muted">여행 지역과 이동 조건부터 정해요.</p><ol class="hb-progress" aria-label="여행 만들기 3단계 중 '+step+'단계">'+['여행 정보','이동 조건','선호사항'].map((name,i)=>'<li'+(i+1===step?' aria-current="step"':i+1<step?' class="hb-step-done"':'')+'>'+stepLink(name,i)+'</li>').join('')+'</ol><p id="hb-step-nav-notice" class="hb-step-nav-notice" role="status" aria-live="polite" hidden></p>';
  if(step===1){
    el.innerHTML=intro+'<section class="panel hb-ai-box" id="hb-ai-slot" data-hb-ai aria-labelledby="hb-ai-title" hidden></section><section class="panel"><h2 tabindex="-1">1. 여행 정보</h2>'+prefs()+(s.hbDateRefreshedFrom?'<p role="status">이전에 저장된 날짜를 오늘로 갱신했어요. 기존 일정의 날짜는 그대로 유지돼요.</p>':'')+'<div class="actions"><button class="light" type="button" id="hb-date-today">오늘</button><button class="light" type="button" id="hb-date-tomorrow">내일</button></div><div class="row hb-trip-time-row">'+hbClockField('hb-trip-start','여행 출발 희망 시각 (선택)',s.hbDepartTime,'집(출발지)에서 출발하는 시각')+hbClockField('hb-trip-end','집 도착 희망 시각 (선택)',s.hbReturnTime,'집(귀가 위치)에 도착하고 싶은 날짜와 시각',true)+'</div><div id="hb-trip-home-preview" class="hb-trip-home-preview" aria-live="polite">'+(typeof hbHomePreviewMarkup==='function'?hbHomePreviewMarkup():'')+'</div><p class="muted" id="hb-trip-time-help">시간을 비워 두면 선택한 장소에 맞춰 시간표 초안을 제안해요. 숫자로 7:30, 0730, 19:05처럼 직접 입력하거나 시계로 고를 수 있고, 새벽·저녁 시간도 가능해요. 출발 시각을 정하면 출발지에서 첫 방문지까지 이동시간을 더해 첫 방문지 도착 시각을 잡아요. 네이버 자동차 경로로 계산한 이동시간이 있으면 그 값을, 없으면 이동 약 25분 (예상)으로 넣어요.</p>'+((s.hbPlanStart||s.hbPlanEnd)?'<p class="hb-legacy-time-note" role="note">이전에 저장한 첫 방문지 기준 시각('+safe(s.hbPlanStart||'제안')+' ~ '+safe(s.hbPlanEnd||'제안')+')은 그 의미 그대로 유지돼요. 값이 있으면 집 출발·도착 희망 시각보다 우선해요. <button type="button" class="light" id="hb-legacy-time-clear">이전 첫 방문지 시각 지우기</button></p>':'')+hbTripOriginStepMarkup()+'<div class="row"><div class="field"><label for="hb-duration">여행 형태</label><select id="hb-duration"><option value="day">당일 여행</option><option value="overnight">숙박 여행</option></select></div><div class="field"><label for="hb-transport">주요 이동 수단</label><select id="hb-transport"><option value="car">자동차</option><option value="transit">대중교통</option><option value="mixed">상황에 따라 선택</option></select></div><div class="field"><label for="hb-party">동행 인원</label><select id="hb-party"><option value="2">2명</option><option value="3">3명</option><option value="4">4명</option><option value="5">5명</option><option value="6">6명</option><option value="7">7명</option><option value="8">8명</option><option value="9">9명</option><option value="10">10명</option><option value="11">11명</option><option value="12">12명</option></select></div></div><div class="actions"><button type="button" id="hb-next">다음: 이동 조건 →</button></div><p class="muted" id="hb-step-error" role="alert"></p></section>'+(typeof weatherCard==='function'?weatherCard():'');
    hbDiscoveryBindPending(newPlan);bindPrefs();hbAiMountParse(document.getElementById('hb-ai-slot'));
    const dateField=document.getElementById('date');
    const chooseDate=value=>{dateField.value=value;dateField.onchange({target:dateField});document.getElementById('hb-step-error').textContent='';};
    document.getElementById('hb-date-today').onclick=()=>chooseDate(hbTodaySeoul());
    document.getElementById('hb-date-tomorrow').onclick=()=>chooseDate(new Date(Date.parse(hbTodaySeoul()+'T00:00:00Z')+86400000).toISOString().slice(0,10));
    hbBindClockFields([['hb-trip-start','hbDepartTime'],['hb-trip-end','hbReturnTime']]);
    const legacyClear=document.getElementById('hb-legacy-time-clear');
    if(legacyClear)legacyClear.onclick=()=>{const before={start:s.hbPlanStart,end:s.hbPlanEnd};s.hbPlanStart='';s.hbPlanEnd='';try{save()}catch{s.hbPlanStart=before.start;s.hbPlanEnd=before.end;return;}newPlan();document.getElementById('hb-trip-start')?.focus();};
    dateField.addEventListener('change',hbUpdateTripDateLabels);
    hbBindTripOriginStep(()=>{newPlan();document.getElementById('hb-trip-origin-title')?.scrollIntoView?.({block:'nearest'})});
    document.getElementById('hb-step-error').textContent=[dateIssue,...timeIssues].filter(Boolean).join(' ');
    const ids=[['hb-duration','hbDuration','day'],['hb-transport','hbTransport','car'],['hb-party','hbParty','2']];
    ids.forEach(([id,key,defaultValue])=>{const x=document.getElementById(id);x.value=s[key]||defaultValue;x.onchange=()=>{s[key]=x.value;
      if(key==='hbDuration'){if(hbReturnDay(s.hbReturnDay,s.hbDuration)===null)s.hbReturnDay=Math.min(Number(s.hbReturnDay)||0,hbReturnDayLimit(s.hbDuration));save();newPlan();document.getElementById('hb-duration')?.focus();return;}
      save()}});
    document.getElementById('hb-next').onclick=()=>{s=hbRefreshAutomaticDate(s);dateField.value=s.date;dateField.min=hbTodaySeoul();const result=hbTravelInput(s);const issues=result.errors.filter(x=>!x.includes('걸을 수 있는 시간')&&!x.includes('계단 이용 조건'));if(issues.length){document.getElementById('hb-step-error').textContent=issues.join(' ');return;}changeStep(2)};
    return;
  }
  if(step===2){
    el.innerHTML=intro+'<section class="panel"><h2 tabindex="-1">2. 이동 조건</h2><p class="muted">필수 항목이에요.</p><h3>한 번에 얼마나 걸을 수 있나요?</h3><div class="hb-choice-grid">'+card(walkChoices,'walk',s.hbWalkConfirmed?s.walk:null)+'</div><h3>계단 이용은 어떤가요?</h3><div class="hb-choice-grid">'+card(stairChoices,'stairs',s.hbStairsChoice)+'</div><div class="actions">'+prev+'<button type="button" id="hb-next">다음: 선호사항 →</button></div><p id="hb-step-error" class="warn" role="alert" hidden></p></section>';
    hbDiscoveryBindPending(newPlan);document.querySelectorAll('[data-hb-walk]').forEach(b=>b.onclick=()=>{s.walk=b.dataset.hbWalk;s.hbWalkConfirmed=true;save();refreshChoice('[data-hb-walk="'+b.dataset.hbWalk+'"]')});
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
  const extraMarkup='<h3>식사 선호 (선택)</h3><p class="muted">식사 선호는 현재 식당 자동 필터로 적용되지 않아요.</p><div class="hb-choice-grid">'+foodOptions.map(([id,label])=>'<button type="button" class="hb-choice '+(s.hbFoodPreferences.includes(id)?'chosen':'')+'" data-hb-food="'+id+'" aria-pressed="'+String(s.hbFoodPreferences.includes(id))+'">'+safe(label)+'</button>').join('')+'</div>';
  el.innerHTML=intro+'<section class="panel"><h2 tabindex="-1">3. 선호사항</h2><p class="muted">편의시설 정보는 확인된 자료 범위 안에서 참고할 수 있어요. 추가 선택은 선택사항이에요.</p>'+mobilityMarkup+'<h3>어떤 장소를 먼저 볼까요?</h3><div class="hb-choice-grid">'+card([['all','관광지와 식당 모두'],['spot','관광지·문화시설'],['food','식당']], 'interest',s.hbInterest||'all')+'</div><h3>중요한 편의시설이 있나요?</h3><div class="hb-choice-grid">'+needs.map(([id,name])=>'<button type="button" class="hb-choice '+(s.momNeeds.includes(id)?'chosen':'')+'" data-hb-need="'+id+'" aria-pressed="'+String(s.momNeeds.includes(id))+'">'+safe(name)+'</button>').join('')+'</div>'+optionalMarkup+extraMarkup+'<div class="actions">'+prev+'<button type="button" id="hb-finish">이 조건으로 장소 살펴보기 →</button></div><p id="hb-finish-error" role="alert" class="warn"></p></section>';
  hbDiscoveryBindPending(newPlan);document.querySelectorAll('[data-hb-interest]').forEach(b=>b.onclick=()=>{s.hbInterest=b.dataset.hbInterest;s.hbBrowseFilter=s.hbInterest;save();refreshChoice('[data-hb-interest="'+b.dataset.hbInterest+'"]')});
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
// HB_AI_ASSIST_START — 생성형 AI 보조(선택). 서버 /api/ai-assist 가 키 미등록·실패면
// 이 영역을 통째로 숨기고 기존 수동 입력을 그대로 쓴다(오류·미지원 문구를 보이지 않음).
// AI 제안은 미리보기 후 사용자가 "이 조건으로 채우기"를 눌러야만 적용된다.
let hbAiStatusPromise=null,hbAiOff=false,hbAiNotice='',hbAiDraftText='';
function hbAiQueryStatus(fetchImpl){
 return Promise.resolve().then(()=>fetchImpl('/api/ai-assist',{headers:{Accept:'application/json'},
  signal:typeof AbortSignal!=='undefined'&&AbortSignal.timeout?AbortSignal.timeout(4000):undefined}))
  .then(r=>r&&r.ok?r.json():null).then(d=>!!(d&&d.enabled===true)).catch(()=>false);
}
function hbAiAvailable(fetchImpl){
 if(hbAiOff)return Promise.resolve(false);
 if(fetchImpl)return hbAiQueryStatus(fetchImpl);
 if(typeof fetch!=='function')return Promise.resolve(false);
 if(!hbAiStatusPromise)hbAiStatusPromise=hbAiQueryStatus(fetch);
 return hbAiStatusPromise.then(ok=>ok&&!hbAiOff);
}
async function hbAiPost(body,fetchImpl){
 const call=fetchImpl||fetch;
 const r=await call('/api/ai-assist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
  signal:typeof AbortSignal!=='undefined'&&AbortSignal.timeout?AbortSignal.timeout(12000):undefined});
 if(!r||!r.ok)throw Error('ai-assist');
 return r.json();
}
// 실패하면 이번 방문 동안 AI 영역을 모두 숨긴다. 입력은 수동 폼에서 계속할 수 있다.
function hbAiDisable(){
 hbAiOff=true;
 if(typeof document!=='undefined')document.querySelectorAll('[data-hb-ai]').forEach(node=>{node.hidden=true;node.innerHTML=''});
}
const HB_AI_FIELD_VIEW={
 region:['여행 지역',v=>v],
 date:['여행 날짜',v=>{const d=hbTravelWeekday(v);return d?d.label:v}],
 tripType:['여행 형태',v=>({day:'당일 여행',overnight:'숙박 여행'})[v]],
 transport:['주요 이동 수단',v=>({car:'자동차',transit:'대중교통',mixed:'상황에 따라 선택'})[v]],
 partySize:['동행 인원',v=>v+'명'],
 walkingMinutes:['한 번에 걸을 수 있는 시간',v=>({5:'5분 이하',10:'10분 정도',15:'15분 정도',20:'20분 정도',30:'30분 이상'})[v]],
 stairs:['계단 이용',v=>({possible:'계단 이용 가능',avoid:'가능하면 계단 피하기',impossible:'계단 이용 불가'})[v]],
 slopePreference:['경사',v=>({avoid_steep:'가파른 경사 피하기',flexible:'특별한 제한 없음'})[v]],
 restIntervalMinutes:['휴식 간격',v=>'약 '+v+'분마다'],
 indoorPreference:['선호 장소',v=>({any:'실내외 모두',indoor:'실내 위주',outdoor:'야외 위주'})[v]],
 mobilityAid:['이동 보조기구',v=>hbMobilityAidLabels[v]],
 placePreference:['먼저 볼 장소',v=>({all:'관광지와 식당 모두',spot:'관광지·문화시설',food:'식당'})[v]],
 facilityNeeds:['중요한 편의시설',v=>v.map(x=>({toilet:'화장실 가까이',rest:'쉴 곳 많게',dropoff:'입구 가까운 하차',elevator:'엘리베이터',wheelchair:'휠체어 편의시설'})[x]).join(', ')],
 foodPreferences:['식사 선호',v=>v.map(x=>({less_spicy:'덜 매운 음식',easy_to_chew:'씹기 편한 음식',vegetarian:'채식'})[x]).join(', ')]
};
/** 서버 제안 → 기존 로컬 입력 상태 키로 옮길 패치. 허용 값만 받고, 기존 선택은 지우지 않는다(목록은 합친다). */
function hbAiSuggestionPatch(suggestion,state,today=hbTodaySeoul()){
 const x=suggestion&&typeof suggestion==='object'&&!Array.isArray(suggestion)?suggestion:{};
 const st=state&&typeof state==='object'?state:{};
 const patch={},rows=[];
 const one=(key,choices)=>choices.includes(x[key])?x[key]:null;
 const list=(key,choices)=>Array.isArray(x[key])?[...new Set(x[key].filter(v=>choices.includes(v)))]:[];
 const row=(key,value)=>rows.push({key,label:HB_AI_FIELD_VIEW[key][0],value:HB_AI_FIELD_VIEW[key][1](value)});
 const region=one('region',['서울','경기']);
 if(region){patch.region=region;row('region',region)}
 if(typeof x.date==='string'&&!hbTravelDateError(x.date,today)){patch.date=x.date;patch.hbDateExplicit=true;row('date',x.date)}
 const trip=one('tripType',['day','overnight']);
 if(trip){patch.hbDuration=trip;row('tripType',trip)}
 const transport=one('transport',['car','transit','mixed']);
 if(transport){patch.hbTransport=transport;row('transport',transport)}
 if(Number.isInteger(x.partySize)&&x.partySize>=2&&x.partySize<=12){patch.hbParty=String(x.partySize);row('partySize',x.partySize)}
 const walk=one('walkingMinutes',[5,10,15,20,30]);
 if(walk){patch.walk=String(walk);patch.hbWalkConfirmed=true;row('walkingMinutes',walk)}
 const stairs=one('stairs',['impossible','avoid','possible']);
 if(stairs){patch.hbStairsChoice=stairs;patch.stairs=stairs==='possible'?'possible':'avoid';row('stairs',stairs)}
 const slope=one('slopePreference',['avoid_steep','flexible']);
 if(slope){patch.hbSlopePreference=slope;row('slopePreference',slope)}
 const rest=one('restIntervalMinutes',[30,45,60]);
 if(rest){patch.hbRestIntervalMinutes=rest;row('restIntervalMinutes',rest)}
 const indoor=one('indoorPreference',['any','indoor','outdoor']);
 if(indoor){patch.hbIndoorPreference=indoor;row('indoorPreference',indoor)}
 const aid=one('mobilityAid',['none','cane','walker','wheelchair','other']);
 if(aid){patch.hbMobilityAid=aid;row('mobilityAid',aid)}
 const interest=one('placePreference',['all','spot','food']);
 if(interest){patch.hbInterest=interest;patch.hbBrowseFilter=interest;row('placePreference',interest)}
 const needs=list('facilityNeeds',['toilet','rest','dropoff','elevator','wheelchair']);
 if(needs.length){patch.momNeeds=[...new Set([...(Array.isArray(st.momNeeds)?st.momNeeds:[]),...needs])];row('facilityNeeds',needs)}
 const foods=list('foodPreferences',['less_spicy','easy_to_chew','vegetarian']);
 if(foods.length){patch.hbFoodPreferences=[...new Set([...(Array.isArray(st.hbFoodPreferences)?st.hbFoodPreferences:[]),...foods])];row('foodPreferences',foods)}
 return {patch,rows,regionChange:!!(patch.region&&patch.region!==st.region)};
}
function hbAiApplySuggestion(suggestion){
 const {patch,rows,regionChange}=hbAiSuggestionPatch(suggestion,s);
 if(!rows.length)return false;
 const before=s;
 if(regionChange){hbKeepItineraryContext();Object.assign(patch,{chosen:[],hbBrowseQuery:'',hbBrowseLimit:30});}
 const next={...s,...patch,hbDraftActive:true,hbStep:1};
 if(patch.date)delete next.hbDateRefreshedFrom;
 if(patch.hbDuration&&hbReturnDay(next.hbReturnDay,next.hbDuration)===null)next.hbReturnDay=Math.min(Number(next.hbReturnDay)||0,hbReturnDayLimit(next.hbDuration));
 s=next;
 try{save()}catch{s=before;return false}
 hbAiNotice='문장에서 찾은 조건 '+rows.length+'개를 채웠어요. 단계마다 내용을 확인하고 고칠 수 있어요.';
 newPlan();
 if(regionChange&&typeof load==='function')load();
 if(patch.date&&typeof getWeather==='function')getWeather();
 return true;
}
function hbAiParseMarkup(){
 return '<h2 id="hb-ai-title" tabindex="-1">말로 여행 조건 적기 (선택)</h2>'+
  (hbAiNotice?'<p class="hb-ai-notice" role="status">'+safe(hbAiNotice)+'</p>':'')+
  '<p class="muted" id="hb-ai-help">예: 엄마가 무릎이 안 좋아서 계단 적고 화장실 가까운 곳, 이번 토요일 서울 근교. 적은 문장은 조건을 정리하는 데에만 AI(Anthropic Claude)로 보내고 저장하지 않아요. 이름이나 진단명은 적지 않아도 돼요.</p>'+
  '<div class="field"><label for="hb-ai-text">원하는 여행을 한두 문장으로 적어 주세요</label><textarea id="hb-ai-text" rows="3" maxlength="300" aria-describedby="hb-ai-help hb-ai-count"></textarea><small id="hb-ai-count">0/300자</small></div>'+
  '<div class="actions"><button type="button" id="hb-ai-fill">조건 채우기</button></div><div id="hb-ai-result" aria-live="polite"></div>';
}
function hbAiMountParse(slot){
 if(!slot)return Promise.resolve(false);
 return hbAiAvailable().then(ok=>{
  if(!ok||slot.isConnected===false)return false;
  const announce=!!hbAiNotice;
  slot.innerHTML=hbAiParseMarkup();slot.hidden=false;hbAiNotice='';
  if(announce)slot.querySelector('#hb-ai-title')?.focus();
  const text=slot.querySelector('#hb-ai-text'),fill=slot.querySelector('#hb-ai-fill'),out=slot.querySelector('#hb-ai-result'),count=slot.querySelector('#hb-ai-count');
  text.value=hbAiDraftText;count.textContent=text.value.length+'/300자';
  text.oninput=()=>{hbAiDraftText=text.value;count.textContent=text.value.length+'/300자'};
  fill.onclick=async()=>{
   const value=text.value.trim();
   if(!value){out.textContent='여행 조건을 한두 문장으로 적어 주세요.';text.focus();return}
   fill.disabled=true;fill.setAttribute('aria-busy','true');out.textContent='조건을 정리하는 중이에요.';
   let data=null;
   try{data=await hbAiPost({action:'parse',text:value.slice(0,300)})}catch{data=null}
   if(!slot.isConnected)return;
   fill.disabled=false;fill.removeAttribute('aria-busy');
   if(!data||!['ok','empty'].includes(data.status)){hbAiDisable();document.getElementById('region')?.focus();return}
   const view=hbAiSuggestionPatch(data.suggestion,s);
   if(!view.rows.length){out.innerHTML='<p>문장에서 채울 조건을 찾지 못했어요. 아래에서 직접 골라 주세요.</p>';return}
   out.innerHTML='<h3 id="hb-ai-preview-title" tabindex="-1">이렇게 채울까요?</h3><ul class="hb-ai-preview">'+
    view.rows.map(r=>'<li><strong>'+safe(r.label)+'</strong> · '+safe(r.value)+'</li>').join('')+'</ul>'+
    (view.regionChange&&Array.isArray(s.chosen)&&s.chosen.length?'<p class="warn">여행 지역이 바뀌면 담은 장소 선택이 초기화돼요. 저장한 일정은 유지돼요.</p>':'')+
    '<p class="muted">적용하기 전에는 아무것도 바뀌지 않아요. 적용한 뒤에도 각 단계에서 고칠 수 있어요.</p>'+
    '<div class="actions"><button type="button" id="hb-ai-apply">이 조건으로 채우기</button><button type="button" class="light" id="hb-ai-cancel">취소</button></div>';
   out.querySelector('#hb-ai-preview-title')?.focus();
   out.querySelector('#hb-ai-apply').onclick=()=>{if(!hbAiApplySuggestion(data.suggestion))out.textContent='조건을 저장하지 못했어요. 아래에서 직접 골라 주세요.'};
   out.querySelector('#hb-ai-cancel').onclick=()=>{out.textContent='채우지 않았어요. 아래에서 직접 골라도 돼요.';text.focus()};
  };
  return true;
 });
}
// HB_AI_ASSIST_END
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
  documented_route:'선택한 이동 조건과 맞는 동선 자료가 있어요.',
  required_stairs:'자료에 필수 계단이 있어 선택한 이동 조건과 맞지 않아요.',
  // 2026-11-26 사용자 결정(MVP): 미확인·확인 필요 문구는 보여 주지 않는다. 판정 근거가 없는 장소는 문장·배지 없이 후보로만 보인다.
  conflicting_evidence:'',
  stale_evidence:'',
  mobility_aid_unverified:'',
  insufficient_evidence:'',
  server_not_assessed:'',
  local_unverified:'',
  missing_reason:'',
  classification_mismatch:''
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
  hbSeasonalClearMap();
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
  // 여행 장소 찾기 shows only places meeting HB_TRIP_DATA_RULE; saved/selected places stay visible.
  if(ready)hbSeasonalEnsureFeatured(s.region);
  const tripKeep=hbTripKeepIds(chosen,s.stops);
  const curated=hbTripCuration(ready?hbTripCandidatePool(s.region):[],s.region,tripKeep);
  // HB_PHOTO_LIST_GATE: list (and seasonal pool) only places with a photo; kept places stay.
  const photoGate=hbPhotoGate(curated.visible,tripKeep,ready?'places':'');
  const curation={...curated,visible:photoGate.visible};
  const filtered=ready?hbSearchPlaces(curation.visible,filter,query):[];
  // Weather suggestion (HB_WEATHER_SUGGEST): reorders within each accessibility group only.
  const weatherSignal=hbWeatherBrowseSignal();
  hbWeatherBrowseFingerprint=weatherSignal.fingerprint;
  const ranked=filtered.map(p=>({p,e:hbReconcileRecommendation(p,profile,serverState)}))
    .sort((a,b)=>hbWeatherPlaceRank(b.p,weatherSignal)-hbWeatherPlaceRank(a.p,weatherSignal)||hbDiscoveryPriority(b.p.id,s.region)-hbDiscoveryPriority(a.p.id,s.region)||b.e.score-a.e.score||String(a.p.name||'').localeCompare(String(b.p.name||''),'ko'));
  const good=ranked.filter(x=>x.e.status==='eligible');
  const review=ranked.filter(x=>x.e.status==='needsReview');
  const excluded=ranked.filter(x=>x.e.status==='excluded');
  const limited=Math.max(10,Number(s.hbBrowseLimit)||30);
  const available=new Map([...curation.visible,...(Array.isArray(places)?places:[])].filter(p=>p&&hbValidPlaceId(p.id)).map(p=>[p.id,p]));
  const selections=chosen.map(id=>({id,place:available.get(id)}));
  const foodPrefs=Array.isArray(s.hbFoodPreferences)?s.hbFoodPreferences.filter(x=>['less_spicy','easy_to_chew','vegetarian'].includes(x)):[];
  const foodUnsupported=foodPrefs.length&&!(serverState?.state==='ready'&&serverState.result.foodPreferencesApplied&&foodPrefs.every(x=>serverState.result.appliedFoodPreferences.includes(x)));
  const card=({p,e},extra='')=>{
    const picked=chosen.includes(p.id);
    const status=hbRecommendationStatusText(e);
    const description=Object.prototype.hasOwnProperty.call(hbRecommendationReasons,e.reason)?hbRecommendationReasons[e.reason]:hbRecommendationReasons.missing_reason;
    return '<article class="card hb-recommend-card"><div class="hb-card-top"><span class="chip">'+hbPlaceCategory(p)+'</span>'+(status?'<span class="hb-recommend-state">'+safe(status)+'</span>':'')+'</div>'+
      '<h3>'+safe(p.name)+'</h3>'+(p.address?'<p class="muted">'+safe(p.address)+'</p>':'')+
      (description?'<p class="muted">'+safe(description)+'</p>':'')+hbWeatherPlaceNote(p,weatherSignal)+extra+
      (e.scope?'<p>확인 범위: '+safe(e.scope)+'</p>':'')+
      (e.found.length?'<p>관련 편의시설 안내: '+safe(e.found.join(', '))+'</p>':'')+
      (hbVisibleGaps(e.gaps).length?'<p class="muted">'+safe(hbVisibleGaps(e.gaps).slice(0,3).join(' · '))+'</p>':'')+
      '<div class="actions"><a class="light" data-hb-info="'+safe(p.id)+'" href="'+safe(hbPlaceDetailPath(p.id))+'">상세 정보</a>'+
      (e.status==='excluded'&&!picked?'':'<button type="button" data-hb-pick="'+safe(p.id)+'" aria-pressed="'+picked+'">'+(picked?'선택 취소':'일정에 담기')+'</button>')+'</div></article>';
  };
  const section=(title,arr,empty='')=>'<section class="hb-result-section"><h2>'+title+' <span class="hb-result-count">'+arr.length+'곳</span></h2>'+
    (arr.length?'<div class="grid">'+arr.slice(0,limited).map(x=>card(x)).join('')+'</div>':'<p class="muted">'+empty+'</p>')+'</section>';
  const noResults=ready&&!ranked.length;
  const results=!ready?'':noResults&&photoGate.pending?'<p class="muted">장소를 불러오고 있어요…</p>':noResults?
    panel('검색 결과 0건',curated.enabled&&!curated.visible.length&&curated.hidden?'<p>정보가 충분한 장소가 없어 목록을 표시하지 않았어요. 정보가 부족한 장소 '+curation.hidden+'곳은 숨겼어요. 조건을 자동으로 완화하지 않았어요. 다른 지역을 선택해 보세요.</p>':photoGate.hidden&&!photoGate.visible.length?'<p>이 지역에서 지금 보여 드릴 장소를 찾지 못했어요. 다른 지역을 선택해 보세요.</p>':places.length?'<p>현재 검색어·분류에 맞는 장소가 없어요. 조건을 자동으로 완화하지 않았어요.</p>'+(curation.hidden?'<p class="muted">정보가 부족해 숨긴 장소 '+curation.hidden+'곳은 검색에 포함하지 않았어요.</p>':''):'<p>이 지역에서 조회된 장소가 없어요. 다른 지역을 직접 선택해 보세요.</p>'):
    (good.length?section('이동 조건에 맞는 장소',good):'')+
    (review.length?section('여행 후보 장소',review):'')+
    (excluded.length?'<details class="hb-conflict"><summary>이동 조건과 맞지 않는 장소 '+excluded.length+'곳</summary><div class="grid">'+excluded.slice(0,limited).map(x=>card(x)).join('')+'</div></details>':'')+
    (Math.max(good.length,review.length,excluded.length)>limited?'<button type="button" class="light" id="hb-more">장소 더 보기</button>':'')+
    (photoGate.pending?'<p class="muted hb-photo-gate-more">장소를 더 불러오고 있어요…</p>':'');
  const extraPrefs=[
    s.hbMobilityAid&&s.hbMobilityAid!=='none'?hbMobilityAidLabels[s.hbMobilityAid]:null,
    s.hbSlopePreference==='avoid_steep'?'가파른 경사 피하기':null,
    [30,45,60].includes(Number(s.hbRestIntervalMinutes))?'휴식 간격 '+Number(s.hbRestIntervalMinutes)+'분 (일정 초안)':null,
    s.hbIndoorPreference==='indoor'?'실내 위주':s.hbIndoorPreference==='outdoor'?'야외 위주':null
  ].filter(Boolean);
  const stairs={impossible:'이용 불가',avoid:'피하기',possible:'이용 가능'}[s.hbStairsChoice]||'선택해 주세요';
  // 2026-11-26 사용자 결정(MVP): 미지원 안내는 보여 주지 않는다. 서버가 반영을 보고한 경우에만 알린다.
  const foodNote=!foodUnsupported&&foodPrefs.length?'<p class="muted">선택한 음식 선호를 식당 추천에 반영했어요.</p>':'';
  const selectedList=selections.length?'<ul class="hb-selected-places">'+selections.map(({id,place})=>
    '<li><span>'+safe(place?.name||'이전에 담은 장소')+'</span> '+
    '<button type="button" class="light" data-hb-must="'+safe(id)+'" aria-pressed="'+String(must.includes(id))+'"'+(!place?' disabled':'')+'>'+(must.includes(id)?'필수 방문지 ✓':'필수 방문지 지정')+'</button> '+
    '<button type="button" class="light" data-hb-unpick="'+safe(id)+'">선택 취소</button></li>'
  ).join('')+'</ul>':'<p>상세 정보를 확인하고 일정에 넣을 장소를 담아보세요.</p>';
  const canBuild=ready&&selections.some(x=>x.place);
  const tray='<section class="hb-selection-tray" aria-labelledby="hb-selection-title">'+
    '<div class="hb-selection-bar"><h2 id="hb-selection-title">일정에 담은 장소 <span class="hb-selection-count">'+chosen.length+'</span>곳</h2>'+
    '<button type="button" id="build"'+(canBuild?'':' disabled')+'>선택한 장소로 일정 만들기</button></div>'+
    (selections.length?'<details class="hb-selection-list"'+(hbSelectionListOpen?' open':'')+'><summary>담은 장소 보기</summary>'+selectedList+'</details>':
      '<p class="muted hb-selection-hint">아래 목록에서 일정에 담기를 누르면 여기에 바로 반영돼요.</p>')+'</section>';
  // P1-2 (2026-11-26): no internal verdict counts ("조건 일치 0곳") or server jargon on screen.
  const serverStatus=!ready?'장소 자료를 불러오고 있어요.':
    travel.errors.length?'이동 조건을 입력하면 조건에 맞춰 장소를 정리해요. '+safe(travel.errors.join(' ')):
    serverState?.state==='loading'?'이동 조건을 반영하고 있어요.':
    serverState?.state==='error'?'추천 정보를 불러오지 못했어요. 장소 목록은 그대로 볼 수 있어요.':
    serverState?.state==='ready'?'이동 조건을 반영해 장소를 정리했어요.':
    '이동 조건을 반영할 준비를 하고 있어요.';
  const seasonalView=hbSeasonalView({ready,profile,serverState,chosen,pool:curation.visible,weatherSignal});
  const tripSummary=hbTripResultSummary({ready,curation,good,review,excluded,serverState,travel});
  const retry=serverState?.state==='error'?'<button type="button" id="hb-recommend-retry" class="light">추천 다시 불러오기</button>':'';
  el.innerHTML='<h1>여행 장소 찾기</h1>'+hbDiscoveryPendingMarkup()+prefs()+
    '<div class="hb-profile-summary"><strong>여행 조건</strong><p>'+safe(hbTripTimeSummary(s))+'</p><p>걷기 '+safe(s.hbWalkConfirmed?s.walk+'분':'선택해 주세요')+' · 계단 '+safe(stairs)+
    (extraPrefs.length?' · '+safe(extraPrefs.join(' / ')):'')+'</p><button type="button" class="light" id="hb-edit-profile">조건 수정</button></div>'+tray+
    '<section class="panel"><h2>이동 조건 반영</h2><p id="hb-recommend-status" role="'+(serverState?.state==='error'?'alert':'status')+'">'+serverStatus+'</p>'+retry+
    tripSummary+hbTripQuickConditions()+
    '</section>'+
    (ready?hbWeatherSuggestBanner(weatherSignal):'')+
    hbSeasonalMarkup(seasonalView)+
    (typeof weatherCard==='function'?weatherCard():'')+
    '<form class="row" role="search" id="hb-browse-search"><div class="field"><label for="hb-place-search">장소 이름 또는 주소</label><input type="search" id="hb-place-search" maxlength="100" value="'+safe(query)+'"></div>'+
    '<button type="submit" id="hb-place-search-submit">검색</button>'+(query?'<button type="button" class="light" id="hb-search-reset">검색 지우기</button>':'')+'</form>'+
    '<div class="hb-filter-bar" role="group" aria-label="장소 필터">'+[['all','전체'],['spot','관광지'],['culture','문화시설'],['food','식당'],['access','편의시설 안내 있음']].map(([id,label])=>
    '<button type="button" data-hb-filter="'+id+'" class="light '+(filter===id?'hb-filter-active':'')+'" aria-pressed="'+String(filter===id)+'">'+label+'</button>').join('')+'</div>'+
    foodNote+
    '<p role="status">'+(ready?ranked.length+'곳이 현재 검색·분류에 표시돼요.':'')+'</p><div id="hb-place-results" aria-busy="'+String(loading||photoGate.pending>0)+'">'+results+'</div>';
  hbDiscoveryBindPending(browse);bindPrefs();
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
    if(!wasPicked&&!places.some(p=>p.id===id))places.push({...available.get(id),hbPickedRegion:s.region,accessFacts:[],accessStatus:'unknown'});
    if(!wasPicked&&serverState?.state==='ready'&&serverState.result.byId.get(id)?.status==='excluded')return;
    s.chosen=wasPicked?next.filter(x=>x!==id):[...next,id];
    s.hbMustVisitIds=hbUniquePlaceIds(s.hbMustVisitIds).filter(x=>s.chosen.includes(x));
    save();
    browse();
    const fromSeasonal=!!b.closest?.('.hb-seasonal');
    const button=fromTray?['.hb-selection-tray [data-hb-unpick]','.hb-selection-tray summary','#build'].map(q=>document.querySelector(q)).find(Boolean):[...document.querySelectorAll(fromSeasonal?'.hb-seasonal [data-hb-pick]':'#hb-place-results [data-hb-pick]')].find(node=>node.dataset.hbPick===id)||[...document.querySelectorAll('[data-hb-pick]')].find(node=>node.dataset.hbPick===id);
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
  hbSeasonalBind(seasonalView,{profile,serverState,chosen});
  hbTripBindQuickConditions();
}

// BEGIN HB_SEASONAL_RECOMMENDATION
// Travel-date season is an editorial theme (ADR-008): not bloom, festival, operation,
// crowd, weather or indoor facts. Accessibility groups come only from hbReconcileRecommendation.
// Routes are visit-order / place-group candidates; travel times stay with the itinerary engine.
const hbSeasonalThemes={
  spring:{idea:'정원·공원 산책과 궁궐·한옥 나들이',kinds:[],pattern:/정원|수목원|공원|숲|호수|습지|산책|궁|한옥|성곽|산성|유적/},
  summer:{idea:'박물관·미술관 같은 전시·문화시설',kinds:['culture'],pattern:/박물관|미술관|기념관|전시|과학관|도서관|아쿠아리움|디자인플라자/},
  autumn:{idea:'공원·숲 산책과 궁궐·성곽 역사 여행',kinds:[],pattern:/정원|수목원|공원|숲|호수|습지|산책|궁|한옥|성곽|산성|유적/},
  winter:{idea:'박물관·미술관 같은 전시·문화시설',kinds:['culture'],pattern:/박물관|미술관|기념관|전시|과학관|도서관|아쿠아리움|디자인플라자/}
};
const hbSeasonalBasisLabels={editorial_course:'함께봄 계절 편집 코스 장소',official_category:'관광공사 분류: 문화시설',name_keyword:'장소 이름 기준 계절 테마'};
const hbSeasonalBasisRank={editorial_course:3,official_category:2,name_keyword:1};
const hbSeasonalStatusRank={eligible:2,needsReview:1,excluded:0};
const hbSeasonalRegionCodes={서울:'1',경기:'31'};
const hbSeasonalCenters={서울:[37.5665,126.9780],경기:[37.2636,127.0286]};
const hbSeasonalFeatured=new Map();
let hbSeasonalMapOpen=null,hbSeasonalMapDispose=null,hbSeasonalMessage='',hbSeasonalLeaveBound=false;

function hbSeasonalTodaySeoul(now=new Date()){
  return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
function hbSeasonalValidDate(date){
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
  const parsed=new Date(date+'T00:00:00Z');
  return Number.isFinite(+parsed)&&parsed.toISOString().slice(0,10)===date;
}
/** The travel date is already a Seoul calendar date; only the fallback reads the clock. */
function hbTravelSeason(date,today=hbSeasonalTodaySeoul()){
  const fromTravel=hbSeasonalValidDate(date);
  const basisDate=fromTravel?date:today;
  const month=Number(String(basisDate).slice(5,7));
  const season=hbDiscoveryCurrentSeason(month);
  return {season,label:hbDiscoverySeasonLabel(season),month,date:basisDate,basis:fromTravel?'travel_date':'today'};
}
function hbSeasonalRegionMatch(p,region){
  const code=hbSeasonalRegionCodes[region];
  if(!code||!p)return false;
  if(p.areaCode!=null&&p.areaCode!=='')return String(p.areaCode)===code;
  if(typeof p.region==='string'&&p.region)return p.region===region;
  const prefix=region==='서울'?/^서울(?:특별시|\s)/:/^경기(?:도|\s)/;
  return typeof p.address==='string'&&prefix.test(p.address);
}
function hbSeasonalCourseIds(season,region){
  return new Set(hbDiscoveryCourses.filter(c=>c.region===region&&c.seasons.includes(season)).flatMap(c=>c.ids));
}
function hbSeasonalPlaceMatch(p,season,courseIds){
  const theme=hbSeasonalThemes[season];
  if(!theme||!p||p.kind==='food')return null;
  if(courseIds.has(p.id))return 'editorial_course';
  if(theme.kinds.includes(p.kind))return 'official_category';
  return theme.pattern.test(String(p.name||''))?'name_keyword':null;
}
function hbSeasonalSort(a,b){
  return hbSeasonalStatusRank[b.e.status]-hbSeasonalStatusRank[a.e.status]||
    hbSeasonalBasisRank[b.basis]-hbSeasonalBasisRank[a.basis]||(b.e.score||0)-(a.e.score||0)||
    String(a.p.name).localeCompare(String(b.p.name),'ko');
}
/** Season-themed places in the selected trip region; excluded rows are counted, never shown as fits. */
function hbSeasonalPlaces(list,season,region,evaluate){
  const courseIds=hbSeasonalCourseIds(season,region);
  const seen=new Set(),rows=[];
  for(const p of Array.isArray(list)?list:[]){
    if(!p||!hbValidPlaceId(p.id)||seen.has(p.id)||typeof p.name!=='string'||!p.name.trim()||!hbSeasonalRegionMatch(p,region))continue;
    const basis=hbSeasonalPlaceMatch(p,season,courseIds);
    if(!basis)continue;
    seen.add(p.id);rows.push({p,e:evaluate(p),basis});
  }
  rows.sort(hbSeasonalSort);
  return {shown:rows.filter(x=>x.e.status!=='excluded'),excluded:rows.filter(x=>x.e.status==='excluded')};
}
function hbSeasonalDistrict(address){
  const m=typeof address==='string'&&address.match(/^(?:서울(?:특별시)?|경기(?:도)?)\s+([가-힣]{1,10}(?:시|군|구))(?:\s|$)/);
  return m?m[1]:null;
}
/** Existing editorial courses; shown only when every exact ID resolves in the trip region. */
function hbSeasonalEditorialCourses(season,region,records,evaluate){
  return hbDiscoveryCourses.filter(c=>c.region===region&&c.seasons.includes(season)).map(c=>{
    const stops=c.ids.map(id=>(Array.isArray(records)?records:[]).find(p=>p&&p.id===id&&hbSeasonalRegionMatch(p,region))||null);
    const complete=stops.every(Boolean);
    return {id:'editorial-'+c.id,kind:'editorial',title:c.title,description:c.description,complete,
      stops:complete?stops.map(p=>({p,e:evaluate(p),basis:'editorial_course'})):[]};
  });
}
/** Same district (address) groups of non-excluded season places. Unordered; no distance claim. */
function hbSeasonalComposedCourses(shown,editorial=[],limit=3){
  const groups=new Map();
  for(const row of Array.isArray(shown)?shown:[]){
    if(row.e.status==='excluded')continue;
    const district=hbSeasonalDistrict(row.p.address);
    if(!district)continue;
    if(!groups.has(district))groups.set(district,[]);
    groups.get(district).push(row);
  }
  const editorialSets=editorial.filter(c=>c.complete).map(c=>c.stops.map(x=>x.p.id).sort().join('|'));
  const value=c=>c.stops.reduce((sum,x)=>sum+hbSeasonalStatusRank[x.e.status]*10+hbSeasonalBasisRank[x.basis],0);
  return [...groups].filter(([,rows])=>rows.length>=2)
    .map(([district,rows])=>({kind:'composed',district,title:district+' 계절 테마 장소 묶음',complete:true,stops:[...rows].sort(hbSeasonalSort).slice(0,2)}))
    .filter(c=>!editorialSets.includes(c.stops.map(x=>x.p.id).sort().join('|')))
    .sort((a,b)=>value(b)-value(a)||a.district.localeCompare(b.district,'ko')).slice(0,limit)
    .map((c,i)=>({...c,id:'auto-'+(i+1)}));
}
function hbSeasonalCounts(stops){
  const count=key=>stops.filter(x=>x.e.status===key).length;
  return {eligible:count('eligible'),needsReview:count('needsReview'),excluded:count('excluded')};
}
function hbRecommendationStatusText(e){
  // 2026-11-26 사용자 결정(MVP): '접근성 확인 필요'·'자료 상충' 배지는 보여 주지 않는다. 근거가 있는 판정만 배지로 표시.
  return e.status==='eligible'?'이동 조건에 맞아요':e.status==='excluded'?'이동 조건 충돌':'';
}
/** One bounded editorial-featured lookup per trip region (exact TourAPI IDs, address-verified rows). */
function hbSeasonalEnsureFeatured(region){
  if(hbSeasonalFeatured.has(region)||!hbSeasonalCenters[region]||typeof get!=='function')return;
  hbSeasonalFeatured.set(region,{state:'loading',records:[]});
  const [lat,lng]=hbSeasonalCenters[region];
  Promise.resolve().then(()=>get('/api/featured.js?lat='+lat+'&lng='+lng+'&region='+encodeURIComponent(region)))
    .then(data=>{hbSeasonalFeatured.set(region,{state:'ready',records:hbDiscoveryFeaturedRows(data)});})
    .catch(()=>{hbSeasonalFeatured.set(region,{state:'error',records:[]});})
    .then(()=>{if(path()==='/places'&&s.region===region&&hbSeasonalFeaturedChangesView(region))browse();});
}
/** Redraw only when the lookup changes what is shown, so rendered cards are not replaced needlessly. */
function hbSeasonalFeaturedChangesView(region){
  const entry=hbSeasonalFeatured.get(region);
  const known=new Set((Array.isArray(places)?places:[]).map(p=>p?.id));
  if(entry?.state==='ready')return entry.records.some(p=>!known.has(p.id));
  const season=hbTravelSeason(s.date).season;
  return hbDiscoveryCourses.some(c=>c.region===region&&c.seasons.includes(season)&&c.ids.some(id=>!known.has(id)));
}
function hbSeasonalClearMap(){
  if(typeof hbSeasonalMapDispose==='function')hbSeasonalMapDispose();
  hbSeasonalMapDispose=null;
}
function hbSeasonalView({ready,profile,serverState,chosen,pool,weatherSignal=null}){
  const season=hbTravelSeason(s.date);
  const region=s.region;
  if(!ready)return {season,region,ready:false,courses:[],rows:{shown:[],excluded:[]},hidden:0,featured:null};
  const evaluate=p=>hbReconcileRecommendation(p,profile,serverState);
  const rows=hbSeasonalPlaces(pool,season.season,region,evaluate);
  const editorial=hbSeasonalEditorialCourses(season.season,region,pool,evaluate);
  let courses=[...editorial.filter(c=>c.complete),...hbSeasonalComposedCourses(rows.shown,editorial)];
  if(['adverse','pleasant'].includes(weatherSignal?.mode)){
    // Weather suggestion: status stays first; weather-fit places/courses move up (stable sort).
    const rank=p=>hbWeatherPlaceRank(p,weatherSignal);
    rows.shown.sort((a,b)=>hbSeasonalStatusRank[b.e.status]-hbSeasonalStatusRank[a.e.status]||rank(b.p)-rank(a.p)||hbSeasonalSort(a,b));
    const fit=c=>c.stops.reduce((sum,x)=>sum+rank(x.p),0)/Math.max(1,c.stops.length);
    courses=courses.map((c,i)=>({c,i})).sort((a,b)=>fit(b.c)-fit(a.c)||a.i-b.i).map(x=>x.c);
  }
  return {season,region,ready:true,courses,rows,hidden:editorial.filter(c=>!c.complete).length,
    featured:hbSeasonalFeatured.get(region)?.state||null,chosen,weatherSignal};
}
function hbSeasonalMarkup(view){
  const {season}=view;
  const theme=hbSeasonalThemes[season.season];
  const basis=season.basis==='travel_date'?'여행 날짜 '+safe(season.date)+' 기준 '+safe(season.label)+'이에요':
    '여행 날짜를 확인할 수 없어 오늘('+safe(season.date)+', 서울 기준) 계절인 '+safe(season.label)+'로 보여 드려요';
  const head='<section class="panel hb-seasonal" aria-labelledby="hb-seasonal-title"><h2 id="hb-seasonal-title">'+safe(season.label)+' 여행 추천 · 이동 조건 반영</h2>'+
    '<p class="hb-seasonal-basis">'+basis+' (서울 시간대 · 3~5월 봄, 6~8월 여름, 9~11월 가을, 12~2월 겨울).</p>'+
    '<p class="muted">'+safe(season.label)+' 편집 테마: '+safe(theme.idea)+'. 함께봄 편집 테마예요.</p>';
  if(!view.ready)return head+'<p role="status">장소 자료를 불러오면 계절 추천 코스와 장소를 보여 드려요.</p></section>';
  const chosen=view.chosen||[];
  const courseCard=c=>{
    const counts=hbSeasonalCounts(c.stops);
    const addable=c.stops.filter(x=>x.e.status!=='excluded');
    const remaining=addable.filter(x=>!chosen.includes(x.p.id));
    const List=c.kind==='editorial'?'ol':'ul';
    const label=!addable.length?'담을 수 있는 장소 없음':!remaining.length?'코스 장소를 모두 담았어요':'이 코스 장소 담기 ('+remaining.length+'곳)';
    return '<article class="hb-seasonal-course" data-hb-season-course="'+safe(c.id)+'">'+
      '<p class="hb-discovery-kicker">'+(c.kind==='editorial'?'함께봄 편집 코스 · '+safe(view.region)+' · '+safe(season.label):'조건 기반 자동 묶음 · '+safe(c.district))+'</p>'+
      '<h4>'+safe(c.title)+'</h4><p class="muted">'+(c.kind==='editorial'?safe(c.description)+'. 방문 순서 아이디어예요.':'같은 시·군·구 주소의 계절 테마 장소 '+c.stops.length+'곳이에요. 방문 순서는 정하지 않았어요.')+'</p>'+
      hbWeatherCourseNote(c.stops,view.weatherSignal)+
      '<'+List+' class="hb-seasonal-stops">'+c.stops.map(({p,e})=>'<li><a data-hb-season-open="'+safe(p.id)+'" href="'+safe(hbPlaceDetailPath(p.id))+'">'+safe(p.name)+'</a>'+(hbRecommendationStatusText(e)?' <span class="hb-recommend-state">'+safe(hbRecommendationStatusText(e))+'</span>':'')+
        (e.status==='excluded'?' <span class="muted">이 장소는 담지 않아요.</span>':hbVisibleGaps(e.gaps).length?' <span class="muted">'+safe(hbVisibleGaps(e.gaps)[0])+'</span>':'')+'</li>').join('')+'</'+List+'>'+
      (counts.excluded?'<p class="warn">확인된 이동 조건 충돌 장소가 포함돼 있어요. 충돌 장소는 담기에서 빠져요.</p>':'')+
      '<div class="actions"><button type="button" class="light" data-hb-season-map="'+safe(c.id)+'" aria-expanded="'+String(hbSeasonalMapOpen===c.id)+'">지도에서 위치 보기</button>'+
      '<button type="button" data-hb-season-course-pick="'+safe(c.id)+'"'+(remaining.length?'':' disabled')+'>'+label+'</button></div>'+
      '<div class="hb-seasonal-course-map" data-hb-season-map-host="'+safe(c.id)+'"'+(hbSeasonalMapOpen===c.id?'':' hidden')+'></div></article>';
  };
  const featuredNote=view.hidden?(view.featured==='loading'?'<p class="muted" role="status">편집 코스 장소 자료를 확인하고 있어요.</p>':
    '<p class="muted">장소 자료가 모두 갖춰지지 않은 '+safe(season.label)+' 편집 코스 '+view.hidden+'개는 표시하지 않았어요.'+(view.featured==='error'?' 편집 코스 장소 조회에 실패했어요.':'')+'</p>'):'';
  const courses='<h3>추천 코스 후보 <span class="hb-result-count">'+view.courses.length+'개</span></h3>'+
    (view.courses.length?'<div class="hb-seasonal-course-grid">'+view.courses.map(courseCard).join('')+'</div>':
      '<p>이 지역 조회 자료로는 '+safe(season.label)+' 코스 후보를 만들지 못했어요. 조건을 자동으로 완화하지 않았어요.</p>')+featuredNote;
  const shown=view.rows.shown.slice(0,6);
  const placesMarkup='<h3>'+safe(season.label)+' 테마 추천 장소 <span class="hb-result-count">'+view.rows.shown.length+'곳</span></h3>'+
    (shown.length?'<div class="grid">'+shown.map(row=>hbSeasonalPlaceCard(row,chosen,view.weatherSignal)).join('')+'</div>'+
      (view.rows.shown.length>shown.length?'<p class="muted">나머지 '+(view.rows.shown.length-shown.length)+'곳은 아래 전체 목록에서 확인할 수 있어요.</p>':''):
      '<p>이 지역 조회 자료에서 '+safe(season.label)+' 테마와 맞는 장소를 찾지 못했어요. 조건을 자동으로 완화하지 않았어요.</p>')+
    (view.rows.excluded.length?'<p class="muted">확인된 이동 조건 충돌로 계절 추천에서 제외한 장소 '+view.rows.excluded.length+'곳</p>':'');
  return head+courses+placesMarkup+'<p role="status" id="hb-seasonal-status">'+safe(hbSeasonalMessage)+'</p></section>';
}
function hbSeasonalBind(view,{serverState}){
  hbSeasonalMessage='';
  if(!view?.ready)return;
  const find=id=>view.courses.find(c=>c.id===id&&c.complete);
  document.querySelectorAll('[data-hb-season-open]').forEach(a=>a.onclick=()=>{
    const id=a.dataset.hbSeasonOpen;
    if(!places.some(p=>p.id===id)){
      const stop=view.courses.flatMap(c=>c.stops).find(x=>x.p.id===id);
      if(stop&&typeof hbRichSelected!=='undefined')hbRichSelected=stop.p;
    }
  });
  document.querySelectorAll('[data-hb-season-course-pick]').forEach(b=>b.onclick=()=>{
    const course=find(b.dataset.hbSeasonCoursePick);
    if(!course)return;
    const blocked=id=>serverState?.state==='ready'&&serverState.result.byId.get(id)?.status==='excluded';
    const addable=course.stops.filter(x=>x.e.status!=='excluded'&&!blocked(x.p.id)&&hbValidPlaceId(x.p.id)&&hbSeasonalRegionMatch(x.p,s.region));
    const before=hbUniquePlaceIds(s.chosen);
    for(const {p} of addable){
      if(!places.some(x=>x.id===p.id))places.push({...p,hbPickedRegion:s.region,accessFacts:[],accessStatus:'unknown'});
    }
    const next=hbUniquePlaceIds([...before,...addable.map(x=>x.p.id)]);
    const added=next.length-before.length;
    s.chosen=next;
    save();
    hbSeasonalMessage=added?course.title+'에서 '+added+'곳을 담았어요. 일정은 아직 만들지 않았고 기존 일정도 바뀌지 않았어요.':'이미 담긴 장소예요.';
    browse();
    [...document.querySelectorAll('[data-hb-season-course-pick]')].find(n=>n.dataset.hbSeasonCoursePick===course.id)?.focus?.();
  });
  document.querySelectorAll('[data-hb-season-map]').forEach(b=>b.onclick=()=>{
    const id=b.dataset.hbSeasonMap;
    hbSeasonalMapOpen=hbSeasonalMapOpen===id?null:id;
    browse();
    [...document.querySelectorAll('[data-hb-season-map]')].find(n=>n.dataset.hbSeasonMap===id)?.focus?.();
  });
  const open=hbSeasonalMapOpen&&find(hbSeasonalMapOpen);
  if(!open){hbSeasonalMapOpen=null;return;}
  const host=[...document.querySelectorAll('[data-hb-season-map-host]')].find(n=>n.dataset.hbSeasonMapHost===open.id);
  if(!host||typeof hbRichMapAdapter!=='function')return;
  // Pins only: an editorial order is not a verified driving or walking line.
  hbSeasonalMapDispose=hbRichMapAdapter({container:host,points:open.stops.map(x=>x.p),onSelect:id=>{
    const link=[...document.querySelectorAll('[data-hb-season-open]')].find(n=>n.dataset.hbSeasonOpen===id);
    link?.focus?.();
  }});
  if(!hbSeasonalLeaveBound&&typeof window!=='undefined'&&window.addEventListener){
    hbSeasonalLeaveBound=true;
    window.addEventListener('hashchange',()=>{if(path()!=='/places')hbSeasonalClearMap();});
  }
}
// Seasonal cards deliberately avoid .hb-recommend-card/data-hb-info: the main list owns those hooks.
function hbSeasonalPlaceCard({p,e,basis},chosen,weatherSignal=null){
  const picked=chosen.includes(p.id);
  return '<article class="card hb-seasonal-card"><div class="hb-card-top"><span class="chip">'+hbPlaceCategory(p)+'</span>'+(hbRecommendationStatusText(e)?'<span class="hb-recommend-state">'+safe(hbRecommendationStatusText(e))+'</span>':'')+'</div>'+
    '<h3>'+safe(p.name)+'</h3>'+(p.address?'<p class="muted">'+safe(p.address)+'</p>':'')+
    '<p class="hb-seasonal-tag">계절 근거: '+safe(hbSeasonalBasisLabels[basis])+'</p>'+hbWeatherPlaceNote(p,weatherSignal)+
    (hbVisibleGaps(e.gaps).length?'<p class="muted">'+safe(hbVisibleGaps(e.gaps).slice(0,2).join(' · '))+'</p>':'')+
    '<div class="actions"><a class="light" data-hb-season-open="'+safe(p.id)+'" href="'+safe(hbPlaceDetailPath(p.id))+'">상세 정보</a>'+
    '<button type="button" data-hb-pick="'+safe(p.id)+'" aria-pressed="'+picked+'">'+(picked?'선택 취소':'일정에 담기')+'</button></div></article>';
}
// END HB_SEASONAL_RECOMMENDATION

// BEGIN HB_TRIP_DATA_CURATION
// Single adjustable rule for 여행 만들기 → 여행 장소 찾기 (#/places), incl. "방문 전 확인할 장소".
// Hidden places are not deleted. enabled:false, or localStorage[offStorageKey]='off', shows every place again.
const HB_TRIP_DATA_RULE={enabled:true,kinds:['spot','culture'],minFacts:1,acceptEditorialFeatured:true,offStorageKey:'hamkkebom-trip-curation'};
let hbTripMessage='';
function hbTripCurationEnabled(rule=HB_TRIP_DATA_RULE){
  if(!rule.enabled)return false;
  try{return typeof localStorage==='undefined'||localStorage.getItem(rule.offStorageKey)!=='off';}catch{return true;}
}
/** Identity, category, coordinates and region address are required, plus one concrete data signal. */
function hbTripDataEvidence(p,region,rule=HB_TRIP_DATA_RULE){
  const missing=[];
  if(!p||!/^tour-\d{1,12}$/.test(String(p.id))||typeof p.name!=='string'||!p.name.trim())missing.push('identity');
  if(!rule.kinds.includes(p?.kind))missing.push('kind');
  if(!(Number.isFinite(p?.lat)&&Number.isFinite(p?.lng)&&p.lat>=33&&p.lat<=39&&p.lng>=124&&p.lng<=132))missing.push('coordinates');
  const prefix=region==='서울'?/^서울(?:특별시|\s)/:region==='경기'?/^경기(?:도|\s)/:null;
  if(!prefix||typeof p?.address!=='string'||!prefix.test(p.address))missing.push('address');
  const facts=hbAccessFacts(p).filter(f=>typeof f.label==='string'&&f.label.trim()&&typeof f.description==='string'&&f.description.trim());
  const signals=[];
  if(facts.length>=rule.minFacts)signals.push('access_facts');
  if(rule.acceptEditorialFeatured&&p?.featured===true)signals.push('editorial_featured');
  if(!signals.length)missing.push('concrete_data');
  return {ok:!missing.length,signals,missing,factCount:facts.length};
}
function hbTripKeepIds(chosen,stops){
  return new Set([...hbUniquePlaceIds(chosen),...(Array.isArray(stops)?stops:[]).map(x=>x?.placeId||x?.id).filter(hbValidPlaceId)]);
}
function hbTripCandidatePool(region){
  const base=Array.isArray(places)?places:[];
  const ids=new Set(base.map(p=>p?.id));
  return [...base,...(hbSeasonalFeatured.get(region)?.records||[]).filter(p=>!ids.has(p.id))];
}
function hbTripCuration(list,region,keepIds=new Set(),rule=HB_TRIP_DATA_RULE){
  const seen=new Set();
  const unique=(Array.isArray(list)?list:[]).filter(p=>p&&hbValidPlaceId(p.id)&&!seen.has(p.id)&&seen.add(p.id));
  if(!hbTripCurationEnabled(rule))return {enabled:false,visible:unique,hidden:0,kept:0,qualified:unique.length};
  const visible=[];let hidden=0,kept=0,qualified=0;
  for(const p of unique){
    if(hbTripDataEvidence(p,region,rule).ok){qualified++;visible.push(p);}
    else if(keepIds.has(p.id)){kept++;visible.push(p);}
    else hidden++;
  }
  return {enabled:true,visible,hidden,kept,qualified};
}
function hbTripResultSummary({ready,curation,good,review,excluded,serverState,travel}){
  if(!ready)return '<p class="muted">장소 자료를 불러오면 이동 조건을 반영한 추천 결과를 보여 드려요.</p>';
  const parts=[];
  if(curation.enabled){
    if(curation.hidden)parts.push('<p class="hb-curation-note" role="status">정보가 부족한 장소 '+curation.hidden+'곳은 숨겼어요. 공공 접근성 시설 안내가 있거나 함께봄 편집 명소로 공식 정보가 확인된 관광지·문화시설만 보여 드려요.</p>');
    if(curation.kept)parts.push('<p class="muted">저장된 일정·담은 장소 '+curation.kept+'곳은 기준과 관계없이 그대로 보여요.</p>');
    if(!curation.qualified&&!curation.kept)parts.push('<p class="warn">이 지역 조회 자료에서 정보가 충분한 관광지·문화시설을 찾지 못했어요. 다른 지역을 선택해 보세요.</p>');
  }
  const walk=s.hbWalkConfirmed?s.walk+'분':'';
  const stairs={impossible:'이용 불가',avoid:'피하기',possible:'이용 가능'}[s.hbStairsChoice]||'';
  const total=good.length+review.length+excluded.length;
  if(!travel.errors.length&&total){
    parts.push('<p class="hb-trip-result-line"><strong>걷기 '+safe(walk)+' · 계단 '+safe(stairs)+'</strong> 조건을 반영해 장소를 정리했어요.</p>');
    if(serverState?.state==='ready'&&!good.length&&!review.length&&excluded.length){
      parts.push(
        '<p class="warn">모든 후보가 확인된 이동 조건과 충돌해요. 아래에서 계단 조건을 ‘가능하면 피하기’ 또는 ‘이용 가능’으로 바꾸거나 다른 지역을 선택해 보세요.</p>');
    }
  }
  return '<div class="hb-trip-summary">'+parts.join('')+'</div>';
}
function hbTripQuickConditions(){
  const walk=s.hbWalkConfirmed?String(s.walk):null;
  const chip=(key,id,label,current)=>'<button type="button" class="hb-choice '+(current===id?'chosen':'')+'" data-hb-quick-'+key+'="'+id+'" aria-pressed="'+String(current===id)+'">'+safe(label)+'</button>';
  return '<div class="hb-quick-conditions" role="group" aria-labelledby="hb-quick-title"><h3 id="hb-quick-title">이동 조건 바로 바꾸기</h3><p class="muted">바꾸면 추천 장소를 다시 정리해요.</p>'+
    '<div class="hb-choice-grid">'+[['5','5분 이하'],['10','10분 정도'],['15','15분 정도'],['20','20분 정도'],['30','30분 이상']].map(([id,label])=>chip('walk',id,'걷기 '+label,walk)).join('')+'</div>'+
    '<div class="hb-choice-grid">'+[['possible','계단 이용 가능'],['avoid','가능하면 계단 피하기'],['impossible','계단 이용 불가']].map(([id,label])=>chip('stairs',id,label,s.hbStairsChoice||null)).join('')+'</div>'+
    '<p role="status" id="hb-quick-status">'+safe(hbTripMessage)+'</p></div>';
}
function hbTripBindQuickConditions(){
  hbTripMessage='';
  const refocus=(name,value)=>[...document.querySelectorAll('[data-hb-quick-'+name+']')].find(n=>n.dataset[name==='walk'?'hbQuickWalk':'hbQuickStairs']===value)?.focus?.();
  document.querySelectorAll('[data-hb-quick-walk]').forEach(b=>b.onclick=()=>{
    const v=b.dataset.hbQuickWalk;
    if(!['5','10','15','20','30'].includes(v))return;
    s.walk=v;s.hbWalkConfirmed=true;save();
    hbTripMessage='걷기 '+v+'분 조건으로 다시 확인하고 있어요.';
    browse();refocus('walk',v);
  });
  document.querySelectorAll('[data-hb-quick-stairs]').forEach(b=>b.onclick=()=>{
    const v=b.dataset.hbQuickStairs;
    if(!['impossible','avoid','possible'].includes(v))return;
    // Same mapping as the 이동 조건 step.
    s.hbStairsChoice=v;s.stairs=v==='possible'?'possible':'avoid';save();
    hbTripMessage='계단 조건을 바꿔 다시 확인하고 있어요.';
    browse();refocus('stairs',v);
  });
}
/** MVP wording: show only action guidance, never "미확인/미지원/자료 없음/미선택" gap text. */
function hbVisibleGaps(gaps){
  // 2026-11-26 사용자 결정(MVP): '확인 필요'·'미검증' 같은 판정 근거 공백도 화면에 내지 않는다(데이터에는 남는다).
  return (Array.isArray(gaps)?gaps:[]).filter(x=>typeof x==='string'&&!/미확인|미지원|미선택|미검증|자료\s*없음|확인되지\s*않|확인\s*안\s*됨|확인\s*필요|확인이\s*필요/.test(x));
}
// END HB_TRIP_DATA_CURATION

// BEGIN HB_PHOTO_LIST_GATE
// 사용자 요청 2026-11-26: 홈 「내 주변 여행지 · 식당」 목록과 여행 장소 찾기(#/places, 계절 추천 포함)는
// 사진이 보이는 장소만 보여 준다. 사진 = 권리 확인 사진(photo-catalog.json) 또는 같은 TourAPI ID의
// 한국관광공사 공식 이미지 — 02-place-thumbnails.js(window.HBPlacePhotos)가 실제로 그리는 것과 같은 판정.
// 목록 API 행의 hasPhoto(true/false)를 먼저 쓴다(#124 ARCH-01 계약) — 장소별 /api/photo 조회 없음.
// hasPhoto:null 만 사진 클라이언트가 조회한다(동시 4개·페이지당 총량 제한).
// 판정 전 장소는 목록 밖에서 기다렸다가 확인되면 추가된다(보인 카드가 빠지는 건 이미지 로드 실패뿐).
// 담은 장소·저장된 일정의 장소는 항상 남긴다. 사진 클라이언트가 없거나 localStorage[offStorageKey]='off'면
// 거르지 않는다. 지도 핀·장소 상세·저장된 일정은 바꾸지 않는다. 화면에 '사진 없음' 같은 문구는 쓰지 않는다.
const HB_PHOTO_LIST_RULE={enabled:true,offStorageKey:'hamkkebom-photo-gate'};
const hbPhotoGateWatch=Object.create(null);
let hbPhotoGateBound=false;
function hbPhotoGateApi(rule=HB_PHOTO_LIST_RULE){
  if(!rule.enabled||typeof window==='undefined'||!window)return null;
  const api=window.HBPlacePhotos;
  if(!api||typeof api.status!=='function'||typeof api.request!=='function')return null;
  try{if(typeof localStorage!=='undefined'&&localStorage.getItem(rule.offStorageKey)==='off')return null;}catch{}
  return api;
}
/** view: 'home' | 'places'. Returns the listable places in the given order plus undecided/hidden counts. */
function hbPhotoGate(list,keepIds=new Set(),view=''){
  const items=(Array.isArray(list)?list:[]).filter(p=>p&&typeof p.id==='string');
  const api=hbPhotoGateApi();
  if(!api)return {enabled:false,visible:items,pending:0,hidden:0};
  // seed() applies the row hints inside the photo client (an image that failed to load stays 'no').
  const seeded=typeof api.seed==='function';
  if(seeded)api.seed(items);
  const visible=[],ask=[],watch=new Set();
  let hidden=0;
  for(const p of items){
    if(keepIds.has(p.id)){visible.push(p);continue;}
    const state=api.status(p.id);
    const known=seeded?state:p.hasPhoto===true?'yes':p.hasPhoto===false?'no':state;
    if(known==='yes'){visible.push(p);watch.add(p.id);}
    else if(known==='no')hidden++;
    else{ask.push(p.id);watch.add(p.id);}
  }
  if(ask.length)api.request(ask);
  if(view){hbPhotoGateWatch[view]=watch;hbPhotoGateBind(api);}
  return {enabled:true,visible,pending:ask.length,hidden};
}
function hbPhotoGateBind(api){
  if(hbPhotoGateBound||typeof api.subscribe!=='function')return;
  hbPhotoGateBound=true;
  api.subscribe(ids=>{
    const changed=list=>list&&Array.isArray(ids)&&ids.some(id=>list.has(id));
    if(path()==='/places'){if(changed(hbPhotoGateWatch.places))hbPhotoGateRedraw(browse);}
    else if(document.getElementById('nearby-list')&&changed(hbPhotoGateWatch.home))hbPhotoGateRedraw(drawNearbyList);
  });
}
/** Redraw while keeping focus and unsent typing in a field (e.g. the place search box). */
function hbPhotoGateRedraw(draw){
  const active=document.activeElement;
  const id=active&&active.id&&el.contains?.(active)?active.id:'';
  const value=id&&typeof active.value==='string'?active.value:null;
  draw();
  if(!id)return;
  const next=document.getElementById(id);
  if(!next||next===active)return;
  if(value!==null&&typeof next.value==='string')next.value=value;
  next.focus?.({preventScroll:true});
}
// END HB_PHOTO_LIST_GATE

// BEGIN HB_WEATHER_SUGGEST
// 날씨 기반 여행지 제안 (사용자 원래 의도, DECISIONS 2026-11-26): 여행 날짜·지역 예보로 장소 순서·강조를 조정한다.
// 실내/야외 분류는 장소 ID별 확인 목록(HB_WEATHER_PLACE_ENV, 공식 근거)을 먼저 쓰고, 목록에 없는 장소만
// 앱에 이미 들어온 자료(관광공사 콘텐츠 유형·분류 코드·장소 이름)로 보조 추정한다.
// 분류는 "어떤 시설로 분류된 곳"이라는 사실만 말하며 이동 안전·현장 상태를 뜻하지 않는다. 근거가 없으면 null.
// 장소 ID별 확인된 실내/야외 분류 (2026-11-26 사용자 지시 "제대로 분류해"): 시설 공식 홈페이지·운영기관 안내 또는
// 관광공사 콘텐츠 유형으로 확인한 값만 둔다. 이 목록이 이름·분류 코드 추정보다 우선한다(목록에 있으면 추정 안 함).
// kind: 'indoor'(실내 시설) | 'outdoor'(야외 장소) | 'mixed'(실내 시설과 야외 공간이 함께 있음 = "실내 시설 있음") | null(근거 없음, 문구 없음).
// 분류는 시설 구성에 대한 사실일 뿐 이동 안전·현장 상태를 뜻하지 않는다. via: page(공식 페이지 직접 열람) | search(공식 페이지 검색 결과 요약) | tourapi(관광공사 콘텐츠 유형).
const HB_WEATHER_PLACE_ENV=Object.freeze({
 'tour-126508':{name:'경복궁',kind:'outdoor',label:'야외 궁궐 관람지',sources:['https://royal.khs.go.kr/ROYAL/contents/menuInfo-gbg.do?grpCode=gbg'],via:'page',checkedAt:'2026-11-26'},
 'tour-126537':{name:'북촌한옥마을',kind:'outdoor',label:'야외 한옥 주거지 골목',sources:['https://bukchon.seoul.go.kr/front/kor/town/town01.do'],via:'search',checkedAt:'2026-11-26'},
 'tour-126535':{name:'남산서울타워',kind:'mixed',label:'실내 전망대(타워 4·5층)와 야외 루프테라스가 함께 있는 시설',sources:['https://www.nseoultower.co.kr/visit/floor.asp'],via:'page',checkedAt:'2026-11-26'},
 'tour-2470006':{name:'동대문디자인플라자(DDP)',kind:'mixed',label:'실내 전시관(DDP 뮤지엄)과 야외 광장이 함께 있는 시설',sources:['https://ddp.or.kr/?menuno=233','https://ddp.or.kr/?menuno=269'],via:'page',checkedAt:'2026-11-26'},
 'tour-129703':{name:'국립중앙박물관',kind:'mixed',label:'실내 상설전시관과 야외 전시·정원이 함께 있는 시설',sources:['https://www.museum.go.kr/MUSEUM/contents/M0103020000.do','https://www.museum.go.kr/MUSEUM/contents/M0103040000.do'],via:'page',checkedAt:'2026-11-26'},
 'tour-128611':{name:'서울숲',kind:'outdoor',label:'야외 공원',sources:['https://seoulforest.or.kr/info/park-info'],via:'page',checkedAt:'2026-11-26'},
 'tour-126532':{name:'올림픽공원',kind:'outdoor',label:'야외 공원',sources:['https://www.ksponco.or.kr/menu.es?mid=a10402000000'],via:'page',checkedAt:'2026-11-26'},
 'tour-3432213':{name:'논현문화마루도서관',kind:'indoor',label:'실내 도서관',sources:['https://library.gangnam.go.kr/nmmlib/index.do'],via:'search',checkedAt:'2026-11-26'},
 'tour-3429640':{name:'성동책마루도서관',kind:'indoor',label:'성동구청 1층 실내 도서관',sources:['https://www.sd.go.kr/main/contents.do?key=3955'],via:'search',checkedAt:'2026-11-26'},
 'tour-2692866':{name:'청운문학도서관',kind:'indoor',label:'한옥 실내 도서관',sources:['https://lib.jongno.go.kr/menu/subpage/subpage_01/sub032.php'],via:'search',checkedAt:'2026-11-26'},
 'tour-2649975':{name:'광명동굴',kind:'indoor',label:'동굴 내부 관람 시설',sources:['https://gm.go.kr/cv/gc/CVGC_14000.jsp'],via:'page',checkedAt:'2026-11-26'},
 'tour-125449':{name:'남한산성도립공원',kind:'outdoor',label:'야외 산성·탐방로',sources:['https://www.gg.go.kr/namhansansung-2/contents/contents.do?ciIdx=1280&menuId=3494'],via:'page',checkedAt:'2026-11-26'},
 'tour-750804':{name:'마장호수',kind:'outdoor',label:'야외 호수·둘레길',sources:['https://tour.paju.go.kr/user/tour/place/BD_tourPlaceInfoView.do?menuCode=4&cntntsSn=69'],via:'page',checkedAt:'2026-11-26'},
 'tour-3456435':{name:'부락산분수공원',kind:'outdoor',label:'야외 공원',sources:['https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=e6d0db32-bab4-4721-8b15-c618701b64ce'],via:'search',checkedAt:'2026-11-26'},
 'tour-3452786':{name:'시흥시청소년수련관',kind:'indoor',label:'실내 청소년 수련 시설',sources:['https://www.shyouth.or.kr/shcs/contents/view?contentsNo=110&menuLevel=2&menuNo=8'],via:'page',checkedAt:'2026-11-26'},
 'tour-3428221':{name:'시흥시 대야평생학습관',kind:'indoor',label:'실내 평생학습 시설',sources:['https://www.data.go.kr/data/15101578/openapi.do'],via:'tourapi',checkedAt:'2026-11-26'},
 'tour-3449158':{name:'시흥시립대야도서관',kind:'indoor',label:'실내 도서관',sources:['https://lib.siheung.go.kr/'],via:'search',checkedAt:'2026-11-26'},
 'tour-2736429':{name:'에코센터',kind:'indoor',label:'실내 생태 전시 시설',sources:['https://gimpo.go.kr/news/selectBbsNttList.do?bbsNo=501&key=2049&nttNo=82926'],via:'search',checkedAt:'2026-11-26'}
});
const HB_WEATHER_INDOOR_NAMES=[
 [/박물관|미술관|전시관|기념관|과학관|디자인플라자|갤러리/,'실내 전시 시설'],
 [/도서관|평생학습관/,'실내 도서관·학습 시설'],
 [/공연장|극장|아트센터|예술의전당/,'실내 공연 시설'],
 [/수련관|체험관|문화센터|문화회관|아쿠아리움/,'실내 체험·문화 시설']
];
const HB_WEATHER_OUTDOOR_NAMES=[
 [/공원|정원|수목원|숲|둘레길|산책로/,'야외 공원·산책 장소'],
 [/궁궐|궁$|한옥마을|성곽|산성|유적지/,'야외 궁궐·역사 장소'],
 [/호수|저수지|습지|계곡|폭포|해수욕장|해변/,'야외 자연 장소']
];
/** 받침에 맞춘 '로/으로'. */
function hbWeatherJosaRo(word){
 const ch=String(word||'').trim().slice(-1),code=ch.charCodeAt(0)-0xAC00;
 return code>=0&&code<11172&&code%28&&code%28!==8?'으로':'로';
}
/** {kind:'indoor'|'outdoor'|'mixed'|null,label,basis}. Verified list first; food is never weather-classified here. */
function hbWeatherPlaceClass(p){
 if(!p||p.kind==='food')return {kind:null,label:'',basis:null};
 const id=typeof p.id==='string'&&p.id?p.id:typeof p.placeId==='string'?p.placeId:'';
 const verified=id&&Object.prototype.hasOwnProperty.call(HB_WEATHER_PLACE_ENV,id)?HB_WEATHER_PLACE_ENV[id]:null;
 if(verified)return verified.kind?{kind:verified.kind,label:verified.label,basis:'verified_list',sources:verified.sources,checkedAt:verified.checkedAt}:{kind:null,label:'',basis:'verified_list'};
 if(typeof p.name!=='string'||!p.name.trim())return {kind:null,label:'',basis:null};
 const name=p.name.replace(/\[[^\]]*\]/g,'').replace(/\s+/g,'');
 const indoor=HB_WEATHER_INDOOR_NAMES.find(([re])=>re.test(name));
 const outdoor=HB_WEATHER_OUTDOOR_NAMES.find(([re])=>re.test(name));
 const culture=p.kind==='culture'||String(p.contentTypeId??'')==='14'||p.providerCategoryCode==='A0206';
 const nature=['A0101','A0102'].includes(p.providerCategoryCode);
 if(indoor&&!outdoor)return {kind:'indoor',label:indoor[1],basis:culture?'official_category':'name_keyword'};
 if(culture&&!outdoor)return {kind:'indoor',label:'실내 문화시설',basis:'official_category'};
 if(outdoor&&!indoor&&!culture)return {kind:'outdoor',label:outdoor[1],basis:'name_keyword'};
 if(nature&&!indoor&&!culture)return {kind:'outdoor',label:'야외 자연 장소',basis:'official_category'};
 return {kind:null,label:'',basis:null};
}
/** Higher first. Only adverse/pleasant signals change order; unclassified places are never promoted. */
// 혼합 시설(mixed, "실내 시설 있음") 규칙: 비·눈·더위·추위·특보 때는 실내 시설 다음, 분류 없는 곳보다 앞;
// 맑고 온화할 때는 야외 장소 다음. 일정 초안의 시간 칸 조정(HB_WEATHER_DRAFT)에서는 실내로도 야외로도 세지 않는다.
function hbWeatherPlaceRank(p,signal){
 const kind=hbWeatherPlaceClass(p).kind;
 if(signal?.mode==='adverse')return kind==='indoor'?3:kind==='mixed'?2:kind==='outdoor'?0:1;
 if(signal?.mode==='pleasant')return kind==='outdoor'?2:kind==='mixed'?1:0;
 return 0;
}
function hbWeatherPlaceNote(p,signal){
 const c=hbWeatherPlaceClass(p);
 if(!c.kind||!signal?.label)return '';
 const classified=c.label+hbWeatherJosaRo(c.label)+' 분류된 곳';
 if(c.kind==='mixed'&&['adverse','pleasant'].includes(signal.mode))
  return '<p class="hb-weather-fit" data-hb-weather-fit="mixed">'+safe(signal.label+' · '+classified)+'</p>'+(signal.source?'<p class="muted hb-weather-source">'+safe(signal.source)+'</p>':'');
 if(signal.mode==='adverse'&&c.kind==='indoor')
  return '<p class="hb-weather-fit" data-hb-weather-fit="indoor">'+safe(signal.label+' · '+classified)+'</p>'+(signal.source?'<p class="muted hb-weather-source">'+safe(signal.source)+'</p>':'');
 if(signal.mode==='adverse'&&c.kind==='outdoor')
  return '<p class="muted" data-hb-weather-fit="outdoor-later">'+safe(c.label+' · 날씨가 나은 시간대 방문을 제안해요')+'</p>';
 if(signal.mode==='pleasant'&&c.kind==='outdoor')
  return '<p class="hb-weather-fit" data-hb-weather-fit="outdoor">'+safe(signal.label+' · '+classified)+'</p>'+(signal.source?'<p class="muted hb-weather-source">'+safe(signal.source)+'</p>':'');
 return '';
}
function hbWeatherSuggestBanner(signal){
 if(signal?.mode==='adverse')return '<section class="panel hb-weather-suggest" data-hb-weather-mode="adverse" aria-labelledby="hb-weather-suggest-title"><h2 id="hb-weather-suggest-title">날씨에 맞춘 여행지 제안</h2>'+
  '<p><strong>'+safe(signal.label)+'</strong> · 실내 시설로 분류된 곳을 먼저 보여 드려요. 야외 장소는 뒤에 두었어요.</p>'+(signal.source?'<p class="muted">'+safe(signal.source)+'</p>':'')+'</section>';
 if(signal?.mode==='pleasant')return '<section class="panel hb-weather-suggest" data-hb-weather-mode="pleasant" aria-labelledby="hb-weather-suggest-title"><h2 id="hb-weather-suggest-title">날씨에 맞춘 여행지 제안</h2>'+
  '<p><strong>'+safe(signal.label)+'</strong> · 공원·정원·궁궐 같은 야외 장소를 먼저 보여 드려요.</p>'+(signal.source?'<p class="muted">'+safe(signal.source)+'</p>':'')+'</section>';
 if(signal?.mode==='none'&&signal.reason==='out_of_range')return '<p class="muted hb-weather-suggest" data-hb-weather-mode="later">여행일이 가까워지면 날씨를 반영해 다시 제안해요.</p>';
 return '';
}
let hbWeatherBrowseFingerprint='';
function hbWeatherBrowseSignal(){
 if(typeof hbWeatherSignal!=='function'||typeof forecast==='undefined'||typeof currentWeatherKey!=='function')
  return {mode:'none',reason:'unavailable',label:'',source:'',hours:new Map(),fingerprint:'none|unavailable||'};
 return hbWeatherSignal(forecast,currentWeatherKey(),{start:s.hbPlanStart,end:s.hbPlanEnd});
}
function hbWeatherBrowseNeedsRefresh(){return hbWeatherBrowseSignal().fingerprint!==hbWeatherBrowseFingerprint}
function hbWeatherCourseNote(stops,signal){
 if(!['adverse','pleasant'].includes(signal?.mode)||!Array.isArray(stops))return '';
 const count=kind=>stops.filter(x=>hbWeatherPlaceClass(x.p).kind===kind).length;
 const indoor=count('indoor'),mixed=count('mixed'),outdoor=count('outdoor');
 const parts=[indoor?'실내 시설로 분류된 곳 '+indoor+'곳':'',mixed?'실내 시설이 있는 곳 '+mixed+'곳':'',outdoor?'야외 장소 '+outdoor+'곳':''].filter(Boolean);
 return parts.length?'<p class="muted" data-hb-weather-course>'+safe(signal.label+' · '+parts.join(' · '))+'</p>':'';
}
// END HB_WEATHER_SUGGEST
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
  (restroom?.location&&restroomSource&&!['자료가 서로 달라요','이용 제한 자료가 있어요'].includes(restroomStatus)?
   '<h3>장애인 화장실</h3><p>'+safe(restroom.location)+'</p>'+
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
function hbRichDetailAttach(place){
 // Official detail facts load with the page; nothing is drawn unless a value exists (MVP 2026-11-26).
 const identity=hbRichIdentity(place),component=window.HBRichPlaceDetail;
 if(!identity||!component||typeof component.mount!=='function')return;
 const host=document.createElement('section');host.className='panel hb-detail-info';host.setAttribute('aria-label','장소 이용 정보');host.setAttribute('aria-busy','true');
 const status=document.createElement('p');status.className='muted';status.setAttribute('role','status');status.textContent='장소 정보를 불러오는 중이에요.';
 const body=document.createElement('div');host.append(status,body);
 const arrival=el.querySelector('.hb-detail-access');if(arrival)arrival.insertAdjacentElement('beforebegin',host);else el.append(host);
 let disposed=false,unmount=null;const controller=new AbortController();
 hbRichDispose=()=>{disposed=true;controller.abort();if(typeof unmount==='function')unmount();};
 (async()=>{
  try{
   const q=new URLSearchParams({action:'detail',...identity});
   const response=await fetch('/api/rich-tour?'+q,{signal:controller.signal,credentials:'same-origin'});
   if(!response.ok)throw Error('unavailable');
   const data=await response.json();
   if(disposed||!host.isConnected)return;
   if(data.id!==place.id||data.contentTypeId!==identity.contentTypeId)throw Error('identity');
   if(typeof component.buildDetailModel==='function'&&component.buildDetailModel(data).isEmpty)throw Error('empty');
   unmount=component.mount(body,{data,photoAlreadyShown:true,showIdentity:false,mapAdapter:hbRichMapAdapter});
   status.remove();host.removeAttribute('aria-busy');
  }catch(e){
   // No data or no service: remove the box entirely instead of showing an empty or failure panel.
   if(!disposed&&host.isConnected)host.remove();
  }
 })();
}
function hbRichDiscoveryAttach(){
 if(!window.HBRichPlaceDetail||!document.getElementById('nearby-map'))return;
 const host=document.createElement('section');host.className='panel';host.id='hb-rich-discovery';
 host.innerHTML='<details><summary>전국 여행지 찾아보기</summary><p class="muted">전국 관광지·문화시설·식당 탐색. 수집 자료가 준비되면 저장된 카탈로그를 검색하고, 그 외에는 승인된 API 조회 환경에서만 이용할 수 있어요.</p><div class="field"><label for="hb-rich-mode">검색 방식</label><select id="hb-rich-mode"><option value="area">지역</option><option value="keyword">장소명</option><option value="location">위 지도 중심</option></select></div><div class="field"><label for="hb-rich-area">시·도</label><select id="hb-rich-area"><option value="">전국</option></select><button class="light" type="button" id="hb-rich-areas">지역 목록 불러오기</button></div><div class="field"><label for="hb-rich-district">시·군·구</label><select id="hb-rich-district"><option value="">전체</option></select></div><div class="field"><label for="hb-rich-keyword">장소명</label><input id="hb-rich-keyword" maxlength="100" type="search"></div><div class="field"><label for="hb-rich-kind">장소 유형</label><select id="hb-rich-kind"><option value="12">관광지</option><option value="14">문화시설</option><option value="39">식당</option></select></div><div class="actions"><button type="button" id="hb-rich-search">검색</button><button class="light" type="button" id="hb-rich-next" hidden>다음 결과 더 보기</button></div><p id="hb-rich-status" role="status"></p><div id="hb-rich-map"></div><div id="hb-rich-list"></div></details>';
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
  for(const p of items){const b=document.createElement('button');b.type='button';b.className='light';b.style.cssText='display:block;width:100%;min-height:var(--hb-touch);text-align:left;white-space:normal;margin-block:8px';b.textContent=p.name+(p.address?' · '+p.address:'');b.onclick=()=>select(p.id);list.append(b);}
 }
 async function run(reset){
  if(reset){try{params=readParams();}catch(e){status.textContent=e.message;return;}page=0;records=new Map();next.hidden=true;draw();}
  if(!params)return;
  const epoch=++searchEpoch;searchAbort?.abort();searchAbort=new AbortController();next.disabled=true;status.textContent='전국 관광정보를 확인 중이에요.';
  try{const result=await request({...params,pageNo:String(page+1)},searchAbort.signal);
   if(disposed||epoch!==searchEpoch)return;
   if(!Array.isArray(result.places)||result.pageNo!==page+1)throw Error('invalid page');
   for(const p of result.places){if(hbRichIdentity(p)&&typeof p.name==='string'&&p.name&&!records.has(p.id))records.set(p.id,p);}
   page++;draw();next.hidden=!result.hasNext||page>=5;status.textContent=(result.sourceMode==='catalog_snapshot'?'전국 수집 자료 '+String(result.collectedAt||'').slice(0,10)+' · '+result.totalAvailable+'곳 중 ':'')+'현재 조회 '+records.size+'곳 · '+(result.hasNext?(page>=5?'5페이지 조회 제한에 도달했어요. 검색 조건을 좁혀 주세요.':'다음 페이지가 있어요.'): '마지막 페이지예요.');
  }catch{if(!disposed&&epoch===searchEpoch)status.textContent='관광정보를 조회할 수 없어요. 기존 주변 검색은 계속 이용할 수 있어요.';}
  finally{if(!disposed&&epoch===searchEpoch)next.disabled=false;}
 }
 at('search').onclick=()=>run(true);next.onclick=()=>run(false);
}

// MVP P0 (2026-11-26): a place in the official detail catalog can still be drawn when the list or
// featured response that normally supplies it is missing (e.g. TourAPI 429). Identity comes only from
// the same-ID /api/rich-tour detail response; nothing is guessed. Failure falls back to "not found".
const hbCuratedFallback=new Map();
function hbCuratedFallbackPending(id){const entry=hbCuratedFallback.get(id);return !!entry&&!entry.done;}
function hbCuratedFallbackPlace(id){
 if(!/^tour-\d{1,12}$/.test(String(id||''))||typeof fetch!=='function')return null;
 const known=hbCuratedFallback.get(id);
 if(known)return known.place;
 const entry={place:null,done:false};hbCuratedFallback.set(id,entry);
 (async()=>{
  for(const type of ['12','14']){
   try{
    const res=await fetch('/api/rich-tour?'+new URLSearchParams({action:'detail',contentId:id.slice(5),contentTypeId:type}),{credentials:'same-origin'});
    if(!res.ok)continue;
    const d=await res.json();
    if(d?.id!==id||d.contentTypeId!==type||typeof d.name!=='string'||!d.name.trim()||!['1','31'].includes(String(d.areaCode)))continue;
    entry.place={id,contentId:id.slice(5),contentTypeId:type,kind:d.kind,name:d.name.trim(),address:typeof d.address==='string'?d.address:'',
     lat:Number.isFinite(d.lat)?d.lat:null,lng:Number.isFinite(d.lng)?d.lng:null,areaCode:String(d.areaCode),region:String(d.areaCode)==='31'?'경기':'서울',
     matched:true,accessFacts:[],accessStatus:'unverified',discoverySource:'curated_detail'};
    break;
   }catch{}
  }
  entry.done=true;
  const current=typeof path==='function'?path():'';
  if(current.startsWith('/place/')&&hbDecodePlaceId(current.slice(7))===id)detail(id);
 })();
 return null;
}

function detail(id){
 if(typeof hbRichDispose==='function')hbRichDispose();hbRichDispose=null;
 const fromDiscovery=hbDiscoveryDetailId===id;
 const back='<p><a id="hb-detail-back" class="hb-back-link" href="#/'+(fromDiscovery?'discover':'places')+'"><span aria-hidden="true">←</span> '+(fromDiscovery?'추천 장소':'장소 목록')+'</a></p>';
 let selectedRich=hbRichSelected?.id===id?hbRichSelected:(typeof nearbyItems!=='undefined'?nearbyItems.find(p=>p.id===id&&['nationwide_catalog','nationwide_live','keyword_snapshot'].includes(p.discoverySource))||null:null);
 if(!selectedRich&&id&&!places.some(value=>value.id===id))selectedRich=hbCuratedFallbackPlace(id);
 const place=id?(places.find(value=>value.id===id)||selectedRich):null;
 if(!place||!selectedRich&&(loading||issue)){
  if(loading||hbPlacesLoadedRegion===null&&!issue&&id||!place&&hbCuratedFallbackPending(id)){
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
  const source=fact.source||(href?'자료 보기':'');
  const status=hbEvidenceStatus(fact);
  return '<article class="hb-evidence-row"><div class="hb-evidence-head"><strong>'+safe(fact.label||'편의시설')+
   '</strong><span class="hb-evidence-status">'+status+'</span></div>'+(fact.description?'<p>'+safe(fact.description)+'</p>':'')+
   (source?'<p class="muted">출처 '+(href?'<a href="'+safe(href)+'" target="_blank" rel="noopener noreferrer">'+safe(source)+'</a>':safe(source))+'</p>':'')+
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
 const canPick=!fromDiscovery&&(picked||regionAllowed&&assessment.status!=='excluded');
 const other=facts.filter(fact=>!hbDetailTopics(fact).some(topic=>specs.some(([,topics])=>topics.includes(topic))));
 // Empty source panel is not drawn (MVP 2026-11-26: no empty boxes or no-data wording).
 const sourceBody=(place.matched?'<p>장소와 편의시설 정보는 공공 관광 자료를 바탕으로 제공돼요.</p>':'')+
  (other.length?other.map(renderFact).join(''):facts.length?'<p>자료별 출처와 확인 범위는 각 항목에서 확인할 수 있어요.</p>':'');
 el.innerHTML=back+'<span class="chip">'+hbPlaceCategory(place)+'</span><h1>'+safe(place.name)+'</h1>'+
  (place.address?'<p>'+safe(place.address)+'</p>':'')+
  '<div class="actions">'+
  (fromDiscovery?'<a href="#/new">여행 만들기</a>':canPick?'<button type="button" id="pick" aria-pressed="'+picked+'">'+(picked?'선택 취소':'일정에 담기')+'</button>':'')+'</div>'+
  '<p id="hb-detail-selection" role="status"></p>'+
  (!regionAllowed?'<p class="warn">현재 일정 작성은 선택한 서울·경기 지역에서 지원해요. 다른 지역은 상세정보를 살펴볼 수 있어요.</p>':'')+
  hbArrivalMarkup(place,guide,facts)+
  (assessment.status==='excluded'?'<p class="warn">선택한 계단 이용 조건과 검증된 이동 동선이 충돌해요.</p>':
   assessment.conflict?'<p class="warn">출처의 설명이 달라요.</p>':'')+
  specs.map(([title,topics,check])=>{
   const related=facts.filter(fact=>hbDetailTopics(fact).some(topic=>topics.includes(topic)));
   if(!related.length)return '';
   return '<details class="panel hb-detail-evidence"><summary><strong>'+title+'</strong></summary>'+
    related.map(renderFact).join('')+
    '<p class="muted">방문 전 확인: '+check+'</p></details>';
  }).join('')+
  (sourceBody?panel('정보 출처',sourceBody):'');
 hbBindAccessMap(guide);
 if(typeof window!=='undefined'&&window.HBRichPlaceDetail)hbRichDetailAttach(place);
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
 // P1-9 (2026-11-26): '조금 힘들어요' trims gently (one visit per three optional, at least one);
 // '많이 힘들어요' keeps only protected visits, meals and rests.
 const count=level==='low'?0:level==='mid'?(optional.length?Math.max(1,Math.floor(optional.length/3)):0):optional.length;
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
 const result=items.flatMap(stop=>{
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
 });
 return hbReplanRetime(result).map((stop,index)=>({...stop,position:index+1}));
}
// P1-9 (2026-11-26): after a condition change the remaining stops are re-timed so removals leave no
// unexplained gap. Completed/must/reserved stops are fixed anchors and never change. Other stops only move
// earlier (a meal not before its usual window); if anything would overlap, the times are left as they were.
function hbReplanRetime(list){
 if(!Array.isArray(list)||typeof hbDraftMinute!=='function'||typeof hbClock!=='function')return list;
 const minute=stop=>hbDraftMinute(stop?.plannedArrival||stop?.time);
 const restSlot=stop=>!!(stop&&stop.kind==='rest'&&stop.isPlaceholder&&!hbProtected(stop));
 // A placeholder rest left right after another rest (the visit between them was removed) is merged away.
 const merged=[];
 for(const stop of list){
  const prev=merged[merged.length-1];
  if(restSlot(stop)&&(!prev||prev.kind==='rest'))continue;
  merged.push(stop);
 }
 if(merged.some(stop=>minute(stop)===null||!Number.isInteger(Number(stop.stayMinutes))||Number(stop.stayMinutes)<0))return merged;
 const out=[];let cursor=null,lastVisit=null;
 for(const original of merged){
  let stop=original;
  const start=minute(stop),stay=Number(stop.stayMinutes);
  if(!hbProtected(stop)&&cursor!==null){
   if(stop.travelFromId&&stop.travelFromId!==lastVisit){
    // A confirmed route leg from a visit that is no longer before this stop does not apply any more.
    stop={...stop,transitionBufferMinutes:25,travelTimeStatus:'unknown'};
    for(const key of ['travelTimeMinutes','travelSource','travelCheckedAt','travelFromId','travelToId'])delete stop[key];
   }
   let next=cursor+Math.max(0,Number(stop.transitionBufferMinutes)||0);
   if(stop.kind==='food')next=Math.max(next,Math.min(start,start>=900?1020:690));
   if(next>start||next+stay>1439)return merged;
   stop={...stop,time:hbClock(next),plannedArrival:hbClock(next)};
  }else if(cursor!==null&&start<cursor)return merged;
  out.push(stop);
  cursor=minute(stop)+stay;
  if(stop.placeId&&!stop.isPlaceholder)lastVisit=stop.placeId;
 }
 return out;
}
/** Total span and placeholder travel of a re-timed day, for the plan summary. */
function hbReplanSpan(stops){
 const list=Array.isArray(stops)?stops:[];
 if(typeof hbDraftMinute!=='function'||typeof hbClock!=='function'||!list.length)return null;
 const starts=list.map(stop=>hbDraftMinute(stop?.plannedArrival||stop?.time));
 if(starts.some(x=>x===null))return null;
 const first=Math.min(...starts),end=Math.max(...list.map((stop,i)=>starts[i]+(Number(stop.stayMinutes)||0)));
 const travel=list.slice(1).reduce((sum,stop)=>sum+(stop.travelTimeStatus==='estimated'?0:Math.max(0,Number(stop.transitionBufferMinutes)||0)),0);
 const span=minutes=>(minutes>=60?Math.floor(minutes/60)+'시간 ':'')+(minutes%60?minutes%60+'분':minutes>=60?'':'0분');
 const total=end-first;
 return {start:hbClock(first),end:hbClock(Math.min(1439,end)),totalMinutes:total,placeholderTravelMinutes:travel,
  line:'예상 소요: 약 '+span(total).trim()+' (체류·식사·휴식 '+span(Math.max(0,total-travel)).trim()+' + 이동 약 '+span(travel).trim()+' (예상))'};
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
    mapNote:inserted?'변경 후 일정에 추가할 '+status+'예요.':
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
 // P1-9: the plan summary (예상 소요, end time) follows the re-timed day; undo restores the previous summary.
 const summary=hbReplanSummary(now);
 if(summary){undo.warnings=s.hbPlanWarnings;undo.info=s.hbPlanInfo;}
 const previous=s;
 if(!hbSaveTripStops(now,undo))return {ok:false,error:'저장에 실패해 기존 일정을 유지했어요.'};
 if(summary){
  s={...s,...summary};
  try{save()}catch{s=previous;try{save()}catch{}return {ok:false,error:'저장에 실패해 기존 일정을 유지했어요.'};}
 }
 return {ok:true,stops:now};
}
function hbReplanSummary(stops){
 const span=hbReplanSpan(stops);
 if(!span)return null;
 const warnings=(Array.isArray(s.hbPlanWarnings)?s.hbPlanWarnings:[]).filter(w=>typeof w==='string');
 const hadLine=warnings.some(w=>w.startsWith('예상 소요:'));
 const requested=hbDraftMinute(s.hbPlanInfo?.requestedEnd);
 const fits=requested===null||hbDraftMinute(span.end)<=requested;
 const next=warnings.filter(w=>!(fits&&w.startsWith('예상 시간이 종료(귀가) 희망 시각'))).map(w=>w.startsWith('예상 소요:')?span.line:w);
 if(!hadLine)next.push(span.line);
 const info=s.hbPlanInfo&&typeof s.hbPlanInfo==='object'?{...s.hbPlanInfo,end:span.end,totalMinutes:span.totalMinutes,
  placeholderTravelMinutes:span.placeholderTravelMinutes,...(fits?{overrunMinutes:0}:{})}:s.hbPlanInfo;
 return {hbPlanWarnings:next,hbPlanInfo:info};
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
 if(Object.prototype.hasOwnProperty.call(undo,'warnings')||Object.prototype.hasOwnProperty.call(undo,'info')){
  const previous=s;
  s={...s,hbPlanWarnings:undo.warnings,hbPlanInfo:undo.info};
  try{save()}catch{s=previous;}
 }
 return {ok:true};
}

let hbRefreshTravelConditionMap=null;
function plan(){
 const stops=Array.isArray(s.stops)?s.stops:[];
 const {region,date}=hbPlanContext(s);
 const undo=s.hbReplanUndo&&hbValidReplanStops(s.hbReplanUndo.before)&&s.hbReplanUndo.date===date&&s.hbReplanUndo.region===region&&s.hbReplanUndo.after===JSON.stringify(stops);
 hbDropPlanMap();
 el.innerHTML='<h1>가족 여행 일정</h1><p>'+safe(region)+' · '+safe(date)+'</p><div id="hb-plan-map-slot"></div>'+(typeof weatherCard==='function'?weatherCard(region,date):'')+'<p class="warn">방문 시간은 예상 계획이에요. 자동차 이동시간을 확인하면 일정에 반영할 수 있어요.</p>'+(stops.length?stops.map((x,i)=>'<article class="panel hb-itinerary-row" data-hb-stop-kind="'+safe(['food','rest','spot','travel','move','transport'].includes(x.kind)?x.kind:'unknown')+'"><div><h3>'+safe(x.time||'시간 미정')+' · '+safe(x.name||'방문지')+'</h3></div><div class="hb-itinerary-flags"><label><input type="checkbox" data-done="'+i+'" '+(hbCompleted(x)?'checked':'')+'> 완료</label><label><input type="checkbox" data-must="'+i+'" '+(hbMustVisit(x)?'checked':'')+'> 필수</label><label><input type="checkbox" data-reserved="'+i+'" '+(x.reserved||x.booked?'checked':'')+'> 예약됨</label><button type="button" class="light" data-remove="'+i+'" '+(hbProtected(x)?'disabled':'')+'>삭제</button></div></article>').join(''):panel('일정이 비어 있어요','추천 장소를 먼저 담아 주세요.'))+(undo?panel('최근 일정 변경','<p>부모님 컨디션에 따라 이 기기에서 수정한 일정이에요.</p><div id="hb-rpl-undo-box"><button type="button" class="light" id="hb-rpl-undo">이전 일정 되돌리기</button></div><p id="hb-rpl-undo-status" role="status" aria-live="polite"></p>'):'')+'<div class="actions">'+button('add','장소 더 담기',true)+button('fatigue','컨디션에 맞게 일정 조정')+button('share','가족에게 공유')+'</div>';
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
 // P2-9 (2026-11-26): an in-page confirmation instead of window.confirm(), which in-app browsers can
 // suppress (the button then looked dead).
 if(undo)document.getElementById('hb-rpl-undo').onclick=()=>{
  const box=document.getElementById('hb-rpl-undo-box'),status=document.getElementById('hb-rpl-undo-status');
  if(!box)return;
  box.innerHTML='<p>컨디션 조정 전 일정으로 되돌릴까요?</p><div class="actions"><button type="button" id="hb-rpl-undo-yes">되돌리기</button><button type="button" class="light" id="hb-rpl-undo-no">취소</button></div>';
  document.getElementById('hb-rpl-undo-yes').onclick=()=>{
   const result=hbUndoReplan();
   if(!result.ok){if(status)status.textContent=result.error;return}
   plan();
   document.getElementById('fatigue')?.focus();
  };
  document.getElementById('hb-rpl-undo-no').onclick=()=>{
   plan();
   document.getElementById('hb-rpl-undo')?.focus();
   const kept=document.getElementById('hb-rpl-undo-status');
   if(kept)kept.textContent='지금 일정을 그대로 유지해요.';
  };
  document.getElementById('hb-rpl-undo-yes').focus?.();
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
  '<h3 id="hb-travel-next" tabindex="-1">'+safe(next.name||'다음 방문지')+'</h3>'+
  '<p>예정 시간: '+safe(next.plannedArrival||next.time||'미정')+'</p>'+
  (next.address?'<p>'+safe(next.address)+'</p>':'')+
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
   safe(stop.name||'방문지')+(hbProtected(stop)?' <span class="hb-protected">보호: '+
   [hbCompleted(stop)?'완료':null,hbMustVisit(stop)?'필수':null,hbReserved(stop)?'예약':null].filter(Boolean).join('/')+'</span>':'')+'</li>').join('')+'</ul>':
   '<p class="muted">해당 장소 없음</p>';
  let selected=-1;
  compare.innerHTML='<section class="hb-rpl-card"><h3>변경안 미리보기</h3>'+
   '<div class="hb-replan-compare"><div><h3>기존 일정</h3>'+showList(items)+'</div>'+
   '<div><h3>변경 후 일정</h3><div data-replan-result></div><h3>제외 제안</h3>'+showList(proposal.removed)+'</div></div>'+
   (alternatives.length?'<fieldset><legend>변경 방법</legend><label><input type="radio" name="hb-replan-choice" value="-1" checked> 방문 줄이기</label>'+
    alternatives.map(({place,rest,km,note,source},index)=>'<p><label><input type="radio" name="hb-replan-choice" value="'+index+'"> <strong>'+
     safe(place.name)+'</strong>로 교체 · '+(rest?'휴식 공간 안내 있음':'계단 없는 구간 확인')+
     ' · 직선거리 약 '+km.toFixed(1)+'km</label><br>'+safe(note)+
     (source?' <a href="'+safe(source)+'" target="_blank" rel="noopener noreferrer">출처</a>':'')+'</p>').join('')+'</fieldset>':
    level!=='low'&&proposal.removed.length?'<p>가까운 곳에 바꿔 갈 장소가 없어 방문을 줄이는 안으로 보여 드려요. 쉬는 시간을 넉넉히 가져 주세요.</p>':'')+
   '<p class="muted">완료·필수·예약 일정은 그대로 두고, 남은 일정의 시간을 다시 맞춰요.</p>'+
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
const HB_PLACEHOLDER_TRAVEL_NOTE='장소 사이 이동은 약 25분 (예상)으로 넣었어요. 자동차 이동시간을 확인하면 실제 경로 시간으로 바꿀 수 있어요.';
function hbCreateSchedule(ids, all, opt={}){
 const errors=[],warnings=[],unique=[];
 for(const id of ids||[]){if(!unique.includes(id))unique.push(id)}
 const selected=unique.map(id=>all.find(p=>p.id===id));
 if(selected.some(x=>!x)){errors.push('선택한 장소 중 최신 목록에서 찾을 수 없는 곳이 있어요.');return {stops:[],errors,warnings}}
 const sights=selected.filter(p=>p.kind!=='food'),foods=selected.filter(p=>p.kind==='food');
 if(!sights.length)errors.push('관광지·문화시설을 최소 한 곳 선택해 주세요.');
 // §5: no fixed count limit on sights or restaurants. Feasibility is reported as
 // an estimated overrun / items that do not fit before midnight, never a block.
 // Apply rest preference to draft sight dwell only; actual walking/travel is unverified.
 const restInterval=[30,45,60].includes(Number(opt.restIntervalMinutes))?Number(opt.restIntervalMinutes):null;
 const sightStay=restInterval??60;
 const autoStart=opt.start==null||opt.start==='',autoEnd=opt.end==null||opt.end==='';
 const limit=autoEnd?1439:hbDraftMinute(opt.end);
 const start=autoStart?600:hbDraftMinute(opt.start);
 if(start===null||limit===null||!autoStart&&start>=limit)errors.push('종료 시간은 시작보다 늦어야 해요. 하루 일정은 자정 전에 끝나도록 정해 주세요.');
 if(errors.length)return {stops:[],errors,warnings};
 if(autoStart){
  let fallback=null;
  for(const n of [600,540,480,420,360,300,240,180,120,60,0].filter(n=>n<limit)){
   const candidate=hbCreateSchedule(ids,all,{...opt,start:hbClock(n)});
   if(candidate.errors.length)continue;
   if(!candidate.summary.overrunMinutes&&!candidate.summary.unscheduled.length){fallback={candidate,n};break}
   if(!fallback)fallback={candidate,n};
  }
  if(fallback){
   fallback.candidate.summary.windowStart=null;
   fallback.candidate.warnings.unshift('시작 시간을 정하지 않아 '+hbClock(fallback.n)+' 시작 초안을 제안했어요. 출발 시각을 정하면 그에 맞춰 다시 구성할 수 있어요.');
   return fallback.candidate;
  }
  return {stops:[],errors:['선택한 종료 희망 시간까지 일정을 구성하기 어려워요. 장소를 줄이거나 시간을 조정해 주세요.'],warnings};
 }
 let now=start,placeholderTravel=0;const result=[],unscheduled=[];
 const append=(kind,place,duration,name,travelGap,meta={})=>{
  if(travelGap){now+=travelGap;placeholderTravel+=travelGap}
  const index=result.length;
  result.push({id:place?.id||kind+'-draft-'+index,placeId:place?.id||null,kind,name:place?.name||name,address:place?.address||null,coordinates:hbMapCoordinates(place),time:hbClock(now),plannedArrival:hbClock(now),stayMinutes:duration,restMinutes:kind==='rest'?duration:0,transitionBufferMinutes:travelGap||0,travelTimeStatus:travelGap?'unknown':'not_applicable',isRestCandidate:kind==='rest',isPlaceholder:!place,position:index+1,done:false,must:false,reserved:false,booked:false,...meta});
  now+=duration
 };
 // Same-day contract: a block that would end after 23:59 is not placed.
 const place=(kind,item,duration,name,gap)=>{
  if(now+gap+duration>1439){if(item)unscheduled.push(item);return false}
  append(kind,item,duration,name,gap);return true;
 };
 const mealName=at=>at>=1020?'저녁 식사 시간':at<660?'아침 식사 시간':'점심 식사 시간';
 if(!place(sights[0].kind||'spot',sights[0],sightStay,'',0)){
  return {stops:[],errors:['선택한 시작 시간에는 자정 전에 첫 방문지를 넣을 수 없어요. 시작 시간을 앞당겨 주세요.'],warnings};
 }
 place('rest',null,20,'휴식 시간',0);
 const afterMeal=sights[1]?25+sightStay+15:0;
 const lunchStart=Math.max(now,705)+25;
 const includeMeal=foods.length>0||(start<780&&now>=570&&lunchStart+60+afterMeal<=limit);
 if(includeMeal){
  if(now>=570&&now<705)now=705;
  place('food',foods[0]||null,60,mealName(now+25),25);
 }
 const pendingFoods=foods.slice(1);
 sights.slice(1).forEach((sight,i)=>{
  // Extra restaurants become dinner-time meals before the next sight.
  if(i>0&&pendingFoods.length&&now+25>=1020)place('food',pendingFoods.shift(),60,mealName(now+25),25);
  if(place(sight.kind||'spot',sight,sightStay,'',25))place('rest',null,15,'휴식 시간',0);
 });
 while(pendingFoods.length){const food=pendingFoods.shift();place('food',food,60,mealName(now+25),25)}
 const overrun=!autoEnd&&now>limit?now-limit:0;
 const span=minutes=>(minutes>=60?Math.floor(minutes/60)+'시간 ':'')+(minutes%60?minutes%60+'분':minutes>=60?'':'0분');
 if(overrun){
  // Suggest dropping trailing optional sights (never the first) until it fits.
  const drop=[];let excess=overrun;
  for(const sight of sights.slice(1).reverse()){
   if(excess<=0)break;
   if(unscheduled.includes(sight))continue;
   drop.push(sight.name);excess-=25+sightStay+15;
  }
  warnings.unshift('예상 시간이 종료(귀가) 희망 시각 '+hbClock(limit)+'을 약 '+span(overrun).trim()+' 초과해요. 막지 않고 초안을 만들었어요. 다음 날로 나누기(다일 일정은 아직 첫날만 자동 구성), '+(drop.length?'일부 장소 빼기(뒤쪽부터 예: '+drop.join(', ')+'), ':'일부 장소 빼기, ')+'종료(귀가) 희망 시각 늦추기 중에서 골라 주세요.');
 }
 if(unscheduled.length)warnings.unshift('자정 전에 넣지 못한 장소 '+unscheduled.length+'곳: '+unscheduled.map(x=>x.name).join(', ')+'. 하루 일정은 자정 전까지 짜서 초안에서 빠졌어요. 선택 목록은 그대로 유지돼요. 다음 날로 나누기, 일부 장소 빼기, 시작 시간 앞당기기 중에서 골라 주세요.');
 if(restInterval)warnings.push('요청한 휴식 간격 '+restInterval+'분에 맞춰 관광지 체류시간 초안을 '+sightStay+'분으로 조정하고 방문 뒤 휴식을 배치했어요. 방문지 안에서 필요한 휴식과 실제 이동·보행시간은 계산하지 않았어요.');
 else if(opt.restIntervalMinutes!=null&&opt.restIntervalMinutes!=='')warnings.push('저장된 휴식 간격을 확인할 수 없어 기본 관광지 체류시간 60분으로 구성했어요. 조건을 다시 확인해 주세요.');
 if(opt.slopePreference==='avoid_steep')warnings.push('경사를 피하고 싶다고 하셨어요. 방문 전에 장소 상세의 경사·계단 정보를 함께 살펴봐 주세요.');
 if(['indoor','outdoor'].includes(opt.indoorPreference))warnings.push('실내외 선호를 반영하려면 장소 상세의 실내외 정보를 함께 살펴봐 주세요.');
 warnings.push('예상 소요: 약 '+span(now-start).trim()+' (체류·식사·휴식 '+span(now-start-placeholderTravel).trim()+' + 이동 약 '+span(placeholderTravel).trim()+' (예상))');
 warnings.push(HB_PLACEHOLDER_TRAVEL_NOTE);
 if(!foods.length&&includeMeal)warnings.push('식당을 고르지 않아 식사 시간만 넣어 두었어요.');
 if(!includeMeal)warnings.push('선택한 시간대에는 식사 블록을 자동으로 넣지 않았어요. 필요하면 식당을 직접 선택해 주세요.');
 if(opt.tripType==='overnight')warnings.push('현재는 숙박 여행이라도 첫날 일정 초안만 생성해요.');
 return {stops:result,errors,warnings,summary:{start:hbClock(start),end:hbClock(now),windowStart:hbClock(start),
  // An overrun draft keeps the requested end for display but does not lock edits to it.
  windowEnd:autoEnd||overrun?null:hbClock(limit),requestedEnd:autoEnd?null:hbClock(limit),
  sightCount:sights.length,foodSelected:!!foods.length,foodCount:foods.length,
  totalMinutes:now-start,placeholderTravelMinutes:placeholderTravel,overrunMinutes:overrun,unscheduled:unscheduled.map(x=>x.name)}}
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
  // Only drafts that fit the requested window are compared as weather options.
  if(draft.errors.length||draft.summary.overrunMinutes||draft.summary.unscheduled.length)continue;
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
 }else return fail('이 편집 동작은 처리할 수 없어요.');
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
    return fail('앞 일정의 체류시간과 예상 이동시간이 다음 일정과 겹쳐요. 시간을 다시 조정해 주세요.');
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
 if(leg?.status!=='estimated'||leg.source!=='naver_directions'||!Number.isSafeInteger(m)||m<1||m>1500000)return '';
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
   return {from:leg.from,to:leg.to,status:'unknown',minutes:null,
    ...(hbIssueCode(leg.reason)?{reason:leg.reason}:{}),...(hbIssueCode(leg.diagnostic)?{diagnostic:leg.diagnostic}:{})};
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
  if(data?.status==='provider_disabled')return {...fallback('provider_disabled'),
   reason:hbIssueCode(data.reason),diagnostic:hbIssueCode(data.diagnostic)};
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
// P1-10: configuration gaps (no keys / feature off) mean the car-route button can never succeed here.
// Quota, network or provider errors are temporary and keep the button.
const HB_ROUTE_SETUP_GAPS=['env_missing','missing_credentials','env_not_injected','feature_disabled','provider_disabled'];
let hbRouteProviderState=null; // null unknown · 'checking' · 'ready' · 'unavailable' (per page load)
function hbRouteProviderUnavailable(travel){
 return travel?.status==='provider_disabled'&&(HB_ROUTE_SETUP_GAPS.includes(travel.diagnostic)||HB_ROUTE_SETUP_GAPS.includes(travel.reason));
}
/** One /api/travel-times call for the first leg. Without setup the server answers provider_disabled
 * before any upstream call. Returns 'unavailable' | 'ready' | null (could not tell). */
async function hbProbeRouteProvider(items,context,request=hbTravelRequest){
 const {batches}=hbPlanTravelBatches(items);
 if(!batches.length||context?.transport!=='car'||!['서울','경기'].includes(context?.region))return null;
 let data;
 try{data=await request('/api/travel-times',{region:context.region,transport:'car',stopIds:batches[0].stopIds.slice(0,2)})}catch{return null}
 return hbRouteProviderUnavailable({status:data?.status,reason:hbIssueCode(data?.reason),diagnostic:hbIssueCode(data?.diagnostic)})?'unavailable':'ready';
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
   message:(before[edge.toIndex]?.name||'다음 방문지')+' 이동시간은 예상값으로 유지해요.',blocking:false});
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

// §5 / F05-02: short reasons for a route that could not be computed. The five
// configuration/provider categories stay distinct (설정 미등록 / 설정 일부 누락 /
// 기능 꺼짐 / 공급자 권한 부족 / 호출 한도 초과); none becomes a guessed duration.
const HB_TRAVEL_REASONS={
 env_missing:'설정 미등록',missing_credentials:'설정 미등록',
 env_not_injected:'설정 일부 누락',
 feature_disabled:'기능 꺼짐',provider_disabled:'기능 꺼짐',endpoint_routes_disabled:'출발지 경로 기능 꺼짐',
 provider_unauthorized:'공급자 권한 부족',authentication_failed:'공급자 권한 부족',
 quota_exceeded:'호출 한도 초과',rate_limited:'호출 한도 초과',
 timeout:'응답 지연',no_route:'자동차 경로 없음',invalid_coordinates:'위치 좌표 없음',upstream_error:'경로 서비스 오류',
 invalid_response:'응답 형식 오류',network_error:'네트워크 문제',invalid_context:'여행 지역 확인 필요',
 insufficient_stops:'지도 위치가 있는 방문지 부족',unsupported_mode:'자동차 이동이 아님'
};
const hbIssueCode=value=>typeof value==='string'&&/^[a-z_]{1,40}$/.test(value)?value:null;
function hbTravelIssueReason(...codes){
 for(const code of codes)if(hbIssueCode(code)&&HB_TRAVEL_REASONS[code])return HB_TRAVEL_REASONS[code];
 return null;
}
function hbTravelIssueLabel(...codes){
 const reason=hbTravelIssueReason(...codes);
 return reason?'자동차 경로를 불러오지 못해 예상 이동시간으로 보여 드려요 (사유: '+reason+')':'이동시간을 계산하지 못했어요';
}
/** Per-stop basis of the gap before it: verified Directions leg, placeholder buffer, or stale. */
function hbTravelBasis(items,index){
 const list=Array.isArray(items)?items:[],stop=list[index];
 if(!stop||!index)return {kind:'none'};
 if(stop.travelTimeStatus==='estimated'){
  const edge=hbPlanTravelEdges(list).find(e=>e.toIndex===index);
  return edge&&stop.travelFromId===edge.from&&stop.travelToId===edge.to&&Number.isSafeInteger(stop.travelTimeMinutes)?
   {kind:'verified',minutes:stop.travelTimeMinutes,checkedAt:stop.travelCheckedAt||null}:{kind:'stale'};
 }
 const buffer=Number(stop.transitionBufferMinutes||0);
 return buffer>0?{kind:'placeholder',minutes:buffer}:{kind:'none'};
}
function hbTravelBasisSummary(items){
 const list=Array.isArray(items)?items:[],sum={verified:0,placeholder:0,stale:0,placeholderMinutes:0};
 list.forEach((_,i)=>{
  const basis=hbTravelBasis(list,i);
  if(basis.kind==='verified')sum.verified++;
  else if(basis.kind==='stale')sum.stale++;
  else if(basis.kind==='placeholder'){sum.placeholder++;sum.placeholderMinutes+=basis.minutes}
 });
 return sum;
}
// §5 origin / return point. Stored only on this device, rounded to ~100 m, never shared.
const HB_TRIP_POINT_SOURCES=['current_location','place','label_only'];
function hbTripPoint(input,source,label){
 if(!HB_TRIP_POINT_SOURCES.includes(source))return null;
 const name=String(label??'').replace(/\s+/g,' ').trim().slice(0,40);
 if(source==='label_only')return name?{source,label:name,lat:null,lng:null}:null;
 const lat=Number(input?.lat),lng=Number(input?.lng);
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<33||lat>39||lng<124||lng>132)return null;
 const round=n=>Math.round(n*1000)/1000;
 return {source,label:name||(source==='current_location'?'현재 위치':'선택한 장소'),lat:round(lat),lng:round(lng)};
}
const hbTripPointRoutable=point=>!!point&&point.source!=='label_only'&&Number.isFinite(point.lat)&&Number.isFinite(point.lng);
function hbTripEndpointAnchors(items){
 const list=Array.isArray(items)?items:[],valid=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(id);
 const real=list.map((stop,index)=>({stop,index})).filter(({stop})=>stop&&!stop.isPlaceholder&&valid(stop.placeId));
 let end=null;
 for(const stop of list){
  const start=hbDraftMinute(stop?.plannedArrival||stop?.time),stay=Number(stop?.stayMinutes);
  if(start!==null&&Number.isSafeInteger(stay)&&stay>=0)end=Math.max(end??0,start+stay);
 }
 const first=real[0],last=real[real.length-1];
 return {
  first:first?{index:first.index,placeId:first.stop.placeId,name:first.stop.name||'첫 방문지',arrival:hbDraftMinute(first.stop.plannedArrival||first.stop.time)}:null,
  last:last?{index:last.index,placeId:last.stop.placeId,name:last.stop.name||'마지막 방문지',scheduleEnd:end}:null
 };
}
function hbTripEndpointKey(origin,returnTo,anchors){
 const pair=point=>hbTripPointRoutable(point)?[point.lat,point.lng]:null;
 return JSON.stringify([pair(origin),pair(returnTo),anchors?.first?.placeId||null,anchors?.last?.placeId||null]);
}
function hbDayClock(minute){
 const offset=Math.floor(minute/1440),clock=hbClock(((minute%1440)+1440)%1440);
 return {clock,dayOffset:offset,label:(offset===-1?'전날 ':offset===1?'다음날 ':offset?(offset>0?offset+'일 뒤 ':-offset+'일 전 '):'')+clock};
}
// Single home-leg rule (2026-11-26 사용자 결정 "같은 로직이어야 한다"): 집↔첫 방문지, 마지막 방문지↔집 이동시간은
// hbHomeLeg 하나로 구한다. 1단계 미리보기(hbHomePreview)·일정 생성(hbScheduleWithHomeLegs/hbHomeWindow)·일정 페이지
// (hbTripEndpointTimes, 패널 렌더는 HB_PLAN_PANEL_ENDPOINTS=false로 숨김)가 모두 이 함수를 쓴다.
// 우선순위: s.hbTripEndpoints.result에 저장된 네이버 자동차 경로(같은 출발/귀가 좌표·같은 방문지일 때, 조회 시각 포함)
// → 없으면 같은 기본 예상값 HB_HOME_PLACEHOLDER_MINUTES(25분, "예상").
const HB_HOME_PLACEHOLDER_MINUTES=25;
function hbHomeLegPoint(kind,state={}){
 if(kind==='departure')return state?.origin||null;
 return state?.returnMode==='none'?null:state?.returnMode==='other'?state.returnTo||null:state?.origin||null;
}
/** {kind,stopId,minutes,basis:'naver_directions'|'placeholder',checkedAt,reason?,diagnostic?}. */
function hbHomeLeg(kind,stopId,state={}){
 const fallback=reason=>({kind,stopId:stopId||null,minutes:HB_HOME_PLACEHOLDER_MINUTES,basis:'placeholder',checkedAt:null,reason});
 const point=hbHomeLegPoint(kind,state),result=state&&typeof state==='object'?state.result:null;
 if(!point)return fallback('no_point');
 if(!hbTripPointRoutable(point))return fallback('invalid_coordinates');
 if(!stopId)return fallback('no_anchor');
 if(!result||typeof result!=='object'||!Array.isArray(result.legs))return fallback('unchecked');
 let key=null;
 try{key=JSON.parse(result.key)}catch{key=null}
 const pair=Array.isArray(key)?key[kind==='departure'?0:1]:null,anchor=Array.isArray(key)?key[kind==='departure'?2:3]:null;
 if(!Array.isArray(pair)||pair[0]!==point.lat||pair[1]!==point.lng||anchor!==stopId)return fallback('stale');
 const leg=result.legs.find(l=>l&&l.kind===kind&&l.stopId===stopId);
 if(!leg)return fallback('unchecked');
 if(leg.status!=='estimated'||(leg.source!=null&&leg.source!=='naver_directions')||!Number.isSafeInteger(leg.minutes)||leg.minutes<1||leg.minutes>1440)
  return {...fallback('unknown'),diagnostic:leg.diagnostic||null,providerReason:leg.reason||null};
 return {kind,stopId,minutes:leg.minutes,basis:'naver_directions',checkedAt:typeof leg.checkedAt==='string'?leg.checkedAt:null};
}
/** Seoul clock label for a stored check time (e.g. "11월 26일 09:12"); '' when unusable. */
function hbHomeLegCheckedLabel(iso){
 const t=typeof iso==='string'?Date.parse(iso):NaN;
 if(!Number.isFinite(t))return '';
 const d=new Date(t+9*3600000);
 return (d.getUTCMonth()+1)+'월 '+d.getUTCDate()+'일 '+String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0');
}
/** "약 N분, 예상" / "약 N분, 네이버 자동차 경로 · 조회 11월 26일 09:12". */
function hbHomeLegText(leg){
 if(leg?.basis!=='naver_directions')return '약 '+(Number(leg?.minutes)||HB_HOME_PLACEHOLDER_MINUTES)+'분, 예상';
 const checked=hbHomeLegCheckedLabel(leg.checkedAt);
 return '약 '+leg.minutes+'분, 네이버 자동차 경로'+(checked?' · 조회 '+checked:'');
}
/** Home departure = first arrival − home leg; return = schedule end + home leg (hbHomeLeg: NAVER first, else 25분 예상). */
function hbTripEndpointTimes(items,state={}){
 const anchors=hbTripEndpointAnchors(items),origin=state.origin||null;
 const returnTo=hbHomeLegPoint('return',state);
 const key=hbTripEndpointKey(origin,returnTo,anchors);
 const side=(kind,point,anchor)=>{
  if(state.returnMode==='none'&&kind==='return')return {status:'not_requested'};
  if(!point)return {status:'no_point'};
  if(!anchor)return {status:'no_anchor'};
  const base=kind==='departure'?anchor.arrival:anchor.scheduleEnd;
  if(base===null||base===undefined)return {status:'unknown',reason:'invalid_schedule'};
  const leg=hbHomeLeg(kind,anchor.placeId,state);
  const minute=kind==='departure'?base-leg.minutes:base+leg.minutes;
  if(leg.basis==='naver_directions')return {status:'estimated',basis:leg.basis,minutes:leg.minutes,checkedAt:leg.checkedAt,...hbDayClock(minute)};
  return {status:'default',basis:leg.basis,minutes:leg.minutes,reason:leg.reason,diagnostic:leg.diagnostic||null,providerReason:leg.providerReason||null,...hbDayClock(minute)};
 };
 return {key,anchors,departure:side('departure',origin,anchors.first),return:side('return',returnTo,anchors.last)};
}
function hbTripEndpointRequest(items,context,state={}){
 if(context?.transport!=='car')return {skip:'unsupported_mode'};
 if(!['서울','경기'].includes(context?.region))return {skip:'invalid_context'};
 const times=hbTripEndpointTimes(items,state),body={region:context.region,transport:'car'};
 const origin=state.origin,returnTo=state.returnMode==='none'?null:state.returnMode==='other'?state.returnTo:origin;
 if(hbTripPointRoutable(origin)&&times.anchors.first){body.origin={lat:origin.lat,lng:origin.lng};body.firstStopId=times.anchors.first.placeId}
 if(hbTripPointRoutable(returnTo)&&times.anchors.last){body.returnTo={lat:returnTo.lat,lng:returnTo.lng};body.lastStopId=times.anchors.last.placeId}
 if(!body.origin&&!body.returnTo)return {skip:times.anchors.first?'no_point':'no_anchor'};
 return {body,key:times.key};
}
async function hbFetchTripEndpoints(items,context,state,request=hbTravelRequest){
 const plan=hbTripEndpointRequest(items,context,state);
 if(plan.skip)return {status:plan.skip,legs:[]};
 let data;
 try{data=await request('/api/trip-endpoints',plan.body)}catch{return {status:'network_error',legs:[]}}
 if(data?.status==='provider_disabled')return {status:'provider_disabled',reason:hbIssueCode(data.reason),diagnostic:hbIssueCode(data.diagnostic),legs:[]};
 if(data?.status==='unsupported_mode')return {status:'unsupported_mode',legs:[]};
 const expected=[plan.body.origin?['departure',plan.body.firstStopId]:null,plan.body.returnTo?['return',plan.body.lastStopId]:null].filter(Boolean);
 if(!data||!['estimated','incomplete'].includes(data.status)||!Array.isArray(data.legs)||data.legs.length!==expected.length)
  return {status:'invalid_response',legs:[]};
 const legs=[];
 for(let i=0;i<expected.length;i++){
  const leg=data.legs[i],[kind,stopId]=expected[i];
  if(!leg||leg.kind!==kind||leg.stopId!==stopId)return {status:'invalid_response',legs:[]};
  if(leg.status==='unknown'){
   if(leg.minutes!==null||leg.source!=null)return {status:'invalid_response',legs:[]};
   legs.push({kind,stopId,status:'unknown',minutes:null,reason:hbIssueCode(leg.reason),diagnostic:hbIssueCode(leg.diagnostic)});
   continue;
  }
  if(leg.status!=='estimated'||leg.source!=='naver_directions'||!Number.isSafeInteger(leg.minutes)||leg.minutes<1||leg.minutes>1440||
   typeof leg.checkedAt!=='string'||!Number.isFinite(Date.parse(leg.checkedAt))||Date.parse(leg.checkedAt)>Date.now()+300000)
   return {status:'invalid_response',legs:[]};
  legs.push({kind,stopId,status:'estimated',minutes:leg.minutes,source:'naver_directions',checkedAt:leg.checkedAt});
 }
 if((data.status==='estimated')!==legs.every(l=>l.status==='estimated'))return {status:'invalid_response',legs:[]};
 return {status:data.status,legs,key:plan.key};
}
function hbTripEndpointLine(kind,side,anchors){
 const what=kind==='departure'?'집 출발 예상':'귀가 도착 예상';
 if(side.status==='estimated'||side.status==='default'){
  const basis=kind==='departure'?(anchors.first?.name||'첫 방문지')+' 도착 시각 기준':'일정 종료 후 '+(anchors.last?.name||'마지막 방문지')+'에서 출발 기준';
  const failed=side.status==='default'&&side.reason==='unknown'?' · 네이버 경로를 계산하지 못해 예상값을 썼어요 (사유: '+(hbTravelIssueReason(side.diagnostic,side.providerReason)||'경로 서비스 오류')+')':'';
  return what+': '+side.label+' ('+basis+' · 이동 '+hbHomeLegText(side)+')'+failed;
 }
 const why={
  not_requested:'귀가 시간은 계산하지 않도록 선택했어요',
  no_point:kind==='departure'?'출발지를 입력하면 이동시간을 계산해요':'귀가 위치를 입력하면 귀가 시간을 계산해요',
  no_anchor:'지도 위치가 있는 방문지를 담으면 계산해요',
  stale:'출발지·귀가 위치나 방문지가 바뀌었어요. 다시 계산해 주세요',
  unchecked:'"집 출발·귀가 시간 확인"을 누르면 계산해요'
 }[side.status];
 return what+': '+(why||'계산하지 못했어요 (사유: '+(hbTravelIssueReason(side.diagnostic,side.reason)||'경로 서비스 오류')+')');
}

// §5 step-1 home times. depart/returnTime are home-based HH:MM ("집 출발 / 집 도착
// 희망"). Legacy planStart/planEnd keep their saved first-visit meaning and win
// when present, so an existing trip is never silently reinterpreted.
// opt.departLeg / opt.returnLeg come from hbHomeLeg; without them the same 25분 예상 applies.
function hbHomeWindow(opt={}){
 const text=v=>typeof v==='string'?v.trim():'';
 const planStart=text(opt.planStart),planEnd=text(opt.planEnd),depart=text(opt.depart),back=text(opt.returnTime);
 const errors=[],warnings=[];
 if(planStart||planEnd){
  if(depart||back)warnings.push('일정표에서 정한 첫 방문지 시작·종료 희망 시각이 있어 집 출발·도착 희망 시각 대신 사용했어요.');
  return {start:planStart,end:planEnd,errors,warnings,source:'first_visit',homeDeparture:null,homeReturn:null};
 }
 const usable=leg=>leg&&Number.isSafeInteger(leg.minutes)&&leg.minutes>0&&leg.minutes<=1440;
 const dLeg=usable(opt.departLeg)?opt.departLeg:hbHomeLeg('departure',null,{});
 const rLeg=usable(opt.returnLeg)?opt.returnLeg:hbHomeLeg('return',null,{});
 const originNote=dLeg.basis==='naver_directions'?'':opt.originSet?' "집 출발·귀가 시간 확인"을 누르면 실제 자동차 이동시간으로 맞출 수 있어요.':' 출발지를 입력하면 이동시간을 계산해요.';
 const legInfo=leg=>({basis:leg.basis,bufferMinutes:leg.minutes,stopId:leg.stopId||null,checkedAt:leg.checkedAt||null});
 let start='',end='',homeDeparture=null,homeReturn=null;
 if(depart){
  const minute=hbDraftMinute(depart);
  if(minute===null)errors.push('집 출발 희망 시각을 다시 확인해 주세요.');
  else if(minute+dLeg.minutes>=1440)errors.push('집 출발 희망 시각에 이동시간을 더하면 자정을 넘어요. 출발 시각을 앞당겨 주세요.');
  else{
   start=hbClock(minute+dLeg.minutes);
   homeDeparture={time:hbClock(minute),...legInfo(dLeg),originSet:!!opt.originSet};
   warnings.push('집 출발 희망 '+hbClock(minute)+' 기준으로 첫 방문지 도착을 '+start+'로 잡았어요 (이동 '+hbHomeLegText(dLeg)+').'+originNote);
  }
 }
 const returnDay=Number.isInteger(opt.returnDay)&&opt.returnDay>0?opt.returnDay:0;
 if(back&&returnDay){
  const minute=hbDraftMinute(back);
  if(minute===null)errors.push('집 도착 희망 시각을 다시 확인해 주세요.');
  else{
   homeReturn={time:hbClock(minute),dayOffset:returnDay,...legInfo(rLeg)};
   warnings.push('집 도착 희망이 '+(returnDay===1?'다음 날':(returnDay+1)+'일차')+' '+hbClock(minute)+'이라 첫날 일정은 종료 제한 없이 구성했어요. 현재는 첫날 일정만 만들어요.');
  }
 }else if(back){
  const minute=hbDraftMinute(back);
  if(minute===null)errors.push('집 도착 희망 시각을 다시 확인해 주세요.');
  else if(minute-rLeg.minutes<=0)errors.push('집 도착 희망 시각이 너무 일러 일정을 넣을 수 없어요. 자정을 넘겨 도착하려면 집 도착 날짜를 다음 날로 골라 주세요.');
  else{
   end=hbClock(minute-rLeg.minutes);
   homeReturn={time:hbClock(minute),dayOffset:0,...legInfo(rLeg)};
   warnings.push('집 도착 희망 '+hbClock(minute)+'에 맞춰 일정이 '+end+'까지 끝나도록 했어요 (귀가 이동 '+hbHomeLegText(rLeg)+').');
  }
 }
 if(start&&end&&hbDraftMinute(start)>=hbDraftMinute(end))errors.push('집 출발과 집 도착 희망 시각 사이에 이동 여유를 빼면 일정을 넣을 시간이 없어요. 시간을 늘려 주세요.');
 return {start,end,errors,warnings,source:depart||back?'home':'automatic',homeDeparture,homeReturn};
}
/** Schedule creation with the unified home leg. Build once with the leg known before the
 * schedule exists (25분 예상), then, when a saved NAVER leg matches the resulting first/last
 * visit and the current origin/return point, rebuild with those minutes. The rebuilt draft
 * is kept only if its first/last visits still match the legs used. create(home)->plan. */
function hbScheduleWithHomeLegs(homeInput,state,create){
 const home=hbHomeWindow(homeInput);
 if(home.errors.length)return {home,plan:null};
 const plan=create(home);
 if(home.source!=='home'||!plan||plan.errors?.length)return {home,plan};
 const anchors=hbTripEndpointAnchors(plan.stops);
 const naver=leg=>leg&&leg.basis==='naver_directions'?leg:null;
 const departLeg=homeInput.depart&&anchors.first?naver(hbHomeLeg('departure',anchors.first.placeId,state)):null;
 const sameDayReturn=homeInput.returnTime&&!(Number.isInteger(homeInput.returnDay)&&homeInput.returnDay>0);
 const returnLeg=sameDayReturn&&anchors.last?naver(hbHomeLeg('return',anchors.last.placeId,state)):null;
 if(!departLeg&&!returnLeg)return {home,plan};
 const next=hbHomeWindow({...homeInput,departLeg:departLeg||undefined,returnLeg:returnLeg||undefined});
 if(next.errors.length)return {home:next,plan:null};
 const nextPlan=create(next);
 if(!nextPlan||nextPlan.errors?.length)return {home,plan};
 const after=hbTripEndpointAnchors(nextPlan.stops);
 if(departLeg&&after.first?.placeId!==departLeg.stopId||returnLeg&&after.last?.placeId!==returnLeg.stopId)return {home,plan};
 return {home:next,plan:nextPlan};
}
/** Step-1 (여행 정보) preview from the same rule. Shown only with an origin and a home time;
 * legacy first-visit times win (their own note is shown instead). savedStops: the stored draft,
 * whose first/last visit lets a saved NAVER leg be reused. */
function hbHomePreview(input={},state={},savedStops=[]){
 const text=v=>typeof v==='string'?v.trim():'';
 if(text(input.planStart)||text(input.planEnd))return null;
 const depart=hbDraftMinute(text(input.depart)),back=hbDraftMinute(text(input.returnTime));
 if(!state?.origin||depart===null&&back===null)return null;
 const anchors=hbTripEndpointAnchors(Array.isArray(savedStops)?savedStops:[]);
 const departLeg=hbHomeLeg('departure',anchors.first?.placeId||null,state);
 const returnLeg=hbHomeLeg('return',anchors.last?.placeId||null,state);
 const where=(leg,anchor)=>leg.basis==='naver_directions'&&anchor?.name?anchor.name+'까지 ':'';
 const returnDay=Number.isInteger(input.returnDay)&&input.returnDay>0?input.returnDay:0;
 const lines=[];
 if(depart!==null){
  const at=hbDayClock(depart+departLeg.minutes);
  lines.push({kind:'arrival',basis:departLeg.basis,minutes:departLeg.minutes,label:at.label,dayOffset:at.dayOffset,
   text:'예상 첫 방문지 도착 '+at.label+' (집 출발 '+hbClock(depart)+' · '+where(departLeg,anchors.first)+'이동 '+hbHomeLegText(departLeg)+')'+(at.dayOffset>0?' · 출발 시각을 앞당기면 같은 날 일정으로 만들 수 있어요':'')});
 }
 if(back!==null){
  const dayWord=returnDay===1?'다음날 ':returnDay>1?(returnDay+1)+'일차 ':'';
  const endAt=returnDay?null:hbDayClock(back-returnLeg.minutes);
  lines.push({kind:'return',basis:returnLeg.basis,minutes:returnLeg.minutes,label:dayWord+hbClock(back),dayOffset:returnDay,
   text:'예상 귀가 '+dayWord+hbClock(back)+' (집 도착 희망'+(endAt?' · 일정은 '+endAt.label+'까지':'')+' · '+where(returnLeg,anchors.last)+'귀가 이동 '+hbHomeLegText(returnLeg)+')'});
 }else if(anchors.last&&anchors.last.scheduleEnd!==null&&anchors.last.scheduleEnd!==undefined&&hbHomeLegPoint('return',state)){
  const at=hbDayClock(anchors.last.scheduleEnd+returnLeg.minutes);
  lines.push({kind:'return',basis:returnLeg.basis,minutes:returnLeg.minutes,label:at.label,dayOffset:at.dayOffset,
   text:'예상 귀가 '+at.label+' (저장된 일정 종료 '+hbDayClock(anchors.last.scheduleEnd).label+' 후 '+where(returnLeg,anchors.last)+'귀가 이동 '+hbHomeLegText(returnLeg)+')'});
 }
 return lines.length?{lines,departLeg,returnLeg}:null;
}
function hbHomePreviewMarkup(){
 if(typeof s==='undefined'||!s)return '';
 const preview=hbHomePreview({planStart:s.hbPlanStart,planEnd:s.hbPlanEnd,depart:s.hbDepartTime,returnTime:s.hbReturnTime,returnDay:Number(s.hbReturnDay)||0},hbTripEndpointState(),s.stops);
 if(!preview)return '';
 return '<ul class="hb-trip-home-preview-list">'+preview.lines.map(line=>'<li data-hb-preview="'+line.kind+'" data-hb-preview-basis="'+safe(line.basis)+'">'+safe(line.text)+'</li>').join('')+'</ul>';
}
/** Shift every stop by delta minutes (same day only); protected stops block it. */
function hbShiftDraft(items,delta,window={}){
 const fail=error=>({ok:false,error,stops:items});
 if(!Array.isArray(items)||!items.length)return fail('옮길 일정이 없어요.');
 if(!Number.isSafeInteger(delta)||delta===0)return fail('옮길 시간이 없어요.');
 if(items.some(x=>x&&(x.done||x.must||x.reserved||x.booked||x.completed||x.mustVisit)))return fail('완료·필수·예약 일정이 있어 자동으로 옮기지 않아요. 시간을 직접 수정해 주세요.');
 const upper=hbDraftMinute(window.windowEnd)??1439;
 const stops=[];
 for(const stop of items){
  const start=hbDraftMinute(stop?.plannedArrival||stop?.time),stay=Number(stop?.stayMinutes);
  if(start===null||!Number.isSafeInteger(stay))return fail('일정 시각이 올바르지 않아 옮기지 않았어요.');
  const next=start+delta;
  if(next<0||next+stay>1439)return fail('옮기면 날짜가 바뀌어요. 시간을 직접 수정해 주세요.');
  if(next+stay>upper)return fail('옮기면 일정 종료 희망 시각을 넘어요. 직접 수정해 주세요.');
  stops.push({...stop,time:hbClock(next),plannedArrival:hbClock(next)});
 }
 return {ok:true,stops};
}
/** Compare the desired home departure with a verified origin leg. */
function hbDesiredDepartureCheck(items,state,homeDeparture){
 const depart=hbDraftMinute(homeDeparture?.time);
 if(depart===null)return null;
 const times=hbTripEndpointTimes(items,state),first=times.anchors.first;
 if(times.departure.status!=='estimated'||!first||first.arrival===null)
  return {status:'unverified',canApply:false,message:'집 출발 희망 '+hbClock(depart)+' · 첫 방문지까지 이동 약 '+(Number(homeDeparture.bufferMinutes)||HB_HOME_PLACEHOLDER_MINUTES)+'분 (예상)으로 일정을 잡았어요.'};
 const arrival=depart+times.departure.minutes,delta=arrival-first.arrival;
 if(arrival>=1440)return {status:'overflow',canApply:false,message:'집 출발 희망 '+hbClock(depart)+'에 확인된 이동시간을 더하면 자정을 넘어요. 출발 시각을 앞당겨 주세요.'};
 if(!delta)return {status:'aligned',canApply:false,delta:0,message:'집 출발 희망 '+hbClock(depart)+'에 출발하면 확인된 자동차 경로 기준 첫 방문지에 '+hbClock(arrival)+'쯤 도착해요. 현재 일정과 맞아요.'};
 return {status:'mismatch',canApply:true,delta,message:'집 출발 희망 '+hbClock(depart)+' 기준 확인된 자동차 경로로는 첫 방문지 도착이 '+hbClock(arrival)+'쯤이에요 (현재 일정 '+hbClock(first.arrival)+', '+Math.abs(delta)+'분 '+(delta>0?'늦음':'이름')+').'};
}

/** Visible result when NAVER legs cannot be loaded: the current schedule's
 * travel per leg (verified or "예상") plus the reason. Never an empty result. */
function hbRouteFallbackView(items,travel){
 const list=Array.isArray(items)?items:[];
 const rows=hbPlanTravelEdges(list).map(edge=>{
  const basis=hbTravelBasis(list,edge.toIndex);
  return {from:list[edge.fromIndex]?.name||edge.from,to:list[edge.toIndex]?.name||edge.to,kind:basis.kind,
   text:basis.kind==='verified'?'약 '+basis.minutes+'분 (네이버 자동차 경로)':basis.kind==='placeholder'?'약 '+basis.minutes+'분 (예상)':
    basis.kind==='stale'?'방문 순서가 바뀌어 다시 계산이 필요해요':'이동시간을 따로 넣지 않은 구간'};
 });
 return {notice:hbTravelIssueLabel(travel?.diagnostic,travel?.reason,travel?.status)+'. 지금 일정은 그대로 유지돼요.',rows};
}
const HB_TRANSPORT_LABELS={car:'자동차',transit:'대중교통',public_transit:'대중교통',mixed:'상황에 따라 선택'};
function hbRouteMode(state){
 const mode=state?.hbTransport||state?.hbPlanInfo?.transport||'car';
 return mode==='car'?{kind:'car',transport:'car'}:{kind:'guide',transport:mode,label:HB_TRANSPORT_LABELS[mode]||'자동차 외 이동'};
}
// Saved drafts may hold older unconfirmed-information wording; show only
// actionable lines and map the old placeholder-travel note to the current one.
// 2026-11-26 사용자 결정: 저장된 특보 경고의 '실내라고 안전이 보장되는 것은 아니에요.' 문장만 빼고 나머지는 보여 준다.
function hbVisiblePlanWarnings(list,someConfirmed=false){
 const hidden=/미확인|확인 전이에요|검증되지 않았|확인되지 않|지정된 상태가 아니에요|여전히 미확인/;
 return (Array.isArray(list)?list:[]).filter(w=>typeof w==='string').map(w=>w.replace(/\s*실내라고 안전이 보장되는 것은 아니에요\./g,'').trim()).filter(Boolean).map(w=>
  w.startsWith('장소 간 이동은 실제 경로 소요시간이 아니라')||w===HB_PLACEHOLDER_TRAVEL_NOTE?
   (someConfirmed?'일부 자동차 이동시간을 네이버 경로로 반영했어요. 나머지 이동시간은 예상이에요.':HB_PLACEHOLDER_TRAVEL_NOTE):w)
  .filter(w=>!hidden.test(w));
}
// BEGIN HB_WEATHER_DRAFT
// 날씨를 반영한 일정 초안 (사용자 원래 의도: 비교 화면이 아니라 시스템이 먼저 제안, DECISIONS 2026-11-26).
// 기존 시간 칸·식사·휴식·보호(완료·필수·예약) 일정은 그대로 두고, 관광지가 어느 시간 칸에 들어갈지만 바꾼다.
// 야외로 분류된 곳의 강수·기온 부담 시간이 실제로 줄어들 때만 제안한다. 안전이나 현장 상태를 판단하지 않는다.
function hbWeatherStopsKey(stops){
 return JSON.stringify((Array.isArray(stops)?stops:[]).map(x=>[x?.placeId||x?.kind||'',x?.plannedArrival||x?.time||'',Number(x?.stayMinutes)||0]));
}
function hbWeatherStopLocked(stop){return !!(stop&&(stop.done||stop.completed||stop.must||stop.mustVisit||stop.reserved||stop.booked))}
function hbWeatherIsSight(stop){return !!(stop&&stop.placeId&&!stop.isPlaceholder&&!['food','rest'].includes(stop.kind))}
function hbWeatherStopHours(start,stay,hours){
 const out=[];
 if(start===null||!Number.isFinite(stay)||stay<=0||!(hours instanceof Map))return out;
 for(let t=Math.floor(start/60)*60;t<start+stay;t+=60){const h=hours.get(t);if(h)out.push(h)}
 return out;
}
function hbWeatherStopsSpan(stops){
 let lo=null,hi=null;
 for(const x of Array.isArray(stops)?stops:[]){
  const at=hbDraftMinute(x?.plannedArrival||x?.time);if(at===null)continue;
  lo=lo===null?at:Math.min(lo,at);hi=Math.max(hi??0,at+(Number(x.stayMinutes)||0));
 }
 return lo===null?{}:{start:hbClock(lo),end:hbClock(Math.min(1439,hi))};
}
function hbWeatherPermutations(list){
 if(list.length<=1)return [list.slice()];
 const out=[];
 list.forEach((item,i)=>{for(const rest of hbWeatherPermutations([...list.slice(0,i),...list.slice(i+1)]))out.push([item,...rest])});
 return out;
}
/** Returns {stops,before,after} or null when no outdoor exposure is removed. Input stops are never mutated. */
function hbWeatherReorderStops(stops,{classOf,signal,isLocked=hbWeatherStopLocked}={}){
 const hours=signal?.hours;
 if(!Array.isArray(stops)||!(hours instanceof Map)||!hours.size||typeof classOf!=='function')return null;
 const bad=h=>!!(h.wet||h.hot||h.cold);
 if(![...hours.values()].some(bad))return null;
 const limit=typeof HB_WEATHER_SUGGEST_RULE!=='undefined'?HB_WEATHER_SUGGEST_RULE.maxReorderStops:6;
 const movable=[];
 stops.forEach((x,i)=>{if(hbWeatherIsSight(x)&&!isLocked(x))movable.push(i)});
 if(movable.length<2||movable.length>limit)return null;
 const kinds=new Map(movable.map(i=>[i,classOf(stops[i])]));
 if(![...kinds.values()].includes('outdoor'))return null;
 const startOf=x=>hbDraftMinute(x?.plannedArrival||x?.time);
 if(movable.some(i=>startOf(stops[i])===null))return null;
 const build=assign=>{
  const next=stops.map(x=>({...x}));
  let changed=false;
  assign.forEach((from,k)=>{
   const target=movable[k],slot=stops[target];
   if(from!==target)changed=true;
   next[target]={...stops[from],time:slot.time,plannedArrival:slot.plannedArrival,transitionBufferMinutes:slot.transitionBufferMinutes,travelTimeStatus:slot.travelTimeStatus,position:slot.position};
  });
  // Same rule as a manual swap: previously confirmed origin/destination legs no longer apply.
  if(changed)for(const stop of next)if(stop.travelTimeStatus==='estimated'||stop.travelFromId){
   stop.transitionBufferMinutes=25;stop.travelTimeStatus='unknown';
   delete stop.travelTimeMinutes;delete stop.travelSource;delete stop.travelCheckedAt;delete stop.travelFromId;delete stop.travelToId;
  }
  for(let i=0;i<next.length;i++){
   const at=startOf(next[i]),stay=Number(next[i].stayMinutes);
   if(at===null||!Number.isFinite(stay)||stay<0||at+stay>1439)return null;
   if(i){const prev=next[i-1],p=startOf(prev);if(p+Number(prev.stayMinutes||0)+Number(next[i].transitionBufferMinutes||0)>at)return null;}
  }
  return next;
 };
 const score=(assign,next)=>{
  let outdoorBad=0,indoorBad=0,pop=0,moved=0;
  assign.forEach((from,k)=>{
   const stop=next[movable[k]],hs=hbWeatherStopHours(startOf(stop),Number(stop.stayMinutes),hours),kind=kinds.get(from);
   if(kind==='outdoor'){outdoorBad+=hs.filter(bad).length;pop+=hs.reduce((n,h)=>n+h.pop,0)}
   if(kind==='indoor')indoorBad+=hs.filter(bad).length;
   if(from!==movable[k])moved++;
  });
  return {outdoorBad,indoorBad,pop,moved};
 };
 const baseStops=build(movable);
 if(!baseStops)return null;
 const before=score(movable,baseStops);
 const better=(v,b)=>v.outdoorBad!==b.outdoorBad?v.outdoorBad<b.outdoorBad:v.indoorBad!==b.indoorBad?v.indoorBad>b.indoorBad:
  v.pop!==b.pop?v.pop<b.pop:v.moved<b.moved;
 let best=null;
 for(const assign of hbWeatherPermutations(movable)){
  const next=build(assign);if(!next)continue;
  const v=score(assign,next);
  if(!best||better(v,best.v))best={assign,next,v};
 }
 if(!best||best.v.outdoorBad>=before.outdoorBad)return null;
 return {stops:best.next,before,after:best.v};
}
/** One-line reason for the summary above the itinerary. Wording is a weather fact, never a safety claim. */
function hbWeatherDraftReason(signal,stops,classOf,before=null){
 const hours=signal?.hours instanceof Map?signal.hours:new Map(),bad=h=>!!(h.wet||h.hot||h.cold);
 const band=typeof hbWeatherBand==='function'?hbWeatherBand:m=>m<720?'오전':'오후';
 const counts=new Map(),indoorBands=new Set();
 for(const stop of Array.isArray(stops)?stops:[]){
  if(!hbWeatherIsSight(stop))continue;
  const hs=hbWeatherStopHours(hbDraftMinute(stop.plannedArrival||stop.time),Number(stop.stayMinutes),hours).filter(bad);
  for(const h of hs){counts.set(band(h.minute),(counts.get(band(h.minute))||0)+1);if(classOf(stop)==='indoor')indoorBands.add(band(h.minute))}
 }
 if(!counts.size)for(const h of hours.values())if(bad(h))counts.set(band(h.minute),(counts.get(band(h.minute))||0)+1);
 const main=[...counts].sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
 const sample=[...hours.values()].filter(h=>bad(h)&&band(h.minute)===main);
 const wetTypes=typeof HB_WEATHER_SUGGEST_RULE!=='undefined'?HB_WEATHER_SUGGEST_RULE.wetTypes:['비','비 또는 눈','눈','소나기'];
 const word=sample.some(h=>h.wet)?(sample.find(h=>wetTypes.includes(h.type))?.type||'강수')+' 예보':sample.some(h=>h.hot)?'더위 부담':'추위 부담';
 const particle=/부담$/.test(word)?'으로':'로';
 const indoor=indoorBands.has(main);
 // P1-8 (2026-11-26): say only what actually changed. Outdoor stops still inside burden hours are named as
 // kept, never described as moved. `before` (the original order) identifies the stops that really moved.
 const badCount=stop=>hbWeatherStopHours(hbDraftMinute(stop.plannedArrival||stop.time),Number(stop.stayMinutes),hours).filter(bad).length;
 const outdoor=(Array.isArray(stops)?stops:[]).filter(x=>hbWeatherIsSight(x)&&classOf(x)==='outdoor');
 const prior=new Map((Array.isArray(before)?before:[]).filter(hbWeatherIsSight).map(x=>[x.placeId,badCount(x)]));
 const names=list=>list.map(x=>x.name).filter(x=>typeof x==='string'&&x.trim());
 const moved=names(outdoor.filter(x=>prior.has(x.placeId)&&badCount(x)<prior.get(x.placeId)));
 const stayed=names(outdoor.filter(x=>badCount(x)>0));
 const list=xs=>xs.join(', ');
 const keptNote=stayed.length?' '+list(stayed)+hbJosa(stayed[stayed.length-1],'은','는')+' 옮길 수 있는 시간대가 없어 그대로예요.':'';
 const movedPart=moved.length?list(moved)+hbJosa(moved[moved.length-1],'을','를'):'야외 일정을';
 const outdoorApplied=moved.length||!stayed.length?main+' '+word+particle+' '+movedPart+' 날씨가 나은 시간대로 옮겼어요.'+keptNote:
  main+' '+word+particle+' 일정 순서를 조정했어요.'+keptNote;
 const outdoorProposal=moved.length||!stayed.length?main+' '+word+'에 맞춰 '+movedPart+' 날씨가 나은 시간대로 옮긴 대체안이에요.'+keptNote:
  main+' '+word+'에 맞춰 일정 순서를 조정한 대체안이에요.'+keptNote;
 return {band:main,word,indoor,moved,stayed,
  applied:indoor?main+' '+word+particle+' 실내 일정을 '+main+'에 배치했어요.'+keptNote:outdoorApplied,
  proposal:indoor?main+' '+word+'에 맞춰 실내 일정을 '+main+'에 둔 대체안이에요.'+keptNote:outdoorProposal};
}
/** 받침에 따라 조사를 고른다(을/를, 은/는). */
function hbJosa(word,withFinal,withoutFinal){
 const code=String(word||'').trim().slice(-1).charCodeAt(0)-0xAC00;
 return code>=0&&code<11172&&code%28?withFinal:withoutFinal;
}
function hbWeatherStopClassifier(){
 const list=typeof places!=='undefined'&&Array.isArray(places)?places:[];
 return stop=>typeof hbWeatherPlaceClass==='function'?hbWeatherPlaceClass(list.find(p=>p&&p.id===stop?.placeId)||{id:stop?.placeId,name:stop?.name,kind:stop?.kind}).kind:null;
}
/** Default draft for a new plan: weather-ordered when it removes outdoor exposure; the original is kept for 되돌리기. */
function hbWeatherDraftForNewPlan(stops,state){
 if(typeof hbWeatherSignal!=='function'||typeof forecast==='undefined')return null;
 const signal=hbWeatherSignal(forecast,JSON.stringify([state.region,state.date]),hbWeatherStopsSpan(stops));
 const chosen=Array.isArray(state.chosen)?state.chosen:[];
 const must=(Array.isArray(state.hbMustVisitIds)?state.hbMustVisitIds:[]).filter(id=>chosen.includes(id));
 const classOf=hbWeatherStopClassifier();
 const result=hbWeatherReorderStops(stops,{classOf,signal,isLocked:x=>hbWeatherStopLocked(x)||must.includes(x.placeId)});
 if(!result)return null;
 return {region:state.region,date:state.date,message:hbWeatherDraftReason(signal,result.stops,classOf,stops).applied,source:signal.source||'',
  originalStops:stops,weatherStops:result.stops,createdAt:new Date().toISOString()};
}
let hbPlanWeatherMessage='';
function hbPlanWeatherView(){
 const stops=Array.isArray(s.stops)?s.stops:[];
 if(!stops.length)return {kind:'none'};
 const {region,date}=hbPlanContext(s);
 const d=s.hbWeatherDraft;
 const draft=d&&typeof d==='object'&&d.region===region&&d.date===date&&Array.isArray(d.originalStops)&&Array.isArray(d.weatherStops)?d:null;
 const current=hbWeatherStopsKey(stops);
 if(draft&&current===hbWeatherStopsKey(draft.weatherStops))return {kind:'applied',draft};
 if(draft&&current===hbWeatherStopsKey(draft.originalStops))return {kind:'original',draft};
 // F14-01: a saved plan whose latest forecast now has rain/heat/cold burden gets an alternative, applied only on approval.
 if(typeof hbWeatherSignal!=='function'||typeof forecast==='undefined'||typeof currentWeatherKey!=='function')return {kind:'none'};
 const key=JSON.stringify([region,date]);
 if(currentWeatherKey()!==key)return {kind:'none'};
 const signal=hbWeatherSignal(forecast,key,hbWeatherStopsSpan(stops));
 if(signal.mode!=='adverse')return {kind:'none'};
 const classOf=hbWeatherStopClassifier();
 const result=hbWeatherReorderStops(stops,{classOf,signal});
 if(!result)return {kind:'none'};
 const dismissKey=signal.fingerprint+'|'+current;
 if(s.hbWeatherDismissed===dismissKey)return {kind:'none'};
 return {kind:'proposal',result,signal,reason:hbWeatherDraftReason(signal,result.stops,classOf,stops),dismissKey,signature:hbTripSignature(s),region,date};
}
function hbPlanWeatherMarkup(view){
 const message=hbPlanWeatherMessage;hbPlanWeatherMessage='';
 const status='<p id="hb-plan-weather-status" role="status" aria-live="polite">'+safe(message)+'</p>';
 const head=title=>'<section class="panel hb-plan-weather" data-hb-plan-weather="'+safe(view.kind)+'" aria-labelledby="hb-plan-weather-title"><h3 id="hb-plan-weather-title">'+title+'</h3>';
 if(view.kind==='applied')return head('날씨를 반영한 일정 초안')+'<p>'+safe(view.draft.message)+'</p>'+(view.draft.source?'<p class="muted">'+safe(view.draft.source)+'</p>':'')+
  '<div class="actions"><button type="button" class="light" id="hb-weather-draft-revert">원래 순서로 되돌리기</button></div>'+status+'</section>';
 if(view.kind==='original')return head('날씨를 반영한 순서 제안')+'<p>원래 고른 순서로 보여 드려요. 날씨를 반영한 순서로 다시 바꿀 수 있어요.</p>'+(view.draft.source?'<p class="muted">'+safe(view.draft.source)+'</p>':'')+
  '<div class="actions"><button type="button" class="light" id="hb-weather-draft-reapply">날씨를 반영한 순서로 바꾸기</button></div>'+status+'</section>';
 if(view.kind==='proposal'){
  const now=Array.isArray(s.stops)?s.stops:[],next=view.result.stops;
  const row=(stop,i,mark)=>'<li>'+safe(stop.plannedArrival||stop.time||'')+' · '+safe(stop.name||'장소')+(mark&&now[i]?.placeId!==stop.placeId?' <strong>(바뀜)</strong>':'')+(hbWeatherStopLocked(stop)?' (보호 일정)':'')+'</li>';
  return head('날씨에 맞춘 대체 일정')+'<p><strong>'+safe(view.signal.label)+'</strong> · '+safe(view.reason.proposal)+' 적용하기 전까지 지금 일정은 그대로예요.</p>'+
   (view.signal.source?'<p class="muted">'+safe(view.signal.source)+'</p>':'')+
   '<div class="hb-replan-compare"><div><h4>지금 일정</h4><ol>'+now.map((x,i)=>row(x,i,false)).join('')+'</ol></div><div><h4>날씨 반영 대체안</h4><ol>'+next.map((x,i)=>row(x,i,true)).join('')+'</ol></div></div>'+
   '<div class="actions"><button type="button" id="hb-weather-alt-apply">대체 일정 적용</button><button type="button" class="light" id="hb-weather-alt-keep">지금 일정 유지</button></div>'+status+'</section>';
 }
 return message?status:'';
}
function hbPlanWeatherBind(view){
 const bind=(id,fn)=>{const node=document.getElementById?.(id);if(node)node.onclick=fn;};
 const finish=(text,focusId)=>{hbPlanWeatherMessage=text;plan();document.getElementById?.(focusId)?.focus?.();};
 const switchTo=(target,text,focusId)=>{
  const current=Array.isArray(s.stops)?s.stops:[];
  // Protected stops (완료·필수·예약) must keep the same place at the same time.
  for(const stop of current.filter(hbWeatherStopLocked)){
   const same=target.find(x=>x.placeId&&x.placeId===stop.placeId);
   if(!same||(same.plannedArrival||same.time)!==(stop.plannedArrival||stop.time)){
    hbPlanWeatherMessage='완료·필수·예약 표시가 있는 일정의 시간이 바뀌어 순서를 바꾸지 않았어요. 지금 일정을 유지해요.';hbPlanWeatherRefresh();return;
   }
  }
  const flags=['done','completed','must','mustVisit','reserved','booked'];
  const next=target.map(x=>{const cur=current.find(c=>c.placeId&&c.placeId===x.placeId),out={...x};if(cur)for(const f of flags){if(f in cur)out[f]=cur[f];else delete out[f];}return out;});
  if(!hbSaveTripStops(next,null)){hbPlanWeatherMessage='저장하지 못했어요. 지금 일정을 유지해요.';hbPlanWeatherRefresh();return;}
  finish(text,focusId);
 };
 if(view.kind==='applied')bind('hb-weather-draft-revert',()=>switchTo(view.draft.originalStops,'원래 고른 순서로 되돌렸어요.','hb-weather-draft-reapply'));
 if(view.kind==='original')bind('hb-weather-draft-reapply',()=>switchTo(view.draft.weatherStops,'날씨를 반영한 순서로 바꿨어요.','hb-weather-draft-revert'));
 if(view.kind==='proposal'){
  bind('hb-weather-alt-apply',()=>{
   if(hbTripSignature(s)!==view.signature||!hbSavedTripMatches(view.signature)){hbPlanWeatherMessage='다른 화면에서 일정이 바뀌었어요. 지금 일정을 유지해요.';hbPlanWeatherRefresh();return;}
   const previous=s;
   s={...s,stops:view.result.stops,hbReplanUndo:null,hbWeatherDraft:{region:view.region,date:view.date,message:view.reason.applied,source:view.signal.source||'',
    originalStops:previous.stops,weatherStops:view.result.stops,createdAt:new Date().toISOString()}};
   try{save()}catch{s=previous;hbPlanWeatherMessage='저장하지 못했어요. 지금 일정을 유지해요.';hbPlanWeatherRefresh();return;}
   finish('대체 일정을 적용했어요. 원래 순서로 되돌릴 수 있어요.','hb-weather-draft-revert');
  });
  bind('hb-weather-alt-keep',()=>{
   const previous=s.hbWeatherDismissed;s.hbWeatherDismissed=view.dismissKey;
   try{save()}catch{s.hbWeatherDismissed=previous;}
   hbPlanWeatherMessage='지금 일정을 그대로 유지해요.';hbPlanWeatherRefresh();
  });
 }
}
function hbPlanWeatherRefresh(){
 const slot=document.querySelector?.('[data-hb-plan-weather-slot]');
 if(!slot)return;
 const view=hbPlanWeatherView();
 slot.innerHTML=hbPlanWeatherMarkup(view);
 hbPlanWeatherBind(view);
}
// END HB_WEATHER_DRAFT
function hbApplyScheduleFromSelection(){
 const beforeRefresh=s;
 s=hbRefreshAutomaticDate(s);
 if(s!==beforeRefresh){s.hbStep=1;go('/new');return false;}
 const dateError=hbTravelDateError(s.date);
 if(dateError){alert(dateError);s.hbStep=1;go('/new');return false;}
 const timeIssues=[...hbTimeInputErrors(s.hbPlanStart??'',s.hbPlanEnd??''),...hbHomeTimeErrors(s.hbDepartTime??'',s.hbReturnTime??'',s.hbReturnDay??0,s.hbDuration||'day')];
 if(timeIssues.length){alert(timeIssues.join(' '));return false;}
 const homeInput={planStart:s.hbPlanStart,planEnd:s.hbPlanEnd,depart:s.hbDepartTime,returnTime:s.hbReturnTime,returnDay:Number(s.hbReturnDay)||0,originSet:!!hbTripEndpointState().origin};
 const firstHome=hbHomeWindow(homeInput);
 if(firstHome.errors.length){alert(firstHome.errors.join(' '));return false;}
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
 // Same home-leg rule as the step-1 preview: a saved NAVER leg for the resulting first/last visit wins, else 25분 예상.
 const built=hbScheduleWithHomeLegs(homeInput,hbTripEndpointState(),range=>hbCreateSchedule(selected,places,{start:range.start,end:range.end,tripType:s.hbDuration||'day',restIntervalMinutes:s.hbRestIntervalMinutes,slopePreference:s.hbSlopePreference,indoorPreference:s.hbIndoorPreference}));
 const home=built.home,plan=built.plan;
 if(!plan){alert(home.errors.join(' '));return false;}
 if(plan.errors.length){alert(plan.errors.join('\n'));return false;}
 plan.warnings.unshift(...home.warnings);
 // A first-visit start derived from the home departure is not a user window.
 if(home.homeDeparture)plan.summary.windowStart=null;
 // Weather-ordered default draft (HB_WEATHER_DRAFT); the original order stays available for 되돌리기.
 const weatherDraft=hbWeatherDraftForNewPlan(plan.stops,s);
 if(weatherDraft)plan.stops=weatherDraft.weatherStops;
 if(typeof hbWeatherRecommendation==='function'&&typeof forecast!=='undefined'){
  const weatherChoice=hbWeatherRecommendation(forecast,JSON.stringify([s.region,s.date]));
  if(['caution','adverse'].includes(weatherChoice.kind))plan.warnings.unshift(weatherChoice.message);
 }
 if(Array.isArray(s.stops)&&s.stops.some(x=>x.done||x.must||x.reserved||x.booked)){alert('이미 완료·필수·예약 표시가 있는 일정이 있어 자동 재생성할 수 없어요. 기존 일정을 보호하려면 직접 확인하고 수정해 주세요.');return false;}
 if(Array.isArray(s.stops)&&s.stops.length&&!confirm('현재 일정 초안을 새로 구성할까요? 기존 시간표는 변경됩니다.'))return false;
 const previous=s;
 s={...s,stops:plan.stops,hbPlanWarnings:plan.warnings,hbPlanInfo:{...plan.summary,region:s.region,date:s.date,transport:s.hbTransport,homeDeparture:home.homeDeparture,homeReturn:home.homeReturn,weekday:typeof hbTravelWeekday==='function'?hbTravelWeekday(s.date)?.short||null:null,createdAt:new Date().toISOString()},hbReplanUndo:null,hbWeatherDraft:weatherDraft,hbWeatherDismissed:null};
 try{save()}catch{ s=previous;alert('초안 저장에 실패했어요. 기존 일정을 유지해요.');return false;}
 go('/plan');return true;
}
// §5 origin / return UI. Device-local only; not part of the share DTO.
// 2026-11-26 사용자 결정: 1단계 출발지는 "현재 위치를 출발지로" 버튼 하나만 둔다
// (목록에서 고르기·주소/이름만 적기 입력 삭제). An origin is only an actual device
// position after a button press. The home map's default centre or any other map state
// is never reused as an origin.
// Legacy saved values: a point with coordinates (e.g. an old list-picked 'place') is used
// as is; a text-only 'label_only' value is read as "no origin" but stays in storage.
function hbTripEndpointState(){
 const stored=hbTripEndpointStoredState();
 const usable=point=>hbTripPointRoutable(point)?point:null;
 return {...stored,origin:usable(stored.origin),returnTo:usable(stored.returnTo)};
}
function hbTripEndpointStoredState(){
 const raw=s.hbTripEndpoints&&typeof s.hbTripEndpoints==='object'?s.hbTripEndpoints:{};
 const clean=point=>point&&typeof point==='object'?hbTripPoint(point,point.source,point.label):null;
 return {origin:clean(raw.origin),returnTo:clean(raw.returnTo),
  returnMode:['same','other','none'].includes(raw.returnMode)?raw.returnMode:'same',
  result:raw.result&&typeof raw.result==='object'?raw.result:null};
}
function hbSaveTripEndpointState(patch){
 const previous=s.hbTripEndpoints;
 // Built from the stored (not the effective) state so a legacy text-only value is not erased by an unrelated save.
 s.hbTripEndpoints={...hbTripEndpointStoredState(),...patch};
 try{save();return true}catch{s.hbTripEndpoints=previous;return false}
}
function hbLocateTripPoint(done,geo=typeof navigator!=='undefined'?navigator.geolocation:null){
 if(!geo){done(null,'이 기기에서는 현재 위치를 사용할 수 없어요. 출발지는 설정되지 않았어요.');return}
 try{
  geo.getCurrentPosition(position=>{
   const point=hbTripPoint({lat:position?.coords?.latitude,lng:position?.coords?.longitude},'current_location','현재 위치');
   done(point,point?'':'현재 위치가 국내 좌표가 아니어서 사용하지 않았어요. 출발지는 설정되지 않았어요.');
  },error=>done(null,({1:'위치 권한이 꺼져 있어 현재 위치를 사용하지 않았어요.',3:'위치 확인이 오래 걸려 현재 위치를 사용하지 않았어요.'}[error?.code]||'현재 위치를 확인하지 못했어요.')+' 출발지는 설정되지 않았어요.'),
  {enableHighAccuracy:false,timeout:9000,maximumAge:180000});
 }catch{done(null,'현재 위치를 확인하지 못했어요. 출발지는 설정되지 않았어요.')}
}
function hbTripPointPlaces(){
 if(typeof places==='undefined'||!Array.isArray(places)||typeof hbPlacesLoadedRegion==='undefined'||hbPlacesLoadedRegion!==s.region)return [];
 return places.filter(place=>place&&typeof place.id==='string'&&hbTripPoint(hbMapCoordinates(place),'place',place.name));
}
function hbTripPointDescribe(point,empty){
 if(!point)return '<span class="hb-trip-point-missing">'+empty+'</span>';
 const note={current_location:'현재 위치 · 약 100m 단위',place:'목록에서 고른 장소 · 약 100m 단위'}[point.source];
 return safe(point.label)+(note?' <small>('+note+')</small>':'');
}
// Step 1 shows only the current-location button. The plan-page panel (hidden by
// HB_PLAN_PANEL_ENDPOINTS=false) may still offer the loaded-place list via withPlaces.
function hbTripPointControls(prefix,label,withPlaces=false){
 const gps='<div class="actions hb-trip-point-actions"><button type="button" class="light" data-hb-trip-gps="'+prefix+'">현재 위치를 '+label+'로</button></div>';
 if(!withPlaces)return gps;
 const list=hbTripPointPlaces();
 return gps+(list.length?'<div class="field hb-trip-point-field"><label for="hb-trip-'+prefix+'-place">불러온 장소 목록에서 '+label+' 고르기</label><select id="hb-trip-'+prefix+'-place"><option value="">장소 선택</option>'+
   list.map(place=>'<option value="'+safe(place.id)+'">'+safe(place.name)+'</option>').join('')+'</select> <button type="button" class="light" data-hb-trip-place="'+prefix+'">선택한 장소를 '+label+'로</button></div>':'');
}
function hbBindTripPointControls(root,status,rerender){
 const field=prefix=>prefix==='return'?'returnTo':'origin';
 const store=(prefix,point,message)=>{
  if(!point){status.textContent=message||'위치를 저장하지 않았어요.';return}
  if(!hbSaveTripEndpointState({[field(prefix)]:point})){status.textContent='위치를 저장하지 못했어요. 저장 공간을 확인해 주세요.';return}
  rerender();
  const next=document.getElementById(status.id);
  if(next)next.textContent=(prefix==='return'?'귀가 위치':'출발지')+'를 이 기기에 저장했어요.';
 };
 root.querySelectorAll('[data-hb-trip-gps]').forEach(button=>button.onclick=()=>{
  status.textContent='현재 위치를 확인하는 중이에요.';
  hbLocateTripPoint((point,message)=>{if(root.isConnected)store(button.dataset.hbTripGps,point,message)});
 });
 root.querySelectorAll('[data-hb-trip-place]').forEach(button=>button.onclick=()=>{
  const prefix=button.dataset.hbTripPlace,select=document.getElementById('hb-trip-'+prefix+'-place');
  const place=hbTripPointPlaces().find(item=>item.id===select?.value);
  store(prefix,place?hbTripPoint(hbMapCoordinates(place),'place',place.name):null,'목록에서 장소를 먼저 골라 주세요.');
 });
}
// Step 1 (여행 정보): origin only; the return point defaults to the origin.
function hbTripOriginStepMarkup(){
 const state=hbTripEndpointState();
 return '<section class="hb-trip-origin-step" aria-labelledby="hb-trip-origin-title"><h3 id="hb-trip-origin-title">출발지 (선택)</h3>'+
  '<p>출발지: '+hbTripPointDescribe(state.origin,'출발지를 입력하면 이동시간을 계산해요')+'</p>'+hbTripPointControls('origin','출발지')+
  (state.origin?'<div class="actions"><button type="button" class="light" id="hb-trip-origin-clear">출발지 지우기</button></div>':'')+
  '<p id="hb-trip-endpoint-status" role="status" aria-live="polite"></p></section>';
}
function hbBindTripOriginStep(rerender){
 const section=document.querySelector('.hb-trip-origin-step');
 if(!section)return;
 const status=section.querySelector('#hb-trip-endpoint-status');
 hbBindTripPointControls(section,status,rerender);
 const clear=section.querySelector('#hb-trip-origin-clear');
 if(clear)clear.onclick=()=>{
  if(!hbSaveTripEndpointState({origin:null,result:null})){status.textContent='지우지 못했어요.';return}
  rerender();
 };
}
function hbRenderTripEndpoints(generator,now){
 const state=hbTripEndpointState(),times=hbTripEndpointTimes(now,state);
 const returnPoint=state.returnMode==='other'?state.returnTo:state.returnMode==='none'?null:state.origin;
 const desired=hbDesiredDepartureCheck(now,state,s.hbPlanInfo?.homeDeparture);
 const html='<section class="hb-plan-endpoints" aria-labelledby="hb-trip-endpoints-title"><h3 id="hb-trip-endpoints-title">출발지·귀가 위치와 예상 시간</h3>'+
  '<p>출발지: '+hbTripPointDescribe(state.origin,'출발지를 입력하면 이동시간을 계산해요')+'</p>'+hbTripPointControls('origin','출발지',true)+
  '<div class="field"><label for="hb-trip-return-mode">귀가 위치</label><select id="hb-trip-return-mode">'+
  [['same','출발지로 돌아가기'],['other','다른 곳으로 귀가'],['none','귀가 시간 계산 안 함']].map(([v,l])=>'<option value="'+v+'"'+(state.returnMode===v?' selected':'')+'>'+l+'</option>').join('')+'</select></div>'+
  (state.returnMode==='other'?'<p>귀가 위치: '+hbTripPointDescribe(state.returnTo,'귀가 위치를 입력하면 귀가 시간을 계산해요')+'</p>'+hbTripPointControls('return','귀가 위치',true):'')+
  '<ul class="hb-trip-endpoint-times"><li data-hb-endpoint="departure" data-hb-endpoint-status="'+safe(times.departure.status)+'">'+safe(hbTripEndpointLine('departure',times.departure,times.anchors))+'</li>'+
  '<li data-hb-endpoint="return" data-hb-endpoint-status="'+safe(times.return.status)+'">'+safe(hbTripEndpointLine('return',times.return,times.anchors))+'</li></ul>'+
  (desired?'<p class="hb-trip-desired" data-hb-desired="'+safe(desired.status)+'">'+safe(desired.message)+'</p>'+(desired.canApply?'<button type="button" class="light" id="hb-trip-desired-apply">일정 시각을 희망 출발에 맞추기</button>':''):'')+
  '<p class="muted">첫 방문지 시각과 집 출발 시각은 달라요. 집 출발·귀가 시각은 네이버 자동차 경로로 계산하고, 주차·하차·보행 시간과 교통 상황에 따라 달라질 수 있어요.</p>'+
  '<p class="muted">출발지·귀가 위치는 이 기기에만 저장되고 가족 공유 링크에 포함되지 않아요. 경로를 확인할 때만 약 100m 단위로 줄인 좌표를 서버에 보내요.</p>'+
  '<div class="actions">'+(hbRouteProviderState!=='unavailable'&&(hbTripPointRoutable(state.origin)||hbTripPointRoutable(returnPoint))?'<button type="button" class="light" id="hb-trip-endpoint-check">집 출발·귀가 시간 확인</button>':'')+
  ((state.origin||state.returnTo)?'<button type="button" class="light" id="hb-trip-endpoint-clear">출발지·귀가 위치 지우기</button>':'')+'</div>'+
  '<p id="hb-trip-endpoint-status" role="status" aria-live="polite"></p></section>';
 generator.insertAdjacentHTML('beforeend',html);
 const section=generator.querySelector('.hb-plan-endpoints'),status=section.querySelector('#hb-trip-endpoint-status');
 hbBindTripPointControls(section,status,()=>plan());
 section.querySelector('#hb-trip-return-mode').onchange=e=>{
  if(!hbSaveTripEndpointState({returnMode:e.target.value})){status.textContent='귀가 설정을 저장하지 못했어요.';return}
  plan();document.getElementById('hb-trip-return-mode')?.focus();
 };
 const clear=section.querySelector('#hb-trip-endpoint-clear');
 if(clear)clear.onclick=()=>{
  const previous=s.hbTripEndpoints;delete s.hbTripEndpoints;
  try{save()}catch{s.hbTripEndpoints=previous;status.textContent='지우지 못했어요.';return}
  plan();
 };
 const desiredApply=section.querySelector('#hb-trip-desired-apply');
 if(desiredApply)desiredApply.onclick=()=>{
  const signature=hbTripSignature(s);
  const shifted=hbShiftDraft(s.stops,desired.delta,s.hbPlanInfo||{});
  if(!shifted.ok){status.textContent=shifted.error;return}
  if(hbTripSignature(s)!==signature||!hbSaveTripStops(shifted.stops,null)){status.textContent='저장하지 못했어요. 기존 일정을 유지해요.';return}
  plan();
  const next=document.getElementById('hb-trip-endpoint-status');
  if(next)next.textContent='희망 출발 시각과 확인된 이동시간에 맞춰 일정 시각을 옮겼어요.';
 };
 const check=section.querySelector('#hb-trip-endpoint-check');
 if(check)check.onclick=async()=>{
  const signature=hbTripSignature(s),before=JSON.stringify(s.hbTripEndpoints||null);
  const transport=s.hbPlanInfo?.transport||s.hbTransport||'car';
  const context={region:s.hbPlanInfo?.region||s.region,transport:transport==='transit'?'public_transit':transport};
  check.disabled=true;status.textContent='집 출발·귀가 자동차 이동시간을 확인하는 중이에요.';
  try{
   const result=await hbFetchTripEndpoints(s.stops,context,hbTripEndpointState());
   if(!section.isConnected||hbTripSignature(s)!==signature||JSON.stringify(s.hbTripEndpoints||null)!==before)return;
   if(!result.key){status.textContent='집 출발·귀가 시간을 계산하지 못했어요 (사유: '+(hbTravelIssueReason(result.diagnostic,result.reason,result.status)||'경로 서비스 오류')+'). 잠시 후 다시 시도해 주세요.';return}
   if(!hbSaveTripEndpointState({result:{key:result.key,legs:result.legs,status:result.status}})){status.textContent='결과를 저장하지 못했어요.';return}
   plan();
   const next=document.getElementById('hb-trip-endpoint-status');
   if(next)next.textContent=result.status==='estimated'?'확인된 자동차 경로로 집 출발·귀가 예상 시간을 계산했어요.':'일부 구간만 계산했어요. 계산한 구간만 표시해요.';
  }catch{status.textContent='경로를 계산하지 못했어요. 잠시 후 다시 시도해 주세요.'}
  finally{if(check.isConnected)check.disabled=false}
 };
}
const HB_PLAN_GENERATOR_FORM=false;
// Owner request 2026-11-26: the #/plan top panel (.hb-plan-tools) renders only the three view buttons
// (일정 편집 · 부모님 큰 글씨로 보기 · 일정표 인쇄). Code is kept; these flags only stop rendering.
// 출발지는 1단계(여행 정보)에서 입력하고, 저장된 출발지·귀가 계산 결과(s.hbTripEndpoints)는 그대로 유지된다.
const HB_PLAN_PANEL_LOCAL_NOTICE='edit'; // 'always' | 'edit'(일정 편집 모드에서만) | 'never'
const HB_PLAN_PANEL_TRAVEL_BASIS=false;  // '이동시간 · 네이버 자동차 경로 n구간 …' 요약 줄
const HB_PLAN_PANEL_ENDPOINTS=false;     // '출발지·귀가 위치와 예상 시간' 섹션
let hbPlanEditMode=false,hbPlanChecksOpen=false;
// HB_AI_SUMMARY_START — 가족 공유용 일정 설명(선택). 일정표에 이미 있는 자료만 서버로 보낸다.
// 서버는 안전 보장 표현·자료에 없는 숫자가 든 문장을 빼고 돌려준다. 실패하면 영역을 숨긴다.
let hbAiSummaryCache=null;
// 2026-11-26 사용자 결정: 설명 끝의 '방문 전에 한 번 더 확인해 주세요' 안내 줄은 붙이지 않는다.
function hbAiItineraryFacts(stops,state,list){
 const items=Array.isArray(stops)?stops:[],st=state||{};
 const byId=new Map((Array.isArray(list)?list:[]).filter(p=>p&&typeof p.id==='string').map(p=>[p.id,p]));
 const out=[];
 items.forEach((stop,i)=>{
  if(!stop||typeof stop.name!=='string'||!stop.name.trim()||out.length>=12)return;
  const basis=hbTravelBasis(items,i);
  const place=stop.placeId?byId.get(stop.placeId):null;
  const facilities=place?hbAccessFacts(place).filter(f=>!['conflicting','stale'].includes(f.status))
   .map(f=>String(f.label||'').trim()).filter(Boolean).slice(0,5):[];
  const time=stop.plannedArrival||stop.time;
  out.push({name:stop.name.trim().slice(0,60),kind:['spot','culture','food','rest'].includes(stop.kind)?stop.kind:'spot',
   time:typeof time==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(time)?time:null,
   stayMinutes:Number.isInteger(Number(stop.stayMinutes))&&Number(stop.stayMinutes)>0?Number(stop.stayMinutes):null,
   travelMinutes:basis.kind==='verified'||basis.kind==='placeholder'?basis.minutes:null,
   travelBasis:basis.kind==='verified'?'naver':basis.kind==='placeholder'?'estimate':null,facilities});
 });
 return {region:st.hbPlanInfo?.region||st.region||null,date:st.hbPlanInfo?.date||st.date||null,stops:out};
}
function hbAiSummaryResultMarkup(text){
 return '<div class="field"><label for="hb-ai-summary-text">설명 글 (복사해서 가족에게 보낼 수 있어요)</label><textarea id="hb-ai-summary-text" rows="7" readonly>'+safe(text)+'</textarea></div>'+
  '<div class="actions"><button type="button" id="hb-ai-summary-copy">설명 복사</button></div><p id="hb-ai-summary-copied" role="status" aria-live="polite"></p>';
}
function hbAiBindSummaryCopy(root){
 const button=root.querySelector('#hb-ai-summary-copy'),area=root.querySelector('#hb-ai-summary-text'),note=root.querySelector('#hb-ai-summary-copied');
 if(!button||!area)return;
 button.onclick=async()=>{
  try{await navigator.clipboard.writeText(area.value);note.textContent='복사했어요.'}
  catch{area.focus();area.select();note.textContent='글을 선택했어요. 길게 누르거나 Ctrl+C로 복사해 주세요.'}
 };
}
function hbAiMountSummary(root,stops){
 if(!root||!Array.isArray(stops)||!stops.length)return Promise.resolve(false);
 return hbAiAvailable().then(ok=>{
  if(!ok||root.isConnected===false||root.querySelector('#hb-ai-summary'))return false;
  const facts=hbAiItineraryFacts(stops,s,places);
  if(!facts.stops.length)return false;
  const key=JSON.stringify(facts);
  const box=document.createElement('section');
  box.id='hb-ai-summary';box.className='panel hb-ai-box hb-ai-summary';box.setAttribute('data-hb-ai','');box.setAttribute('aria-labelledby','hb-ai-summary-title');
  box.innerHTML='<h2 id="hb-ai-summary-title">가족에게 보낼 일정 설명 (선택)</h2><p class="muted">일정표의 장소·도착 시각·머무는 시간·이동시간과 자료에 있는 편의시설 이름만으로 짧은 설명을 만들어요. 일정 자료는 설명을 만드는 데에만 AI(Anthropic Claude)로 보내고 저장하지 않아요.</p>'+
   '<div class="actions"><button type="button" class="light" id="hb-ai-summary-make">설명 만들기</button></div><div id="hb-ai-summary-out" aria-live="polite"></div>';
  root.append(box);
  const out=box.querySelector('#hb-ai-summary-out'),make=box.querySelector('#hb-ai-summary-make');
  if(hbAiSummaryCache&&hbAiSummaryCache.key===key){out.innerHTML=hbAiSummaryResultMarkup(hbAiSummaryCache.text);hbAiBindSummaryCopy(box);}
  make.onclick=async()=>{
   make.disabled=true;make.setAttribute('aria-busy','true');out.textContent='설명을 만드는 중이에요.';
   let data=null;
   try{data=await hbAiPost({action:'summary',itinerary:facts})}catch{data=null}
   if(!box.isConnected)return;
   make.disabled=false;make.removeAttribute('aria-busy');
   if(!data||data.status!=='ok'||!Array.isArray(data.lines)||!data.lines.length){hbAiDisable();return}
   const text=data.lines.filter(x=>typeof x==='string').join('\n');
   hbAiSummaryCache={key,text};
   out.innerHTML=hbAiSummaryResultMarkup(text);hbAiBindSummaryCopy(box);
   box.querySelector('#hb-ai-summary-text')?.focus();
  };
  return true;
 });
}
// HB_AI_SUMMARY_END
function hbPlanViewEnhance(){
 const oldView=plan;
 plan=function(){
  oldView();
  const now=Array.isArray(s.stops)?s.stops:[];
  const selection=s.hbPlanStart??'',endSelection=s.hbPlanEnd??'';
  const edges=hbPlanTravelEdges(now);
  const someConfirmed=now.some((stop,i)=>stop.travelTimeStatus==='estimated'&&
   edges.some(edge=>edge.toIndex===i&&edge.from===stop.travelFromId&&edge.to===stop.travelToId));
  const displayWarnings=hbVisiblePlanWarnings(s.hbPlanWarnings,someConfirmed);
  if(someConfirmed){
   const oldCaution=Array.from(el.querySelectorAll('p.warn')).find(node=>node.textContent.includes('방문 시간은 예상 계획이에요'));
   if(oldCaution)oldCaution.textContent='일부 자동차 이동시간을 네이버 경로로 반영했어요. 나머지 이동시간은 예상이에요.';
  }
  const checksHtml=displayWarnings.length?'<details class="hb-plan-warnings"'+(hbPlanChecksOpen?' open':'')+'><summary>방문 전 확인할 점 <span class="hb-plan-check-count">'+displayWarnings.length+'개</span></summary><ul>'+displayWarnings.map(w=>'<li>'+safe(w)+'</li>').join('')+'</ul></details>':'';
  // Owner request 2026-11-26: the "하루 여행 일정 자동 구성" form is not rendered on the plan
  // page. The code is kept behind HB_PLAN_GENERATOR_FORM; the view controls stay.
  const html=!HB_PLAN_GENERATOR_FORM?'<section class="panel hb-plan-generator hb-plan-tools" aria-label="일정표 도구">'+checksHtml+'</section>':'<section class="panel hb-plan-generator"><h2>하루 여행 일정 자동 구성</h2><p>고른 장소를 개수 제한 없이 시간대에 맞는 식사·휴식 시간과 함께 배치하고, 정한 시간 안에 들어가지 않으면 예상 초과 시간을 알려 드려요.</p><label for="hb-plan-start">첫 방문지 시작 희망 시간 (선택)</label> <input type="time" id="hb-plan-start" value="'+safe(selection)+'"> <label for="hb-plan-end">종료 희망 시간 (선택)</label> <input type="time" id="hb-plan-end" value="'+safe(endSelection)+'"> <button type="button" id="hb-plan-regenerate">선택한 장소로 일정 재구성</button>'+(s.hbDuration==='overnight'?'<p class="warn">숙박 여행을 선택했지만 현재는 첫날 하루 일정만 구성돼요.</p>':'')+checksHtml+'</section>';
  el.insertAdjacentHTML(now.length?'beforeend':'afterbegin',html);
  const generator=el.querySelector('.hb-plan-generator');
  generator.insertAdjacentHTML('afterbegin','<div class="hb-plan-view-controls" aria-label="일정표 표시 방식">'+(now.length?'<button type="button" id="hb-edit-toggle" class="light" aria-pressed="'+String(hbPlanEditMode)+'">'+(hbPlanEditMode?'편집 끝내기':'일정 편집')+'</button>':'')+'<button type="button" id="hb-large-toggle" class="light" aria-pressed="'+String(!!s.hbLargePlanMode)+'">'+(s.hbLargePlanMode?'일반 글씨로 보기':'부모님 큰 글씨로 보기')+'</button><button type="button" id="hb-print-itinerary" class="light">일정표 인쇄</button></div>');
  const checkNode=generator.querySelector('.hb-plan-warnings');
  if(checkNode)checkNode.ontoggle=()=>{hbPlanChecksOpen=checkNode.open};
  const editToggle=document.getElementById('hb-edit-toggle');
  if(editToggle)editToggle.onclick=()=>{hbPlanEditMode=!hbPlanEditMode;plan();document.getElementById('hb-edit-toggle')?.focus()};
  document.getElementById('hb-large-toggle').onclick=()=>{s.hbLargePlanMode=!s.hbLargePlanMode;try{save()}catch{alert('글씨 크기 설정을 저장하지 못했어요.');}plan()};
  document.getElementById('hb-print-itinerary').onclick=()=>{if(checkNode)checkNode.open=true;window.print()};
  if(HB_PLAN_GENERATOR_FORM){
   document.getElementById('hb-plan-start').onchange=e=>{s.hbPlanStart=e.target.value;save()};
   document.getElementById('hb-plan-end').onchange=e=>{s.hbPlanEnd=e.target.value;save()};
   document.getElementById('hb-plan-regenerate').onclick=hbApplyScheduleFromSelection;
  }
  const liveNote=document.createElement('p');
  liveNote.id='hb-plan-edit-feedback';liveNote.className='hb-plan-edit-feedback';
  liveNote.setAttribute('role','status');liveNote.setAttribute('aria-live','polite');
  el.querySelector('.hb-plan-generator').append(liveNote);
  if(HB_PLAN_PANEL_LOCAL_NOTICE==='always'||HB_PLAN_PANEL_LOCAL_NOTICE==='edit'&&hbPlanEditMode)
   el.querySelector('.hb-plan-generator').insertAdjacentHTML('beforeend','<p class="hb-plan-local-notice">시간과 방문 순서를 직접 수정할 수 있어요. 수정 내용은 <strong>이 기기에만 저장</strong>되며 가족과 자동 동기화되지 않아요. 이동시간은 예상값일 수 있어요.</p>');
  if(now.length){
   const basis=hbTravelBasisSummary(now);
   if(HB_PLAN_PANEL_TRAVEL_BASIS)generator.insertAdjacentHTML('beforeend','<p class="hb-plan-travel-basis" role="note"><strong>이동시간</strong> · 네이버 자동차 경로 '+basis.verified+'구간 · 예상 이동 '+basis.placeholder+'곳'+(basis.placeholder?' (합계 약 '+basis.placeholderMinutes+'분, 예상)':'')+(basis.stale?' · 다시 계산할 구간 '+basis.stale+'개':'')+'</p>');
   if(HB_PLAN_PANEL_ENDPOINTS)hbRenderTripEndpoints(generator,now);
  }
  const routeStops=now.filter(stop=>stop.placeId&&!stop.isPlaceholder);
  const routeMode=hbRouteMode(s);
  // F05-02: car ETAs are not applied to public transit / undecided modes. Instead of a
  // dead button, explain and offer an explicit switch to car.
  if(routeStops.length>=2&&routeMode.kind==='guide'){
   generator.insertAdjacentHTML('beforeend','<section class="hb-plan-travel" data-hb-route-mode="guide"><h3>자동차 이동시간 반영</h3><p>주요 이동 수단이 <strong>'+safe(routeMode.label)+'</strong>이라 일정의 이동시간은 예상값으로 보여 드려요. 자동차로 이동하시면 네이버 자동차 경로로 이동시간을 계산해 일정에 반영할 수 있어요.</p><button type="button" class="light" id="hb-route-use-car">자동차로 이동해요</button><div id="hb-route-result" role="status" aria-live="polite"></div></section>');
   document.getElementById('hb-route-use-car').onclick=()=>{
    const previous=s;
    s={...s,hbTransport:'car',hbPlanInfo:s.hbPlanInfo?{...s.hbPlanInfo,transport:'car'}:s.hbPlanInfo};
    try{save()}catch{s=previous;document.getElementById('hb-route-result').textContent='이동 수단을 저장하지 못했어요.';return}
    plan();
    document.getElementById('hb-route-estimate')?.focus();
   };
  }
  // P1-10 (2026-11-26): when the deployment has no NAVER Directions setup the button can only fail, so it
  // is not shown; each row keeps its "약 N분 (예상)" travel. The state comes from the existing API answer.
  if(routeStops.length>=2&&routeMode.kind==='car'&&hbRouteProviderState!=='unavailable'){
   if(hbRouteProviderState===null){
    hbRouteProviderState='checking';
    hbProbeRouteProvider(now,{region:s.hbPlanInfo?.region||s.region,transport:'car'}).then(state=>{
     hbRouteProviderState=state||'ready';
     const box=document.querySelector('.hb-plan-travel[data-hb-route-mode="car"]');
     if(!box)return;
     if(hbRouteProviderState==='unavailable')box.remove();else box.hidden=false;
    });
   }
   generator.insertAdjacentHTML('beforeend','<section class="hb-plan-travel" data-hb-route-mode="car"'+(hbRouteProviderState==='ready'?'':' hidden')+'><h3>자동차 이동시간 반영 미리보기</h3><p>네이버 자동차 경로로 계산한 구간만 일정에 반영해요.</p><button type="button" class="light" id="hb-route-estimate">자동차 이동시간 확인 및 변경안 보기</button><div id="hb-route-result" role="status" aria-live="polite"></div></section>');
   const routeButton=document.getElementById('hb-route-estimate');
   routeButton.onclick=async()=>{
    const output=document.getElementById('hb-route-result');
    const signature=hbTripSignature(s);
    const context={region:s.hbPlanInfo?.region||s.region,transport:'car'};
    routeButton.disabled=true;
    output.textContent='자동차 이동시간을 계산하는 중이에요.';
    try{
     const travel=await hbFetchPlanTravelTimes(now,context);
     if(hbRouteProviderUnavailable(travel))hbRouteProviderState='unavailable';
     if(document.getElementById('hb-route-result')!==output)return;
     if(hbTripSignature(s)!==signature){output.textContent='계산하는 동안 일정이 바뀌었어요. 다시 눌러 주세요.';return}
     if(!['estimated','incomplete'].includes(travel.status)){
      const view=hbRouteFallbackView(now,travel);
      output.innerHTML='<p class="warn" data-hb-route-fallback="'+safe(travel.status)+'">'+safe(view.notice)+'</p><h4>구간별 이동시간</h4><ul>'+
       view.rows.map(row=>'<li>'+safe(row.from)+' → '+safe(row.to)+': '+safe(row.text)+'</li>').join('')+'</ul><button type="button" class="light" id="hb-route-cancel">닫기</button>';
      output.querySelector('#hb-route-cancel').onclick=()=>{output.textContent='기존 일정은 그대로예요.'};
      return;
     }
     const preview=hbPreviewPlanTravel(now,travel,s.hbPlanInfo||{});
     const segments=travel.segments.map(leg=>{
      const from=now[leg.fromIndex]?.name||leg.from,to=now[leg.toIndex]?.name||leg.to;
      return '<li>'+safe(from)+' → '+safe(to)+': '+(leg.status==='estimated'?
       '네이버 자동차 경로 약 '+safe(leg.minutes)+'분'+(hbPlanDistanceLabel(leg)?' · '+safe(hbPlanDistanceLabel(leg)):''):'예상 이동시간 유지 · '+safe(hbTravelIssueLabel(leg.diagnostic,leg.reason)))+'</li>';
     }).join('');
     const before=now.map(stop=>'<li>'+safe(stop.plannedArrival||stop.time||'시간 선택 전')+
      ' · '+safe(stop.name||'장소')+(stop.done||stop.must||stop.reserved||stop.booked?' (보호 일정)':'')+'</li>').join('');
     const after=preview.stops.map((stop,i)=>'<li>'+safe(stop.plannedArrival||stop.time||'시간 선택 전')+
      ' · '+safe(stop.name||'장소')+
      ((stop.plannedArrival||stop.time)!==(now[i].plannedArrival||now[i].time)?
       ' <strong>(기존 '+safe(now[i].plannedArrival||now[i].time)+'에서 변경)</strong>':'')+'</li>').join('');
     const warnings=preview.warnings.map(w=>'<li>'+safe(w.message)+'</li>').join('');
     output.innerHTML='<h4>구간별 조회 결과</h4><ul>'+segments+'</ul>'+
      (travel.limited?'<p class="warn">일부 구간은 조회 횟수 제한으로 예상 이동시간을 유지했어요.</p>':'')+
      '<div class="hb-replan-compare"><div><h4>변경 전 일정</h4><ol>'+before+'</ol></div>'+
      '<div><h4>반영 후 예상 일정</h4><ol>'+after+'</ol></div></div>'+
      (warnings?'<h4>시간 충돌 안내</h4><ul>'+warnings+'</ul>':'<p>확인된 구간에 따른 시간 충돌은 발견하지 못했어요.</p>')+
      '<p class="muted">교통 상황에 따라 실제 소요시간은 달라질 수 있어요.</p>'+
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
   const basis=hbTravelBasis(now,i);
   node.dataset.hbTravelBasis=basis.kind;
   if(basis.kind==='placeholder')facts.push('이동 약 '+basis.minutes+'분 (예상)');
   if(basis.kind==='verified')facts.push('이동 약 '+basis.minutes+'분 (네이버 자동차 경로'+(basis.checkedAt?' · 조회 '+basis.checkedAt:'')+')');
   if(basis.kind==='stale')facts.push('방문 순서가 바뀌었어요. 자동차 이동시간을 다시 계산해 주세요.');
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
  // Weather summary line (HB_WEATHER_DRAFT): outside the tools panel, directly above the itinerary rows.
  const firstRow=layout.querySelector?.('.hb-itinerary-row');
  if(now.length&&firstRow?.insertAdjacentHTML){firstRow.insertAdjacentHTML('beforebegin','<div data-hb-plan-weather-slot></div>');hbPlanWeatherRefresh();}
  hbRenderPlanMap();
  if(now.length)hbAiMountSummary(layout,now);
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
      : '')
    + (stop.notice ? '<p>공유된 현장 주의사항: ' + safe(stop.notice) + '</p>' : '')
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


// BEGIN HB_DISCOVERY_EDITORIAL
const hbDiscoveryState={age:'all',sex:'all',region:'all',theme:'all',season:'all',records:[],status:'idle',partial:false,sequence:0,audience:[],audienceRequested:false};
// 사용자 결정 2026-11-26: 연령·성별·지역·테마 필터 화면 숨김(코드·데이터 보존). true로 되돌리면 다시 표시.
const hbDiscoveryFiltersVisible=false;
let hbDiscoveryPending=null,hbDiscoveryDetailId=null,hbDiscoveryMapDispose=null;
const hbDiscoveryRegions=[['all','전체 지역'],['1','서울'],['31','경기'],['32','강원'],['33','충북'],['34','충남'],['35','경북'],['36','경남'],['37','전북'],['38','전남'],['39','제주'],['2','인천'],['3','대전'],['4','대구'],['5','광주'],['6','부산'],['7','울산'],['8','세종']];
const hbDiscoveryThemes=[['all','전체'],['nature','자연·정원'],['culture','역사·문화'],['food','미식'],['coast','바다·드라이브']];
const hbDiscoverySeasons=[['all','모든 계절'],['spring','봄'],['summer','여름'],['autumn','가을'],['winter','겨울']];
const hbDiscoveryCourses=[
 {id:'palace',title:'서울 궁궐과 한옥 골목 나들이',region:'서울',areaCode:'1',theme:'culture',seasons:['spring','autumn'],description:'궁궐과 한옥 건축을 만나는 역사 여행',ids:['tour-126508','tour-126537']},
 {id:'art',title:'서울 문화와 디자인 나들이',region:'서울',areaCode:'1',theme:'culture',seasons:['summer','winter'],description:'박물관과 디자인 공간을 둘러보는 문화 여행',ids:['tour-129703','tour-2470006']},
 {id:'parks',title:'서울의 푸른 공원 두 곳',region:'서울',areaCode:'1',theme:'nature',seasons:['spring','autumn'],description:'서울숲과 올림픽공원을 둘러보는 자연 여행',ids:['tour-128611','tour-126532']},
 {id:'fortress',title:'경기 성곽 역사 여행',region:'경기',areaCode:'31',theme:'culture',seasons:['spring','autumn'],description:'수원 화성과 남한산성의 역사 탐방. 서로 다른 지역을 잇는 자동차 여행 후보',ids:['tour-125555','tour-125449']}
];
const hbDiscoveryCourse=hbDiscoveryCourses[0];
const hbDiscoveryCache=new Map();
function hbDiscoveryCurrentSeason(month){return month>=3&&month<=5?'spring':month>=6&&month<=8?'summer':month>=9&&month<=11?'autumn':'winter';}
function hbDiscoverySeasonLabel(season){return hbDiscoverySeasons.find(([id])=>id===season)?.[1]||'';}
function hbDiscoveryThemeMatch(p,theme){
 if(theme==='all')return true;
 if(theme==='food')return p.kind==='food';
 const name=String(p.name||'');
 if(theme==='culture')return p.kind==='culture'||/궁|한옥|박물관|미술관|기념관|유적|성곽|사찰|문화/.test(name);
 if(theme==='nature')return p.kind!=='food'&&/정원|수목원|공원|숲|호수|습지|휴양림|산책/.test(name);
 if(theme==='coast')return p.kind!=='food'&&/해변|해수욕장|바다|해안|항구|전망대|등대/.test(name);
 return false;
}
function hbDiscoveryRecords(items){
 const records=new Map();
 for(const p of items){if(!hbRichIdentity(p)||typeof p.name!=='string'||!p.name.trim())continue;
  if(!records.has(p.id)||(!records.get(p.id).areaCode&&p.areaCode))records.set(p.id,p);
 }
 return [...records.values()];
}
function hbDiscoveryCourseStops(records,region,theme,course=hbDiscoveryCourse){
 if(!['all',course.areaCode].includes(region)||!['all',course.theme].includes(theme))return [];
 const stops=course.ids.map(id=>records.find(p=>p.id===id&&String(p.areaCode)===course.areaCode));
 return stops.every(Boolean)?stops:[];
}
function hbDiscoveryVisibleCourses(records,region,theme,season){
 return hbDiscoveryCourses.filter(c=>season==='all'||c.seasons.includes(season)).map(c=>({course:c,stops:hbDiscoveryCourseStops(records,region,theme,c)})).filter(x=>x.stops.length);
}
function hbDiscoveryFeaturedRows(data){
 if(!Array.isArray(data?.places))throw Error('invalid featured response');
 const prefixes={서울:/^서울(?:특별시|\s)/,경기:/^경기(?:도|\s)/};
 return data.places.filter(p=>p&&Object.hasOwn(prefixes,p.region)&&typeof p.address==='string'&&prefixes[p.region].test(p.address)).map(p=>({...p,areaCode:p.region==='서울'?'1':'31',kind:p.kind||'spot'}));
}
function hbDiscoveryApprovedCohorts(data){
 if(data?.schemaVersion!==1||!Array.isArray(data.cohorts))return [];
 const validMonth=m=>typeof m==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(m);
 const approved=data.cohorts.filter(c=>c&&c.rightsStatus==='approved'&&typeof c.rightsEvidence==='string'&&c.rightsEvidence.trim()&&
  c.sourceUrl==='https://datalab.visitkorea.or.kr/datalab/portal/loc/getTourDataFormView2.do'&&
  ['all','40','50','60','70plus'].includes(c.age)&&['all','male','female'].includes(c.sex)&&
  hbDiscoveryRegions.some(([id])=>id===c.region)&&validMonth(c.periodStart)&&validMonth(c.periodEnd)&&c.periodStart<=c.periodEnd&&
  c.metric==='visit_concentration'&&['percent','index'].includes(c.unit)&&typeof c.methodology==='string'&&c.methodology.trim()&&
  Array.isArray(c.rows)&&c.rows.length&&c.rows.every(row=>row&&/^tour-\d{1,12}$/.test(row.id)&&Number.isFinite(row.value)&&row.value>=0&&(c.unit!=='percent'||row.value<=100))&&
  new Set(c.rows.map(row=>row.id)).size===c.rows.length);
 return approved.filter(c=>approved.filter(other=>other.age===c.age&&other.sex===c.sex&&other.region===c.region).length===1);
}
function hbDiscoveryAudienceMatch(cohorts,age,sex,region,records){
 if(age==='all'&&sex==='all')return null;
 const cohort=cohorts.find(c=>c.age===age&&c.sex===sex&&c.region===region);
 if(!cohort)return null;
 const values=new Map(cohort.rows.map(row=>[row.id,row.value]));
 const ranked=records.filter(p=>values.has(p.id)).sort((a,b)=>values.get(b.id)-values.get(a.id)||a.id.localeCompare(b.id));
 return ranked.length?{cohort,values,ranked}:null;
}
function hbDiscoveryAudienceNote(age,sex){
 return age==='all'&&sex==='all'?'함께봄 편집 추천':
 '선택한 연령대·성별의 실제 방문 통계는 아직 연결되지 않았어요. 아래는 연령·성별과 무관한 함께봄 편집 추천이에요.';
}
function hbDiscoveryClearMap(){if(hbDiscoveryMapDispose)hbDiscoveryMapDispose();hbDiscoveryMapDispose=null;}
function hbDiscoveryOpen(id){
 const p=hbDiscoveryState.records.find(item=>item.id===id);
 if(!p)return;
 hbDiscoveryDetailId=id;hbRichSelected=p;go('/place/'+encodeURIComponent(id));
}
function hbDiscoveryStartCourse(course,stops){
 if(!hbDiscoveryCourses.includes(course)||stops.length!==course.ids.length||!stops.every((p,i)=>p.id===course.ids[i]&&String(p.areaCode)===course.areaCode))return;
 hbDiscoveryPending={title:course.title,region:course.region,ids:stops.map(p=>p.id),names:stops.map(p=>p.name)};
 go('/new');
}
function hbDiscoveryPendingMarkup(){
 if(!hbDiscoveryPending)return '';
 const p=hbDiscoveryPending;
 return '<section class="panel hb-discovery-handoff"><h2>추천 코스에서 가져온 방문 후보</h2><p>'+safe(p.title)+' · '+safe(p.names.join(' → '))+'</p><p class="muted">여행 지역을 '+safe(p.region)+'으로 선택하고 이동 조건을 확인해 주세요. 조건 확인 후 장소별로 직접 담을 수 있어요.</p><button type="button" class="light" id="hb-discovery-clear">코스 후보 연결 해제</button></section>';
}
function hbDiscoveryBindPending(redraw){
 const clear=document.getElementById('hb-discovery-clear');
 if(clear)clear.onclick=()=>{hbDiscoveryPending=null;redraw();};
}
function hbDiscoveryPriority(id,region){
 return hbDiscoveryPending?.region===region&&hbDiscoveryPending.ids.includes(id)?1:0;
}
function hbDiscoveryDraw(focus){
 if(path()!=='/discover')return;
 hbDiscoveryClearMap();
 const d=hbDiscoveryState;
 const chips=(key,values)=>'<div class="hb-discovery-chips" role="group" aria-label="'+({age:'연령대',sex:'성별',theme:'여행 테마',season:'계절'}[key])+'">'+values.map(([id,label])=>'<button type="button" class="light" data-discovery-filter="'+key+'" data-discovery-value="'+id+'" aria-pressed="'+(d[key]===id)+'">'+safe(label)+'</button>').join('')+'</div>';
 const available=d.records.filter(p=>(d.region==='all'||String(p.areaCode)===d.region)&&hbDiscoveryThemeMatch(p,d.theme));
 const audience=hbDiscoveryAudienceMatch(d.audience,d.age,d.sex,d.region,available);
 const courseIds=new Set(hbDiscoveryCourses.flatMap(c=>c.ids));
 const ordered=audience?audience.ranked:available.sort((a,b)=>Number(courseIds.has(b.id))-Number(courseIds.has(a.id)));
 const courses=hbDiscoveryVisibleCourses(d.records,d.region,d.theme,d.season);
 const thisSeason=hbDiscoveryCurrentSeason(Number(new Intl.DateTimeFormat('en',{month:'numeric',timeZone:'Asia/Seoul'}).format(new Date())));
 const seasonal=hbDiscoveryVisibleCourses(d.records,d.region,d.theme,thisSeason);
 const cards=ordered.slice(0,24).map(p=>'<article class="card hb-discovery-card"><h3>'+safe(p.name)+'</h3>'+(p.address?'<p class="muted">'+safe(p.address)+'</p>':'')+'<p>'+safe(hbPlaceCategory(p))+' · 방문 전 이동 조건 확인</p>'+(audience?'<p>방문 집중률 '+safe(audience.values.get(p.id))+(audience.cohort.unit==='percent'?'%':' (지수)')+'</p>':'')+'<a data-hb-info="'+safe(p.id)+'" data-discovery-open="'+safe(p.id)+'" href="'+safe(hbPlaceDetailPath(p.id))+'">장소 상세 보기</a></article>').join('');
 const courseCard=({course:c,stops})=>'<article class="panel hb-discovery-course" data-discovery-course="'+c.id+'"><p class="hb-discovery-kicker">'+safe(c.region+' · '+c.seasons.map(hbDiscoverySeasonLabel).join('·'))+' · 편집 제안</p><h3>'+safe(c.title)+'</h3><p>'+safe(c.description)+'</p><ol>'+stops.map(p=>'<li><a data-discovery-open="'+safe(p.id)+'" href="'+safe(hbPlaceDetailPath(p.id))+'">'+safe(p.name)+'</a></li>').join('')+'</ol><p class="muted">방문 순서 아이디어예요.</p><div class="actions"><button class="light" type="button" data-discovery-map="'+c.id+'" aria-expanded="false">코스 지도 보기</button><button type="button" data-discovery-start="'+c.id+'">이 코스로 여행 만들기</button></div><div class="hb-discovery-course-map" data-discovery-map-host="'+c.id+'" hidden></div></article>';
 const seasonalIntro=seasonal.length&&d.season==='all'?'<section class="hb-discovery-seasonal"><h2>이번 계절의 여행 아이디어 · '+safe(hbDiscoverySeasonLabel(thisSeason))+'</h2><p>함께봄 편집 제안이에요.</p><div class="hb-discovery-season-links">'+seasonal.map(({course:c})=>'<a href="#/discover" data-discovery-season-jump="'+c.id+'">'+safe(c.title)+'</a>').join('')+'</div></section>':'';
 const course= d.status==='loading'?'':'<section class="hb-discovery-section"><h2>함께봄이 제안하는 여행 코스</h2>'+chips('season',hbDiscoverySeasons)+'<p class="muted">계절은 편집 테마예요. 현재 확인한 관광 데이터와 일치하는 장소가 모두 있는 코스만 표시해요.</p>'+(courses.length?'<div class="hb-discovery-course-grid">'+courses.map(courseCard).join('')+'</div>':'<p>현재 조회 자료에서 이 지역·테마·계절의 완성된 추천 코스를 찾지 못했어요.</p>')+'</section>';
 const status=d.status==='loading'?'여행지 콘텐츠를 불러오는 중이에요.':d.status==='error'?'여행지 자료를 불러오지 못했어요.':d.partial?'일부 자료만 조회됐어요.':available.length?'현재 조회 자료 '+available.length+'곳 · 일부 편집 후보':'현재 조회 자료에 이 테마의 장소가 없어요.';
 el.innerHTML='<div class="hb-discovery"><section class="hb-discovery-hero"><p class="hb-discovery-kicker">여행 아이디어</p><h1>부모님과 어디로 떠나볼까요?</h1><p>사진과 여행지, 코스를 둘러보고 마음에 드는 곳을 발견해 보세요.</p><a href="#/">지도에서 여행지 탐색</a></section>'+(hbDiscoveryFiltersVisible?'<section class="hb-discovery-filter" aria-label="콘텐츠 필터"><h2>관심 있는 여행을 둘러보세요</h2>'+chips('age',[['all','모든 연령'],['40','40대'],['50','50대'],['60','60대'],['70plus','70대 이상']])+chips('sex',[['all','전체 성별'],['female','어머니'],['male','아버지']])+'<p class="muted" role="status">'+safe(audience?'한국관광 데이터랩 · '+audience.cohort.periodStart+'~'+audience.cohort.periodEnd+' · 현재 조회 장소 중 방문 집중률 기준 (방문자 수·만족도 순위 아님)':hbDiscoveryAudienceNote(d.age,d.sex))+'</p>'+(audience?'<p><a href="https://datalab.visitkorea.or.kr/datalab/portal/loc/getTourDataFormView2.do" target="_blank" rel="noopener noreferrer">통계 출처</a> · '+safe(audience.cohort.methodology)+'</p>':'')+'<label for="hb-discovery-region">여행 지역</label><select id="hb-discovery-region">'+hbDiscoveryRegions.map(([id,label])=>'<option value="'+id+'"'+(d.region===id?' selected':'')+'>'+safe(label)+'</option>').join('')+'</select><h3>취향에 따라 떠나는 여행</h3>'+chips('theme',hbDiscoveryThemes)+'</section>':'')+seasonalIntro+course+'<section class="hb-discovery-section"><h2>'+(audience?'선택 조건의 방문 집중률':'둘러보기 좋은 여행지')+'</h2><p role="'+(d.status==='error'?'alert':'status')+'">'+safe(status)+'</p>'+(d.status==='error'||d.partial?'<button type="button" class="light" id="hb-discovery-retry">다시 불러오기</button>':'')+(cards?'<div class="grid hb-discovery-grid">'+cards+'</div>':'')+'</section><section class="panel"><h2>우리 가족 여행을 계획해 볼까요?</h2><p>여행 날짜와 부모님의 실제 이동 조건을 반영한 일정은 여행 만들기에서 준비할 수 있어요.</p><a href="#/new">여행 만들기</a></section></div>';
 el.querySelectorAll('[data-discovery-filter]').forEach(b=>b.onclick=()=>{const k=b.dataset.discoveryFilter,v=b.dataset.discoveryValue;d[k]=v;if(k==='theme')hbDiscoveryLoad([k,v]);else hbDiscoveryDraw([k,v]);});
 const region=el.querySelector('#hb-discovery-region');if(region)region.onchange=e=>{d.region=e.target.value;hbDiscoveryLoad('region');};
 el.querySelectorAll('[data-discovery-open]').forEach(a=>a.onclick=e=>{e.preventDefault();hbDiscoveryOpen(a.dataset.discoveryOpen);});
 const retry=el.querySelector('#hb-discovery-retry');if(retry)retry.onclick=()=>hbDiscoveryLoad(null,true);
 el.querySelectorAll('[data-discovery-start]').forEach(b=>b.onclick=()=>{const x=courses.find(x=>x.course.id===b.dataset.discoveryStart);if(x)hbDiscoveryStartCourse(x.course,x.stops);});
 el.querySelectorAll('[data-discovery-map]').forEach(toggle=>toggle.onclick=()=>{
  const id=toggle.dataset.discoveryMap,x=courses.find(x=>x.course.id===id),host=el.querySelector('[data-discovery-map-host="'+id+'"]');if(!x||!host)return;
  const open=host.hidden;hbDiscoveryClearMap();el.querySelectorAll('[data-discovery-map-host]').forEach(n=>n.hidden=true);el.querySelectorAll('[data-discovery-map]').forEach(n=>n.setAttribute('aria-expanded','false'));
  if(open){host.hidden=false;toggle.setAttribute('aria-expanded','true');hbDiscoveryMapDispose=hbRichMapAdapter({container:host,points:x.stops,onSelect:hbDiscoveryOpen});}
 });
 el.querySelectorAll('[data-discovery-season-jump]').forEach(a=>a.onclick=e=>{e.preventDefault();const card=el.querySelector('[data-discovery-course="'+a.dataset.discoverySeasonJump+'"]');if(card){card.scrollIntoView({block:'nearest'});card.querySelector('a,button')?.focus();}});
 if(focus==='region')el.querySelector('#hb-discovery-region')?.focus();else if(focus)el.querySelector('[data-discovery-filter="'+focus[0]+'"][data-discovery-value="'+focus[1]+'"]')?.focus();
}
async function hbDiscoveryLoad(focus,force=false){
 const d=hbDiscoveryState,seq=++d.sequence,region=d.region,theme=d.theme,key=region+':'+theme;
 const cached=hbDiscoveryCache.get(key);
 if(!force&&cached&&Date.now()-cached.at<300000){d.records=cached.records;d.status='ready';d.partial=false;hbDiscoveryDraw(focus);return;}
 d.records=[];d.status='loading';d.partial=false;hbDiscoveryDraw(focus);
 const types=theme==='food'?['39']:theme==='culture'?['12','14']:theme==='all'?['12','14','39']:['12'];
 const jobs=types.map(type=>get('/api/rich-tour?'+new URLSearchParams({action:'search',mode:'area',contentTypeId:type,numOfRows:'20',pageNo:'1',...(region==='all'?{}:{areaCode:region})})).then(data=>{if(!Array.isArray(data.places))throw Error('invalid discovery response');return data.places;}));
 if(['all','1','31'].includes(region)&&['all','culture','nature'].includes(theme)){
  if(['all','1'].includes(region))jobs.push(get('/api/featured.js?lat=37.5665&lng=126.9780&region='+encodeURIComponent('서울')).then(hbDiscoveryFeaturedRows));
  if(['all','31'].includes(region))jobs.push(get('/api/featured.js?lat=37.2636&lng=127.0286&region='+encodeURIComponent('경기')).then(hbDiscoveryFeaturedRows));
 }
 const result=await Promise.allSettled(jobs);
 if(seq!==d.sequence)return;
 d.records=hbDiscoveryRecords(result.flatMap(x=>x.status==='fulfilled'?x.value:[]));
 d.partial=result.some(x=>x.status==='rejected');
 d.status=result.every(x=>x.status==='rejected')?'error':'ready';
 if(d.status==='ready'&&!d.partial){if(hbDiscoveryCache.size>=24)hbDiscoveryCache.delete(hbDiscoveryCache.keys().next().value);hbDiscoveryCache.set(key,{at:Date.now(),records:d.records});}
 if(path()==='/discover')hbDiscoveryDraw();
}
function hbDiscoveryRender(){
 if(!hbDiscoveryFiltersVisible){const d=hbDiscoveryState;d.age='all';d.sex='all';if(d.region!=='all'||d.theme!=='all'){d.region='all';d.theme='all';d.status='idle';}}
 if(hbDiscoveryState.status==='idle')hbDiscoveryLoad();else hbDiscoveryDraw();
 if(!hbDiscoveryState.audienceRequested){hbDiscoveryState.audienceRequested=true;get('/discovery-audience.json').then(data=>{hbDiscoveryState.audience=hbDiscoveryApprovedCohorts(data);if(path()==='/discover'&&hbDiscoveryState.audience.length)hbDiscoveryDraw();}).catch(()=>{});}
}
// END HB_DISCOVERY_EDITORIAL

// P1-1 (2026-11-26): a new route opens at the top; a redraw of the same route keeps the reader's position.
let hbLastRenderedRoute=null;
function hbRouteChanged(p){const changed=hbLastRenderedRoute!==null&&hbLastRenderedRoute!==p;hbLastRenderedRoute=p;return changed}
function render(){hbRenderRoute();if(hbRouteChanged(path())&&typeof window!=='undefined'&&typeof window.scrollTo==='function')window.scrollTo(0,0)}
function hbRenderRoute(){if(typeof hbRichCleanup==='function')hbRichCleanup();const p=path();if(p!=='/discover')hbDiscoveryClearMap();if(!p.startsWith('/place/'))hbDiscoveryDetailId=null;const initialize=hbEnsureOwnerState(p);if(initialize)queueMicrotask(()=>{if(!hbIsShareReceiver(path()))load();});if(p!=='/')dropNearbyMap();if(p!=='/plan')hbDropPlanMap();if(p==='/')home();else if(p==='/new')newPlan();else if(p==='/places')browse();else if(p==='/discover')hbDiscoveryRender();else if(p.startsWith('/place/'))detail(hbDecodePlaceId(p.slice(7)));else if(p==='/plan')plan();else if(p==='/travel')travel();else if(p==='/share/create')share();else if(p.startsWith('/share/'))shared(p.slice(7));else home()}
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
   // Keep a known photo flag (hasPhoto true/false) over an unknown one (HB_PHOTO_LIST_GATE).
   if(combined.hasPhoto==null&&place.hasPhoto!=null){
    combined={...combined,hasPhoto:place.hasPhoto,photoSource:place.photoSource??null,officialImage:place.officialImage??null};
   }
   if(!combined.imageUrl&&place.imageUrl){
    combined={...combined,imageUrl:place.imageUrl,imageLicense:place.imageLicense,imageSource:place.imageSource};
   }
   records.set(place.id,combined);
  }
  // P1-11 (2026-11-26): the static /catalog/{seoul,gyeonggi}.json files were never deployed (404 on every
  // load and nothing read the images). Places come from /api/data plus the featured list only.
  const featured=region==='서울'?await get('/api/featured.js?lat=37.5665&lng=126.9780').catch(()=>null):null;
  if(!stillCurrent())return;
  const featuredPlaces=Array.isArray(featured?.places)?featured.places:[];
  for(const place of featuredPlaces){
   if(!place)continue;
   add({...place,kind:place.kind||'spot',accessFacts:[],accessStatus:'unknown',reason:'서울 대표 관광지예요.'});
  }
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
    ? value.slice(0,16).replace('T',' ')+' KST' : '';
}
function weatherText() {
  if (forecast.key !== currentWeatherKey() || forecast.state==='loading') return '여행일 예보를 확인하고 있어요…';
  const f=forecast.data, a=forecast.alerts;
  let text;
  if(forecast.state==='error') text='날씨를 불러오지 못했어요. 출발 전에 다시 확인해 주세요.';
  else if(forecast.state==='stale') text='오래된 예보예요. 최신 정보를 다시 확인해 주세요.';
  else if(forecast.state==='no_forecast') text='선택한 날짜의 예보 제공 범위를 확인해 주세요.';
  else if(forecast.state==='available' && typeof f?.summary==='string' && f.summary.trim()){
    // 2026-11-26 사용자 지시: 안내 문구(대표 예보·지역 기준점·특보 재확인·보장 안 함·미확인 등)는 숨기고
    // 기온·강수확률·날씨 상태와 발표 시각만 남긴다. 발표 시각이 없으면 시각 표기 자체를 생략한다.
    const issued=hbWeatherTime(f.issuedAt);
    text=f.summary+(issued?' (발표 '+issued+')':'');
  }else text='선택한 날짜의 예보를 확인할 수 없어요.';
  // 실제로 발효 중인 특보는 정보이므로 종류·지역·발효 시각을 그대로 보여 준다(재검토·확인 필요 같은 안내만 뺀다).
  if(a?.status==='active' && Array.isArray(a.active) && a.active.length){
    const hazards=a.active.map(x=>String(x.hazard??'')+String(x.severity??'')+(x.areaName?'('+x.areaName+')':'')).join(', ');
    const effective=hbWeatherTime(a.effectiveAt);
    text+=' · 발효 중인 특보: '+hazards+(effective?' / 발효 '+effective:'');
  }
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
    return {kind:'caution',message:'기상특보가 확인됐어요. 날짜 변경이나 이동을 줄인 코스를 먼저 검토해 주세요.'};
  if(snapshot.state!=='available')return {kind:'unknown',message:'확인된 여행일 예보가 없어 날씨 기반 추천을 보류해요. 일반 여행지 탐색은 계속할 수 있어요.'};
  const f=snapshot.data||{};
  const R=HB_WEATHER_SUGGEST_RULE;
  const precipitation=R.wetTypes.includes(f.precipitationType);
  const probability=typeof f.precipitationProbabilityPercent==='number'&&f.precipitationProbabilityPercent>=R.wetProbabilityPercent&&f.precipitationProbabilityPercent<=100;
  const temperature=typeof f.temperatureC==='number'&&Number.isFinite(f.temperatureC)?f.temperatureC:null;
  const hourlyBurden=Array.isArray(f.hourly)&&f.hourly.some(v=>R.wetTypes.includes(v.precipitationType)||
    typeof v.precipitationProbabilityPercent==='number'&&v.precipitationProbabilityPercent>=R.wetProbabilityPercent&&v.precipitationProbabilityPercent<=100||
    typeof v.temperatureC==='number'&&(v.temperatureC>=R.hotTemperatureC||v.temperatureC<=R.coldTemperatureC));
  if(precipitation||probability||temperature!==null&&(temperature>=R.hotTemperatureC||temperature<=R.coldTemperatureC)||hourlyBurden){
    return {kind:'adverse',message:'여행일 예보의 일부 시간대에 강수 또는 기온 부담 신호가 있어요. '+(HB_WEATHER_CATEGORY_COMPARE_ENABLED?'문화시설 후보, 휴식이 포함된 짧은 코스, 날짜 변경을 비교해 보세요.':'휴식이 포함된 짧은 코스나 날짜 변경을 검토해 보세요.')};
  }
  // 2026-11-26 사용자 지시: '대표 예보를 참고했어요 · 보장하지 않아요' 안내는 숨긴다(비교 화면을 켤 때만 비교 안내).
  return {kind:'regular',message:HB_WEATHER_CATEGORY_COMPARE_ENABLED?'일반 여행지와 문화시설 후보를 비교할 수 있어요.':''};
}
// 2026-11-26 사용자 결정: 의도(날씨 기반 일정·여행지 제안)와 다른 화면 진입을 끈다. 모듈·바인딩은 보존하며 true로 되돌릴 수 있다.
const HB_WEATHER_CATEGORY_COMPARE_ENABLED=false; // '문화시설 후보 보기'·'전체 후보 비교'
const HB_WEATHER_TIME_COMPARE_ENABLED=false; // '시간대별 날씨와 일정 비교'
// BEGIN HB_WEATHER_SUGGEST_SIGNAL
// 날씨 기반 여행지·일정 제안의 판단 기준값을 이 한 곳에 모은다 (hbWeatherRecommendation도 같은 값을 쓴다).
// 임시 기준 (2026-11-26): 함께봄 제품 판단용 잠정값이며 기상청 공식 기준이나 안전 기준이 아니다.
// 실사용 피드백·QA 후 조정한다. 값을 바꾸면 tests/weather_suggestions.test.cjs 경계 시험도 함께 고친다.
const HB_WEATHER_SUGGEST_RULE=Object.freeze({
 wetProbabilityPercent:60,   // 시간대 강수확률이 이 값 이상이면 강수 시간대로 본다
 dryProbabilityPercent:30,   // '맑고 온화' 판단은 모든 시간대 강수확률이 이 값 이하일 때만
 hotTemperatureC:30,         // 이 값 이상이면 더위 부담 시간대
 coldTemperatureC:-5,        // 이 값 이하이면 추위 부담 시간대
 mildMinTemperatureC:10,     // '맑고 온화' 기온 하한 (모든 시간대)
 mildMaxTemperatureC:27,     // '맑고 온화' 기온 상한 (모든 시간대)
 wetTypes:Object.freeze(['비','비 또는 눈','눈','소나기']),
 defaultWindow:Object.freeze({start:'09:00',end:'18:00'}), // 여행 시간이 없을 때 장소 순서 판단에 쓰는 시간대
 maxReorderStops:6           // 순서 제안에서 함께 비교하는 관광지 수 상한 (6! = 720가지)
});
function hbWeatherBand(minute){return minute<360?'새벽':minute<720?'오전':minute<1080?'오후':'저녁'}
function hbWeatherClockMinute(value){
 const m=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value||''));
 return m?Number(m[1])*60+Number(m[2]):null;
}
/** Forecast/alert snapshot -> one suggestion signal. mode: adverse | pleasant | neutral | none.
 * 'none' means no weather-based change (pending, out of range, error, stale). Never a safety claim. */
function hbWeatherSignal(snapshot,key,window={}){
 const R=HB_WEATHER_SUGGEST_RULE;
 const result=(mode,reason,extra={})=>{
  const out={mode,reason,label:'',source:'',hours:new Map(),hazards:[],...extra};
  out.fingerprint=[out.mode,out.reason,out.label,out.source].join('|');
  return out;
 };
 if(!snapshot||snapshot.key!==key)return result('none','pending');
 let date='';try{date=String(JSON.parse(key)[1]||'')}catch{date=''}
 const clock=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)?v.slice(11,16):'';
 const a=snapshot.alerts;
 const hazards=a?.status==='active'&&Array.isArray(a.active)?[...new Set(a.active.map(x=>String(x?.hazard||'')+String(x?.severity||'')).filter(x=>x.trim()))]:[];
 const f=snapshot.state==='available'&&snapshot.data&&typeof snapshot.data==='object'?snapshot.data:null;
 if(!hazards.length&&!f)return result('none',snapshot.state==='no_forecast'?'out_of_range':snapshot.state==='loading'?'pending':'unavailable');
 const hours=new Map();
 for(const v of f&&Array.isArray(f.hourly)?f.hourly:[]){
  if(typeof v?.at!=='string'||(date&&!v.at.startsWith(date+'T'))||!/T(?:[01]\d|2[0-3]):00:00\+09:00$/.test(v.at))continue;
  const pop=v.precipitationProbabilityPercent,temp=v.temperatureC,wetType=R.wetTypes.includes(v.precipitationType);
  if(!Number.isFinite(pop)||pop<0||pop>100||!Number.isFinite(temp)||(!wetType&&v.precipitationType!=='없음'))continue;
  const minute=Number(v.at.slice(11,13))*60;
  hours.set(minute,{minute,pop,temp,type:v.precipitationType,wet:wetType||pop>=R.wetProbabilityPercent,hot:temp>=R.hotTemperatureC,cold:temp<=R.coldTemperatureC});
 }
 const start=hbWeatherClockMinute(window?.start)??hbWeatherClockMinute(R.defaultWindow.start);
 let end=hbWeatherClockMinute(window?.end)??hbWeatherClockMinute(R.defaultWindow.end);
 if(end<=start)end=Math.min(1440,start+540);
 const inWindow=[...hours.values()].filter(h=>h.minute+60>start&&h.minute<end);
 let slots=inWindow.length?inWindow:[...hours.values()];
 if(!slots.length&&f){
  // Representative value only (no hourly slots): never invented as an hourly series.
  const pop=f.precipitationProbabilityPercent,temp=f.temperatureC,wetType=R.wetTypes.includes(f.precipitationType);
  const p=Number.isFinite(pop)&&pop>=0&&pop<=100?pop:null,t=Number.isFinite(temp)?temp:null;
  if(p!==null||t!==null||wetType)slots=[{minute:null,pop:p,temp:t,type:f.precipitationType,wet:wetType||p!==null&&p>=R.wetProbabilityPercent,
   hot:t!==null&&t>=R.hotTemperatureC,cold:t!==null&&t<=R.coldTemperatureC,representative:true}];
 }
 const reasons=[];
 if(hazards.length)reasons.push(hazards.slice(0,2).join('·')+' 발효');
 const wet=slots.filter(h=>h.wet),hot=slots.filter(h=>h.hot),cold=slots.filter(h=>h.cold);
 if(wet.length){
  const peak=wet.reduce((m,h)=>(h.pop??-1)>(m.pop??-1)?h:m,wet[0]);
  const type=wet.find(h=>R.wetTypes.includes(h.type))?.type;
  const detail=peak.pop===null?'':'('+(peak.minute===null?'':hbWeatherBand(peak.minute)+' ')+'강수확률 '+peak.pop+'%)';
  reasons.push((type||'강수')+' 예보'+detail);
 }
 if(hot.length)reasons.push('더위 부담(최고 '+Math.max(...hot.map(h=>h.temp))+'℃)');
 if(cold.length)reasons.push('추위 부담(최저 '+Math.min(...cold.map(h=>h.temp))+'℃)');
 const forecastSource=f?('기상청 단기예보'+(clock(f.issuedAt)?' · '+clock(f.issuedAt)+' 발표':'')):'';
 const alertSource=hazards.length?'기상청 기상특보'+(clock(a.effectiveAt)?' · '+clock(a.effectiveAt)+' 발효':''):'';
 if(reasons.length)return result('adverse','weather_burden',{label:reasons.slice(0,2).join(' · '),
  source:[alertSource,wet.length||hot.length||cold.length?forecastSource:''].filter(Boolean).join(' · ')||forecastSource,hours,hazards});
 const hourly=slots.filter(h=>!h.representative);
 if(hourly.length&&hourly.every(h=>h.pop<=R.dryProbabilityPercent&&h.temp>=R.mildMinTemperatureC&&h.temp<=R.mildMaxTemperatureC)){
  const lo=Math.min(...hourly.map(h=>h.temp)),hi=Math.max(...hourly.map(h=>h.temp)),pop=Math.max(...hourly.map(h=>h.pop));
  return result('pleasant','mild_dry',{label:(f.summary==='맑음'?'맑고 온화한 날씨':'비 소식 없는 온화한 날씨')+'(강수확률 '+pop+'% 이하 · '+(lo===hi?lo:lo+'~'+hi)+'℃)',source:forecastSource,hours});
 }
 return result('neutral','no_burden',{source:forecastSource,hours});
}
/** After a forecast update, redraw only views whose weather suggestion actually changes. */
function hbWeatherSuggestRefresh(){
 const at=path();
 if(at==='/places'&&typeof hbWeatherBrowseNeedsRefresh==='function'&&hbWeatherBrowseNeedsRefresh())browse();
 else if(at==='/plan'&&typeof hbPlanWeatherRefresh==='function')hbPlanWeatherRefresh();
}
// END HB_WEATHER_SUGGEST_SIGNAL
function hbWeatherOptionsMarkup(){
 const rec=hbWeatherRecommendation(forecast,currentWeatherKey());
 const browsing=path()==='/places';
 const actions=browsing&&['adverse','caution','regular'].includes(rec.kind)&&(HB_WEATHER_CATEGORY_COMPARE_ENABLED||rec.kind!=='regular')?
  '<div class="actions">'+(HB_WEATHER_CATEGORY_COMPARE_ENABLED?'<button type="button" class="light" id="hb-weather-culture">문화시설 후보 보기</button><button type="button" class="light" id="hb-weather-all">전체 후보 비교</button>':'')+
  (rec.kind==='regular'?'':'<button type="button" class="light" id="hb-weather-short">짧은 코스 제안 보기</button><button type="button" class="light" id="hb-weather-date">날짜 다시 선택</button>')+'</div><div id="hb-weather-option-result" role="status"></div>':'';
 const timeOption=HB_WEATHER_TIME_COMPARE_ENABLED&&browsing&&rec.kind!=='caution'&&forecast.key===currentWeatherKey()&&forecast.state==='available'&&Array.isArray(forecast.data?.hourly)&&forecast.data.hourly.length?
    '<button type="button" class="light" id="hb-weather-times">시간대별 날씨와 일정 비교</button><div id="hb-weather-time-result" role="status"></div>':'';
 return (rec.message?'<p>'+safe(rec.message)+'</p>':'')+actions+timeOption;
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
  output.innerHTML='<p>선택한 장소 중 '+safe(keep.name)+' 중심의 짧은 초안이에요.</p><ol>'+list+'</ol><button type="button" class="light" id="hb-weather-apply-short">이 장소 선택으로 변경</button>';
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
    + safe(weatherText()) + '</p><p class="muted">출처: 기상청</p><div data-hb-weather-options>'+hbWeatherOptionsMarkup()+'</div></section>';
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
     hbWeatherSuggestRefresh();
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
      : nearbyMode+' · 주변 '+nearbyItems.length+'곳'+(featuredPlaces.length?' · 대표 명소 '+featuredPlaces.length+'곳':'');
  // P1-3 (2026-11-26): data-pipeline notes (partial/keyword supplement/nationwide snapshot/past events)
  // are developer diagnostics, not user guidance; they stay in nearbyResultMeta only.
  if((nearbyError||nearbyLoading)&&nearbyItems.length&&nearbyResultCategory===nearFilter)status.textContent+=' · 마지막 정상 조회: '+nearbyResultCenterLabel;
  if(nearbyPinWarning)status.textContent+=' · '+nearbyPinWarning;
  // The default map centre is only a browsing reference; the trip origin is chosen in 여행 만들기.
  if(!nearbyUser&&nearbyCenterLabel==='서울 시청')status.textContent+=' · 출발지는 여행 만들기 1단계에서 따로 설정해요';
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
    fallback('기기 위치를 사용할 수 없어 지도 기본 중심(서울 시청)을 표시해요.');
    return;
  }
  try{
    navigator.geolocation.getCurrentPosition(position=>{
      if(request!==nearbyRequestId)return;
      const lat=position?.coords?.latitude,lng=position?.coords?.longitude;
      if(!hbValidMapPoint(lat,lng)){
        fallback('현재 위치 좌표를 확인할 수 없어 지도 기본 중심(서울 시청)을 표시해요.');
        return;
      }
      nearbyMode='내 현재 위치 기준';
      fetchNearby(lat,lng,true);
    },error=>{
      const messages={
        1:'위치 권한이 꺼져 있어 지도 기본 중심(서울 시청)을 표시해요.',
        2:'현재 위치를 확인할 수 없어 지도 기본 중심(서울 시청)을 표시해요.',
        3:'위치 확인이 오래 걸려 지도 기본 중심(서울 시청)을 표시해요.'
      };
      fallback(messages[error?.code]||messages[2]);
    },{enableHighAccuracy:false,timeout:9000,maximumAge:180000});
  }catch{
    fallback('위치를 확인할 수 없어 지도 기본 중심(서울 시청)을 표시해요.');
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
   '<strong>'+safe(stop.name||'방문지')+'</strong>'+
   (place?.address||stop.address?'<small class="hb-trip-address">주소 '+safe(place?.address||stop.address)+'</small>':'')+
   (coordinates||!stop.isPlaceholder?'':' <small>장소 미정</small>')+'</button></li>').join('')+
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
        info.textContent=(p.address?' · '+String(p.address):'')+(p.coordinateEvidence?.sourceDatasetUpdatedAt?' · 자료 기준 '+String(p.coordinateEvidence.sourceDatasetUpdatedAt):'')+(p.accessibleFacilityReport?.note?' · '+String(p.accessibleFacilityReport.note):'');
        item.append(info);list.append(item);
      }
    }catch(e){clear();throw e;}
  };
  const setStatus=(state,detail)=>{
    for(const link of links)link.remove();links=[];
    const prefix=detail?.region?String(detail.region)+' 일부 확인 자료':'서울·경기 일부 확인 자료';
    const suffix=' · 시설 위치(화장실 입구 아님) · 직선거리';
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
function hbNationwideDiscovery(p){return ['nationwide_catalog','nationwide_live','keyword_snapshot'].includes(p?.discoverySource);}
function hbNearbyPlanAllowed(p){return !hbNationwideDiscovery(p)||String(p.areaCode??'')===({서울:'1',경기:'31'}[s.region]||'-');}
function hbRememberNearbyPlace(p){
  if(!p||typeof p.id!=='string'||!p.id)return;
  if(hbNationwideDiscovery(p)){hbRichSelected=p;if(!hbNearbyPlanAllowed(p))return;}
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
          const info=new M.InfoWindow({content:'<div style="padding:12px;max-width:260px;color:#284238"><b>'+safe(p.name)+'</b>'+(p.address?'<p style="margin:4px 0;font-size:12px">'+safe(p.address)+'</p>':'')+'<small>직선거리 '+safe(p.distanceKm)+'km</small><p><a href="'+safe(hbNearbyDetailLink(p))+'">장소 상세 보기</a></p></div>',borderWidth:0,backgroundColor:'#fff'});
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
    if(!items.length)nearbyError=d.meta?.partial?'일부 자료에서 장소를 찾지 못했어요.':'이 반경에서 조회된 장소가 없어요';
  }catch(e){
    if(n!==nearbyRequestId)return;
    nearbyError='주변 장소를 불러오지 못했어요. 위치를 다시 선택해 주세요.';
  }finally{
    if(n===nearbyRequestId){nearbyLoading=false;setNearbyStatus();updateNearbyPins();drawNearbyList();}
  }
}
async function loadFeatured(lat,lng,id){try{let r=await get('/api/featured.js?lat='+encodeURIComponent(lat.toFixed(4))+'&lng='+encodeURIComponent(lng.toFixed(4)));if(id!==featuredRequestId)return;featuredPlaces=r.places||[];featuredError=featuredPlaces.length?'':'근처에서 대표 명소를 찾지 못했어요'}catch(e){if(id!==featuredRequestId)return;featuredError='대표 관광지 자료를 불러오지 못했어요.'}finally{if(id===featuredRequestId){featuredLoading=false;setNearbyStatus();updateNearbyPins();drawNearbyList()}}}
function drawNearbyList(){['all','spot','food'].forEach(f=>document.getElementById('near-'+f)?.setAttribute('aria-pressed',String(nearFilter===f)));updateNearbyPins(false);let box=document.getElementById('nearby-list');if(!box)return;let sum=document.getElementById('featured-summary');if(sum)sum.textContent=featuredLoading?'📍 주변 대표 관광지를 불러오는 중이에요…':featuredPlaces.length?'📍 대표 관광지 '+featuredPlaces.length+'곳 · 관광지 편집 선정 (공식 인기순위 아님)':featuredError;let quick=document.getElementById('featured-quicklinks');if(quick){quick.innerHTML=featuredPlaces.map((p,i)=>'<button type="button" class="light hb-famous-chip" data-featured-jump="'+i+'">'+safe(p.name)+'</button>').join('');quick.querySelectorAll('[data-featured-jump]').forEach(b=>b.onclick=()=>{let p=featuredPlaces[Number(b.dataset.featuredJump)];if(!p)return;if(nearbyMap&&window.naver?.maps){nearbyMap.setCenter(new window.naver.maps.LatLng(p.lat,p.lng));nearbyMap.setZoom(15)}document.getElementById('nearby-map')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})})};const filtered=nearFilter==='famous'?featuredPlaces:nearbyItems.filter(p=>nearFilter==='all'||nearFilter==='food'&&p.kind==='food'||nearFilter==='spot'&&['spot','culture'].includes(p.kind));// HB_PHOTO_LIST_GATE: the list shows only places with a photo (map pins stay as they are); chosen places stay.
const gate=hbPhotoGate(filtered,hbTripKeepIds(s.chosen,s.stops),'home'),shown=gate.visible;if(nearFilter==='famous'&&featuredLoading){box.innerHTML='<p class="muted">유명 관광지를 검색하고 있어요…</p>';return}if(nearFilter!=='famous'&&(nearbyLoading||gate.pending)&&!shown.length){box.innerHTML='<p class="muted">주변 관광지와 식당을 찾고 있어요…</p>';return}if(filtered.length&&!shown.length){box.innerHTML='<p class="muted">이 주변에서 지금 보여 드릴 장소를 찾지 못했어요. 지도를 옮겨 다시 검색해 보세요.</p>';return}if(!filtered.length){box.innerHTML='<p class="muted">'+(nearFilter==='famous'?safe(featuredError||'근처에서 대표 관광지를 찾지 못했어요.'):safe(nearbyError||'이 조건에서 검색된 장소가 없어요.'))+'</p>';return}box.innerHTML='<div class="grid">'+shown.slice(0,50).map(p=>'<div class="card"'+(nearbySelectedId===p.id?' style="outline:2px solid #285C50"':'')+'><span class="chip">'+(p.featured?'⭐ 주요 관광명소':p.kind==='food'?'🍚 음식점':safe(String(p.subtype||'').replace(' · 세부 유형 미확인','')||(p.kind==='culture'?'문화시설':'관광지')))+'</span><h3>'+safe(p.name)+'</h3>'+(p.address?'<p class="muted">'+safe(p.address)+'</p>':'')+'<p class="muted">'+safe(p.featured?nearbyCenterLabel:nearbyResultCenterLabel)+'에서 직선거리 '+safe(p.distanceKm)+'km</p><div class="actions">'+(p.featured?'<button class="light" data-zoom-featured="'+safe(p.id)+'">지도에서 보기</button>':'')+'<a href="'+safe(hbNearbyDetailLink(p))+'">장소 상세 보기</a><a target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(p.lat+','+p.lng)+'">장소 보기 ↗</a><button class="light" data-near-map="'+safe(p.id)+'" aria-pressed="'+String(nearbySelectedId===p.id)+'">지도에서 선택</button>'+(hbNearbyPlanAllowed(p)?'<button type="button" class="light" data-near-pick="'+safe(p.id)+'">'+(s.chosen.includes(p.id)?'선택됨':'일정에 담기')+'</button>':'<span class="muted">현재 일정 지원 지역 외</span>')+'</div></div>').join('')+'</div>'+(gate.pending?'<p class="muted hb-photo-gate-more">장소를 더 불러오고 있어요…</p>':'');box.querySelectorAll('[data-near-map]').forEach(b=>b.onclick=()=>hbSelectNearbyPlace(b.dataset.nearMap,true));box.querySelectorAll('[data-near-pick]').forEach(b=>b.onclick=()=>{let p=[...featuredPlaces,...nearbyItems].find(v=>v.id===b.dataset.nearPick);if(!p||!hbNearbyPlanAllowed(p))return;if(!s.chosen.includes(p.id))s.chosen.push(p.id);if(!places.some(v=>v.id===p.id))places.push({...p,hbPickedRegion:s.region,accessFacts:[],accessStatus:'unknown'});save();drawNearbyList()});box.querySelectorAll('[data-zoom-featured]').forEach(b=>b.onclick=()=>{let p=featuredPlaces.find(v=>v.id===b.dataset.zoomFeatured);if(p&&nearbyMap&&window.naver?.maps){nearbyMap.setCenter(new window.naver.maps.LatLng(p.lat,p.lng));nearbyMap.setZoom(16);document.getElementById('nearby-map')?.scrollIntoView({behavior:'smooth',block:'center'})}})}


function hbBindNewTripNav(){
// Header travel creation is an explicit new-trip action, not a raw resume link.
const hbNewTripNav=document.querySelector('header nav a[href="#/new"]');
if(hbNewTripNav)hbNewTripNav.addEventListener('click',event=>{
 event.preventDefault();
 const initialized=hbEnsureOwnerState('/new');
 if(hbBeginNewTravel()===true&&initialized&&hbPlacesLoadedRegion!==s.region)load();
});
}
function hbBindHomeNav(){
// Header logo and 홈 always show the main screen from the top. A same-hash
// link fires no hashchange, so on #/ the main screen is redrawn here; other
// routes still change the hash and render through the hashchange listener.
document.querySelectorAll('header a.hb-brand-home,header nav a[href="#/"]').forEach(link=>link.addEventListener('click',event=>{
 if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
 event.preventDefault();
 if(location.hash==='#/')render();else location.hash='#/';
 window.scrollTo(0,0);
}));
}
addEventListener('hashchange',render);hbBindNewTripNav();hbBindHomeNav();render()
})();
