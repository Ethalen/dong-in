// 互動：比價表（index.html，首頁）與排行榜（rank.html）的篩選、排序，以及作品詳細視窗。
// 所有作品已在建置時寫進 HTML（利於搜尋引擎收錄），這裡只負責顯示／隱藏與重新排列。
(function () {
  'use strict';
  var data = JSON.parse(document.getElementById('data').textContent);
  var works = data.works;
  var L = data.L;
  var page = document.body.dataset.page;
  var countEl = document.getElementById('count');
  var emptyEl = document.getElementById('empty');
  var qEl = document.getElementById('q');
  var params = new URLSearchParams(location.search);

  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function num(el, k) { return Number(el.dataset[k]) || 0; }
  function isDl(el) { return el.dataset.src.indexOf('dlsite') >= 0 ? 1 : 0; }
  function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ''); }
  function matchQ(el, needle) { return !needle || norm(el.dataset.q).indexOf(needle) >= 0; }
  function setPressed(btns, attr, value) {
    btns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset[attr] === value)); });
  }
  function syncUrl(obj, defaults) {
    var p = new URLSearchParams();
    Object.keys(obj).forEach(function (k) { if (obj[k] !== defaults[k] && obj[k] !== '') p.set(k, obj[k]); });
    var qs = p.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
  }
  function onSearch(cb) {
    var t;
    qEl.addEventListener('input', function () { clearTimeout(t); t = setTimeout(cb, 120); });
  }

  // ---------- 排行榜 ----------
  function initRank() {
    var podium = document.getElementById('podium');
    var list = document.getElementById('list');
    var items = $all('.item');
    var tabs = $all('.tab');
    var modes = $all('.mode');
    var newMs = Number(document.body.dataset.newDays || 90) * 86400000;
    var defaults = { tab: 'all', mode: 'hot', q: '' };
    var state = { tab: params.get('tab') || 'all', mode: params.get('mode') || 'hot', q: params.get('q') || '' };
    qEl.value = state.q;

    function apply() {
      var needle = norm(state.q);
      var now = Date.now();
      var shown = items.filter(function (el) {
        var ok =
          (state.tab === 'all' || (' ' + el.dataset.src + ' ').indexOf(' ' + state.tab + ' ') >= 0) &&
          (state.mode !== 'sale' || el.dataset.sale === '1') &&
          (state.mode !== 'new' || now - num(el, 'rel') <= newMs) &&
          matchQ(el, needle);
        el.hidden = !ok;
        return ok;
      });
      shown.sort(function (a, b) {
        if (state.mode === 'updated') return num(b, 'upd') - num(a, 'upd');
        if (state.mode === 'new') return num(b, 'rel') - num(a, 'rel');
        return num(a, 'rank') - num(b, 'rank') || Number(b.dataset.multi) - Number(a.dataset.multi) || isDl(a) - isDl(b);
      });
      // 前三名放頒獎台，其餘依序放清單；名次重新編號
      shown.forEach(function (el, i) {
        el.querySelector('.no').textContent = i + 1;
        (i < 3 ? podium : list).appendChild(el);
      });
      items.forEach(function (el) { if (el.hidden) list.appendChild(el); });
      podium.hidden = shown.length === 0;
      setPressed(tabs, 'tab', state.tab);
      setPressed(modes, 'mode', state.mode);
      countEl.textContent = L.count.replace('{n}', shown.length);
      emptyEl.hidden = shown.length > 0;
      syncUrl(state, defaults);
    }
    tabs.forEach(function (b) { b.addEventListener('click', function () { state.tab = b.dataset.tab; apply(); }); });
    modes.forEach(function (b) { b.addEventListener('click', function () { state.mode = b.dataset.mode; apply(); }); });
    onSearch(function () { state.q = qEl.value; apply(); });
    document.addEventListener('click', function (e) {
      var hit = e.target.closest('.hit');
      if (hit) openDetail(Number(hit.parentElement.dataset.i));
    });
    apply();
  }

  // ---------- 比價表 ----------
  function initCompare() {
    var rowsEl = document.getElementById('rows');
    var rows = $all('.tr[data-i]');
    var boxes = $all('[data-filter-pf]');
    var sorts = $all('.sortbtn');
    var multiEl = document.getElementById('only-multi');
    var saleEl = document.getElementById('only-sale');
    var defaults = { sort: 'gap', multi: '1', sale: '0', q: '' };
    var state = {
      sort: params.get('sort') || 'gap',
      multi: params.get('multi') || '1',
      sale: params.get('sale') || '0',
      q: params.get('q') || '',
    };
    qEl.value = state.q;
    multiEl.checked = state.multi === '1';
    saleEl.checked = state.sale === '1';

    function apply() {
      var needle = norm(state.q);
      var on = boxes.filter(function (b) { return b.checked; }).map(function (b) { return b.dataset.filterPf; });
      var shown = rows.filter(function (el) {
        var src = el.dataset.src.split(' ');
        var ok =
          on.some(function (pf) { return src.indexOf(pf) >= 0; }) &&
          (state.multi !== '1' || el.dataset.multi === '1') &&
          (state.sale !== '1' || el.dataset.sale === '1') &&
          matchQ(el, needle);
        el.hidden = !ok;
        return ok;
      });
      rows.slice().sort(function (a, b) {
        if (state.sort === 'gap') return num(b, 'gap') - num(a, 'gap') || num(a, 'rank') - num(b, 'rank');
        if (state.sort === 'updated') return num(b, 'upd') - num(a, 'upd');
        return num(a, 'rank') - num(b, 'rank');
      }).forEach(function (el) { rowsEl.appendChild(el); });
      // 沒勾選的平台欄位淡化
      $all('.th [data-pf], .tr .cell').forEach(function (c) {
        c.style.opacity = on.indexOf(c.dataset.pf) >= 0 ? '' : '0.35';
      });
      setPressed(sorts, 'sort', state.sort);
      countEl.textContent = L.count.replace('{n}', shown.length);
      emptyEl.hidden = shown.length > 0;
      syncUrl(state, defaults);
    }
    boxes.forEach(function (b) { b.addEventListener('change', apply); });
    sorts.forEach(function (b) { b.addEventListener('click', function () { state.sort = b.dataset.sort; apply(); }); });
    multiEl.addEventListener('change', function () { state.multi = multiEl.checked ? '1' : '0'; apply(); });
    saleEl.addEventListener('change', function () { state.sale = saleEl.checked ? '1' : '0'; apply(); });
    onSearch(function () { state.q = qEl.value; apply(); });
    rowsEl.addEventListener('click', function (e) {
      if (e.target.closest('a')) return; // 點價格直接前往平台
      var row = e.target.closest('.tr');
      if (row) openDetail(Number(row.dataset.i));
    });
    apply();
  }

  // ---------- 詳細視窗 ----------
  var dialog = document.getElementById('detail');
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function fmtDate(iso) {
    return iso ? new Date(iso).toLocaleDateString(L.dateLocale, { year: 'numeric', month: '2-digit', day: '2-digit' }) : '';
  }
  function openDetail(i) {
    var w = works[i];
    if (!w) return;
    dialog.textContent = '';
    var d = el('div', 'd');
    var cover = el('div', 'd-cover');
    cover.appendChild(el('span', 'ph', (String(w.title || '').match(/[\p{L}\p{N}]/u) || ['?'])[0]));
    if (w.cover) {
      var img = el('img');
      img.alt = ''; img.referrerPolicy = 'no-referrer';
      img.onerror = function () { img.remove(); };
      img.src = w.cover;
      cover.appendChild(img);
    }
    d.appendChild(cover);
    var info = el('div');
    var h = el('h2', null, w.title); h.id = 'd-title';
    info.appendChild(h);
    var dl = el('dl');
    function row(k, v) { if (v) { dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', null, v)); } }
    row(L.authors, (w.authors || []).join(', '));
    row(L.released, fmtDate(w.releasedAt));
    row(L.updated, fmtDate(w.updatedAt));
    info.appendChild(dl);
    d.appendChild(info);
    var list = el('div', 'd-offers');
    w.offers.forEach(function (o) {
      var box = el('div', 'd-offer' + (o.cheapest ? ' is-cheap' : ''));
      box.dataset.pf = o.source;
      box.appendChild(el('span', 'pfn', o.label));
      var price = el('div', 'd-price');
      if (o.main) {
        if (o.unit) price.appendChild(el('span', 'u', o.unit));
        price.appendChild(el('b', null, o.main));
        if (o.sub) price.appendChild(el('s', null, o.sub));
        if (o.discount) price.appendChild(el('span', 'd-off', '-' + o.discount + '%'));
      } else {
        price.appendChild(el('span', 'u', L.noPrice));
      }
      if (o.cheapest) { price.appendChild(document.createTextNode(' ')); price.appendChild(el('span', 'cheap', L.cheapest)); }
      box.appendChild(price);
      if (o.notes && o.notes.length) box.appendChild(el('div', 'd-notes', o.notes.join(' · ')));
      var a = el('a', 'd-buy', L.buy.replace('{pf}', o.label));
      a.href = o.url; a.target = '_blank'; a.rel = 'noopener nofollow';
      box.appendChild(a);
      list.appendChild(box);
    });
    d.appendChild(list);
    var close = el('button', 'd-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', L.close);
    close.addEventListener('click', function () { dialog.close(); });
    dialog.appendChild(d);
    dialog.appendChild(close);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }
  dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });

  if (page === 'rank') initRank();
  else if (page === 'compare') initCompare();
})();
