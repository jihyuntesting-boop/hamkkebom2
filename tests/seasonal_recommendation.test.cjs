"use strict";
// REC-04 / F02-03 / UI-03 (ADR-008): travel-date season + mobility groups on #/places.
// Fixtures only; no live TourAPI/featured/recommend calls.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"../web/assets/core-src/10-recommendation-and-profile.js"),"utf8");
const formEnd=source.indexOf("function newPlan(){");
const browseStart=source.indexOf("function hbBrowseText(");
assert.ok(formEnd>0&&browseStart>formEnd);
assert.ok(source.includes("// BEGIN HB_SEASONAL_RECOMMENDATION")&&source.includes("// END HB_SEASONAL_RECOMMENDATION"));
const discoverySource=fs.readFileSync(path.join(__dirname,"../web/assets/core-src/40-sharing-and-data.js"),"utf8");
const discovery=discoverySource.split("// BEGIN HB_DISCOVERY_EDITORIAL")[1].split("// END HB_DISCOVERY_EDITORIAL")[0];
const script=source.slice(0,formEnd)+"\n"+source.slice(browseStart)+"\n"+discovery;

const state=extra=>({region:"서울",date:"2099-01-10",hbDuration:"day",hbTransport:"car",hbParty:"2",
  hbWalkConfirmed:true,walk:"15",hbStairsChoice:"impossible",hbInterest:"all",
  hbMobilityAid:"none",hbFoodPreferences:[],momNeeds:[],chosen:[],stops:[],...extra});
const verified=extra=>({status:"verified",scope:"입구에서 관람 구역",verifiedAt:"2026-11-20",
  walkMinutes:10,stairsRequired:false,verifiedMobilityAids:[],verifiedFacilities:[],...extra});
const museum={featured:true,id:"tour-129703",name:"국립중앙박물관",kind:"culture",address:"서울특별시 용산구 서빙고로 137",region:"서울",lat:37.52,lng:126.98,accessFacts:[],accessStatus:"unknown"};
const ddp={featured:true,id:"tour-2470006",name:"동대문디자인플라자(DDP)",kind:"spot",address:"서울특별시 중구 을지로 281",region:"서울",lat:37.56,lng:127.01,accessFacts:[],accessStatus:"unknown"};
const forest={featured:true,id:"tour-128611",name:"서울숲",kind:"spot",address:"서울특별시 성동구 뚝섬로 273",region:"서울",lat:37.54,lng:127.04,accessFacts:[],accessStatus:"unknown"};
const olympic={featured:true,id:"tour-126532",name:"올림픽공원",kind:"spot",address:"서울특별시 송파구 올림픽로 424",region:"서울",lat:37.52,lng:127.12,accessFacts:[],accessStatus:"unknown"};
const palace={featured:true,id:"tour-126508",name:"경복궁",kind:"spot",address:"서울특별시 종로구 사직로 161",region:"서울",lat:37.576,lng:126.977,accessFacts:[],accessStatus:"unknown"};
const hanok={featured:true,id:"tour-126537",name:"북촌한옥마을",kind:"spot",address:"서울특별시 종로구 계동길 37",region:"서울",lat:37.579,lng:126.987,accessFacts:[],accessStatus:"unknown"};
const food={id:"tour-900001",name:"궁중 한정식",kind:"food",address:"서울특별시 종로구 1",region:"서울",accessFacts:[],accessStatus:"unknown"};
const suwon={id:"tour-125555",name:"수원 화성",kind:"spot",address:"경기도 수원시 팔달구",region:"경기",accessFacts:[],accessStatus:"unknown"};

