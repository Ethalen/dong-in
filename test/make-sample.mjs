// 產生前端預覽用的樣本資料（data/sample/）。內容取自 2026-10-15 在各站實際看到的作品與價格，
// 但只是一小部分、而且會過時；正式資料請用 node src/run.js 抓取。
import fs from 'node:fs';
import path from 'node:path';
import { makeOffer } from '../src/util.js';
import { mergeOffers } from '../src/merge.js';

const OUT = 'data/sample';
const d = (s) => new Date(s + 'T00:00:00+09:00').toISOString();
const kakaoCover = (kid) => (kid ? `https://dn-img-page.kakao.com/download/resource?kid=${kid}&filename=th3` : null);

const bw = (title, series, authors, cur, reg, date, extra = {}) =>
  makeOffer({ source: 'bookwalker_tw', region: 'TW', id: series, url: `https://www.bookwalker.com.tw/search?w=${encodeURIComponent(series)}`,
    title, seriesTitle: series, authors, rating: 'all', rank: extra.rank, rankList: 'rank', releasedAt: d(date), updatedAt: d(date), cover: extra.cover,
    price: { currency: 'TWD', current: cur, regular: reg, discountRate: Math.round((1 - cur / reg) * 100), unit: 'volume' } });
const renta = (id, title, authors, price, vol, first, last, extra = {}) =>
  makeOffer({ source: 'renta_tw', region: 'TW', id,
    url: id.startsWith('3000') ? `https://tw.myrenta.com/search?keyword=${encodeURIComponent(title)}` : `https://tw.myrenta.com/item/${id}`, title, authors, rating: 'all',
    rank: extra.rank ?? null, rankList: extra.rank ? 'month' : 'lookup', releasedAt: d(first), updatedAt: d(last), cover: extra.cover,
    price: { currency: 'TWD', current: price, regular: price, discountRate: 0, unit: extra.unit || 'volume', volume: vol } });

const tw = [
  bw('螢火蟲的出嫁(09)', '螢火蟲的出嫁', ['橘オレコ'], 88, 112, '2026-09-02', { rank: 9 }),
  renta('491191', '螢火蟲的出嫁', ['橘オレコ'], 112, 10, '2024-12-11', '2026-10-15', { rank: 1, cover: 'https://cover.myrenta.com/1039931.jpg' }),
  bw('你好，身為魔女的我，被心上人委託製作迷情藥 (5)', '你好，身為魔女的我，被心上人委託製作迷情藥', ['釜田', '六つ花えいこ'], 83, 105, '2026-10-06', { rank: 14 }),
  renta('300001', '你好，身為魔女的我，被心上人委託製作迷情藥', ['釜田'], 105, 5, '2022-08-01', '2026-10-06', { rank: 5 }),
  bw('皎潔深宵之月 (9)', '皎潔深宵之月', ['山森三香'], 67, 80, '2026-03-05', { rank: 65 }),
  renta('300002', '皎潔深宵之月', ['山森三香'], 80, 10, '2022-04-14', '2026-09-17', { rank: 7 }),
  bw('企鵝咖啡館今天也是大晴天(03)', '企鵝咖啡館今天也是大晴天', ['世禕'], 197, 224, '2026-10-14', { rank: 2, cover: 'https://taiwan-image.bookwalker.com.tw/product/311144/311144_1.jpg' }),
  bw('是你讓我無法呼吸 (5)', '是你讓我無法呼吸', ['澄谷ゼニコ'], 83, 105, '2026-03-27', { rank: 3 }),
  bw('膽大黨 (20)', '膽大黨', ['龍幸伸'], 67, 80, '2026-02-19', { rank: 4 }),
  bw('鏈鋸人 (21)', '鏈鋸人', ['藤本樹'], 67, 80, '2026-02-19', { rank: 12 }),
  bw('SAKAMOTO DAYS 坂本日常 (22)', 'SAKAMOTO DAYS 坂本日常', ['鈴木祐斗'], 67, 80, '2026-03-19', { rank: 51 }),
  bw('藍色時期 (16)', '藍色時期', ['山口飛翔'], 88, 105, '2026-03-05', { rank: 48 }),
  renta('300003', '我獨自升級 漫畫版', ['DUBU(REDICE STUDIO)'], 224, 26, '2023-11-20', '2026-08-28', { rank: 8 }),
  renta('300004', '橡樹之下', ['P'], 285, 3, '2025-07-25', '2026-07-24', { rank: 24 }),
  renta('300005', '第13年的執著婚姻', ['magari'], 39, 12, '2025-11-25', '2026-10-02', { rank: 2, unit: 'episode' }),
];

