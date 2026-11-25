(function () {
  'use strict';

  var root = document.getElementById('app');
  if (!root) return;
  var observer;
  var pendingCatalog;
  var placeIdPattern = /^tour-\d{1,12}$/;
  var acceptedLicenses = ['CC0-1.0', 'CC-BY-2.0', 'CC-BY-SA-2.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'KOGL-TYPE-1', 'PD-self'];

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
    pendingCatalog = fetch('/photo-catalog.json', { credentials: 'same-origin', cache: 'no-cache' })
      .then(function (response) {
        if (!response.ok) throw new Error('Photo catalog ' + response.status);
        return response.json();
      })
      .then(function (data) {
        return data && data.schemaVersion === 1 && data.photos &&
          typeof data.photos === 'object' && !Array.isArray(data.photos) ? data.photos : Object.create(null);
      })
      .catch(function () { return Object.create(null); });
    return pendingCatalog;
  }

  function empty(photo, message) {
    var label = document.createElement('span');
    label.className = 'hb-photo-empty';
    label.textContent = message || '장소 사진을 확인하지 못했어요';
    photo.replaceChildren(label);
    photo.dataset.photoState = 'unavailable';
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
      if (photo.isConnected) empty(photo, '사진을 불러오지 못했어요');
    };
    image.onload = function () {
      if (image.naturalWidth !== entry.width || image.naturalHeight !== entry.height) empty(photo, '사진을 불러오지 못했어요');
      else photo.dataset.photoState = 'loaded';
    };
    photo.dataset.photoState = 'loading';
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
      empty(photo, '장소 사진 미확인');
      return;
    }
    catalog().then(function (images) {
      if (!photo.isConnected) return;
      var entry = published(Object.prototype.hasOwnProperty.call(images, id) ? images[id] : null, id);
      if (!entry) return empty(photo, '장소 사진 미확인');
      insertPublished(photo, entry, name);
    });
  }

  function makePhoto(id, name, detail) {
    var photo = document.createElement('div');
    photo.className = 'hb-place-photo' + (detail ? ' hb-detail-photo' : '');
    photo.dataset.placeId = id || '';
    photo.dataset.placeName = name || '장소';
    empty(photo, '장소 사진 확인 중');
    photo.dataset.photoState = 'pending';
    // Detail spacing lives in .hb-detail-photo (13-editorial.css).
    return photo;
  }

  function queue(photo) {
    if (observer) observer.observe(photo);
    else display(photo);
  }

  function cardId(card) {
    var control = card.querySelector('[data-hb-info], [data-hb-pick], [data-near-pick], [data-pick]');
    var raw = control && (control.getAttribute('data-hb-info') || control.getAttribute('data-hb-pick') ||
      control.getAttribute('data-near-pick') || control.getAttribute('data-pick'));
    return placeIdPattern.test(raw || '') ? raw : '';
  }

  function attachCards() {
    root.querySelectorAll('.grid > .card:not(.hb-has-photo)').forEach(function (card) {
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
    if (!title || !back || title.textContent.indexOf('장소 상세 정보') !== -1 ||
        title.textContent.indexOf('찾지 못했어요') !== -1) return;
    var address = title.nextElementSibling;
    if (!address || address.tagName !== 'P') return;
    var photo = makePhoto(route[1], title.textContent.trim(), true);
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
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          observer.unobserve(entry.target);
          display(entry.target);
        }
      });
    }, { rootMargin: '240px' });
  }
  new MutationObserver(attach).observe(root, { childList: true, subtree: true });
  attach();
})();