'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const whole=fs.readFileSync('web/assets/core-src/40-sharing-and-data.js','utf8');
const start=whole.indexOf('let forecast =');
const end=whole.indexOf('async function hbTravelRequest',start);
assert.ok(start>=0&&end>start);
const source=whole.slice(start,end);
test('integrated source: two API contracts are independent and warnings are never silently none',async()=>{
 const node={textContent:'',art:null,setAttribute(name,value){if(name==='data-hb-weather-art')this.art=value;}};
 const calls=[];
 const state={region:'서울',date:'2026-11-25',stops:[]};
 const ctx=vm.createContext({s:state,path:()=>'/places',URLSearchParams,queueMicrotask,safe:String,document:{querySelectorAll:()=>[node]},get:async u=>{
  calls.push(u);
  if(u.startsWith('/api/data'))return {status:'available',summary:'기온 0°C · 비',precipitationType:'비',issuedAt:'2026-11-25T20:00:00+09:00',evidence:{representativeAt:'2026-11-25T21:00:00+09:00'},location:{scope:'regional_reference'}};
  return {status:'unknown'};
 }});
 vm.runInContext(source,ctx);
 await vm.runInContext('getWeather()',ctx);
 assert.equal(calls.length,2);assert.match(node.textContent,/발표 2026-11-25 20:00 KST/);
 // 2026-11-26 사용자 지시: 안내 문구(실내 대안·특보 상태 확인 필요·대표·지역 기준점)는 날씨 카드에 남기지 않는다.
 assert.equal(node.art,'rain');assert.doesNotMatch(node.textContent,/실내 대안|특보 상태 확인 필요|대표|지역 기준점|미확인/);
 assert.doesNotMatch(node.textContent,/발효 특보 없음/);
 ctx.get=async u=>u.startsWith('/api/data')?{status:'stale',summary:'맑음'}:{status:'active',active:[{hazard:'호우',severity:'주의보'}],effectiveAt:'2026-11-25T21:00:00+09:00'};
 await vm.runInContext('getWeather()',ctx);
 assert.equal(node.art,'weather');assert.match(node.textContent,/오래된 예보/);assert.match(node.textContent,/발효 중인 특보: 호우주의보 \/ 발효 2026-11-25 21:00 KST/);assert.doesNotMatch(node.textContent,/맑음|재검토/);
 ctx.get=async u=>u.startsWith('/api/data')?Promise.reject(new Error('timeout')):{status:'none',area:{verified:true}};
 await vm.runInContext('getWeather()',ctx);
 assert.equal(node.art,'weather');assert.match(node.textContent,/날씨를 불러오지 못했어요/);assert.doesNotMatch(node.textContent,/보장 아님|발효 특보 없음/);
});
