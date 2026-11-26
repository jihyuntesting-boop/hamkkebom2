"use strict";
// 날씨 기반 여행지·일정 제안 (DECISIONS 2026-11-26 "시간 유연성 및 자동 날씨 추천", F07-02 / F14-01, WTH-02/03, REC-04).
// KMA responses are fixtures only: no network, no API key.
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const read=f=>fs.readFileSync(path.join(__dirname,"../web/assets/core-src/"+f),"utf8");
const between=(src,a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);assert.ok(i>=0&&j>i,a);return src.slice(i,j+b.length);};
const s10=read("10-recommendation-and-profile.js"),s30=read("30-itinerary-engine-and-ui.js"),s40=read("40-sharing-and-data.js");
const signalSrc=between(s40,"// BEGIN HB_WEATHER_SUGGEST_SIGNAL","// END HB_WEATHER_SUGGEST_SIGNAL");
const placeSrc=between(s10,"// BEGIN HB_WEATHER_SUGGEST","// END HB_WEATHER_SUGGEST\n");
const draftSrc=s30.slice(0,s30.indexOf("function hbApplyScheduleFromSelection(){"));
const safe=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const DATE="2099-07-10",KEY=JSON.stringify(["서울",DATE]);
const at=h=>DATE+"T"+String(h).padStart(2,"0")+":00:00+09:00";
const slot=(h,pop=10,temp=20,type)=>({at:at(h),temperatureC:temp,precipitationProbabilityPercent:pop,precipitationType:type||(pop>=60?"비":"없음")});
const day=(fn)=>Array.from({length:15},(_,i)=>fn(i+8));
const snap=(hourly,extra={})=>({key:KEY,state:"available",data:{summary:"맑음",issuedAt:DATE+"T05:00:00+09:00",hourly},alerts:{status:"none"},...extra});
function signalCtx(){const ctx={path:()=>"/",JSON,Map,Set,Math,Number,String,Object,Array};vm.runInNewContext(signalSrc+String.fromCharCode(10)+"this.HB_WEATHER_SUGGEST_RULE=HB_WEATHER_SUGGEST_RULE;",ctx);return ctx;}
const S=signalCtx();
const sig=(snapshot,win)=>S.hbWeatherSignal(snapshot,KEY,win);
const BANNED=/미확인|미지원|확인 안 됨|확인되지 않|안전합니다|안전한 실내|안전 보장|보장해요|보장합니다/;

