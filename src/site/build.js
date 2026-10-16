// 由 data/*.json 產生靜態網站：public/tw/（繁中）、public/ko/（韓文）、public/index.html（依瀏覽器語言導向）
// 用法：node src/site/build.js [--data data] [--out public]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALES } from './i18n.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
}
const DATA = arg('--data', 'data');
const OUT = arg('--out', 'public');

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- 價格顯示 ----------
function money(cur, n, L) {
  if (n == null || Number.isNaN(Number(n))) return null;
  const v = Number(n);
  switch (cur) {
    case 'KRW': return `${v.toLocaleString('ko-KR')}원`;
    case 'TWD': return `NT$${v.toLocaleString('zh-TW')}`;
    case 'JPY': return `¥${v.toLocaleString('ja-JP')}`;
    case 'COIN': return L.dir === 'ko' ? `${v}코인` : `${v} 硬幣`;
    default: return null;
  }
}

function displayOffer(o, L) {
  const p = o.price || {};
  let cur = p.currency;
  let current = p.current;
  let regular = p.regular;
  if (o.source === 'dlsite') {
    // DLsite 用官方換算價：台灣版顯示台幣、韓文版顯示韓元
    cur = L.dlsiteCurrency;
    current = p.local?.[cur] ?? null;
    regular = p.local?.[`${cur}_regular`] ?? current;
  }
  const rate = p.discountRate || (regular > current ? Math.round((1 - current / regular) * 100) : 0);
  const notes = [];
  const pr = o.promo || {};
  if (pr.waitFree) notes.push(L.waitFree(pr.waitFreeHours));
  if (pr.freeEpisodes > 0) notes.push(L.free(pr.freeEpisodes));
  if (p.seriesTotal?.current) notes.push(L.seriesTotal(money(cur, p.seriesTotal.current, L)));
  if (p.rental && cur === 'TWD') notes.push(L.rental(money(cur, p.rental, L)));
  if (pr.text) notes.push(String(pr.text).slice(0, 60));
  if (o.source === 'dlsite' && pr.endsAt) notes.push(`~${pr.endsAt}`);
  const main = money(cur, current, L);
  // 卡片上空間有限：有價格就顯示價格（單話加「/話」），沒有價格就顯示最重要的優惠
  const short = main
    ? main + (L.unitShort?.[p.unit] || '')
    : pr.waitFree && L.waitFreeShort
      ? L.waitFreeShort + (pr.freeEpisodes > 0 ? ` · ${L.free(pr.freeEpisodes)}` : '')
      : notes[0] || L.noPrice;
  return {
    short,
    source: o.source,
    label: L.sources[o.source] || o.source,
    url: o.url,
    main,
    sub: regular > current ? money(cur, regular, L) : null,
    discount: rate > 0 ? rate : 0,
    unit: main ? L.unit[p.unit] || '' : '',
    notes,
    currency: cur,
    unitKey: p.unit,
    value: main && (cur === 'KRW' || cur === 'TWD') ? Number(current) : null,
  };
}

function toView(work, L) {
  const offers = work.offers.map((o) => displayOffer(o, L));
  // 同幣別、同計價單位的平台 >= 2 個時，標出最便宜的那個
  const groups = {};
  offers.forEach((o) => {
    if (o.value == null) return;
    (groups[`${o.currency}:${o.unitKey}`] ||= []).push(o);
  });
  for (const g of Object.values(groups)) {
    if (g.length < 2) continue;
    const min = Math.min(...g.map((o) => o.value));
    const winners = g.filter((o) => o.value === min);
    if (winners.length === 1) winners[0].cheapest = true;
  }
  // 價差：同幣別、同單位的平台之間，最高價減最低價（比價表用來排序）
  let gap = 0;
  let gapText = null;
  for (const g of Object.values(groups)) {
    if (g.length < 2) continue;
    const vals = g.map((o) => o.value);
    const d = Math.max(...vals) - Math.min(...vals);
    if (d > gap) {
      gap = d;
      gapText = money(g[0].currency, d, L);
    }
  }
  const values = offers.map((o) => o.value).filter((v) => v != null);
  return {
    key: work.key,
    title: work.title,
    cover: work.cover,
    authors: work.authors || [],
    category: work.category,
    releasedAt: work.releasedAt,
    updatedAt: work.updatedAt,
    sources: offers.map((o) => o.source),
    multi: offers.length > 1,
    rank: work.bestRank ?? 9999,
    discount: Math.max(0, ...offers.map((o) => o.discount)),
    // 「特價／免費」：有折扣，或有免費話數、等待免費
    sale: offers.some((o) => o.discount > 0) || work.offers.some((x) => x.promo?.freeEpisodes > 0 || x.promo?.waitFree),
    price: values.length ? Math.min(...values) : null,
    gap,
    gapText,
    offers,
  };
}

