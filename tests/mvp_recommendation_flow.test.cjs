"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"../web/assets/core-src/10-recommendation-and-profile.js"),"utf8");
const formEnd=source.indexOf("function newPlan(){");
const browseStart=source.indexOf("function hbBrowseText(");
assert.ok(formEnd>0&&browseStart>formEnd,"recommendation source boundaries");
// The shared IIFE supplies discovery handoff helpers; include that actual source in this isolated VM.
const discoverySource=fs.readFileSync(path.join(__dirname,"../web/assets/core-src/40-sharing-and-data.js"),"utf8");
const discovery=discoverySource.split("// BEGIN HB_DISCOVERY_EDITORIAL")[1].split("// END HB_DISCOVERY_EDITORIAL")[0];
assert.ok(discovery.includes("function hbDiscoveryPendingMarkup("));
const script=source.slice(0,formEnd)+"\n"+source.slice(browseStart)+"\n"+discovery;
const id="tour-101";
const state=extra=>({region:"서울",date:"2099-01-01",hbDuration:"day",hbTransport:"car",hbParty:"2",
  hbWalkConfirmed:true,walk:"15",hbStairsChoice:"impossible",hbInterest:"all",
  hbMobilityAid:"none",hbFoodPreferences:[],momNeeds:[],chosen:[],stops:[],...extra});
const assessment=extra=>({status:"verified",scope:"입구에서 관람 구역",verifiedAt:"2026-11-20",
  walkMinutes:10,stairsRequired:false,verifiedMobilityAids:["wheelchair","walker","cane"],verifiedFacilities:["toilet","rest"],...extra});
const place=(id,extra={})=>({id,name:"예시 장소 "+id,kind:"spot",address:"서울 중구",
  accessStatus:"info",accessFacts:[{label:"화장실",description:"화장실 안내"}],
  mobilityAssessment:assessment(),...extra});
