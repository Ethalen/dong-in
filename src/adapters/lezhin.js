// Lezhin（레진코믹스）：即時排行（전체）+ 新作排行（신작）
// 排行接口沒有成人旗標，所以每部作品都會進作品頁，讀取頁面內嵌資料的 isAdult。
// 讀不到 isAdult 的作品一律視為成人並排除（寧可漏掉，不要誤放）。
// 價格：以「硬幣／話」計價，取各話中最常見的非零硬幣數。
import { makeOffer, toISODate } from '../util.js';

const BASE = 'https://www.lezhin.com';

export const rankUrl = (filter) =>
  `${BASE}/lz-api/v2/content-list/ranking?rankType=realtime&filter=${filter}&genres=&limit=100`;

export const coverUrl = (id, updatedAt) =>
  `https://ccdn.lezhin.com/v2/comics/${id}/images/tall.webp?updated=${updatedAt || ''}&width=440`;

/** 從作品頁 HTML 取出 isAdult、各話硬幣數與活動公告。 */
export function parseComicPage(html) {
  // Next.js RSC payload 裡的 JSON 是跳脫過的字串，先還原引號
  const s = html.replace(/\\\\"/g, '"').replace(/\\"/g, '"');
  const idx = s.indexOf('"episodes":[');
  const head = idx > 0 ? s.slice(Math.max(0, idx - 4000), idx) : s;
  const adultMatch = [...head.matchAll(/"isAdult":(true|false)/g)].pop();
  const isAdult = adultMatch ? adultMatch[1] === 'true' : null;
  const notice = (head.match(/"notice":"((?:[^"\\]|\\.)*)"/) || [])[1] || null;
  const epBlock = idx > 0 ? s.slice(idx, idx + 200000) : '';
  const coins = [...epBlock.matchAll(/"coin":(\d+)/g)].map((m) => Number(m[1]));
  const counts = {};
  for (const c of coins) if (c > 0) counts[c] = (counts[c] || 0) + 1;
  const coinPerEpisode = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]) || null;
  return { isAdult, notice, coinPerEpisode, episodeCount: coins.length };
}

export function toOffer(x, page, rank, rankList) {
  return makeOffer({
    source: 'lezhin',
    region: 'KR',
    id: x.alias,
    url: `${BASE}/ko/comic/${x.alias}`,
    title: x.title,
    seriesTitle: x.title,
    authors: (x.artists || []).filter((a) => a.role !== 'publisher').map((a) => a.name),
    cover: coverUrl(x.id, x.updatedAt),
    category: (x.genres || []).join(' / '),
    // isAdult 讀不到（null）時當作成人
    rating: page?.isAdult === false ? 'all' : 'adult',
    rank,
    rankList,
    releasedAt: toISODate(x.publishedAt),
    updatedAt: toISODate(x.lastEpisodePublishedAt || x.updatedAt),
    price: {
      currency: 'COIN',
      current: page?.coinPerEpisode ?? null,
      regular: page?.coinPerEpisode ?? null,
      discountRate: 0,
      unit: 'episode',
    },
    promo: {
      freeEpisodes: x.freedEpisodeSize || 0,
      completed: x.contentsState === 'completed',
      text: page?.notice ? page.notice.replace(/\\n/g, ' ') : null,
    },
  });
}

export default {
  name: 'lezhin',
  region: 'KR',
  async crawl({ http, config, cutoff, log }) {
    const rows = [];
    for (const filter of ['all', 'new']) {
      const j = await http.getJson(rankUrl(filter));
      (j?.data || []).forEach((x, i) => {
        if (!rows.find((r) => r.x.alias === x.alias)) rows.push({ x, rank: i + 1, rankList: `realtime:${filter}` });
      });
    }
    log(`排行 ${rows.length} 筆`);
    const offers = [];
    for (const r of rows.slice(0, config.maxItemsPerSource)) {
      // 太舊的作品不必進作品頁，省請求
      const last = r.x.lastEpisodePublishedAt || r.x.updatedAt || r.x.publishedAt;
      if (last && new Date(last) < cutoff && new Date(r.x.publishedAt) < cutoff) continue;
      let page = null;
      try {
        page = parseComicPage(await http.getText(`${BASE}/ko/comic/${r.x.alias}`));
      } catch (e) {
        log(`作品頁讀取失敗 ${r.x.alias}: ${e.message}`);
      }
      offers.push(toOffer(r.x, page, r.rank, r.rankList));
    }
    return offers;
  },
};
