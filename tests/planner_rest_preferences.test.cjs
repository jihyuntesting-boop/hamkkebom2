"use strict";
const test=require("node:test"), assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const filename=path.join(__dirname,"../web/assets/core-src/30-itinerary-engine-and-ui.js");
const source=fs.readFileSync(filename,"utf8"),end=source.indexOf("function hbApplyScheduleFromSelection(){");
assert.ok(end>0,"schedule extraction boundary missing");
const ctx=vm.createContext({});
vm.runInContext(source.slice(0,end),ctx,{filename,timeout:2500});
const places=[
{id:"tour-101",name:"A",kind:"spot"},{id:"tour-102",name:"B",kind:"spot"},{id:"tour-103",name:"식당",kind:"food"}
];
const generate=(interval,extra={})=>ctx.hbCreateSchedule(["tour-101","tour-102","tour-103"],places,{start:"10:00",restIntervalMinutes:interval,...extra});
test("without selected interval keep 60-minute sightseeing and rest blocks",()=>{
 const p=generate(null);
 assert.equal(p.errors.length,0);assert.equal(p.stops.length,5);
 assert.equal(p.stops[0].stayMinutes,60);assert.equal(p.stops[1].kind,"rest");
 assert.equal(p.stops[1].plannedArrival,"11:00");assert.equal(p.stops[3].stayMinutes,60);
});
for(const interval of [30,45,60])test("preference "+interval+" creates matching draft dwell and explicit rest",()=>{
 const p=generate(interval);
 assert.equal(p.errors.length,0);assert.equal(p.stops.length,5);
 assert.equal(p.stops[0].stayMinutes,interval);
 assert.equal(p.stops[1].kind,"rest");
 assert.equal(p.stops[1].plannedArrival,interval===30?"10:30":interval===45?"10:45":"11:00");
 assert.equal(p.stops[2].kind,"food");assert.equal(p.stops[2].stayMinutes,60);
 assert.equal(p.stops[3].stayMinutes,interval);assert.equal(p.stops[4].kind,"rest");
 assert.ok(p.warnings.some(w=>w.includes("휴식 간격 "+interval+"분")));
 assert.ok(p.warnings.some(w=>w.includes("실제 이동·보행시간")));
 assert.equal(p.stops[3].travelTimeStatus,"unknown");
});
test("invalid stored preferences cannot produce unsafe durations",()=>{
 for(const bad of [-1,15,999,"invalid"]){
  const p=generate(bad);
  assert.equal(p.stops[0].stayMinutes,60);
  assert.ok(p.warnings.some(w=>w.includes("저장된 휴식 간격")));
 }
});
test("slope and indoor preferences stay as guidance without unconfirmed wording",()=>{
 const p=generate(45,{slopePreference:"avoid_steep",indoorPreference:"indoor"});
 assert.ok(p.warnings.some(w=>w.includes("경사·계단 정보")));
 assert.ok(!p.warnings.some(w=>/검증되지|미확인|안전/.test(w)));
 assert.ok(p.warnings.some(w=>w.includes("실내외 정보")));
});
test("must select sightseeing before building a draft",()=>{
 const p=ctx.hbCreateSchedule(["tour-103"],places,{restIntervalMinutes:30});
 assert.ok(p.errors.length>0);assert.equal(p.stops.length,0);
});
