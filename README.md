# manga-deals

抓取韓國、台灣各漫畫平台**近期熱門的全年齡作品**，整理出封面、價格、折扣、免費話數；
同一部作品在不同平台都有賣時，把各平台的售價並列。另外單獨抓取 DLsite がるまに（全年齡）的音聲作品。

- 不需要安裝任何套件（只用 Node.js 20+ 內建的 `fetch`）
- 每天由 GitHub Actions 自動執行，結果以 JSON 存在 `data/`，前端直接讀取

## 來源與抓法（2026-10 實測）

| 來源 | 地區 | 熱門清單 | 成人過濾 | 跨站補查 |
|---|---|---|---|---|
| DLsite がるまに | — | 音聲作品依人氣排序，只取期間內上架 | `age_category = 1` | — |
| BOOK☆WALKER TW | TW | 漫畫「人氣度」排序 | 列表 `restricted_status`、商品頁 `product_is_18R` | 無（搜尋功能有 AWS WAF 防護，不嘗試繞過） |
| Renta! TW | TW | 漫畫月排行＋週排行 | `#book-info` 的 `data-is-adult`、類別「紳士漫畫」 | 有（站內搜尋） |
| RIDI | KR | 웹툰、만화 e북月間 베스트（`adult_exclude=y`） | `isAdultOnly`、類別「성인」、book-api `is_adult_only` | 有（站內搜尋＋book-api） |
| Kakao Page | KR | 웹툰月間排行 | `age_grade >= 19` | 有（站內搜尋） |
| Lezhin | KR | 即時排行（全部＋新作） | 作品頁 `isAdult`（讀不到一律排除） | 無 |

全部都是**網站前端自己在用的接口或頁面資料**，沒有公開文件，對方改版時可能失效（見下方「維護」）。

## 「近期熱門」的定義

1. 先取各平台目前的排行（月排行為主）。
2. 只保留「首次發售」或「最近一次更新」落在 `SINCE_DAYS`（預設 365 天）內的作品。
   改成 `RECENCY=first` 則只保留首次發售在期間內的新作。

## 跨站比價怎麼做

1. 同地區（KR / TW）內，書名正規化（去掉冊數、`[연재]`、`【含電子限定特典】`、`(全)` 等標記）後相同，
   且作者至少一位相同 → 視為同一部作品。書名 6 字以上時，作者寫法不同（日文原名／羅馬拼音）也會合併。
2. 某平台的熱門作品不一定上其他平台的排行，所以會拿書名到同地區其他平台**搜尋**（`LOOKUP_LIMIT`，預設 80 部），
   找到同一部作品就把那邊的售價也列進來。

## 輸出（`data/`）

| 檔案 | 內容 |
|---|---|
| `works-kr.json` / `works-tw.json` | 合併後的作品清單，`offers` 陣列列出各平台售價；`multiStore: true` 的排前面 |
| `dlsite.json` | DLsite がるまに 音聲作品（含官方 KRW、TWD 換算價） |
| `offers/<來源>.json` | 各平台熱門清單的原始整理結果 |
| `lookups/<來源>.json` | 跨站補查找到的作品 |
| `meta.json` | 每個來源最後一次成功／失敗的時間、筆數、錯誤訊息 |

`offers[].price` 的單位：

- `currency`：`KRW`、`TWD`、`JPY`、`COIN`（Lezhin 硬幣）、`TICKET`（Kakao 票券，排行接口沒有金額）
- `unit`：`volume`（單行本）、`episode`（單話）、`work`
- RIDI 另有 `seriesTotal`（整套購買價）、`rentalTotal`（整套租借價）

## 前端網站

`node src/site/build.js` 讀取 `data/` 產生靜態網站到 `public/`：

| 網址 | 內容 |
|---|---|
| `/tw/` | 繁體中文：BOOK☆WALKER、Renta! 的作品（台幣），加上 DLsite 音聲（台幣換算價） |
| `/ko/` | 韓文：RIDI、Kakao Page、Lezhin 的作品（韓元／硬幣／等待免費），加上 DLsite 音聲（韓元換算價） |
| `/` | 依瀏覽器語言自動導向 `/ko/` 或 `/tw/` |

兩個版本的介面文字、平台、幣別完全分開，文字集中在 `src/site/i18n.js`。
功能：平台分頁、「多平台比價」分頁、搜尋、只看特價／免費、排序（熱門、最近更新、折扣、價格），
點作品開啟詳細視窗，列出各平台價格並標示最便宜的平台。卡片在建置時就寫進 HTML，搜尋引擎可以直接收錄。

本機預覽（用 `data/sample/` 的樣本資料，不需連網）：

```bash
npm run preview      # 產生 public/，直接用瀏覽器打開 public/tw/index.html 或 public/ko/index.html
```

## 本機執行

```bash
node src/run.js                          # 全部來源
node src/run.js --only ridi,kakaopage    # 只抓指定來源
node src/run.js --since 180              # 只要半年內
node src/run.js --no-lookup              # 不做跨站補查（比較快）
npm test                                 # 單元測試（不連網）
```

環境變數：`SINCE_DAYS`、`RECENCY`、`MAX_ITEMS`（每來源上限，預設 120）、`LOOKUP_LIMIT`、`DELAY_MS`（同站請求間隔，預設 1000）、`USER_AGENT`、`OUT_DIR`。

## 部署到 GitHub Actions

1. 建立 GitHub repository，把這個資料夾推上去。
2. Settings → Actions → General → Workflow permissions 選「Read and write permissions」。
3. （建議）Settings → Secrets and variables → Actions → Variables 新增
   `CRAWLER_USER_AGENT`，填入含你網站網址或聯絡信箱的 User-Agent。
4. Settings → Pages → Build and deployment 的 Source 選「GitHub Actions」。
5. Actions 分頁 → `crawl` → Run workflow 手動跑第一次，之後每天台灣時間 05:17、17:17 自動抓資料並重新部署網站。
   只修改 `src/site/` 時，push 後會直接用現有資料重建網站，不會重抓。

## 維護

- 某來源失敗或抓到 0 筆時，**不會覆蓋**上一次的資料，錯誤記在 `meta.json`。
- 單元測試在 `test/core.test.js`；`node test/make-browser-bundle.mjs <來源>` 可產生能在該網站頁面 console 執行的測試腳本，用來確認網站改版後解析是否還正常。
- GitHub Actions 的主機在美國。若韓國網站擋海外 IP，可改在台灣／韓國的主機用 cron 執行 `node src/run.js`。

## 注意事項

這些網站都沒有公開 API，條款通常不允許未經同意的自動化存取。上線前請確認各平台的使用條款與 robots.txt，
控制抓取頻率（預設每站每秒最多 1 次），並優先洽談聯盟或合作方案。程式不登入、不繞過驗證或防護機制。