function harness({s=state(),places=[place(id)],response={eligible:[],needsReview:[{id,reason:"insufficient_evidence"}],excluded:[],foodPreferencesApplied:false},request}={}){
  let html="",persisted="",lastRoute="";
  let nodes=new Map(),ids=new Map();
  const tasks=[];
  const app={get innerHTML(){return html},set innerHTML(value){html=value;nodes=new Map();ids=new Map()},querySelector(selector){if(selector!=='.hb-selection-list'||!html.includes('class="hb-selection-list"'))return null;return {open:html.includes('class="hb-selection-list" open'),ontoggle:null}}};
  const focus=()=>{};
  const document={
    getElementById(name){
      if(!html.includes('id="'+name+'"'))return null;
      if(!ids.has(name))ids.set(name,{value:"",onclick:null,onsubmit:null,focus});
      return ids.get(name);
    },
    querySelectorAll(selector){
      const types=[...selector.matchAll(/\[data-hb-(filter|pick|unpick|must)\]/g)].map(m=>m[1]);
      if(!types.length)return [];
      const re=/data-hb-(filter|pick|unpick|must)="([^"]+)"/g;let m;const found=[];
      while((m=re.exec(html))){
        if(!types.includes(m[1]))continue;
        const key=m[1]+":"+m[2];
        if(!nodes.has(key)){
          const dataName="hb"+m[1][0].toUpperCase()+m[1].slice(1);
          nodes.set(key,{dataset:{[dataName]:m[2]},onclick:null,focus});
        }
        found.push(nodes.get(key));
      }
      return found;
    },
    querySelector(){return {focus}}
  };
  // Legacy flow fixtures predate HB_TRIP_DATA_RULE; curation itself is covered in seasonal_recommendation.test.cjs.
  const sandbox={localStorage:{getItem:key=>key==="hamkkebom-trip-curation"?"off":null},s,places,loading:false,issue:"",hbPlacesLoadedRegion:s.region,el:app,document,
    safe:v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])),
    prefs:()=>"",bindPrefs:()=>{},panel:(title,body)=>"<section><h2>"+title+"</h2>"+body+"</section>",
    weatherCard:()=>"",path:()=>"/places",go:x=>{lastRoute=x},
    save:()=>{persisted=JSON.stringify(s)},alert:()=>{},
    hbTravelRequest:request||(()=>Promise.resolve(response)),
    hbApplyScheduleFromSelection:()=>{s.stops=s.chosen.map((placeId,i)=>({id:placeId,placeId,kind:"spot",must:false,position:i+1}));return true},
    queueMicrotask:fn=>{tasks.push(fn)}
  };
  vm.runInContext(script,vm.createContext(sandbox),{timeout:2500});
  return {ctx:sandbox,s,app,tasks,
    get html(){return html},get persisted(){return persisted},get route(){return lastRoute},
    node:(type,value)=>nodes.get(type+":"+value),
    getId:name=>document.getElementById(name),
    run:()=>sandbox.browse(),
    flush:async()=>{while(tasks.length)await tasks.shift()()}
  };
}
test("missing walking route is review even when public toilet exists",()=>{
  const h=harness(),p=place(id,{mobilityAssessment:null}),profile={walk:"15",stairsMode:"impossible",needs:["toilet"],mobilityAid:"wheelchair"};
  assert.equal(h.ctx.hbEvaluatePlace(p,profile).status,"review");
  assert.equal(h.ctx.hbReconcileRecommendation(p,profile,null).status,"needsReview");
  assert.equal(h.ctx.hbReconcileRecommendation(place(id),{walk:"15",stairsMode:"possible",needs:[],mobilityAid:"none"},null).status,"needsReview");
});
test("verified required stairs exclude impossible but not merely avoided stairs",()=>{
  const h=harness(),p=place(id,{mobilityAssessment:assessment({stairsRequired:true})});
  assert.equal(h.ctx.hbEvaluatePlace(p,{walk:"15",stairsMode:"impossible",needs:[],mobilityAid:"none"}).status,"excluded");
  assert.equal(h.ctx.hbReconcileRecommendation(p,{walk:"15",stairsMode:"impossible",needs:[],mobilityAid:"none"},null).status,"excluded");
  assert.equal(h.ctx.hbReconcileRecommendation(p,{walk:"15",stairsMode:"avoid",needs:[],mobilityAid:"none"},null).status,"needsReview");
});
test("wheelchair, walker and cane require matching documented route",()=>{
  const h=harness(),profile={walk:"15",stairsMode:"impossible",needs:[],mobilityAid:"wheelchair"};
  assert.equal(h.ctx.hbEvaluatePlace(place(id,{mobilityAssessment:assessment({verifiedMobilityAids:["cane"]})}),profile).status,"review");
  assert.equal(h.ctx.hbEvaluatePlace(place(id),profile).status,"confirmed");
  assert.equal(h.ctx.hbEvaluatePlace(place(id),{...profile,mobilityAid:"walker"}).status,"confirmed");
  assert.equal(h.ctx.hbEvaluatePlace(place(id,{mobilityAssessment:null}),{...profile,mobilityAid:"cane"}).status,"review");
  assert.equal(h.ctx.hbEvaluatePlace(place(id,{accessFacts:[{label:"장애인 화장실"}],mobilityAssessment:null}),profile).status,"review");
});
test("slope and environment restrictions do not infer accessible route",()=>{
  const h=harness(),p=place(id),base={walk:"15",stairsMode:"possible",needs:[],mobilityAid:"none"};
  assert.equal(h.ctx.hbEvaluatePlace(p,{...base,slopePreference:"avoid_steep"}).status,"review");
  assert.equal(h.ctx.hbEvaluatePlace(p,{...base,indoorPreference:"indoor"}).status,"review");
  assert.equal(h.ctx.hbTravelInput(state({hbRestIntervalMinutes:45}),"2026-11-23").input.restIntervalMinutes,45);
});
test("conflicting and stale sources never appear verified",()=>{
  const h=harness(),base={walk:"15",stairsMode:"possible",needs:[],mobilityAid:"none"};
  for(const status of ["conflicting","stale"]){
    assert.equal(h.ctx.hbEvaluatePlace(place(id,{accessStatus:status}),base).status,"review");
    assert.equal(h.ctx.hbReconcileRecommendation(place(id,{accessStatus:status}),base,null).status,"needsReview");
  }
});
test("server groups normalize to exact safe status contract",()=>{
  const h=harness(),f=h.ctx.hbNormalizeRecommendationResponse;
  let r=f({eligible:[{id,reason:"documented_route"}],needsReview:[{id:"food-1",reason:"stale_evidence"}],
    excluded:[{id:"tour-999",reason:"required_stairs"}]});
  assert.equal(r.byId.get(id).status,"eligible");
  assert.equal(r.byId.get("food-1").status,"needsReview");
  assert.equal(r.byId.get("tour-999").status,"excluded");
  r=f({eligible:[{id},{id:"../bad",reason:"documented_route"}],needsReview:[],excluded:[{id:"food-1",reason:"unsupported"}]});
  assert.equal(r.byId.get(id).status,"needsReview");
  assert.equal(r.byId.has("../bad"),false);
  assert.equal(r.byId.get("food-1").status,"needsReview");
  assert.throws(()=>f({eligible:[{id,reason:"documented_route"}],needsReview:[],excluded:[{id,reason:"required_stairs"}]}));
  assert.throws(()=>f({eligible:null,needsReview:[],excluded:[]}));
});
test("tourism and food filtering, invalid IDs and category display",()=>{
  const h=harness(),items=[place("tour-1"),place("food-1",{kind:"food",name:"식당",accessFacts:[]}),
    place("../bad"),place("tour-2",{name:"",kind:"culture"}),place("tour-3",{name:"박물관",kind:"culture"})];
  assert.equal(h.ctx.hbSearchPlaces(items,"spot","").length,2);
  assert.equal(h.ctx.hbSearchPlaces(items,"food","").length,1);
  assert.equal(h.ctx.hbSearchPlaces(items,"all","박물관").length,1);
  assert.equal(h.ctx.hbPlaceCategory(items[1]),"식당");
  assert.equal(h.ctx.hbPlaceDetailPath("tour-1"),"#/place/tour-1");
});
test("automatic server eligibility replaces local provisional label",async()=>{
  const h=harness({response:{eligible:[{id,reason:"documented_route"}],needsReview:[],excluded:[],foodPreferencesApplied:false}});
  h.run();
  assert.match(h.html,/서버에서 이동 조건을 확인하고/);
  assert.doesNotMatch(h.html,/서버 기준 조건 일치/);
  await h.flush();
  assert.match(h.html,/서버 기준 조건 일치/);
  assert.match(h.html,/상세 정보/);
  assert.match(h.html,/일정에 담기/);
});
test("zero server recommendation is not an API error",async()=>{
  const h=harness({response:{eligible:[],needsReview:[],excluded:[],foodPreferencesApplied:false}});
  h.run();await h.flush();
  assert.match(h.html,/서버 추천 결과 0건/);
  assert.doesNotMatch(h.html,/서버 추천 API 오류/);
  assert.match(h.html,/접근성 확인 필요/);
});
test("API failure clearly differs from empty recommendations and can retry",async()=>{
  let calls=0;
  const h=harness({request:async()=>{calls++;if(calls===1)throw Error("502");return {eligible:[],needsReview:[],excluded:[]}}});
  h.run();await h.flush();
  assert.match(h.html,/서버 추천 API 오류/);
  assert.doesNotMatch(h.html,/서버 추천 결과 0건/);
  h.getId("hb-recommend-retry").onclick();
  await h.flush();
  assert.equal(calls,2);assert.match(h.html,/서버 추천 결과 0건/);
});
test("unsupported food preferences are disclosed and not inferred as filters",async()=>{
  const h=harness({s:state({hbBrowseFilter:"food",hbFoodPreferences:["vegetarian"]}),
    places:[place("food-1",{kind:"food"})],
    response:{eligible:[],needsReview:[{id:"food-1",reason:"insufficient_evidence"}],excluded:[],foodPreferencesApplied:false}});
  h.run();await h.flush();
  assert.match(h.html,/식당 자동 필터에 반영하지 않아요/);
  assert.match(h.html,/식당/);
});
test("selected places remain unique and survive search, category changes and reload",()=>{
  const h=harness({places:[place(id),place("food-1",{kind:"food"})]});
  h.run();
  h.node("pick",id).onclick();
  assert.equal(h.s.chosen.join(","),id);
  h.node("pick",id).onclick();assert.equal(h.s.chosen.length,0);
  h.node("pick",id).onclick();
  h.node("filter","food").onclick();
  assert.equal(h.s.chosen.join(","),id);
  h.getId("hb-place-search").value="식당";
  h.getId("hb-browse-search").onsubmit({preventDefault(){}});
  assert.equal(h.s.chosen.join(","),id);
  const restored=harness({s:JSON.parse(h.persisted),places:[place(id),place("food-1",{kind:"food"})]});
  restored.run();
  assert.match(restored.html,/일정에 담은 장소 <span class="hb-selection-count">1<\/span>곳/);
  assert.equal(restored.s.chosen[0],id);
});
test("must-visit selection persists and maps into itinerary stop.must",()=>{
  const h=harness({places:[place(id)]});
  h.run();h.node("pick",id).onclick();
  h.node("must",id).onclick();
  assert.equal(h.s.hbMustVisitIds.join(","),id);
  const restored=harness({s:JSON.parse(h.persisted),places:[place(id)]});
  restored.run();
  assert.match(restored.html,/필수 방문지 ✓/);
  assert.equal(restored.getId("build").disabled,undefined);
  assert.equal(restored.getId("build").onclick(),true);
  assert.equal(restored.s.stops[0].must,true);
  assert.equal(restored.route,"/plan");
  assert.ok(JSON.parse(restored.persisted).stops[0].must);
});
test("previous selections are deduplicated and missing place data is handled",()=>{
  const h=harness({s:state({chosen:[id,id,null,"bad/id","tour-missing"],hbMustVisitIds:[id]}),places:[place(id)]});
  h.run();
  assert.match(h.html,/일정에 담은 장소 <span class="hb-selection-count">2<\/span>곳/);
  assert.match(h.html,/이전에 담은 장소/);
  assert.equal(h.ctx.hbUniquePlaceIds(h.s.chosen).length,2);
});
test("server exclusions block new picks and schedule submission of preselected IDs",async()=>{
  const h=harness({s:state({chosen:[id]}),response:{eligible:[],needsReview:[],excluded:[{id,reason:"required_stairs"}]}});
  h.run();await h.flush();
  assert.match(h.html,/이동 조건 충돌/);
  assert.equal(h.getId("build").onclick(),false);
  assert.equal(h.s.stops.length,0);
});
test("invalid form does not claim a server result or send an API request",async()=>{
  let calls=0;
  const h=harness({s:state({hbWalkConfirmed:false,hbStairsChoice:null}),
    request:async()=>{calls++;return {eligible:[],needsReview:[],excluded:[]}}});
  h.run();await h.flush();
  assert.equal(calls,0);
  assert.match(h.html,/이동 조건을 입력하면/);
});