function harness({s=state(),places=[museum,ddp,forest,olympic],response=null,featured=null,request=null,storage=null}={}){
  let html="",persisted="";
  let nodes=new Map();
  const tasks=[],fetched=[];
  const app={get innerHTML(){return html},set innerHTML(value){html=value;nodes=new Map()},querySelector(){return null}};
  const node=(name,value)=>{
    const key=name+":"+value;
    if(!nodes.has(key)){
      const dataName="hb"+name.split("-").map(x=>x[0].toUpperCase()+x.slice(1)).join("");
      nodes.set(key,{dataset:{[dataName]:value},onclick:null,focus(){},closest(sel){return sel===".hb-seasonal"&&value.startsWith("seasonal-")?{}:null}});
    }
    return nodes.get(key);
  };
  const document={
    getElementById(name){return html.includes('id="'+name+'"')?node("id",name):null},
    querySelectorAll(selector){
      const names=[...selector.matchAll(/\[data-hb-([a-z-]+)\]/g)].map(m=>m[1]);
      const found=[];const re=/data-hb-([a-z-]+)="([^"]+)"/g;let m;
      while((m=re.exec(html)))if(names.includes(m[1]))found.push(node(m[1],m[2]));
      return found;
    },
    querySelector(){return {focus(){}}}
  };
  const recommend=response||{eligible:[],needsReview:places.map(p=>({id:p.id,reason:"insufficient_evidence"})),excluded:[],foodPreferencesApplied:false};
  const sandbox={...(storage?{localStorage:{getItem:k=>storage[k]??null}}:{}),s,places,loading:false,issue:"",hbPlacesLoadedRegion:s.region,el:app,document,
    safe:v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])),
    prefs:()=>"",bindPrefs:()=>{},panel:(title,body)=>"<section><h2>"+title+"</h2>"+body+"</section>",
    weatherCard:()=>"",path:()=>"/places",go:()=>{},
    save:()=>{persisted=JSON.stringify(s)},alert:()=>{},confirm:()=>true,
    hbTravelRequest:request||(()=>Promise.resolve(recommend)),
    get:url=>{fetched.push(url);return featured?Promise.resolve(featured):Promise.reject(Error("offline"))},
    hbApplyScheduleFromSelection:()=>true,
    queueMicrotask:fn=>{tasks.push(fn)}
  };
  vm.runInContext(script,vm.createContext(sandbox),{timeout:2500});
  return {ctx:sandbox,s,fetched,node,
    get html(){return html},get persisted(){return persisted},
    run:()=>sandbox.browse(),
    flush:async()=>{for(let i=0;i<5;i++){while(tasks.length)await tasks.shift()();await new Promise(r=>setImmediate(r));}}
  };
}
const plain=x=>JSON.parse(JSON.stringify(x));
const seasonalHtml=h=>h.html.split('class="panel hb-seasonal"')[1].split("</section>")[0];