const ridi = (id, title, series, authors, cur, reg, unit, first, last, extra = {}) =>
  makeOffer({ source: 'ridi', region: 'KR', id: id || series,
    url: id ? `https://ridibooks.com/books/${id}` : `https://ridibooks.com/search?q=${encodeURIComponent(series)}`, title, seriesTitle: series, authors, rating: 'all',
    rank: extra.rank ?? null, rankList: extra.rank ? `${unit === 'episode' ? 'webtoon' : 'comic'}:monthly` : 'lookup',
    releasedAt: d(first), updatedAt: d(last), cover: extra.cover || (id ? `https://img.ridicdn.net/cover/${id}/large` : null), category: extra.category,
    price: { currency: 'KRW', current: cur, regular: reg, discountRate: Math.round((1 - cur / reg) * 100), unit, seriesTotal: extra.total ? { current: extra.total, regular: extra.total } : null },
    promo: extra.free ? { freeEpisodes: extra.free } : null });
const kakao = (id, title, authors, kid, first, last, waitH, free, extra = {}) =>
  makeOffer({ source: 'kakaopage', region: 'KR', id, url: `https://page.kakao.com/content/${id}`, title, authors, cover: kakaoCover(kid),
    rating: 'all', rank: extra.rank ?? null, rankList: extra.rank ? 'webtoon:monthly' : 'lookup', releasedAt: d(first), updatedAt: d(last),
    price: { currency: 'TICKET', current: null, regular: null, discountRate: 0, unit: 'episode' },
    promo: { waitFree: waitH > 0, waitFreeHours: waitH || null, freeEpisodes: free } });
const lezhin = (alias, id, title, authors, coin, freed, first, last, notice, rank) =>
  makeOffer({ source: 'lezhin', region: 'KR', id: alias, url: `https://www.lezhin.com/ko/comic/${alias}`, title, authors, rating: 'all', rank, rankList: 'realtime:all',
    cover: `https://ccdn.lezhin.com/v2/comics/${id}/images/tall.webp?width=440`, releasedAt: d(first), updatedAt: d(last),
    price: { currency: 'COIN', current: coin, regular: coin, discountRate: 0, unit: 'episode' }, promo: { freeEpisodes: freed, text: notice } });