test("signal: rain, snow, heat, cold and active alert become adverse with reason and source",()=>{
 const rain=sig(snap(day(h=>slot(h,h>=13&&h<=16?70:10))));
 assert.equal(rain.mode,"adverse");assert.equal(rain.label,"비 예보(오후 강수확률 70%)");assert.equal(rain.source,"기상청 단기예보 · 05:00 발표");
 assert.equal(sig(snap(day(h=>slot(h,h===10?80:10,0,h===10?"눈":undefined)))).label,"눈 예보(오전 강수확률 80%)");
 assert.match(sig(snap(day(h=>slot(h,10,h===14?33:25)))).label,/^더위 부담\(최고 33℃\)$/);
 assert.match(sig(snap(day(h=>slot(h,10,h===9?-8:-1)))).label,/^추위 부담\(최저 -8℃\)$/);
 const alert=sig({key:KEY,state:"error",alerts:{status:"active",effectiveAt:DATE+"T07:00:00+09:00",active:[{hazard:"호우",severity:"주의보"}]}});
 assert.equal(alert.mode,"adverse");assert.equal(alert.label,"호우주의보 발효");assert.equal(alert.source,"기상청 기상특보 · 07:00 발효");
 assert.equal(alert.hours.size,0,"alert without hourly forecast has no time slots to schedule with");
 const wind=sig(snap(day(h=>slot(h,10,20)),{alerts:{status:"active",active:[{hazard:"강풍",severity:"주의보"}]}}));
 assert.equal(wind.mode,"adverse");assert.match(wind.label,/^강풍주의보 발효$/);
});
test("signal: mild dry day is pleasant; ordinary day is neutral",()=>{
 const p=sig(snap(day(h=>slot(h,20,15+(h%5)))));
 assert.equal(p.mode,"pleasant");assert.equal(p.label,"맑고 온화한 날씨(강수확률 20% 이하 · 15~19℃)");
 assert.equal(sig(snap(day(h=>slot(h,40,20)))).mode,"neutral");
 assert.equal(sig(snap(day(h=>slot(h,10,5)))).mode,"neutral");
});
test("signal: threshold boundaries are inclusive exactly as HB_WEATHER_SUGGEST_RULE says (임시 기준)",()=>{
 const R=S.HB_WEATHER_SUGGEST_RULE;
 assert.deepEqual([R.wetProbabilityPercent,R.dryProbabilityPercent,R.hotTemperatureC,R.coldTemperatureC,R.mildMinTemperatureC,R.mildMaxTemperatureC],[60,30,30,-5,10,27]);
 assert.ok(Object.isFrozen(R));
 const one=(pop,temp)=>sig(snap(day(h=>slot(h,h===12?pop:10,h===12?temp:20,"없음")))).mode;
 assert.equal(one(59,20),"neutral");assert.equal(one(60,20),"adverse");
 assert.equal(one(10,29.9),"neutral");assert.equal(one(10,30),"adverse");
 assert.equal(one(10,-4.9),"neutral");assert.equal(one(10,-5),"adverse");
 assert.equal(one(30,20),"pleasant");assert.equal(one(31,20),"neutral");
 assert.equal(one(10,10),"pleasant");assert.equal(one(10,9.9),"neutral");assert.equal(one(10,27),"pleasant");assert.equal(one(10,27.1),"neutral");
 assert.match(s40,/임시 기준 \(2026-11-26\)/);
 // hbWeatherRecommendation reads the same constant (single source of thresholds).
 const rec=between(s40,"function hbWeatherRecommendation(","\n}\n");
 assert.match(rec,/HB_WEATHER_SUGGEST_RULE/);assert.doesNotMatch(rec,/>=60|>=30\|\||<=-5/);
});
test("signal: no forecast, out of range, error, stale, loading and other dates change nothing",()=>{
 const out=sig({key:KEY,state:"no_forecast",data:{status:"no_forecast"},alerts:{status:"none"}});
 assert.equal(out.mode,"none");assert.equal(out.reason,"out_of_range");
 for(const state of ["error","stale","unknown"])assert.equal(sig({key:KEY,state,data:{precipitationType:"비"},alerts:{status:"error"}}).mode,"none",state);
 assert.equal(sig({key:KEY,state:"loading"}).reason,"pending");
 assert.equal(S.hbWeatherSignal(snap(day(h=>slot(h,90))),JSON.stringify(["서울","2099-07-11"]),{}).mode,"none");
 const otherDay=snap([{...slot(12,90),at:"2099-07-11T12:00:00+09:00"}]);
 assert.equal(sig(otherDay).hours.size,0);
});
test("signal: trip time window decides; rain outside the trip hours is not used",()=>{
 const hours=day(h=>slot(h,h>=19?90:10));
 assert.equal(sig(snap(hours),{start:"09:00",end:"17:00"}).mode,"pleasant");
 assert.equal(sig(snap(hours),{start:"09:00",end:"21:00"}).mode,"adverse");
});

