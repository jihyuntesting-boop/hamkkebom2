function hbDecodePlaceId(value){
 try{return decodeURIComponent(value)}catch{return null}
}

function hbEvidenceStatus(fact){
 if(fact.status==='conflicting')return '출처 상충';
 if(fact.status==='stale')return '오래된 정보';
 if(fact.status==='unknown')return '확인 필요';
 const verifiedStatus={verified_yes:'이용 가능 확인',verified_no:'이용 불가 확인'}[fact.status];
 if(verifiedStatus){
  return typeof fact.scope==='string'&&fact.scope.trim()&&Number.isFinite(Date.parse(fact.verifiedAt))?
   verifiedStatus:'검증 범위 확인 필요';
 }
 return '자료 안내 있음';
}

function hbEvidenceSourceLink(value){
 try{
  const url=new URL(value);
  return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;
 }catch{return null}
}

function hbDetailAccessGuide(place){
 const guides=window.hbLocalAccessGuides;
 return guides&&Object.hasOwn(guides,place.id)?guides[place.id]:null;
}

function hbDetailMap(location,label){
 if(!location||location.lat==null||location.lng==null||
  String(location.lat).trim()===''||String(location.lng).trim()==='')return '';
 const lat=Number(location.lat),lng=Number(location.lng);
 if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lng)||Math.abs(lng)>180)return '';
 return '<a href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(lat+','+lng)+
  '" target="_blank" rel="noopener noreferrer">'+safe(label)+'</a>';
}

function hbDetailTopics(fact){
 if(fact.topic)return [fact.topic];
 const label=(fact.label||'')+' '+(fact.description||'');
 return [
  ['dropoff',/하차|승하차|주차|정류장/],['entrance',/출입|입구/],['distance',/거리|보행시간/],
  ['stairs',/계단/],['slope',/경사/],['threshold',/단차|문턱/],['wheelchair',/휠체어/],
  ['rest',/휴식|쉼터|휴게|벤치|앉을/],['toilet',/화장실/],['elevator',/엘리베이터|승강기/]
 ].filter(([,pattern])=>pattern.test(label)).map(([topic])=>topic);
}

function hbDetailSummary(facts, topics){
 const related=facts.filter(fact=>hbDetailTopics(fact).some(topic=>topics.includes(topic)));
 const states=related.map(hbEvidenceStatus);
 const contradiction=topics.some(topic=>{
  const statesForTopic=related.filter(fact=>hbDetailTopics(fact).includes(topic)).map(hbEvidenceStatus);
  return statesForTopic.includes('이용 가능 확인')&&statesForTopic.includes('이용 불가 확인');
 });
 if(states.includes('출처 상충')||contradiction)return '자료가 서로 달라요';
 if(states.includes('이용 불가 확인'))return '이용 제한 자료가 있어요';
 if(states.some(status=>status==='자료 안내 있음'||status==='이용 가능 확인'))return '관련 안내가 있어요';
 if(states.includes('오래된 정보'))return '최신 상태 확인이 필요해요';
 return '방문 전 확인이 필요해요';
}

function hbArrivalMapLink(place, guide){
 const parking=guide?.arrival?.mapQuery;
 const query=parking||[place.name,place.address].filter(Boolean).join(' ').trim();
 if(!query)return '';
 return '<a class="hb-access-map-source" href="https://map.naver.com/p/search/'+encodeURIComponent(query)+
  '" target="_blank" rel="noopener noreferrer">'+(parking?'네이버 지도에서 주차장 찾기':'네이버 지도에서 장소 찾기')+'</a>';
}

function hbArrivalMarkup(place, guide, facts){
 const location=(label,point)=>{
  if(!point?.name)return '';
  const link=hbDetailMap(point,label+' 위치 보기');
  return '<p><strong>'+label+'</strong> '+safe(point.name)+(link?' · '+link:'')+'</p>';
 };
 const mobilityTopics=['dropoff','entrance','stairs','slope','threshold','wheelchair','elevator'];
 const mobilityStatus=hbDetailSummary(facts,mobilityTopics);
 const showGuide=guide?.map&&!['자료가 서로 달라요','이용 제한 자료가 있어요'].includes(mobilityStatus);
 const hasRoute=showGuide&&guide.map.connections?.length;
 const restroom=guide?.restroom;
 const restroomSource=hbEvidenceSourceLink(restroom?.sourceUrl);
 const restroomStatus=hbDetailSummary(facts,['toilet']);
 return '<section class="panel hb-detail-access" aria-labelledby="hb-detail-access-title">'+
  '<h2 id="hb-detail-access-title">도착 안내</h2>'+
  location('주차',guide?.arrival)+location('입구',guide?.entrance)+
  hbArrivalMapLink(place,guide)+
  (hasRoute?'':'<p class="warn">주차장에서 입구까지 계단 없는 길은 확인이 필요해요.</p>')+
  (restroom?.location&&restroomSource&&!['자료가 서로 달라요','이용 제한 자료가 있어요'].includes(restroomStatus)?
   '<h3>장애인 화장실</h3><p>'+safe(restroom.location)+'</p>'+
   '<p class="muted">화장실까지 계단 없는 길은 확인이 필요해요.</p>'+
   '<a class="hb-access-map-source" href="'+safe(restroomSource)+'" target="_blank" rel="noopener noreferrer">화장실 안내 출처</a>':'')+
  '</section>'+(showGuide?hbAccessMapMarkup(guide):'');
}

