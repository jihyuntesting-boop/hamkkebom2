"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const src=fs.readFileSync("web/assets/core-src/40-sharing-and-data.js","utf8");
const start=src.indexOf("function hbWeatherRecommendation("),end=src.indexOf("function hbWeatherOptionsMarkup(",start);
const f=vm.runInNewContext(src.slice(start,end)+"\nhbWeatherRecommendation;");
const key=JSON.stringify(["서울","2026-11-26"]);
test("fresh scoped precipitation, temperature and alerts yield cautious proposal options",()=>{
 for(const data of [{precipitationType:"비"},{precipitationType:"눈"},{precipitationProbabilityPercent:70},{temperatureC:-7},{temperatureC:32}])assert.equal(f({key,state:"available",data},key).kind,"adverse");
 assert.equal(f({key,state:"error",alerts:{status:"active",active:[{hazard:"호우",severity:"주의보"}]}},key).kind,"caution");
});
test("wrong date, stale, missing and error do not fabricate weather based options",()=>{
 for(const state of ["loading","stale","no_forecast","error"])assert.equal(f({key,state,data:{precipitationType:"비"}},key).kind,"unknown");
 assert.equal(f({key:"different",state:"available",data:{precipitationType:"비"}},key).kind,"unknown");
 assert.equal(f({key,state:"available",data:{summary:"맑음"}},key).kind,"regular");
});
test("user decision 2026-11-26: category and hourly comparison entry points are hidden, modules preserved",()=>{
 const mEnd=src.indexOf("function hbBindWeatherOptions(",start);
 const hourly=[{at:"2026-11-26T10:00:00+09:00",temperatureC:12,precipitationProbabilityPercent:80,precipitationType:"비"}];
 const markup=kind=>{
  const data=kind==="adverse"?{precipitationType:"비",hourly}:{summary:"맑음",hourly};
  const ctx={forecast:{key,state:"available",data},currentWeatherKey:()=>key,path:()=>"/places",safe:String};
  return vm.runInNewContext(src.slice(start,mEnd)+"\nhbWeatherOptionsMarkup();",ctx);
 };
 for(const kind of ["adverse","regular"]){
  const html=markup(kind);
  for(const id of ["hb-weather-culture","hb-weather-all","hb-weather-times"])assert.ok(!html.includes(id),kind+" "+id);
  assert.ok(!/문화시설 후보|시간대별 날씨와 일정 비교|전체 후보 비교/.test(html),kind);
 }
 assert.ok(markup("adverse").includes("hb-weather-short")&&markup("adverse").includes("hb-weather-date"));
 assert.match(src,/const HB_WEATHER_CATEGORY_COMPARE_ENABLED=false;/);
 assert.match(src,/const HB_WEATHER_TIME_COMPARE_ENABLED=false;/);
 for(const kept of ["bind('hb-weather-culture'","bind('hb-weather-all'","bind('hb-weather-times'","hbWeatherTimeCandidates(ids"])assert.ok(src.includes(kept),kept);
});
