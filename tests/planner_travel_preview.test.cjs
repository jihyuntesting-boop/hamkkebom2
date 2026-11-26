'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname,'../web/assets/core-src/30-itinerary-engine-and-ui.js'),'utf8');
const pure = script.slice(0,script.indexOf('function hbApplyScheduleFromSelection()'));
assert.ok(pure.length > 0 && !pure.includes('hbPlanViewEnhance()'));
const api = vm.runInNewContext(pure + '\n;({hbCreateSchedule,hbEditDraftStop,hbPlanTravelEdges,hbPlanTravelBatches,hbFetchPlanTravelTimes,hbPreviewPlanTravel})',{});
const {hbCreateSchedule,hbEditDraftStop,hbPlanTravelBatches,hbFetchPlanTravelTimes,hbPreviewPlanTravel}=api;
const context={region:'서울',transport:'car'};
const time=()=>new Date().toISOString();
const leg=(from,to,minutes)=>({from,to,status:'estimated',minutes,source:'naver_directions',checkedAt:time()});
const unknown=(from,to)=>({from,to,status:'unknown',minutes:null});
const stop=(id,arrival,duration=60,other={})=>({
 id,placeId:id,kind:'spot',name:id,plannedArrival:arrival,time:arrival,
 stayMinutes:duration,transitionBufferMinutes:25,travelTimeStatus:'unknown',
 done:false,must:false,reserved:false,booked:false,...other
});
const original=()=>[stop('a','10:00'),stop('b','11:20')];
const request=(segments,status=segments.every(s=>s.status==='estimated')?'estimated':'incomplete')=>
 async (_url,payload)=>{
  assert.ok(payload.stopIds.length>=2&&payload.stopIds.length<=3);
  return {status,segments};
 };
const JSONcopy=x=>JSON.parse(JSON.stringify(x));
const fetchPreview=async(items,segments)=>{
 const result=await hbFetchPlanTravelTimes(items,context,request(segments));
 return hbPreviewPlanTravel(items,result);
};

