// 整合測試用：把 fetch 換成假資料，讓 src/run.js 不連網也能跑完整流程。
// 用法：node --import ./test/mock-fetch.mjs src/run.js
const now = Date.now();
const day = (n) => new Date(now - n * 86400000);
const iso = (n) => day(n).toISOString();
const ymd = (n) => iso(n).slice(0, 10);
const enc = (o) => JSON.stringify(o).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

const routes = [
  // ---- DLsite
  [/dlsite\.com\/garumani\/fsr\/.*\/page\/1\//, () =>
    '<tr\n data-list_item_product_id="RJ1" class=""><dt class="work_name"><a href="https://www.dlsite.com/garumani/work/=/product_id/RJ1.html">x</a></dt><dd class="maker_name"><a href="#">社團</a></dd>'],
  [/dlsite\.com\/garumani\/fsr\//, () => ''],
  [/dlsite\.com\/garumani\/product\/info\/ajax/, () => ({
    RJ1: { age_category: 1, work_name: '音聲A', work_image: '//img.dlsite.jp/a.jpg', price: 1540, official_price: 2200, discount_rate: 30, is_discount: true, discount_end_date: '10/24 23:59', regist_date: `${ymd(20)} 00:00:00`, locale_price: { ko_KR: 13051, zh_TW: 313 }, locale_official_price: { ko_KR: 18644, zh_TW: 447 } },
  })],
  // ---- BOOK☆WALKER
  [/bookwalker\.com\.tw\/search\?m=2&order=rank&page=1$/, () =>
    '<div class="bookitem"><a href="https://www.bookwalker.com.tw/product/100"><img restricted_status="0"><h4 class="bookname">螢火蟲的出嫁(09)</h4></a></div>' +
    '<div class="bookitem"><a href="https://www.bookwalker.com.tw/product/999"><img restricted_status="1"><h4 class="bookname">成人書</h4></a></div>'],
  [/bookwalker\.com\.tw\/search/, () => ''],
  [/bookwalker\.com\.tw\/product\/100/, () =>
    `<a data-page="\${currentPage - 1}"></a><div id="app" data-page="${enc({ component: 'Product/index', props: { productData: { product_name: '螢火蟲的出嫁(09)', product_series_name: '螢火蟲的出嫁', product_series_id: 1, product_image: 'https://img/bw.jpg', product_price: 88, product_original_price: 112, product_is_18R: false, product_detail_info: { author: '橘オレコ', sell_date_start: '2026年09月02日' } } } })}"></div>`],
  // ---- Renta
  [/myrenta\.com\/rank/, () => '<div data-item-id="22"></div>'],
  [/myrenta\.com\/search\?keyword=/, () =>
    '<script type="application/ld+json">[{"@type":"ItemList","itemListElement":[{"name":"【動畫】螢火蟲的出嫁","url":"https://tw.myrenta.com/item/77"},{"name":"螢火蟲的出嫁","url":"https://tw.myrenta.com/item/11"}]}]</script>'],
  [/myrenta\.com\/item\/11/, () =>
    '<script type="application/ld+json">{"@type":"Book","name":"螢火蟲的出嫁","image":"https://cover/1.jpg","author":[{"name":"橘オレコ"}],"offers":{"price":112}}</script>' +
    '<div id="book-info" data-is-adult="0" data-category="少女漫畫" data-category-group="漫畫"></div>' +
    `&quot;vol_no&quot;:[0,&quot;9&quot;],&quot;price_buy&quot;:[0,1120],&quot;sale_price_buy&quot;:[0,1000],&quot;page&quot;:[0,196],&quot;start&quot;:[0,&quot;${ymd(40)}&quot;]`],
  [/myrenta\.com\/item\/22/, () =>
    '<script type="application/ld+json">{"@type":"Book","name":"橡樹之下","author":[{"name":"P"}],"offers":{"price":285}}</script>' +
    '<div id="book-info" data-is-adult="0" data-category="少女漫畫" data-category-group="漫畫"></div>' +
    `&quot;vol_no&quot;:[0,&quot;3&quot;],&quot;price_buy&quot;:[0,2850],&quot;sale_price_buy&quot;:[0,2850],&quot;page&quot;:[0,300],&quot;start&quot;:[0,&quot;${ymd(80)}&quot;]`],
  // ---- RIDI
  [/ridibooks\.com\/bestsellers\/webtoon.*page=1$/, () => {
    const book = { id: '500', title: { main: '하프 오브 미 1화' }, isAdultOnly: false, categories: [{ name: 'BL 웹툰' }], authors: [{ name: '주한', role: 'ILLUSTRATOR' }], priceInfo: { purchase: { fullPrice: 600, sellingPrice: 600 } }, series: { id: '500', title: '하프 오브 미', unit: '화', thumbnail: { large: 'https://img/r.jpg' }, priceInfo: { purchaseAll: { fullPrice: 58800, sellingPrice: 58800 } }, freeEpisodeCountInfo: { purchase: 0, rental: 0 }, totalEpisodeCount: 98 } };
    const adult = { ...book, id: '501', isAdultOnly: true, title: { main: '19금 1화' }, series: { ...book.series, id: '501', title: '19금' } };
    const nd = { props: { pageProps: { dehydratedState: { queries: [{ queryKey: ['BestSellers'], state: { data: { bestsellers: { items: [{ book }, { book: adult }] } } } }] } } } };
    return `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nd)}</script>`;
  }],
  [/ridibooks\.com\/bestsellers\//, () => '<html></html>'],
  [/book-api\.ridibooks\.com\/books\?b_ids=/, (u) =>
    new URL(u).searchParams.get('b_ids').split(',').map((id) => ({ id, title: { main: 'x' }, publish: { ebook_publish: iso(id === '500' ? 900 : 10) }, series: { property: { opened_last_volume_id: id === '500' ? '599' : id } }, property: { is_adult_only: false } }))],
  [/ridibooks\.com\/apps\/search/, () => ({ books: [] })],
  // ---- Kakao
  [/bff-page\.kakao\.com\/.*landing\/ranking.*page=0/, () => ({ result: { is_end: true, list: [
    { series_id: 1, title: '괴담에 떨어져도 출근을 해야 하는구나', authors: '캐롯스튜디오', age_grade: 15, category: '웹툰', start_sale_dt: iso(100), last_slide_added_dt: iso(3), is_waitfree: true, free_slide_count: 4, service_property: { rank: '1' } },
    { series_id: 2, title: '남편은 [19세 완전판]', authors: 'a', age_grade: 19, start_sale_dt: iso(10), last_slide_added_dt: iso(1), service_property: { rank: '2' } },
  ] } })],
  [/bff-page\.kakao\.com\/.*search\/series/, (u) => {
    const q = new URL(u).searchParams.get('keyword');
    return { result: { list: q === '하프 오브 미' ? [{ series_id: 9, title: '하프 오브 미', authors: '주한,samk', age_grade: 15, category_uid: 10, start_sale_dt: iso(800), last_slide_added_dt: iso(5), is_waitfree: true, free_slide_count: 1 }] : [] } };
  }],
  // ---- Lezhin
  [/lezhin\.com\/lz-api\/v2\/content-list\/ranking/, (u) => ({ data: u.includes('filter=all') ? [
    { id: 1, alias: 'half_of_me', title: '하프 오브 미', artists: [{ name: 'samK', role: 'scripter' }, { name: '주한', role: 'painter' }], genres: ['bl'], publishedAt: now - 1200 * 86400000, lastEpisodePublishedAt: now - 30 * 86400000, freedEpisodeSize: 6 },
    { id: 2, alias: 'adult_one', title: '성인작', artists: [], publishedAt: now - 10 * 86400000, lastEpisodePublishedAt: now },
  ] : [] })],
  [/lezhin\.com\/ko\/comic\/half_of_me/, () => String.raw`{\"isAdult\":false},\"episodes\":[{\"coin\":0},{\"coin\":3},{\"coin\":3}]`],
  [/lezhin\.com\/ko\/comic\/adult_one/, () => String.raw`{\"isAdult\":true},\"episodes\":[{\"coin\":3}]`],
];

globalThis.fetch = async (url) => {
  const u = String(url);
  const route = routes.find(([re]) => re.test(u));
  if (!route) return new Response('not found: ' + u, { status: 404 });
  const body = route[1](u);
  return typeof body === 'string'
    ? new Response(body, { status: 200, headers: { 'content-type': 'text/html' } })
    : Response.json(body);
};
