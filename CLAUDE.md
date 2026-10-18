# 專案說明（給 Claude Code）

漫畫跨平台比價網站：每天抓韓國、台灣各漫畫平台「近一年熱門的全年齡作品」，同一作品在不同平台都有賣時並列售價；另外單獨列出 DLsite がるまに（全年齡）音聲作品。
- GitHub：Ethalen/dong-in（Public）
- 網站：https://ethalen.github.io/dong-in/tw/（繁中）、/ko/（韓文）
- 使用者以繁體中文溝通

## 架構
- `src/adapters/*.js`：每個平台一個 adapter，輸出統一格式（`src/util.js` 的 `makeOffer`）
  - dlsite（がるまに音聲，人氣排序＋regist_date_start）
  - bookwalker_tw（人氣度排序；商品頁 Inertia `data-page` JSON；限制級 `restricted_status` / `product_is_18R`；搜尋有 AWS WAF，不做補查）
  - renta_tw（月榜＋週榜；JSON-LD＋`#book-info` 的 `data-is-adult`；各冊資料在 Astro props，price_buy 單位 0.1 元）
  - ridi（bestsellers 頁 `__NEXT_DATA__`，`adult_exclude=y`；發售日用 book-api 批次查）
  - kakaopage（bff-page 排行 API，`age_grade>=19` 排除；沒有價格，只有等待免費／免費話數）
  - lezhin（content-list/ranking API；作品頁 RSC payload 讀 `isAdult`，讀不到一律當成人）
- `src/merge.js`：同地區內書名正規化＋作者比對合併（書名 >= 6 字時作者不同也合併）
- `src/run.js`：執行全部 adapter → 過濾成人與過舊 → 跨站搜尋補查（renta/ridi/kakao 有 `lookup`）→ 輸出 `data/`
  - 某來源失敗或 0 筆時保留上次資料；結果寫入 `data/meta.json`
  - 在 GitHub Actions 上會輸出 `::warning::` 與 Step Summary 表格
- `src/site/`：靜態網站產生器（`build.js`、`i18n.js` 繁中/韓文字串、`assets/style.css`、`assets/app.js`）
  - 首頁 `index.html`＝多平台比價表（左側篩選、平台分欄、最便宜標綠、價差排序）；也是 Google 廣告到達頁，整頁（含內嵌 JSON）不能出現 DLsite
  - `rank.html`＝熱門排行（深梅紅頁首、前三名頒獎台、編號清單；含 DLsite）
  - `compare.html`＝舊網址，只轉址到首頁（保留查詢參數）
  - Logo：原始素材在 `brand/logo/`（說明見 `brand/logo/說明.txt`），網站用的複本在 `src/site/assets/brand/`（頁首 `mark-pink-for-dark.svg`、favicon 一組、`og-image-tw/ko.png`）；`brand/*.zip` 不進 git
  - 站名字型：Google Fonts 的 Noto Serif TC／KR 900，用 `&text=` 只抓站名的字（`i18n.js` 的 `brandFont`）
  - `SITE_URL`（環境變數，預設 `https://ethalen.github.io/dong-in`）：og:image、og:url、canonical 用的絕對網址；綁自訂網域後要改
  - `about.html`、`privacy.html`＝關於本站、隱私權政策（文字在 `i18n.js`）；聯絡方式預設 support@dong-in.net，可用環境變數 `SITE_CONTACT` 改成網址或 email
  - 各頁會顯示各平台價格更新時間（`meta.json` 的 `sources.<名稱>.at`）
- `.github/workflows/crawl.yml`：每天台灣時間 05:17、17:17 抓資料→commit data→build→部署 GitHub Pages；只改 `src/site/**` 的 push 只重建網站

## 常用指令
- `npm test`：單元測試＋整合測試（`test/mock-fetch.mjs` 假資料，不連網）
- `npm run preview`：用 `data/sample/` 產生 `public/` 預覽
- `node src/run.js --only ridi,kakaopage --no-lookup`：只抓部分來源
- `node test/make-browser-bundle.mjs <adapter>`：產生可在該網站頁面 console 執行的測試腳本

## 注意
- 各平台都沒有公開 API，用的是網頁前端的內部接口，改版就可能失效；不要繞過登入、驗證或 WAF
- 只收全年齡作品（DLsite 也只抓がるまに）
- 遠端 main 會有機器人的 data commit，push 前先 pull

## 待辦／想法
- BOOK☆WALKER 人氣度偏向累積銷量，可考慮加抓新書列表
- Lezhin 硬幣與 RIDI 韓元無法直接比價
- 自訂網域（尚未設定）