function hbAccessMapMarkup(guide){
 const map=guide?.map;
 if(!map)return '';
 const image=hbEvidenceSourceLink(map.image);
 const official=hbEvidenceSourceLink(map.official);
 return '<section class="hb-access-map panel" aria-labelledby="hb-access-map-title">'+
  '<h2 id="hb-access-map-title">'+(map.connections?.length?'계단 없이 입구까지':'데크 입구 안내')+'</h2>'+
  '<p class="muted">'+safe(map.caption)+'</p>'+
  '<p class="hb-access-map-key">공식 자료를 바탕으로 안내해요. 현장 상황은 달라질 수 있어요.</p>'+
  '<ol class="hb-access-map-stops" aria-label="이동 지점">'+map.stops.map((stop,index)=>
   '<li'+(map.connections?.includes(index)?' class="hb-access-map-linked"':'')+'>'+
   '<button type="button" class="light" data-access-map-stop="'+index+'" aria-pressed="'+(index===0)+'"><span aria-hidden="true">'+(index+1)+'</span><strong>'+safe(stop[0])+'</strong></button>'+
   (map.connections?.includes(index)?'<span class="hb-access-map-connection">공식 안내에서 연결 확인</span>':'')+'</li>'
  ).join('')+'</ol>'+
  '<p class="hb-access-map-note" role="status">'+safe(map.stops[0][1])+'</p>'+
  (image?'<details class="hb-access-floor" open><summary>공식 층별 지도 보기</summary><figure><a href="'+safe(image)+'" target="_blank" rel="noopener noreferrer"><img src="'+safe(image)+'" alt="국립중앙박물관 공식 층별 배치도. 1층 주출입구, 열린마당, 상설전시실 위치가 표시돼요." loading="lazy"></a><figcaption>지도를 누르면 크게 볼 수 있어요.</figcaption></figure></details>':'')+
  (official?'<a class="hb-access-map-source" href="'+safe(official)+'" target="_blank" rel="noopener noreferrer">'+safe(map.linkLabel)+'</a>':'')+
  '</section>';
}

function hbBindAccessMap(guide){
 const map=guide?.map;
 const section=el.querySelector('.hb-access-map');
 if(!map||!section)return;
 const buttons=section.querySelectorAll('[data-access-map-stop]');
 const note=section.querySelector('.hb-access-map-note');
 const figure=section.querySelector('figure');
 const image=figure?.querySelector('img');
 if(image){
  const showMapFallback=()=>{
   figure.textContent='지도 이미지를 불러오지 못했어요. 아래 공식 안내에서 지도를 볼 수 있어요.';
  };
  image.addEventListener('error',showMapFallback,{once:true});
  if(image.complete&&!image.naturalWidth)showMapFallback();
 }
 for(const button of buttons){
  button.onclick=()=>{
   for(const other of buttons)other.setAttribute('aria-pressed',String(other===button));
   note.textContent=map.stops[Number(button.dataset.accessMapStop)][1];
  };
 }
}


