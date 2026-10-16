// BOOK☆WALKER 台灣：漫畫分類（m=2）依「人氣度」排序（order=rank）
// 列表頁是伺服器輸出的 HTML；商品頁用 Inertia.js，完整資料在 data-page 屬性的 JSON 裡。
// 限制級判斷：列表 <img restricted_status="1">、商品頁 productData.product_is_18R
import { makeOffer, toISODate, decodeEntities, discountRate } from '../util.js';

const BASE = 'https://www.bookwalker.com.tw';

export const listUrl = (page) => `${BASE}/search?m=2&order=rank&page=${page}`;

export function parseList(html) {
  const out = [];
  for (const b of html.split(/<div\s+class="bookitem"\s*>/).slice(1)) {
    const id = (b.match(/\/product\/(\d+)/) || [])[1];
    if (!id) continue;
    const restricted = /restricted_status="1"/.test(b);
    const title = decodeEntities(((b.match(/<h4\s+class="bookname"\s*>([\s\S]*?)<\/h4>/) || [])[1] || '').trim());
    out.push({ id, restricted, title });
  }
  return out;
}

/** 從商品頁 HTML 取出 Inertia 的 props。 */
export function parseProductPage(html) {
  // 頁面上還有其他 data-page 屬性（分頁元件），只取能解析成 Inertia JSON 的那一個
  for (const m of html.matchAll(/data-page="(\{[^"]+)"/g)) {
    try {
      const page = JSON.parse(decodeEntities(m[1]));
      if (page.props?.productData) return page.props.productData;
    } catch {
      /* 不是 JSON，略過 */
    }
  }
  return null;
}

export function toOffer(p, rank) {
  const info = p.product_detail_info || {};
  const authors = [info.author, info.manga_artist, info.original_author, info.illustrator, info.screenwriter]
    .flatMap((s) => String(s || '').split(/[、,／/]/))
    .map((s) => s.trim())
    .filter(Boolean);
  const special = p.is_product_period_special_price && p.product_period_special_price > 0;
  const current = special ? p.product_period_special_price : p.product_price;
  const regular = p.product_original_price || p.product_price;
  return makeOffer({
    source: 'bookwalker_tw',
    region: 'TW',
    id: p.product_id ?? p.id ?? null,
    url: `${BASE}/product/${p.product_id ?? p.id}`,
    title: p.product_name,
    seriesTitle: p.product_series_name || p.product_name,
    authors,
    cover: p.product_image || null,
    category: '漫畫',
    rating: p.product_is_18R ? 'adult' : 'all',
    rank,
    rankList: 'rank',
    releasedAt: toISODate(info.sell_date_start),
    updatedAt: toISODate(info.sell_date_start),
    price: {
      currency: 'TWD',
      current,
      regular,
      discountRate: discountRate(current, regular),
      unit: 'volume',
      rental: p.product_rental_price || null,
      isbn: info.publisher_isbn || null,
      volume: p.product_series_num || null,
    },
    promo: special ? { endsAt: toISODate(p.product_period_special_price_date_end), text: '限時特價' } : null,
  });
}

export default {
  name: 'bookwalker_tw',
  region: 'TW',
  async crawl({ http, config, log }) {
    const rows = [];
    let skippedAdult = 0;
    for (let page = 1; rows.length < config.maxItemsPerSource && page <= 10; page++) {
      const got = parseList(await http.getText(listUrl(page)));
      if (!got.length) break;
      for (const r of got) {
        if (r.restricted) skippedAdult++;
        else rows.push({ ...r, rank: rows.length + skippedAdult + 1 });
      }
    }
    log(`列表 ${rows.length} 筆（列表階段已排除限制級 ${skippedAdult} 筆）`);

    // 同一系列只留排名最前的一冊（系列名稱要進商品頁才知道）
    // 同系列較新的一冊，用來更新 updatedAt（代表系列仍在出新刊）
    const bySeries = new Map();
    for (const r of rows.slice(0, config.maxItemsPerSource)) {
      let p = null;
      try {
        p = parseProductPage(await http.getText(`${BASE}/product/${r.id}`));
      } catch (e) {
        log(`商品頁讀取失敗 ${r.id}: ${e.message}`);
      }
      if (!p) {
        log(`商品頁解析失敗 ${r.id}`);
        continue;
      }
      p.product_id = r.id;
      const offer = toOffer(p, r.rank);
      const key = p.product_series_id || r.id;
      const prev = bySeries.get(key);
      if (!prev) bySeries.set(key, offer);
      else if (offer.updatedAt && (!prev.updatedAt || offer.updatedAt > prev.updatedAt)) prev.updatedAt = offer.updatedAt;
    }
    return [...bySeries.values()];
  },
};
