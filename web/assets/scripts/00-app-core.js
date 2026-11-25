
(()=>{const el=document.getElementById('app'),KEY='hamkkebom-cloud';let s={region:'서울',date:new Date(Date.now()+32400000).toISOString().slice(0,10),walk:'15',stairs:'avoid',chosen:[],stops:[]};try{s={...s,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{}let places=[],loading=false,issue='',weather='';const save=()=>localStorage.setItem(KEY,JSON.stringify(s)),path=()=>location.hash.slice(1)||'/',go=x=>{location.hash='#'+x;render()},safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),button=(id,name,alt=false)=>'<button '+(alt?'class="light" ':'')+'id="'+id+'">'+name+'</button>',panel=(h,b)=>'<section class="panel"><h2>'+h+'</h2>'+b+'</section>';
function hbPlaceDataMessage(){
 const status=loading?'장소를 불러오는 중이에요.':issue?'조회 실패: '+safe(issue):
  hbPlacesLoadedRegion===s.region?(places.length?'장소 '+places.length+'곳을 불러왔어요.':'조회된 장소가 없어요.'):'아직 장소를 조회하지 않았어요.';
 return '<div id="hb-place-data-state" role="'+(issue?'alert':'status')+'" class="message '+(issue?'error':'')+'">'+status+'</div>';
}

function prefs(){
 return '<div class="row"><div class="field"><label for="region">여행 지역</label><select id="region"><option>서울</option><option>경기</option></select></div>'+
  '<div class="field"><label for="date">여행 날짜</label><input type="date" id="date" value="'+safe(s.date)+'"></div>'+
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
  save();
  getWeather();
 };
 document.getElementById('refresh').onclick=load;
}
function home(){el.innerHTML='<section class="hb-landing-hero" aria-labelledby="hb-landing-title"><span class="hb-landing-eyebrow">🌷 부모님과 함께하는 편안한 여행, 함께봄</span><h1 id="hb-landing-title">좋은 곳보다,<br>함께 가기 편한 곳.</h1><p class="hb-landing-intro">계단, 화장실, 쉬어갈 곳까지. 부모님과 함께 갈 때 필요한 정보를 살펴보고 우리 가족에게 맞는 여행 일정을 만들어보세요.</p><div class="hb-landing-benefits" aria-label="함께봄의 주요 기능"><div class="hb-benefit"><span aria-hidden="true">🚶</span><strong>걷기 조건 선택</strong></div><div class="hb-benefit"><span aria-hidden="true">🪜</span><strong>계단·경사 정보</strong></div><div class="hb-benefit"><span aria-hidden="true">🚻</span><strong>화장실·휴식시설</strong></div><div class="hb-benefit"><span aria-hidden="true">🌦️</span><strong>날씨·일정 조정</strong></div></div><div class="hb-landing-actions"><button id="mom-start" class="hb-landing-cta" type="button">💗 부모님 맞춤 여행 만들기 <span aria-hidden="true">→</span></button><button id="hb-map-go" class="hb-landing-link" type="button">지도에서 여행지 둘러보기</button></div><p class="hb-landing-note">※ 이동 편의 정보는 장소별로 확인 범위가 달라요. 미확인 정보는 구분해서 보여드려요.</p></section><section class="panel" style="padding:13px;margin-bottom:15px"><div class="row" style="align-items:center;justify-content:space-between;margin:2px 0 10px"><div><strong>📍 내 주변 관광지 지도</strong><div class="muted" id="nearby-status">위치를 확인하고 있어요…</div></div><div class="actions" style="margin:0"><button class="light" id="locate-again">내 위치 다시 찾기</button><button class="light" id="locate-seoul">서울 중심 보기</button><button class="light" id="hb-search-map-center" type="button" disabled>이 지도 위치에서 다시 검색</button></div></div><div id="nearby-map" style="height:min(57vh,510px);min-height:330px;border-radius:14px;background:#dce9dc;z-index:0"></div><div class="muted" style="padding-top:10px">지도: 네이버지도 · 관광지: 한국관광공사 TourAPI · GPS는 허용 시에만 조회하며 저장하지 않아요.</div></section><section class="panel"><h2 style="margin-bottom:9px">내 주변 여행지 · 식당</h2><div class="actions" style="margin-bottom:12px"><button id="near-all" class="light">전체</button><button id="near-spot" class="light">관광지</button><button id="near-food" class="light">식당</button></div><div id="featured-summary" class="muted" style="margin-bottom:12px"></div><div id="featured-quicklinks" class="hb-featured-quicklinks" aria-label="대표 관광지 바로가기"></div><div id="nearby-list"><p class="muted">실제 장소를 찾는 중이에요.</p></div></section><section class="hb-landing-how" aria-label="함께봄 사용 방법"><h2>여행 준비부터 여행 중까지</h2><div class="hb-how-grid"><div><span aria-hidden="true">📍</span><strong>편한 장소 살펴보기</strong><p>알려진 편의시설 정보와 확인이 필요한 부분을 함께 살펴봐요.</p></div><div><span aria-hidden="true">🗓️</span><strong>우리 가족 일정 만들기</strong><p>방문 순서와 식사, 쉬는 시간을 고려해 일정을 준비해요.</p></div><div><span aria-hidden="true">💗</span><strong>피곤하면 일정 가볍게</strong><p>그날 컨디션에 맞춰 남은 일정을 줄이는 변경안을 확인해요.</p></div></div></section><div class="actions">'+button('start','💗 부모님 맞춤 여행 만들기 →')+'</div>';document.getElementById('start').onclick=()=>go('/new');document.getElementById('mom-start').onclick=()=>go('/new');document.getElementById('hb-map-go').onclick=()=>{let map=document.getElementById('nearby-map'), target=map||document.getElementById('nearby-list');if(!target)return;target.setAttribute('tabindex','-1');target.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});target.focus({preventScroll:true})};document.getElementById('locate-again').onclick=()=>requestLocation(true);document.getElementById('locate-seoul').onclick=()=>{nearbyMode='서울 시청 중심 (기본 위치)';fetchNearby(37.5665,126.9780,false)};document.getElementById('hb-search-map-center').onclick=hbSearchMapCenter;['all','spot','food'].forEach(f=>document.getElementById('near-'+f).onclick=()=>{nearFilter=f;featuredMode=false;drawNearbyList()});mountNearbyMap();if(!geoStarted){geoStarted=true;requestLocation(false)}else{setNearbyStatus();drawNearbyList()}}

function hbAccessFacts(place){
  return Array.isArray(place.accessFacts)?place.accessFacts.filter(f=>f&&typeof f==='object'):[];
}

