"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.join(__dirname,"..","web");
const src=fs.readFileSync(path.join(root,"assets","core-src","50-map-and-startup.js"),"utf8");
const bundle=fs.readFileSync(path.join(root,"assets","scripts","00-app-core.js"),"utf8");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const start=src.indexOf("function hbBindHomeNav(){"),end=src.indexOf("\naddEventListener('hashchange'",start);
const fn=src.slice(start,end);

function harness(hash){
 const links={brand:{handlers:[]},home:{handlers:[]}},log=[];
 const location={get hash(){return hash},set hash(v){log.push("hash:"+v);if(v!==hash){hash=v;log.push("hashchange")}}};
 const document={querySelectorAll(sel){
  assert.equal(sel,'header a.hb-brand-home,header nav a[href="#/"]');
  return [links.brand,links.home].map(l=>({addEventListener:(type,h)=>{assert.equal(type,"click");l.handlers.push(h)}}));
 }};
 const window={scrollTo:(x,y)=>log.push("scroll:"+x+","+y)};
 const c=vm.createContext({document,location,window,render:()=>log.push("render")});
 vm.runInContext(fn+";hbBindHomeNav();",c);
 const click=(link,extra={})=>{const ev={defaultPrevented:false,button:0,metaKey:false,ctrlKey:false,shiftKey:false,altKey:false,prevented:false,preventDefault(){this.prevented=true},...extra};links[link].handlers.forEach(h=>h(ev));return ev};
 return {click,log};
}

test("header logo is a native #/ link with the unchanged brand mark",()=>{
 assert.match(html,/<header><a class="hb-brand-home" href="#\/" aria-label="함께봄 홈"><b><svg class="hb-icon hb-brand-mark"/);
 assert.ok(start>0&&end>start,"hbBindHomeNav exists before startup");
 assert.match(src,/hbBindNewTripNav\(\);hbBindHomeNav\(\);render\(\)/);
 assert.ok(bundle.includes(fn.trim()),"bundle regenerated from core-src");
});

test("logo on the main screen redraws it and scrolls to top (no hashchange fires)",()=>{
 const h=harness("#/");const ev=h.click("brand");
 assert.equal(ev.prevented,true);
 assert.deepEqual(h.log,["render","scroll:0,0"]);
});

test("logo on another screen routes to #/ via hashchange and scrolls to top",()=>{
 for(const from of ["#/discover","#/places","#/new","#/plan","#/travel","#/share/create","#/place/tour-1",""]){
  const h=harness(from);h.click("brand");
  assert.deepEqual(h.log,["hash:#/","hashchange","scroll:0,0"],from);
 }
});

test("header 홈 menu behaves the same as the logo",()=>{
 const h=harness("#/");h.click("home");
 assert.deepEqual(h.log,["render","scroll:0,0"]);
});

test("modified or non-primary clicks keep native link behaviour",()=>{
 for(const extra of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{button:1},{defaultPrevented:true}]){
  const h=harness("#/discover");const ev=h.click("brand",extra);
  assert.equal(ev.prevented,false,JSON.stringify(extra));
  assert.deepEqual(h.log,[],JSON.stringify(extra));
 }
});
