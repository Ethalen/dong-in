import { config } from './config.js';
import { sleep } from './util.js';

const lastHit = new Map(); // host -> timestamp，用來對同一網站限速

async function throttle(url) {
  const host = new URL(url).host;
  const wait = (lastHit.get(host) || 0) + config.delayMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
}

async function request(url, { headers = {}, as = 'text' } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= config.retries; attempt++) {
    await throttle(url);
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': config.userAgent,
          'Accept-Language': 'ko-KR,ko;q=0.9,zh-TW;q=0.8,en;q=0.5',
          ...headers,
        },
        signal: AbortSignal.timeout(config.timeoutMs),
        redirect: 'follow',
      });
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status}`);
      }
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} ${url}`);
        err.fatal = true; // 4xx 不重試
        throw err;
      }
      return as === 'json' ? await res.json() : await res.text();
    } catch (e) {
      lastErr = e;
      if (e.fatal) break;
      await sleep(1500 * (attempt + 1));
    }
  }
  throw lastErr;
}

export const http = {
  getText: (url, opts) => request(url, { ...opts, as: 'text' }),
  getJson: (url, opts) => request(url, { ...opts, as: 'json' }),
};
