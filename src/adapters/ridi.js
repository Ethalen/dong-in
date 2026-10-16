// RIDI：만화 e북、웹툰 的月間 베스트（adult_exclude=y 先在排行階段排除成人）
// 排行資料嵌在頁面的 __NEXT_DATA__ 裡；發售日用 book-api 批次查詢。
// 成人判斷（任一成立即排除）：isAdultOnly、類別含「성인」、book-api 的 property.is_adult_only
import { makeOffer, toISODate, discountRate, chunk, cleanTitle, normalizeTitle } from '../util.js';
import { isSameWork } from '../merge.js';

const BASE = 'https://ridibooks.com';
const BOOK_API = 'https://book-api.ridibooks.com/books';
const GENRES = ['webtoon', 'comic'];

export const listUrl = (genre, page) => `${BASE}/bestsellers/${genre}?order=monthly&adult_exclude=y&page=${page}`;

export function parseBestsellers(html) {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return [];
  const queries = JSON.parse(m[1]).props?.pageProps?.dehydratedState?.queries || [];
  const q = queries.find((x) => x.queryKey?.[0] === 'BestSellers');
  return (q?.state?.data?.bestsellers?.items || []).map((it) => it.book).filter(Boolean);
}

export function isAdultBook(b) {
  return !!b.isAdultOnly || (b.categories || []).some((c) => /성인/.test(c.name));
}

export function toOffer(b, genre, rank, dates) {
  const s = b.series || {};
  const buy = b.priceInfo?.purchase || {};
  const all = s.priceInfo?.purchaseAll || null;
  const rental = s.priceInfo?.rentalAll || null;
  const free = s.freeEpisodeCountInfo || {};
  return makeOffer({
    source: 'ridi',
    region: 'KR',
    id: s.id || b.id,
    url: `${BASE}/books/${b.id}`,
    title: b.title?.main,
    seriesTitle: s.title || b.title?.main,
    authors: (b.authors || []).filter((a) => a.role !== 'TRANSLATOR' && a.role !== 'PUBLISHER').map((a) => a.name),
    cover: s.thumbnail?.large || null,
    category: (b.categories || []).map((c) => c.name).join(' / ') || genre,
    rating: isAdultBook(b) || dates?.adult ? 'adult' : 'all',
    rank,
    rankList: `${genre}:monthly`,
    releasedAt: dates?.first || null,
    updatedAt: dates?.last || dates?.first || null,
    price: {
      currency: 'KRW',
      current: buy.sellingPrice ?? null,
      regular: buy.fullPrice ?? null,
      discountRate: discountRate(buy.sellingPrice, buy.fullPrice),
      unit: s.unit === '화' ? 'episode' : 'volume',
      seriesTotal: all ? { current: all.sellingPrice, regular: all.fullPrice, count: s.totalEpisodeCount } : null,
      rentalTotal: rental ? { current: rental.sellingPrice, regular: rental.fullPrice } : null,
    },
    promo:
      free.purchase || free.rental
        ? { freeEpisodes: Math.max(free.purchase || 0, free.rental || 0), text: null }
        : null,
  });
}

export const searchUrl = (q) =>
  `${BASE}/apps/search/search?keyword=${encodeURIComponent(q)}&adult_exclude=y&where=book&what=base&site=ridi-store&size=10`;

/** book-api 的單筆資料（搜尋補查用）→ offer */
export function toOfferFromApi(x, last) {
  const s = x.series || {};
  const sp = s.property || {};
  const buy = x.price_info?.buy || {};
  const all = s.price_info?.buy || null;
  const rent = s.price_info?.rent || null;
  const cats = x.categories || [];
  const adult = !!x.property?.is_adult_only || cats.some((c) => /성인/.test(c.name));
  const free = Math.max(all?.free_book_count || 0, rent?.free_book_count || 0);
  return makeOffer({
    source: 'ridi',
    region: 'KR',
    id: s.id || x.id,
    url: `${BASE}/books/${x.id}`,
    title: x.title?.main,
    seriesTitle: sp.title || x.title?.main,
    authors: (x.authors || []).filter((a) => !/translator|publisher/i.test(a.role)).map((a) => a.name),
    cover: x.thumbnail?.large || null,
    category: cats.map((c) => c.name).join(' / '),
    rating: adult ? 'adult' : 'all',
    rank: null,
    rankList: 'lookup',
    releasedAt: toISODate(x.publish?.ebook_publish || x.publish?.ridibooks_publish),
    updatedAt: toISODate(last?.publish?.ebook_publish || x.publish?.ebook_publish),
    price: {
      currency: 'KRW',
      current: buy.price ?? null,
      regular: buy.regular_price ?? null,
      discountRate: buy.discount_percentage || 0,
      unit: sp.unit === '화' ? 'episode' : 'volume',
      seriesTotal: all ? { current: all.price, regular: all.regular_price, count: all.total_book_count } : null,
      rentalTotal: rent ? { current: rent.rent_price, regular: rent.regular_price } : null,
    },
    promo: free || sp.is_wait_free ? { freeEpisodes: free, waitFree: !!sp.is_wait_free } : null,
  });
}

