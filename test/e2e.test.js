// 整合測試：用假資料（test/mock-fetch.mjs）跑完整流程，不連網。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('完整流程：過濾成人、跨站補查、並列售價', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'manga-deals-'));
  execFileSync(process.execPath, ['--import', './test/mock-fetch.mjs', 'src/run.js'], {
    env: { ...process.env, OUT_DIR: out, DELAY_MS: '0' },
    stdio: 'pipe',
  });
  const read = (f) => JSON.parse(fs.readFileSync(path.join(out, f), 'utf8'));

  const tw = read('works-tw.json');
  const firefly = tw.find((w) => w.title === '螢火蟲的出嫁');
  assert.deepEqual(firefly.sources.sort(), ['bookwalker_tw', 'renta_tw']); // Renta 是搜尋補查到的
  assert.ok(!JSON.stringify(tw).includes('成人書'));

  const kr = read('works-kr.json');
  const half = kr.find((w) => w.title === '하프 오브 미');
  assert.deepEqual(half.sources.sort(), ['kakaopage', 'lezhin', 'ridi']);
  assert.ok(!JSON.stringify(kr).includes('19세'));
  assert.ok(!JSON.stringify(kr).includes('성인작'));

  const dl = read('dlsite.json');
  assert.equal(dl[0].price.local.TWD, 313);
  fs.rmSync(out, { recursive: true, force: true });
});