function hbScopedMobility(value){
  return value?.status==='verified'&&typeof value.scope==='string'&&value.scope.trim()!==''&&typeof value.verifiedAt==='string'&&Number.isFinite(Date.parse(value.verifiedAt));
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
function hbTravelInput(profile,today=hbTodaySeoul()){
  const errors=[];
  const allowed=(value,choices)=>choices.includes(value)?value:null;
  const text=value=>typeof value==='string'?value:'';
  const region=allowed(profile.region,['서울','경기']);
  if(!region)errors.push('여행 지역을 선택해 주세요.');
  const date=text(profile.date);
  const format=/^\d{4}-\d{2}-\d{2}$/.test(date);
  const parsed=format?new Date(date+'T00:00:00Z'):null;
  const validDate=!!(parsed&&Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date);
  if(!validDate)errors.push('올바른 여행 날짜를 선택해 주세요.');
  else if(date<today)errors.push('과거 날짜로 여행을 만들 수 없어요. 오늘 이후 날짜를 선택해 주세요.');
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
function newPlan(){
  const step=[1,2,3].includes(Number(s.hbStep))?Number(s.hbStep):1;
  s.momNeeds=Array.isArray(s.momNeeds)?s.momNeeds:[];
  s.hbFoodPreferences=Array.isArray(s.hbFoodPreferences)?[...new Set(s.hbFoodPreferences.filter(x=>['less_spicy','easy_to_chew','vegetarian'].includes(x)))]:[];
  const walkChoices=[['5','5분 이하'],['10','10분 정도'],['15','15분 정도'],['20','20분 정도'],['30','30분 이상']];
  const stairChoices=[['possible','계단 이용 가능'],['avoid','가능하면 계단 피하기'],['impossible','계단 이용 불가']];
  const card=(items,key,value)=>items.map(([id,name])=>'<button type="button" class="hb-choice '+(value===id?'chosen':'')+'" data-hb-'+key+'="'+id+'" aria-pressed="'+String(value===id)+'">'+safe(name)+'</button>').join('');
  const refreshChoice=selector=>{newPlan();document.querySelector(selector)?.focus()};
  const changeStep=next=>{s.hbStep=next;save();newPlan();el.querySelector('h2')?.focus()};
  const prev=step>1?'<button class="light" type="button" id="hb-prev">← 이전 단계</button>':'';
  const intro='<h1>부모님과 여행 만들기</h1><p class="muted">여행 지역과 이동 조건부터 확인해요. 방문 가능한 동선이 검증됐다는 뜻은 아니에요.</p><div class="hb-progress" aria-label="3단계 중 '+step+'단계">1. 여행 정보 <span>›</span> 2. 이동 조건 <span>›</span> 3. 선호사항 <strong>('+step+'/3)</strong></div>';
  if(step===1){
    el.innerHTML=intro+'<section class="panel"><h2 tabindex="-1">1. 여행 정보</h2>'+prefs()+'<div class="row"><div class="field"><label for="hb-duration">여행 형태</label><select id="hb-duration"><option value="day">당일 여행</option><option value="overnight">숙박 여행</option></select></div><div class="field"><label for="hb-transport">주요 이동 수단</label><select id="hb-transport"><option value="car">자동차</option><option value="transit">대중교통</option><option value="mixed">상황에 따라 선택</option></select></div><div class="field"><label for="hb-party">동행 인원</label><select id="hb-party"><option value="2">2명</option><option value="3">3명</option><option value="4">4명</option><option value="5">5명</option><option value="6">6명</option><option value="7">7명</option><option value="8">8명</option><option value="9">9명</option><option value="10">10명</option><option value="11">11명</option><option value="12">12명</option></select></div></div><div class="actions"><button type="button" id="hb-next">다음: 이동 조건 →</button></div><p class="muted" id="hb-step-error" role="alert"></p></section>';
    bindPrefs();
    const ids=[['hb-duration','hbDuration','day'],['hb-transport','hbTransport','car'],['hb-party','hbParty','2']];
    ids.forEach(([id,key,defaultValue])=>{const x=document.getElementById(id);x.value=s[key]||defaultValue;x.onchange=()=>{s[key]=x.value;save()}});
    document.getElementById('hb-next').onclick=()=>{const result=hbTravelInput(s);const issues=result.errors.filter(x=>!x.includes('걸을 수 있는 시간')&&!x.includes('계단 이용 조건'));if(issues.length){document.getElementById('hb-step-error').textContent=issues.join(' ');return;}changeStep(2)};
    return;
  }
  if(step===2){
    el.innerHTML=intro+'<section class="panel"><h2 tabindex="-1">2. 이동 조건</h2><p class="muted">필수 항목이에요. 실제 보행 거리와 계단 여부는 장소별 확인이 필요해요.</p><h3>한 번에 얼마나 걸을 수 있나요?</h3><div class="hb-choice-grid">'+card(walkChoices,'walk',s.hbWalkConfirmed?s.walk:null)+'</div><h3>계단 이용은 어떤가요?</h3><div class="hb-choice-grid">'+card(stairChoices,'stairs',s.hbStairsChoice)+'</div><div class="actions">'+prev+'<button type="button" id="hb-next">다음: 선호사항 →</button></div><p id="hb-step-error" class="warn" role="alert" hidden></p></section>';
    document.querySelectorAll('[data-hb-walk]').forEach(b=>b.onclick=()=>{s.walk=b.dataset.hbWalk;s.hbWalkConfirmed=true;save();refreshChoice('[data-hb-walk="'+b.dataset.hbWalk+'"]')});
    document.querySelectorAll('[data-hb-stairs]').forEach(b=>b.onclick=()=>{s.hbStairsChoice=b.dataset.hbStairs;s.stairs=s.hbStairsChoice==='possible'?'possible':'avoid';save();refreshChoice('[data-hb-stairs="'+b.dataset.hbStairs+'"]')});
    document.getElementById('hb-prev').onclick=()=>{changeStep(1)};
    document.getElementById('hb-next').onclick=()=>{const issues=hbTravelInput(s).errors;if(issues.length){const m=document.getElementById('hb-step-error');m.hidden=false;m.textContent=issues.join(' ');return;}changeStep(3)};
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
  document.getElementById('hb-finish').onclick=()=>{const result=hbTravelInput(s);if(result.errors.length){document.getElementById('hb-finish-error').textContent=result.errors.join(' ');return;}s.hbBrowseLimit=30;s.hbBrowseFilter=s.hbInterest||'all';save();go('/places')};
}
function hbBrowseText(value){
  return String(value??'').normalize('NFKC').toLocaleLowerCase('ko').replace(/\s+/g,'').trim();
}

function hbSearchPlaces(list,filter,query){
  const term=hbBrowseText(query);
  return list.filter(place=>{
    const category=filter==='all'||filter==='spot'&&place.kind!=='food'||filter==='food'&&place.kind==='food'||filter==='access'&&hbAccessFacts(place).length>0;
    return category&&(!term||[place.name,place.address].some(value=>hbBrowseText(value).includes(term)));
  });
}

function hbPlaceCategory(place){
  return place.kind==='food'?'식당':place.kind==='culture'?'문화시설':'관광지';
}

function hbPlaceDetailPath(id){
  return '#/place/'+encodeURIComponent(id);
}

function browse(){
  const filter=['all','spot','food','access'].includes(s.hbBrowseFilter)?s.hbBrowseFilter:(s.hbInterest||'all');
  const query=typeof s.hbBrowseQuery==='string'?s.hbBrowseQuery:'';
  const chosen=Array.isArray(s.chosen)?s.chosen:[];
  const profile={
    walk:s.hbWalkConfirmed?s.walk:null,stairsMode:s.hbStairsChoice,needs:s.momNeeds,mobilityAid:s.hbMobilityAid,
    slopePreference:s.hbSlopePreference,indoorPreference:s.hbIndoorPreference
  };
  const ready=!loading&&!issue&&hbPlacesLoadedRegion===s.region;
  const filtered=ready?hbSearchPlaces(places,filter,query):[];
  const ranked=filtered.map(p=>({p,e:hbEvaluatePlace(p,profile)}))
    .sort((a,b)=>b.e.score-a.e.score||String(a.p.name||'').localeCompare(String(b.p.name||''),'ko'));
  const good=ranked.filter(x=>x.e.status==='confirmed');
  const review=ranked.filter(x=>x.e.status==='review');
  const excluded=ranked.filter(x=>x.e.status==='excluded');
  const limited=Math.max(10,Number(s.hbBrowseLimit)||30);
  const available=new Map(places.map(place=>[place.id,place]));
  const selections=chosen.map(id=>({id,place:available.get(id)}));
  const card=({p,e})=>{
    const picked=chosen.includes(p.id);
    const status=e.status==='confirmed'?'이동 조건 확인됨':e.status==='excluded'?'조건 충돌':e.conflict?'출처 상충':'이동 조건 확인 필요';
    return '<article class="card hb-recommend-card"><div class="hb-card-top"><span class="chip">'+hbPlaceCategory(p)+'</span><span class="hb-recommend-state">'+status+'</span></div>'+
      '<h3>'+safe(p.name)+'</h3><p class="muted">'+safe(p.address||'주소 미확인')+'</p>'+
      (e.scope?'<p>확인 범위: '+safe(e.scope)+'</p>':'')+
      (e.found.length?'<p>관련 편의시설 안내: '+safe(e.found.join(', '))+'</p>':'')+
      (e.gaps.length?'<p class="muted">'+safe(e.gaps.slice(0,3).join(' · '))+'</p>':'')+
      '<div class="actions"><a class="light" data-hb-info="'+safe(p.id)+'" href="'+safe(hbPlaceDetailPath(p.id))+'">상세 정보</a>'+
      (e.status==='excluded'&&!picked?'':'<button type="button" data-hb-pick="'+safe(p.id)+'" aria-pressed="'+picked+'">'+(picked?'선택 취소':'일정에 담기')+'</button>')+'</div></article>';
  };
  const section=(title,arr,empty='')=>'<section class="hb-result-section"><h2>'+title+' <span class="hb-result-count">'+arr.length+'곳</span></h2>'+
    (arr.length?'<div class="grid">'+arr.slice(0,limited).map(card).join('')+'</div>':'<p class="muted">'+empty+'</p>')+'</section>';
  const results=!ready?'':!ranked.length?
    panel('검색 결과가 없어요',places.length?'<p>검색어나 필터를 바꿔 보세요.</p>':'<p>이 지역에서 조회된 장소가 없어요. 여행 지역을 바꿔 보세요.</p>'):
    section('이동 조건 확인된 후보',good,'현재 자료로 이동 조건이 검증된 장소는 없어요.')+
    (review.length?section('방문 전 확인 필요한 후보',review):'')+
    (excluded.length?'<details class="hb-conflict"><summary>조건과 충돌하는 장소 '+excluded.length+'곳</summary><div class="grid">'+excluded.slice(0,limited).map(card).join('')+'</div></details>':'')+
    (Math.max(good.length,review.length,excluded.length)>limited?'<button type="button" class="light" id="hb-more">장소 더 보기</button>':'');
  const extraPrefs=[
    s.hbMobilityAid&&s.hbMobilityAid!=='none'?hbMobilityAidLabels[s.hbMobilityAid]:null,
    s.hbSlopePreference==='avoid_steep'?'가파른 경사 피하기':null,
    [30,45,60].includes(Number(s.hbRestIntervalMinutes))?'휴식 간격 '+Number(s.hbRestIntervalMinutes)+'분':null,
    s.hbIndoorPreference==='indoor'?'실내 위주':s.hbIndoorPreference==='outdoor'?'야외 위주':null
  ].filter(Boolean);
  const stairs={impossible:'이용 불가',avoid:'피하기',possible:'이용 가능'}[s.hbStairsChoice]||'미선택';
  const foodNote=filter==='food'?'<p class="muted">음식 선호와 영업시간은 방문 전에 확인해 주세요.</p>':'';
  const note=s.hbWalkConfirmed&&s.hbStairsChoice?'공공자료 안내만 있는 장소는 방문 전 확인이 필요해요.':'이동 조건이 아직 없어 일반 장소를 보여드려요.';
  const selectedList=selections.length?'<ul class="hb-selected-places">'+selections.map(({id,place})=>
    '<li><span>'+safe(place?.name||'현재 자료에서 조회되지 않은 장소')+'</span> <button type="button" class="light" data-hb-unpick="'+safe(id)+'">선택 취소</button></li>'
  ).join('')+'</ul>':'<p>상세 정보를 확인하고 일정에 넣을 장소를 담아보세요.</p>';
  el.innerHTML='<h1>여행 장소 찾기</h1>'+prefs()+
    '<div class="hb-profile-summary"><strong>여행 조건</strong><p>걷기 '+safe(s.hbWalkConfirmed?s.walk+'분':'미선택')+' · 계단 '+safe(stairs)+
    (extraPrefs.length?' · '+safe(extraPrefs.join(' / ')):'')+'</p><button type="button" class="light" id="hb-edit-profile">조건 수정</button></div>'+
    (s.hbWalkConfirmed&&s.hbStairsChoice?'<section class="panel"><h2>서버 추천 확인</h2><button type="button" class="light" id="hb-server-recommend">서버에서 조건 확인</button><p id="hb-server-recommend-status" role="status"></p></section>':'')+
    (typeof weatherCard==='function'?weatherCard():'')+
    '<form class="row" role="search" id="hb-browse-search"><div class="field"><label for="hb-place-search">장소 이름 또는 주소</label><input type="search" id="hb-place-search" maxlength="100" value="'+safe(query)+'"></div>'+
    '<button type="submit" id="hb-place-search-submit">검색</button>'+(query?'<button type="button" class="light" id="hb-search-reset">검색 지우기</button>':'')+'</form>'+
    '<div class="hb-filter-bar" role="group" aria-label="장소 필터">'+[['all','전체'],['spot','관광지'],['food','식당'],['access','편의시설 안내 있음']].map(([id,label])=>
    '<button type="button" data-hb-filter="'+id+'" class="light '+(filter===id?'hb-filter-active':'')+'" aria-pressed="'+String(filter===id)+'">'+label+'</button>').join('')+'</div>'+
    '<p class="muted">'+note+'</p>'+foodNote+
    '<p role="status">'+(ready?ranked.length+'곳을 찾았어요.':'')+'</p><div id="hb-place-results" aria-busy="'+loading+'">'+results+'</div>'+
    panel('일정에 담은 장소 '+chosen.length+'곳',selectedList+'<button type="button" id="build"'+(ready&&selections.some(x=>x.place)?'':' disabled')+'>선택한 장소로 일정 만들기</button>');
  bindPrefs();
  const serverButton=document.getElementById('hb-server-recommend');
  if(serverButton)serverButton.onclick=async()=>{
    const note=document.getElementById('hb-server-recommend-status');
    const {input,errors}=hbTravelInput(s);
    if(errors.length){note.textContent=errors.join(' ');return;}
    serverButton.disabled=true;
    note.textContent='공공자료를 바탕으로 조건을 확인하는 중이에요.';
    try{
      const result=await hbTravelRequest('/api/recommend',{...input,facilityNeeds:s.momNeeds});
      note.textContent='서버 목록 기준: 조건 확인 '+result.eligible.length+'곳, 방문 전 확인 '+result.needsReview.length+'곳, 조건 충돌 '+result.excluded.length+'곳. 음식 선호와 실제 이동 동선은 방문 전에 확인해 주세요.';
      for(const group of ['eligible','needsReview','excluded']){
        for(const place of result[group]){
          const card=[...el.querySelectorAll('[data-hb-info]')].find(link=>link.dataset.hbInfo===place.id)?.closest('article');
          if(!card||!note.isConnected)continue;
          const status=document.createElement('p');
          status.className='muted';
          status.textContent='서버 확인: '+{eligible:'조건 확인',needsReview:'방문 전 확인 필요',excluded:'필수 계단으로 조건 충돌'}[group];
          card.append(status);
          if(group==='excluded'){
            const pick=card.querySelector('[data-hb-pick][aria-pressed="false"]');
            if(pick)pick.disabled=true;
          }
        }
      }
    }catch{
      note.textContent='서버 추천을 확인하지 못했어요. 기존 장소 목록은 계속 이용할 수 있어요.';
    }finally{serverButton.disabled=false;}
  };
  document.getElementById('hb-edit-profile').onclick=()=>{s.hbStep=1;save();go('/new')};
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
    s.chosen=chosen.includes(id)?chosen.filter(x=>x!==id):[...chosen,id];
    save();
    browse();
    const button=document.querySelector('[data-hb-pick="'+CSS.escape(id)+'"],[data-hb-unpick="'+CSS.escape(id)+'"]');
    (button||document.getElementById('hb-place-search'))?.focus();
  });
  const more=document.getElementById('hb-more');
  if(more)more.onclick=()=>{s.hbBrowseLimit=limited+30;updateAndFocus('#hb-more, #build')};
  document.getElementById('build').onclick=hbApplyScheduleFromSelection;
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

function detail(id){
 const back='<p><a id="hb-detail-back" href="#/places">← 장소 목록</a></p>';
 const place=id?places.find(value=>value.id===id):null;
 if(!place||loading||issue){
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
 const canPick=assessment.status!=='excluded'||picked;
 const other=facts.filter(fact=>!hbDetailTopics(fact).some(topic=>specs.some(([,topics])=>topics.includes(topic))));
 el.innerHTML=back+'<span class="chip">'+hbPlaceCategory(place)+'</span><h1>'+safe(place.name)+'</h1>'+
  '<p>'+safe(place.address||'주소 미확인')+'</p>'+
  '<div class="actions">'+
  (canPick?'<button type="button" id="pick" aria-pressed="'+picked+'">'+(picked?'선택 취소':'일정에 담기')+'</button>':'')+'</div>'+
  '<p id="hb-detail-selection" role="status"></p>'+
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
 const pick=document.getElementById('pick');
 if(pick)pick.onclick=()=>{
  s.chosen=picked?chosen.filter(value=>value!==id):[...chosen,id];
  save();
  detail(id);
  (document.getElementById('pick')||document.getElementById('hb-detail-back'))?.focus();
  document.getElementById('hb-detail-selection').textContent=picked?'일정에서 선택을 취소했어요.':'일정에 장소를 담았어요.';
 };
}
function hbProtected(x){return !!(x&&(x.done||x.must||x.reserved||x.booked))}
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
 const previous=s;
 s={...s,stops,hbReplanUndo:undo};
 try{save();return true}catch{s=previous;return false}
}
function hbNextStop(items){return items.findIndex(stop=>!stop.done)}
function hbProposal(level,items,all){
 if(!Array.isArray(items)||!['low','mid','high'].includes(level))throw Error('invalid');
 const optional=items.map((v,i)=>({v,i})).filter(({v})=>!hbProtected(v)&&!v.isRestCandidate&&(v.kind||(all.find(p=>p.id===v.id)||{}).kind)!=='food');
 const n=level==='low'?0:level==='mid'?Math.ceil(optional.length/2):optional.length;
 const ids=new Set((n?optional.slice(-n):[]).map(x=>x.i));
 return {kept:items.filter((_,i)=>!ids.has(i)),removed:items.filter((_,i)=>ids.has(i)),protected:items.filter(hbProtected)};
}
function hbReplanAlternatives(level,items,catalog){
 if(level==='low')return [];
 const locations=new Map(catalog.map(place=>[place.id,place]));
 const coordinates=stop=>stop&&!stop.isPlaceholder?
  hbMapCoordinates(stop.coordinates)||hbMapCoordinates(locations.get(stop.placeId||stop.id)):null;
 const lastCompleted=items.findLast(stop=>stop.done&&coordinates(stop));
 const next=items.find(stop=>!stop.done&&coordinates(stop));
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
  if(scheduled.has(place.id)||!place.name||['conflicting','stale'].includes(place.accessStatus))return [];
  const point=hbMapCoordinates(place);
  if(!point)return [];
  const km=nearby(point);
  if(km>2)return [];
  const guide=hbDetailAccessGuide(place);
  const localFacts=guide?.facts||[];
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
  if(!rest&&(level==='high'||!documentedWalk))return [];
  const note=[rest?.description,documentedWalk?'확인된 계단 없는 구간: '+mobility.scope+' (도보 '+mobility.walkMinutes+'분)':null]
   .filter(Boolean).join(' ');
  return [{place,point,km,rest:Boolean(rest),note,source:rest?hbEvidenceSourceLink(rest.sourceUrl):null}];
 }).sort((a,b)=>a.km-b.km).slice(0,3);
}