// Agent X: opt-in nationwide discovery; existing recommendation and selection remain authoritative.
let hbRichSelected=null,hbRichDispose=null,hbRichSearchDispose=null;
function hbRichCleanup(){
 if(typeof hbRichDispose==='function')hbRichDispose();hbRichDispose=null;
 if(typeof hbRichSearchDispose==='function')hbRichSearchDispose();hbRichSearchDispose=null;
}
function hbRichIdentity(p){
 const types={spot:'12',culture:'14',food:'39'};
 const kind=p&&Object.hasOwn(types,p.kind)?types[p.kind]:null;
 return p&&/^tour-\d{1,12}$/.test(p.id)&&kind&&(!p.contentTypeId||p.contentTypeId===kind)?{contentId:p.id.slice(5),contentTypeId:kind}:null;
}
function hbRichMatchesRegion(p,region){
 return String(p?.areaCode??'')===({서울:'1',경기:'31'}[region]||'-');
}
function hbRichMapAdapter({container,points,onSelect}){
 let disposed=false,map=null;const markers=[],listeners=[];
 const clear=()=>{for(const l of listeners.splice(0)){try{window.naver?.maps?.Event?.removeListener(l)}catch{}}for(const m of markers.splice(0)){try{m.setMap(null)}catch{}}try{map?.destroy()}catch{}map=null;};
 const valid=points.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&p.lat>=32&&p.lat<=39&&p.lng>=124&&p.lng<=133);
 if(!valid.length){container.textContent='지도에 표시할 좌표가 없어요.';return ()=>{};}
 container.style.minHeight='240px';container.setAttribute('aria-label','네이버 장소와 시설 지도');
 container.textContent='지도를 불러오는 중이에요.';
 loadNaverMap().then(M=>{
  if(disposed||!container.isConnected)return;
  container.replaceChildren();
  map=new M.Map(container,{center:new M.LatLng(valid[0].lat,valid[0].lng),zoom:15,scrollWheel:false});
  const bounds=new M.LatLngBounds();
  for(const p of valid){
   const pos=new M.LatLng(p.lat,p.lng);bounds.extend(pos);
   const symbol=({spot:'관',culture:'문',food:'식',parking:'P',dropoff:'하',entrance:'입',public_toilet:'WC',accessible_toilet:'♿',rest:'쉼',wheelchair:'♿',attraction:'관'})[p.kind]||'•';
   const marker=new M.Marker({map,position:pos,title:String(p.name||''),icon:{content:'<span style="display:inline-grid;place-items:center;min-width:34px;height:34px;background:var(--hb-primary);color:var(--hb-ink);border:2px solid var(--hb-ink);border-radius:50%;font-weight:700">'+symbol+'</span>',anchor:new M.Point(17,17)}});
   markers.push(marker);listeners.push(M.Event.addListener(marker,'click',()=>{if(!disposed)onSelect(p.id);}));
  }
  if(valid.length>1)map.fitBounds(bounds,{top:32,right:32,bottom:32,left:32});
 }).catch(()=>{clear();if(!disposed&&container.isConnected)container.textContent='지도를 불러오지 못했어요. 아래 목록을 이용해 주세요.';});
 return ()=>{disposed=true;clear();};
}
function hbRichDetailAttach(place,auto){
 const identity=hbRichIdentity(place),component=window.HBRichPlaceDetail;
 if(!identity||!component||typeof component.mount!=='function')return;
 const host=document.createElement('section');host.className='panel';host.setAttribute('aria-label','관광공사 추가 상세정보');
 const trigger=document.createElement('button');trigger.type='button';trigger.className='light';trigger.textContent='운영시간·요금·시설 더 보기';
 const status=document.createElement('p');status.setAttribute('role','status');
 const body=document.createElement('div');host.append(trigger,status,body);
 const arrival=el.querySelector('.hb-detail-access');if(arrival)arrival.insertAdjacentElement('beforebegin',host);else el.append(host);
 let disposed=false,controller=null,unmount=null,loaded=false;
 hbRichDispose=()=>{disposed=true;controller?.abort();if(typeof unmount==='function')unmount();};
 trigger.onclick=async()=>{
  if(loaded||controller)return;
  trigger.disabled=true;status.textContent='공식 관광정보를 확인 중이에요.';controller=new AbortController();
  try{
   const q=new URLSearchParams({action:'detail',...identity});
   const response=await fetch('/api/rich-tour?'+q,{signal:controller.signal,credentials:'same-origin'});
   if(!response.ok)throw Error('unavailable');
   const data=await response.json();
   if(disposed||!host.isConnected)return;
   if(data.id!==place.id||data.contentTypeId!==identity.contentTypeId)throw Error('identity');
   unmount=component.mount(body,{data,photoAlreadyShown:true,mapAdapter:hbRichMapAdapter});
   loaded=true;trigger.hidden=true;status.textContent='공식 자료 기준 추가 정보예요. 기존 접근성 주의사항도 함께 확인해 주세요.';
  }catch(e){if(!disposed&&host.isConnected)status.textContent='추가 정보를 지금 조회할 수 없어요. 기존 장소 안내는 계속 이용할 수 있어요.';}
  finally{controller=null;if(!disposed&&!loaded)trigger.disabled=false;}
 };
 if(auto)trigger.click();
}
function hbRichDiscoveryAttach(){
 if(!window.HBRichPlaceDetail||!document.getElementById('nearby-map'))return;
 const host=document.createElement('section');host.className='panel';host.id='hb-rich-discovery';
 host.innerHTML='<details><summary>전국 여행지 찾아보기</summary><p class="muted">전국 관광지·문화시설·식당 탐색. 수집 자료가 준비되면 저장된 카탈로그를 검색하고, 그 외에는 승인된 API 조회 환경에서만 이용할 수 있어요.</p><div class="field"><label for="hb-rich-mode">검색 방식</label><select id="hb-rich-mode"><option value="area">지역</option><option value="keyword">장소명</option><option value="location">위 지도 중심</option></select></div><div class="field"><label for="hb-rich-area">시·도</label><select id="hb-rich-area"><option value="">전국</option></select><button class="light" type="button" id="hb-rich-areas">지역 목록 불러오기</button></div><div class="field"><label for="hb-rich-district">시·군·구</label><select id="hb-rich-district"><option value="">전체</option></select></div><div class="field"><label for="hb-rich-keyword">장소명</label><input id="hb-rich-keyword" maxlength="100" type="search"></div><div class="field"><label for="hb-rich-kind">장소 유형</label><select id="hb-rich-kind"><option value="12">관광지</option><option value="14">문화시설</option><option value="39">식당</option></select></div><div class="actions"><button type="button" id="hb-rich-search">검색</button><button class="light" type="button" id="hb-rich-next" hidden>다음 결과 더 보기</button></div><p id="hb-rich-status" role="status"></p><div id="hb-rich-map"></div><div id="hb-rich-list"></div></details>';
 const near=document.getElementById('nearby-map').closest('section');if(!near)return;near.insertAdjacentElement('afterend',host);
 const at=id=>host.querySelector('#hb-rich-'+id);
 const status=at('status'),list=at('list'),mapHost=at('map'),next=at('next');
 let disposed=false,searchEpoch=0,areaEpoch=0,mapDispose=null,page=0,params=null,records=new Map(),searchAbort=null,areaAbort=null;
 hbRichSearchDispose=()=>{disposed=true;searchAbort?.abort();areaAbort?.abort();if(typeof mapDispose==='function')mapDispose();};
 async function request(query,signal){
  const res=await fetch('/api/rich-tour?'+new URLSearchParams(query),{credentials:'same-origin',signal});
  if(!res.ok)throw Error('unavailable');return res.json();
 }
 async function loadAreas(region){
  const epoch=++areaEpoch;areaAbort?.abort();areaAbort=new AbortController();
  const select=region?at('district'):at('area');
  status.textContent='지역 목록을 불러오는 중이에요.';
  try{const data=await request({action:'areas',numOfRows:'40',...(region?{areaCode:region}:{})},areaAbort.signal);
   if(disposed||epoch!==areaEpoch)return;
   select.replaceChildren();const first=document.createElement('option');first.value='';first.textContent=region?'전체':'전국';select.append(first);
   for(const item of data.areas||[]){if(!Number.isInteger(item.code)||typeof item.name!=='string')continue;const option=document.createElement('option');option.value=String(item.code);option.textContent=item.name;select.append(option);}
   status.textContent='지역을 선택해 주세요.';
  }catch{if(!disposed&&epoch===areaEpoch)status.textContent='지역 목록을 불러올 수 없어요. 기존 주변 검색은 이용할 수 있어요.';}
 }
 at('areas').onclick=()=>loadAreas('');
 at('area').onchange=()=>{at('district').replaceChildren();const option=document.createElement('option');option.value='';option.textContent='전체';at('district').append(option);if(at('area').value)loadAreas(at('area').value);};
 function readParams(){
  const mode=at('mode').value,q={action:'search',mode,contentTypeId:at('kind').value,numOfRows:'20'};
  if(mode==='location'){const point=nearbyMap?.getCenter?.();const lat=point?.lat?.(),lng=point?.lng?.();if(!Number.isFinite(lat)||!Number.isFinite(lng))throw Error('먼저 위 지도를 불러와 주세요.');q.lat=lat.toFixed(4);q.lng=lng.toFixed(4);}
  else{if(at('area').value)q.areaCode=at('area').value;if(at('district').value&&q.areaCode)q.sigunguCode=at('district').value;if(mode==='keyword'){q.keyword=at('keyword').value.trim();if(!q.keyword)throw Error('장소명을 입력해 주세요.');}}
  return q;
 }
 function select(id){
  const p=records.get(id);if(!p)return;hbRichSelected=p;
  if(hbRichMatchesRegion(p,s.region))hbRememberNearbyPlace(p);
  location.hash='#/place/'+encodeURIComponent(id);
 }
 function draw(){
  if(typeof mapDispose==='function')mapDispose();mapDispose=null;mapHost.replaceChildren();list.replaceChildren();
  const items=[...records.values()];
  if(!items.length){mapHost.style.minHeight='0';list.textContent='조회된 장소가 없어요.';return;}
  const mapped=items.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&p.lat>=32&&p.lat<=39&&p.lng>=124&&p.lng<=133);
  if(mapped.length)mapDispose=hbRichMapAdapter({container:mapHost,points:mapped,onSelect:select});else{mapHost.style.minHeight='0';mapHost.textContent='좌표를 확인한 장소가 없어요.';}
  for(const p of items){const b=document.createElement('button');b.type='button';b.className='light';b.style.cssText='display:block;width:100%;min-height:var(--hb-touch);text-align:left;white-space:normal;margin-block:8px';b.textContent=p.name+(p.address?' · '+p.address:'');b.onclick=()=>select(p.id);list.append(b);}
 }
 async function run(reset){
  if(reset){try{params=readParams();}catch(e){status.textContent=e.message;return;}page=0;records=new Map();next.hidden=true;draw();}
  if(!params)return;
  const epoch=++searchEpoch;searchAbort?.abort();searchAbort=new AbortController();next.disabled=true;status.textContent='전국 관광정보를 확인 중이에요.';
  try{const result=await request({...params,pageNo:String(page+1)},searchAbort.signal);
   if(disposed||epoch!==searchEpoch)return;
   if(!Array.isArray(result.places)||result.pageNo!==page+1)throw Error('invalid page');
   for(const p of result.places){if(hbRichIdentity(p)&&typeof p.name==='string'&&p.name&&!records.has(p.id))records.set(p.id,p);}
   page++;draw();next.hidden=!result.hasNext||page>=5;status.textContent=(result.sourceMode==='catalog_snapshot'?'전국 수집 자료 '+String(result.collectedAt||'').slice(0,10)+' · '+result.totalAvailable+'곳 중 ':'')+'현재 조회 '+records.size+'곳 · '+(result.hasNext?(page>=5?'5페이지 조회 제한에 도달했어요. 검색 조건을 좁혀 주세요.':'다음 페이지가 있어요.'): '마지막 페이지예요.');
  }catch{if(!disposed&&epoch===searchEpoch)status.textContent='관광정보를 조회할 수 없어요. 기존 주변 검색은 계속 이용할 수 있어요.';}
  finally{if(!disposed&&epoch===searchEpoch)next.disabled=false;}
 }
 at('search').onclick=()=>run(true);next.onclick=()=>run(false);
}