// ---- Place classification: only data already in the app (kind / contentTypeId / cat2 / name) ----
function placeCtx(extra={}){const ctx={safe,s:{hbPlanStart:"",hbPlanEnd:""},...extra};vm.runInNewContext(placeSrc,ctx);return ctx;}
const P=placeCtx();
// The 18 '데이터 충분' places shown on 2026-11-26 production (서울 10 / 경기 8): names and kinds as served.
const SHOWN=[
 ["경복궁","spot","outdoor"],["북촌한옥마을","spot","outdoor"],["남산서울타워","spot",null],["동대문디자인플라자(DDP)","spot","indoor"],
 ["국립중앙박물관","culture","indoor"],["서울숲","spot","outdoor"],["올림픽공원","spot","outdoor"],["논현문화마루도서관","culture","indoor"],
 ["성동책마루도서관","culture","indoor"],["청운문학도서관","culture","indoor"],
 ["광명동굴","spot",null],["남한산성도립공원 [유네스코 세계유산]","spot","outdoor"],["마장호수","spot","outdoor"],["부락산분수공원","spot","outdoor"],
 ["시흥시청소년수련관","spot","indoor"],["시흥시 대야평생학습관","culture","indoor"],["시흥시립대야도서관","culture","indoor"],["에코센터","culture","indoor"]
];
test("classification of the currently shown places is fixed and evidence-based",()=>{
 for(const [name,kind,expected] of SHOWN)assert.equal(P.hbWeatherPlaceClass({name,kind}).kind,expected,name);
 assert.equal(P.hbWeatherPlaceClass({name:"궁중 한정식",kind:"food"}).kind,null,"food is never weather-classified");
 assert.equal(P.hbWeatherPlaceClass({name:"어느 관광지",kind:"spot",contentTypeId:"14"}).basis,"official_category");
 assert.equal(P.hbWeatherPlaceClass({name:"어느 계곡길",kind:"spot",providerCategoryCode:"A0101"}).kind,"outdoor");
 assert.equal(P.hbWeatherPlaceClass({name:"어느 자연",kind:"spot",providerCategoryCode:"A0101"}).basis,"official_category");
 assert.equal(P.hbWeatherPlaceClass({name:"숲속 박물관",kind:"spot"}).kind,null,"conflicting name evidence is not promoted");
 assert.equal(P.hbWeatherPlaceClass({name:"숲속 박물관",kind:"culture"}).kind,null);
});
test("place notes state classification and weather facts only; unclassified places get no wording",()=>{
 const rain=sig(snap(day(h=>slot(h,h>=13?70:10))));
 const museum=P.hbWeatherPlaceNote({name:"국립중앙박물관",kind:"culture"},rain);
 assert.match(museum,/비 예보\(오후 강수확률 70%\) · 실내 전시 시설로 분류된 곳/);assert.match(museum,/기상청 단기예보 · 05:00 발표/);
 assert.match(P.hbWeatherPlaceNote({name:"서울숲",kind:"spot"},rain),/야외 공원·산책 장소 · 날씨가 나은 시간대 방문을 제안해요/);
 assert.equal(P.hbWeatherPlaceNote({name:"남산서울타워",kind:"spot"},rain),"");
 const sunny=sig(snap(day(h=>slot(h,10,20))));
 assert.match(P.hbWeatherPlaceNote({name:"경복궁",kind:"spot"},sunny),/맑고 온화한 날씨.*야외 궁궐·역사 장소로 분류된 곳/);
 assert.equal(P.hbWeatherPlaceNote({name:"국립중앙박물관",kind:"culture"},sunny),"");
 for(const [name,kind] of SHOWN)for(const g of [rain,sunny])assert.doesNotMatch(P.hbWeatherPlaceNote({name,kind},g),BANNED);
 assert.match(P.hbWeatherSuggestBanner({mode:"none",reason:"out_of_range"}),/여행일이 가까워지면 날씨를 반영해 다시 제안해요/);
 for(const reason of ["unavailable","pending"])assert.equal(P.hbWeatherSuggestBanner({mode:"none",reason}),"");
 assert.equal(P.hbWeatherSuggestBanner({mode:"neutral"}),"");
 for(const g of [rain,sunny,{mode:"none",reason:"out_of_range"}])assert.doesNotMatch(P.hbWeatherSuggestBanner(g),BANNED);
});

