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
  const intro=hbDiscoveryPendingMarkup()+'<h1>부모님과 여행 만들기</h1><p class="muted">여행 지역과 이동 조건부터 확인해요. 방문 가능한 동선이 검증됐다는 뜻은 아니에요.</p><ol class="hb-progress" aria-label="여행 만들기 3단계 중 '+step+'단계">'+['여행 정보','이동 조건','선호사항'].map((name,i)=>'<li'+(i+1===step?' aria-current="step"':i+1<step?' class="hb-step-done"':'')+'>'+stepLink(name,i)+'</li>').join('')+'</ol><p id="hb-step-nav-notice" class="hb-step-nav-notice" role="status" aria-live="polite" hidden></p>';
  if(step===1){
    el.innerHTML=intro+'<section class="panel"><h2 tabindex="-1">1. 여행 정보</h2>'+prefs()+(s.hbDateRefreshedFrom?'<p role="status">이전에 저장된 날짜를 오늘로 갱신했어요. 기존 일정의 날짜는 그대로 유지돼요.</p>':'')+'<div class="actions"><button class="light" type="button" id="hb-date-today">오늘</button><button class="light" type="button" id="hb-date-tomorrow">내일</button></div><div class="row hb-trip-time-row">'+hbClockField('hb-trip-start','여행 출발 희망 시각 (선택)',s.hbDepartTime,'집(출발지)에서 출발하는 시각')+hbClockField('hb-trip-end','집 도착 희망 시각 (선택)',s.hbReturnTime,'집(귀가 위치)에 도착하고 싶은 날짜와 시각',true)+'</div><p class="muted" id="hb-trip-time-help">시간을 비워 두면 선택한 장소에 맞춰 시간표 초안을 제안해요. 숫자로 7:30, 0730, 19:05처럼 직접 입력하거나 시계로 고를 수 있고, 새벽·저녁 시간도 가능해요. 출발 시각을 정하면 출발지에서 첫 방문지까지 이동시간을 더해 첫 방문지 도착 시각을 잡아요. 경로를 계산하기 전에는 이동 약 25분 (예상)으로 넣어요.</p>'+((s.hbPlanStart||s.hbPlanEnd)?'<p class="hb-legacy-time-note" role="note">이전에 저장한 첫 방문지 기준 시각('+safe(s.hbPlanStart||'제안')+' ~ '+safe(s.hbPlanEnd||'제안')+')은 그 의미 그대로 유지돼요. 값이 있으면 집 출발·도착 희망 시각보다 우선해요. <button type="button" class="light" id="hb-legacy-time-clear">이전 첫 방문지 시각 지우기</button></p>':'')+hbTripOriginStepMarkup()+'<div class="row"><div class="field"><label for="hb-duration">여행 형태</label><select id="hb-duration"><option value="day">당일 여행</option><option value="overnight">숙박 여행</option></select></div><div class="field"><label for="hb-transport">주요 이동 수단</label><select id="hb-transport"><option value="car">자동차</option><option value="transit">대중교통</option><option value="mixed">상황에 따라 선택</option></select></div><div class="field"><label for="hb-party">동행 인원</label><select id="hb-party"><option value="2">2명</option><option value="3">3명</option><option value="4">4명</option><option value="5">5명</option><option value="6">6명</option><option value="7">7명</option><option value="8">8명</option><option value="9">9명</option><option value="10">10명</option><option value="11">11명</option><option value="12">12명</option></select></div></div><div class="actions"><button type="button" id="hb-next">다음: 이동 조건 →</button></div><p class="muted" id="hb-step-error" role="alert"></p></section>'+(typeof weatherCard==='function'?weatherCard():'');
    hbDiscoveryBindPending(newPlan);bindPrefs();
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
  mobility_aid_unverified:'선택한 보조기구로 이동할 동선은 방문 전에 직접 확인해 주세요.',
  insufficient_evidence:'계단·연속 보행시간·이동 동선은 방문 전에 직접 확인해 주세요.',
  server_not_assessed:'이 장소는 서버 추천 판정 대상에 없어요. 접근성을 별도로 확인해 주세요.',
  local_unverified:'서버 판정 전 임시 목록이에요. 접근성 판정 결과가 아니에요.',
  missing_reason:'서버 판정 근거가 오지 않아 방문 전 확인으로 표시했어요.',
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
  const curation=hbTripCuration(ready?hbTripCandidatePool(s.region):[],s.region,hbTripKeepIds(chosen,s.stops));
  const filtered=ready?hbSearchPlaces(curation.visible,filter,query):[];
  const ranked=filtered.map(p=>({p,e:hbReconcileRecommendation(p,profile,serverState)}))
    .sort((a,b)=>hbDiscoveryPriority(b.p.id,s.region)-hbDiscoveryPriority(a.p.id,s.region)||b.e.score-a.e.score||String(a.p.name||'').localeCompare(String(b.p.name||''),'ko'));
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
    const description=hbRecommendationReasons[e.reason]||hbRecommendationReasons.missing_reason;
    return '<article class="card hb-recommend-card"><div class="hb-card-top"><span class="chip">'+hbPlaceCategory(p)+'</span><span class="hb-recommend-state">'+status+'</span></div>'+
      '<h3>'+safe(p.name)+'</h3>'+(p.address?'<p class="muted">'+safe(p.address)+'</p>':'')+
      '<p class="muted">'+safe(description)+'</p>'+extra+
      (e.scope?'<p>확인 범위: '+safe(e.scope)+'</p>':'')+
      (e.found.length?'<p>관련 편의시설 안내 (동선 검증과 별개): '+safe(e.found.join(', '))+'</p>':'')+
      (hbVisibleGaps(e.gaps).length?'<p class="muted">'+safe(hbVisibleGaps(e.gaps).slice(0,3).join(' · '))+'</p>':'')+
      '<div class="actions"><a class="light" data-hb-info="'+safe(p.id)+'" href="'+safe(hbPlaceDetailPath(p.id))+'">상세 정보</a>'+
      (e.status==='excluded'&&!picked?'':'<button type="button" data-hb-pick="'+safe(p.id)+'" aria-pressed="'+picked+'">'+(picked?'선택 취소':'일정에 담기')+'</button>')+'</div></article>';
  };
  const section=(title,arr,empty='')=>'<section class="hb-result-section"><h2>'+title+' <span class="hb-result-count">'+arr.length+'곳</span></h2>'+
    (arr.length?'<div class="grid">'+arr.slice(0,limited).map(x=>card(x)).join('')+'</div>':'<p class="muted">'+empty+'</p>')+'</section>';
  const noResults=ready&&!ranked.length;
  const results=!ready?'':noResults?
    panel('검색 결과 0건',curation.enabled&&!curation.visible.length&&curation.hidden?'<p>정보가 충분한 장소가 없어 목록을 표시하지 않았어요. 정보가 부족한 장소 '+curation.hidden+'곳은 숨겼어요. 조건을 자동으로 완화하지 않았어요. 다른 지역을 선택해 보세요.</p>':places.length?'<p>현재 검색어·분류에 맞는 장소가 없어요. 조건을 자동으로 완화하지 않았어요.</p>'+(curation.hidden?'<p class="muted">정보가 부족해 숨긴 장소 '+curation.hidden+'곳은 검색에 포함하지 않았어요.</p>':''):'<p>이 지역에서 조회된 장소가 없어요. 다른 지역을 직접 선택해 보세요.</p>'):
    (good.length?section('서버 자료 기준 조건 일치',good):'')+
    (review.length?section('방문 전 확인할 장소',review):'')+
    (excluded.length?'<details class="hb-conflict"><summary>확인된 이동 조건 충돌 '+excluded.length+'곳</summary><div class="grid">'+excluded.slice(0,limited).map(x=>card(x)).join('')+'</div></details>':'')+
    (Math.max(good.length,review.length,excluded.length)>limited?'<button type="button" class="light" id="hb-more">장소 더 보기</button>':'');
  const extraPrefs=[
    s.hbMobilityAid&&s.hbMobilityAid!=='none'?hbMobilityAidLabels[s.hbMobilityAid]:null,
    s.hbSlopePreference==='avoid_steep'?'가파른 경사 피하기 (실제 경사 미검증)':null,
    [30,45,60].includes(Number(s.hbRestIntervalMinutes))?'휴식 간격 '+Number(s.hbRestIntervalMinutes)+'분 (일정 초안)':null,
    s.hbIndoorPreference==='indoor'?'실내 위주':s.hbIndoorPreference==='outdoor'?'야외 위주':null
  ].filter(Boolean);
  const stairs={impossible:'이용 불가',avoid:'피하기',possible:'이용 가능'}[s.hbStairsChoice]||'선택해 주세요';
  const foodNote=foodUnsupported?'<p class="warn" role="status">선택한 음식 선호는 식당 자동 필터에 반영하지 않아요. 방문 전 식당 메뉴를 직접 확인해 주세요.</p>':
    foodPrefs.length?'<p class="muted">서버가 음식 선호 반영을 보고했어요. 실제 메뉴는 방문 전 확인해 주세요.</p>':'';
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
  const serverStatus=!ready?'장소 자료 조회 대기':
    travel.errors.length?'이동 조건을 입력하면 서버 판정을 확인할 수 있어요. '+safe(travel.errors.join(' ')):
    serverState?.state==='loading'?'서버에서 이동 조건을 확인하고 있어요. 조회 전 목록은 모두 임시 참고용이에요.':
    serverState?.state==='error'?'서버 추천 API 오류 · 임시 장소 목록만 표시합니다. 확정 적합 판정은 제공하지 않아요.':
    serverState?.state==='ready'?'서버 추천 판정: 조건 일치 '+[...serverState.result.byId.values()].filter(x=>x.status==='eligible').length+
      '곳 · 방문 전 확인 '+[...serverState.result.byId.values()].filter(x=>x.status==='needsReview').length+
      '곳 · 조건 충돌 '+[...serverState.result.byId.values()].filter(x=>x.status==='excluded').length+'곳.':
    '이동 조건 확인 대기';
  const serverZero=serverState?.state==='ready'&&serverState.result.byId.size===0;
  const seasonalView=hbSeasonalView({ready,profile,serverState,chosen,pool:curation.visible});
  const tripSummary=hbTripResultSummary({ready,curation,good,review,excluded,serverState,travel});
  const retry=serverState?.state==='error'?'<button type="button" id="hb-recommend-retry" class="light">서버 추천 다시 확인</button>':'';
  el.innerHTML='<h1>여행 장소 찾기</h1>'+hbDiscoveryPendingMarkup()+prefs()+
    '<div class="hb-profile-summary"><strong>여행 조건</strong><p>'+safe(s.date)+' · '+safe(s.hbPlanStart||'시작 제안받기')+' ~ '+safe(s.hbPlanEnd||'종료 제안받기')+'</p><p>걷기 '+safe(s.hbWalkConfirmed?s.walk+'분':'선택해 주세요')+' · 계단 '+safe(stairs)+
    (extraPrefs.length?' · '+safe(extraPrefs.join(' / ')):'')+'</p><button type="button" class="light" id="hb-edit-profile">조건 수정</button></div>'+tray+
    '<section class="panel"><h2>이동 조건 추천 판정</h2><p id="hb-recommend-status" role="'+(serverState?.state==='error'?'alert':'status')+'">'+serverStatus+'</p>'+retry+
    (serverZero?'<p class="muted">서버 추천 결과 0건이에요. 아래에 서버에서 판정하지 않은 장소가 있더라도 조건 일치로 간주하지 않아요.</p>':'')+
    tripSummary+hbTripQuickConditions()+
    '<p class="muted">현장 동선·영업시간·실제 보행 거리는 별도로 확인해 주세요.</p></section>'+
    hbSeasonalMarkup(seasonalView)+
    (typeof weatherCard==='function'?weatherCard():'')+
    '<form class="row" role="search" id="hb-browse-search"><div class="field"><label for="hb-place-search">장소 이름 또는 주소</label><input type="search" id="hb-place-search" maxlength="100" value="'+safe(query)+'"></div>'+
    '<button type="submit" id="hb-place-search-submit">검색</button>'+(query?'<button type="button" class="light" id="hb-search-reset">검색 지우기</button>':'')+'</form>'+
    '<div class="hb-filter-bar" role="group" aria-label="장소 필터">'+[['all','전체'],['spot','관광지'],['culture','문화시설'],['food','식당'],['access','편의시설 안내 있음']].map(([id,label])=>
    '<button type="button" data-hb-filter="'+id+'" class="light '+(filter===id?'hb-filter-active':'')+'" aria-pressed="'+String(filter===id)+'">'+label+'</button>').join('')+'</div>'+
    '<p class="muted">조건을 자동으로 완화해 추천하지 않아요. 편의시설 존재만으로 휠체어 동선을 보장하지 않아요.</p>'+foodNote+
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
  return e.status==='eligible'?'서버 기준 조건 일치':e.status==='excluded'?'이동 조건 충돌':e.reason==='conflicting_evidence'||e.conflict?'자료 상충 · 확인 필요':'접근성 확인 필요';
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
function hbSeasonalView({ready,profile,serverState,chosen,pool}){
  const season=hbTravelSeason(s.date);
  const region=s.region;
  if(!ready)return {season,region,ready:false,courses:[],rows:{shown:[],excluded:[]},hidden:0,featured:null};
  const evaluate=p=>hbReconcileRecommendation(p,profile,serverState);
  const rows=hbSeasonalPlaces(pool,season.season,region,evaluate);
  const editorial=hbSeasonalEditorialCourses(season.season,region,pool,evaluate);
  const courses=[...editorial.filter(c=>c.complete),...hbSeasonalComposedCourses(rows.shown,editorial)];
  return {season,region,ready:true,courses,rows,hidden:editorial.filter(c=>!c.complete).length,
    featured:hbSeasonalFeatured.get(region)?.state||null,chosen};
}
function hbSeasonalMarkup(view){
  const {season}=view;
  const theme=hbSeasonalThemes[season.season];
  const basis=season.basis==='travel_date'?'여행 날짜 '+safe(season.date)+' 기준 '+safe(season.label)+'이에요':
    '여행 날짜를 확인할 수 없어 오늘('+safe(season.date)+', 서울 기준) 계절인 '+safe(season.label)+'로 보여 드려요';
  const head='<section class="panel hb-seasonal" aria-labelledby="hb-seasonal-title"><h2 id="hb-seasonal-title">'+safe(season.label)+' 여행 추천 · 이동 조건 반영</h2>'+
    '<p class="hb-seasonal-basis">'+basis+' (서울 시간대 · 3~5월 봄, 6~8월 여름, 9~11월 가을, 12~2월 겨울).</p>'+
    '<p class="muted">'+safe(season.label)+' 편집 테마: '+safe(theme.idea)+'. 함께봄 편집 테마예요. 개화·행사·운영 시간과 날씨는 방문 전에 확인해 주세요.</p>';
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
      '<p class="hb-seasonal-summary">조건 일치 '+counts.eligible+' · 확인 필요 '+counts.needsReview+' · 조건 충돌 '+counts.excluded+'</p>'+
      '<'+List+' class="hb-seasonal-stops">'+c.stops.map(({p,e})=>'<li><a data-hb-season-open="'+safe(p.id)+'" href="'+safe(hbPlaceDetailPath(p.id))+'">'+safe(p.name)+'</a> <span class="hb-recommend-state">'+safe(hbRecommendationStatusText(e))+'</span>'+
        (e.status==='excluded'?' <span class="muted">이 장소는 담지 않아요.</span>':hbVisibleGaps(e.gaps).length?' <span class="muted">'+safe(hbVisibleGaps(e.gaps)[0])+'</span>':'')+'</li>').join('')+'</'+List+'>'+
      (counts.excluded?'<p class="warn">확인된 이동 조건 충돌 장소가 포함돼 있어요. 충돌 장소는 담기에서 빠져요.</p>':'')+
      '<p class="muted">장소 간 이동시간·경로·보행 난이도는 계산하지 않았어요. 일정 만들기에서 확인해 주세요. 보행 안전을 보장하지 않아요.</p>'+
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
    (shown.length?'<div class="grid">'+shown.map(row=>hbSeasonalPlaceCard(row,chosen)).join('')+'</div>'+
      (view.rows.shown.length>shown.length?'<p class="muted">나머지 '+(view.rows.shown.length-shown.length)+'곳은 아래 전체 목록에서 확인할 수 있어요.</p>':''):
      '<p>이 지역 조회 자료에서 '+safe(season.label)+' 테마와 맞는 장소를 찾지 못했어요. 조건을 자동으로 완화하지 않았어요. 아래 전체 목록에서 직접 확인해 주세요.</p>')+
    (view.rows.excluded.length?'<p class="muted">확인된 이동 조건 충돌로 계절 추천에서 제외한 장소 '+view.rows.excluded.length+'곳</p>':'');
  return head+courses+placesMarkup+'<p role="status" id="hb-seasonal-status">'+safe(hbSeasonalMessage)+'</p>'+
    '<p class="muted">‘방문 전 확인’ 장소는 계단·연속 보행시간·동선을 방문 전에 직접 확인해 주세요. 이동 안전을 보장하지 않아요.</p></section>';
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
function hbSeasonalPlaceCard({p,e,basis},chosen){
  const picked=chosen.includes(p.id);
  return '<article class="card hb-seasonal-card"><div class="hb-card-top"><span class="chip">'+hbPlaceCategory(p)+'</span><span class="hb-recommend-state">'+safe(hbRecommendationStatusText(e))+'</span></div>'+
    '<h3>'+safe(p.name)+'</h3>'+(p.address?'<p class="muted">'+safe(p.address)+'</p>':'')+
    '<p class="hb-seasonal-tag">계절 근거: '+safe(hbSeasonalBasisLabels[basis])+'</p>'+
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
  if(!ready)return '<p class="muted">장소 자료를 불러오면 이동 조건을 반영한 추천 결과를 보여 드려요. 자료 상태는 위 안내를 확인해 주세요.</p>';
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
    parts.push('<p class="hb-trip-result-line"><strong>걷기 '+safe(walk)+' · 계단 '+safe(stairs)+' 조건 결과</strong>: 조건 일치 '+good.length+'곳 · 방문 전 확인 '+review.length+'곳 · 조건 충돌 '+excluded.length+'곳</p>');
    if(serverState?.state==='ready'&&!good.length){
      parts.push(review.length?
        '<p class="muted">선택한 조건을 검증된 동선 자료로 확인한 장소가 아직 없어 후보가 모두 ‘방문 전 확인’으로 표시돼요. 걷기 시간을 늘려도 동선 검증 자료가 없으면 결과는 같아요. 상세 정보의 시설 안내를 확인하거나 방문 전 장소에 문의해 주세요.</p>':
        '<p class="warn">모든 후보가 확인된 이동 조건과 충돌해요. 아래에서 계단 조건을 ‘가능하면 피하기’ 또는 ‘이용 가능’으로 바꾸거나 다른 지역을 선택해 보세요.</p>');
    }
  }
  return '<div class="hb-trip-summary">'+parts.join('')+'</div>';
}
function hbTripQuickConditions(){
  const walk=s.hbWalkConfirmed?String(s.walk):null;
  const chip=(key,id,label,current)=>'<button type="button" class="hb-choice '+(current===id?'chosen':'')+'" data-hb-quick-'+key+'="'+id+'" aria-pressed="'+String(current===id)+'">'+safe(label)+'</button>';
  return '<div class="hb-quick-conditions" role="group" aria-labelledby="hb-quick-title"><h3 id="hb-quick-title">이동 조건 바로 바꾸기</h3><p class="muted">바꾸면 서버 판정과 계절 추천을 다시 계산해요.</p>'+
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
  return (Array.isArray(gaps)?gaps:[]).filter(x=>typeof x==='string'&&!/미확인|미지원|미선택|자료\s*없음|확인되지\s*않|확인\s*안\s*됨/.test(x));
}
// END HB_TRIP_DATA_CURATION
