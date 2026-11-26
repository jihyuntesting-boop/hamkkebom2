"use strict";
// 2026-11-26 사용자 결정: 메인 홈에서 '전국 여행지 찾아보기' 섹션 제거, 기능 코드는 플래그 하나 뒤에 유지.
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.join(__dirname,"..","web","assets");
const boot=fs.readFileSync(path.join(root,"core-src","00-bootstrap.js"),"utf8");
const rich=fs.readFileSync(path.join(root,"core-src","20-detail-and-replan.js"),"utf8");
const router=fs.readFileSync(path.join(root,"core-src","40-sharing-and-data.js"),"utf8");
const bundle=fs.readFileSync(path.join(root,"scripts","00-app-core.js"),"utf8");
const FLAG="const HB_HOME_RICH_DISCOVERY=false;";
const start=boot.indexOf(FLAG),homeStart=boot.indexOf("function home(){",start),end=boot.indexOf("\n",homeStart);
const src=boot.slice(start,end);

function runHome(code){
 const calls=[],els=new Map();
 const elem=id=>{if(!els.has(id))els.set(id,{id,onclick:null,setAttribute(){},scrollIntoView(){},focus(){}});return els.get(id)};
 const ctx=vm.createContext({
  el:{innerHTML:""},s:{hbDraftActive:false},hbIcon:()=>"",button:(id,label)=>'<button id="'+id+'">'+label+"</button>",
  document:{getElementById:elem},window:{HBRichPlaceDetail:{},matchMedia:()=>({matches:true})},
  hbBeginNewTravel(){},hbResumeTravel(){},requestLocation:()=>calls.push("requestLocation"),fetchNearby:()=>calls.push("fetchNearby"),
  hbSearchMapCenter(){},hbSelectNearbyCategory(){},mountNearbyMap:()=>calls.push("mountNearbyMap"),
  hbRichDiscoveryAttach:()=>calls.push("hbRichDiscoveryAttach"),setNearbyStatus(){},drawNearbyList(){},geoStarted:false,nearbyMode:""
 });
 vm.runInContext(code+";home();",ctx);
 return {calls,html:ctx.el.innerHTML};
}

test("one flag hides the nationwide section on the main home only",()=>{
 assert.equal(boot.split(FLAG).length,2,"flag declared once, default false");
 assert.ok(start>0&&homeStart>start&&end>homeStart,"flag sits right before home()");
 assert.ok(src.includes("if(HB_HOME_RICH_DISCOVERY&&typeof window!=='undefined'&&window.HBRichPlaceDetail)hbRichDiscoveryAttach();"));
 assert.ok(bundle.includes(src),"bundle regenerated from core-src");
 assert.equal((bundle.match(/hbRichDiscoveryAttach\(\)/g)||[]).length,2,"only the definition and the gated home() call");
});

test("main home renders without the section but keeps the nearby map and list",()=>{
 const off=runHome(src);
 assert.ok(!off.calls.includes("hbRichDiscoveryAttach"));
 assert.ok(!off.html.includes("전국 여행지 찾아보기"));
 for(const id of ['id="nearby-map"','id="nearby-list"','id="mom-start"','id="hb-map-go"'])assert.ok(off.html.includes(id),id);
 assert.deepEqual(off.calls,["mountNearbyMap","requestLocation"]);
});

test("turning the flag back on restores the section without other changes",()=>{
 const on=runHome(src.replace(FLAG,"const HB_HOME_RICH_DISCOVERY=true;"));
 assert.deepEqual(on.calls,["mountNearbyMap","hbRichDiscoveryAttach","requestLocation"]);
});

test("feature code and other screens are untouched",()=>{
 assert.ok(rich.includes("function hbRichDiscoveryAttach(){")&&rich.includes("<summary>전국 여행지 찾아보기</summary>"));
 for(const route of ["if(p==='/')home();","else if(p==='/places')browse();","else if(p==='/discover')hbDiscoveryRender();","else if(p.startsWith('/place/'))detail("])assert.ok(router.includes(route),route);
});