// ---- #/places integration: same harness shape as seasonal_recommendation.test.cjs ----
const discovery=s40.split("// BEGIN HB_DISCOVERY_EDITORIAL")[1].split("// END HB_DISCOVERY_EDITORIAL")[0];
const browseScript=s10.slice(0,s10.indexOf("function newPlan(){"))+"\n"+s10.slice(s10.indexOf("function hbBrowseText("))+"\n"+discovery+"\n"+signalSrc;
const mk=(id,name,kind)=>({featured:true,id,name,kind,address:"서울특별시 종로구 1",region:"서울",lat:37.57,lng:126.98,accessFacts:[],accessStatus:"unknown"});
const PLACES=[mk("tour-1001","경복궁","spot"),mk("tour-1002","남산서울타워","spot"),mk("tour-1003","국립중앙박물관","culture"),mk("tour-1004","서울숲","spot"),mk("tour-1005","청운문학도서관","culture")];
function browseHarness(forecast){
 let html="";const tasks=[];
 const s={region:"서울",date:DATE,hbDuration:"day",hbTransport:"car",hbParty:"2",hbWalkConfirmed:true,walk:"15",hbStairsChoice:"impossible",hbInterest:"all",
  hbMobilityAid:"none",hbFoodPreferences:[],momNeeds:[],chosen:[],stops:[],hbPlanStart:"10:00",hbPlanEnd:"18:00"};
 const node=()=>({dataset:{},onclick:null,focus(){},closest(){return null}});
 const sandbox={s,places:PLACES.map(p=>({...p})),loading:false,issue:"",hbPlacesLoadedRegion:"서울",
  el:{get innerHTML(){return html},set innerHTML(v){html=v},querySelector(){return null}},
  document:{getElementById(id){return html.includes('id="'+id+'"')?node():null},querySelectorAll(){return []},querySelector(){return {focus(){}}}},
  safe,prefs:()=>"",bindPrefs:()=>{},panel:(t,b)=>"<section><h2>"+t+"</h2>"+b+"</section>",weatherCard:()=>"",path:()=>"/places",go:()=>{},
  save:()=>{},alert:()=>{},confirm:()=>true,get:()=>Promise.reject(Error("offline")),hbApplyScheduleFromSelection:()=>true,
  hbTravelRequest:()=>Promise.resolve({eligible:[],needsReview:PLACES.map(p=>({id:p.id,reason:"insufficient_evidence"})),excluded:[]}),
  queueMicrotask:fn=>tasks.push(fn),forecast,currentWeatherKey:()=>KEY};
 vm.runInContext(browseScript,vm.createContext(sandbox),{timeout:2500});
 return {ctx:sandbox,get html(){return html},run:()=>sandbox.browse(),
  flush:async()=>{for(let i=0;i<5;i++){while(tasks.length)await tasks.shift()();await new Promise(r=>setImmediate(r));}}};
}
const listOrder=h=>[...(h.html.split('id="hb-place-results"')[1]||"").matchAll(/<h3>([^<]+)<\/h3>/g)].map(m=>m[1]);
test("rain: indoor-classified places first, outdoor last, unclassified unchanged in the middle; reason + source shown",async()=>{
 const h=browseHarness(snap(day(h=>slot(h,h>=13&&h<=16?70:10))));h.run();await h.flush();
 assert.deepEqual(listOrder(h),["국립중앙박물관","청운문학도서관","남산서울타워","경복궁","서울숲"]);
 assert.match(h.html,/날씨에 맞춘 여행지 제안/);assert.match(h.html,/<strong>비 예보\(오후 강수확률 70%\)<\/strong> · 실내 시설로 분류된 곳을 먼저 보여 드려요/);
 assert.match(h.html,/실내 전시 시설로 분류된 곳/);assert.match(h.html,/기상청 단기예보 · 05:00 발표/);
 const tower=h.html.split("<h3>남산서울타워</h3>")[1].split("</article>")[0];
 assert.doesNotMatch(tower,/data-hb-weather-fit/,"no basis -> no emphasis wording");
 assert.doesNotMatch(h.html.split("날씨에 맞춘 여행지 제안")[1],BANNED);
 assert.doesNotMatch(h.html,/hb-weather-culture|hb-weather-times|hb-weather-all/,"removed comparison UI stays off");
});
test("snow and heat use the same indoor-first order; pleasant weather puts outdoor places first",async()=>{
 for(const f of [snap(day(h=>slot(h,h===11?80:10,0,h===11?"눈":undefined))),snap(day(h=>slot(h,10,h===14?33:26)))]){
  const h=browseHarness(f);h.run();await h.flush();
  assert.deepEqual(listOrder(h).slice(0,2),["국립중앙박물관","청운문학도서관"]);
 }
 const h=browseHarness(snap(day(h=>slot(h,10,20))));h.run();await h.flush();
 assert.deepEqual(listOrder(h).slice(0,2),["경복궁","서울숲"]);
 assert.match(h.html,/공원·정원·궁궐 같은 야외 장소를 먼저 보여 드려요/);
});
test("no forecast / out of range / error: the existing order is kept; out-of-range shows only the later notice",async()=>{
 const base=browseHarness({key:"",state:"unknown"});base.run();await base.flush();
 const expected=listOrder(base);
 for(const [f,later] of [[{key:KEY,state:"no_forecast",data:{},alerts:{status:"none"}},true],[{key:KEY,state:"error",data:null,alerts:{status:"error"}},false],[{key:KEY,state:"stale",data:{precipitationType:"비"},alerts:null},false]]){
  const h=browseHarness(f);h.run();await h.flush();
  assert.deepEqual(listOrder(h),expected);
  assert.equal(/여행일이 가까워지면 날씨를 반영해 다시 제안해요/.test(h.html),later);
  assert.doesNotMatch(h.html,/날씨에 맞춘 여행지 제안|data-hb-weather-fit/);
 }
});
test("forecast arrival triggers one redraw only when the suggestion changes",async()=>{
 const h=browseHarness({key:"",state:"loading"});h.run();await h.flush();
 assert.equal(h.ctx.hbWeatherBrowseNeedsRefresh(),false);
 h.ctx.forecast=snap(day(x=>slot(x,80)));
 assert.equal(h.ctx.hbWeatherBrowseNeedsRefresh(),true);
 h.run();assert.equal(h.ctx.hbWeatherBrowseNeedsRefresh(),false);
});