test("season follows the travel calendar date at every month boundary",()=>{
  const {ctx}=harness();
  const cases=[["2026-02-28","winter"],["2028-02-29","winter"],["2026-03-01","spring"],["2026-05-31","spring"],
    ["2026-06-01","summer"],["2026-08-31","summer"],["2026-09-01","autumn"],["2026-11-30","autumn"],["2026-12-01","winter"],["2027-01-01","winter"]];
  for(const [date,season] of cases){
    const r=ctx.hbTravelSeason(date,"2026-11-26");
    assert.equal(r.season,season,date);assert.equal(r.basis,"travel_date");assert.equal(r.date,date);
  }
  assert.equal(ctx.hbTravelSeason("2026-11-30","2026-12-25").season,"autumn","travel date wins over today");
});
test("invalid travel date falls back to today in Asia/Seoul, not UTC",()=>{
  const {ctx}=harness();
  assert.equal(ctx.hbSeasonalTodaySeoul(new Date("2026-11-30T14:59:59Z")),"2026-11-30");
  assert.equal(ctx.hbSeasonalTodaySeoul(new Date("2026-11-30T15:00:00Z")),"2026-12-01");
  const before=ctx.hbTravelSeason("2026-02-30",ctx.hbSeasonalTodaySeoul(new Date("2026-11-30T14:59:59Z")));
  const after=ctx.hbTravelSeason("",ctx.hbSeasonalTodaySeoul(new Date("2026-11-30T15:00:00Z")));
  assert.deepEqual([before.season,before.basis],["autumn","today"]);
  assert.deepEqual([after.season,after.basis,after.date],["winter","today","2026-12-01"]);
});
test("normal winter result: editorial course and culture places, needsReview when evidence is missing",async()=>{
  const h=harness();
  h.run();await h.flush();
  const part=seasonalHtml(h);
  assert.match(part,/여행 날짜 2099-01-10 기준 겨울이에요/);
  assert.match(part,/서울 문화와 디자인 나들이/);
  assert.match(part,/data-hb-season-course="editorial-art"/);
  assert.match(part,/국립중앙박물관/);assert.match(part,/동대문디자인플라자/);
  assert.doesNotMatch(part,/서울숲|올림픽공원/,"spring/autumn park course is not a winter idea");
  assert.doesNotMatch(part,/미확인|미지원|확인되지 않|확인 안 됨/);
  assert.match(part,/접근성 확인 필요/);
  assert.doesNotMatch(part,/이동시간·경로·보행 난이도는 계산하지 않았어요|보장하지 않아요/,"2026-11-26 사용자 결정: 코스 카드 보행 안내 비노출");
  assert.doesNotMatch(part,/[0-9]+분 이동|안전한 코스|이동 가능 보장/);
  const rows=h.ctx.hbSeasonalPlaces(h.ctx.places,"winter","서울",p=>({status:"needsReview",score:0}));
  assert.deepEqual(plain(rows.shown.map(x=>[x.p.id,x.basis])),[[museum.id,"editorial_course"],[ddp.id,"editorial_course"]]);
});
test("spring date changes the same trip to park and palace ideas",async()=>{
  const h=harness({s:state({date:"2099-04-02"}),places:[museum,ddp,forest,olympic,palace,hanok,food]});
  h.run();await h.flush();
  const part=seasonalHtml(h);
  assert.match(part,/기준 봄이에요/);
  assert.match(part,/서울의 푸른 공원 두 곳/);assert.match(part,/서울 궁궐과 한옥 골목 나들이/);
  assert.doesNotMatch(part,/궁중 한정식/,"restaurants are not season-themed places");
});
test("verified condition conflict is excluded from season places and from course picks",async()=>{
  const blocked={...museum,mobilityAssessment:verified({stairsRequired:true})};
  const h=harness({places:[blocked,ddp],response:{eligible:[],needsReview:[{id:ddp.id,reason:"insufficient_evidence"}],excluded:[{id:blocked.id,reason:"required_stairs"}],foodPreferencesApplied:false}});
  h.run();await h.flush();h.run();
  const part=seasonalHtml(h);
  assert.match(part,/조건 충돌 1/);
  assert.match(part,/계절 추천에서 제외한 장소 1곳/);
  assert.match(part,/이 코스 장소 담기 \(1곳\)/);
  h.node("season-course-pick","editorial-art").onclick();
  assert.deepEqual(plain(h.s.chosen),[ddp.id]);
  assert.deepEqual(plain(h.s.stops),[],"no schedule is generated or replaced");
  assert.match(h.html,/1곳을 담았어요. 일정은 아직 만들지 않았고 기존 일정도 바뀌지 않았어요/);
  const view=h.ctx.hbSeasonalPlaces([blocked,ddp],"winter","서울",p=>({status:p.id===blocked.id?"excluded":"needsReview",score:0}));
  assert.deepEqual(plain(view.shown.map(x=>x.p.id)),[ddp.id]);
  assert.equal(h.ctx.hbSeasonalComposedCourses(view.shown.concat(view.excluded)).length,0,"composed course never uses excluded rows");
});
test("server eligible places rank before review places and keep the existing reason text",async()=>{
  const ok={...ddp,mobilityAssessment:verified()};
  const h=harness({places:[museum,ok],response:{eligible:[{id:ok.id,reason:"documented_route"}],needsReview:[{id:museum.id,reason:"insufficient_evidence"}],excluded:[],foodPreferencesApplied:false}});
  h.run();await h.flush();h.run();
  const part=seasonalHtml(h);
  const grid=part.split("테마 추천 장소")[1];
  assert.ok(grid.indexOf("동대문디자인플라자")<grid.indexOf("국립중앙박물관"));
  assert.match(part,/조건 일치 1 · 확인 필요 1 · 조건 충돌 0/);
  assert.match(part,/서버 기준 조건 일치/);
});
test("no data: nothing seasonal, no relaxation, unresolved editorial course hidden and lookup failure stated",async()=>{
  const plain={id:"tour-5",name:"예시 장소",kind:"spot",address:"서울특별시 중구 1",region:"서울",accessFacts:[],accessStatus:"unknown"};
  const h=harness({places:[plain]});
  h.run();await h.flush();
  const part=seasonalHtml(h);
  assert.match(part,/겨울 테마와 맞는 장소를 찾지 못했어요. 조건을 자동으로 완화하지 않았어요/);
  assert.match(part,/코스 후보를 만들지 못했어요/);
  assert.match(part,/편집 코스 1개는 표시하지 않았어요. 편집 코스 장소 조회에 실패했어요/);
  assert.equal(h.fetched.length,1);assert.match(h.fetched[0],/featured\.js\?.*region=%EC%84%9C%EC%9A%B8/);
  h.run();await h.flush();
  assert.equal(h.fetched.length,1,"bounded: one lookup per region");
});
test("featured lookup completes an editorial course only with exact IDs in the trip region",async()=>{
  const featured={places:[{...museum,address:"서울특별시 용산구"},{...ddp,address:"경기도 수원시"}]};
  const h=harness({places:[],featured});
  h.run();await h.flush();
  assert.doesNotMatch(seasonalHtml(h),/data-hb-season-course="editorial-art"/,"wrong-region record does not complete a course");
  const ok=harness({places:[],featured:{places:[{...museum,address:"서울특별시 용산구"},{...ddp,address:"서울특별시 중구"}]}});
  ok.run();await ok.flush();
  assert.match(seasonalHtml(ok),/data-hb-season-course="editorial-art"/);
  ok.node("season-course-pick","editorial-art").onclick();
  assert.deepEqual(plain(ok.s.chosen),[museum.id,ddp.id]);
  assert.ok(ok.ctx.places.every(p=>p.hbPickedRegion==="서울"&&p.accessStatus==="unknown"),"picked course stops carry no invented accessibility");
});
test("region mismatch and missing address never join a seasonal list",()=>{
  const {ctx}=harness();
  assert.equal(ctx.hbSeasonalRegionMatch(suwon,"서울"),false);
  assert.equal(ctx.hbSeasonalRegionMatch({id:"tour-1",name:"x"},"서울"),false);
  assert.equal(ctx.hbSeasonalRegionMatch({areaCode:"31",region:"서울"},"서울"),false);
  assert.equal(ctx.hbSeasonalDistrict("경기도 수원시 팔달구 정조로"),"수원시");
  assert.equal(ctx.hbSeasonalDistrict("서울특별시 종로구 사직로"),"종로구");
  assert.equal(ctx.hbSeasonalDistrict(""),null);
  const rows=ctx.hbSeasonalPlaces([suwon,museum],"spring","서울",()=>({status:"needsReview",score:0}));
  assert.deepEqual(plain(rows.shown.map(x=>x.p.id)),[]);
});
test("composed courses group same-district places and skip editorial duplicates",()=>{
  const {ctx}=harness();
  const e={status:"needsReview",score:0};
  const rows=[palace,hanok].map(p=>({p,e,basis:"name_keyword"}));
  const composed=ctx.hbSeasonalComposedCourses(rows);
  assert.equal(composed.length,1);assert.equal(composed[0].district,"종로구");assert.equal(composed[0].id,"auto-1");
  const editorial=[{complete:true,stops:[{p:palace},{p:hanok}]}];
  assert.equal(ctx.hbSeasonalComposedCourses(rows,editorial).length,0);
});
test("missing travel conditions still show season ideas but never a server fit",async()=>{
  const h=harness({s:state({hbWalkConfirmed:false})});
  h.run();await h.flush();
  const part=seasonalHtml(h);
  assert.match(part,/겨울 여행 추천/);
  assert.doesNotMatch(part,/서버 기준 조건 일치/);
});

