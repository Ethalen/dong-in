// 純函式工具：不依賴 Node 專屬 API，方便在瀏覽器裡做同樣的測試。

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 解 HTML entity（只處理會出現在屬性值裡的常見幾種）。 */
export function decodeEntities(s) {
  return String(s)
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

/** 把各站各種日期格式轉成 ISO 字串；無法解析回傳 null。 */
export function toISODate(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return new Date(v).toISOString();
  const s = String(v).trim();
  // 2026年10月14日
  let m = s.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toISOString();
  // 2026-01-31 00:00:00（DLsite，日本時間）
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}+09:00`).toISOString();
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString();
}

/** 依設定判斷是否算「近期」作品。 */
export function isRecent(offer, cutoff, mode = 'any') {
  const first = offer.releasedAt ? new Date(offer.releasedAt) : null;
  const last = offer.updatedAt ? new Date(offer.updatedAt) : null;
  if (mode === 'first') return !!first && first >= cutoff;
  return (first && first >= cutoff) || (last && last >= cutoff) || false;
}

// 書名裡常見、但不影響「是不是同一部作品」的標記
const NOISE_PATTERNS = [
  /\[(연재|개정판|완결|단행본|코믹|컬러|특별판|외전|합본|독점|선공개|19금|15금)[^\]]*\]/g,
  /\[\d+세[^\]]*\]/g, // [15세 개정판] / [19세 완전판]
  /【[^】]*】/g,
  /〔[^〕]*〕/g,
  /[（(](全|完|全一冊|上|下|單話|漫畫版|條漫版|彩色版)[)）]/g,
  /\s*(漫畫版|單話)\s*$/g,
  /[（(]\s*\d+\s*[)）]\s*$/g, // (03)
  /\s+\d+\s*(권|화|巻|卷|集|冊|册)\s*$/g, // 1권 / 1화
  /\s+(vol\.?|v)\s*\d+\s*$/gi,
  /\s+\d+\s*$/g,
];

/** 去掉冊數、版本標記後的書名（保留空白），拿去其他網站搜尋用。 */
export function cleanTitle(title) {
  let s = String(title || '').normalize('NFKC');
  for (const re of NOISE_PATTERNS) s = s.replace(re, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/** 跨站比對用的書名正規化。 */
export function normalizeTitle(title) {
  let s = String(title || '').normalize('NFKC');
  for (const re of NOISE_PATTERNS) s = s.replace(re, ' ');
  return s
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '') // 去掉空白、標點、符號
    .trim();
}

/** 作者名正規化（去空白、轉小寫），比對時用。 */
export function normalizeName(n) {
  return String(n || '').normalize('NFKC').toLowerCase().replace(/[\s·・.]+/g, '');
}

export function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

export function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/**
 * 建立統一格式的 offer（一個平台上的一部作品）。
 * 所有 adapter 都透過這個函式輸出，確保欄位一致。
 */
export function makeOffer(o) {
  const offer = {
    source: o.source, // 'ridi' | 'kakaopage' | ...
    region: o.region, // 'KR' | 'TW' | 'GLOBAL'
    id: String(o.id),
    url: o.url,
    title: o.title,
    seriesTitle: o.seriesTitle || o.title,
    authors: uniq(o.authors || []),
    cover: o.cover || null,
    category: o.category || null,
    rating: o.rating, // 'all' | 'adult'
    rank: o.rank ?? null,
    rankList: o.rankList || null,
    releasedAt: o.releasedAt || null, // 首次發售（或該冊發售日）
    updatedAt: o.updatedAt || null, // 最近一次更新
    price: o.price || null, // { currency, current, regular, discountRate, unit, ... }
    promo: o.promo || null, // { waitFree, freeEpisodes, endsAt, text }
  };
  offer.titleKey = normalizeTitle(offer.seriesTitle);
  return offer;
}

export function discountRate(current, regular) {
  if (!regular || current == null || current >= regular) return 0;
  return Math.round((1 - current / regular) * 100);
}
