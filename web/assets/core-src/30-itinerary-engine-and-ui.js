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
/** Home departure = first arrival − verified leg; return = schedule end + verified leg.
 * Without a verified leg the time is 'unknown' — the 25-minute buffer is never used here. */
function hbTripEndpointTimes(items,state={}){
 const anchors=hbTripEndpointAnchors(items),origin=state.origin||null;
 const returnTo=state.returnMode==='none'?null:state.returnMode==='other'?state.returnTo||null:origin;
 const key=hbTripEndpointKey(origin,returnTo,anchors);
 const saved=state.result&&state.result.key===key&&Array.isArray(state.result.legs)?state.result.legs:[];
 const side=(kind,point,anchor)=>{
  if(state.returnMode==='none'&&kind==='return')return {status:'not_requested'};
  if(!point)return {status:'no_point'};
  if(!anchor)return {status:'no_anchor'};
  if(!hbTripPointRoutable(point))return {status:'unknown',reason:'invalid_coordinates'};
  const base=kind==='departure'?anchor.arrival:anchor.scheduleEnd;
  if(base===null||base===undefined)return {status:'unknown',reason:'invalid_schedule'};
  const leg=saved.find(l=>l.kind===kind&&l.stopId===anchor.placeId);
  if(state.result&&state.result.key!==key)return {status:'stale'};
  if(!leg)return {status:'unchecked'};
  if(leg.status!=='estimated')return {status:'unknown',reason:leg.reason||null,diagnostic:leg.diagnostic||null};
  const minute=kind==='departure'?base-leg.minutes:base+leg.minutes;
  return {status:'estimated',minutes:leg.minutes,checkedAt:leg.checkedAt,...hbDayClock(minute)};
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
 if(side.status==='estimated'){
  const basis=kind==='departure'?(anchors.first?.name||'첫 방문지')+' 도착 시각 기준':'일정 종료 후 '+(anchors.last?.name||'마지막 방문지')+'에서 출발 기준';
  return what+': '+side.label+' ('+basis+' · 네이버 자동차 경로 약 '+side.minutes+'분'+(side.checkedAt?' · 조회 '+side.checkedAt:'')+')';
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
const HB_HOME_PLACEHOLDER_MINUTES=25;
function hbHomeWindow(opt={}){
 const text=v=>typeof v==='string'?v.trim():'';
 const planStart=text(opt.planStart),planEnd=text(opt.planEnd),depart=text(opt.depart),back=text(opt.returnTime);
 const errors=[],warnings=[];
 if(planStart||planEnd){
  if(depart||back)warnings.push('일정표에서 정한 첫 방문지 시작·종료 희망 시각이 있어 집 출발·도착 희망 시각 대신 사용했어요.');
  return {start:planStart,end:planEnd,errors,warnings,source:'first_visit',homeDeparture:null,homeReturn:null};
 }
 const originNote=opt.originSet?'"집 출발·귀가 시간 확인"을 누르면 실제 자동차 이동시간으로 맞출 수 있어요.':'출발지를 입력하면 이동시간을 계산해요.';
 let start='',end='',homeDeparture=null,homeReturn=null;
 if(depart){
  const minute=hbDraftMinute(depart);
  if(minute===null)errors.push('집 출발 희망 시각을 다시 확인해 주세요.');
  else if(minute+HB_HOME_PLACEHOLDER_MINUTES>=1440)errors.push('집 출발 희망 시각에 이동시간을 더하면 자정을 넘어요. 출발 시각을 앞당겨 주세요.');
  else{
   start=hbClock(minute+HB_HOME_PLACEHOLDER_MINUTES);
   homeDeparture={time:hbClock(minute),basis:'placeholder',bufferMinutes:HB_HOME_PLACEHOLDER_MINUTES,originSet:!!opt.originSet};
   warnings.push('집 출발 희망 '+hbClock(minute)+' 기준으로 첫 방문지 도착을 '+start+'로 잡았어요 (이동 약 '+HB_HOME_PLACEHOLDER_MINUTES+'분, 예상). '+originNote);
  }
 }
 const returnDay=Number.isInteger(opt.returnDay)&&opt.returnDay>0?opt.returnDay:0;
 if(back&&returnDay){
  const minute=hbDraftMinute(back);
  if(minute===null)errors.push('집 도착 희망 시각을 다시 확인해 주세요.');
  else{
   homeReturn={time:hbClock(minute),dayOffset:returnDay,basis:'placeholder',bufferMinutes:HB_HOME_PLACEHOLDER_MINUTES};
   warnings.push('집 도착 희망이 '+(returnDay===1?'다음 날':(returnDay+1)+'일차')+' '+hbClock(minute)+'이라 첫날 일정은 종료 제한 없이 구성했어요. 현재는 첫날 일정만 만들어요.');
  }
 }else if(back){
  const minute=hbDraftMinute(back);
  if(minute===null)errors.push('집 도착 희망 시각을 다시 확인해 주세요.');
  else if(minute-HB_HOME_PLACEHOLDER_MINUTES<=0)errors.push('집 도착 희망 시각이 너무 일러 일정을 넣을 수 없어요. 자정을 넘겨 도착하려면 집 도착 날짜를 다음 날로 골라 주세요.');
  else{
   end=hbClock(minute-HB_HOME_PLACEHOLDER_MINUTES);
   homeReturn={time:hbClock(minute),dayOffset:0,basis:'placeholder',bufferMinutes:HB_HOME_PLACEHOLDER_MINUTES};
   warnings.push('집 도착 희망 '+hbClock(minute)+'에 맞춰 일정이 '+end+'까지 끝나도록 했어요 (귀가 이동 약 '+HB_HOME_PLACEHOLDER_MINUTES+'분, 예상).');
  }
 }
 if(start&&end&&hbDraftMinute(start)>=hbDraftMinute(end))errors.push('집 출발과 집 도착 희망 시각 사이에 이동 여유를 빼면 일정을 넣을 시간이 없어요. 시간을 늘려 주세요.');
 return {start,end,errors,warnings,source:depart||back?'home':'automatic',homeDeparture,homeReturn};
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
function hbVisiblePlanWarnings(list,someConfirmed=false){
 const hidden=/미확인|확인 전이에요|검증되지 않았|확인되지 않|지정된 상태가 아니에요|여전히 미확인/;
 return (Array.isArray(list)?list:[]).filter(w=>typeof w==='string').map(w=>
  w.startsWith('장소 간 이동은 실제 경로 소요시간이 아니라')||w===HB_PLACEHOLDER_TRAVEL_NOTE?
   (someConfirmed?'일부 자동차 이동시간을 네이버 경로로 반영했어요. 나머지 이동시간은 예상이에요.':HB_PLACEHOLDER_TRAVEL_NOTE):w)
  .filter(w=>!hidden.test(w));
}
function hbApplyScheduleFromSelection(){
 const beforeRefresh=s;
 s=hbRefreshAutomaticDate(s);
 if(s!==beforeRefresh){s.hbStep=1;go('/new');return false;}
 const dateError=hbTravelDateError(s.date);
 if(dateError){alert(dateError);s.hbStep=1;go('/new');return false;}
 const timeIssues=[...hbTimeInputErrors(s.hbPlanStart??'',s.hbPlanEnd??''),...hbHomeTimeErrors(s.hbDepartTime??'',s.hbReturnTime??'',s.hbReturnDay??0,s.hbDuration||'day')];
 if(timeIssues.length){alert(timeIssues.join(' '));return false;}
 const home=hbHomeWindow({planStart:s.hbPlanStart,planEnd:s.hbPlanEnd,depart:s.hbDepartTime,returnTime:s.hbReturnTime,returnDay:Number(s.hbReturnDay)||0,originSet:!!hbTripEndpointState().origin});
 if(home.errors.length){alert(home.errors.join(' '));return false;}
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
 const plan=hbCreateSchedule(selected,places,{start:home.start,end:home.end,tripType:s.hbDuration||'day',restIntervalMinutes:s.hbRestIntervalMinutes,slopePreference:s.hbSlopePreference,indoorPreference:s.hbIndoorPreference});
 if(plan.errors.length){alert(plan.errors.join('\n'));return false;}
 plan.warnings.unshift(...home.warnings);
 // A first-visit start derived from the home departure is not a user window.
 if(home.homeDeparture)plan.summary.windowStart=null;
 if(typeof hbWeatherRecommendation==='function'&&typeof forecast!=='undefined'){
  const weatherChoice=hbWeatherRecommendation(forecast,JSON.stringify([s.region,s.date]));
  if(['caution','adverse'].includes(weatherChoice.kind))plan.warnings.unshift(weatherChoice.message);
 }
 if(Array.isArray(s.stops)&&s.stops.some(x=>x.done||x.must||x.reserved||x.booked)){alert('이미 완료·필수·예약 표시가 있는 일정이 있어 자동 재생성할 수 없어요. 기존 일정을 보호하려면 직접 확인하고 수정해 주세요.');return false;}
 if(Array.isArray(s.stops)&&s.stops.length&&!confirm('현재 일정 초안을 새로 구성할까요? 기존 시간표는 변경됩니다.'))return false;
 const previous=s;
 s={...s,stops:plan.stops,hbPlanWarnings:plan.warnings,hbPlanInfo:{...plan.summary,region:s.region,date:s.date,transport:s.hbTransport,homeDeparture:home.homeDeparture,homeReturn:home.homeReturn,weekday:typeof hbTravelWeekday==='function'?hbTravelWeekday(s.date)?.short||null:null,createdAt:new Date().toISOString()},hbReplanUndo:null};
 try{save()}catch{ s=previous;alert('초안 저장에 실패했어요. 기존 일정을 유지해요.');return false;}
 go('/plan');return true;
}
// §5 origin / return UI. Device-local only; not part of the share DTO.
// An origin is only what the user explicitly chose: an actual device position
// after a button press, a place picked from the loaded list, or a typed name
// (no coordinates). The home map's default centre (서울 시청) or any other map
// state is never reused as an origin.
function hbTripEndpointState(){
 const raw=s.hbTripEndpoints&&typeof s.hbTripEndpoints==='object'?s.hbTripEndpoints:{};
 const clean=point=>point&&typeof point==='object'?hbTripPoint(point,point.source,point.label):null;
 return {origin:clean(raw.origin),returnTo:clean(raw.returnTo),
  returnMode:['same','other','none'].includes(raw.returnMode)?raw.returnMode:'same',
  result:raw.result&&typeof raw.result==='object'?raw.result:null};
}
function hbSaveTripEndpointState(patch){
 const previous=s.hbTripEndpoints;
 s.hbTripEndpoints={...hbTripEndpointState(),...patch};
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
 const note={label_only:'주소·이름만 저장 · 현재 위치나 목록의 장소로 정하면 이동시간을 계산해요',current_location:'현재 위치 · 약 100m 단위',place:'목록에서 고른 장소 · 약 100m 단위'}[point.source];
 return safe(point.label)+' <small>('+note+')</small>';
}
function hbTripPointControls(prefix,label){
 const list=hbTripPointPlaces();
 return '<div class="actions hb-trip-point-actions"><button type="button" class="light" data-hb-trip-gps="'+prefix+'">현재 위치를 '+label+'로</button></div>'+
  (list.length?'<div class="field hb-trip-point-field"><label for="hb-trip-'+prefix+'-place">불러온 장소 목록에서 '+label+' 고르기</label><select id="hb-trip-'+prefix+'-place"><option value="">장소 선택</option>'+
   list.map(place=>'<option value="'+safe(place.id)+'">'+safe(place.name)+'</option>').join('')+'</select> <button type="button" class="light" data-hb-trip-place="'+prefix+'">선택한 장소를 '+label+'로</button></div>':
   '<p class="muted">장소 목록을 불러오면 목록의 장소를 '+label+'로 고를 수 있어요.</p>')+
  '<div class="field hb-trip-point-field"><label for="hb-trip-'+prefix+'-label">'+label+' 주소나 이름만 적어 두기 (선택)</label><input id="hb-trip-'+prefix+'-label" maxlength="40" autocomplete="off" placeholder="예: 우리 집"> <button type="button" class="light" data-hb-trip-label="'+prefix+'">이름 저장</button></div>';
}
function hbBindTripPointControls(root,status,rerender){
 const field=prefix=>prefix==='return'?'returnTo':'origin';
 const store=(prefix,point,message)=>{
  if(!point){status.textContent=message||'위치를 저장하지 않았어요.';return}
  if(!hbSaveTripEndpointState({[field(prefix)]:point})){status.textContent='위치를 저장하지 못했어요. 저장 공간을 확인해 주세요.';return}
  rerender();
  const next=document.getElementById(status.id);
  if(next)next.textContent=(prefix==='return'?'귀가 위치':'출발지')+'를 이 기기에 저장했어요.'+(point.source==='label_only'?' 현재 위치나 목록의 장소로 정하면 이동시간을 계산해요.':'');
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
 root.querySelectorAll('[data-hb-trip-label]').forEach(button=>button.onclick=()=>{
  const prefix=button.dataset.hbTripLabel,input=document.getElementById('hb-trip-'+prefix+'-label');
  store(prefix,hbTripPoint(null,'label_only',input?.value),'저장할 주소나 이름을 적어 주세요.');
 });
}
// Step 1 (여행 정보): origin only; the return point defaults to the origin.
function hbTripOriginStepMarkup(){
 const state=hbTripEndpointState();
 return '<section class="hb-trip-origin-step" aria-labelledby="hb-trip-origin-title"><h3 id="hb-trip-origin-title">출발지 (선택)</h3>'+
  '<p>출발지: '+hbTripPointDescribe(state.origin,'출발지를 입력하면 이동시간을 계산해요')+'</p>'+hbTripPointControls('origin','출발지')+
  '<p class="muted">출발지는 이 기기에만 저장되고 가족 공유 링크에 포함되지 않아요. 귀가 위치는 출발지와 같게 보고, 일정표에서 바꿀 수 있어요. 지도 기본 중심(서울 시청)은 출발지로 쓰지 않아요.</p>'+
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
  '<p>출발지: '+hbTripPointDescribe(state.origin,'출발지를 입력하면 이동시간을 계산해요')+'</p>'+hbTripPointControls('origin','출발지')+
  '<div class="field"><label for="hb-trip-return-mode">귀가 위치</label><select id="hb-trip-return-mode">'+
  [['same','출발지로 돌아가기'],['other','다른 곳으로 귀가'],['none','귀가 시간 계산 안 함']].map(([v,l])=>'<option value="'+v+'"'+(state.returnMode===v?' selected':'')+'>'+l+'</option>').join('')+'</select></div>'+
  (state.returnMode==='other'?'<p>귀가 위치: '+hbTripPointDescribe(state.returnTo,'귀가 위치를 입력하면 귀가 시간을 계산해요')+'</p>'+hbTripPointControls('return','귀가 위치'):'')+
  '<ul class="hb-trip-endpoint-times"><li data-hb-endpoint="departure" data-hb-endpoint-status="'+safe(times.departure.status)+'">'+safe(hbTripEndpointLine('departure',times.departure,times.anchors))+'</li>'+
  '<li data-hb-endpoint="return" data-hb-endpoint-status="'+safe(times.return.status)+'">'+safe(hbTripEndpointLine('return',times.return,times.anchors))+'</li></ul>'+
  (desired?'<p class="hb-trip-desired" data-hb-desired="'+safe(desired.status)+'">'+safe(desired.message)+'</p>'+(desired.canApply?'<button type="button" class="light" id="hb-trip-desired-apply">일정 시각을 희망 출발에 맞추기</button>':''):'')+
  '<p class="muted">첫 방문지 시각과 집 출발 시각은 달라요. 집 출발·귀가 시각은 네이버 자동차 경로로 계산하고, 주차·하차·보행 시간과 교통 상황에 따라 달라질 수 있어요.</p>'+
  '<p class="muted">출발지·귀가 위치는 이 기기에만 저장되고 가족 공유 링크에 포함되지 않아요. 경로를 확인할 때만 약 100m 단위로 줄인 좌표를 서버에 보내요.</p>'+
  '<div class="actions">'+((hbTripPointRoutable(state.origin)||hbTripPointRoutable(returnPoint))?'<button type="button" class="light" id="hb-trip-endpoint-check">집 출발·귀가 시간 확인</button>':'')+
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
  const displayWarnings=hbVisiblePlanWarnings(s.hbPlanWarnings,someConfirmed);
  if(someConfirmed){
   const oldCaution=Array.from(el.querySelectorAll('p.warn')).find(node=>node.textContent.includes('방문 시간은 예상 계획이에요'));
   if(oldCaution)oldCaution.textContent='일부 자동차 이동시간을 네이버 경로로 반영했어요. 나머지 이동시간은 예상이에요.';
  }
  const checksHtml=displayWarnings.length?'<details class="hb-plan-warnings"'+(hbPlanChecksOpen?' open':'')+'><summary>방문 전 확인할 점 <span class="hb-plan-check-count">'+displayWarnings.length+'개</span></summary><ul>'+displayWarnings.map(w=>'<li>'+safe(w)+'</li>').join('')+'</ul></details>':'';
  // Owner request 2026-11-26: the "하루 여행 일정 자동 구성" form is not rendered on the plan
  // page. The code is kept behind HB_PLAN_GENERATOR_FORM; the view controls stay.
  const html=!HB_PLAN_GENERATOR_FORM?'<section class="panel hb-plan-generator hb-plan-tools" aria-label="일정표 도구">'+checksHtml+'</section>':'<section class="panel hb-plan-generator"><h2>하루 여행 일정 자동 구성</h2><p>고른 장소를 개수 제한 없이 시간대에 맞는 식사·휴식 시간과 함께 배치하고, 정한 시간 안에 들어가지 않으면 예상 초과 시간을 알려 드려요. 전체 동선은 <strong>사용자가 확인할 초안</strong>이에요. 일부 자동차 이동 구간만 별도로 확인·반영할 수 있어요.</p><label for="hb-plan-start">첫 방문지 시작 희망 시간 (선택)</label> <input type="time" id="hb-plan-start" value="'+safe(selection)+'"> <label for="hb-plan-end">종료 희망 시간 (선택)</label> <input type="time" id="hb-plan-end" value="'+safe(endSelection)+'"> <button type="button" id="hb-plan-regenerate">선택한 장소로 일정 재구성</button>'+(s.hbDuration==='overnight'?'<p class="warn">숙박 여행을 선택했지만 현재는 첫날 하루 일정만 구성돼요.</p>':'')+checksHtml+'</section>';
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
  el.querySelector('.hb-plan-generator').insertAdjacentHTML('beforeend','<p class="hb-plan-local-notice">시간과 방문 순서를 직접 수정할 수 있어요. 수정 내용은 <strong>이 기기에만 저장</strong>되며 가족과 자동 동기화되지 않아요. 이동시간은 예상값일 수 있어요.</p>');
  if(now.length){
   const basis=hbTravelBasisSummary(now);
   generator.insertAdjacentHTML('beforeend','<p class="hb-plan-travel-basis" role="note"><strong>이동시간</strong> · 네이버 자동차 경로 '+basis.verified+'구간 · 예상 이동 '+basis.placeholder+'곳'+(basis.placeholder?' (합계 약 '+basis.placeholderMinutes+'분, 예상)':'')+(basis.stale?' · 다시 계산할 구간 '+basis.stale+'개':'')+'</p>');
   hbRenderTripEndpoints(generator,now);
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
  if(routeStops.length>=2&&routeMode.kind==='car'){
   generator.insertAdjacentHTML('beforeend','<section class="hb-plan-travel" data-hb-route-mode="car"><h3>자동차 이동시간 반영 미리보기</h3><p>네이버 자동차 경로로 계산한 구간만 일정에 반영해요.</p><button type="button" class="light" id="hb-route-estimate">자동차 이동시간 확인 및 변경안 보기</button><div id="hb-route-result" role="status" aria-live="polite"></div></section>');
   const routeButton=document.getElementById('hb-route-estimate');
   routeButton.onclick=async()=>{
    const output=document.getElementById('hb-route-result');
    const signature=hbTripSignature(s);
    const context={region:s.hbPlanInfo?.region||s.region,transport:'car'};
    routeButton.disabled=true;
    output.textContent='자동차 이동시간을 계산하는 중이에요.';
    try{
     const travel=await hbFetchPlanTravelTimes(now,context);
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
      (warnings?'<h4>충돌·확인 필요</h4><ul>'+warnings+'</ul>':'<p>확인된 구간에 따른 시간 충돌은 발견하지 못했어요.</p>')+
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
  hbRenderPlanMap();
 };
}
hbPlanViewEnhance();
