// DLsite がるまに（全年齡・女性向）音聲作品
// 列表：搜尋頁 /fsr/ 依人氣（trend）排序，並用 regist_date_start 只取期間內上架的作品
// 細節：/product/info/ajax 一次查多筆，含日圓、韓元、台幣價格與折扣
import { makeOffer, toISODate, decodeEntities, chunk } from '../util.js';

const BASE = 'https://www.dlsite.com/garumani';

export function listUrl(sinceDate, page) {
  const since = sinceDate.toISOString().slice(0, 10);
  return `${BASE}/fsr/=/work_type_category/audio/order/trend/regist_date_start/${since}/per_page/100/page/${page}/show_type/1/`;
}

/** 解析搜尋結果頁：回傳 [{id, url, maker}]，順序即人氣排名。 */
export function parseList(html) {
  const out = [];
  // 原始 HTML 的 <tr 與屬性之間有換行，用 \s+ 比對
  const blocks = html.split(/<tr\s+data-list_item_product_id="/).slice(1);
  for (const b of blocks) {
    const id = b.slice(0, b.indexOf('"'));
    const url = (b.match(/<dt\s+class="work_name"[\s\S]*?<a\s+href="([^"]+)"/) || [])[1];
    const maker = (b.match(/<dd\s+class="maker_name"[^>]*>\s*<a\s[^>]*>([^<]+)<\/a>/) || [])[1];
    out.push({ id, url: url || `${BASE}/work/=/product_id/${id}.html`, maker: maker ? decodeEntities(maker.trim()) : null });
  }
  return out;
}

/** 把 ajax 的單筆資料轉成 offer。 */
export function toOffer(row, info, rank) {
  const adult = info.age_category !== 1; // 1 = 全年齡
  const img = info.work_image ? (info.work_image.startsWith('//') ? 'https:' + info.work_image : info.work_image) : null;
  return makeOffer({
    source: 'dlsite',
    region: 'GLOBAL',
    id: row.id,
    url: row.url,
    title: info.work_name,
    seriesTitle: info.title_name || info.work_name,
    authors: row.maker ? [row.maker] : [],
    cover: img,
    category: info.work_type || null,
    rating: adult ? 'adult' : 'all',
    rank,
    rankList: 'trend',
    releasedAt: toISODate(info.regist_date),
    updatedAt: toISODate(info.regist_date),
    price: {
      currency: 'JPY',
      current: info.price,
      regular: info.official_price ?? info.price,
      discountRate: info.discount_rate || 0,
      unit: 'work',
      // DLsite 官方換算價（含稅），可直接顯示給韓國／台灣用戶
      local: {
        KRW: info.locale_price?.ko_KR ?? null,
        TWD: info.locale_price?.zh_TW ?? null,
        KRW_regular: info.locale_official_price?.ko_KR ?? info.locale_price?.ko_KR ?? null,
        TWD_regular: info.locale_official_price?.zh_TW ?? info.locale_price?.zh_TW ?? null,
      },
    },
    promo: info.is_discount
      ? { endsAt: info.discount_end_date || null, text: info.discount_caption || null }
      : null,
  });
}

export default {
  name: 'dlsite',
  region: 'GLOBAL',
  async crawl({ http, config, cutoff, log }) {
    const rows = [];
    for (let page = 1; rows.length < config.maxItemsPerSource && page <= 5; page++) {
      const html = await http.getText(listUrl(cutoff, page));
      const got = parseList(html);
      if (!got.length) break;
      rows.push(...got);
    }
    const list = rows.slice(0, config.maxItemsPerSource);
    log(`列表 ${list.length} 筆`);

    const offers = [];
    for (const group of chunk(list, 50)) {
      const ids = group.map((r) => r.id).join(',');
      const info = await http.getJson(`${BASE}/product/info/ajax?product_id=${ids}`);
      for (const row of group) {
        if (info[row.id]) offers.push(toOffer(row, info[row.id], list.indexOf(row) + 1));
      }
    }
    return offers;
  },
};