function dlsiteToWork(o) {
  return {
    key: `dlsite:${o.id}`,
    title: o.title,
    cover: o.cover,
    authors: o.authors,
    category: o.category,
    releasedAt: o.releasedAt,
    updatedAt: o.updatedAt,
    bestRank: o.rank,
    offers: [o],
  };
}

// ---------- HTML ----------
function fmtDate(iso, L) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(L.dateLocale, { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Taipei' });
}

/** 佔位字：書名第一個文字或數字（略過『【等符號） */
function initial(title) {
  return (String(title || '').match(/[\p{L}\p{N}]/u) || ['?'])[0];
}

/** 封面：佔位字一直都在，圖片蓋在上面；載入失敗就移除圖片 */
function coverHtml(w) {
  return `<span class="ph" aria-hidden="true">${esc(initial(w.title))}</span>` +
    (w.cover ? `<img src="${esc(w.cover)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : '');
}

/** 篩選、排序要用到的 data-* 屬性（排行榜與比價表共用） */
function dataAttrs(w, i) {
  const search = [w.title, ...w.authors].join(' ').toLowerCase();
  return `data-i="${i}" data-src="${esc(w.sources.join(' '))}" data-multi="${w.multi ? 1 : 0}" data-sale="${w.sale ? 1 : 0}"` +
    ` data-rank="${w.rank}" data-upd="${w.updatedAt ? Date.parse(w.updatedAt) : 0}" data-rel="${w.releasedAt ? Date.parse(w.releasedAt) : 0}"` +
    ` data-disc="${w.discount}" data-gap="${w.gap || 0}" data-q="${esc(search)}"`;
}

function priceLinks(w, L) {
  return w.offers
    .map(
      (o) => `<li><a class="pf" data-pf="${esc(o.source)}" href="${esc(o.url)}" target="_blank" rel="noopener nofollow">` +
        `<span class="pfn">${esc(o.label)}</span>` +
        `<span class="pr${o.cheapest ? ' is-cheap' : ''}"${o.cheapest ? ` title="${esc(L.cheapest)}"` : ''}>` +
        (o.cheapest ? `<span class="vh">${esc(L.cheapest)} </span>` : '') +
        `${esc(o.short)}</span></a></li>`,
    )
    .join('');
}

// 排行榜的一列（前三名會被移到頒獎台，樣式不同但標記相同）
function rankItem(w, i, L) {
  return `<li class="item" ${dataAttrs(w, i)}>` +
    `<button class="hit" type="button" aria-haspopup="dialog">` +
    `<span class="no">${i + 1}</span>` +
    `<span class="cv">${coverHtml(w)}${w.discount ? `<span class="badge">-${w.discount}%</span>` : ''}</span>` +
    `<span class="info"><span class="t">${esc(w.title)}</span><span class="a">${esc(w.authors.join(', '))}</span>` +
    (w.multi ? `<span class="multi">${esc(L.offersCount(w.offers.length))}</span>` : '') +
    `</span></button><ul class="prices">${priceLinks(w, L)}</ul></li>`;
}

// 比價表的一列：每個平台一欄
function compareRow(w, i, L, platforms) {
  const cells = platforms
    .map((pf) => {
      const o = w.offers.find((x) => x.source === pf);
      const label = `<em class="lbl">${esc(L.sources[pf])}</em>`;
      if (!o) return `<span class="cell na" data-pf="${pf}">${label}${esc(L.compare.notSold)}</span>`;
      return `<a class="cell${o.cheapest ? ' best' : ''}" data-pf="${pf}" href="${esc(o.url)}" target="_blank" rel="noopener nofollow">${label}` +
        `<b>${esc(o.short)}</b>${o.sub ? `<s>${esc(o.sub)}</s>` : ''}` +
        (o.cheapest ? `<span class="tag-cheap">${esc(L.cheapest)}</span>` : '') +
        `</a>`;
    })
    .join('');
  return `<div class="tr" role="row" ${dataAttrs(w, i)}>` +
    `<span class="cv">${coverHtml(w)}</span>` +
    `<span class="info"><span class="t">${esc(w.title)}</span><span class="a">${esc(w.authors.join(', '))}</span>` +
    (w.gapText ? `<span class="gap">${esc(L.compare.gap(w.gapText))}</span>` : '') +
    `</span>${cells}<button class="go" type="button" aria-haspopup="dialog">${esc(L.compare.detail)}</button></div>`;
}

function headHtml(L, title, page) {
  return `<!doctype html>
<html lang="${L.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(L.description)}">
<link rel="alternate" hreflang="zh-Hant-TW" href="../tw/${page === 'compare' ? 'compare.html' : ''}">
<link rel="alternate" hreflang="ko" href="../ko/${page === 'compare' ? 'compare.html' : ''}">
<link rel="stylesheet" href="../assets/style.css">
</head>`;
}

function barHtml(L, page) {
  const other = L.otherLang.href + (page === 'compare' ? 'compare.html' : '');
  return `<div class="bar">
    <a class="brand" href="./"><span class="logo" aria-hidden="true">◆</span>${esc(L.siteName)}</a>
    <nav class="views">
      <a href="./"${page === 'rank' ? ' aria-current="page"' : ''}>${esc(L.nav.rank)}</a>
      <a href="compare.html"${page === 'compare' ? ' aria-current="page"' : ''}>${esc(L.nav.compare)}</a>
    </nav>
    <a class="lang" href="${other}">${esc(L.otherLang.label)}</a>
  </div>`;
}

function footHtml(L, meta) {
  const updated = meta.generatedAt ? fmtDate(meta.generatedAt, L) : '';
  return `<footer class="foot"><p>${esc(L.updatedAt(updated))}</p><p>${esc(L.disclaimer)}</p></footer>`;
}

function tailHtml(views, L) {
  const data = JSON.stringify({ works: views, L: pickClientStrings(L) }).replace(/</g, '\\u003c');
  return `<dialog id="detail" aria-labelledby="d-title"></dialog>
<script type="application/json" id="data">${data}</script>
<script src="../assets/app.js" defer></script>
</body>
</html>
`;
}

function searchHtml(L) {
  return `<label class="search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>` +
    `<input type="search" id="q" placeholder="${esc(L.searchPlaceholder)}" aria-label="${esc(L.searchPlaceholder)}"></label>`;
}

function rankPage(L, views, meta, counts) {
  const tabs = [['all', L.tabs.all, views.length], ...Object.entries(L.sources).map(([k, label]) => [k, label, counts[k] || 0])]
    .filter(([k, , n]) => k === 'all' || n > 0)
    .map(([k, label, n]) => `<button class="tab" type="button" data-tab="${k}" aria-pressed="${k === 'all'}">${esc(label)}<span class="n">${n}</span></button>`)
    .join('');
  const modes = Object.entries(L.modes)
    .map(([k, label]) => `<button class="mode" type="button" data-mode="${k}" aria-pressed="${k === 'hot'}">${esc(label)}</button>`)
    .join('');
  const items = views.map((w, i) => rankItem(w, i, L));
  return `${headHtml(L, L.title, 'rank')}
<body data-page="rank" data-new-days="${L.newDays}">
<header class="top">
  ${barHtml(L, 'rank')}
  <div class="hero">
    ${meta.sample ? `<p class="notice" role="note">${esc(L.sampleNotice)}</p>` : ''}
    <h1>${esc(L.hero.before)}<em>${esc(L.hero.em)}</em>${esc(L.hero.after)}</h1>
    <p>${esc(L.heroSub)}</p>
    <div class="modes">${modes}</div>
  </div>
</header>
<main class="wrap">
  <ol class="podium" id="podium">${items.slice(0, 3).join('')}</ol>
  <div class="filters"><div class="tabs">${tabs}</div>${searchHtml(L)}</div>
  <p class="count" id="count" aria-live="polite">${esc(L.count(views.length))}</p>
  <ol class="ranklist" id="list">${items.slice(3).join('')}</ol>
  <p class="empty" id="empty" hidden>${esc(L.empty)}</p>
  ${footHtml(L, meta)}
</main>
${tailHtml(views, L)}`;
}

function comparePage(L, views, meta) {
  const platforms = Object.keys(L.sources).filter((k) => k !== 'dlsite');
  const rows = views.filter((w) => !w.sources.includes('dlsite'));
  const C = L.compare;
  const boxes = platforms
    .map((pf) => `<label class="check" data-pf="${pf}"><input type="checkbox" data-filter-pf="${pf}" checked><span class="box"></span>${esc(L.sources[pf])}<span class="n">${rows.filter((w) => w.sources.includes(pf)).length}</span></label>`)
    .join('');
  const sorts = Object.entries(C.sort)
    .map(([k, label]) => `<button class="sortbtn" type="button" data-sort="${k}" aria-pressed="${k === 'gap'}">${esc(label)}</button>`)
    .join('');
  const th = `<div class="th" role="row"><span></span><span>${esc(C.work)}</span>${platforms.map((pf) => `<span data-pf="${pf}" class="pfn">${esc(L.sources[pf])}</span>`).join('')}<span></span></div>`;
  return `${headHtml(L, `${C.title}｜${L.siteName}`, 'compare')}
<body data-page="compare">
<header class="top top-compare">
  ${barHtml(L, 'compare')}
  <div class="hero">
    ${meta.sample ? `<p class="notice" role="note">${esc(L.sampleNotice)}</p>` : ''}
    <h1>${esc(C.title)}</h1>
    <p>${esc(C.sub)}</p>
  </div>
</header>
<main class="wrap cmp">
  <aside class="side">
    <h2 class="side-h">${esc(C.platforms)}</h2>
    ${boxes}
    <p class="hint">${esc(C.platformsHint)}</p>
    <hr>
    <label class="switch"><span>${esc(C.onlyMulti)}</span><input type="checkbox" id="only-multi" checked><span class="sw" aria-hidden="true"></span></label>
    <label class="switch"><span>${esc(C.onlySale)}</span><input type="checkbox" id="only-sale"><span class="sw" aria-hidden="true"></span></label>
  </aside>
  <section class="cmp-main">
    <div class="cmp-head">${searchHtml(L)}<div class="sorts">${sorts}</div></div>
    <p class="count" id="count" aria-live="polite"></p>
    <div class="table" role="table" style="--cols:${platforms.length}">${th}<div id="rows">${rows.map((w) => compareRow(w, views.indexOf(w), L, platforms)).join('')}</div></div>
    <p class="empty" id="empty" hidden>${esc(L.empty)}</p>
  </section>
</main>
<div class="wrap">${footHtml(L, meta)}</div>
${tailHtml(views, L)}`;
}

function pickClientStrings(L) {
  return {
    count: L.count(0).replace('0', '{n}'),
    released: L.released,
    updated: L.updated,
    authors: L.authors,
    buy: L.buy('{pf}'),
    close: L.close,
    cheapest: L.cheapest,
    noPrice: L.noPrice,
    dateLocale: L.dateLocale,
  };
}

async function build() {
  const meta = await readJson(path.join(DATA, 'meta.json'), {});
  const dlsite = await readJson(path.join(DATA, 'dlsite.json'), []);
  await fs.mkdir(path.join(OUT, 'assets'), { recursive: true });
  for (const f of ['style.css', 'app.js']) {
    await fs.copyFile(path.join(here, 'assets', f), path.join(OUT, 'assets', f));
  }
  for (const L of Object.values(LOCALES)) {
    const works = await readJson(path.join(DATA, `works-${L.region.toLowerCase()}.json`), []);
    const all = [...works, ...dlsite.map(dlsiteToWork)];
    // 「熱門」：各平台排名交錯排列
    // 同名次時：多平台作品優先，DLsite 音聲排在漫畫後面
    const isDl = (v) => Number(v.sources.includes('dlsite'));
    const views = all
      .map((w) => toView(w, L))
      .sort((a, b) => a.rank - b.rank || Number(b.multi) - Number(a.multi) || isDl(a) - isDl(b));
    const counts = { multi: views.filter((v) => v.multi).length };
    for (const v of views) for (const s of v.sources) counts[s] = (counts[s] || 0) + 1;
    await fs.mkdir(path.join(OUT, L.dir), { recursive: true });
    await fs.writeFile(path.join(OUT, L.dir, 'index.html'), rankPage(L, views, meta, counts));
    await fs.writeFile(path.join(OUT, L.dir, 'compare.html'), comparePage(L, views, meta));
    console.log(`[${L.dir}] ${views.length} 部作品（多平台 ${counts.multi}）`);
  }
  // 入口：韓文瀏覽器導向 /ko/，其他導向 /tw/
  await fs.writeFile(
    path.join(OUT, 'index.html'),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(LOCALES.tw.siteName)} · ${esc(LOCALES.ko.siteName)}</title>
<script>location.replace(/^ko\\b/i.test(navigator.language || '') ? 'ko/' : 'tw/');</script></head>
<body><p><a href="tw/" hreflang="zh-Hant-TW">繁體中文</a> · <a href="ko/" hreflang="ko">한국어</a></p></body></html>\n`,
  );
}

build().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
