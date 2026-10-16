// 跨站合併：同一地區（KR / TW）內，書名正規化後相同、且作者至少有一位相同的視為同一作品。
// 任一方缺作者資料時，只靠書名比對。
import { normalizeName, uniq } from './util.js';

function authorsOverlap(a = [], b = []) {
  if (!a.length || !b.length) return true;
  // 作者欄位有時是「A,B」合在一起，拆開再比
  const split = (arr) => arr.flatMap((n) => String(n).split(/[,，、|/／]/)).map(normalizeName).filter(Boolean);
  const set = new Set(split(a));
  return split(b).some((n) => set.has(n));
}

/**
 * 判斷兩筆資料是不是同一部作品：正規化書名相同，且
 *  - 作者至少一位相同，或
 *  - 書名夠長（>= 6 字）：各站作者寫法常不同（日文原名／羅馬拼音／中文譯名），長書名撞名機率很低
 */
export function isSameWork(a, b) {
  const ka = a.titleKey ?? a.key;
  const kb = b.titleKey ?? b.key;
  if (!ka || ka !== kb) return false;
  return authorsOverlap(a.authors, b.authors) || [...ka].length >= 6;
}

function slimOffer(o) {
  return {
    source: o.source,
    url: o.url,
    title: o.title,
    rank: o.rank,
    rankList: o.rankList,
    releasedAt: o.releasedAt,
    updatedAt: o.updatedAt,
    price: o.price,
    promo: o.promo,
  };
}

/** offers（已過濾）→ works：每部作品附上各站的售價。 */
export function mergeOffers(offers) {
  const groups = []; // { key, items: [offer] }
  const byKey = new Map();
  for (const o of offers) {
    if (!o.titleKey) continue;
    const candidates = byKey.get(o.titleKey) || [];
    // 同一來源重複出現（例如 RIDI 웹툰／만화兩個榜都有）就略過
    if (candidates.some((c) => c.items.some((x) => x.source === o.source && isSameWork(x, o)))) continue;
    let g = candidates.find(
      (c) => !c.items.some((x) => x.source === o.source) && c.items.some((x) => isSameWork(x, o)),
    );
    if (!g) {
      g = { key: o.titleKey, items: [] };
      candidates.push(g);
      byKey.set(o.titleKey, candidates);
      groups.push(g);
    }
    g.items.push(o);
  }

  const works = groups.map((g) => {
    // 以排名最好的那一站當作「主要資料」（封面、書名）
    const sorted = [...g.items].sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));
    const main = sorted[0];
    return {
      key: g.key,
      region: main.region,
      title: main.seriesTitle,
      cover: main.cover || sorted.find((x) => x.cover)?.cover || null,
      authors: uniq(g.items.flatMap((x) => x.authors)),
      category: main.category,
      releasedAt: g.items.map((x) => x.releasedAt).filter(Boolean).sort()[0] || null,
      updatedAt: g.items.map((x) => x.updatedAt).filter(Boolean).sort().pop() || null,
      sources: g.items.map((x) => x.source),
      multiStore: g.items.length > 1,
      bestRank: main.rank,
      offers: sorted.map(slimOffer),
    };
  });

  // 多平台販售的排前面，其次依排名
  works.sort((a, b) => Number(b.multiStore) - Number(a.multiStore) || (a.bestRank ?? 9999) - (b.bestRank ?? 9999));
  return works;
}
