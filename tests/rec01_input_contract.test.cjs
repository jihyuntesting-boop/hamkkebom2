"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"../web/assets/core-src/10-recommendation-and-profile.js"),"utf8");
const end=source.indexOf("function newPlan(){");
assert.ok(end>0);
const ctx=vm.createContext({});vm.runInContext(source.slice(0,end),ctx,{timeout:2000});
const p={region:"서울",date:"2026-11-24",hbDuration:"day",hbTransport:"car",hbParty:"2",hbWalkConfirmed:true,walk:"15",hbStairsChoice:"avoid"};
const convert=(extra={})=>ctx.hbTravelInput({...p,...extra},"2026-11-23");
test("valid explicit choices map to typed contract without inference",()=>{
 const x=convert({hbTransport:"transit",hbParty:"8",hbMobilityAid:"walker",hbFoodPreferences:["vegetarian","vegetarian","invalid"],hbRestIntervalMinutes:45});
 assert.equal(x.errors.length,0);assert.equal(x.input.transport,"public_transit");
 assert.equal(x.input.partySize,8);assert.equal(x.input.walkingMinutes,15);
 assert.equal(x.input.stairs,"avoid");assert.equal(x.input.mobilityAid,"walker");
 assert.equal(x.input.restIntervalMinutes,45);assert.equal(x.input.foodPreferences.length,1);
});
test("defaults never count as explicit walk and stairs selection",()=>{
 const x=convert({hbWalkConfirmed:false,hbStairsChoice:null,stairs:"avoid",walk:"15"});
 assert.ok(x.errors.some(y=>y.includes("걸을 수 있는 시간")));
 assert.ok(x.errors.some(y=>y.includes("계단 이용 조건")));
 assert.equal(x.input.walkingMinutes,null);assert.equal(x.input.stairs,null);
});
test("leap day and Seoul past date validation",()=>{
 assert.equal(convert({date:"2028-02-29"}).errors.length,0);
 for(const date of ["2026-02-29","2025-12-31","2026-13-01","2026-11-22","bad","2026-11-24T00:00Z"])
  assert.ok(convert({date}).errors.length>0,date);
});
test("party, transport and trip enum validation",()=>{
 for(const value of ["0","13","2.5","NaN"])assert.ok(convert({hbParty:value}).errors.length>0);
 assert.ok(convert({hbTransport:"helicopter"}).errors.length>0);
 assert.ok(convert({hbDuration:"week"}).errors.length>0);
});
test("missing, corrupt and optional choices sanitize into null or safe arrays",()=>{
 const x=convert({hbSlopePreference:"bad",hbMobilityAid:"my diagnosis",hbRestIntervalMinutes:-1,hbIndoorPreference:"unsafe",hbFoodPreferences:["less_spicy","UNKNOWN"]});
 assert.equal(x.input.slopePreference,null);assert.equal(x.input.mobilityAid,null);
 assert.equal(x.input.restIntervalMinutes,null);assert.equal(x.input.indoorPreference,null);
 assert.equal(x.input.foodPreferences.length,1);
});
test("only valid Seoul and Gyeonggi regions are accepted",()=>{
 assert.ok(convert({region:"제주"}).errors.length>0);
 assert.equal(convert({region:"경기"}).errors.length,0);
});
