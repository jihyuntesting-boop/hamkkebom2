(function(){
'use strict';
var cached=new Map(), inflight=new Map(), io;
function itemFor(id) {
 if(cached.has(id))return Promise.resolve(cached.get(id));
 if(inflight.has(id))return inflight.get(id);
 var job=fetch('/api/photo?contentId='+encodeURIComponent(id),{credentials:'same-origin'})
 .then(function(r){if(!r.ok)throw Error('Photo API '+r.status);return r.json()})
 .then(function(x){var result=x.imageUrl&&/^https:\/\//.test(x.imageUrl)?x:null;cached.set(id,result);return result})
 .catch(function(){cached.set(id,null);return null})
 .finally(function(){inflight.delete(id)});
 inflight.set(id,job);return job;
}
function put(photo){
 if(photo.dataset.loaded)return;
 photo.dataset.loaded='1';
 var id=photo.dataset.contentId,name=photo.dataset.name;
 var pinned=window.hbCatalogImages&&window.hbCatalogImages[id];
 if(!id){photo.innerHTML='<span class="hb-photo-empty">🖼️<br>제공된 사진 없음</span>';return}
 (pinned?Promise.resolve(pinned):itemFor(id)).then(function(result){
 if(!photo.isConnected)return;
 if(!result){photo.remove();return}
 var img=document.createElement('img');img.loading='lazy';img.decoding='async';img.alt=name+' 장소 사진';
 img.onerror=function(){photo.innerHTML='<span class="hb-photo-empty">🖼️<br>사진을 불러올 수 없어요</span>'};
 img.src=result.imageUrl;
 if(result.license==='공공누리 제3유형')img.style.objectFit='contain';
 var credit=document.createElement('a');credit.href='https://www.data.go.kr/data/15101578/openapi.do';credit.target='_blank';credit.rel='noopener noreferrer';credit.className='hb-photo-credit';credit.textContent='사진: 한국관광공사 · '+(result.license||'출처 확인');credit.setAttribute('aria-label','관광공사 관광정보 사진 출처');
 photo.replaceChildren(img,credit);
 });
}
function attach(){
 document.querySelectorAll('#app .grid > .card:not(.hb-has-photo)').forEach(function(card){
 var title=card.querySelector('h3');if(!title)return;
 var name=title.textContent.trim();
 var b=card.querySelector('[data-near-pick],[data-pick]');
 var raw=b&&(b.getAttribute('data-near-pick')||b.getAttribute('data-pick'))||'';
 var match=/^tour-(\d{1,12})$/.exec(raw);
 card.classList.add('hb-has-photo');
 var photo=document.createElement('div');photo.className='hb-place-photo';
 photo.dataset.contentId=match?match[1]:'';photo.dataset.name=name;
 photo.innerHTML='<span class="hb-photo-empty">🌿<br>장소 이미지 준비 중</span>';
 card.insertBefore(photo,card.firstChild);
 if(io)io.observe(photo);else put(photo);
 });
}
if('IntersectionObserver' in window){io=new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting){io.unobserve(e.target);put(e.target)}})},{rootMargin:'240px'});}
var root=document.getElementById('app');
new MutationObserver(attach).observe(root,{childList:true,subtree:true});
attach();
})();