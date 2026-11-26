"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const src=fs.readFileSync("web/assets/core-src/30-itinerary-engine-and-ui.js","utf8");
const f=vm.runInNewContext(src.slice(0,src.indexOf("function hbApplyScheduleFromSelection(){"))+"\nhbWeatherTimeCandidates;");
const key=JSON.stringify(["서울","2026-11-26"]),now=Date.parse("2026-11-26T00:00:00+09:00");
const slot=(h,pop=10)=>({at:"2026-11-26T"+String(h).padStart(2,"0")+":00:00+09:00",temperatureC:12,precipitationProbabilityPercent:pop,precipitationType:pop>=60?"비":"없음"});
const snap=(hours,extra={})=>({key,state:"available",data:{hourly:hours},...extra});
const places=[{id:"a",kind:"spot",name:"A"}],ids=["a"];
test("time proposals prefer lower burden full coverage, keep user selections unchanged",()=>{
 const hours=[slot(4),slot(5),slot(10,80),slot(11,80),slot(12,80),slot(13,80),slot(18),slot(19)];
 const result=f(ids,places,{end:"21:00"},snap(hours),key,now);
 assert.ok(result.length>=2);assert.equal(result[0].wetHours,0);assert.equal(ids[0],"a");assert.ok(result.every(x=>x.end<="21:00"));
});
test("no missing hours, stale or active warnings treated as a good period",()=>{
 assert.equal(f(ids,places,{},snap([slot(4),slot(6)]),key,now).length,0);
 assert.equal(f(ids,places,{},snap([slot(4),slot(5)],{state:"stale"}),key,now).length,0);
 assert.equal(f(ids,places,{},snap([slot(4),slot(5)],{alerts:{status:"active"}}),key,now).length,0);
 assert.equal(f(ids,places,{},snap([slot(4),slot(5)]),"wrong",now).length,0);
});
test("fixed start and end are respected; past starts are not proposed",()=>{
 const s=snap([slot(4),slot(5),slot(18),slot(19)]);
 assert.equal(f(ids,places,{start:"04:00",end:"06:00"},s,key,now)[0].start,"04:00");
 assert.equal(f(ids,places,{start:"04:00",end:"05:00"},s,key,now).length,0);
 assert.ok(f(ids,places,{},s,key,Date.parse("2026-11-26T10:00:00+09:00")).every(x=>x.start>="10:00"));
});