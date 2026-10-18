# 新來源可行性實測（2026-10-19）

目的：增加能和現有平台**直接比價**的來源（台灣比台幣單本價、韓國比韓元）。
實測方式：只看 robots.txt、公開頁面與前端自己在用的接口；User-Agent 用專案的 `MangaDealsBot`，請求間隔 ≥ 1.2 秒，總共約 15 次請求。遇到驗證或 WAF 就停止，不繞過。

## 結論

| 平台 | 地區 | 結論 | 原因 |
|---|---|---|---|
| 樂天 Kobo（kobo.com/tw） | TW | ❌ 不做 | Cloudflare 機器人驗證：`/tw/zh` 直接回 **403「Challenged」** |
| Readmoo 讀墨（備選） | TW | ❌ 不做 | CloudFront WAF：連 `robots.txt` 和首頁都回 **403 Request blocked** |
| 네이버 시리즈（series.naver.com） | KR | ⚠️ 技術上可行，比價效益低 | 排行＋每話價格＋成人標記都拿得到；但熱門作品大多是 Naver 獨家，和 RIDI／Kakao 幾乎不重疊，而且 robots.txt 禁止搜尋，無法做跨站補查 |

## 樂天 Kobo 台灣

- `robots.txt`：允許 `/tw/zh`；**禁止用書名搜尋**（`Disallow: /*/search?*`），只允許 ISBN 搜尋（`Allow: */search?query=9*`）。
- `GET https://www.kobo.com/tw/zh` → `403`，頁面標題 `Challenged | Kobo.com`（Cloudflare，`cf-ray` …-TPE）。
- 依專案原則不換 User-Agent、不模擬瀏覽器，所以停在這一步。
- 補充：樂天有公開的「楽天Kobo電子書籍検索API」，但就目前所知只涵蓋日本 Kobo（日圓），應該不適用台灣站（這次沒有實測）。

## Readmoo 讀墨

- `GET https://readmoo.com/robots.txt` 與 `https://readmoo.com/` 都是 `403`（`server: CloudFront`、`x-cache: Error from cloudfront`、`Request blocked.`）。
- 整個網域都擋自動化請求，停止。

## 네이버 시리즈

### robots.txt
- `Allow: /`，但**禁止**：`/search`、`/comic/categoryProductList.series`（以及 novel／ebook 的分類清單）、`/my/*`、`/viewer`、`/cart`。
- 排行頁 `/comic/top100List.series`、作品頁 `/comic/detail.series`、集數清單 `/comic/volumeList.series` 都沒有被禁止。

### 熱門清單（HTML）
- `https://series.naver.com/comic/top100List.series?rankingTypeCode=MONTHLY&categoryCode=ALL&page=1..5`
  - `rankingTypeCode`：`HOURLY`／`DAILY`／`WEEKLY`／`MONTHLY`；每頁 20 筆、共 5 頁（TOP100）。
  - `categoryCode`：`ALL` 或類型代碼（88、90、93、99、107…）。
- 每筆 `<ul class="comic_top_lst"> > <li>`：
  - 名次：`.top_num em`
  - 作品編號：`a[href="/comic/detail.series?productNo=…"]`
  - 書名：`.comic_cont h3 a`（獨家作品會帶 `[독점]`，`normalizeTitle` 已經會去掉）
  - 封面：`img[src]`（`?type=m79` 改成較大尺寸即可）
  - 作者：`.author`
  - `총471화/미완결`（總話數／是否完結）、`.free_info`（例：`467화 무료` → `promo.freeEpisodes`）
- 月排行第 1 頁沒有成人縮圖（`thumb/19`），看起來排行本身不含成人作品，但 adapter 仍要逐筆檢查。

### 價格、成人標記、日期（JSON，每部作品 1 次請求）
`GET /comic/volumeList.series?productNo=<id>&sortOrder=DESC&totalCount=<話數>&page=1`
（帶 `Referer: 作品頁`、`X-Requested-With: XMLHttpRequest`）→ `{ resultData: [ …每話… ] }`，每頁 30 話。

| 欄位 | 例 | 對應 `makeOffer` |
|---|---|---|
| `salePrice` / `saleDiscountPrice` / `saleDiscountRate` | 500 / 500 / 0 | `price.regular` / `price.current` / `price.discountRate`（KRW，`unit: 'episode'`，소장） |
| `lendingPrice` / `lendingDiscountPrice` | 300 / 300 | 可放 `price.rental`（대여 3 日） |
| `adultGrade`、`productForAdults`、`highAdultYn`、`seeingGradeTypeCode` | false、false、N、G15 | `rating`：任一為成人（或 `seeingGradeTypeCode` 為 19 級）→ `'adult'` |
| `lastVolumeUpdateDate` | 2026-10-16 22:57:33 | `updatedAt`（KST） |
| `registerDate`、`serviceStartDate` | null | **沒有首次發售日** → `releasedAt` 只能留空 |
| `personNameList` | 이상규 | `authors` |

- 價格單位：1 쿠키＝100 원，`salePrice` 已經是韓元，可以直接跟 RIDI 웹툰 的每話韓元價比較。
- 成人判斷只在 15 세作品上看過欄位，**還沒拿 19 세作品驗證**（排行裡找不到），實作時要再確認。
- 沒有首次發售日：`RECENCY=first` 模式下 Naver 的作品會全部被排除（預設的 `any` 沒問題）。

### 比價效益（實測）
- 月排行前 20 部有 7 部標 `[독점]`（Naver 獨家）。
- 和現有 `data/works-kr.json`（RIDI＋Kakao＋Lezhin，含補查）比對：**0／20 重疊**。
- 抽 3 部非獨家標記的作品（절대회귀、괴력 난신、외모지상주의）到 RIDI 搜尋：**都找不到**同一作品。
- robots.txt 禁止 `/search`，所以也不能反過來拿 RIDI／Kakao 的熱門作品到 Naver 補查。
- 推估：加進來後主要是「熱門排行」頁多了 Naver 的作品，「多平台比價」的作品數不會明顯增加。

### 若要做：工作量
- 請求數：排行 5 頁＋每部 1 次 `volumeList` ≈ 105 次／天兩輪，間隔 1 秒約 2 分鐘。
- 新增 `src/adapters/naver_series.js`（region `KR`，**沒有** `lookup`）＋ `i18n.js` 的平台名稱（`네이버 시리즈`）＋ style.css 平台色＋測試假資料。
- 難度：低到中（HTML 解析排行＋一支 JSON 接口）。

## 建議
1. 台灣：Kobo、Readmoo 都有 WAF，不做。台灣剩下的候選（博客來電子書、Pubu 等）要再實測；Pubu 成人作品比例高，不建議。
2. 韓國：네이버 시리즈 可以做，但定位是「擴充熱門排行」而不是「增加比價」。若目標是比價，優先度低於找一個和 RIDI 重疊多的單行本書店（예스24／알라딘／교보 eBook，待實測）。
