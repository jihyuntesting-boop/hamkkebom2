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
  const intro=hbDiscoveryPendingMarkup()+'<h1>부모님과 여행 만들기</h1><p class="muted">여행 지역과 이동 조건부터 확인해요. 방문 가능한 동선이 검증됐다는 뜻은 아니에요.</p><ol class="hb-progress" aria-label="여행 만들기 3단계 중 '+step+'단계">'+['여행 정보','이동 조건','선호사항'].map((name,i)=>'<li'+(i+1===step?' aria-current="step"':i+1<step?' class="hb-step-done"':'')+'><span class="hb-step-num" aria-hidden="true">'+(i+1)+'</span>'+name+'</li>').join('')+'</ol>';
  if(step===1){
    el.innerHTML=intro+'<section class="panel"><h2 tabindex="-1">1. 여행 정보</h2>'+prefs()+(s.hbDateRefreshedFrom?'<p role="status">이전에 저장된 날짜를 오늘로 갱신했어요. 기존 일정의 날짜는 그대로 유지돼요.</p>':'')+'<div class="actions"><button class="light" type="button" id="hb-date-today">오늘</button><button class="light" type="button" id="hb-date-tomorrow">내일</button></div><div class="row"><div class="field"><label for="hb-trip-start">첫 방문지 시작 희망 시간 (선택)</label><input type="time" id="hb-trip-start" value="'+safe(s.hbPlanStart??'')+'"></div><div class="field"><label for="hb-trip-end">일정 종료 희망 시간 (선택)</label><input type="time" id="hb-trip-end" value="'+safe(s.hbPlanEnd??'')+'"></div></div><p class="muted">시간을 비워 두면 선택한 장소에 맞춰 시간표 초안을 제안해요. 직접 입력하면 새벽·저녁 시간도 가능해요. 첫 방문지 기준이며 집에서 출발·귀가하는 이동시간은 아직 계산하지 않아요.</p><div class="row"><div class="field"><label for="hb-duration">여행 형태</label><select id="hb-duration"><option value="day">당일 여행</option><option value="overnight">숙박 여행</option></select></div><div class="field"><label for="hb-transport">주요 이동 수단</label><select id="hb-transport"><option value="car">자동차</option><option value="transit">대중교통</option><option value="mixed">상황에 따라 선택</option></select></div><div class="field"><label for="hb-party">동행 인원</label><select id="hb-party"><option value="2">2명</option><option value="3">3명</option><option value="4">4명</option><option value="5">5명</option><option value="6">6명</option><option value="7">7명</option><option value="8">8명</option><option value="9">9명</option><option value="10">10명</option><option value="11">11명</option><option value="12">12명</option></select></div></div><div class="actions"><button type="button" id="hb-next">다음: 이동 조건 →</button></div><p class="muted" id="hb-step-error" role="alert"></p></section>'+(typeof weatherCard==='function'?weatherCard():'');
    hbDiscoveryBindPending(newPlan);bindPrefs();
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
  const extraMarkup='<h3>식사 선호 (선택)</h3><p class="muted">식사 선호는 현재 식당 자동 필터로 적용되지 않아요. 식당 방문 전에 메뉴를 확인해 주세요.</p><div class="hb-choice-grid">'+foodOptions.map(([id,label])=>'<button type="button" class="hb-choice '+(s.hbFoodPreferences.includes(id)?'chosen':'')+'" data-hb-food="'+id+'" aria-pressed="'+String(s.hbFoodPreferences.includes(id))+'">'+safe(label)+'</button>').join('')+'</div>';
  el.innerHTML=intro+'<section class="panel"><h2 tabindex="-1">3. 선호사항</h2><p class="muted">편의시설 정보는 확인된 자료 범위 안에서 참고할 수 있어요. 추가 선택은 선택사항이에요.</p>'+mobilityMarkup+'<h3>어떤 장소를 먼저 볼까요?</h3><div class="hb-choice-grid">'+card([['all','관광지와 식당 모두'],['spot','관광지·문화시설'],['food','식당']], 'interest',s.hbInterest||'all')+'</div><h3>중요한 편의시설이 있나요?</h3><div class="hb-choice-grid">'+needs.map(([id,name])=>'<button type="button" class="hb-choice '+(s.momNeeds.includes(id)?'chosen':'')+'" data-hb-need="'+id+'" aria-pressed="'+String(s.momNeeds.includes(id))+'">'+safe(name)+'</button>').join('')+'</div>'+optionalMarkup+extraMarkup+'<div class="actions">'+prev+'<button type="button" id="hb-finish">이 조건으로 장소 살펴보기 →</button></div><p class="muted">추천 목록의 ‘확인 필요’ 장소는 안전·접근성이 검증된 곳이 아니에요.</p><p id="hb-finish-error" role="alert" class="warn"></p></section>';
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
    .sort((a,b)=>hbDiscoveryPriority(b.p.id,s.region)-hbDiscoveryPriority(a.p.id,s.region)||b.e.score-a.e.score||String(a.p.name||'').localeCompare(String(b.p.name||''),'ko'));
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
  el.innerHTML='<h1>여행 장소 찾기</h1>'+hbDiscoveryPendingMarkup()+prefs()+
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
