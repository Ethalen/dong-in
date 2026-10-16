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
  const tw = fs.readFileSync(path.join(out, 'tw/index.html'), 'utf8');
  const ko = fs.readFileSync(path.join(out, 'ko/index.html'), 'utf8');
  assert.match(tw, /<html lang="zh-Hant-TW">/);
  assert.match(ko, /<html lang="ko">/);
  assert.ok(tw.includes('螢火蟲的出嫁') && !tw.includes('하프 오브 미'));
  assert.ok(ko.includes('하프 오브 미') && !ko.includes('螢火蟲的出嫁'));
  assert.ok(!tw.includes('data-pf="ridi"') && !ko.includes('data-pf="bookwalker_tw"'));
  // DLsite：台灣版台幣、韓文版韓元
  assert.ok(tw.includes('NT$402') && ko.includes('16,780원'));
  // 多平台時標出最便宜的
  assert.ok(tw.includes('is-cheap'));
  // 排行榜（首頁）與比價表（compare.html）
  assert.match(tw, /data-page="rank"/);
  assert.match(tw, /id="podium"/);
  const twCmp = fs.readFileSync(path.join(out, 'tw/compare.html'), 'utf8');
  const koCmp = fs.readFileSync(path.join(out, 'ko/compare.html'), 'utf8');
  assert.match(twCmp, /data-page="compare"/);
  assert.ok(twCmp.includes('cell best') && twCmp.includes('data-filter-pf="renta_tw"'));
  assert.ok(koCmp.includes('data-filter-pf="kakaopage"') && !koCmp.includes('data-filter-pf="bookwalker_tw"'));
  assert.ok(!twCmp.includes('data-src="dlsite"')); // 比價表不放 DLsite
  assert.ok(fs.existsSync(path.join(out, 'index.html')));
  fs.rmSync(out, { recursive: true, force: true });
});
