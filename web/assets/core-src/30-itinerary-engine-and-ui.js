function hbClock(n){const h=Math.floor(n/60),m=n%60;return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')}
function hbMapCoordinates(location){
 if(!location||location.lat==null||location.lng==null)return null;
 const {lat,lng}=location;
 if(![lat,lng].every(value=>typeof value==='number'||typeof value==='string'&&value.trim()))return null;
 const pair={lat:Number(lat),lng:Number(lng)};
 return Number.isFinite(pair.lat)&&Math.abs(pair.lat)<=90&&Number.isFinite(pair.lng)&&Math.abs(pair.lng)<=180&&
  (pair.lat!==0||pair.lng!==0)?pair:null;
}
const HB_PLAN_TRAVEL_NOTE='장소 사이 이동시간은 임시로 25분씩 잡았어요. 아래 \'자동차 이동시간 확인\'으로 실제 시간을 볼 수 있어요.';
const HB_PLAN_HOURS_NOTE='영업시간·휴무일·예약 여부는 방문 전에 확인해 주세요.';
// Plans saved before the wording cleanup still carry the old warning text.
function hbPlanCheckList(warnings){
 const legacy=[
  [/^장소 간 이동은 실제 경로/,HB_PLAN_TRAVEL_NOTE],[/^모든 방문지의 영업시간/,HB_PLAN_HOURS_NOTE],
  [/^휴식 블록은 휴식 장소가/,null],[/^식당을 선택하지 않아/,null]
 ];
 const out=[];
 for(const text of Array.isArray(warnings)?warnings:[]){
  if(typeof text!=='string')continue;
  const hit=legacy.find(([pattern])=>pattern.test(text));
  const value=hit?hit[1]:text;
  if(value&&!out.includes(value))out.push(value);
 }
 return out;
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
 // Only items the user can act on. "장소 미정" rest/lunch blocks already say so on
 // the itinerary row, so they are not repeated here.
 if(restInterval)warnings.push('휴식 간격 '+restInterval+'분에 맞춰 관광지 체류시간을 '+sightStay+'분으로 잡고, 방문 뒤 휴식을 넣었어요.');
 else if(opt.restIntervalMinutes!=null&&opt.restIntervalMinutes!=='')warnings.push('저장된 휴식 간격을 확인할 수 없어 관광지 체류시간을 기본 60분으로 잡았어요. 여행 조건을 다시 확인해 주세요.');
 if(opt.slopePreference==='avoid_steep')warnings.push('가파른 경사를 피하도록 선택했지만, 경사·계단 없는 동선은 아직 확인되지 않았어요.');
 if(['indoor','outdoor'].includes(opt.indoorPreference))warnings.push('실내·야외 여부는 장소마다 아직 확인되지 않았어요.');
 warnings.push(HB_PLAN_TRAVEL_NOTE);
 warnings.push(HB_PLAN_HOURS_NOTE);
 if(opt.tripType==='overnight')warnings.push('숙박 여행은 현재 첫날 일정만 만들어요.');
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
let hbPlanEditMode=false,hbPlanChecksOpen=false;
function hbPlanViewEnhance(){
 const oldView=plan;
 plan=function(){
  oldView();
  const now=Array.isArray(s.stops)?s.stops:[];
  const choices=['09:00','09:30','10:00','10:30','11:00','11:30'];
  const selection=s.hbPlanStart||'10:00';
  const checks=hbPlanCheckList(s.hbPlanWarnings);
  // Page order: title → settings toolbar → one grouped check list → itinerary
  // → main actions → travel times → map → weather. Built from existing nodes
  // at the end so every handler attached by the base view survives.
  const toolbar='<section class="hb-plan-generator" aria-label="일정 설정">'+
   '<div class="hb-plan-view-controls" role="group" aria-label="일정표 표시 방식">'+
    (now.length?'<button type="button" id="hb-edit-toggle" class="light" aria-pressed="'+String(hbPlanEditMode)+'">'+(hbPlanEditMode?'편집 끝내기':'일정 편집')+'</button>':'')+
    '<button type="button" id="hb-large-toggle" class="light" aria-pressed="'+String(!!s.hbLargePlanMode)+'">'+(s.hbLargePlanMode?'일반 글씨로 보기':'부모님 큰 글씨로 보기')+'</button>'+
    '<button type="button" id="hb-print-itinerary" class="light">일정표 인쇄</button></div>'+
   '<div class="hb-plan-regen"><div class="field"><label for="hb-plan-start">여행 시작 시간</label><select id="hb-plan-start">'+choices.map(t=>'<option value="'+t+'" '+(t===selection?'selected':'')+'>'+t+'</option>').join('')+'</select></div>'+
    '<button type="button" id="hb-plan-regenerate">선택한 장소로 일정 다시 만들기</button></div>'+
   '<p class="hb-plan-local-notice">관광지 최대 2곳과 점심·휴식을 배치한 초안이에요. 수정 내용은 이 기기에만 저장되고 가족과 자동으로 동기화되지 않아요.</p>'+
   '<p id="hb-plan-edit-feedback" class="hb-plan-edit-feedback" role="status" aria-live="polite"></p></section>';
  const checkHtml=checks.length?'<details class="hb-plan-warnings"'+(hbPlanChecksOpen?' open':'')+'><summary>방문 전 확인할 점 <span class="hb-plan-check-count">'+checks.length+'개</span></summary><ul>'+
   checks.map(w=>'<li>'+safe(w)+'</li>').join('')+'</ul></details>':'';
  const routeStops=now.filter(stop=>stop.placeId);
  const routeHtml=routeStops.length>=2?'<section class="panel hb-plan-route" aria-labelledby="hb-plan-route-title"><h2 id="hb-plan-route-title">장소 간 이동시간</h2><p class="muted">주소가 있는 방문지 사이의 자동차 이동시간만 조회해요.</p><button type="button" class="light" id="hb-route-estimate">자동차 이동시간 확인</button><div id="hb-route-result" role="status"></div></section>':'';
  const h1=el.querySelector(':scope > h1'),dateLine=h1?.nextElementSibling;
  const mapSlot=document.getElementById('hb-plan-map-slot');
  const weather=el.querySelector(':scope > .hb-weather-card');
  const actions=el.querySelector(':scope > .actions');
  const content=[...el.children].filter(node=>node!==h1&&node!==dateLine&&node!==mapSlot&&node!==weather&&node!==actions);
  const frag=document.createElement('template');
  frag.innerHTML=toolbar+checkHtml+routeHtml;
  const [toolbarNode,...rest]=[...frag.content.children];
  const checkNode=rest.find(n=>n.matches('.hb-plan-warnings'));
  const routeNode=rest.find(n=>n.matches('.hb-plan-route'));
  el.replaceChildren(...[h1,dateLine,toolbarNode,checkNode,...content,actions,routeNode,mapSlot,weather].filter(Boolean));
  checkNode?.addEventListener('toggle',()=>{hbPlanChecksOpen=checkNode.open});
  document.getElementById('hb-edit-toggle')?.addEventListener('click',()=>{hbPlanEditMode=!hbPlanEditMode;plan();document.getElementById('hb-edit-toggle')?.focus()});
  document.getElementById('hb-large-toggle').onclick=()=>{s.hbLargePlanMode=!s.hbLargePlanMode;try{save()}catch{alert('글씨 크기 설정을 저장하지 못했어요.');}plan()};
  // Closed <details> content does not print, so open the check list first.
  document.getElementById('hb-print-itinerary').onclick=()=>{if(checkNode)checkNode.open=true;window.print()};
  document.getElementById('hb-plan-start').onchange=e=>{s.hbPlanStart=e.target.value;save()};
  document.getElementById('hb-plan-regenerate').onclick=hbApplyScheduleFromSelection;
  const liveNote=document.getElementById('hb-plan-edit-feedback');
  if(routeNode){
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
   const facts=[(stop.kind==='rest'?'휴식 ':'머무는 시간 ')+(Number(stop.stayMinutes)||'?')+'분'];
   if(stop.travelTimeStatus==='unknown'&&stop.transitionBufferMinutes)facts.push('이동 여유 '+stop.transitionBufferMinutes+'분 (임시)');
   const parent=node.querySelector('.hb-itinerary-flags');
   if(!parent)return;
   parent.insertAdjacentHTML('beforebegin','<p class="hb-plan-meta">'+safe(facts.join(' · '))+'</p>');
   // Delete and the time/order editor only show in edit mode, so the default
   // view is a calm, readable timetable.
   if(!hbPlanEditMode){node.querySelector('[data-remove]')?.remove();return;}
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
  layout.className=(s.hbLargePlanMode?'hb-large-plan':'hb-regular-plan')+(hbPlanEditMode?' hb-plan-editing':'');
  layout.setAttribute('aria-label','여행 일정표');
  while(el.firstChild)layout.appendChild(el.firstChild);
  el.appendChild(layout);
  hbRenderPlanMap();
 };
}
hbPlanViewEnhance();
