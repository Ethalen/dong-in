// 前端產生器：繁中與韓文頁面分開、各自只含自己地區的平台
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('產生繁中、韓文兩個獨立頁面', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'site-'));
  execFileSync(process.execPath, ['test/make-sample.mjs'], { stdio: 'pipe' });
  execFileSync(process.execPath, ['src/site/build.js', '--data', 'data/sample', '--out', out], { stdio: 'pipe' });
  const read = (f) => fs.readFileSync(path.join(out, f), 'utf8');
  // 首頁＝比價表；熱門排行在 rank.html
  const twCmp = read('tw/index.html');
  const koCmp = read('ko/index.html');
  const tw = read('tw/rank.html');
  const ko = read('ko/rank.html');
  assert.match(tw, /<html lang="zh-Hant-TW">/);
  assert.match(ko, /<html lang="ko">/);
  assert.ok(tw.includes('螢火蟲的出嫁') && !tw.includes('하프 오브 미'));
  assert.ok(ko.includes('하프 오브 미') && !ko.includes('螢火蟲的出嫁'));
  assert.ok(!tw.includes('data-pf="ridi"') && !ko.includes('data-pf="bookwalker_tw"'));
  // DLsite：台灣版台幣、韓文版韓元
  assert.ok(tw.includes('NT$402') && ko.includes('16,780원'));
  // 多平台時標出最便宜的
  assert.ok(tw.includes('is-cheap'));
  assert.match(tw, /data-page="rank"/);
  assert.match(tw, /id="podium"/);
  assert.match(twCmp, /data-page="compare"/);
  assert.ok(twCmp.includes('cell best') && twCmp.includes('data-filter-pf="renta_tw"'));
  assert.ok(koCmp.includes('data-filter-pf="kakaopage"') && !koCmp.includes('data-filter-pf="bookwalker_tw"'));
  // 比價表是廣告到達頁：連內嵌資料都不能有 DLsite
  assert.ok(!/dlsite/i.test(twCmp) && !/dlsite/i.test(koCmp));
  assert.ok(twCmp.includes('class="howto"') && twCmp.includes('class="fresh"'));
  // 舊網址 compare.html 轉到首頁
  assert.match(read('tw/compare.html'), /http-equiv="refresh" content="0; url=\.\/"/);
  // 關於本站、隱私權政策；每頁頁尾都有連結
  for (const dir of ['tw', 'ko']) {
    for (const f of ['about.html', 'privacy.html']) {
      const html = read(`${dir}/${f}`);
      assert.match(html, /class="wrap doc"/);
      assert.ok(html.includes('href="mailto:support@dong-in.net"'));
    }
  }
  for (const html of [tw, ko, twCmp, koCmp]) {
    assert.ok(html.includes('href="about.html"') && html.includes('href="privacy.html"'));
    // favicon、logo 與社群分享縮圖（og:image 必須是 https 絕對網址）
    assert.ok(html.includes('rel="icon" href="../assets/brand/favicon.svg"'));
    assert.ok(html.includes('src="../assets/brand/mark-pink-for-dark.svg"'));
    const og = html.match(/<meta property="og:image" content="([^"]+)">/);
    assert.ok(og && /^https:\/\/[^/]+\/.+\/assets\/brand\/og-image-(tw|ko)\.png$/.test(og[1]), og?.[1]);
  }
  assert.ok(twCmp.includes('og-image-tw.png') && koCmp.includes('og-image-ko.png'));
  assert.ok(twCmp.includes('family=Noto+Serif+TC') && koCmp.includes('family=Noto+Serif+KR'));
  // 素材有複製到 public/
  for (const f of ['assets/brand/favicon.ico', 'assets/brand/og-image-tw.png', 'assets/brand/og-image-ko.png', 'favicon.ico']) {
    assert.ok(fs.existsSync(path.join(out, f)), f);
  }
  assert.ok(read('index.html').includes('href="assets/brand/favicon.svg"'));
  fs.rmSync(out, { recursive: true, force: true });
});
