"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const read=n=>fs.readFileSync(path.join(__dirname,"../web/assets/core-src",n),"utf8");
const p=read("10-recommendation-and-profile.js"),e=read("30-itinerary-engine-and-ui.js"),c=vm.createContext({});
vm.runInContext(p.slice(0,p.indexOf("function newPlan(){"))+e.slice(0,e.indexOf("function hbApplyScheduleFromSelection(){")),c);
const today="2026-11-26", places=[{id:"a",name:"A",kind:"spot"},{id:"b",name:"B",kind:"spot"},{id:"f",name:"F",kind:"food"}];
test("untouched yesterday default rolls over; saved protected itinerary and legacy date remain intact",()=>{
 const old={region:"서울",date:"2026-11-25",hbStep:3,stops:[{id:"a",must:true}]};
 const next=c.hbRefreshAutomaticDate(old,today);
 assert.equal(next.date,today);assert.equal(next.hbStep,1);assert.equal(next.hbPlanInfo.date,old.date);assert.equal(next.stops,old.stops);assert.equal(old.date,"2026-11-25");
 assert.equal(c.hbRefreshAutomaticDate({...old,hbDateExplicit:true},today).date,old.date);
 assert.equal(c.hbRefreshAutomaticDate({...old,date:"",hbDateExplicit:true},today).date,"");
 assert.equal(c.hbTravelDateError(today,today),"");assert.ok(c.hbTravelDateError("2026-02-30",today));assert.ok(c.hbTravelDateError(old.date,today));
});
test("fresh and explicit future dates stay stable",()=>{
 for(const date of [today,"2026-12-02"]) {const x={date,hbStep:2};assert.equal(c.hbRefreshAutomaticDate(x,today),x);}
});
test("optional times and all same-day hours including early morning and night",()=>{
 for(const [a,b] of [["",""],["","18:00"],["04:00","23:00"],["10:00","19:00"],["00:00","23:59"]])assert.equal(c.hbTimeInputErrors(a,b).length,0);
 for(const [a,b] of [["14:00","13:00"],["25:00","26:00"],["23:30","01:00"]])assert.ok(c.hbTimeInputErrors(a,b).length);
});
test("afternoon itinerary honors selected start/end and does not invent lunch",()=>{
 const x=c.hbCreateSchedule(["a"],places,{start:"14:00",end:"16:00"});
 assert.equal(x.errors.length,0);assert.equal(x.stops[0].time,"14:00");assert.equal(x.summary.windowEnd,"16:00");assert.ok(x.summary.end<="16:00");assert.ok(!x.stops.some(v=>v.kind==="food"));
 // §5: an overfull window is no longer blocked; it is a draft with an explicit overrun warning.
 const over=c.hbCreateSchedule(["a","f"],places,{start:"14:00",end:"15:30"});
 assert.equal(over.errors.length,0);assert.ok(over.summary.overrunMinutes>0);assert.equal(over.summary.windowEnd,null);assert.equal(over.summary.requestedEnd,"15:30");
 assert.ok(over.warnings[0].includes("초과"));
 const tight=c.hbCreateSchedule(["a"],places,{start:"14:00",end:"14:15"});
 assert.equal(tight.errors.length,0);assert.equal(tight.summary.overrunMinutes,tight.summary.totalMinutes-15);
 assert.equal(c.hbCreateSchedule(["a"],places,{start:"",end:"18:00"}).errors.length,0);
});
test("time window also constrains manual editing and route preview",()=>{
 const x=c.hbCreateSchedule(["a","b"],places,{start:"13:00",end:"17:00"});
 assert.equal(x.errors.length,0);
 assert.equal(c.hbEditDraftStop(x.stops,0,"arrival","12:30",x.summary).ok,false);
 const last=x.stops.length-1;
 assert.equal(c.hbEditDraftStop(x.stops,last,"arrival","16:59",x.summary).ok,false);
 const edge=c.hbPlanTravelEdges(x.stops)[0];
 const preview=c.hbPreviewPlanTravel(x.stops,{status:"estimated",segments:[{...edge,status:"estimated",source:"naver_directions",minutes:240,checkedAt:new Date().toISOString()}]},x.summary);
 assert.equal(preview.canApply,false);assert.ok(preview.warnings.some(w=>w.code==="day_limit"));
});

test("new trip does not replace existing saved itinerary, and cancel preserves prior selection",()=>{
 const old={region:"경기",date:"2026-11-25",hbDateExplicit:true,hbStep:3,hbPlanStart:"11:00",hbPlanEnd:"17:00",chosen:["a"],stops:[{id:"a",reserved:true}],hbPlanInfo:{date:"2026-11-25",region:"경기"}};
 let saved=0,route=null;
 c.s=old;c.confirm=()=>false;c.save=()=>saved++;c.go=x=>route=x;
 c.hbBeginNewTravel();assert.equal(c.s,old);assert.equal(saved,0);
 c.confirm=()=>true;c.hbBeginNewTravel();
 assert.equal(c.s.hbStep,1);assert.equal(c.s.hbDateExplicit,false);assert.equal(c.s.hbPlanStart,"");assert.equal(c.s.hbPlanEnd,"");
 assert.equal(c.s.stops,old.stops);assert.equal(c.s.hbPlanInfo.date,old.date);assert.equal(c.s.chosen.length,0);assert.equal(route,"/new");assert.equal(saved,1);
});

test("early, evening and automatic schedules have no arbitrary time limit",()=>{
 const early=c.hbCreateSchedule(["a","b"],places,{start:"04:30",end:"09:00"});
 assert.equal(early.errors.length,0);assert.equal(early.stops[0].time,"04:30");
 const evening=c.hbCreateSchedule(["a","f"],places,{start:"19:00"});
 assert.equal(evening.errors.length,0);assert.equal(evening.summary.windowEnd,null);assert.ok(evening.summary.end>"20:00");
 const automatic=c.hbCreateSchedule(["a"],places,{start:"",end:"08:00"});
 assert.equal(automatic.errors.length,0);assert.equal(automatic.summary.windowStart,null);assert.ok(automatic.summary.end<="08:00");
 assert.ok(c.hbCreateSchedule(["a"],places,{start:"23:30"}).errors.length);
});


test("legacy or completed step cannot resume; active valid drafts keep their place",()=>{
 const profile={region:"서울",date:"2026-11-26",hbStep:3,hbWalkConfirmed:true,walk:"15",hbStairsChoice:"avoid"};
 assert.equal(c.hbWizardStep(profile,today),1);
 assert.equal(c.hbWizardStep({...profile,hbDraftActive:false},today),1);
 assert.equal(c.hbWizardStep({...profile,hbDraftActive:true},today),3);
 assert.equal(c.hbWizardStep({...profile,hbDraftActive:true,hbStep:2},today),2);
 assert.equal(c.hbWizardStep({...profile,hbDraftActive:true,hbWalkConfirmed:false},today),2);
 assert.equal(c.hbWizardStep({...profile,hbDraftActive:true,date:"2020-01-01"},today),1);
 assert.equal(c.hbWizardStep({...profile,hbDraftActive:true,hbParty:99},today),1);
});