test('1. valid driving legs update expected arrivals and verified buffer',async()=>{
 const items=original(),res=await fetchPreview(items,[leg('a','b',45)]);
 assert.equal(res.canApply,true);
 assert.equal(res.stops[1].time,'11:45');
 assert.equal(res.stops[1].transitionBufferMinutes,45);
 assert.equal(res.stops[1].travelTimeStatus,'estimated');
 assert.equal(res.stops[1].travelFromId,'a');
 assert.ok(res.warnings.some(w=>w.code==='travel_conflict'));
});
test('2. unknown legs keep original schedule and unknown status',async()=>{
 const items=original(),res=await fetchPreview(items,[unknown('a','b')]);
 assert.equal(res.canApply,false);
 assert.equal(res.stops[1].travelTimeStatus,'unknown');
 assert.ok(res.warnings.some(w=>w.code==='unknown'));
 assert.deepEqual(JSONcopy(res.stops),JSONcopy(items));
});
test('3. disabled provider neither updates nor invents estimates',async()=>{
 const items=original(),before=JSON.stringify(items);
 const result=await hbFetchPlanTravelTimes(items,context,async()=>({status:'provider_disabled',segments:[]}));
 assert.equal(result.status,'provider_disabled');
 assert.equal(hbPreviewPlanTravel(items,result).canApply,false);
 assert.equal(JSON.stringify(items),before);
});
test('4. network failure retains original schedule',async()=>{
 const items=original(),before=JSON.stringify(items);
 const result=await hbFetchPlanTravelTimes(items,context,async()=>{throw Error('offline')});
 assert.equal(result.status,'network_error');
 assert.equal(hbPreviewPlanTravel(items,result).canApply,false);
 assert.equal(JSON.stringify(items),before);
});
test('5. unsupported modes never trigger Directions request',async()=>{
 let calls=0;
 const r=await hbFetchPlanTravelTimes(original(),{region:'서울',transport:'public_transit'},async()=>{calls++;throw Error('called')});
 assert.equal(r.status,'unsupported_mode');
 assert.equal(calls,0);
});
test('6. partial results apply only confirmed leg, remaining route unknown',async()=>{
 const items=[stop('a','10:00'),stop('b','11:15'),stop('c','13:00')];
 const r=await hbFetchPlanTravelTimes(items,context,request([leg('a','b',30),unknown('b','c')],'incomplete'));
 const p=hbPreviewPlanTravel(items,r);
 assert.equal(r.status,'incomplete');
 assert.equal(p.verifiedCount,1);
 assert.equal(p.stops[1].time,'11:30');
 assert.equal(p.stops[2].travelTimeStatus,'unknown');
 assert.ok(p.warnings.some(w=>w.code==='unknown'));
});
test('7. detected travel delay and original stop overlap',async()=>{
 const items=[stop('a','10:00',90),stop('b','11:00')];
 const p=await fetchPreview(items,[leg('a','b',35)]);
 assert.equal(p.stops[1].time,'12:05');
 assert.ok(p.warnings.some(w=>w.code==='overlap'));
 assert.ok(p.warnings.some(w=>w.code==='travel_conflict'));
});
test('8. sufficient gap preserves arrival times without hiding verified data',async()=>{
 const items=[stop('a','10:00'),stop('b','12:00')];
 const p=await fetchPreview(items,[leg('a','b',20)]);
 assert.equal(p.stops[1].time,'12:00');
 assert.equal(p.stops[1].transitionBufferMinutes,20);
 assert.equal(p.canApply,true);
 assert.equal(p.warnings.some(w=>w.code==='travel_conflict'),false);
});
test('9. done/must/reserved/booked stops cannot be shifted',async()=>{
 for(const flag of ['done','must','reserved','booked']){
  const items=[stop('a','10:00'),stop('b','11:20',60,{[flag]:true})];
  const p=await fetchPreview(items,[leg('a','b',45)]);
  assert.equal(p.canApply,false,flag);
  assert.equal(p.stops[1].time,items[1].time,flag);
  assert.equal(p.stops[1].travelTimeStatus,'unknown',flag);
  assert.ok(p.warnings.some(w=>w.code==='protected'),flag);
 }
});
test('10. original stays immutable while comparing before and after',async()=>{
 const items=original(),before=JSON.stringify(items);
 const p=await fetchPreview(items,[leg('a','b',45)]);
 assert.equal(JSON.stringify(items),before);
 assert.notEqual(JSON.stringify(p.stops),before);
});
test('11. cancelling is a non-write path; preview has no side effects',async()=>{
 const items=original(),saved=JSON.stringify(items);
 await fetchPreview(items,[leg('a','b',45)]);
 assert.equal(JSON.stringify(items),saved);
 assert.match(script,/hb-route-cancel/);
 assert.match(script,/변경안을 취소했어요/);
});
test('12. re-applying a confirmed leg does not add minutes twice',async()=>{
 const initial=original();
 const p1=await fetchPreview(initial,[leg('a','b',45)]);
 const p2=await fetchPreview(p1.stops,[leg('a','b',45)]);
 assert.equal(p1.stops[1].time,'11:45');
 assert.equal(p2.stops[1].time,'11:45');
 assert.equal(p2.stops[1].transitionBufferMinutes,45);
});
test('13. malformed values, wrong IDs and unsupported source fail closed',async()=>{
 const bad=[
  leg('a','b',-1),leg('a','b',1.5),{...leg('a','b',25),minutes:'25'},
  leg('a','wrong',25),{...leg('a','b',25),source:'fake'},
  {...leg('a','b',25),checkedAt:'nonsense'}
 ];
 for(const broken of bad){
  const items=original();
  const result=await hbFetchPlanTravelTimes(items,context,request([broken]));
  assert.equal(result.status,'invalid_response');
  assert.equal(hbPreviewPlanTravel(items,result).canApply,false);
 }
});
test('14. creation, rest/food, manual arrival and reordering still work',()=>{
 const places=[{id:'a',kind:'spot',name:'A'},{id:'b',kind:'spot',name:'B'},
  {id:'f',kind:'food',name:'Lunch'}];
 const created=hbCreateSchedule(['a','f','b'],places,{start:'10:00'});
 assert.equal(created.errors.length,0);
 assert.ok(created.stops.some(s=>s.kind==='rest'));
 assert.ok(created.stops.some(s=>s.kind==='food'));
 const result=hbEditDraftStop(created.stops,2,'duration',45);
 assert.equal(result.ok,true);
 const reordered=hbEditDraftStop(result.stops,2,'down');
 assert.equal(reordered.ok,true);
 assert.equal(reordered.stops[2].name,'B');
 assert.equal(reordered.stops[3].name,'Lunch');
});
test('15. requests never exceed three IDs or four calls, remaining legs unknown',async()=>{
 const items=Array.from({length:12},(_,i)=>stop('id'+i,'10:00'));
 const batches=hbPlanTravelBatches(items);
 assert.ok(batches.batches.length<=4);
 assert.ok(batches.batches.every(batch=>batch.stopIds.length<=3));
 let count=0;
 const result=await hbFetchPlanTravelTimes(items,context,async(_,payload)=>{
  count++;
  return {status:'estimated',segments:payload.stopIds.slice(1).map((to,j)=>leg(payload.stopIds[j],to,5))};
 });
 assert.ok(count<=4);
 assert.equal(result.status,'incomplete');
 assert.equal(result.limited,true);
 assert.ok(result.segments.some(s=>s.status==='unknown'));
});
test('16. applying preview candidate survives JSON persistence round-trip',async()=>{
 const before=original(),p=await fetchPreview(before,[leg('a','b',45)]);
 const saved=JSONcopy(p.stops);
 assert.equal(saved[1].plannedArrival,'11:45');
 assert.equal(saved[1].travelTimeStatus,'estimated');
 assert.equal(before[1].plannedArrival,'11:20');
});
test('17. day-end overflow prevents application',async()=>{
 const items=[stop('a','22:00',60),stop('b','23:10',60)];
 const p=await fetchPreview(items,[leg('a','b',45)]);
 assert.equal(p.canApply,false);
 assert.ok(p.warnings.some(w=>w.code==='day_limit'));
});
test('18. reordered route invalidates stale verified metadata',async()=>{
 const items=[stop('a','10:00'),stop('b','11:25',60,{travelTimeStatus:'estimated',travelTimeMinutes:25,travelFromId:'a',travelToId:'b'}),
  stop('c','13:00')];
 const swapped=hbEditDraftStop(items,1,'down');
 assert.equal(swapped.ok,true);
 assert.ok(swapped.stops.every(s=>s.travelTimeStatus!=='estimated'));
});