// ---- HB_TRIP_DATA_RULE: 여행 장소 찾기 shows only data-sufficient places ----
const lib={id:"tour-3432213",name:"논현문화마루도서관",kind:"culture",address:"서울특별시 강남구 논현로131길 40",region:"서울",lat:37.51,lng:127.02,accessStatus:"info",
  accessFacts:[{label:"엘리베이터",description:"엘리베이터 있음",status:"source_reported"}]};
const bare={id:"tour-700001",name:"자료 부족 관광지",kind:"spot",address:"서울특별시 중구 1",region:"서울",lat:37.56,lng:126.98,accessFacts:[],accessStatus:"unverified"};
const restaurant={id:"tour-700002",name:"자료 있는 식당",kind:"food",address:"서울특별시 중구 2",region:"서울",lat:37.56,lng:126.98,accessFacts:[{label:"주차",description:"주차 가능",status:"source_reported"}]};
const noCoords={...lib,id:"tour-700003",name:"좌표 없는 도서관",lat:undefined,lng:undefined};
const otherRegion={...lib,id:"tour-700004",name:"경기 도서관",address:"경기도 시흥시 은행로 1"};
const resultsHtml=h=>h.html.split('id="hb-place-results"')[1]||"";

test("data rule: identity, category, coordinates, region address and one concrete signal",()=>{
  const {ctx}=harness();
  assert.deepEqual(plain(ctx.hbTripDataEvidence(lib,"서울")),{ok:true,signals:["access_facts"],missing:[],factCount:1});
  assert.deepEqual(plain(ctx.hbTripDataEvidence(museum,"서울").signals),["editorial_featured"]);
  assert.deepEqual(plain(ctx.hbTripDataEvidence(bare,"서울").missing),["concrete_data"]);
  assert.deepEqual(plain(ctx.hbTripDataEvidence(restaurant,"서울").missing),["kind"]);
  assert.deepEqual(plain(ctx.hbTripDataEvidence(noCoords,"서울").missing),["coordinates"]);
  assert.deepEqual(plain(ctx.hbTripDataEvidence(otherRegion,"서울").missing),["address"]);
  assert.equal(ctx.hbTripCurationEnabled(),true,"rule is on by default");
});
test("방문 전 확인할 장소 lists only qualified places and states the hidden count",async()=>{
  const h=harness({places:[lib,museum,bare,restaurant,noCoords]});
  h.run();await h.flush();
  const list=resultsHtml(h);
  assert.match(list,/방문 전 확인할 장소 <span class="hb-result-count">2곳/);
  assert.match(list,/논현문화마루도서관/);assert.match(list,/국립중앙박물관/);
  for(const name of ["자료 부족 관광지","자료 있는 식당","좌표 없는 도서관"])assert.doesNotMatch(h.html,new RegExp(name),name);
  assert.match(h.html,/정보가 부족한 장소 3곳은 숨겼어요/);
  assert.equal(h.ctx.places.length,5,"hidden places are not deleted");
});
test("saved itinerary and already chosen places stay visible even if they miss the rule",async()=>{
  const h=harness({s:state({chosen:[restaurant.id],stops:[{id:"s1",placeId:bare.id,name:bare.name}]}),places:[lib,bare,restaurant,noCoords]});
  h.run();await h.flush();
  assert.match(resultsHtml(h),/자료 부족 관광지/);assert.match(resultsHtml(h),/자료 있는 식당/);
  assert.doesNotMatch(h.html,/좌표 없는 도서관/);
  assert.match(h.html,/저장된 일정·담은 장소 2곳은 기준과 관계없이 그대로 보여요/);
  assert.match(h.html,/정보가 부족한 장소 1곳은 숨겼어요/);
});
test("one switch restores every place",async()=>{
  const h=harness({places:[lib,bare],storage:{"hamkkebom-trip-curation":"off"}});
  h.run();await h.flush();
  assert.match(resultsHtml(h),/자료 부족 관광지/);
  assert.doesNotMatch(h.html,/숨겼어요/);
});
test("finishing conditions shows the condition result automatically with honest zero-fit guidance",async()=>{
  const h=harness({places:[lib,museum,bare]});
  h.run();
  assert.match(h.html,/서버에서 이동 조건을 확인하고 있어요/);
  await h.flush();
  assert.match(h.html,/걷기 15분 · 계단 이용 불가 조건 결과<\/strong>: 조건 일치 0곳 · 방문 전 확인 2곳 · 조건 충돌 0곳/);
  assert.match(h.html,/걷기 시간을 늘려도 동선 검증 자료가 없으면 결과는 같아요/);
  assert.match(h.html,/data-hb-quick-walk="15" aria-pressed="true"/);
});
test("changing a condition on the result screen re-requests and recomputes",async()=>{
  const sent=[];
  const request=(url,input)=>{sent.push(input);return Promise.resolve({eligible:input.walkingMinutes>=30?[{id:lib.id,reason:"documented_route"}]:[],needsReview:input.walkingMinutes>=30?[{id:museum.id,reason:"insufficient_evidence"}]:[lib,museum].map(p=>({id:p.id,reason:"insufficient_evidence"})),excluded:[],foodPreferencesApplied:false});};
  const ok={...lib,mobilityAssessment:verified({walkMinutes:25})};
  const h=harness({places:[ok,museum],request});
  h.run();await h.flush();
  assert.equal(sent.at(-1).walkingMinutes,15);
  assert.match(h.html,/조건 일치 0곳/);
  h.node("quick-walk","30").onclick();
  await h.flush();
  assert.equal(h.s.walk,"30");assert.equal(h.s.hbWalkConfirmed,true);
  assert.equal(sent.at(-1).walkingMinutes,30);
  assert.match(h.html,/걷기 30분 · 계단 이용 불가 조건 결과<\/strong>: 조건 일치 1곳 · 방문 전 확인 1곳/);
  h.node("quick-stairs","possible").onclick();
  await h.flush();
  assert.equal(h.s.hbStairsChoice,"possible");assert.equal(sent.at(-1).stairs,"possible");
});
test("all candidates in conflict suggest a concrete stairs change",async()=>{
  const a={...lib,mobilityAssessment:verified({stairsRequired:true})};
  const h=harness({places:[a],response:{eligible:[],needsReview:[],excluded:[{id:a.id,reason:"required_stairs"}],foodPreferencesApplied:false}});
  h.run();await h.flush();
  assert.match(h.html,/모든 후보가 확인된 이동 조건과 충돌해요. 아래에서 계단 조건을/);
});
test("zero qualified places: no list, reason and hidden count, no relaxation",async()=>{
  const h=harness({places:[bare,restaurant]});
  h.run();await h.flush();
  assert.match(h.html,/정보가 충분한 장소가 없어 목록을 표시하지 않았어요. 정보가 부족한 장소 2곳은 숨겼어요/);
  assert.match(h.html,/정보가 충분한 관광지·문화시설을 찾지 못했어요/);
  assert.doesNotMatch(h.html,/data-hb-pick=/);
});
test("recommendation API failure is an error, never a fit, and offers retry",async()=>{
  const h=harness({places:[lib,museum],request:()=>Promise.reject(Error("503"))});
  h.run();await h.flush();
  assert.match(h.html,/서버 추천 API 오류/);
  assert.match(h.html,/id="hb-recommend-retry"/);
  assert.doesNotMatch(h.html,/서버 기준 조건 일치/);
  assert.match(resultsHtml(h),/논현문화마루도서관/,"qualified candidates remain as review-only");
});
test("featured-only candidate can be picked and is added to the place list once",async()=>{
  const h=harness({places:[lib],featured:{places:[{...museum,address:"서울특별시 용산구 서빙고로 137"}]}});
  h.run();await h.flush();h.run();
  assert.match(resultsHtml(h),/국립중앙박물관/);
  h.node("pick",museum.id).onclick();
  assert.deepEqual(plain(h.s.chosen),[museum.id]);
  assert.equal(h.ctx.places.filter(p=>p.id===museum.id).length,1);
});
test("featured lookup redraws only when it changes the view",async()=>{
  let draws=0;
  // hbWalkConfirmed:false sends no recommend request, isolating the featured lookup redraw.
  const h=harness({s:state({hbWalkConfirmed:false}),places:[museum,ddp],featured:{places:[{...museum,address:"서울특별시 용산구"},{...ddp,address:"서울특별시 중구"}]}});
  const original=h.ctx.browse;h.ctx.browse=()=>{draws++;return original();};
  original();await h.flush();
  assert.equal(h.fetched.length,1);
  assert.equal(draws,0,"already-known featured rows do not replace rendered cards");
  const g=harness({s:state({hbWalkConfirmed:false}),places:[lib],featured:{places:[{...museum,address:"서울특별시 용산구"}]}});
  let gd=0;const go=g.ctx.browse;g.ctx.browse=()=>{gd++;return go();};
  go();await g.flush();
  assert.ok(gd>=1,"new featured candidates are drawn");
});
// 2026-11-26 사용자 결정(MVP): #/places 보행·이동·휠체어 '보장하지 않아요' 안내 비노출, 판정 배지·요약·숨김 개수는 유지.
test("places screen hides the walking/route/wheelchair disclaimers but keeps verdicts, summaries and hidden count",async()=>{
  const blocked={...museum,mobilityAssessment:verified({stairsRequired:true})};
  const h=harness({places:[lib,blocked,ddp,bare],response:{eligible:[],needsReview:[{id:ddp.id,reason:"insufficient_evidence"},{id:lib.id,reason:"insufficient_evidence"}],excluded:[{id:blocked.id,reason:"required_stairs"}],foodPreferencesApplied:false}});
  h.run();await h.flush();h.run();
  const html=h.html;
  for(const re of [/보장하지 않아요/,/장소 간 이동시간·경로·보행 난이도는 계산하지 않았어요/,/계단·연속 보행시간·동선을 방문 전에 직접 확인해 주세요/,
    /조건을 자동으로 완화해 추천하지 않아요/,/휠체어 동선을/,/보행 안전|이동 안전/,/현장 동선·영업시간·실제 보행 거리는 별도로 확인해 주세요/])assert.doesNotMatch(html,re,String(re));
  assert.doesNotMatch(html,/안전한 코스|안전합니다|안전 보장|보장해요|보장합니다/,"no new safety guarantee wording");
  assert.doesNotMatch(html,/<p class="(?:muted|warn)">\s*<\/p>/,"no empty notice paragraph left behind");
  const part=seasonalHtml(h);
  assert.match(part,/조건 일치 0 · 확인 필요 1 · 조건 충돌 1/);
  assert.match(part,/확인된 이동 조건 충돌 장소가 포함돼 있어요/);
  assert.match(part,/class="hb-recommend-state"/);
  assert.match(part,/계절 추천에서 제외한 장소 1곳/);
  assert.match(html,/조건 결과<\/strong>: 조건 일치 0곳 · 방문 전 확인 2곳 · 조건 충돌 1곳/);
  assert.match(html,/정보가 부족한 장소 1곳은 숨겼어요/);
  assert.match(resultsHtml(h),/방문 전 확인/);
});
// 2026-11-26 사용자 결정(MVP): 서버 판정 대상이 아닌 장소의 확인 안내와 2단계 장소별 확인 안내는 보이지 않는다.
test("server-unassessed place shows its verdict badge without the separate-check sentence or an empty paragraph",async()=>{
  const h=harness({places:[lib,museum],response:{eligible:[],needsReview:[{id:museum.id,reason:"insufficient_evidence"}],excluded:[],foodPreferencesApplied:false}});
  h.run();await h.flush();h.run();
  const list=resultsHtml(h);
  const card=list.split('<article class="card hb-recommend-card">').find(x=>x.includes(lib.name));
  assert.ok(card,"unassessed place is still listed");
  assert.match(card,/<span class="hb-recommend-state">[^<]+<\/span>/,"verdict badge kept");
  assert.match(card,/data-hb-pick="tour-3432213"/,"pick action kept");
  assert.doesNotMatch(h.html,/서버 추천 판정 대상에 없어요|접근성을 별도로 확인해 주세요/);
  assert.doesNotMatch(card,/<p class="muted"><\/p>/);
  assert.match(source,/server_not_assessed:'',/);
  assert.match(list,/계단·연속 보행시간·이동 동선은 방문 전에 직접 확인해 주세요/,"other reasons are unchanged");
  assert.doesNotMatch(source,/실제 보행 거리와 계단 여부는 장소별 확인이 필요해요/);
  assert.match(source,/<h2 tabindex="-1">2\. 이동 조건<\/h2><p class="muted">필수 항목이에요\.<\/p>/,"step 2 keeps the required-field hint");
});
