let geoStarted=false,nearbyMode='위치 확인 중',nearbyItems=[],nearbyCenter=[37.5665,126.978],nearbyUser=false,nearbyLoading=false,nearbyError='',nearFilter='all',leafletPromise=null,nearbyMap=null,nearbyLayer=null,nearbyRequestId=0,featuredPlaces=[],featuredMode=false,featuredLoading=false,featuredError='',featuredRequestId=0;
let nearbyCenterLabel='서울 시청';
function setNearbyStatus(){
  const status=document.getElementById('nearby-status');
  if(!status)return;
  status.setAttribute('role','status');
  status.textContent=nearbyLoading
    ? nearbyMode+' · 실제 관광정보를 확인 중이에요…'
    : nearbyError
      ? nearbyMode+' · '+nearbyError
      : nearbyMode+' · 주변 '+nearbyItems.length+'곳 · 유명 명소 '+featuredPlaces.length+'곳 (별도 선정)';
}
function requestLocation(){
  if(!navigator.geolocation){
    nearbyMode='기기 위치를 사용할 수 없어 서울 시청 중심을 표시해요.';
    fetchNearby(37.5665,126.978,false);
    return;
  }
  const request=++nearbyRequestId;
  ++featuredRequestId;
  nearbyMode='현재 위치 확인 중';
  nearbyError='';
  nearbyLoading=true;
  setNearbyStatus();
  drawNearbyList();
  navigator.geolocation.getCurrentPosition(position=>{
    if(request!==nearbyRequestId)return;
    nearbyMode='내 현재 위치 기준';
    fetchNearby(position.coords.latitude,position.coords.longitude,true);
  },error=>{
    if(request!==nearbyRequestId)return;
    const messages={
      1:'위치 권한이 꺼져 있어 서울 시청 중심을 표시해요.',
      2:'현재 위치를 확인할 수 없어 서울 시청 중심을 표시해요.',
      3:'위치 확인이 오래 걸려 서울 시청 중심을 표시해요.'
    };
    nearbyMode=messages[error.code]||messages[2];
    fetchNearby(37.5665,126.978,false);
  },{enableHighAccuracy:false,timeout:9000,maximumAge:180000});
}
function leaflet(){if(window.L)return Promise.resolve(window.L);if(leafletPromise)return leafletPromise;leafletPromise=new Promise((resolve,reject)=>{let css=document.createElement('link');css.rel='stylesheet';css.href='https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';document.head.appendChild(css);let js=document.createElement('script');js.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';js.integrity='sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';js.crossOrigin='';js.onload=()=>resolve(window.L);js.onerror=()=>reject(Error('지도 라이브러리를 불러올 수 없어'));document.head.appendChild(js)});return leafletPromise}

let naverSdkPromise=null;
let naverSdkAuthFailed=false;
let failNaverLoad=null;
function loadNaverMap(){
  window.navermap_authFailure=()=>{
    naverSdkAuthFailed=true;
    if(failNaverLoad)failNaverLoad();
    else naverSdkPromise=null;
    hbPlanMapView?.failure();
  };
  if(window.naver?.maps?.Map&&!naverSdkAuthFailed)return Promise.resolve(window.naver.maps);
  if(naverSdkPromise)return naverSdkPromise;
  naverSdkPromise=new Promise((resolve,reject)=>{
    naverSdkAuthFailed=false;
    const script=document.createElement('script');
    script.src='https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=YOUR_NAVER_MAP_CLIENT_ID';
    script.async=true;
    const fail=()=>{
      clearTimeout(timer);
      failNaverLoad=null;
      script.remove();
      reject(Error('Map unavailable'));
    };
    const timer=setTimeout(fail,10000);
    failNaverLoad=fail;
    script.onload=()=>{
      if(!window.naver?.maps?.Map||naverSdkAuthFailed){fail();return;}
      clearTimeout(timer);
      failNaverLoad=null;
      resolve(window.naver.maps);
    };
    script.onerror=fail;
    document.head.appendChild(script);
  }).catch(error=>{
    naverSdkPromise=null;
    throw error;
  });
  return naverSdkPromise;
}
let hbPlanMapView=null;

function hbClearPlanMap(view){
 for(const marker of view.markers.splice(0)){
  try{marker.setMap(null)}catch{}
 }
 try{view.map?.destroy()}catch{}
 view.map=null;
}

function hbDropPlanMap(){
 const view=hbPlanMapView;
 hbPlanMapView=null;
 if(view)hbClearPlanMap(view);
}

function hbPlanMapStops(stops, catalog){
 const byId=new Map(catalog.map(place=>[place.id,place]));
 return stops.map((stop,index)=>{
  const id=stop.placeId||stop.id;
  const place=stop.isPlaceholder?null:byId.get(id);
  return {stop,index,place:place||{id,name:stop.name,address:stop.address},
   coordinates:stop.isPlaceholder?null:hbMapCoordinates(place)||hbMapCoordinates(stop.coordinates)};
 });
}

function hbRenderPlanMap(){
 const slot=document.getElementById('hb-plan-map-slot');
 const catalog=hbPlacesLoadedRegion===hbPlanContext(s).region?places:[];
 hbRenderItineraryMap(slot,s.stops,catalog);
}

function hbRenderItineraryMap(slot, stops, catalog, options={}){
 if(!slot||!Array.isArray(stops)||!stops.length)return;
 const selected=options.selectedIndex??(hbPlanMapView?.slot===slot?hbPlanMapView.selected:null);
 const entries=hbPlanMapStops(stops,catalog);
 const mapped=entries.filter(entry=>entry.coordinates);
 hbDropPlanMap();
 slot.innerHTML='<section class="panel hb-trip-map-panel" aria-labelledby="hb-trip-map-title">'+
  '<h2 id="hb-trip-map-title">'+safe(options.title||'일정 지도')+'</h2>'+
  '<div id="hb-trip-map" aria-label="네이버 일정 지도"></div>'+
  '<button type="button" class="light" id="hb-trip-overview" hidden>일정 전체 보기</button>'+
  '<div id="hb-trip-arrival" aria-live="polite"></div><ol class="hb-trip-map-list">'+entries.map(({stop,index,coordinates,place})=>
   '<li><button type="button" class="light" data-trip-stop="'+index+'" aria-pressed="false">'+
   '<span class="hb-trip-number">'+safe(stop.mapLabel||index+1)+'</span><time>'+safe(stop.plannedArrival||stop.time||'미정')+'</time> '+
   '<strong>'+safe(stop.name||'장소명 미확인')+'</strong>'+
   (place?.address||stop.address?'<small class="hb-trip-address">주소 '+safe(place?.address||stop.address)+'</small>':'')+
   (coordinates?'':' <small>'+(stop.isPlaceholder?'장소 미정':'지도 위치 미확인')+'</small>')+'</button></li>').join('')+
  '</ol></section>';
 const host=slot.querySelector('#hb-trip-map');
 const card=slot.querySelector('#hb-trip-arrival');
 const overview=slot.querySelector('#hb-trip-overview');
 const buttons=Array.from(slot.querySelectorAll('[data-trip-stop]'));
 const view={slot,map:null,markers:[],selected:null};
 hbPlanMapView=view;
 const current=()=>hbPlanMapView===view&&host.isConnected;
 const select=(index,notify=false)=>{
  const entry=entries[index];
  if(!entry||!current())return;
  view.selected=index;
  if(notify)options.onSelect?.(entry);
  overview.hidden=false;
  buttons.forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
  const {place,stop,coordinates}=entry;
  if(stop.isPlaceholder){
   card.innerHTML='<p>장소가 정해지면 도착 안내를 볼 수 있어요.</p>';
   if(view.map)drawOverview();
   return;
  }
  const guide=hbDetailAccessGuide(place);
  const facts=[...(guide?.facts||[]),...hbAccessFacts(place)];
  card.innerHTML='<h3>'+safe(stop.name||place.name)+'</h3>'+
   (stop.mapNote?'<p>'+safe(stop.mapNote)+'</p>':'')+hbArrivalMarkup(place,guide,facts);
  hbBindAccessMap(guide);
  if(view.map){
   if(coordinates)drawSelected(entry,guide,facts);
   else drawOverview();
  }
 };
 const failure=()=>{
  if(!current()||host.dataset.mapState==='error')return;
  hbClearPlanMap(view);
  host.dataset.mapState='error';
  host.innerHTML='<p role="status">지도를 불러오지 못했어요. 아래 목록과 도착 안내는 계속 이용할 수 있어요.</p><button type="button" class="light">다시 불러오기</button>';
  host.querySelector('button').onclick=()=>{hbRenderItineraryMap(slot,stops,catalog,{...options,selectedIndex:view.selected});slot.querySelector('#hb-trip-map')?.focus()};
 };
 view.failure=failure;
 let M;
 const clearAmenities=()=>{
  for(const marker of view.markers.splice(mapped.length))marker.setMap(null);
 };
 const fitOptions={top:44,left:44,right:44,bottom:44};
 const drawOverview=()=>{
  try{
   clearAmenities();
   const first=mapped[0].coordinates;
   view.map.setCenter(new M.LatLng(first.lat,first.lng));
   view.map.setZoom(14);
   if(mapped.length>1){
    const bounds=new M.LatLngBounds();
    for(const {coordinates} of mapped)bounds.extend(new M.LatLng(coordinates.lat,coordinates.lng));
    view.map.fitBounds(bounds,fitOptions);
   }
  }catch{failure()}
 };
 overview.onclick=()=>{
  view.selected=null;
  buttons.forEach(button=>button.setAttribute('aria-pressed','false'));
  card.replaceChildren();
  if(view.map)drawOverview();
  host.focus({preventScroll:true});
  overview.hidden=true;
 };
 const drawSelected=(entry,guide,facts)=>{
  try{
   clearAmenities();
   const conflicting=hbDetailSummary(facts,['dropoff','entrance','threshold','stairs','slope','wheelchair','elevator','toilet']);
   const amenities=[['주차·하차',guide?.arrival],['입구',guide?.entrance],['화장실',guide?.restroom]];
   const bounds=new M.LatLngBounds();
   const center=new M.LatLng(entry.coordinates.lat,entry.coordinates.lng);
   bounds.extend(center);
   let count=1;
   if(!['자료가 서로 달라요','이용 제한 자료가 있어요'].includes(conflicting)){
    for(const [label,location] of amenities){
     const point=hbMapCoordinates(location);
     if(!point)continue;
     const position=new M.LatLng(point.lat,point.lng);
     bounds.extend(position);
     count++;
     view.markers.push(new M.Marker({map:view.map,position,title:label,
      icon:{content:'<span class="hb-trip-amenity">'+label+'</span>',anchor:new M.Point(35,15)},zIndex:150}));
    }
   }
   if(count>1)view.map.fitBounds(bounds,fitOptions);
   else{view.map.setCenter(center);view.map.setZoom(16);}
  }catch{failure()}
 };
 host.tabIndex=-1;
 if(!mapped.length){
  host.dataset.mapState='empty';
  host.innerHTML='<p role="status">지도에 표시할 방문지 위치를 확인하지 못했어요.</p>';
 }else{
  host.dataset.mapState='loading';
  host.innerHTML='<p role="status">네이버지도를 불러오는 중이에요…</p>';
  loadNaverMap().then(sdk=>{
   if(!current())return;
   if(naverSdkAuthFailed){failure();return;}
   M=sdk;
   host.replaceChildren();
   const first=mapped[0].coordinates;
   view.map=new M.Map(host,{center:new M.LatLng(first.lat,first.lng),zoom:14,minZoom:6,maxZoom:20,scrollWheel:false});
   for(const {coordinates,index,stop} of mapped){
    const position=new M.LatLng(coordinates.lat,coordinates.lng);
    const label=stop.mapLabel||index+1;
    const marker=new M.Marker({map:view.map,position,title:(stop.mapLabel||label+'번')+' '+stop.name,
     icon:{content:'<span class="hb-trip-number">'+safe(label)+'</span>',anchor:new M.Point(16,16)}});
    view.markers.push(marker);
    M.Event.addListener(marker,'click',()=>select(index,true));
   }
   drawOverview();
   if(!view.map)return;
   host.dataset.mapState='ready';
   if(view.selected!==null)select(view.selected);
  }).catch(failure);
 }
 buttons.forEach((button,index)=>button.onclick=()=>select(index,true));
 if(selected!==null)select(selected);
}

function hbSearchMapCenter(){
  if(!nearbyMap)return;
  let point;
  try{point=nearbyMap.getCenter()}catch{
    nearbyError='지도 중심 위치를 읽지 못했어요. 서울 중심 보기나 지도 다시 불러오기를 이용해 주세요.';
    setNearbyStatus();
    return;
  }
  const lat=point?.lat?.(),lng=point?.lng?.();
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180){
    nearbyError='지도 중심 위치를 읽지 못했어요. 서울 중심 보기나 지도 다시 불러오기를 이용해 주세요.';
    setNearbyStatus();
    return;
  }
  nearbyMode='현재 지도 중심 기준';
  fetchNearby(lat,lng,false,'지도 중심');
}

function dropNearbyMap(){
  const map=nearbyMap;
  const markers=nearbyLayer||[];
  nearbyMap=null;
  nearbyLayer=null;
  // SDK objects may be partially initialized when the user leaves the map.
  for(const marker of markers){
    try{marker.setMap(null)}catch{}
  }
  try{map?.destroy()}catch{}
}
function renderNearbyMapFailure(host){
  if(!host||document.getElementById('nearby-map')!==host)return;
  host.dataset.mapState='error';
  const searchButton=document.getElementById('hb-search-map-center');
  if(searchButton)searchButton.disabled=true;
  host.innerHTML='<div style="padding:22px;max-width:520px"><p role="status"><strong>지도를 표시할 수 없어요.</strong> 아래의 장소 목록은 계속 이용할 수 있어요.</p><button id="hb-map-retry" type="button" class="light">지도 다시 불러오기</button></div>';
  host.querySelector('button').onclick=()=>{
    host.setAttribute('tabindex','-1');
    host.focus({preventScroll:true});
    mountNearbyMap();
  };
}
function mountNearbyMap(){
  dropNearbyMap();
  const host=document.getElementById('nearby-map');
  if(!host)return;
  const searchButton=document.getElementById('hb-search-map-center');
  if(searchButton)searchButton.disabled=true;
  host.dataset.mapState='loading';
  host.innerHTML='<p role="status" style="padding:22px">네이버 지도를 불러오는 중이에요…</p>';
  loadNaverMap().then(M=>{
    if(document.getElementById('nearby-map')!==host)return;
    host.innerHTML='';
    nearbyMap=new M.Map(host,{center:new M.LatLng(...nearbyCenter),zoom:nearbyUser?15:14,minZoom:10,maxZoom:20,zoomControl:true,zoomControlOptions:{position:M.Position.TOP_RIGHT},scaleControl:true,scrollWheel:false,logoControl:true,mapDataControl:true});
    nearbyLayer=[];
    updateNearbyPins();
    if(nearbyMap){
      host.dataset.mapState='ready';
      if(searchButton)searchButton.disabled=false;
    }
  }).catch(()=>{
    if(document.getElementById('nearby-map')!==host)return;
    dropNearbyMap();
    renderNearbyMapFailure(host);
  });
}
function updateNearbyPins(){
  try{setNearbyPins()}catch{
    const host=document.getElementById('nearby-map');
    dropNearbyMap();
    renderNearbyMapFailure(host);
  }
}
function setNearbyPins(){if(!nearbyMap||!window.naver?.maps)return;let M=window.naver.maps;if(nearbyLayer)for(let x of nearbyLayer)x.setMap(null);nearbyLayer=[];nearbyMap.setCenter(new M.LatLng(nearbyCenter[0],nearbyCenter[1]));nearbyMap.setZoom(nearbyUser?15:14);let self=new M.Marker({map:nearbyMap,position:new M.LatLng(nearbyCenter[0],nearbyCenter[1]),icon:{content:'<div class="hb-current">📍 '+safe(nearbyCenterLabel)+(nearbyUser?'':' 기준')+'</div>',anchor:new M.Point(49,37)},zIndex:999});nearbyLayer.push(self);
let sorted=nearbyItems.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)).sort((a,b)=>a.distanceKm-b.distanceKm);let labels=0;for(let p of sorted){if(featuredMode)continue;let near=p.distanceKm<=1.3&&labels<13;if(near)labels++;let icon=near?'<div class="hb-naver-place '+(p.kind==='food'?'hb-food':'hb-spot')+'">'+(p.kind==='food'?'🍚 ':'🌿 ')+safe(p.name)+'</div>':'<div class="hb-naver-dot '+(p.kind==='food'?'hb-food':'hb-spot')+'"></div>';let m=new M.Marker({map:nearbyMap,position:new M.LatLng(p.lat,p.lng),title:p.name,icon:{content:icon,anchor:new M.Point(near?65:6,near?33:6)},zIndex:near?200-Math.round(p.distanceKm*30):20});nearbyLayer.push(m);let info=new M.InfoWindow({content:'<div style="padding:12px;max-width:260px;color:#284238"><b>'+safe(p.name)+'</b><p style="margin:4px 0;font-size:12px">'+safe(p.address||'주소 없음')+'</p><small>직선거리 '+safe(p.distanceKm)+'km · 실제 보행 동선 미확인 · 한국관광공사 TourAPI</small></div>',borderWidth:0,backgroundColor:'#fff'});M.Event.addListener(m,'click',()=>info.open(nearbyMap,m))}
for(let p of featuredPlaces){let icon='<div class="hb-featured-marker">📍 '+safe(p.name)+'</div>';let marker=new M.Marker({map:nearbyMap,position:new M.LatLng(p.lat,p.lng),title:p.name,icon:{content:icon,anchor:new M.Point(78,36)},zIndex:500});nearbyLayer.push(marker);let win=new M.InfoWindow({content:'<div style="padding:12px;max-width:260px"><b>📍 '+safe(p.name)+'</b><p style="font-size:12px">'+safe(p.address||'주소 없음')+'</p><small>관광공사 정보 · 직선거리 '+safe(p.distanceKm)+'km · 여행 명소 편집 선정, 공식 인기순위 아님</small></div>',borderWidth:0});M.Event.addListener(marker,'click',()=>{win.open(nearbyMap,marker);nearbyMap.panTo(new M.LatLng(p.lat,p.lng))})}}
function showFamousOnMap(){if(!nearbyMap||!window.naver?.maps||!featuredPlaces.length)return;let M=window.naver.maps;let bounds=new M.LatLngBounds();bounds.extend(new M.LatLng(nearbyCenter[0],nearbyCenter[1]));for(let p of featuredPlaces)bounds.extend(new M.LatLng(p.lat,p.lng));nearbyMap.fitBounds(bounds,{top:70,right:45,bottom:60,left:45})}