/** 用 book-api 批次查「第一冊」與「最新一冊」的發售日。 */
async function fetchDates(http, books) {
  const dates = new Map();
  const firstIds = books.map((b) => b.series?.id || b.id);
  const firstInfo = new Map();
  for (const ids of chunk(firstIds, 50)) {
    for (const x of await http.getJson(`${BOOK_API}?b_ids=${ids.join(',')}`)) firstInfo.set(String(x.id), x);
  }
  const lastIds = [];
  for (const id of firstIds) {
    const last = firstInfo.get(String(id))?.series?.property?.opened_last_volume_id;
    if (last && last !== id) lastIds.push(last);
  }
  const lastInfo = new Map();
  for (const ids of chunk(lastIds, 50)) {
    for (const x of await http.getJson(`${BOOK_API}?b_ids=${ids.join(',')}`)) lastInfo.set(String(x.id), x);
  }
  for (const id of firstIds) {
    const f = firstInfo.get(String(id));
    if (!f) continue;
    const lastId = f.series?.property?.opened_last_volume_id;
    const l = lastInfo.get(String(lastId)) || f;
    dates.set(String(id), {
      first: toISODate(f.publish?.ebook_publish || f.publish?.ridibooks_publish),
      last: toISODate(l.publish?.ebook_publish || l.publish?.ridibooks_publish),
      adult: !!(f.property?.is_adult_only || l.property?.is_adult_only),
    });
  }
  return dates;
}

export default {
  name: 'ridi',
  region: 'KR',
  async lookup({ http, log }, works) {
    const hits = []; // { w, b_id, last }
    for (const w of works) {
      try {
        const j = await http.getJson(searchUrl(cleanTitle(w.title)));
        const b = (j?.books || []).find(
          (x) =>
            /웹툰|만화/.test(x.parent_category_name || '') &&
            Number(x.age_limit || 0) < 19 &&
            normalizeTitle(x.title) === w.key,
        );
        if (b) hits.push({ w, id: String(b.b_id), last: b.opened_last_volume_id ? String(b.opened_last_volume_id) : null });
      } catch (e) {
        log(`搜尋失敗「${w.title}」：${e.message}`);
      }
    }
    const ids = [...new Set(hits.flatMap((h) => [h.id, h.last]).filter(Boolean))];
    const info = new Map();
    for (const group of chunk(ids, 50)) {
      for (const x of await http.getJson(`${BOOK_API}?b_ids=${group.join(',')}`)) info.set(String(x.id), x);
    }
    const found = [];
    for (const h of hits) {
      const x = info.get(h.id);
      if (!x) continue;
      const offer = toOfferFromApi(x, info.get(h.last));
      if (offer.rating === 'all' && isSameWork(offer, h.w)) found.push(offer);
    }
    return found;
  },
  async crawl({ http, config, log }) {
    const perGenre = Math.ceil(config.maxItemsPerSource / GENRES.length);
    const picked = [];
    for (const genre of GENRES) {
      const books = [];
      for (let page = 1; books.length < perGenre && page <= 3; page++) {
        const got = parseBestsellers(await http.getText(listUrl(genre, page)));
        if (!got.length) break;
        books.push(...got);
      }
      books.slice(0, perGenre).forEach((b, i) => picked.push({ b, genre, rank: i + 1 }));
    }
    const before = picked.length;
    const safe = picked.filter((p) => !isAdultBook(p.b));
    log(`排行 ${before} 筆，排除成人 ${before - safe.length} 筆`);
    const dates = await fetchDates(http, safe.map((p) => p.b));
    return safe.map((p) => toOffer(p.b, p.genre, p.rank, dates.get(String(p.b.series?.id || p.b.id))));
  },
};