function detail(id){
 if(typeof hbRichDispose==='function')hbRichDispose();hbRichDispose=null;
 const fromDiscovery=hbDiscoveryDetailId===id;
 const back='<p><a id="hb-detail-back" class="hb-back-link" href="#/'+(fromDiscovery?'discover':'places')+'"><span aria-hidden="true">←</span> '+(fromDiscovery?'추천 장소':'장소 목록')+'</a></p>';
 const selectedRich=hbRichSelected?.id===id?hbRichSelected:(typeof nearbyItems!=='undefined'?nearbyItems.find(p=>p.id===id&&['nationwide_catalog','nationwide_live','keyword_snapshot'].includes(p.discoverySource))||null:null);
 const place=id?(places.find(value=>value.id===id)||selectedRich):null;
 if(!place||!selectedRich&&(loading||issue)){
  if(loading||hbPlacesLoadedRegion===null&&!issue&&id){
   el.innerHTML=back+'<h1>장소 상세 정보</h1><p role="status">장소 정보를 불러오는 중이에요.</p>';
  }else if(issue){
   el.innerHTML=back+'<h1>장소 정보를 가져오지 못했어요</h1><p role="alert">'+safe(issue)+'</p>'+button('hb-detail-retry','다시 조회');
   document.getElementById('hb-detail-retry').onclick=load;
  }else{
   el.innerHTML=back+'<h1>장소를 찾지 못했어요</h1><p>링크를 확인하거나 장소 목록에서 다시 검색해 주세요.</p>';
  }
  return;
 }
 const guide=hbDetailAccessGuide(place);
 const localFacts=Array.isArray(guide?.facts)?guide.facts.filter(fact=>fact&&typeof fact==='object'):[];
 const facts=[...localFacts,...hbAccessFacts(place)];
 const renderFact=fact=>{
  const href=hbEvidenceSourceLink(fact.sourceUrl);
  const source=fact.source||(href?'자료 보기':'');
  const status=hbEvidenceStatus(fact);
  return '<article class="hb-evidence-row"><div class="hb-evidence-head"><strong>'+safe(fact.label||'편의시설')+
   '</strong><span class="hb-evidence-status">'+status+'</span></div>'+(fact.description?'<p>'+safe(fact.description)+'</p>':'')+
   (source?'<p class="muted">출처 '+(href?'<a href="'+safe(href)+'" target="_blank" rel="noopener noreferrer">'+safe(source)+'</a>':safe(source))+'</p>':'')+
   (fact.collectedAt?'<p class="muted">수집일 '+safe(fact.collectedAt)+'</p>':'')+
   (fact.verifiedAt?'<p class="muted">자료에 기록된 확인일 '+safe(fact.verifiedAt)+'</p>':'')+
   (fact.scope?'<p class="muted">확인 범위 '+safe(fact.scope)+'</p>':'')+'</article>';
 };
 const specs=[
  ['하차 지점에서 입구까지',['dropoff','entrance','distance'],'하차 지점과 연결되는 입구, 실제 보행 거리, 경사·문턱 및 차량 접근 가능 여부'],
  ['계단·경사·문턱과 휠체어 이동',['stairs','slope','threshold','wheelchair','elevator'],'계단 없는 대체 동선, 경사와 문턱, 문 폭 또는 승강기, 입구에서 관람 지점까지 보행 거리'],
  ['화장실과 쉴 곳',['toilet','rest'],'휠체어 이용 화장실, 앉아 쉴 곳의 위치와 이용 가능 여부']
 ];
 const chosen=Array.isArray(s.chosen)?s.chosen:[];
 const picked=chosen.includes(id);
 const assessment=hbEvaluatePlace(place,{
  walk:s.hbWalkConfirmed?s.walk:null,stairsMode:s.hbStairsChoice,needs:s.momNeeds,
  slopePreference:s.hbSlopePreference,indoorPreference:s.hbIndoorPreference,mobilityAid:s.hbMobilityAid
 });
 const regionAllowed=!selectedRich||hbRichMatchesRegion(selectedRich,s.region);
 const canPick=!fromDiscovery&&(picked||regionAllowed&&assessment.status!=='excluded');
 const other=facts.filter(fact=>!hbDetailTopics(fact).some(topic=>specs.some(([,topics])=>topics.includes(topic))));
 el.innerHTML=back+'<span class="chip">'+hbPlaceCategory(place)+'</span><h1>'+safe(place.name)+'</h1>'+
  (place.address?'<p>'+safe(place.address)+'</p>':'')+
  '<div class="actions">'+
  (fromDiscovery?'<a href="#/new">여행 만들기</a>':canPick?'<button type="button" id="pick" aria-pressed="'+picked+'">'+(picked?'선택 취소':'일정에 담기')+'</button>':'')+'</div>'+
  '<p id="hb-detail-selection" role="status"></p>'+
  (!regionAllowed?'<p class="warn">현재 일정 작성은 선택한 서울·경기 지역에서 지원해요. 다른 지역은 상세정보를 살펴볼 수 있어요.</p>':'')+
  hbArrivalMarkup(place,guide,facts)+
  (assessment.status==='excluded'?'<p class="warn">선택한 계단 이용 조건과 검증된 이동 동선이 충돌해요.</p>':
   assessment.conflict?'<p class="warn">출처의 설명이 달라요. 방문 전에 직접 확인해 주세요.</p>':'')+
  specs.map(([title,topics,check])=>{
   const related=facts.filter(fact=>hbDetailTopics(fact).some(topic=>topics.includes(topic)));
   if(!related.length)return '';
   return '<details class="panel hb-detail-evidence"><summary><strong>'+title+'</strong></summary>'+
    related.map(renderFact).join('')+
    '<p class="muted">방문 전 확인: '+check+'</p></details>';
  }).join('')+
  panel('정보 출처',(place.matched?'<p>장소와 편의시설 정보는 공공 관광 자료를 바탕으로 제공돼요.</p>':'')+
   (other.length?other.map(renderFact).join(''):facts.length?'<p>자료별 출처와 확인 범위는 각 항목에서 확인할 수 있어요.</p>':'<p>현재 제공된 편의시설 상세 자료가 없어요.</p>'));
 hbBindAccessMap(guide);
 if(typeof window!=='undefined'&&window.HBRichPlaceDetail)hbRichDetailAttach(place,Boolean(selectedRich));
 const pick=document.getElementById('pick');
 if(pick)pick.onclick=()=>{
  if(!picked&&selectedRich&&regionAllowed)hbRememberNearbyPlace(selectedRich);
  s.chosen=picked?chosen.filter(value=>value!==id):[...chosen,id];
  save();
  detail(id);
  (document.getElementById('pick')||document.getElementById('hb-detail-back'))?.focus();
  document.getElementById('hb-detail-selection').textContent=picked?'일정에서 선택을 취소했어요.':'일정에 장소를 담았어요.';
 };
}
// RPL-01: legacy and PLAN-01 status aliases have the same protected meaning.
function hbCompleted(stop){return !!(stop&&(stop.done||stop.completed))}
function hbMustVisit(stop){return !!(stop&&(stop.must||stop.mustVisit))}
function hbReserved(stop){return !!(stop&&(stop.reserved||stop.booked))}
function hbProtected(stop){return hbCompleted(stop)||hbMustVisit(stop)||hbReserved(stop)}
function hbValidReplanStops(items){
 return Array.isArray(items)&&items.every(stop=>stop&&typeof stop==='object'&&!Array.isArray(stop));
}
function hbPlanContext(state){return {region:state.hbPlanInfo?.region||state.region,date:state.hbPlanInfo?.date||state.date}}
function hbTripSignature(state){
 const {region,date}=hbPlanContext(state);
 return JSON.stringify([region,date,Array.isArray(state.stops)?state.stops:[]]);
}
function hbSavedTripMatches(signature){
 try{
  const stored=localStorage.getItem(KEY);
  return stored===null||hbTripSignature(JSON.parse(stored))===signature;
 }catch{return false}
}
function hbSaveTripStops(stops,undo=null){
 if(!hbValidReplanStops(stops))return false;
 const previous=s;
 s={...s,stops,hbReplanUndo:undo};
 try{save();return true}catch{s=previous;return false}
}
function hbNextStop(items){return hbValidReplanStops(items)?items.findIndex(stop=>!hbCompleted(stop)):-1}
function hbProposal(level,items,all=[]){
 if(!hbValidReplanStops(items)||!['low','mid','high'].includes(level))throw Error('invalid');
 const catalog=Array.isArray(all)?all:[];
 const optional=items.map((v,i)=>({v,i})).filter(({v})=>{
  const kind=v.kind||(catalog.find(p=>p&&p.id===(v.placeId||v.id))||{}).kind;
  return !hbProtected(v)&&!v.isRestCandidate&&!v.isPlaceholder&&kind!=='food'&&kind!=='rest';
 });
 const count=level==='low'?0:level==='mid'?Math.ceil(optional.length/2):optional.length;
 const removedIndices=new Set((count?optional.slice(-count):[]).map(entry=>entry.i));
 return {kept:items.filter((_,i)=>!removedIndices.has(i)),removed:items.filter((_,i)=>removedIndices.has(i)),protected:items.filter(hbProtected)};
}
function hbReplanAlternatives(level,items,catalog){
 if(!['mid','high'].includes(level)||!hbValidReplanStops(items)||!Array.isArray(catalog))return [];
 const locations=new Map(catalog.filter(place=>place&&place.id).map(place=>[place.id,place]));
 const coordinates=stop=>stop&&!stop.isPlaceholder?
  hbMapCoordinates(stop.coordinates)||hbMapCoordinates(locations.get(stop.placeId||stop.id)):null;
 const lastCompleted=items.findLast(stop=>hbCompleted(stop)&&coordinates(stop));
 const next=items.find(stop=>!hbCompleted(stop)&&coordinates(stop));
 const origin=coordinates(lastCompleted||next);
 if(!origin)return [];
 const scheduled=new Set(items.map(stop=>stop.placeId||stop.id));
 const radians=Math.PI/180;
 function nearby(point){
  const dy=(point.lat-origin.lat)*radians,dx=(point.lng-origin.lng)*radians;
  const halfArc=Math.sin(dy/2)**2+Math.cos(origin.lat*radians)*Math.cos(point.lat*radians)*Math.sin(dx/2)**2;
  return 12742*Math.asin(Math.min(1,Math.sqrt(halfArc)));
 }
 return catalog.flatMap(place=>{
  if(!place||scheduled.has(place.id)||!place.id||!place.name||['conflicting','stale'].includes(place.accessStatus))return [];
  const point=hbMapCoordinates(place);
  if(!point)return [];
  const km=nearby(point);
  if(km>2)return [];
  const guide=hbDetailAccessGuide(place);
  const localFacts=Array.isArray(guide?.facts)?guide.facts.filter(f=>f&&typeof f==='object'):[];
  const facts=[...localFacts,...hbAccessFacts(place)];
  const relevant=['rest','wheelchair','stairs','threshold','elevator','entrance','distance'];
  const blocked=facts.some(fact=>hbDetailTopics(fact).some(topic=>relevant.includes(topic))&&
   ['conflicting','stale','verified_no'].includes(fact.status));
  if(blocked||place.mobilityAssessment?.stairsRequired===true)return [];
  const rest=facts.find(fact=>(localFacts.includes(fact)&&fact.status==='source_reported'||
   hbEvidenceStatus(fact)==='이용 가능 확인')&&hbDetailTopics(fact).includes('rest')&&hbEvidenceSourceLink(fact.sourceUrl));
  const mobility=place.mobilityAssessment;
  const documentedWalk=hbScopedMobility(mobility)&&mobility.stairsRequired===false&&
   Number.isFinite(mobility.walkMinutes)&&mobility.walkMinutes>=0;
  // A step-free segment is not automatically an accessible place to rest.
  if(!rest&&(level==='high'||!documentedWalk))return [];
  const note=[rest?.description,documentedWalk?'자료상 확인된 계단 없는 구간: '+mobility.scope+' (도보 '+mobility.walkMinutes+'분)':null]
   .filter(Boolean).join(' ');
  return [{place,point,km,rest:Boolean(rest),note,source:rest?hbEvidenceSourceLink(rest.sourceUrl):null}];
 }).sort((a,b)=>a.km-b.km).slice(0,3);
}
function hbReplanResult(items,proposal,alternative){
 if(!hbValidReplanStops(items)||!proposal||!Array.isArray(proposal.removed))throw Error('invalid');
 const firstRemoved=proposal.removed[0];
 const dropped=new Set(proposal.removed);
 const place=alternative?.place;
 const choose=place&&place.id&&alternative.point&&firstRemoved&&!hbProtected(firstRemoved)&&
  !items.some(stop=>(stop.placeId||stop.id)===place.id);
 return items.flatMap(stop=>{
  if(hbProtected(stop)||!dropped.has(stop))return [stop];
  if(!choose||stop!==firstRemoved)return [];
  const {point,rest}=alternative;
  return [{
   id:place.id,placeId:place.id,name:place.name,address:place.address||null,coordinates:point,
   kind:rest?'rest':place.kind||'spot',isRestCandidate:!!rest,isPlaceholder:false,
   time:stop.time,plannedArrival:stop.plannedArrival||stop.time,stayMinutes:stop.stayMinutes,
   restMinutes:rest?stop.stayMinutes:0,travelTimeStatus:'unknown',transitionBufferMinutes:stop.transitionBufferMinutes,
   done:false,completed:false,must:false,mustVisit:false,reserved:false,booked:false
  }];
 }).map((stop,index)=>({...stop,position:index+1}));
}
// The map's itinerary list uses the same applied result as the side-by-side comparison.
// Removed originals are an explicitly labeled overlay, never proposed visits.
function hbReplanMapStops(items,proposal,result,alternative){
 const alternativeId=alternative?.place?.id;
 return [
  ...result.map((stop,index)=>{
   const inserted=alternativeId&&stop.id===alternativeId;
   const status=inserted?(alternative.rest?'휴식 후보':'대체 후보'):'유지';
   return {...stop,mapLabel:status+' '+(index+1),
    mapNote:inserted?'변경 후 일정에 추가할 '+status+'예요. 이동시간·당일 운영·현장 접근은 확인이 필요해요.':
     '변경 후 일정에 유지되는 방문지예요.'};
  }),
  ...proposal.removed.map(stop=>({...stop,mapLabel:'제외',
   mapNote:'원래 일정의 방문지예요. 변경안을 적용하면 일정에서 제외돼요.'}))
 ];
}
function hbReplanPreservesProtected(before,after){
 if(!hbValidReplanStops(before)||!hbValidReplanStops(after))return false;
 let last=-1;
 for(const stop of before.filter(hbProtected)){
  const index=after.findIndex((candidate,i)=>i>last&&
   (candidate.placeId||candidate.id)===(stop.placeId||stop.id));
  if(index<0)return false;
  const oldFields={...stop},newFields={...after[index]};
  delete oldFields.position;delete newFields.position;
  if(JSON.stringify(oldFields)!==JSON.stringify(newFields))return false;
  last=index;
 }
 return true;
}
function hbApplyReplan(signature,items,proposal,alternative){
 if(!hbValidReplanStops(items)||!proposal||!Array.isArray(proposal.removed)||
  hbTripSignature(s)!==signature||!hbSavedTripMatches(signature))
  return {ok:false,error:'다른 탭에서 일정이 바뀌었거나 상태가 올바르지 않아요. 새로고침 후 확인해 주세요.'};
 if(proposal.removed.some(hbProtected))return {ok:false,error:'보호된 일정은 제외할 수 없어요.'};
 let now;
 try{now=hbReplanResult(items,proposal,alternative)}catch{return {ok:false,error:'변경안을 확인할 수 없어요.'}}
 if(!hbReplanPreservesProtected(items,now))return {ok:false,error:'완료·필수·예약 일정이 변경되어 적용하지 않았어요.'};
 const {region,date}=hbPlanContext(s);
 if(JSON.stringify(items)===JSON.stringify(now))return {ok:false,error:'변경되는 일정이 없어요. 원안을 유지했어요.'};
 const undo={before:items.map(stop=>({...stop})),after:JSON.stringify(now),region,date,appliedAt:new Date().toISOString()};
 if(!hbSaveTripStops(now,undo))return {ok:false,error:'저장에 실패해 기존 일정을 유지했어요.'};
 return {ok:true,stops:now};
}
function hbUndoReplan(){
 const undo=s.hbReplanUndo;
 const {region,date}=hbPlanContext(s);
 if(!undo||undo.region!==region||undo.date!==date||!hbValidReplanStops(undo.before)||
  !hbValidReplanStops(s.stops)||undo.after!==JSON.stringify(s.stops)||
  !hbSavedTripMatches(hbTripSignature(s)))
  return {ok:false,error:'다른 변경이 있어 자동 복구할 수 없어요. 새로고침하고 일정을 확인해 주세요.'};
 if(!hbSaveTripStops(undo.before.map(stop=>({...stop}))))
  return {ok:false,error:'되돌린 일정을 저장하지 못했어요.'};
 return {ok:true};
}

