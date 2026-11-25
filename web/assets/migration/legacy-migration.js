'use strict';
// Owner-only migration. No server request, no cookies/keys, no public share of private data.
(function(root){
 const OLD='https://hamkkebom-mvp.vercel.app',NEW='https://hamkkebom-omega.vercel.app',KEY='hamkkebom-cloud';
 const MAX=262144, MAX_STOPS=60;
 const own=(o,k)=>Object.hasOwn(o,k);
 const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
 const fail=()=>{throw Error('지원하지 않는 백업 형식입니다. 원본 파일은 보관하고 문의해 주세요.')};
 const text=(x,n=300)=>typeof x==='string'&&x.length<=n&&!/[\u0000-\u001f\u007f<>]/.test(x);
 const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(x);
 const day=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\d$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
 const clock=x=>typeof x==='string'&&/^([01]?\d|2[0-3]):[0-5]\d$/.test(x);
 const num=(x,max=1440)=>Number.isInteger(x)&&x>=0&&x<=max;
 const one=(x,arr)=>arr.includes(x);
 const lists=(x,p,max=100)=>Array.isArray(x)&&x.length<=max&&x.every(p);
 const ROOT={
 region:x=>one(x,['서울','경기']),date:day,walk:x=>one(x,['5','10','15','20','30']),
 stairs:x=>one(x,['possible','avoid','impossible']),chosen:x=>lists(x,id),stops:x=>lists(x,validStop,MAX_STOPS),
 hbStep:x=>num(x,3)&&x>=1,momNeeds:x=>lists(x,v=>one(v,['toilet','rest','dropoff','elevator','wheelchair']),5),
 hbWalkConfirmed:x=>typeof x==='boolean',hbStairsChoice:x=>one(x,['possible','avoid','impossible']),
 hbInterest:x=>one(x,['all','spot','food']),hbBrowseFilter:x=>one(x,['all','spot','food','culture']),
 hbBrowseLimit:x=>num(x,5000),hbPlanStart:clock,hbDuration:x=>one(x,['day','overnight']),
 hbTransport:x=>one(x,['car','transit','mixed']),hbParty:x=>one(x,['2','3','4','5',2,3,4,5]),
 hbPlanWarnings:x=>lists(x,v=>text(v,1000),30),hbPlanInfo:validInfo,
 hbReplanUndo:x=>x===null||record(x)
 };
 const BOOL=['isRestCandidate','isPlaceholder','done','must','reserved','booked'];
 const INT=['stayMinutes','restMinutes','transitionBufferMinutes','position'];
 function validStop(s){
  if(!record(s)||!id(s.id)||!text(s.name)||!s.name.trim()||!clock(s.time))return false;
  return Object.keys(s).every(k=>{
   const v=s[k];
   if(BOOL.includes(k))return typeof v==='boolean';
   if(INT.includes(k))return num(v);
   if(k==='id')return id(v);
   if(k==='placeId')return v===null||id(v);
   if(k==='name')return text(v);
   if(k==='address')return v===null||text(v,400);
   if(k==='time'||k==='plannedArrival')return clock(v);
   if(k==='kind')return one(v,['spot','culture','food','rest']);
   if(k==='travelTimeStatus')return one(v,['unknown','not_applicable']);
   return false;
  });
 }
 function validInfo(x){
  if(!record(x))return false;
  return Object.keys(x).every(k=>{
   const v=x[k];
   if(k==='start'||k==='end')return clock(v);
   if(k==='sightCount')return num(v,60);
   if(k==='foodSelected')return typeof v==='boolean';
   if(k==='date')return day(v);
   if(k==='region')return one(v,['서울','경기']);
   if(k==='createdAt')return typeof v==='string'&&v.length<=40&&Number.isFinite(Date.parse(v));
   return false;
  });
 }
 function parseBackup(raw){
  if(typeof raw!=='string'||!raw||raw.length>MAX)fail();
  let o;try{o=JSON.parse(raw)}catch{fail()}
  if(!record(o)||!own(o,'region')||!own(o,'date')||!own(o,'chosen')||!own(o,'stops'))fail();
  for(const k of Object.keys(o))if(!own(ROOT,k)||!ROOT[k](o[k]))fail();
  const state={};
  for(const k of Object.keys(o))if(k!=='hbReplanUndo')state[k]=o[k];
  const undoArchived=Boolean(o.hbReplanUndo);
  if(state.stops.length)state.hbPlanInfo={...(state.hbPlanInfo||{}),region:state.hbPlanInfo?.region||state.region,date:state.hbPlanInfo?.date||state.date};
  return {state,undoArchived,protectedCount:state.stops.filter(s=>s.done||s.must||s.reserved||s.booked).length};
 }
 function moveShare(raw){
  if(typeof raw!=='string'||raw.length>25000)fail();
  let u;try{u=new URL(raw.trim())}catch{fail()}
  if(u.origin!==OLD||u.username||u.password||u.pathname!=='/'||u.search)fail();
  const match=/^#\/share\/([A-Za-z0-9_-]{1,24000})$/.exec(u.hash);
  if(!match)fail();
  let o;try{o=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(match[1].replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))))}catch{fail()}
  if(!record(o)||o.v!==1||!day(o.date)||!lists(o.stops,s=>record(s)&&clock(s.time)&&text(s.name)&&s.name.trim(),9)||!o.stops.length)fail();
  if(Object.keys(o).some(k=>!['v','region','date','stops'].includes(k))||o.stops.some(s=>Object.keys(s).some(k=>!['time','name'].includes(k))))fail();
  const data={v:1,date:o.date,stops:o.stops.map(s=>({time:s.time,name:s.name}))};
  if(one(o.region,['서울','경기']))data.region=o.region;
  const code=btoa(Array.from(new TextEncoder().encode(JSON.stringify(data)),b=>String.fromCharCode(b)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return NEW+'/#/share/'+code;
 }
 function writeBackup(storage,parsed,expected,{replace=false}={}){
  // Require the destination to be unchanged since preview; no implicit overwrite.
  const current=storage.getItem(KEY);
  if(current!==expected||(current!==null&&!replace))throw Error('기존 저장값이 있습니다. 다시 미리보기하고 백업 후 확인해 주세요.');
  const serialized=JSON.stringify(parsed.state);
  storage.setItem(KEY,serialized);
  if(storage.getItem(KEY)!==serialized)throw Error('저장 결과를 확인하지 못했습니다. 원본 백업을 보관해 주세요.');
 }
 const api={parseBackup,moveShare,writeBackup,OLD,NEW,KEY};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.HBMigration=api;
})(typeof window==='undefined'?null:window);