function hbReplanResult(items,proposal,alternative){
 const firstRemoved=proposal.removed[0];
 const dropped=new Set(proposal.removed);
 const choose=alternative&&firstRemoved&&!hbProtected(firstRemoved)&&
  !items.some(stop=>(stop.placeId||stop.id)===alternative.place.id);
 return items.flatMap(stop=>{
  if(hbProtected(stop)||!dropped.has(stop))return [stop];
  if(!choose||stop!==firstRemoved)return [];
  const {place,point,rest}=alternative;
  return [{
   id:place.id,placeId:place.id,name:place.name,address:place.address||null,coordinates:point,
   kind:rest?'rest':place.kind||'spot',isRestCandidate:rest,isPlaceholder:false,
   time:stop.time,plannedArrival:stop.plannedArrival||stop.time,stayMinutes:stop.stayMinutes,
   restMinutes:rest?stop.stayMinutes:0,travelTimeStatus:'unknown',transitionBufferMinutes:stop.transitionBufferMinutes,
   done:false,must:false,reserved:false,booked:false
  }];
 }).map((stop,index)=>({...stop,position:index+1}));
}

let hbRefreshTravelConditionMap=null;
function plan(){
 const stops=Array.isArray(s.stops)?s.stops:[];
 const {region,date}=hbPlanContext(s);
 const undo=s.hbReplanUndo&&s.hbReplanUndo.date===date&&s.hbReplanUndo.region===region&&s.hbReplanUndo.after===JSON.stringify(stops);
 hbDropPlanMap();
 el.innerHTML='<h1>가족 여행 일정</h1><p>'+safe(region)+' · '+safe(date)+'</p><div id="hb-plan-map-slot"></div>'+(typeof weatherCard==='function'?weatherCard(region,date):'')+'<p class="warn">이동시간·실제 보행거리·운영시간은 확인 전이에요. 현재 방문 시간은 임시 계획이에요.</p>'+(stops.length?stops.map((x,i)=>'<article class="panel hb-itinerary-row"><div><h3>'+safe(x.time||'시간 미정')+' · '+safe(x.name||'장소명 미확인')+'</h3><p class="muted">교통편 및 체류시간 별도 확인</p></div><div class="hb-itinerary-flags"><label><input type="checkbox" data-done="'+i+'" '+(x.done?'checked':'')+'> 완료</label><label><input type="checkbox" data-must="'+i+'" '+(x.must?'checked':'')+'> 필수</label><label><input type="checkbox" data-reserved="'+i+'" '+(x.reserved||x.booked?'checked':'')+'> 예약됨</label><button type="button" class="light" data-remove="'+i+'" '+(hbProtected(x)?'disabled':'')+'>삭제</button></div></article>').join(''):panel('일정이 비어 있어요','추천 장소를 먼저 담아 주세요.'))+(undo?panel('최근 일정 변경','<p>부모님 컨디션에 따라 이 기기에서 수정한 일정이에요.</p><button type="button" class="light" id="hb-rpl-undo">이전 일정 되돌리기</button>'):'')+'<div class="actions">'+button('add','장소 더 담기',true)+button('fatigue','컨디션에 맞게 일정 조정')+button('share','가족에게 공유')+'</div>';
 document.getElementById('add').onclick=()=>go('/places');document.getElementById('fatigue').onclick=()=>go('/travel');document.getElementById('share').onclick=()=>go('/share/create');
 document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{let i=+b.dataset.remove;if(hbProtected(s.stops[i]))return;
  const stops=s.stops.filter((_,index)=>index!==i).map((stop,index)=>({...stop,position:index+1}));
  if(!hbSaveTripStops(stops)){alert('일정을 저장하지 못했어요. 기존 일정을 유지했어요.');return}
  plan()});
 ['done','must','reserved'].forEach(k=>document.querySelectorAll('[data-'+k+']').forEach(b=>b.onchange=()=>{const index=+b.dataset[k];
  if(!s.stops[index])return;
  const stops=s.stops.map((stop,i)=>i===index?{...stop,[k]:b.checked,...(k==='reserved'?{booked:b.checked}:{})}:stop);
  if(!hbSaveTripStops(stops)){b.checked=!b.checked;alert('보호 표시를 저장하지 못했어요.');return}
  plan();
  el.querySelector('[data-'+k+'="'+index+'"]')?.focus()}));
 if(undo)document.getElementById('hb-rpl-undo').onclick=()=>{let u=s.hbReplanUndo;if(!u||JSON.stringify(s.stops)!==u.after){alert('일정이 추가로 바뀌어서 자동 복구할 수 없어요.');return;}if(!confirm('컨디션 조정 전 일정으로 되돌릴까요?'))return;if(!hbSavedTripMatches(hbTripSignature(s))){alert('다른 탭에서 일정이 바뀌었어요. 새로고침하고 다시 확인해 주세요.');return}
  if(!hbSaveTripStops(u.before.map(x=>({...x})))){alert('되돌린 일정을 저장하지 못했어요.');return}
  plan();
  document.getElementById('fatigue')?.focus()};
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
  const stops=items.map((stop,index)=>index===nextIndex?{...stop,done:true}:stop);
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
  const removed=new Set(proposal.removed);
  const firstRemoved=proposal.removed[0];
  const compare=document.getElementById('hb-replan-preview');
  const showList=stops=>stops.length?'<ul>'+stops.map(stop=>'<li>'+safe(stop.time||'시간 미정')+' · '+
   safe(stop.name||'장소명 미확인')+(hbProtected(stop)?' <span class="hb-protected">보호: '+
   [stop.done?'완료':null,stop.must?'필수':null,stop.reserved||stop.booked?'예약':null].filter(Boolean).join('/')+'</span>':'')+'</li>').join('')+'</ul>':
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
    level!=='low'&&proposal.removed.length?'<p>근거가 있는 가까운 대안을 찾지 못했어요. 방문을 줄이거나 휴식·귀가를 검토해 주세요.</p>':'')+
   '<p class="warn">완료·필수·예약 일정은 보호돼요. 대안까지의 이동시간과 당일 운영 여부는 방문 전 확인해 주세요.</p>'+
   '<div class="actions"><button type="button" class="light" id="hb-rpl-cancel">취소</button>'+
   (proposal.removed.length?'<button type="button" id="hb-rpl-confirm">이 변경안 적용</button>':'<p>현재 일정을 유지해요.</p>')+
   '</div></section>';
  const result=()=>hbReplanResult(items,proposal,alternatives[selected]);
  const update=()=>{
   compare.querySelector('[data-replan-result]').innerHTML=showList(result());
   for(const input of compare.querySelectorAll('[name="hb-replan-choice"]'))input.checked=Number(input.value)===selected;
  };
  for(const input of compare.querySelectorAll('[name="hb-replan-choice"]'))input.onchange=()=>{
   selected=Number(input.value);update();
  };
  update();
  const mapStops=[
   ...items.map((stop,index)=>({...stop,mapLabel:String(index+1)+(removed.has(stop)?' 제외':''),
    mapNote:removed.has(stop)?'변경안에서 제외되는 기존 방문지예요.':null})),
   ...alternatives.map(({place,point,km,note},index)=>({
    id:place.id,placeId:place.id,name:place.name,address:place.address,coordinates:point,
    time:firstRemoved.time,mapLabel:'대안 '+(index+1),mapNote:note+' · 직선거리 약 '+km.toFixed(1)+'km'
   }))
  ];
  hbDropPlanMap();
  showMap(mapStops,{
   title:'기존 일정과 대안 지도',
   onSelect(entry){
    const choice=entry.index-items.length;
    if(choice>=0&&alternatives[choice]){selected=choice;update();}
   }
  });
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
   const status=document.getElementById('hb-travel-status');
   if(hbTripSignature(s)!==signature||!hbSavedTripMatches(signature)){
    status.textContent='다른 탭에서 일정이 바뀌었어요. 새로고침하고 변경안을 다시 확인해 주세요.';
    return;
   }
   if(proposal.removed.some(hbProtected)){status.textContent='보호된 일정이 포함되어 적용할 수 없어요.';return}
   const old=s.stops.map(x=>({...x})),now=result();
   const undo={before:old,after:JSON.stringify(now),region,date,appliedAt:new Date().toISOString()};
   if(!hbSaveTripStops(now,undo)){status.textContent='저장에 실패해 기존 일정을 유지했어요.';return}
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
 const start=opt.start==null||opt.start===''?600:hbDraftMinute(opt.start);
 if(start===null||start<540||start>690)errors.push('시작 시간은 오전 9시부터 11시 30분 사이여야 해요.');
 if(errors.length)return {stops:[],errors,warnings};
 let now=start;const result=[];
 const append=(kind,place,duration,name,travelGap,meta={})=>{
  if(travelGap)now+=travelGap;
  const index=result.length;
  result.push({id:place?.id||kind+'-draft-'+index,placeId:place?.id||null,kind,name:place?.name||name,address:place?.address||null,coordinates:hbMapCoordinates(place),time:hbClock(now),plannedArrival:hbClock(now),stayMinutes:duration,restMinutes:kind==='rest'?duration:0,transitionBufferMinutes:travelGap||0,travelTimeStatus:travelGap?'unknown':'not_applicable',isRestCandidate:kind==='rest',isPlaceholder:!place,position:index+1,done:false,must:false,reserved:false,booked:false,...meta});
  now+=duration
 };
 append(sights[0].kind||'spot',sights[0],sightStay,'',0);
 append('rest',null,20,'휴식 시간 (장소 미정)',0);
 if(now<705)now=705;
 append('food',foods[0]||null,60,'점심 식사 (식당 미정)',25);
 if(sights[1]){append(sights[1].kind||'spot',sights[1],sightStay,'',25);append('rest',null,15,'휴식 시간 (장소 미정)',0)}
 if(now>1080){errors.push('하루 일정이 오후 6시를 넘어요. 시작 시간이나 선택 장소를 조정해 주세요.');return {stops:[],errors,warnings}}
 if(restInterval)warnings.push('요청한 휴식 간격 '+restInterval+'분에 맞춰 관광지 체류시간 초안을 '+sightStay+'분으로 조정하고 방문 뒤 휴식을 배치했어요. 방문지 안에서 필요한 휴식과 실제 이동·보행시간은 계산하지 않았어요.');
 else if(opt.restIntervalMinutes!=null&&opt.restIntervalMinutes!=='')warnings.push('저장된 휴식 간격을 확인할 수 없어 기본 관광지 체류시간 60분으로 구성했어요. 조건을 다시 확인해 주세요.');
 if(opt.slopePreference==='avoid_steep')warnings.push('경사 회피 선호가 있지만 실제 경사·계단 없는 동선이 검증되지 않았어요. 방문 전 확인이 필요해요.');
 if(['indoor','outdoor'].includes(opt.indoorPreference))warnings.push('실내외 선호를 선택했지만 장소·이동 구간의 실내외 상태는 검증되지 않았어요.');
 warnings.push('장소 간 이동은 실제 경로 소요시간이 아니라 임시 여유 시간 25분으로 배치했어요. 실제 이동·보행시간은 미확인입니다.');
 warnings.push('모든 방문지의 영업시간·시설 운영·예약 가능 여부는 확인 전이에요.');
 warnings.push('휴식 블록은 휴식 장소가 지정된 상태가 아니에요.');
 if(!foods.length)warnings.push('식당을 선택하지 않아 점심 식사 블록을 임시로 만들었어요.');
 if(opt.tripType==='overnight')warnings.push('현재는 숙박 여행이라도 첫날 일정 초안만 생성해요.');
 return {stops:result,errors,warnings,summary:{start:hbClock(start),end:hbClock(now),sightCount:sights.length,foodSelected:!!foods.length}}
}
/** Fully client-side draft editor; authoritative server editing comes later. */
function hbDraftMinute(time){
 const m=/^([0-2]\d):([0-5]\d)$/.exec(String(time||''));
 if(!m)return null;
 const n=Number(m[1])*60+Number(m[2]);return n<1440?n:null;
}
function hbEditDraftStop(items,index,action,value){
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
  focusIndex=other;
 }else return fail('지원하지 않는 일정 편집 동작이에요.');
 for(let i=0;i<draft.length;i++){
  const stop=draft[i],start=hbDraftMinute(stop.plannedArrival||stop.time),duration=Number(stop.stayMinutes);
  if(start===null||start<540||start>1080)return fail('방문 시간은 오전 9시부터 오후 6시 사이여야 해요.');
  if(!Number.isInteger(duration)||duration<=0||duration>240||start+duration>1080)return fail('체류시간이 오후 6시를 넘거나 유효하지 않아요.');
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
function hbApplyScheduleFromSelection(){
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
 const plan=hbCreateSchedule(selected,places,{start:s.hbPlanStart||'10:00',tripType:s.hbDuration||'day',restIntervalMinutes:s.hbRestIntervalMinutes,slopePreference:s.hbSlopePreference,indoorPreference:s.hbIndoorPreference});
 if(plan.errors.length){alert(plan.errors.join('\n'));return false;}
 if(Array.isArray(s.stops)&&s.stops.some(x=>x.done||x.must||x.reserved||x.booked)){alert('이미 완료·필수·예약 표시가 있는 일정이 있어 자동 재생성할 수 없어요. 기존 일정을 보호하려면 직접 확인하고 수정해 주세요.');return false;}
 if(Array.isArray(s.stops)&&s.stops.length&&!confirm('현재 일정 초안을 새로 구성할까요? 기존 시간표는 변경됩니다.'))return false;
 const previous=s;
 s={...s,stops:plan.stops,hbPlanWarnings:plan.warnings,hbPlanInfo:{...plan.summary,region:s.region,date:s.date,transport:s.hbTransport,createdAt:new Date().toISOString()},hbReplanUndo:null};
 try{save()}catch{ s=previous;alert('초안 저장에 실패했어요. 기존 일정을 유지해요.');return false;}
 go('/plan');return true;
}
function hbPlanViewEnhance(){
 const oldView=plan;
 plan=function(){
  oldView();
  const now=Array.isArray(s.stops)?s.stops:[];
  const choices=['09:00','09:30','10:00','10:30','11:00','11:30'];
  const selection=s.hbPlanStart||'10:00';
  const html='<section class="panel hb-plan-generator"><h2>하루 여행 일정 자동 구성</h2><p>관광지 최대 2곳과 점심·휴식 시간을 배치해요. 이동시간이 검증된 여행 경로가 아니라 <strong>사용자가 확인할 초안</strong>이에요.</p><label for="hb-plan-start">여행 시작 시간</label> <select id="hb-plan-start">'+choices.map(t=>'<option value="'+t+'" '+(t===selection?'selected':'')+'>'+t+'</option>').join('')+'</select> <button type="button" id="hb-plan-regenerate">선택한 장소로 일정 재구성</button>'+(s.hbDuration==='overnight'?'<p class="warn">숙박 여행을 선택했지만 현재는 첫날 하루 일정만 구성돼요.</p>':'')+(s.hbPlanWarnings?.length?'<div class="hb-plan-warnings"><h3>현장 확인 사항</h3><ul>'+s.hbPlanWarnings.map(w=>'<li>'+safe(w)+'</li>').join('')+'</ul></div>':'')+'</section>';
  el.insertAdjacentHTML(now.length?'beforeend':'afterbegin',html);
  const generator=el.querySelector('.hb-plan-generator');
  generator.insertAdjacentHTML('afterbegin','<div class="hb-plan-view-controls" aria-label="일정표 표시 방식"><button type="button" id="hb-large-toggle" class="light" aria-pressed="'+String(!!s.hbLargePlanMode)+'">'+(s.hbLargePlanMode?'일반 글씨로 보기':'부모님 큰 글씨로 보기')+'</button><button type="button" id="hb-print-itinerary" class="light">일정표 인쇄</button></div>');
  document.getElementById('hb-large-toggle').onclick=()=>{s.hbLargePlanMode=!s.hbLargePlanMode;try{save()}catch{alert('글씨 크기 설정을 저장하지 못했어요.');}plan()};
  document.getElementById('hb-print-itinerary').onclick=()=>window.print();
  document.getElementById('hb-plan-start').onchange=e=>{s.hbPlanStart=e.target.value;save()};
  document.getElementById('hb-plan-regenerate').onclick=hbApplyScheduleFromSelection;
  const liveNote=document.createElement('p');
  liveNote.id='hb-plan-edit-feedback';liveNote.className='hb-plan-edit-feedback';
  liveNote.setAttribute('role','status');liveNote.setAttribute('aria-live','polite');
  el.querySelector('.hb-plan-generator').append(liveNote);
  el.querySelector('.hb-plan-generator').insertAdjacentHTML('beforeend','<p class="hb-plan-local-notice">시간과 방문 순서를 직접 수정할 수 있어요. 수정 내용은 <strong>이 기기에만 저장</strong>되며 가족과 자동 동기화되지 않아요. 이동시간은 확인되지 않은 임시 여유 시간이에요.</p>');
  const routeStops=now.filter(stop=>stop.placeId);
  if(routeStops.length>=2){
   generator.insertAdjacentHTML('beforeend','<section><h3>장소 간 이동시간</h3><p>주소가 있는 방문지만 조회해요. 장소 미정 휴식·식사와 교통 상황 변화는 포함되지 않아요.</p><button type="button" class="light" id="hb-route-estimate">자동차 이동시간 확인</button><div id="hb-route-result" role="status"></div></section>');
   const routeButton=document.getElementById('hb-route-estimate');
   routeButton.onclick=async()=>{
    const output=document.getElementById('hb-route-result');
    const transport=s.hbPlanInfo?.transport||s.hbTransport||'car';
    routeButton.disabled=true;
    output.textContent='경로를 확인하고 있어요.';
    try{
     const result=await hbTravelRequest('/api/travel-times',{region:s.hbPlanInfo?.region||s.region,transport:transport==='transit'?'public_transit':transport,stopIds:routeStops.map(stop=>stop.placeId)});
     if(result.status==='provider_disabled'){output.textContent='이 환경에서는 경로 제공 서비스가 연결되지 않았어요.';return;}
     if(result.status==='unsupported_mode'){output.textContent='현재 자동차 경로만 조회할 수 있어요.';return;}
     const names=new Map(routeStops.map(stop=>[stop.placeId,stop.name]));
     const list=document.createElement('ul');
     for(const leg of result.segments){
      const item=document.createElement('li');
      item.textContent=names.get(leg.from)+' → '+names.get(leg.to)+': '+(leg.status==='estimated'?'자동차 약 '+leg.minutes+'분 (네이버 지도)':'이동시간 확인 불가');
      list.append(item);
     }
     output.replaceChildren(list);
    }catch{output.textContent='이동시간을 확인하지 못했어요. 일정표의 임시 여유 시간은 유지돼요.';}
    finally{routeButton.disabled=false;}
   };
  }
  const apply=(index,action,value,input)=>{
   const outcome=hbEditDraftStop(s.stops,index,action,value);
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
   if(stop.kind==='rest'&&stop.isPlaceholder)facts.push('휴식할 실제 위치는 아직 미정');
   if(stop.isPlaceholder&&stop.kind==='food')facts.push('식당 미지정');
   const parent=node.querySelector('.hb-itinerary-flags');
   if(!parent)return;
   parent.insertAdjacentHTML('beforebegin','<p class="hb-plan-meta">'+safe(facts.join(' · '))+'</p>');
   const locked=!!(stop.done||stop.must||stop.reserved||stop.booked);
   if(locked){
    parent.insertAdjacentHTML('beforebegin','<p class="hb-plan-protected">보호 중: 완료·필수·예약 표시를 해제해야 시간과 순서를 수정할 수 있어요.</p>');
    return;
   }
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
  layout.className=s.hbLargePlanMode?'hb-large-plan':'hb-regular-plan';
  layout.setAttribute('aria-label','여행 일정표');
  while(el.firstChild)layout.appendChild(el.firstChild);
  el.appendChild(layout);
  hbRenderPlanMap();
 };
}
hbPlanViewEnhance();
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
    el.innerHTML = '<h1>가족에게 일정 공유</h1><p id="hb-share-error">여행 날짜와 시간, 장소명이 있는 일정을 먼저 준비해 주세요. 일정이 너무 길면 링크로 만들 수 없어요.</p><p><a href="#/plan">내 일정으로 돌아가기</a></p>';
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
    + '<p id="hb-share-copy-status" role="status"></p></div></section><p><a href="#/plan">내 일정으로 돌아가기</a></p>';
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
      + stop.time + '</time> <strong style="overflow-wrap:anywhere">' + safe(stop.name) + '</strong></li>').join('');
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
let geoStarted=false,nearbyMode='위치 확인 중',nearbyItems=[],nearbyCenter=[37.5665,126.978],nearbyUser=false,nearbyLoading=false,nearbyError='',nearFilter='all',leafletPromise=null,nearbyMap=null,nearbyLayer=null,nearbyRequestId=0,featuredPlaces=[],featuredMode=false,featuredLoading=false,featuredError='',featuredRequestId=0;
let nearbyCenterLabel='서울 시청';
function setNearbyStatus(){
  const status=document.getElementById('nearby-status');
  if(!status)return;
  status.setAttribute('role','status');
  status.textContent=nearbyLoading
    ? nearbyMode+' · 실제 관광정보를 확인 중이에요…'
    : nearbyError
      ? nearbyMode+' · '+nearbyError
      : nearbyMode+' · 주변 '+nearbyItems.length+'곳 · 유명 명소 '+featuredPlaces.length+'곳 (별도 선정)';
}
function requestLocation(){
  if(!navigator.geolocation){
    nearbyMode='기기 위치를 사용할 수 없어 서울 시청 중심을 표시해요.';
    fetchNearby(37.5665,126.978,false);
    return;
  }
  const request=++nearbyRequestId;
  ++featuredRequestId;
  nearbyMode='현재 위치 확인 중';
  nearbyError='';
  nearbyLoading=true;
  setNearbyStatus();
  drawNearbyList();
  navigator.geolocation.getCurrentPosition(position=>{
    if(request!==nearbyRequestId)return;
    nearbyMode='내 현재 위치 기준';
    fetchNearby(position.coords.latitude,position.coords.longitude,true);
  },error=>{
    if(request!==nearbyRequestId)return;
    const messages={
      1:'위치 권한이 꺼져 있어 서울 시청 중심을 표시해요.',
      2:'현재 위치를 확인할 수 없어 서울 시청 중심을 표시해요.',
      3:'위치 확인이 오래 걸려 서울 시청 중심을 표시해요.'
    };
    nearbyMode=messages[error.code]||messages[2];
    fetchNearby(37.5665,126.978,false);
  },{enableHighAccuracy:false,timeout:9000,maximumAge:180000});
}
function leaflet(){if(window.L)return Promise.resolve(window.L);if(leafletPromise)return leafletPromise;leafletPromise=new Promise((resolve,reject)=>{let css=document.createElement('link');css.rel='stylesheet';css.href='https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';document.head.appendChild(css);let js=document.createElement('script');js.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';js.integrity='sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';js.crossOrigin='';js.onload=()=>resolve(window.L);js.onerror=()=>reject(Error('지도 라이브러리를 불러올 수 없어'));document.head.appendChild(js)});return leafletPromise}

let naverSdkPromise=null;
let naverSdkAuthFailed=false;
let failNaverLoad=null;
function loadNaverMap(){
  window.navermap_authFailure=()=>{
    naverSdkAuthFailed=true;
    if(failNaverLoad)failNaverLoad();
    else naverSdkPromise=null;
    hbPlanMapView?.failure();
  };
  if(window.naver?.maps?.Map&&!naverSdkAuthFailed)return Promise.resolve(window.naver.maps);
  if(naverSdkPromise)return naverSdkPromise;
  naverSdkPromise=new Promise((resolve,reject)=>{
    naverSdkAuthFailed=false;
    const script=document.createElement('script');
    script.src='https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=YOUR_NAVER_MAP_CLIENT_ID';
    script.async=true;
    const fail=()=>{
      clearTimeout(timer);
      failNaverLoad=null;
      script.remove();
      reject(Error('Map unavailable'));
    };
    const timer=setTimeout(fail,10000);
    failNaverLoad=fail;
    script.onload=()=>{
      if(!window.naver?.maps?.Map||naverSdkAuthFailed){fail();return;}
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
 const view={slot,map:null,markers:[],selected:null};
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
    M.Event.addListener(marker,'click',()=>select(index,true));
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

function hbSearchMapCenter(){
  if(!nearbyMap)return;
  let point;
  try{point=nearbyMap.getCenter()}catch{
    nearbyError='지도 중심 위치를 읽지 못했어요. 서울 중심 보기나 지도 다시 불러오기를 이용해 주세요.';
    setNearbyStatus();
    return;
  }
  const lat=point?.lat?.(),lng=point?.lng?.();
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180){
    nearbyError='지도 중심 위치를 읽지 못했어요. 서울 중심 보기나 지도 다시 불러오기를 이용해 주세요.';
    setNearbyStatus();
    return;
  }
  nearbyMode='현재 지도 중심 기준';
  fetchNearby(lat,lng,false,'지도 중심');
}

function dropNearbyMap(){
  const map=nearbyMap;
  const markers=nearbyLayer||[];
  nearbyMap=null;
  nearbyLayer=null;
  // SDK objects may be partially initialized when the user leaves the map.
  for(const marker of markers){
    try{marker.setMap(null)}catch{}
  }
  try{map?.destroy()}catch{}
}
function renderNearbyMapFailure(host){
  if(!host||document.getElementById('nearby-map')!==host)return;
  host.dataset.mapState='error';
  const searchButton=document.getElementById('hb-search-map-center');
  if(searchButton)searchButton.disabled=true;
  host.innerHTML='<div style="padding:22px;max-width:520px"><p role="status"><strong>지도를 표시할 수 없어요.</strong> 아래의 장소 목록은 계속 이용할 수 있어요.</p><button id="hb-map-retry" type="button" class="light">지도 다시 불러오기</button></div>';
  host.querySelector('button').onclick=()=>{
    host.setAttribute('tabindex','-1');
    host.focus({preventScroll:true});
    mountNearbyMap();
  };
}
function mountNearbyMap(){
  dropNearbyMap();
  const host=document.getElementById('nearby-map');
  if(!host)return;
  const searchButton=document.getElementById('hb-search-map-center');
  if(searchButton)searchButton.disabled=true;
  host.dataset.mapState='loading';
  host.innerHTML='<p role="status" style="padding:22px">네이버 지도를 불러오는 중이에요…</p>';
  loadNaverMap().then(M=>{
    if(document.getElementById('nearby-map')!==host)return;
    host.innerHTML='';
    nearbyMap=new M.Map(host,{center:new M.LatLng(...nearbyCenter),zoom:nearbyUser?15:14,minZoom:10,maxZoom:20,zoomControl:true,zoomControlOptions:{position:M.Position.TOP_RIGHT},scaleControl:true,scrollWheel:false,logoControl:true,mapDataControl:true});
    nearbyLayer=[];
    updateNearbyPins();
    if(nearbyMap){
      host.dataset.mapState='ready';
      if(searchButton)searchButton.disabled=false;
    }
  }).catch(()=>{
    if(document.getElementById('nearby-map')!==host)return;
    dropNearbyMap();
    renderNearbyMapFailure(host);
  });
}
function updateNearbyPins(){
  try{setNearbyPins()}catch{
    const host=document.getElementById('nearby-map');
    dropNearbyMap();
    renderNearbyMapFailure(host);
  }
}
function setNearbyPins(){if(!nearbyMap||!window.naver?.maps)return;let M=window.naver.maps;if(nearbyLayer)for(let x of nearbyLayer)x.setMap(null);nearbyLayer=[];nearbyMap.setCenter(new M.LatLng(nearbyCenter[0],nearbyCenter[1]));nearbyMap.setZoom(nearbyUser?15:14);let self=new M.Marker({map:nearbyMap,position:new M.LatLng(nearbyCenter[0],nearbyCenter[1]),icon:{content:'<div class="hb-current">📍 '+safe(nearbyCenterLabel)+(nearbyUser?'':' 기준')+'</div>',anchor:new M.Point(49,37)},zIndex:999});nearbyLayer.push(self);
let sorted=nearbyItems.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)).sort((a,b)=>a.distanceKm-b.distanceKm);let labels=0;for(let p of sorted){if(featuredMode)continue;let near=p.distanceKm<=1.3&&labels<13;if(near)labels++;let icon=near?'<div class="hb-naver-place '+(p.kind==='food'?'hb-food':'hb-spot')+'">'+(p.kind==='food'?'🍚 ':'🌿 ')+safe(p.name)+'</div>':'<div class="hb-naver-dot '+(p.kind==='food'?'hb-food':'hb-spot')+'"></div>';let m=new M.Marker({map:nearbyMap,position:new M.LatLng(p.lat,p.lng),title:p.name,icon:{content:icon,anchor:new M.Point(near?65:6,near?33:6)},zIndex:near?200-Math.round(p.distanceKm*30):20});nearbyLayer.push(m);let info=new M.InfoWindow({content:'<div style="padding:12px;max-width:260px;color:#284238"><b>'+safe(p.name)+'</b><p style="margin:4px 0;font-size:12px">'+safe(p.address||'주소 없음')+'</p><small>직선거리 '+safe(p.distanceKm)+'km · 실제 보행 동선 미확인 · 한국관광공사 TourAPI</small></div>',borderWidth:0,backgroundColor:'#fff'});M.Event.addListener(m,'click',()=>info.open(nearbyMap,m))}
for(let p of featuredPlaces){let icon='<div class="hb-featured-marker">📍 '+safe(p.name)+'</div>';let marker=new M.Marker({map:nearbyMap,position:new M.LatLng(p.lat,p.lng),title:p.name,icon:{content:icon,anchor:new M.Point(78,36)},zIndex:500});nearbyLayer.push(marker);let win=new M.InfoWindow({content:'<div style="padding:12px;max-width:260px"><b>📍 '+safe(p.name)+'</b><p style="font-size:12px">'+safe(p.address||'주소 없음')+'</p><small>관광공사 정보 · 직선거리 '+safe(p.distanceKm)+'km · 여행 명소 편집 선정, 공식 인기순위 아님</small></div>',borderWidth:0});M.Event.addListener(marker,'click',()=>{win.open(nearbyMap,marker);nearbyMap.panTo(new M.LatLng(p.lat,p.lng))})}}
function showFamousOnMap(){if(!nearbyMap||!window.naver?.maps||!featuredPlaces.length)return;let M=window.naver.maps;let bounds=new M.LatLngBounds();bounds.extend(new M.LatLng(nearbyCenter[0],nearbyCenter[1]));for(let p of featuredPlaces)bounds.extend(new M.LatLng(p.lat,p.lng));nearbyMap.fitBounds(bounds,{top:70,right:45,bottom:60,left:45})}

async function fetchNearby(lat,lng,isUser,centerLabel){let n=++nearbyRequestId;nearbyCenterLabel=centerLabel||(isUser?'내 위치':'서울 시청');nearbyCenter=[lat,lng];nearbyUser=isUser;nearbyLoading=true;nearbyError='';nearbyItems=[];featuredPlaces=[];featuredLoading=true;featuredError='';setNearbyStatus();drawNearbyList();updateNearbyPins();loadFeatured(lat,lng,++featuredRequestId);try{let d=await get('/api/nearby.js?lat='+encodeURIComponent(lat.toFixed(4))+'&lng='+encodeURIComponent(lng.toFixed(4)));if(n!==nearbyRequestId)return;nearbyItems=d.places||[];if(!nearbyItems.length)nearbyError='이 반경에서 조회된 장소가 없어요'}catch(e){if(n!==nearbyRequestId)return;nearbyError='주변 장소를 불러오지 못했어요. 위치를 다시 선택해 주세요.'}finally{if(n===nearbyRequestId){nearbyLoading=false;setNearbyStatus();updateNearbyPins();drawNearbyList()}}}
async function loadFeatured(lat,lng,id){try{let r=await get('/api/featured.js?lat='+encodeURIComponent(lat.toFixed(4))+'&lng='+encodeURIComponent(lng.toFixed(4)));if(id!==featuredRequestId)return;featuredPlaces=r.places||[];featuredError=featuredPlaces.length?'':'근처에서 검증된 유명 명소를 찾지 못했어요'}catch(e){if(id!==featuredRequestId)return;featuredError='대표 관광지 자료를 불러오지 못했어요.'}finally{if(id===featuredRequestId){featuredLoading=false;setNearbyStatus();updateNearbyPins();drawNearbyList()}}}
function drawNearbyList(){let box=document.getElementById('nearby-list');if(!box)return;let sum=document.getElementById('featured-summary');if(sum)sum.textContent=featuredLoading?'📍 주변 대표 관광지를 불러오는 중이에요…':featuredPlaces.length?'📍 대표 관광지 '+featuredPlaces.length+'곳 지도에 표시 · 관광지 편집 선정 (공식 인기순위 아님)':featuredError;let quick=document.getElementById('featured-quicklinks');if(quick){quick.innerHTML=featuredPlaces.map((p,i)=>'<button type="button" class="light hb-famous-chip" data-featured-jump="'+i+'">'+safe(p.name)+'</button>').join('');quick.querySelectorAll('[data-featured-jump]').forEach(b=>b.onclick=()=>{let p=featuredPlaces[Number(b.dataset.featuredJump)];if(!p)return;if(nearbyMap&&window.naver?.maps){nearbyMap.setCenter(new window.naver.maps.LatLng(p.lat,p.lng));nearbyMap.setZoom(15)}document.getElementById('nearby-map')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})})};const filtered=nearFilter==='famous'?featuredPlaces:nearbyItems.filter(p=>nearFilter==='all'||nearFilter==='food'&&p.kind==='food'||nearFilter==='spot'&&p.kind!=='food');if(nearFilter==='famous'&&featuredLoading){box.innerHTML='<p class="muted">유명 관광지를 검색하고 있어요…</p>';return}if(nearFilter!=='famous'&&nearbyLoading){box.innerHTML='<p class="muted">주변 관광지와 식당을 찾고 있어요…</p>';return}if(!filtered.length){box.innerHTML='<p class="muted">'+(nearFilter==='famous'?safe(featuredError||'근처 검증된 유명 관광지를 찾지 못했어요.'):safe(nearbyError||'이 조건에서 검색된 장소가 없어요.'))+'</p>';return}box.innerHTML='<div class="grid">'+filtered.slice(0,30).map(p=>'<div class="card"><span class="chip">'+(p.featured?'⭐ 주요 관광명소':p.kind==='food'?'🍚 음식점':'🌿 관광지')+'</span><h3>'+safe(p.name)+'</h3><p class="muted">'+safe(p.address||'주소 미제공')+'</p><p class="muted">'+safe(nearbyCenterLabel)+'에서 직선거리 '+safe(p.distanceKm)+'km · 보행 거리 및 접근성 미확인</p><div class="actions">'+(p.featured?'<button class="light" data-zoom-featured="'+safe(p.id)+'">지도에서 보기</button>':'')+'<a target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(p.lat+','+p.lng)+'">장소 보기 ↗</a><button class="light" data-near-pick="'+safe(p.id)+'">'+(s.chosen.includes(p.id)?'선택됨':'일정에 담기')+'</button></div></div>').join('')+'</div>';box.querySelectorAll('[data-near-pick]').forEach(b=>b.onclick=()=>{let p=[...featuredPlaces,...nearbyItems].find(v=>v.id===b.dataset.nearPick);if(!p)return;if(!s.chosen.includes(p.id))s.chosen.push(p.id);if(!places.some(v=>v.id===p.id))places.push({...p,hbPickedRegion:s.region,accessFacts:[],accessStatus:'unknown'});save();drawNearbyList()});box.querySelectorAll('[data-zoom-featured]').forEach(b=>b.onclick=()=>{let p=featuredPlaces.find(v=>v.id===b.dataset.zoomFeatured);if(p&&nearbyMap&&window.naver?.maps){nearbyMap.setCenter(new window.naver.maps.LatLng(p.lat,p.lng));nearbyMap.setZoom(16);document.getElementById('nearby-map')?.scrollIntoView({behavior:'smooth',block:'center'})}})}


addEventListener('hashchange',render);render();load()
})();
