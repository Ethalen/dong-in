// 所有可調整的設定集中在這裡；也可以用環境變數覆寫。
const env = process.env;

export const config = {
  // 只保留「首次發售」或「最近更新」落在這個天數內的作品（預設一年）。
  sinceDays: Number(env.SINCE_DAYS || 365),
  // recency 規則：
  //   'any'   = 首次發售或最近更新任一在期間內（適合連載中的熱門作品）
  //   'first' = 只看首次發售（只要真正的新作）
  recency: env.RECENCY || 'any',

  // 每個來源最多抓幾筆排行（抓太多會變慢，也增加對方伺服器負擔）。
  maxItemsPerSource: Number(env.MAX_ITEMS || 120),

  // 跨站補查：某平台的熱門作品，最多拿幾部去其他平台搜尋（搜尋 + 讀作品頁，會增加請求數）。
  lookupLimit: Number(env.LOOKUP_LIMIT || 80),

  // 同一個網站兩次請求之間至少間隔幾毫秒。
  delayMs: Number(env.DELAY_MS || 1000),
  timeoutMs: 20000,
  retries: 2,

  // 對外表明身分的 User-Agent。可以改成你的網站網址或聯絡信箱。
  userAgent:
    env.USER_AGENT ||
    'Mozilla/5.0 (compatible; MangaDealsBot/0.1; +https://example.com/bot)',

  outDir: env.OUT_DIR || 'data',
};

export function cutoffDate(now = new Date()) {
  return new Date(now.getTime() - config.sinceDays * 86400000);
}
