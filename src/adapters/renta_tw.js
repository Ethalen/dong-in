// Renta!（亂搭）台灣：漫畫月排行 + 週排行
// 作品頁：JSON-LD（書名、作者、封面、類別、售價）、#book-info 的 data-is-adult、
//        以及頁面內嵌的各冊資料（發售日 start、price_buy、sale_price_buy）。
// 價格：price_buy 以 0.1 元為單位（1120 = NT$112，等於 11.2 點券）。
import { makeOffer, toISODate, decodeEntities, discountRate, cleanTitle, normalizeTitle } from '../util.js';
import { isSameWork } from '../merge.js';

const BASE = 'https://tw.myrenta.com';
const ADULT_CATEGORIES = ['紳士漫畫', '成人', '18禁', '限制級'];

export const rankUrl = (period) => `${BASE}/rank?period=${period}&group=${encodeURIComponent('漫畫')}`;

export function parseRank(html) {
  return [...html.matchAll(/data-item-id="(\d+)"/g)].map((m) => m[1]);
}

export const searchUrl = (q) => `${BASE}/search?keyword=${encodeURIComponent(q)}`;

/** 搜尋結果頁的 JSON-LD ItemList → [{ id, name }] */
export function parseSearch(html) {
  const out = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let data;
    try { data = JSON.parse(m[1]); } catch { continue; }
    const nodes = [data].flat().flatMap((d) => (d['@graph'] ? d['@graph'] : [d]));
    for (const n of nodes) {
      if (n['@type'] !== 'ItemList') continue;
      for (const it of n.itemListElement || []) {
        const id = String(it.url || '').match(/\/item\/(\d+)/)?.[1];
        if (id) out.push({ id, name: it.name });
      }
    }
  }
  return out;
}

export function parseItemPage(html) {
  const lds = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => { try { return JSON.parse(m[1]); } catch { return null; } })
    .filter(Boolean);
  const book = lds.find((x) => x['@type'] === 'Book');
  const info = html.match(/<div[^>]*id="book-info"[^>]*>/)?.[0] || '';
  const attr = (k) => decodeEntities((info.match(new RegExp(`data-${k}="([^"]*)"`)) || [])[1] || '');

  // 各冊資料（Astro island props，經過 HTML entity 編碼）
  const props = decodeEntities(html);
  const vols = [];
  for (const part of props.split('"vol_no":[0,').slice(1)) {
    const num = (re) => { const m = part.match(re); return m ? Number(m[1]) : null; };
    const start = (part.match(/"start":\[0,"(\d{4}-\d{2}-\d{2})"\]/) || [])[1];
    if (!start) continue;
    vols.push({
      vol: num(/^"?(\d+)/),
      priceBuy: num(/"price_buy":\[0,(-?\d+)\]/),
      salePriceBuy: num(/"sale_price_buy":\[0,(-?\d+)\]/),
      pages: num(/"page":\[0,(\d+)\]/),
      start,
    });
  }
  return {
    book,
    isAdult: attr('is-adult') === '1',
    category: attr('category'),
    categoryGroup: attr('category-group'),
    volName: attr('vol-name'),
    vols,
  };
}

export function toOffer(id, page, rank, rankList) {
  const { book, vols } = page;
  const dates = vols.map((v) => v.start).sort();
  // Renta 同一作品可能同時有「單話」與「單行本」，比價時優先用最新一本單行本（頁數 >= 100）
  const byDate = [...vols].sort((a, b) => (a.start < b.start ? 1 : -1));
  const latestVolume = byDate.find((v) => (v.pages || 0) >= 100);
  const latest = latestVolume || byDate[0];
  const toTWD = (n) => (n == null || n < 0 ? null : n / 10);
  const regular = latest ? toTWD(latest.priceBuy) : book?.offers?.price ?? null;
  const current = latest ? toTWD(latest.salePriceBuy) ?? regular : regular;
  const category = page.category || book?.genre || null;
  const adult = page.isAdult || ADULT_CATEGORIES.some((c) => String(category).includes(c));
  return makeOffer({
    source: 'renta_tw',
    region: 'TW',
    id,
    url: `${BASE}/item/${id}`,
    title: book?.name,
    seriesTitle: book?.name,
    authors: (book?.author || []).map((a) => a.name),
    cover: book?.image || null,
    category,
    rating: adult ? 'adult' : 'all',
    rank,
    rankList,
    releasedAt: toISODate(dates[0] || book?.datePublished),
    updatedAt: toISODate(dates[dates.length - 1] || book?.datePublished),
    price: {
      currency: 'TWD',
      current,
      regular,
      discountRate: discountRate(current, regular),
      unit: latestVolume ? 'volume' : 'episode',
      volume: latest?.vol ?? null, // 價格是最新一冊（或最新一話）的價格
    },
    promo: null,
  });
}

export default {
  name: 'renta_tw',
  region: 'TW',
  /** 用書名到 Renta 搜尋其他平台的熱門作品，找到同一部就回傳 offer。 */
  async lookup({ http, log }, works) {
    const found = [];
    for (const w of works) {
      try {
        const hits = parseSearch(await http.getText(searchUrl(cleanTitle(w.title)))).filter(
          // 搜尋結果會混入同名動畫（【動畫】xxx），只取漫畫
          (h) => normalizeTitle(h.name) === w.key && !/^【動畫】/.test(h.name),
        );
        if (!hits.length) continue;
        const page = parseItemPage(await http.getText(`${BASE}/item/${hits[0].id}`));
        if (!page.book || (page.categoryGroup && page.categoryGroup !== '漫畫')) continue;
        const offer = toOffer(hits[0].id, page, null, 'lookup');
        if (isSameWork(offer, w)) found.push(offer);
      } catch (e) {
        log(`搜尋失敗「${w.title}」：${e.message}`);
      }
    }
    return found;
  },
  async crawl({ http, config, log }) {
    const ranked = [];
    for (const period of ['month', 'week']) {
      parseRank(await http.getText(rankUrl(period))).forEach((id, i) => {
        if (!ranked.find((r) => r.id === id)) ranked.push({ id, rank: i + 1, rankList: period });
      });
    }
    log(`排行 ${ranked.length} 筆`);
    const offers = [];
    for (const r of ranked.slice(0, config.maxItemsPerSource)) {
      const page = parseItemPage(await http.getText(`${BASE}/item/${r.id}`));
      if (!page.book) continue;
      offers.push(toOffer(r.id, page, r.rank, r.rankList));
    }
    return offers;
  },
};