let hbRefreshTravelConditionMap=null;
function plan(){
 const stops=Array.isArray(s.stops)?s.stops:[];
 const {region,date}=hbPlanContext(s);
 const undo=s.hbReplanUndo&&hbValidReplanStops(s.hbReplanUndo.before)&&s.hbReplanUndo.date===date&&s.hbReplanUndo.region===region&&s.hbReplanUndo.after===JSON.stringify(stops);
 hbDropPlanMap();
 el.innerHTML='<h1>가족 여행 일정</h1><p>'+safe(region)+' · '+safe(date)+'</p><div id="hb-plan-map-slot"></div>'+(typeof weatherCard==='function'?weatherCard(region,date):'')+'<p class="warn">이동시간·실제 보행거리·운영시간은 확인 전이에요. 현재 방문 시간은 임시 계획이에요.</p>'+(stops.length?stops.map((x,i)=>'<article class="panel hb-itinerary-row" data-hb-stop-kind="'+safe(['food','rest','spot','travel','move','transport'].includes(x.kind)?x.kind:'unknown')+'"><div><h3>'+safe(x.time||'시간 미정')+' · '+safe(x.name||'장소명 미확인')+'</h3><p class="muted">교통편 및 체류시간 별도 확인</p></div><div class="hb-itinerary-flags"><label><input type="checkbox" data-done="'+i+'" '+(hbCompleted(x)?'checked':'')+'> 완료</label><label><input type="checkbox" data-must="'+i+'" '+(hbMustVisit(x)?'checked':'')+'> 필수</label><label><input type="checkbox" data-reserved="'+i+'" '+(x.reserved||x.booked?'checked':'')+'> 예약됨</label><button type="button" class="light" data-remove="'+i+'" '+(hbProtected(x)?'disabled':'')+'>삭제</button></div></article>').join(''):panel('일정이 비어 있어요','추천 장소를 먼저 담아 주세요.'))+(undo?panel('최근 일정 변경','<p>부모님 컨디션에 따라 이 기기에서 수정한 일정이에요.</p><button type="button" class="light" id="hb-rpl-undo">이전 일정 되돌리기</button>'):'')+'<div class="actions">'+button('add','장소 더 담기',true)+button('fatigue','컨디션에 맞게 일정 조정')+button('share','가족에게 공유')+'</div>';
 document.getElementById('add').onclick=()=>go('/places');document.getElementById('fatigue').onclick=()=>go('/travel');document.getElementById('share').onclick=()=>go('/share/create');
 document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{let i=+b.dataset.remove;if(hbProtected(s.stops[i]))return;
  const stops=s.stops.filter((_,index)=>index!==i).map((stop,index)=>({...stop,position:index+1}));
  if(!hbSaveTripStops(stops)){alert('일정을 저장하지 못했어요. 기존 일정을 유지했어요.');return}
  plan()});
 ['done','must','reserved'].forEach(k=>document.querySelectorAll('[data-'+k+']').forEach(b=>b.onchange=()=>{const index=+b.dataset[k];
  if(!s.stops[index])return;
  const stops=s.stops.map((stop,i)=>i===index?{...stop,[k]:b.checked,...(k==='reserved'?{booked:b.checked}:k==='done'?{completed:b.checked}:{mustVisit:b.checked})}:stop);
  if(!hbSaveTripStops(stops)){b.checked=!b.checked;alert('보호 표시를 저장하지 못했어요.');return}
  plan();
  el.querySelector('[data-'+k+'="'+index+'"]')?.focus()}));
 if(undo)document.getElementById('hb-rpl-undo').onclick=()=>{
  if(!confirm('컨디션 조정 전 일정으로 되돌릴까요?'))return;
  const result=hbUndoReplan();
  if(!result.ok){alert(result.error);return}
  plan();
  document.getElementById('fatigue')?.focus();
 };
}
function travel(){
 hbDropPlanMap();
 hbRefreshTravelConditionMap=null;
 const items=Array.isArray(s.stops)?s.stops:[],nextIndex=hbNextStop(items),next=items[nextIndex];
 const signature=hbTripSignature(s);
 const mapQuery=next&&!next.isPlaceholder&&(next.address||next.placeId||places.some(place=>place.id===next.id))?
  [next.name,next.address].filter(Boolean).join(' '):null;
 const nextCard=next?panel('다음 일정',
  '<h3 id="hb-travel-next" tabindex="-1">'+safe(next.name||'다음 방문지')+'</h3>'+
  '<p>예정 시간: '+safe(next.plannedArrival||next.time||'미정')+'</p>'+
  (next.address?'<p>'+safe(next.address)+'</p>':'')+
  '<div class="actions">'+(mapQuery?'<a target="_blank" rel="noopener noreferrer" href="https://map.naver.com/p/search/'+encodeURIComponent(mapQuery)+'">지도에서 장소 찾기</a>':'')+
  button('hb-travel-complete','이 일정 완료 표시')+'</div>'
 ):panel(items.length?'여행 일정을 모두 마쳤어요':'다음 일정 없음',
  '<p id="hb-travel-next" tabindex="-1">'+(items.length?'일정표에서 지나온 일정을 다시 볼 수 있어요.':'먼저 여행 장소를 일정에 담아 주세요.')+'</p>'
 );
 const canReplan=Boolean(next);
 el.innerHTML='<h1>여행 중 안내</h1>'+nextCard+(items.length?'<div id="hb-travel-condition-map"></div>':'')+'<p id="hb-travel-status" role="status"></p>'+
  '<div class="actions">'+button('hb-travel-plan','일정표로 돌아가기',true)+'</div>'+
  (canReplan?'<h2>컨디션에 따라 일정 조절</h2>'+panel('지금 컨디션을 선택해 주세요',
   '<div class="hb-fatigue-buttons"><button type="button" data-hb-fatigue="low" aria-pressed="false">괜찮아요</button><button type="button" data-hb-fatigue="mid" aria-pressed="false">조금 힘들어요</button><button type="button" data-hb-fatigue="high" aria-pressed="false">많이 힘들어요</button></div><div id="hb-replan-preview" aria-live="polite"></div>'
  ):items.length?'':button('hb-go-pick','장소 선택하기'));
 document.getElementById('hb-travel-plan').onclick=()=>go('/plan');
 if(!items.length){document.getElementById('hb-go-pick').onclick=()=>go('/places');return}
 const mapSlot=document.getElementById('hb-travel-condition-map');
 const catalog=()=>hbPlacesLoadedRegion===hbPlanContext(s).region?places:[];
 let level=null;
 const showMap=(stops=items,options={})=>hbRenderItineraryMap(mapSlot,stops,catalog(),{title:'여행 중 일정 지도',...options});
 hbRefreshTravelConditionMap=()=>{if(level)preview(level);else showMap()};
 showMap();
 if(!canReplan)return;
 document.getElementById('hb-travel-complete').onclick=()=>{
  const status=document.getElementById('hb-travel-status');
  if(hbTripSignature(s)!==signature||!hbSavedTripMatches(signature)){
   status.textContent='다른 탭에서 일정이 바뀌었어요. 새로고침하고 다음 일정을 확인해 주세요.';return;
  }
  const stops=items.map((stop,index)=>index===nextIndex?{...stop,done:true,completed:true}:stop);
  if(!hbSaveTripStops(stops)){status.textContent='완료 상태를 저장하지 못했어요. 다시 시도해 주세요.';return}
  travel();
  document.getElementById('hb-travel-next')?.focus();
  document.getElementById('hb-travel-status').textContent=(next.name||'일정')+' 완료를 이 기기에 저장했어요.';
 };
 function preview(nextLevel){
  level=nextLevel;
  const {region,date}=hbPlanContext(s);
  const proposal=hbProposal(level,items,catalog());
  const alternatives=proposal.removed.length?hbReplanAlternatives(level,items,catalog()):[];
  const compare=document.getElementById('hb-replan-preview');
  const showList=stops=>stops.length?'<ul>'+stops.map(stop=>'<li>'+safe(stop.time||'시간 미정')+' · '+
   safe(stop.name||'방문지')+(hbProtected(stop)?' <span class="hb-protected">보호: '+
   [hbCompleted(stop)?'완료':null,hbMustVisit(stop)?'필수':null,hbReserved(stop)?'예약':null].filter(Boolean).join('/')+'</span>':'')+'</li>').join('')+'</ul>':
   '<p class="muted">해당 장소 없음</p>';
  let selected=-1;
  compare.innerHTML='<section class="hb-rpl-card"><h3>변경안 미리보기</h3>'+
   '<div class="hb-replan-compare"><div><h3>기존 일정</h3>'+showList(items)+'</div>'+
   '<div><h3>변경 후 일정</h3><div data-replan-result></div><h3>제외 제안</h3>'+showList(proposal.removed)+'</div></div>'+
   (alternatives.length?'<fieldset><legend>변경 방법</legend><label><input type="radio" name="hb-replan-choice" value="-1" checked> 방문 줄이기</label>'+
    alternatives.map(({place,rest,km,note,source},index)=>'<p><label><input type="radio" name="hb-replan-choice" value="'+index+'"> <strong>'+
     safe(place.name)+'</strong>로 교체 · '+(rest?'휴식 공간 안내 있음':'계단 없는 구간 확인')+
     ' · 직선거리 약 '+km.toFixed(1)+'km</label><br>'+safe(note)+
     (source?' <a href="'+safe(source)+'" target="_blank" rel="noopener noreferrer">출처</a>':'')+'</p>').join('')+'</fieldset>':
    level!=='low'&&proposal.removed.length?'<p>확인된 대안 없음. 방문을 줄이거나 쉬기·숙소 복귀·귀가를 검토해 주세요.</p>':'')+
   '<p class="warn">완료·필수·예약 일정은 보호돼요. 대안까지의 이동시간과 당일 운영 여부는 방문 전 확인해 주세요.</p>'+
   '<div class="actions"><button type="button" class="light" id="hb-rpl-cancel">취소</button>'+
   (proposal.removed.length?'<button type="button" id="hb-rpl-confirm">이 변경안 적용</button>':'<p>현재 일정을 유지해요.</p>')+
   '</div></section>';
  const result=()=>hbReplanResult(items,proposal,alternatives[selected]);
  const update=()=>{
   const proposed=result();
   compare.querySelector('[data-replan-result]').innerHTML=showList(proposed);
   for(const input of compare.querySelectorAll('[name="hb-replan-choice"]'))input.checked=Number(input.value)===selected;
   hbDropPlanMap();
   showMap(hbReplanMapStops(items,proposal,proposed,alternatives[selected]),{
    title:'변경안 지도 · 적용 전 미리보기'
   });
  };
  for(const input of compare.querySelectorAll('[name="hb-replan-choice"]'))input.onchange=()=>{
   selected=Number(input.value);update();
  };
  update();
  document.getElementById('hb-rpl-cancel').onclick=()=>{
   level=null;
   compare.innerHTML='';
   const active=el.querySelector('[data-hb-fatigue][aria-pressed="true"]');
   active?.setAttribute('aria-pressed','false');
   hbDropPlanMap();
   showMap();
   active?.focus();
  };
  const apply=document.getElementById('hb-rpl-confirm');if(!apply)return;
  apply.onclick=()=>{
   const outcome=hbApplyReplan(signature,items,proposal,alternatives[selected]);
   if(!outcome.ok){
    document.getElementById('hb-travel-status').textContent=outcome.error;
    return;
   }
   go('/plan');
  };
 }
 document.querySelectorAll('[data-hb-fatigue]').forEach(button=>button.onclick=()=>{
  document.querySelectorAll('[data-hb-fatigue]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));
  preview(button.dataset.hbFatigue);
 });
}
