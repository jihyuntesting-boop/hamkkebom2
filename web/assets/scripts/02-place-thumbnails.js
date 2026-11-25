(function () {
  'use strict';

  var root = document.getElementById('app');
  if (!root) return;
  var pendingCatalog;
  // A stalled catalog request must never leave cards in the pending state.
  var CATALOG_TIMEOUT_MS = 10000;
  var placeIdPattern = /^tour-\d{1,12}$/;
  var acceptedLicenses = ['CC0-1.0', 'CC-BY-2.0', 'CC-BY-SA-2.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'KOGL-TYPE-1', 'PD-self'];
  // MVP exception (docs/DECISIONS.md 2026-11-26): KTO's own image for the same TourAPI ID.
  var officialHosts = ['tong.visitkorea.or.kr', 'cdn.visitkorea.or.kr'];
  var officialRequests = Object.create(null);
  var officialQueue = [];
  var officialActive = 0;
  var OFFICIAL_CONCURRENCY = 4;

  function safeHttps(value) {
    if (typeof value !== 'string') return false;
    try {
      var url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch (_) { return false; }
  }

  function published(record, id) {
    if (!record || record.placeId !== id || record.rightsStatus !== 'approved' ||
        acceptedLicenses.indexOf(record.license) === -1 ||
        typeof record.source !== 'string' || !record.source.trim() ||
        typeof record.credit !== 'string' || !record.credit.trim() ||
        typeof record.placeMatchEvidence !== 'string' || !record.placeMatchEvidence.trim() ||
        typeof record.verifiedBy !== 'string' || !record.verifiedBy.trim() ||
        typeof record.changeNotice !== 'string' || !record.changeNotice.trim() ||
        !/^\d{4}-\d{2}-\d{2}$/.test(record.verifiedAt || '') ||
        !Number.isFinite(Date.parse(record.verifiedAt + 'T00:00:00Z')) ||
        new Date(record.verifiedAt + 'T00:00:00Z').toISOString().slice(0, 10) !== record.verifiedAt ||
        Date.parse(record.verifiedAt + 'T00:00:00Z') > Date.now() ||
        !Number.isInteger(record.width) || !Number.isInteger(record.height) ||
        record.width < 320 || record.height < 320 || record.width > 8192 || record.height > 8192 ||
        !safeHttps(record.originalUrl) || !safeHttps(record.licenseUrl) ||
        typeof record.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(record.sha256) ||
        record.imagePath !== '/images/places/' + id + '.webp') return null;
    return record;
  }

  function catalog() {
    if (pendingCatalog) return pendingCatalog;
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = null;
    var request = fetch('/photo-catalog.json', controller ?
      { credentials: 'same-origin', cache: 'no-cache', signal: controller.signal } :
      { credentials: 'same-origin', cache: 'no-cache' })
      .then(function (response) {
        if (!response.ok) throw new Error('Photo catalog ' + response.status);
        return response.json();
      })
      .then(function (data) {
        if (!(data && data.schemaVersion === 1 && data.photos &&
          typeof data.photos === 'object' && !Array.isArray(data.photos))) throw new Error('Photo catalog schema');
        return data.photos;
      });
    var limit = typeof setTimeout === 'function' ? new Promise(function (_, reject) {
      timer = setTimeout(function () {
        if (controller) controller.abort();
        reject(new Error('Photo catalog timeout'));
      }, CATALOG_TIMEOUT_MS);
    }) : null;
    var current = (limit ? Promise.race([request, limit]) : request)
      .then(function (photos) {
        if (timer !== null) clearTimeout(timer);
        return photos;
      }, function () {
        if (timer !== null) clearTimeout(timer);
        // Fail closed for the cards already waiting, but let a later render retry.
        if (pendingCatalog === current) pendingCatalog = null;
        return Object.create(null);
      });
    pendingCatalog = current;
    return current;
  }

  function officialEntry(data, id) {
    if (!data || data.placeId !== id || data.status !== 'official_tourapi' || typeof data.imageUrl !== 'string') return null;
    var url;
    try { url = new URL(data.imageUrl); } catch (_) { return null; }
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        officialHosts.indexOf(url.hostname.toLowerCase()) === -1) return null;
    // Only a KOGL type is shown next to the source; no status wording when it is absent.
    var label = typeof data.licenseLabel === 'string' && /^공공누리 제[1-4]유형$/.test(data.licenseLabel) ? data.licenseLabel : '';
    var terms = typeof data.licenseUrl === 'string' && /^https:\/\/www\.kogl\.or\.kr\/info\/licenseType[1-4]\.do$/.test(data.licenseUrl)
      ? data.licenseUrl : 'https://www.data.go.kr/data/15101578/openapi.do';
    return { imageUrl: url.href, licenseLabel: label, termsUrl: terms };
  }

  function pumpOfficial() {
    while (officialActive < OFFICIAL_CONCURRENCY && officialQueue.length) {
      var job = officialQueue.shift();
      officialActive++;
      job();
    }
  }

  // One request per place ID, at most four in flight, bounded wait, never throws.
  function officialPhoto(id) {
    if (officialRequests[id]) return officialRequests[id];
    officialRequests[id] = new Promise(function (resolve) {
      officialQueue.push(function () {
        var done = false;
        var timer = null;
        function finish(value) {
          if (done) return;
          done = true;
          if (timer !== null) clearTimeout(timer);
          officialActive--;
          if (value === null) delete officialRequests[id];
          resolve(value);
          pumpOfficial();
        }
        var controller = typeof AbortController === 'function' ? new AbortController() : null;
        if (typeof setTimeout === 'function') {
          timer = setTimeout(function () { if (controller) controller.abort(); finish(null); }, CATALOG_TIMEOUT_MS);
        }
        try {
          fetch('/api/photo?placeId=' + encodeURIComponent(id), controller ?
            { credentials: 'same-origin', signal: controller.signal } : { credentials: 'same-origin' })
            .then(function (response) { if (!response.ok) throw new Error('photo api ' + response.status); return response.json(); })
            .then(function (data) { finish(officialEntry(data, id) || false); }, function () { finish(null); });
        } catch (_) { finish(null); }
      });
      pumpOfficial();
    }).then(function (value) { return value || null; });
    return officialRequests[id];
  }

  function insertOfficial(photo, entry, name) {
    var image = document.createElement('img');
    image.alt = name + ' 한국관광공사 제공 사진';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    var credit = document.createElement('a');
    credit.href = entry.termsUrl;
    credit.target = '_blank';
    credit.rel = 'noopener noreferrer';
    credit.className = 'hb-photo-credit';
    credit.textContent = '사진: 한국관광공사(TourAPI)' + (entry.licenseLabel ? ' · ' + entry.licenseLabel : '');
    credit.setAttribute('aria-label', credit.textContent + ' · 이용조건 보기');
    image.onerror = function () {
      if (photo.isConnected) omit(photo);
    };
    image.onload = function () {
      if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) omit(photo);
      else photo.dataset.photoState = 'loaded';
    };
    photo.dataset.photoState = 'loading';
    photo.dataset.photoSource = 'tourapi';
    photo.removeAttribute('aria-hidden');
    photo.setAttribute('aria-label', name + ' 한국관광공사 제공 사진');
    photo.replaceChildren(image, credit);
    image.src = entry.imageUrl;
  }

  // Final "no photo" state: the photo area is omitted entirely, with no status wording
  // (MVP decision 2026-11-26). In list cards the node is removed so the title regains
  // :first-child spacing; the card is re-marked so the MutationObserver skips it. The
  // detail node stays hidden (it sits after the address, so it adds no space).
  function omit(photo) {
    photo.replaceChildren();
    photo.dataset.photoState = 'unavailable';
    photo.removeAttribute('aria-label');
    photo.setAttribute('aria-hidden', 'true');
    photo.hidden = true;
    if (photo.style && typeof photo.style.setProperty === 'function') photo.style.setProperty('display', 'none', 'important');
    var owner = photo.parentNode;
    if (owner && owner.classList && owner.classList.contains('hb-has-photo')) {
      owner.classList.remove('hb-has-photo');
      owner.classList.add('hb-photo-omitted');
      owner.removeChild(photo);
    } else if (owner && owner.classList && owner.classList.contains('hb-gallery-card')) {
      owner.removeChild(photo);
    }
  }

  function pending(photo) {
    var label = document.createElement('span');
    label.className = 'hb-photo-empty';
    label.textContent = '장소 사진 확인 중';
    photo.replaceChildren(label);
    photo.dataset.photoState = 'pending';
    photo.setAttribute('aria-label', label.textContent);
  }

  function insertPublished(photo, entry, name) {
    var image = document.createElement('img');
    image.alt = name + ' 실제 장소 사진';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.width = entry.width || 640;
    image.height = entry.height || 420;
    image.referrerPolicy = 'no-referrer';
    var credit = document.createElement('a');
    credit.href = entry.originalUrl;
    credit.target = '_blank';
    credit.rel = 'noopener noreferrer';
    credit.className = 'hb-photo-credit';
    credit.textContent = '사진: ' + entry.credit + ' · ' + entry.license + ' · ' + entry.changeNotice;
    credit.title = entry.changeNotice + ' · 라이선스 ' + entry.licenseUrl;
    credit.setAttribute('aria-label', credit.textContent + ' · 원본과 이용허락 정보 보기');
    image.onerror = function () {
      if (photo.isConnected) omit(photo);
    };
    image.onload = function () {
      if (image.naturalWidth !== entry.width || image.naturalHeight !== entry.height) omit(photo);
      else photo.dataset.photoState = 'loaded';
    };
    photo.dataset.photoState = 'loading';
    photo.dataset.photoSource = 'approved';
    photo.removeAttribute('aria-hidden');
    photo.setAttribute('aria-label', name + ' 실제 장소 사진');
    photo.replaceChildren(image, credit);
    image.src = entry.imagePath;
  }

  function display(photo) {
    if (photo.dataset.photoRequested) return;
    photo.dataset.photoRequested = 'true';
    var id = photo.dataset.placeId;
    var name = photo.dataset.placeName || '장소';
    if (!placeIdPattern.test(id || '')) {
      omit(photo);
      return;
    }
    catalog().then(function (images) {
      if (!photo.isConnected) return;
      var entry = published(Object.prototype.hasOwnProperty.call(images, id) ? images[id] : null, id);
      if (entry) return insertPublished(photo, entry, name);
      // No rights-approved local photo: ask for the same-ID official TourAPI image.
      officialPhoto(id).then(function (official) {
        if (!photo.isConnected) return;
        if (official) insertOfficial(photo, official, name);
        else omit(photo);
      });
    });
  }

  function makePhoto(id, name, detail) {
    var photo = document.createElement('div');
    photo.className = 'hb-place-photo' + (detail ? ' hb-detail-photo' : '');
    photo.dataset.placeId = id || '';
    photo.dataset.placeName = name || '장소';
    pending(photo);
    // Detail spacing lives in .hb-detail-photo (13-editorial.css).
    return photo;
  }

  // Resolve the rights decision immediately from the single small catalog so that
  // every card reaches a final state (loaded/loading image, or omitted) even when it
  // is below the fold, in a background tab, or read by text/print/screen readers.
  // Only the approved image bytes are deferred, via native loading="lazy".
  function queue(photo) { display(photo); }

  function cardId(card) {
    var control = card.querySelector('[data-hb-info], [data-hb-pick], [data-near-pick], [data-pick]');
    var raw = control && (control.getAttribute('data-hb-info') || control.getAttribute('data-hb-pick') ||
      control.getAttribute('data-near-pick') || control.getAttribute('data-pick'));
    return placeIdPattern.test(raw || '') ? raw : '';
  }

  function attachCards() {
    root.querySelectorAll('.grid > .card:not(.hb-has-photo):not(.hb-photo-omitted)').forEach(function (card) {
      var title = card.querySelector('h3');
      if (!title) return;
      var id = cardId(card);
      card.classList.add('hb-has-photo');
      var photo = makePhoto(id, title.textContent.trim(), false);
      card.insertBefore(photo, card.firstChild);
      queue(photo);
    });
  }

  function attachDetail() {
    var route = /^#\/place\/(tour-\d{1,12})(?:[?&]|$)/.exec(window.location.hash || '');
    if (!route || root.querySelector('.hb-detail-photo')) return;
    var title = root.querySelector('h1');
    var back = root.querySelector('#hb-detail-back');
    // One photo decision per rendered title, even after an omitted photo is hidden.
    if (!title || !back || (title.dataset && title.dataset.hbPhotoFor === route[1]) ||
        title.textContent.indexOf('장소 상세 정보') !== -1 ||
        title.textContent.indexOf('찾지 못했어요') !== -1) return;
    var address = title.nextElementSibling;
    if (!address || address.tagName !== 'P') return;
    var photo = makePhoto(route[1], title.textContent.trim(), true);
    if (title.dataset) title.dataset.hbPhotoFor = route[1];
    address.insertAdjacentElement('afterend', photo);
    queue(photo);
  }

  // A small editorial gallery makes the already-approved real photos discoverable
  // even when nearby API results omit those exact TourAPI IDs. Never claim proximity.
  function attachHomeGallery() {
    var list = root.querySelector('#nearby-list');
    if (!list || !root.querySelector('.hb-landing-hero') || list.dataset.hbGalleryRequested) return;
    list.dataset.hbGalleryRequested = 'true';
    catalog().then(function (images) {
      if (!list.isConnected || !root.querySelector('.hb-landing-hero')) return;
      var entries = Object.keys(images).filter(function (id) { return placeIdPattern.test(id); })
        .map(function (id) { return published(images[id], id); })
        .filter(function (entry) { return entry && typeof entry.placeName === 'string' && entry.placeName.trim(); }).slice(0, 8);
      if (!entries.length) return;
      var panel = list.closest('section');
      if (!panel || root.querySelector('.hb-home-photo-gallery')) return;
      var gallery = document.createElement('section');
      gallery.className = 'hb-home-photo-gallery';
      var heading = document.createElement('h2');
      heading.textContent = '사진으로 만나는 여행지';
      var note = document.createElement('p');
      note.className = 'muted';
      note.textContent = '실제 장소와 사진 이용권을 확인한 여행지예요. 내 주변 검색 결과와는 별개예요.';
      var grid = document.createElement('div');
      grid.className = 'hb-gallery-grid';
      gallery.append(heading, note, grid);
      panel.insertAdjacentElement('beforebegin', gallery);
      entries.forEach(function (entry) {
        var card = document.createElement('article');
        card.className = 'hb-gallery-card';
        var photo = makePhoto(entry.placeId, entry.placeName, false);
        var title = document.createElement('h3');
        title.textContent = entry.placeName;
        card.append(photo, title);
        grid.append(card);
        queue(photo);
      });
    });
  }

  function attach() { attachCards(); attachDetail(); attachHomeGallery(); }
  new MutationObserver(attach).observe(root, { childList: true, subtree: true });
  attach();
})();