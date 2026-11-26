"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const file=path.join(__dirname,"../web/assets/core-src/30-itinerary-engine-and-ui.js");
const src=fs.readFileSync(file,"utf8");
const end=src.indexOf("function hbApplyScheduleFromSelection(){");
assert.ok(end>0,"missing edit function boundary");
const c=vm.createContext({});
vm.runInContext(src.slice(0,end),c,{filename:file,timeout:2500});
const base=()=>c.hbCreateSchedule(["tour-1","tour-2","food-3"],[
 {id:"tour-1",name:"장소 A",kind:"spot"},
 {id:"tour-2",name:"장소 B",kind:"spot"},
 {id:"food-3",name:"식당",kind:"food"}
],{start:"10:00",restIntervalMinutes:45}).stops;
test("edit duration updates only desired stop and preserves original",()=>{
 const items=base(),result=c.hbEditDraftStop(items,0,"duration","30");
 assert.equal(result.ok,true);assert.equal(result.stops[0].stayMinutes,30);
 assert.equal(items[0].stayMinutes,45);assert.equal(result.stops[1].plannedArrival,"10:45");
 assert.equal(result.stops[1].kind,"rest");
});
test("manual time edits preserve planned arrival and do not invent travel",()=>{
 const items=base(),result=c.hbEditDraftStop(items,0,"arrival","09:45");
 assert.equal(result.ok,true);assert.equal(result.stops[0].time,"09:45");
 assert.equal(result.stops[0].plannedArrival,"09:45");
 assert.equal(result.stops[3].travelTimeStatus,"unknown");
});
test("invalid time, overlaps, and date boundary never mutate stored state",()=>{
 const items=base(),initial=JSON.stringify(items);
 for(const [index,kind,value] of [[0,"arrival","25:99"],[0,"duration",100],[0,"duration",-1],[4,"arrival","23:59"],[0,"duration",0]]){
  const out=c.hbEditDraftStop(items,index,kind,value);
  assert.equal(out.ok,false,JSON.stringify([index,kind,value]));
  assert.ok(out.error);
 }
 assert.equal(JSON.stringify(items),initial);
});
test("reordering swaps only unprotected stops and slot time remains chronological",()=>{
 const items=base(),result=c.hbEditDraftStop(items,3,"down");
 assert.equal(result.ok,true);
 assert.equal(result.stops[3].kind,"rest");
 assert.equal(result.stops[4].kind,"spot");
 assert.equal(result.stops[3].time,items[3].time);
 assert.equal(result.stops[4].time,items[4].time);
 assert.deepEqual(Array.from(result.stops,x=>x.position),[1,2,3,4,5]);
 assert.equal(result.stops[4].travelTimeStatus,items[4].travelTimeStatus);
});
test("a protected stop may not move, nor may a neighbor move across it",()=>{
 const items=base();items[3].reserved=true;
 assert.equal(c.hbEditDraftStop(items,3,"arrival","14:00").ok,false);
 assert.equal(c.hbEditDraftStop(items,3,"down").ok,false);
 assert.equal(c.hbEditDraftStop(items,4,"up").ok,false);
 assert.equal(c.hbEditDraftStop(items,3,"duration",30).ok,false);
 assert.equal(items[3].reserved,true);
});
test("reject invalid editor action or out-of-bounds index",()=>{
 const items=base();
 assert.equal(c.hbEditDraftStop(items,-1,"duration",60).ok,false);
 assert.equal(c.hbEditDraftStop(items,0,"delete",null).ok,false);
 assert.equal(c.hbEditDraftStop(items,0,"up").ok,false);
});

test("early and evening arrivals are not rejected by a fixed daytime window",()=>{
 const items=base();assert.equal(c.hbEditDraftStop(items,0,"arrival","05:30").ok,true);
 assert.equal(c.hbEditDraftStop(items,4,"arrival","21:00").ok,true);
});
