// 執行：node src/run.js [--only ridi,kakaopage] [--since 180] [--no-lookup]
import fs from 'node:fs/promises';
import path from 'node:path';
import { config, cutoffDate } from './config.js';
import { http } from './http.js';
import { isRecent } from './util.js';
import { mergeOffers } from './merge.js';

import dlsite from './adapters/dlsite.js';
import bookwalkerTw from './adapters/bookwalker_tw.js';
import rentaTw from './adapters/renta_tw.js';
import ridi from './adapters/ridi.js';
import kakaopage from './adapters/kakaopage.js';
import lezhin from './adapters/lezhin.js';

const ADAPTERS = [dlsite, bookwalkerTw, rentaTw, ridi, kakaopage, lezhin];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--only') args.only = argv[++i].split(',');
    if (argv[i] === '--since') config.sinceDays = Number(argv[++i]);
    if (argv[i] === '--no-lookup') args.noLookup = true;
  }
  return args;
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}
async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n');
}

async function runAdapter(adapter, cutoff) {
  const started = Date.now();
  const log = (msg) => console.log(`[${adapter.name}] ${msg}`);
  const raw = await adapter.crawl({ http, config, cutoff, log });
  const adult = raw.filter((o) => o.rating !== 'all');
  const safe = raw.filter((o) => o.rating === 'all');
  const recent = safe.filter((o) => isRecent(o, cutoff, config.recency));
  log(`取得 ${raw.length}，排除成人 ${adult.length}，排除過舊 ${safe.length - recent.length}，保留 ${recent.length}（${((Date.now() - started) / 1000).toFixed(1)} 秒）`);
  return { offers: recent, stats: { raw: raw.length, adult: adult.length, old: safe.length - recent.length, kept: recent.length } };
}

/**
 * 跨站補查：A 站的熱門作品，不一定在 B 站的排行榜上，
 * 所以拿書名到同地區其他平台搜尋，找到同一部作品就把那邊的售價也列出來。
 */
async function crossLookup(region, works) {
  const out = config.outDir;
  const sources = ADAPTERS.filter((a) => a.region === region && typeof a.lookup === 'function');
  const results = await Promise.allSettled(
    sources.map(async (a) => {
      const log = (msg) => console.log(`[${a.name}:lookup] ${msg}`);
      const targets = works
        .filter((w) => !w.sources.includes(a.name))
        .slice(0, config.lookupLimit)
        .map((w) => ({ key: w.key, title: w.title, authors: w.authors }));
      const found = (await a.lookup({ http, config, log }, targets)).filter((o) => o.rating === 'all');
      log(`搜尋 ${targets.length} 部，找到 ${found.length} 部`);
      await writeJson(path.join(out, 'lookups', `${a.name}.json`), found);
      return found;
    }),
  );
  return results.flatMap((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    console.error(`[${sources[i].name}:lookup] 失敗：${r.reason?.message || r.reason}`);
    return [];
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cutoff = cutoffDate();
  const out = config.outDir;
  const meta = await readJson(path.join(out, 'meta.json'), { sources: {} });
  meta.generatedAt = new Date().toISOString();
  meta.sinceDays = config.sinceDays;
  meta.recency = config.recency;

  const targets = ADAPTERS.filter((a) => !args.only || args.only.includes(a.name));
  console.log(`抓取 ${targets.map((a) => a.name).join(', ')}；只保留 ${cutoff.toISOString().slice(0, 10)} 之後的作品`);

  const results = await Promise.allSettled(targets.map((a) => runAdapter(a, cutoff)));
  let failed = 0;
  for (const [i, r] of results.entries()) {
    const name = targets[i].name;
    const file = path.join(out, 'offers', `${name}.json`);
    if (r.status === 'fulfilled' && r.value.offers.length > 0) {
      await writeJson(file, r.value.offers);
      meta.sources[name] = { ok: true, at: meta.generatedAt, ...r.value.stats };
    } else {
      // 失敗或抓到 0 筆：保留上一次的檔案，避免網站改版時把資料清空
      failed++;
      const reason = r.status === 'rejected' ? r.reason : null;
      const error = reason
        ? [reason.message || String(reason), reason.cause?.message].filter(Boolean).join(' / ')
        : '抓到 0 筆（可能網站改版、維護中或被擋）';
      console.error(`[${name}] 失敗，保留上次資料：${error}`);
      meta.sources[name] = { ...(meta.sources[name] || {}), ok: false, lastError: error, failedAt: meta.generatedAt };
    }
  }

  // 依地區合併（用 offers/ 下所有檔案，包含這次沒重抓的來源）
  const all = [];
  for (const a of ADAPTERS) all.push(...(await readJson(path.join(out, 'offers', `${a.name}.json`), [])));
  // 只有這次有抓到的地區才做跨站補查（例如 --only renta_tw 時不會去搜尋韓國網站）
  const lookupRegions = new Set(targets.map((a) => a.region));
  for (const region of ['KR', 'TW']) {
    const hot = all.filter((o) => o.region === region);
    const doLookup = !args.noLookup && lookupRegions.has(region) && hot.length > 0;
    let extra = [];
    if (doLookup) extra = await crossLookup(region, mergeOffers(hot));
    else if (!args.noLookup) {
      // 沒有重新補查的地區：沿用上一次的補查結果，避免輸出少掉比價資料
      for (const a of ADAPTERS.filter((x) => x.region === region)) {
        extra.push(...(await readJson(path.join(out, 'lookups', `${a.name}.json`), [])));
      }
    }
    const works = mergeOffers([...hot, ...extra]);
    await writeJson(path.join(out, `works-${region.toLowerCase()}.json`), works);
    console.log(`[${region}] 作品 ${works.length} 部，其中多平台販售 ${works.filter((w) => w.multiStore).length} 部`);
  }
  await writeJson(path.join(out, 'dlsite.json'), all.filter((o) => o.source === 'dlsite'));
  await writeJson(path.join(out, 'meta.json'), meta);

  if (failed === targets.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
