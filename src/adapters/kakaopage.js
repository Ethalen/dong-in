// Kakao Page：웹툰（category_uid=10）月間排行，網頁版使用的內部 BFF 接口。
// 成人判斷：age_grade >= 19（0=全年齡、12、15、19）。
// 價格：Kakao 以「每話票券」販售，排行接口沒有金額，因此只提供
//       等待免費（기다무）、免費話數、總話數等資訊。
import { makeOffer, toISODate, cleanTitle, normalizeTitle } from '../util.js';
import { isSameWork } from '../merge.js';

const API = 'https://bff-page.kakao.com/api/gateway/view/v1/landing/ranking';
const HEADERS = { Referer: 'https://page.kakao.com/', Origin: 'https://page.kakao.com' };

// category：10=웹툰、16=책（含 e북 만화）；只抓漫畫類
const CATEGORIES = [{ uid: 10, name: '웹툰' }];

export const rankUrl = (cat, page) =>
  `${API}?category_uid=${cat}&subcategory_uid=0&ranking_type=monthly&page=${page}`;

export const searchUrl = (q) =>
  `https://bff-page.kakao.com/api/gateway/api/v2/search/series?keyword=${encodeURIComponent(q)}&category_uid=10&is_complete=false&sort_type=ACCURACY&page=0&size=10`;

export const coverUrl = (kid) =>
  kid ? `https://dn-img-page.kakao.com/download/resource?kid=${kid}&filename=th3` : null;

export function toOffer(x, rankList = 'webtoon:monthly') {
  return makeOffer({
    source: 'kakaopage',
    region: 'KR',
    id: x.series_id,
    url: `https://page.kakao.com/content/${x.series_id}`,
    title: x.title,
    seriesTitle: x.title,
    authors: String(x.authors || '').split(',').map((s) => s.trim()),
    cover: coverUrl(x.thumbnail),
    category: [x.category, x.sub_category].filter(Boolean).join(' / '),
    rating: Number(x.age_grade) >= 19 ? 'adult' : 'all',
    rank: Number(x.service_property?.rank) || null,
    rankList,
    releasedAt: toISODate(x.start_sale_dt),
    updatedAt: toISODate(x.last_slide_added_dt),
    price: {
      currency: 'TICKET',
      current: null,
      regular: null,
      discountRate: 0,
      unit: 'episode',
      ageGrade: x.age_grade,
    },
    promo: {
      waitFree: !!x.is_waitfree,
      waitFreeHours: x.waitfree_period_by_minute ? x.waitfree_period_by_minute / 60 : null,
      freeEpisodes: x.free_slide_count || 0,
      allFree: !!x.is_all_free,
      views: x.service_property?.view_count ?? null,
    },
  });
}

export default {
  name: 'kakaopage',
  region: 'KR',
  async lookup({ http, log }, works) {
    const found = [];
    for (const w of works) {
      try {
        const j = await http.getJson(searchUrl(cleanTitle(w.title)), { headers: HEADERS });
        const hit = (j?.result?.list || []).find(
          (x) => Number(x.category_uid) === 10 && Number(x.age_grade) < 19 && normalizeTitle(x.title) === w.key,
        );
        if (!hit) continue;
        const offer = toOffer(hit, 'lookup');
        offer.rank = null;
        if (isSameWork(offer, w)) found.push(offer);
      } catch (e) {
        log(`搜尋失敗「${w.title}」：${e.message}`);
      }
    }
    return found;
  },
  async crawl({ http, config, log }) {
    const rows = [];
    for (const cat of CATEGORIES) {
      const seen = new Set();
      for (let page = 0; rows.length < config.maxItemsPerSource && page < 5; page++) {
        const j = await http.getJson(rankUrl(cat.uid, page), { headers: HEADERS });
        const list = j?.result?.list || [];
        const fresh = list.filter((x) => !seen.has(x.series_id));
        if (!fresh.length) break;
        fresh.forEach((x) => seen.add(x.series_id));
        rows.push(...fresh);
        if (j.result.is_end) break;
      }
    }
    const offers = rows.slice(0, config.maxItemsPerSource).map((x) => toOffer(x));
    log(`排行 ${offers.length} 筆，其中 19 禁 ${offers.filter((o) => o.rating === 'adult').length} 筆`);
    return offers;
  },
};
