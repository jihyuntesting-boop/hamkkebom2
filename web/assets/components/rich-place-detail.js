/* Agent AA: independently mountable detail panel, connected by core detail().
 * Uses the official --hb design tokens and does not replace existing pick logic.
 * 2026-11-26 MVP decision: only items with a value are rendered. No row, section or
 * box is drawn for a missing value, and no "미확인/확인 필요" wording is shown.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.HBRichPlaceDetail=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const kinds={parking:'주차장',dropoff:'하차 지점',entrance:'입구',public_toilet:'주변 공중화장실',accessible_toilet:'장애인 화장실',rest:'휴식 공간',wheelchair:'휠체어 대여소',attraction:'관람시설'};
 // Display order and grouping. Each row reads a general field first, then a facility note.
 const GROUPS=[
  ['visit','이용 안내',[['hours','운영시간'],['closed','휴무일'],['admission','입장료'],['seniorDiscount','경로우대'],['stay','관람 소요시간'],['reservation','예약'],['mainMenu','대표 메뉴'],['menu','메뉴'],['seats','좌석']]],
  ['move','주차·이동',[['parking','주차'],['parkingFee','주차요금'],['accessibleParking','장애인 주차'],['elevator','엘리베이터'],['ramp','경사로'],['wheelchairAccess','휠체어 이동'],['wheelchairRental','휠체어 대여'],['strollerRental','유모차 대여'],['stroller','유모차']]],
  ['rest','화장실·쉴 곳',[['restroom','화장실'],['accessibleToilet','장애인 화장실'],['rest','휴식 공간'],['amenities','편의시설']]],
  ['contact','문의',[['phone','문의 전화'],['website','홈페이지']]]
 ];
 // Live accessibility enrichment uses a few different attribute names.
 const ACCESS_ALIAS={rest:'restFacilities'};
 const CONFLICT='자료별 설명 확인';
 const validPoint=f=>Number.isFinite(f?.lat)&&Number.isFinite(f?.lng)&&f.lat>=33&&f.lat<=39&&f.lng>=124&&f.lng<=132&&typeof f?.coordinateEvidence?.sourceUrl==='string'&&!!f.coordinateEvidence.verifiedAt;
 const txt=v=>typeof v==='string'&&v.trim()?v.trim():null;
 const httpsUrl=v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
 const telHref=v=>{const m=typeof v==='string'&&v.match(/\d{2,4}-\d{3,4}-\d{4}/);return m?'tel:'+m[0]:null;};
 function buildDetailModel(data,photo){
  data=data||{};
  const sources=new Map();
  const remember=(url,name,date)=>{const href=httpsUrl(url);if(!href)return;const key=href+'|'+(name||'');if(!sources.has(key))sources.set(key,{url:href,name:txt(name)||null,checkedAt:txt(date)||null});};
  const entryFor=key=>{
   const f=data.fields?.[key];
   if(f&&(f.state==='conflicting'||f.additionalReports?.length))return {value:CONFLICT,conflict:true,reports:[f,...(f.additionalReports||[])]};
   if(f&&txt(f.value))return {value:txt(f.value),scope:txt(f.scope),reports:[f]};
   const a=data.accessibility?.attributes?.[ACCESS_ALIAS[key]||key];
   if(a?.status==='conflicting')return {value:CONFLICT,conflict:true,reports:a.evidence||[]};
   const ev=a?.evidence?.[0];
   if(['source_reported','verified_yes','verified_no','stale'].includes(a?.status)&&txt(ev?.description))return {value:txt(ev.description),scope:txt(ev.scope),stale:a.status==='stale',reports:[ev]};
   return null;
  };
  const groups=[];const cards=[];
  for(const [id,title,items] of GROUPS){
   const rows=[];
   for(const [key,label] of items){
    const e=entryFor(key);if(!e)continue;
    let href=null;
    if(key==='website'){href=httpsUrl(e.value);if(!href)continue;}
    if(key==='phone')href=telHref(e.value);
    for(const r of e.reports)remember(r.sourceUrl,r.sourceName,r.collectedAt||r.checkedAt);
    const row={key,label,value:key==='website'?'공식 홈페이지 열기':e.value,href,scope:e.scope||null,conflict:!!e.conflict};
    rows.push(row);cards.push(row);
   }
   if(rows.length)groups.push({id,title,rows});
  }
  const overviewField=data.fields?.overview;
  const overview=overviewField&&!overviewField.additionalReports?.length&&overviewField.state!=='conflicting'?txt(overviewField.value):null;
  if(overview)remember(overviewField.sourceUrl,overviewField.sourceName,overviewField.collectedAt);
  for(const f of data.accessFacts||[])remember(f.sourceUrl,f.sourceName,f.collectedAt);
  const statuses=Object.values(data.accessibility?.attributes||{}).map(x=>x.status);
  const warnings=[];
  if(statuses.includes('conflicting')||data.accessStatus==='conflicting')warnings.push('접근성 자료가 서로 달라요. 방문 전에 직접 확인해 주세요.');
  if(statuses.includes('stale')||data.accessStatus==='stale')warnings.push('오래된 시설 정보가 있어요. 방문 전에 최신 상태를 확인해 주세요.');
  if(Object.values(data.fields||{}).some(f=>f?.additionalReports?.length||f?.state==='conflicting'))warnings.push('운영·시설 자료의 설명이 서로 달라요. 자세한 자료를 함께 확인해 주세요.');
  const seen=new Set();
  const points=(data.facilities||[]).filter(f=>validPoint(f)&&kinds[f.kind]&&typeof f.id==='string'&&!seen.has(f.id)&&(seen.add(f.id),true));
  const approved=photo&&photo.placeId===data.id&&photo.imagePath==='/images/places/'+data.id+'.webp'&&/^tour-\d{1,12}$/.test(data.id)&&txt(photo.credit)&&txt(photo.license)&&txt(photo.verifiedAt);
  const model={name:txt(data.name),address:txt(data.address),overview,groups,cards,warnings,points,sources:[...sources.values()],
   photo:approved?{path:photo.imagePath,credit:photo.credit,license:photo.license}:null};
  model.isEmpty=!overview&&!groups.length&&!points.length&&!warnings.length;
  return model;
 }
 function mount(container,{data,photo=null,photoAlreadyShown=false,showIdentity=true,onAdd,mapAdapter}={}){
  if(!container||!data)throw TypeError('detail_mount_required');
  const doc=container.ownerDocument,model=buildDetailModel(data,photo);
  const node=(tag,text,style)=>{const e=doc.createElement(tag);if(text!=null)e.textContent=text;if(style)Object.assign(e.style,style);return e;};
  const touch={minHeight:'var(--hb-touch, 48px)',fontSize:'var(--hb-text-md, 1rem)',whiteSpace:'normal'};
  const link=(text,href,external)=>{const a=node('a',text,{display:'inline-flex',alignItems:'center',minHeight:'var(--hb-touch, 48px)',color:'var(--hb-ink)',overflowWrap:'anywhere'});a.href=href;if(external){a.target='_blank';a.rel='noopener noreferrer';}return a;};
  const section=node('section',null,{display:'grid',gap:'var(--hb-space-5, 24px)',minWidth:'0',overflowWrap:'anywhere',fontFamily:'var(--hb-font, sans-serif)',color:'var(--hb-ink)',fontSize:'var(--hb-text-md, 1rem)',lineHeight:'var(--hb-leading-body, 1.65)'});
  section.setAttribute('aria-label','장소 이용 정보');
  if(model.photo&&!photoAlreadyShown){
   const figure=node('figure',null,{margin:'0'});
   const img=node('img',null,{display:'block',width:'100%',maxHeight:'320px',objectFit:'cover',borderRadius:'var(--hb-radius, 12px)'});
   img.alt=model.name+' 실제 장소 사진';img.src=model.photo.path;
   // No photo/failed photo: omit the area entirely, no status wording (MVP decision 2026-11-26).
   img.addEventListener('error',()=>figure.remove(),{once:true});
   figure.append(img,node('figcaption',model.photo.credit+' · '+model.photo.license));section.append(figure);
  }
  if(showIdentity){
   if(model.name)section.append(node('h2',model.name));
   if(model.address)section.append(node('p',model.address));
  }else if(!model.isEmpty)section.append(node('h2','장소 이용 정보',{margin:'0',fontSize:'var(--hb-text-xl, 1.375rem)',lineHeight:'var(--hb-leading-heading, 1.28)'}));
  if(model.overview)section.append(node('p',model.overview,{margin:'0',fontSize:'var(--hb-text-lg, 1.125rem)'}));
  if(typeof onAdd==='function'){const add=node('button','일정에 담기',touch);add.type='button';add.onclick=()=>onAdd(data.id);section.append(add);}
  if(model.warnings.length){
   const warnings=node('div',null,{background:'var(--hb-warning-bg)',color:'var(--hb-warning-ink)',borderRadius:'var(--hb-radius, 12px)',padding:'var(--hb-space-3, 12px)'});
   warnings.setAttribute('role','note');model.warnings.forEach(w=>warnings.append(node('p',w,{margin:'0'})));section.append(warnings);
  }
  for(const group of model.groups){
   const box=node('section',null,{display:'grid',gap:'var(--hb-space-2, 8px)',minWidth:'0'});
   box.dataset.detailGroup=group.id;
   const h=node('h3',group.title,{margin:'0',fontSize:'var(--hb-text-lg, 1.125rem)',lineHeight:'var(--hb-leading-heading, 1.28)'});
   const dl=node('dl',null,{display:'grid',gap:'0',margin:'0',border:'1px solid var(--hb-line)',borderRadius:'var(--hb-radius, 12px)',background:'var(--hb-surface)',overflow:'hidden'});
   group.rows.forEach((row,i)=>{
    // Label beside value on wide screens; label above value on phones (wraps, never crops).
    const item=node('div',null,{display:'flex',flexWrap:'wrap',columnGap:'var(--hb-space-3, 12px)',rowGap:'var(--hb-space-1, 4px)',padding:'var(--hb-space-3, 12px) var(--hb-space-4, 16px)',borderTop:i?'1px solid var(--hb-line)':'0'});
    item.dataset.detailRow=row.key;
    const dt=node('dt',row.label,{fontWeight:'700',margin:'0',flex:'0 0 7.5rem'});
    const dd=node('dd',null,{margin:'0',minWidth:'0',flex:'1 1 14rem'});
    if(row.href)dd.append(link(row.value,row.href,row.key==='website'));else dd.append(node('span',row.value));
    if(row.scope)dd.append(node('span',' ('+row.scope+')',{color:'var(--hb-muted)',fontSize:'var(--hb-text-sm, 0.9375rem)'}));
    item.append(dt,dd);dl.append(item);
   });
   box.append(h,dl);section.append(box);
  }
  let dispose,refresh=()=>{};
  if(model.points.length){
   const mapSection=node('section');mapSection.append(node('h3','주변 시설 지도'),node('p','가까운 시설도 관광지 소속이나 이동 가능한 경로로 확인된 것은 아니에요.'));
   const map=node('div',null,{width:'100%',minHeight:typeof mapAdapter==='function'?'240px':'0'});
   const list=node('div',null,{display:'grid',gap:'8px'}),sheet=node('section',null,{padding:'var(--hb-space-3, 12px)',background:'var(--hb-quiet)',borderRadius:'var(--hb-radius, 12px)'});
   sheet.setAttribute('aria-label','선택한 시설 정보');sheet.hidden=true;
   const filter=node('select',null,touch);filter.setAttribute('aria-label','시설 종류');
   for(const [value,label] of [['all','모든 시설'],...Object.entries(kinds).filter(([k])=>model.points.some(f=>f.kind===k))]){
    const opt=node('option',label);opt.value=value;filter.append(opt);
   }
   const select=id=>{
    const f=model.points.find(p=>p.id===id);if(!f)return;
    sheet.hidden=false;sheet.replaceChildren(node('h4',f.name||kinds[f.kind]));
    if(txt(f.address))sheet.append(node('p',f.address));
    sheet.append(node('p',kinds[f.kind]));
    if(f.relationship==='nearby_unaffiliated')sheet.append(node('p','관광지 밖 주변 공공시설'));
    if(Number.isFinite(f.distanceFromPlaceCenterM)&&f.distanceType==='straight_line')sheet.append(node('p','장소 중심에서 직선거리 '+f.distanceFromPlaceCenterM+'m (보행거리 아님)'));
    if(f.openingHours)sheet.append(node('p','개방 안내: '+f.openingHours));
    if(f.accessibleFacilityReport?.note)sheet.append(node('p',f.accessibleFacilityReport.note));
   };
   refresh=()=>{
    if(typeof dispose==='function')dispose();dispose=undefined;map.replaceChildren();list.replaceChildren();sheet.hidden=true;
    const points=model.points.filter(p=>filter.value==='all'||p.kind===filter.value);
    for(const f of points){const b=node('button',kinds[f.kind]+' · '+(f.name||''),touch);b.type='button';b.onclick=()=>select(f.id);list.append(b);}
    if(typeof mapAdapter==='function'&&points.length){try{dispose=mapAdapter({container:map,points,onSelect:select});}catch{map.replaceChildren(node('p','지도를 불러오지 못했어요. 시설 목록은 계속 사용할 수 있어요.'));}}
   };
   filter.onchange=refresh;mapSection.append(filter,map,list,sheet);section.append(mapSection);
  }
  if(model.sources.length){
   const details=node('details');details.append(node('summary','이용 정보 출처와 확인일',touch));
   const ul=node('ul',null,{margin:'0',paddingLeft:'1.25rem',display:'grid',gap:'var(--hb-space-1, 4px)'});
   for(const s of model.sources){
    const li=node('li',null,{color:'var(--hb-muted)',fontSize:'var(--hb-text-sm, 0.9375rem)'});
    li.append(link(s.name||s.url,s.url,true));
    if(s.checkedAt)li.append(node('span',' · 확인 '+s.checkedAt));
    ul.append(li);
   }
   details.append(ul);section.append(details);
  }
  container.replaceChildren(model.isEmpty&&!showIdentity?doc.createTextNode(''):section);refresh();
  return ()=>{if(typeof dispose==='function')dispose();section.remove();};
 }
 return {buildDetailModel,mount};
});