test("conflicting or stale catalog evidence downgrades a contrary server decision",async()=>{
  for(const accessStatus of ["conflicting","stale"]){
    const h=harness({places:[place(id,{accessStatus})],
      response:{eligible:[{id,reason:"documented_route"}],needsReview:[],excluded:[]}});
    h.run();await h.flush();
    assert.doesNotMatch(h.html,/서버 기준 조건 일치/);
    assert.match(h.html,accessStatus==="conflicting"?/자료 상충/:/오래되어/);
  }
});
test("food preference application requires explicit supported preference codes",async()=>{
  const h=harness({s:state({hbFoodPreferences:["vegetarian","less_spicy"]}),
    response:{eligible:[],needsReview:[],excluded:[],foodPreferencesApplied:true,appliedFoodPreferences:["vegetarian"]}});
  h.run();await h.flush();
  assert.match(h.html,/식당 자동 필터에 반영하지 않아요/);
  const accepted=h.ctx.hbNormalizeRecommendationResponse({eligible:[],needsReview:[],excluded:[],
    foodPreferencesApplied:true,appliedFoodPreferences:["vegetarian"]});
  assert.equal(accepted.foodPreferencesApplied,true);
  assert.equal(accepted.appliedFoodPreferences.length,1);
});
test("a stale request cannot overwrite the result for newly chosen walking minutes",async()=>{
  const pending=[];
  const h=harness({request:()=>new Promise(resolve=>pending.push(resolve))});
  h.run();
  const previous=h.tasks.shift()();
  h.s.walk="10";h.run();
  const latest=h.tasks.shift()();
  pending[1]({eligible:[],needsReview:[{id,reason:"insufficient_evidence"}],excluded:[]});
  await latest;
  pending[0]({eligible:[{id,reason:"documented_route"}],needsReview:[],excluded:[]});
  await previous;
  assert.match(h.html,/서버 추천 판정/);
  assert.doesNotMatch(h.html,/서버 기준 조건 일치/);
});
