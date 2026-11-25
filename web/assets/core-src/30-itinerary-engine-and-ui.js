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