async function fetchNearby(lat,lng,isUser,centerLabel){let n=++nearbyRequestId;nearbyCenterLabel=centerLabel||(isUser?'내 위치':'서울 시청');nearbyCenter=[lat,lng];nearbyUser=isUser;nearbyLoading=true;nearbyError='';nearbyItems=[];featuredPlaces=[];featuredLoading=true;featuredError='';setNearbyStatus();drawNearbyList();updateNearbyPins();loadFeatured(lat,lng,++featuredRequestId);try{let d=await get('/api/nearby.js?lat='+encodeURIComponent(lat.toFixed(4))+'&lng='+encodeURIComponent(lng.toFixed(4)));if(n!==nearbyRequestId)return;nearbyItems=d.places||[];if(!nearbyItems.length)nearbyError='이 반경에서 조회된 장소가 없어요'}catch(e){if(n!==nearbyRequestId)return;nearbyError='주변 장소를 불러오지 못했어요. 위치를 다시 선택해 주세요.'}finally{if(n===nearbyRequestId){nearbyLoading=false;setNearbyStatus();updateNearbyPins();drawNearbyList()}}}
async function loadFeatured(lat,lng,id){try{let r=await get('/api/featured.js?lat='+encodeURIComponent(lat.toFixed(4))+'&lng='+encodeURIComponent(lng.toFixed(4)));if(id!==featuredRequestId)return;featuredPlaces=r.places||[];featuredError=featuredPlaces.length?'':'근처에서 검증된 유명 명소를 찾지 못했어요'}catch(e){if(id!==featuredRequestId)return;featuredError='대표 관광지 자료를 불러오지 못했어요.'}finally{if(id===featuredRequestId){featuredLoading=false;setNearbyStatus();updateNearbyPins();drawNearbyList()}}}
function drawNearbyList(){let box=document.getElementById('nearby-list');if(!box)return;let sum=document.getElementById('featured-summary');if(sum)sum.textContent=featuredLoading?'📍 주변 대표 관광지를 불러오는 중이에요…':featuredPlaces.length?'📍 대표 관광지 '+featuredPlaces.length+'곳 지도에 표시 · 관광지 편집 선정 (공식 인기순위 아님)':featuredError;let quick=document.getElementById('featured-quicklinks');if(quick){quick.innerHTML=featuredPlaces.map((p,i)=>'<button type="button" class="light hb-famous-chip" data-featured-jump="'+i+'">'+safe(p.name)+'</button>').join('');quick.querySelectorAll('[data-featured-jump]').forEach(b=>b.onclick=()=>{let p=featuredPlaces[Number(b.dataset.featuredJump)];if(!p)return;if(nearbyMap&&window.naver?.maps){nearbyMap.setCenter(new window.naver.maps.LatLng(p.lat,p.lng));nearbyMap.setZoom(15)}document.getElementById('nearby-map')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})})};const filtered=nearFilter==='famous'?featuredPlaces:nearbyItems.filter(p=>nearFilter==='all'||nearFilter==='food'&&p.kind==='food'||nearFilter==='spot'&&p.kind!=='food');if(nearFilter==='famous'&&featuredLoading){box.innerHTML='<p class="muted">유명 관광지를 검색하고 있어요…</p>';return}if(nearFilter!=='famous'&&nearbyLoading){box.innerHTML='<p class="muted">주변 관광지와 식당을 찾고 있어요…</p>';return}if(!filtered.length){box.innerHTML='<p class="muted">'+(nearFilter==='famous'?safe(featuredError||'근처 검증된 유명 관광지를 찾지 못했어요.'):safe(nearbyError||'이 조건에서 검색된 장소가 없어요.'))+'</p>';return}box.innerHTML='<div class="grid">'+filtered.slice(0,30).map(p=>'<div class="card"><span class="chip">'+(p.featured?'⭐ 주요 관광명소':p.kind==='food'?'🍚 음식점':'🌿 관광지')+'</span><h3>'+safe(p.name)+'</h3><p class="muted">'+safe(p.address||'주소 미제공')+'</p><p class="muted">'+safe(nearbyCenterLabel)+'에서 직선거리 '+safe(p.distanceKm)+'km · 보행 거리 및 접근성 미확인</p><div class="actions">'+(p.featured?'<button class="light" data-zoom-featured="'+safe(p.id)+'">지도에서 보기</button>':'')+'<a target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(p.lat+','+p.lng)+'">장소 보기 ↗</a><button class="light" data-near-pick="'+safe(p.id)+'">'+(s.chosen.includes(p.id)?'선택됨':'일정에 담기')+'</button></div></div>').join('')+'</div>';box.querySelectorAll('[data-near-pick]').forEach(b=>b.onclick=()=>{let p=[...featuredPlaces,...nearbyItems].find(v=>v.id===b.dataset.nearPick);if(!p)return;if(!s.chosen.includes(p.id))s.chosen.push(p.id);if(!places.some(v=>v.id===p.id))places.push({...p,hbPickedRegion:s.region,accessFacts:[],accessStatus:'unknown'});save();drawNearbyList()});box.querySelectorAll('[data-zoom-featured]').forEach(b=>b.onclick=()=>{let p=featuredPlaces.find(v=>v.id===b.dataset.zoomFeatured);if(p&&nearbyMap&&window.naver?.maps){nearbyMap.setCenter(new window.naver.maps.LatLng(p.lat,p.lng));nearbyMap.setZoom(16);document.getElementById('nearby-map')?.scrollIntoView({behavior:'smooth',block:'center'})}})}


addEventListener('hashchange',render);render();load()
})();