// ---- Itinerary draft (30) ----
function draftCtx(extra={}){
 const ctx={JSON,Map,Set,Math,Number,String,Object,Array,Date,safe,path:()=>"/plan",...extra};
 vm.runInNewContext(draftSrc+"\n"+signalSrc+"\n"+placeSrc,ctx);return ctx;
}
const D=draftCtx();
const ALL=[{id:"park",name:"서울숲",kind:"spot"},{id:"museum",name:"국립중앙박물관",kind:"culture"},{id:"tower",name:"남산서울타워",kind:"spot"},{id:"palace",name:"경복궁",kind:"spot"},{id:"lib",name:"청운문학도서관",kind:"culture"}];
const classOf=stop=>D.hbWeatherPlaceClass(ALL.find(p=>p.id===stop.placeId)||{}).kind;
const sights=r=>JSON.parse(JSON.stringify(r.stops.filter(x=>x.placeId).map(x=>x.placeId+"@"+x.time)));
test("draft: afternoon rain moves the outdoor place to the dry morning and the indoor place to the rain hours",()=>{
 const plan=D.hbCreateSchedule(["museum","park"],ALL,{start:"10:00",end:"18:00"});
 assert.deepEqual(sights(plan),["museum@10:00","park@13:35"]);
 const before=JSON.stringify(plan.stops);
 const signal=sig(snap(day(h=>slot(h,h>=12?80:10))));
 const r=D.hbWeatherReorderStops(plan.stops,{classOf,signal});
 assert.deepEqual(sights(r),["park@10:00","museum@13:35"]);
 assert.equal(JSON.stringify(plan.stops),before,"input stops are not mutated");
 assert.deepEqual(r.stops.map(x=>[x.time,x.kind==="rest"||x.kind==="food"?x.name:"sight"]),plan.stops.map(x=>[x.time,x.kind==="rest"||x.kind==="food"?x.name:"sight"]),"time slots, meals and rests stay");
 assert.ok(r.after.outdoorBad<r.before.outdoorBad);
 assert.equal(D.hbWeatherDraftReason(signal,r.stops,classOf).applied,"오후 비 예보로 실내 일정을 오후에 배치했어요.");
 const morning=sig(snap(day(h=>slot(h,h<12?80:10))));
 const plan2=D.hbCreateSchedule(["park","museum"],ALL,{start:"10:00",end:"18:00"});
 const r2=D.hbWeatherReorderStops(plan2.stops,{classOf,signal:morning});
 assert.deepEqual(sights(r2),["museum@10:00","park@13:35"]);
 assert.equal(D.hbWeatherDraftReason(morning,r2.stops,classOf).applied,"오전 비 예보로 실내 일정을 오전에 배치했어요.");
 const hot=sig(snap(day(h=>slot(h,10,h>=12&&h<=15?33:26))));
 assert.match(D.hbWeatherDraftReason(hot,D.hbWeatherReorderStops(plan.stops,{classOf,signal:hot}).stops,classOf).applied,/^오후 더위 부담으로 실내 일정을 오후에 배치했어요\.$/);
});
test("draft: protected (must/done/reserved) stops never move; no improvement or no outdoor place -> no suggestion",()=>{
 const plan=D.hbCreateSchedule(["park","tower","museum"],ALL,{start:"10:00",end:"20:00"});
 const signal=sig(snap(day(h=>slot(h,h<12?80:10))),{start:"10:00",end:"20:00"});
 const locked=plan.stops.map(x=>x.placeId==="park"?{...x,must:true}:x);
 const r=D.hbWeatherReorderStops(locked,{classOf,signal});
 assert.equal(r,null,"the only outdoor place is protected, so nothing improves");
 for(const flag of ["done","reserved","booked","completed","mustVisit"]){
  const st=plan.stops.map(x=>x.placeId==="museum"?{...x,[flag]:true}:x);
  const out=D.hbWeatherReorderStops(st,{classOf,signal});
  if(out)assert.equal(out.stops.find(x=>x.placeId==="museum").time,st.find(x=>x.placeId==="museum").time,flag);
 }
 const dry=sig(snap(day(h=>slot(h,10,20))));
 assert.equal(D.hbWeatherReorderStops(plan.stops,{classOf,signal:dry}),null);
 const indoorOnly=D.hbCreateSchedule(["museum","lib"],ALL,{start:"10:00",end:"18:00"});
 assert.equal(D.hbWeatherReorderStops(indoorOnly.stops,{classOf,signal:sig(snap(day(h=>slot(h,90))))}),null);
 assert.equal(D.hbWeatherReorderStops(plan.stops,{classOf,signal:{mode:"adverse",hours:new Map()}}),null,"alert without hourly slots does not reorder");
 const many=Array.from({length:7},(_,i)=>({id:"p"+i,name:i?"공원"+i:"박물관",kind:i?"spot":"culture"}));
 const big=D.hbCreateSchedule(many.map(p=>p.id),many,{start:"06:00"});
 assert.equal(D.hbWeatherReorderStops(big.stops,{classOf:x=>D.hbWeatherPlaceClass(many.find(p=>p.id===x.placeId)).kind,signal:sig(snap(day(h=>slot(h,h>=12?80:10))))}),null,"above the comparison cap the original order is kept");
});
test("draft: new plan default uses the weather order only with a scoped forecast; must-visit stays",()=>{
 const state={region:"서울",date:DATE,chosen:["museum","park"],hbMustVisitIds:[]};
 const ctx=draftCtx({forecast:snap(day(h=>slot(h,h>=12?80:10))),places:ALL});
 const plan=ctx.hbCreateSchedule(state.chosen,ALL,{start:"10:00",end:"18:00"});
 const d=ctx.hbWeatherDraftForNewPlan(plan.stops,state);
 assert.deepEqual(sights({stops:d.weatherStops}),["park@10:00","museum@13:35"]);
 assert.deepEqual(sights({stops:d.originalStops}),["museum@10:00","park@13:35"]);
 assert.equal(d.message,"오후 비 예보로 실내 일정을 오후에 배치했어요.");assert.equal(d.source,"기상청 단기예보 · 05:00 발표");
 assert.equal(ctx.hbWeatherDraftForNewPlan(plan.stops,{...state,hbMustVisitIds:["museum"]}),null,"must-visit keeps its slot; only one sight left to move");
 for(const f of [{key:KEY,state:"no_forecast"},{key:KEY,state:"error"},{key:"other",state:"available",data:{hourly:day(h=>slot(h,90))}}])
  assert.equal(draftCtx({forecast:f,places:ALL}).hbWeatherDraftForNewPlan(plan.stops,state),null);
});

