let geoStarted=false,nearbyMode='위치 확인 중',nearbyItems=[],nearbyCenter=[37.5665,126.978],nearbyUser=false,nearbyLoading=false,nearbyError='',nearFilter='spot',leafletPromise=null,nearbyMap=null,nearbyLayer=null,nearbyRequestId=0,featuredPlaces=[],featuredMode=false,featuredLoading=false,featuredError='',featuredRequestId=0;
let nearbyCenterLabel='서울 시청',nearbyPinWarning='',nearbyResultMeta=null,nearbyResultCenterLabel='서울 시청',nearbyResultCategory=null;
let nearbyMapEpoch=0,nearbyMapListeners=[],nearbyMapMarkers=new Map(),nearbySelectedId=null;
function hbValidMapPoint(lat,lng){
 return Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180;
}
function setNearbyStatus(){
  const status=document.getElementById('nearby-status');
  if(!status)return;
  status.setAttribute('role','status');
  status.textContent=nearbyLoading
    ? nearbyMode+' · 실제 관광정보를 확인 중이에요…'
    : nearbyError
      ? nearbyMode+' · '+nearbyError
      : nearbyMode+' · 주변 '+nearbyItems.length+'곳 · 유명 명소 '+featuredPlaces.length+'곳 (별도 선정)';
  if(nearbyResultMeta?.partial)status.textContent+=' · 일부 자료만 표시'+(nearbyResultMeta.failures?.length?' (일부 유형 조회 실패)':'');
  if(nearbyResultMeta?.hiddenPastEvents)status.textContent+=' · 이전 연도 행사명 '+nearbyResultMeta.hiddenPastEvents+'건 제외 (일정 미확인)';
  if(nearbyResultMeta?.supplementedIds?.length)status.textContent+=' · 공식 키워드 조회 자료 '+nearbyResultMeta.supplementedIds.length+'곳 보강';
  if(nearbyResultMeta?.searchMethod==='nationwide_catalog')status.textContent+=' · 전국 수집 자료 '+String(nearbyResultMeta.snapshotCollectedAt||'').slice(0,10)+' · '+nearbyResultMeta.totalAvailable+'곳 중 '+nearbyItems.length+'곳'+(nearbyResultMeta.hasNext?' (지도 위치를 좁혀 보세요)':'');
  else if(nearbyResultMeta?.nationwideCatalogStatus)status.textContent+=' · 전국 수집 자료 미적용, '+(nearbyResultMeta.searchMethod==='locationBasedList2'?'제한된 실시간 위치 조회':'일부 저장 자료');
  if((nearbyError||nearbyLoading)&&nearbyItems.length&&nearbyResultCategory===nearFilter)status.textContent+=' · 마지막 정상 조회: '+nearbyResultCenterLabel;
  if(nearbyPinWarning)status.textContent+=' · '+nearbyPinWarning;
}
function requestLocation(){
  const request=++nearbyRequestId;
  ++featuredRequestId;
  nearbyMode='현재 위치 확인 중';
  nearbyError='';
  nearbyLoading=true;
  setNearbyStatus();
  drawNearbyList();
  const fallback=message=>{
    if(request!==nearbyRequestId)return;
    nearbyMode=message;
    fetchNearby(37.5665,126.978,false);
  };
  if(!navigator.geolocation){
    fallback('기기 위치를 사용할 수 없어 서울 시청 중심을 표시해요.');
    return;
  }
  try{
    navigator.geolocation.getCurrentPosition(position=>{
      if(request!==nearbyRequestId)return;
      const lat=position?.coords?.latitude,lng=position?.coords?.longitude;
      if(!hbValidMapPoint(lat,lng)){
        fallback('현재 위치 좌표를 확인할 수 없어 서울 시청 중심을 표시해요.');
        return;
      }
      nearbyMode='내 현재 위치 기준';
      fetchNearby(lat,lng,true);
    },error=>{
      const messages={
        1:'위치 권한이 꺼져 있어 서울 시청 중심을 표시해요.',
        2:'현재 위치를 확인할 수 없어 서울 시청 중심을 표시해요.',
        3:'위치 확인이 오래 걸려 서울 시청 중심을 표시해요.'
      };
      fallback(messages[error?.code]||messages[2]);
    },{enableHighAccuracy:false,timeout:9000,maximumAge:180000});
  }catch{
    fallback('위치를 확인할 수 없어 서울 시청 중심을 표시해요.');
  }
}
function leaflet(){if(window.L)return Promise.resolve(window.L);if(leafletPromise)return leafletPromise;leafletPromise=new Promise((resolve,reject)=>{let css=document.createElement('link');css.rel='stylesheet';css.href='https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';document.head.appendChild(css);let js=document.createElement('script');js.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';js.integrity='sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';js.crossOrigin='';js.onload=()=>resolve(window.L);js.onerror=()=>reject(Error('지도 라이브러리를 불러올 수 없어'));document.head.appendChild(js)});return leafletPromise}

let naverSdkPromise=null;
let naverSdkAuthFailed=false;
let failNaverLoad=null;
function loadNaverMap(){
  window.navermap_authFailure=()=>{
    naverSdkAuthFailed=true;
    naverSdkPromise=null;
    if(failNaverLoad)failNaverLoad();
    hbPlanMapView?.failure?.();
    const host=document.getElementById('nearby-map');
    if(host&&host.dataset.mapState==='ready'){
      dropNearbyMap();
      renderNearbyMapFailure(host,'auth');
    }
  };
  if(naverSdkPromise)return naverSdkPromise;
  if(window.naver?.maps?.Map&&!naverSdkAuthFailed)return Promise.resolve(window.naver.maps);
  naverSdkPromise=new Promise((resolve,reject)=>{
    naverSdkAuthFailed=false;
    const script=document.createElement('script');
    script.src='https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=YOUR_NAVER_MAP_CLIENT_ID';
    script.async=true;
    let settled=false;
    const fail=()=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      failNaverLoad=null;
      script.remove();
      reject(Error('Map unavailable'));
    };
    const timer=setTimeout(fail,10000);
    failNaverLoad=fail;
    script.onload=()=>{
      if(settled)return;
      if(!window.naver?.maps?.Map||naverSdkAuthFailed){fail();return;}
      settled=true;
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
 for(const listener of view.listeners||[]){
  try{window.naver?.maps?.Event?.removeListener?.(listener)}catch{}
 }
 if(view.listeners)view.listeners.length=0;
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
 const view={slot,map:null,markers:[],listeners:[],selected:null};
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
    view.listeners.push(M.Event.addListener(marker,'click',()=>{if(current())select(index,true)}));
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


function createToiletOverlay({fetchImpl = globalThis.fetch, replacePins, setStatus}) {
  let enabled = false, version = 0, request = null;
  function stop() { ++version; request?.abort(); request = null; replacePins([]); }
  function toggle(on) { enabled = Boolean(on); stop(); setStatus(enabled ? 'idle' : 'disabled'); }
  async function refresh(lat, lng) {
    if (!enabled) return;
    stop();
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) { setStatus('unavailable'); return; }
    const current = version;
    const controller = new AbortController(); request = controller;
    setStatus('loading');
    try {
      const q = new URLSearchParams({lat: String(lat), lng: String(lng), radius: '2000', limit: '50'});
      const response = await fetchImpl('/api/toilets?' + q, {signal: controller.signal, cache: 'no-store'});
      if (current !== version) return;
      if (!response.ok) { setStatus('unavailable'); return; }
      const body = await response.json();
      if (current !== version) return;
      if (body.status !== 'ok' || body.coverage !== 'partial_seoul_gyeonggi' || !Array.isArray(body.items) || body.items.length > 50) { setStatus('unavailable'); return; }
      const pins = body.items.filter(p => p && p.category === 'public_toilet' && typeof p.id === 'string' && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && p.accessibleRoute === 'unknown');
      if (pins.length !== body.items.length || new Set(pins.map(p => p.id)).size !== pins.length) { setStatus('unavailable'); return; }
      const detail = body.coverageDetail || null;
      if (detail && (detail.complete !== false || typeof detail.region !== 'string' || typeof detail.attribution !== 'string' || typeof detail.sourceUrl !== 'string')) { setStatus('unavailable'); return; }
      if (pins.some(p => p.coordinatePrecision === 'facility_location' && (!detail || !p.coordinateEvidence?.attribution))) { setStatus('unavailable'); return; }
      replacePins(pins);
      setStatus(pins.length ? 'partial' : 'empty_in_partial_coverage', detail);
    } catch (error) { if (current === version) setStatus('unavailable'); }
    finally { if (current === version) request = null; }
  }
  function dispose() { enabled = false; stop(); setStatus('disabled'); }
  return {toggle, refresh, dispose};
}

let hbToiletOverlayView=null;
function hbMountToiletOverlay(map,M,host){
  // Optional layer. Never break the map or itinerary if this renderer is unavailable.
  if(!host?.insertAdjacentElement||!document.createElement)return;
  const panel=document.createElement('section');
  panel.id='hb-toilet-overlay';
  panel.className='panel';
  const toggle=document.createElement('button');
  toggle.type='button';toggle.className='light';
  toggle.textContent='공중화장실 보기';toggle.setAttribute('aria-pressed','false');
  toggle.style.minHeight='44px';
  const status=document.createElement('p');
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const list=document.createElement('div');
  panel.append(toggle,status,list);
  host.insertAdjacentElement('afterend',panel);
  let enabled=false,disposed=false,timer=null,listener=null,markers=[],links=[];
  const clear=()=>{
    for(const marker of markers){try{marker.setMap(null)}catch{}}
    markers=[];list.replaceChildren();links=[];
  };
  const replacePins=pins=>{
    clear();if(disposed)return;
    try{
      for(const p of pins){
        const marker=new M.Marker({map,position:new M.LatLng(p.lat,p.lng),title:String(p.name||'공중화장실'),
          icon:{content:'<div style="background:#fff;border:2px solid #285C50;border-radius:8px;padding:4px;font-size:16px">🚻</div>',anchor:new M.Point(15,15)},zIndex:350});
        markers.push(marker);
        const item=document.createElement('p');
        const label=document.createElement('strong');label.textContent=String(p.name||'공중화장실');item.append(label);
        const info=document.createElement('span');
        info.textContent=' · '+String(p.address||'주소 미확인')+' · 시설 위치·입구 미확인 · 접근 경로 미확인'+(p.coordinateEvidence?.sourceDatasetUpdatedAt?' · 자료 기준 '+String(p.coordinateEvidence.sourceDatasetUpdatedAt):'')+(p.accessibleFacilityReport?.note?' · '+String(p.accessibleFacilityReport.note):'');
        item.append(info);list.append(item);
      }
    }catch(e){clear();throw e;}
  };
  const setStatus=(state,detail)=>{
    for(const link of links)link.remove();links=[];
    const prefix=detail?.region?String(detail.region)+' 일부 확인 자료':'서울·경기 일부 확인 자료';
    const suffix=' · 시설 위치(화장실 입구 아님) · 직선거리 · 접근 경로 미확인';
    status.textContent=({disabled:'화장실 표시 꺼짐',idle:'화장실 위치 확인 준비',loading:'화장실 위치를 확인 중이에요',unavailable:'화장실 위치 자료를 불러올 수 없어요',partial:prefix+suffix,empty_in_partial_coverage:prefix+'에서 검색 결과 없음'+suffix})[state]||'화장실 위치 자료를 확인할 수 없어요';
    if((state==='partial'||state==='empty_in_partial_coverage')&&detail?.sourceUrl){
      try{const url=new URL(detail.sourceUrl);if(url.protocol==='https:'&&!url.username&&!url.password){const a=document.createElement('a');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent='출처: '+String(detail.attribution||'공공데이터');status.append(' · ',a);links.push(a);}}catch{}
    }
  };
  const overlay=createToiletOverlay({replacePins,setStatus});
  const refresh=()=>{
    if(!enabled||disposed)return;
    try{const center=map.getCenter();void overlay.refresh(center.lat(),center.lng());}
    catch{void overlay.refresh(NaN,NaN);}
  };
  const schedule=()=>{if(!enabled||disposed)return;clearTimeout(timer);timer=setTimeout(refresh,250);};
  toggle.onclick=()=>{
    enabled=!enabled;clearTimeout(timer);overlay.toggle(enabled);
    toggle.setAttribute('aria-pressed',String(enabled));toggle.textContent=enabled?'공중화장실 숨기기':'공중화장실 보기';
    if(enabled)refresh();
  };
  try{listener=M.Event?.addListener?.(map,'idle',schedule)}catch{}
  hbToiletOverlayView={dispose(){
    disposed=true;enabled=false;clearTimeout(timer);
    try{if(listener!=null)M.Event?.removeListener?.(listener)}catch{}
    overlay.dispose();panel.remove();
  }};
}

function hbSearchMapCenter(){
  if(!nearbyMap)return;
  let lat,lng;
  try{const point=nearbyMap.getCenter();lat=point?.lat?.();lng=point?.lng?.()}catch{
    nearbyError='지도 중심 위치를 읽지 못했어요. 서울 중심 보기나 지도 다시 불러오기를 이용해 주세요.';
    setNearbyStatus();
    return;
  }
  if(!hbValidMapPoint(lat,lng)){
    nearbyError='지도 중심 위치를 읽지 못했어요. 서울 중심 보기나 지도 다시 불러오기를 이용해 주세요.';
    setNearbyStatus();
    return;
  }
  nearbyMode='현재 지도 중심 기준';
  fetchNearby(lat,lng,false,'지도 중심');
}

function dropNearbyMap(){
  if(typeof hbToiletOverlayView!=='undefined'&&hbToiletOverlayView){try{hbToiletOverlayView.dispose()}catch{}hbToiletOverlayView=null;}
  ++nearbyMapEpoch;
  const map=nearbyMap;
  const markers=nearbyLayer||[];
  nearbyMap=null;
  nearbyLayer=null;
  nearbyPinWarning='';
  nearbyMapMarkers.clear();
  for(const listener of nearbyMapListeners.splice(0)){
    try{window.naver?.maps?.Event?.removeListener?.(listener)}catch{}
  }
  // SDK objects may be partially initialized when the user leaves the map.
  for(const marker of markers){
    try{marker.setMap(null)}catch{}
  }
  try{map?.destroy()}catch{}
}
function renderNearbyMapFailure(host,reason='sdk'){
  if(!host||document.getElementById('nearby-map')!==host)return;
  host.dataset.mapState='error';
  const searchButton=document.getElementById('hb-search-map-center');
  if(searchButton)searchButton.disabled=true;
  const detail=reason==='auth'?'네이버지도 인증을 확인하지 못했어요. 접속 주소 또는 지도 서비스 설정을 확인해 주세요. ':'지도 연결을 확인해 주세요. ';
  host.innerHTML='<div style="padding:22px;max-width:520px"><p role="status"><strong>지도를 표시할 수 없어요.</strong> '+detail+'아래의 장소 목록과 일정 담기는 계속 이용할 수 있어요.</p><button id="hb-map-retry" type="button" class="light">지도 다시 불러오기</button></div>';
  host.querySelector('button').onclick=()=>{
    host.setAttribute('tabindex','-1');
    host.focus({preventScroll:true});
    mountNearbyMap();
  };
}
function hbNearbyMobileNavigation(){
  const host=document.getElementById('nearby-map'),list=document.getElementById('nearby-list');
  if(!host||!list||!window.matchMedia?.('(max-width: 767px)').matches)return;
  const jump=target=>{
    target.setAttribute('tabindex','-1');
    target.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
    target.focus({preventScroll:true});
  };
  if(!document.getElementById('hb-nearby-to-list')){
    host.insertAdjacentHTML('afterend','<button type="button" class="light" id="hb-nearby-to-list" style="margin-top:10px;min-height:44px">목록 보기 ↓</button>');
    document.getElementById('hb-nearby-to-list').onclick=()=>jump(list);
  }
  if(!document.getElementById('hb-nearby-to-map')){
    list.insertAdjacentHTML('beforebegin','<button type="button" class="light" id="hb-nearby-to-map" style="margin-bottom:12px;min-height:44px">지도 보기 ↑</button>');
    document.getElementById('hb-nearby-to-map').onclick=()=>jump(host);
  }
}
function mountNearbyMap(){
  dropNearbyMap();
  const epoch=nearbyMapEpoch;
  const host=document.getElementById('nearby-map');
  if(!host)return;
  hbNearbyMobileNavigation();
  const searchButton=document.getElementById('hb-search-map-center');
  if(searchButton)searchButton.disabled=true;
  host.dataset.mapState='loading';
  host.innerHTML='<p role="status" style="padding:22px">네이버 지도를 불러오는 중이에요…</p>';
  loadNaverMap().then(M=>{
    if(epoch!==nearbyMapEpoch||document.getElementById('nearby-map')!==host)return;
    if(naverSdkAuthFailed)throw Error('Map authentication failed');
    host.replaceChildren();
    nearbyMap=new M.Map(host,{center:new M.LatLng(...nearbyCenter),zoom:nearbyUser?15:14,minZoom:10,maxZoom:20,zoomControl:true,zoomControlOptions:{position:M.Position.TOP_RIGHT},scaleControl:true,scrollWheel:false,logoControl:true,mapDataControl:true});
    nearbyLayer=[];
    if(naverSdkAuthFailed)throw Error('Map authentication failed');
    updateNearbyPins();
    if(epoch!==nearbyMapEpoch||!nearbyMap)return;
    if(naverSdkAuthFailed)throw Error('Map authentication failed');
    host.dataset.mapState='ready';
    if(searchButton)searchButton.disabled=false;
    try{hbMountToiletOverlay(nearbyMap,M,host)}catch{}
  }).catch(()=>{
    if(epoch!==nearbyMapEpoch||document.getElementById('nearby-map')!==host)return;
    dropNearbyMap();
    renderNearbyMapFailure(host,naverSdkAuthFailed?'auth':'sdk');
  });
}
function hbNearbyVisiblePlaces(){
  const base=nearFilter==='famous'?featuredPlaces:nearbyItems.filter(p=>
    nearFilter==='all'||nearFilter==='food'&&p.kind==='food'||nearFilter==='spot'&&['spot','culture'].includes(p.kind)
  ).slice(0,30);
  const items=['all','spot'].includes(nearFilter)?[...base,...featuredPlaces]:base;
  const unique=new Map();
  for(const p of items){
    if(!p||typeof p.id!=='string'||!p.id||typeof p.name!=='string'||!p.name||unique.has(p.id))continue;
    unique.set(p.id,p);
  }
  return [...unique.values()];
}
function hbNationwideDiscovery(p){return ['nationwide_catalog','nationwide_live','keyword_snapshot'].includes(p?.discoverySource);}
function hbNearbyPlanAllowed(p){return !hbNationwideDiscovery(p)||String(p.areaCode??'')===({서울:'1',경기:'31'}[s.region]||'-');}
function hbRememberNearbyPlace(p){
  if(!p||typeof p.id!=='string'||!p.id)return;
  if(hbNationwideDiscovery(p)){hbRichSelected=p;if(!hbNearbyPlanAllowed(p))return;}
  if(!places.some(value=>value.id===p.id)){
    places.push({...p,hbPickedRegion:s.region,accessFacts:[],accessStatus:'unknown'});
  }
}
function hbSelectNearbyPlace(id,focusMap=false){
  const p=hbNearbyVisiblePlaces().find(value=>value.id===id);
  if(!p)return null;
  nearbySelectedId=id;
  drawNearbyList();
  const marker=nearbyMapMarkers.get(id);
  if(marker&&nearbyMap){
    try{
      marker.setZIndex?.(900);
      if(focusMap){
        const M=window.naver.maps;
        nearbyMap.panTo?.(new M.LatLng(p.lat,p.lng));
        nearbyMap.setZoom?.(16);
      }
    }catch{}
  }
  return p;
}
function hbNearbyDetailLink(p){
  return '#/place/'+encodeURIComponent(p.id);
}
// A pin or popup is an optional overlay. Never tear down a working base map
// because a single record, overlay constructor, or event binding failed.
function hbSetNearbyPinWarning(failed){
  nearbyPinWarning=failed?'일부 지도 표시를 갱신하지 못했어요. 장소 목록을 이용해 주세요.':'';
  setNearbyStatus();
}
function updateNearbyPins(recenter=true){
  if(!nearbyMap||!window.naver?.maps)return;
  try{hbSetNearbyPinWarning(setNearbyPins(recenter))}catch{hbSetNearbyPinWarning(true)}
}
function setNearbyPins(recenter=true){
  if(!nearbyMap||!window.naver?.maps)return false;
  const M=window.naver.maps,map=nearbyMap;
  let failed=false;
  for(const listener of nearbyMapListeners.splice(0)){
    try{M.Event?.removeListener?.(listener)}catch{failed=true}
  }
  if(nearbyLayer)for(const marker of nearbyLayer){
    try{marker.setMap(null)}catch{failed=true}
  }
  nearbyLayer=[];
  nearbyMapMarkers.clear();
  if(recenter){
    try{
      map.setCenter(new M.LatLng(nearbyCenter[0],nearbyCenter[1]));
      map.setZoom(nearbyUser?15:14);
    }catch{failed=true}
  }
  try{
    const self=new M.Marker({map,position:new M.LatLng(nearbyCenter[0],nearbyCenter[1]),
      icon:{content:'<div class="hb-current">📍 '+safe(nearbyCenterLabel)+(nearbyUser?'':' 기준')+'</div>',anchor:new M.Point(49,37)},zIndex:999});
    nearbyLayer.push(self);
  }catch{failed=true}
  const items=hbNearbyVisiblePlaces();
  let labels=0;
  for(const p of items){
    if(!hbValidMapPoint(p.lat,p.lng))continue;
    try{
      const featured=!!p.featured,distance=Number(p.distanceKm);
      const near=!featured&&Number.isFinite(distance)&&distance>=0&&distance<=1.3&&labels<13;
      if(near)labels++;
      const selected=nearbySelectedId===p.id;
      const color=selected?' style="outline:3px solid #285C50;outline-offset:2px"':'';
      const icon=featured?'<div class="hb-featured-marker"'+color+'>📍 '+safe(p.name)+'</div>':
        near?'<div class="hb-naver-place '+(p.kind==='food'?'hb-food':'hb-spot')+'"'+color+'>'+(p.kind==='food'?'🍚 ':'🌿 ')+safe(p.name)+'</div>':
        '<div class="hb-naver-dot '+(p.kind==='food'?'hb-food':'hb-spot')+'"'+color+'></div>';
      const marker=new M.Marker({map,position:new M.LatLng(p.lat,p.lng),title:p.name,
        icon:{content:icon,anchor:new M.Point(featured?78:near?65:6,featured?36:near?33:6)},
        zIndex:selected?900:featured?500:near?200-Math.round(distance*30):20});
      marker.hbPlaceId=p.id;
      nearbyLayer.push(marker);
      nearbyMapMarkers.set(p.id,marker);
      nearbyMapListeners.push(M.Event.addListener(marker,'click',()=>{
        if(nearbyMap!==map||!hbNearbyVisiblePlaces().some(item=>item.id===p.id))return;
        hbRememberNearbyPlace(p);
        hbSelectNearbyPlace(p.id,true);
        // Selection may rebuild pins; open on the currently registered marker.
        try{
          const active=nearbyMapMarkers.get(p.id);
          if(nearbyMap!==map||!active)return;
          const info=new M.InfoWindow({content:'<div style="padding:12px;max-width:260px;color:#284238"><b>'+safe(p.name)+'</b><p style="margin:4px 0;font-size:12px">'+safe(p.address||'주소 없음')+'</p><small>직선거리 '+safe(p.distanceKm)+'km · 실제 보행 동선 미확인</small><p><a href="'+safe(hbNearbyDetailLink(p))+'">장소 상세 보기</a></p></div>',borderWidth:0,backgroundColor:'#fff'});
          info.open(map,active);
        }catch{hbSetNearbyPinWarning(true)}
      }));
    }catch{failed=true}
  }
  return failed;
}
function showFamousOnMap(){if(!nearbyMap||!window.naver?.maps||!featuredPlaces.length)return;let M=window.naver.maps;let bounds=new M.LatLngBounds();bounds.extend(new M.LatLng(nearbyCenter[0],nearbyCenter[1]));for(let p of featuredPlaces)bounds.extend(new M.LatLng(p.lat,p.lng));nearbyMap.fitBounds(bounds,{top:70,right:45,bottom:60,left:45})}

function hbSelectNearbyCategory(filter){
  if(!['all','spot','food'].includes(filter)||filter===nearFilter)return;
  nearFilter=filter;featuredMode=false;nearbySelectedId=null;
  nearbyItems=[];nearbyResultMeta=null;nearbyResultCategory=null;
  fetchNearby(nearbyCenter[0],nearbyCenter[1],nearbyUser,nearbyCenterLabel,false);
}
async function fetchNearby(lat,lng,isUser,centerLabel,refreshFeatured=true){
  const n=++nearbyRequestId,category=nearFilter==='food'?'food':nearFilter==='all'?'all':'spot';
  nearbyCenterLabel=centerLabel||(isUser?'내 위치':'서울 시청');nearbyCenter=[lat,lng];nearbyUser=isUser;
  nearbyLoading=true;nearbyError='';
  if(nearbyResultCategory!==category){nearbyItems=[];nearbyResultMeta=null;}
  if(refreshFeatured){featuredPlaces=[];featuredLoading=true;featuredError='';loadFeatured(lat,lng,++featuredRequestId);}
  setNearbyStatus();drawNearbyList();updateNearbyPins();
  try{
    const d=await get('/api/nearby.js?lat='+encodeURIComponent(lat.toFixed(4))+'&lng='+encodeURIComponent(lng.toFixed(4))+'&category='+category);
    if(n!==nearbyRequestId)return;
    if(!Array.isArray(d.places))throw Error('invalid nearby response');
    // Defensive filter even if an older backend or unexpected provider response leaks food.
    const items=d.places.filter(p=>p&& (category==='all'||category==='food'&&p.kind==='food'||category==='spot'&&['spot','culture'].includes(p.kind)));
    if(!items.length&&d.meta?.failures?.length)throw Error('partial empty response');
    nearbyItems=items;nearbyResultCategory=category;nearbyResultMeta=d.meta||null;nearbyResultCenterLabel=nearbyCenterLabel;
    if(!items.length)nearbyError=d.meta?.partial?'일부 자료에서 장소를 찾지 못했어요. 전체 장소가 없다는 뜻은 아니에요.':'이 반경에서 조회된 장소가 없어요';
  }catch(e){
    if(n!==nearbyRequestId)return;
    nearbyError='주변 장소를 불러오지 못했어요. 위치를 다시 선택해 주세요.';
  }finally{
    if(n===nearbyRequestId){nearbyLoading=false;setNearbyStatus();updateNearbyPins();drawNearbyList();}
  }
}
async function loadFeatured(lat,lng,id){try{let r=await get('/api/featured.js?lat='+encodeURIComponent(lat.toFixed(4))+'&lng='+encodeURIComponent(lng.toFixed(4)));if(id!==featuredRequestId)return;featuredPlaces=r.places||[];featuredError=featuredPlaces.length?'':'근처에서 검증된 유명 명소를 찾지 못했어요'}catch(e){if(id!==featuredRequestId)return;featuredError='대표 관광지 자료를 불러오지 못했어요.'}finally{if(id===featuredRequestId){featuredLoading=false;setNearbyStatus();updateNearbyPins();drawNearbyList()}}}
function drawNearbyList(){['all','spot','food'].forEach(f=>document.getElementById('near-'+f)?.setAttribute('aria-pressed',String(nearFilter===f)));updateNearbyPins(false);let box=document.getElementById('nearby-list');if(!box)return;let sum=document.getElementById('featured-summary');if(sum)sum.textContent=featuredLoading?'📍 주변 대표 관광지를 불러오는 중이에요…':featuredPlaces.length?'📍 대표 관광지 '+featuredPlaces.length+'곳 · 관광지 편집 선정 (공식 인기순위 아님)':featuredError;let quick=document.getElementById('featured-quicklinks');if(quick){quick.innerHTML=featuredPlaces.map((p,i)=>'<button type="button" class="light hb-famous-chip" data-featured-jump="'+i+'">'+safe(p.name)+'</button>').join('');quick.querySelectorAll('[data-featured-jump]').forEach(b=>b.onclick=()=>{let p=featuredPlaces[Number(b.dataset.featuredJump)];if(!p)return;if(nearbyMap&&window.naver?.maps){nearbyMap.setCenter(new window.naver.maps.LatLng(p.lat,p.lng));nearbyMap.setZoom(15)}document.getElementById('nearby-map')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})})};const filtered=nearFilter==='famous'?featuredPlaces:nearbyItems.filter(p=>nearFilter==='all'||nearFilter==='food'&&p.kind==='food'||nearFilter==='spot'&&['spot','culture'].includes(p.kind));if(nearFilter==='famous'&&featuredLoading){box.innerHTML='<p class="muted">유명 관광지를 검색하고 있어요…</p>';return}if(nearFilter!=='famous'&&nearbyLoading&&!filtered.length){box.innerHTML='<p class="muted">주변 관광지와 식당을 찾고 있어요…</p>';return}if(!filtered.length){box.innerHTML='<p class="muted">'+(nearFilter==='famous'?safe(featuredError||'근처 검증된 유명 관광지를 찾지 못했어요.'):safe(nearbyError||'이 조건에서 검색된 장소가 없어요.'))+'</p>';return}box.innerHTML='<div class="grid">'+filtered.slice(0,50).map(p=>'<div class="card"'+(nearbySelectedId===p.id?' style="outline:2px solid #285C50"':'')+'><span class="chip">'+(p.featured?'⭐ 주요 관광명소':p.kind==='food'?'🍚 음식점':safe(p.subtype||(p.kind==='culture'?'문화시설':'관광지')))+'</span><h3>'+safe(p.name)+'</h3><p class="muted">'+safe(p.address||'주소 미제공')+'</p>'+(p.discoverySource==='keyword_snapshot'?'<p class="muted">공식 키워드 조회 보강 · '+safe(p.collectedAt||'조회일 미확인')+' · 현재 정보 확인 필요</p>':'')+'<p class="muted">'+safe(p.featured?nearbyCenterLabel:nearbyResultCenterLabel)+'에서 직선거리 '+safe(p.distanceKm)+'km · 보행 거리 및 접근성 미확인</p><div class="actions">'+(p.featured?'<button class="light" data-zoom-featured="'+safe(p.id)+'">지도에서 보기</button>':'')+'<a href="'+safe(hbNearbyDetailLink(p))+'">장소 상세 보기</a><a target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(p.lat+','+p.lng)+'">장소 보기 ↗</a><button class="light" data-near-map="'+safe(p.id)+'" aria-pressed="'+String(nearbySelectedId===p.id)+'">지도에서 선택</button>'+(hbNearbyPlanAllowed(p)?'<button type="button" class="light" data-near-pick="'+safe(p.id)+'">'+(s.chosen.includes(p.id)?'선택됨':'일정에 담기')+'</button>':'<span class="muted">현재 일정 지원 지역 외</span>')+'</div></div>').join('')+'</div>';box.querySelectorAll('[data-near-map]').forEach(b=>b.onclick=()=>hbSelectNearbyPlace(b.dataset.nearMap,true));box.querySelectorAll('[data-near-pick]').forEach(b=>b.onclick=()=>{let p=[...featuredPlaces,...nearbyItems].find(v=>v.id===b.dataset.nearPick);if(!p||!hbNearbyPlanAllowed(p))return;if(!s.chosen.includes(p.id))s.chosen.push(p.id);if(!places.some(v=>v.id===p.id))places.push({...p,hbPickedRegion:s.region,accessFacts:[],accessStatus:'unknown'});save();drawNearbyList()});box.querySelectorAll('[data-zoom-featured]').forEach(b=>b.onclick=()=>{let p=featuredPlaces.find(v=>v.id===b.dataset.zoomFeatured);if(p&&nearbyMap&&window.naver?.maps){nearbyMap.setCenter(new window.naver.maps.LatLng(p.lat,p.lng));nearbyMap.setZoom(16);document.getElementById('nearby-map')?.scrollIntoView({behavior:'smooth',block:'center'})}})}


function hbBindNewTripNav(){
// Header travel creation is an explicit new-trip action, not a raw resume link.
const hbNewTripNav=document.querySelector('header nav a[href="#/new"]');
if(hbNewTripNav)hbNewTripNav.addEventListener('click',event=>{
 event.preventDefault();
 const initialized=hbEnsureOwnerState('/new');
 if(hbBeginNewTravel()===true&&initialized&&hbPlacesLoadedRegion!==s.region)load();
});
}
function hbBindHomeNav(){
// Header logo and 홈 always show the main screen from the top. A same-hash
// link fires no hashchange, so on #/ the main screen is redrawn here; other
// routes still change the hash and render through the hashchange listener.
document.querySelectorAll('header a.hb-brand-home,header nav a[href="#/"]').forEach(link=>link.addEventListener('click',event=>{
 if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
 event.preventDefault();
 if(location.hash==='#/')render();else location.hash='#/';
 window.scrollTo(0,0);
}));
}
addEventListener('hashchange',render);hbBindNewTripNav();hbBindHomeNav();render()
})();