const kr = [
  lezhin('half_of_me', '5367505697964032', '하프 오브 미', ['samK', '주한'], 1, 6, '2022-07-27', '2026-01-07', '[5화 무료, 3 → 1코인] 파격할인 이벤트!', 1),
  ridi('1434021894', '하프 오브 미 1화', '하프 오브 미', ['주한', 'samk'], 600, 600, 'episode', '2022-07-28', '2026-01-08', { total: 58800 }),
  kakao(61392730, '하프 오브 미', ['주한', 'samk'], null, '2022-07-28', '2026-01-08', 24, 1),
  lezhin('regas', '4926773083701248', '레가스 [연재]', ['이끗', '댕멍', 'samk'], 3, 2, '2024-09-15', '2026-10-04', null, 4),
  ridi('2968005365', '레가스 1화', '레가스', ['이끗', '댕멍'], 500, 500, 'episode', '2023-11-13', '2026-10-05', { total: 57000, free: 2 }),
  kakao(69229506, '괴담에 떨어져도 출근을 해야 하는구나', ['캐롯스튜디오', '쓩늉', '백덕수'], 'I2P6R/dJMcafIswFV/A5c0rrsWEKDBOKtYiBMZg0', '2026-06-05', '2026-10-09', 3, 4, { rank: 1 }),
  kakao(70601591, '뱀 가문의 막내딸입니다', ['들깨', '배즙', '마랭'], 'juu7j/dJMb992dMEB/Z0exLRBsxJMtdWsK4eK0pK', '2026-09-23', '2026-10-06', 24, 3, { rank: 2 }),
  ridi(null, '던전을 그리는 화가 1화', '던전을 그리는 화가', ['글리', '오솟'], 500, 500, 'episode', '2026-07-06', '2026-10-06', { rank: 1 }),
  ridi('4766000001', '상수리나무 아래 1화', '상수리나무 아래', ['P', '서말', '나무', '김수지'], 500, 500, 'episode', '2020-08-30', '2026-10-10', { rank: 2 }),
  ridi('1690002642', '[코믹] 죽어서 되돌아간 마법학교 생활을, 옛 연인과 프롤로그부터 1권', '[코믹] 죽어서 되돌아간 마법학교 생활을, 옛 연인과 프롤로그부터', ['시라카와 긴', '무츠하나 에이코'], 4050, 4500, 'volume', '2024-04-29', '2026-09-30', { rank: 1, total: 28350, cover: 'https://img.ridicdn.net/cover/1690005140/large' }),
  ridi(null, '메달리스트 1권', '메달리스트', ['츠루마 이카다'], 3420, 3800, 'volume', '2022-08-29', '2026-09-22', { rank: 2 }),
  ridi(null, '스파이 패밀리 1권', '스파이 패밀리', ['엔도 타츠야'], 3420, 3800, 'volume', '2020-03-18', '2026-09-16', { rank: 3 }),
];

const dlsite = [
  makeOffer({ source: 'dlsite', region: 'GLOBAL', id: 'RJ01545488', url: 'https://www.dlsite.com/garumani/work/=/product_id/RJ01545488.html',
    title: '『A3!』ASMR～至と過ごす日常～', authors: ['リベル・エンタテインメント'], rating: 'all', rank: 1, releasedAt: d('2026-01-30'), updatedAt: d('2026-01-30'),
    cover: 'https://img.dlsite.jp/modpub/images2/work/doujin/RJ01546000/RJ01545488_img_main.jpg',
    price: { currency: 'JPY', current: 1980, regular: 1980, discountRate: 0, unit: 'work', local: { KRW: 16780, TWD: 402, KRW_regular: 16780, TWD_regular: 402 } } }),
  makeOffer({ source: 'dlsite', region: 'GLOBAL', id: 'BJ01349920', url: 'https://www.dlsite.com/garumani/work/=/product_id/BJ01349920.html',
    title: '【初回生産版】ワケアリ ♯1 やっぱり、君の隣で', authors: [], rating: 'all', rank: 2, releasedAt: d('2026-05-01'), updatedAt: d('2026-05-01'),
    cover: 'https://img.dlsite.jp/modpub/images2/work/books/BJ01350000/BJ01349920_img_main.jpg',
    price: { currency: 'JPY', current: 1540, regular: 2200, discountRate: 30, unit: 'work', local: { KRW: 13051, TWD: 313, KRW_regular: 18644, TWD_regular: 447 } },
    promo: { endsAt: '10/24 23:59' } }),
];

fs.mkdirSync(OUT, { recursive: true });
const w = (f, v) => fs.writeFileSync(path.join(OUT, f), JSON.stringify(v, null, 2) + '\n');
w('works-tw.json', mergeOffers(tw));
w('works-kr.json', mergeOffers(kr));
w('dlsite.json', dlsite);
w('meta.json', { generatedAt: new Date().toISOString(), sample: true });
console.log('ok');