// ---- Plan view: applied note, 되돌리기, F14-01 proposal with approval ----
function planHarness({forecast,state}){
 let slotHtml="",stored=null;const nodes=new Map();
 const ctx=draftCtx({forecast,places:ALL,s:state,currentWeatherKey:()=>KEY,
  hbPlanContext:st=>({region:st.hbPlanInfo?.region||st.region,date:st.hbPlanInfo?.date||st.date}),
  hbTripSignature:st=>JSON.stringify([st.region,st.date,st.stops]),hbSavedTripMatches:()=>true,
  save:()=>{stored=JSON.stringify(ctx.s)},
  document:{querySelector:sel=>sel==="[data-hb-plan-weather-slot]"?{set innerHTML(v){slotHtml=v;nodes.clear()},get innerHTML(){return slotHtml}}:null,
   getElementById:id=>slotHtml.includes('id="'+id+'"')?(nodes.get(id)||nodes.set(id,{onclick:null,focus(){}}).get(id)):null}});
 ctx.hbSaveTripStops=(stops,undo)=>{ctx.s={...ctx.s,stops,hbReplanUndo:undo};ctx.save();return true};
 ctx.plan=()=>ctx.hbPlanWeatherRefresh();
 return {ctx,get html(){return slotHtml},click:id=>{const n=ctx.document.getElementById(id);assert.ok(n,id);n.onclick();},get stored(){return stored}};
}
test("plan: weather draft shows one summary line and can return to the original order and back",()=>{
 const ctx0=draftCtx({forecast:snap(day(h=>slot(h,h>=12?80:10))),places:ALL});
 const base=ctx0.hbCreateSchedule(["museum","park"],ALL,{start:"10:00",end:"18:00"}).stops;
 const st={region:"서울",date:DATE,chosen:["museum","park"],hbMustVisitIds:[]};
 const draft=ctx0.hbWeatherDraftForNewPlan(base,st);
 const h=planHarness({forecast:snap(day(x=>slot(x,x>=12?80:10))),state:{...st,stops:draft.weatherStops,hbWeatherDraft:draft}});
 h.ctx.hbPlanWeatherRefresh();
 assert.match(h.html,/data-hb-plan-weather="applied"/);assert.match(h.html,/오후 비 예보로 실내 일정을 오후에 배치했어요\./);assert.match(h.html,/기상청 단기예보 · 05:00 발표/);
 h.click("hb-weather-draft-revert");
 assert.deepEqual(sights({stops:h.ctx.s.stops}),["museum@10:00","park@13:35"]);
 assert.match(h.html,/data-hb-plan-weather="original"/);assert.match(h.html,/원래 고른 순서로 되돌렸어요/);
 h.click("hb-weather-draft-reapply");
 assert.deepEqual(sights({stops:h.ctx.s.stops}),["park@10:00","museum@13:35"]);
 // A completed stop whose time would change blocks the switch (protected schedule kept).
 h.ctx.s={...h.ctx.s,stops:h.ctx.s.stops.map(x=>x.placeId==="park"?{...x,done:true}:x)};
 h.ctx.hbPlanWeatherRefresh();h.click("hb-weather-draft-revert");
 assert.deepEqual(sights({stops:h.ctx.s.stops}),["park@10:00","museum@13:35"]);
 assert.match(h.html,/완료·필수·예약 표시가 있는 일정의 시간이 바뀌어 순서를 바꾸지 않았어요/);
 assert.doesNotMatch(h.html,BANNED);
});
test("F14-01: saved plan + new rain forecast -> side-by-side alternative; nothing changes until approval; keep dismisses",()=>{
 const ctx0=draftCtx();
 const saved=ctx0.hbCreateSchedule(["museum","park"],ALL,{start:"10:00",end:"18:00"}).stops;
 const rain=snap(day(h=>slot(h,h>=12?80:10)));
 const h=planHarness({forecast:rain,state:{region:"서울",date:DATE,stops:saved}});
 h.ctx.hbPlanWeatherRefresh();
 assert.match(h.html,/data-hb-plan-weather="proposal"/);assert.match(h.html,/지금 일정/);assert.match(h.html,/날씨 반영 대체안/);
 assert.match(h.html,/<strong>비 예보\(오후 강수확률 80%\)<\/strong> · 오후 비 예보에 맞춰 실내 일정을 오후에 둔 대체안이에요\. 적용하기 전까지 지금 일정은 그대로예요\./);
 assert.match(h.html,/\(바뀜\)/);
 assert.equal(JSON.stringify(h.ctx.s.stops),JSON.stringify(saved),"no automatic change before approval");
 h.click("hb-weather-alt-apply");
 assert.deepEqual(sights({stops:h.ctx.s.stops}),["park@10:00","museum@13:35"]);
 assert.match(h.html,/대체 일정을 적용했어요/);assert.match(h.html,/원래 순서로 되돌리기/);
 h.click("hb-weather-draft-revert");
 assert.equal(JSON.stringify(h.ctx.s.stops),JSON.stringify(saved),"revert restores the original exactly (diff 0)");
 // keep: dismissed for this forecast + this plan
 const k=planHarness({forecast:rain,state:{region:"서울",date:DATE,stops:saved}});
 k.ctx.hbPlanWeatherRefresh();k.click("hb-weather-alt-keep");
 assert.equal(JSON.stringify(k.ctx.s.stops),JSON.stringify(saved));assert.match(k.html,/지금 일정을 그대로 유지해요/);
 k.ctx.hbPlanWeatherRefresh();assert.doesNotMatch(k.html,/data-hb-plan-weather="proposal"/);
 // stale signature: another tab changed the plan -> not applied
 const c=planHarness({forecast:rain,state:{region:"서울",date:DATE,stops:saved}});
 c.ctx.hbPlanWeatherRefresh();c.ctx.hbSavedTripMatches=()=>false;c.click("hb-weather-alt-apply");
 assert.equal(JSON.stringify(c.ctx.s.stops),JSON.stringify(saved));assert.match(c.html,/다른 화면에서 일정이 바뀌었어요/);
 // error / out of range / dry forecast: no proposal
 for(const f of [{key:KEY,state:"error"},{key:KEY,state:"no_forecast"},snap(day(x=>slot(x,10,20)))]){
  const n=planHarness({forecast:f,state:{region:"서울",date:DATE,stops:saved}});n.ctx.hbPlanWeatherRefresh();assert.equal(n.html,"");
 }
});
test("wiring: plan creation stores the draft, plan view mounts the slot, forecast updates refresh, comparison flags stay off",()=>{
 const apply=between(s30,"function hbApplyScheduleFromSelection(){","\n}\n");
 assert.match(apply,/const weatherDraft=hbWeatherDraftForNewPlan\(plan\.stops,s\);/);
 assert.match(apply,/hbWeatherDraft:weatherDraft,hbWeatherDismissed:null/);
 // Weather line sits outside the tools panel, directly above the first itinerary row.
 assert.ok(s30.includes("firstRow.insertAdjacentHTML('beforebegin','<div data-hb-plan-weather-slot></div>')"));
 assert.ok(!/generator[^\n]*data-hb-plan-weather-slot/.test(s30),"not inside .hb-plan-generator");
 // Owner request 2026-11-26: the pink tools panel renders only the three view buttons; code kept behind flags.
 assert.match(s30,/const HB_PLAN_PANEL_LOCAL_NOTICE='edit';/);
 assert.match(s30,/const HB_PLAN_PANEL_TRAVEL_BASIS=false;/);assert.match(s30,/const HB_PLAN_PANEL_ENDPOINTS=false;/);
 assert.match(s30,/if\(HB_PLAN_PANEL_ENDPOINTS\)hbRenderTripEndpoints\(generator,now\);/);
 assert.match(s30,/if\(HB_PLAN_PANEL_TRAVEL_BASIS\)generator\.insertAdjacentHTML\('beforeend','<p class="hb-plan-travel-basis"/);
 assert.match(s30,/function hbRenderTripEndpoints\(generator,now\)\{/,"endpoint code preserved");
 assert.match(s40,/hbWeatherSuggestRefresh\(\);\n    \}\n  \};/);
 assert.match(s40,/const HB_WEATHER_CATEGORY_COMPARE_ENABLED=false;/);assert.match(s40,/const HB_WEATHER_TIME_COMPARE_ENABLED=false;/);
 const bundle=fs.readFileSync(path.join(__dirname,"../web/assets/scripts/00-app-core.js"),"utf8");
 for(const name of ["hbWeatherSignal","hbWeatherPlaceClass","hbWeatherReorderStops","hbPlanWeatherRefresh"])assert.ok(bundle.includes("function "+name+"("),name);
});
