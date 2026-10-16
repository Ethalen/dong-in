import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTitle, toISODate, isRecent, makeOffer } from '../src/util.js';
import { mergeOffers } from '../src/merge.js';
import { parseList as bwList, parseProductPage } from '../src/adapters/bookwalker_tw.js';
import { parseItemPage } from '../src/adapters/renta_tw.js';
import { parseComicPage } from '../src/adapters/lezhin.js';
import { parseList as dlList } from '../src/adapters/dlsite.js';
import { isAdultBook } from '../src/adapters/ridi.js';

test('normalizeTitle 去掉冊數與標記', () => {
  assert.equal(normalizeTitle('企鵝咖啡館今天也是大晴天(03)'), normalizeTitle('企鵝咖啡館今天也是大晴天'));
  assert.equal(normalizeTitle('레가스 [연재]'), normalizeTitle('레가스'));
  assert.equal(normalizeTitle('[코믹] 죽어서 되돌아간 마법학교 1권'), normalizeTitle('죽어서 되돌아간 마법학교'));
  assert.equal(normalizeTitle('月刊少女野崎同學(17)【含電子限定特典】'), normalizeTitle('月刊少女野崎同學'));
  assert.equal(normalizeTitle('和年長同學談BL戀愛 (全)'), normalizeTitle('和年長同學談BL戀愛'));
  assert.equal(normalizeTitle('我獨自升級  漫畫版'), normalizeTitle('我獨自升級 (26)'));
  assert.equal(normalizeTitle('남편은 분명 성기사였는데 [19세 완전판]'), normalizeTitle('남편은 분명 성기사였는데'));
});

test('toISODate 支援各站格式', () => {
  assert.equal(toISODate('2026年10月14日'), '2026-10-14T00:00:00.000Z');
  assert.equal(toISODate('2026-01-31 00:00:00'), '2026-01-30T15:00:00.000Z');
  assert.equal(toISODate(1767798000000), new Date(1767798000000).toISOString());
  assert.equal(toISODate(''), null);
});

test('isRecent any / first', () => {
  const cutoff = new Date('2025-10-15');
  const old = { releasedAt: '2024-01-01', updatedAt: '2026-09-01' };
  assert.equal(isRecent(old, cutoff, 'any'), true);
  assert.equal(isRecent(old, cutoff, 'first'), false);
});

test('mergeOffers 依書名＋作者合併，並列出各站售價', () => {
  const base = { region: 'TW', rating: 'all' };
  const a = makeOffer({ ...base, source: 'bookwalker_tw', id: 1, title: '螢火蟲的出嫁(09)', seriesTitle: '螢火蟲的出嫁', authors: ['橘オレコ'], rank: 3, price: { currency: 'TWD', current: 88 } });
  const b = makeOffer({ ...base, source: 'renta_tw', id: 2, title: '螢火蟲的出嫁', authors: ['橘オレコ'], rank: 1, price: { currency: 'TWD', current: 112 } });
  // 短書名（< 6 字）且作者不同：不合併
  const c = makeOffer({ ...base, source: 'bookwalker_tw', id: 3, title: '火影 (3)', authors: ['甲'], rank: 5 });
  const d = makeOffer({ ...base, source: 'renta_tw', id: 4, title: '火影', authors: ['乙'], rank: 6 });
  // 長書名、作者寫法不同（日文 vs 羅馬拼音）：合併
  const e = makeOffer({ ...base, source: 'bookwalker_tw', id: 5, title: '請永久指名我吧！(3)', authors: ['佐藤かなえ'], rank: 7 });
  const f = makeOffer({ ...base, source: 'renta_tw', id: 6, title: '請永久指名我吧！', authors: ['Kanae Sato'], rank: 8 });
  const works = mergeOffers([a, b, c, d, e, f]);
  const w = works.find((x) => x.key === normalizeTitle('螢火蟲的出嫁'));
  assert.deepEqual(w.sources.sort(), ['bookwalker_tw', 'renta_tw']);
  assert.deepEqual(w.offers.map((o) => o.price.current).sort(), [112, 88]);
  assert.equal(works.filter((x) => x.key === normalizeTitle('火影')).length, 2);
  assert.equal(works.find((x) => x.key === normalizeTitle('請永久指名我吧')).multiStore, true);
});

test('BOOK☆WALKER 列表會標出限制級', () => {
  const html = '<div class="bookitem"><a href="https://www.bookwalker.com.tw/product/279719"><img restricted_status="1"><h4 class="bookname">A (3)</h4></a></div>' +
    '<div class="bookitem"><a href="https://www.bookwalker.com.tw/product/311144"><img restricted_status="0"><h4 class="bookname">B</h4></a></div>';
  assert.deepEqual(bwList(html).map((r) => [r.id, r.restricted]), [['279719', true], ['311144', false]]);
  const page = '<div id="app" data-page="{&quot;props&quot;:{&quot;productData&quot;:{&quot;product_name&quot;:&quot;X&quot;,&quot;product_is_18R&quot;:false}}}"></div>';
  assert.equal(parseProductPage(page).product_name, 'X');
});

test('Renta 作品頁：成人旗標與各冊資料', () => {
  const html = '<script type="application/ld+json">{"@type":"Book","name":"螢火蟲的出嫁","author":[{"name":"橘オレコ"}],"offers":{"price":112}}</script>' +
    '<div class="hidden" id="book-info" data-sid="491191" data-vol-no="1" data-is-adult="0" data-category="少女漫畫">' +
    '&quot;vol_no&quot;:[0,&quot;8&quot;],&quot;price_buy&quot;:[0,1120],&quot;sale_price_buy&quot;:[0,900],&quot;start&quot;:[0,&quot;2026-05-06&quot;]' +
    '&quot;vol_no&quot;:[0,&quot;9&quot;],&quot;price_buy&quot;:[0,1120],&quot;sale_price_buy&quot;:[0,1120],&quot;start&quot;:[0,&quot;2026-09-02&quot;]';
  const p = parseItemPage(html);
  assert.equal(p.isAdult, false);
  assert.equal(p.vols.length, 2);
  assert.equal(p.vols[1].start, '2026-09-02');
});

test('Lezhin 作品頁：讀出 isAdult 與每話硬幣', () => {
  const html = String.raw`{\"display\":{\"title\":\"하프 오브 미\",\"notice\":\"[5화 무료]\"},\"isAdult\":false},\"episodes\":[{\"coin\":0},{\"coin\":3},{\"coin\":3},{\"coin\":1}]`;
  const p = parseComicPage(html);
  assert.equal(p.isAdult, false);
  assert.equal(p.coinPerEpisode, 3);
  assert.equal(p.notice, '[5화 무료]');
});

test('DLsite 列表解析', () => {
  const html = '<tr data-list_item_product_id="BJ1" class=""><dt class="work_name"><a href="https://www.dlsite.com/garumani/work/=/product_id/BJ1.html">t</a></dt><dd class="maker_name"> <a href="x">社團A</a></dd>';
  assert.deepEqual(dlList(html), [{ id: 'BJ1', url: 'https://www.dlsite.com/garumani/work/=/product_id/BJ1.html', maker: '社團A' }]);
});

test('RIDI 成人判斷', () => {
  assert.equal(isAdultBook({ isAdultOnly: false, categories: [{ name: '성인' }] }), true);
  assert.equal(isAdultBook({ isAdultOnly: false, categories: [{ name: '로판' }] }), false);
});
