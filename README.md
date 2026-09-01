# booking-king

## 中文

「步經徑」劇本殺預約系統的總覽 repo，透過 git submodule 把前後端掛在一起，方便一次 `clone` 齊全部程式碼。這個 repo 本身**不會被部署**——兩個子系統各自連到自己的 repo 做部署（見下表）。各子系統的技術細節與架構決策，請見各自 repo 的 README。

步經徑同時是這套系統的**展示版與開發環境**。之後每一家合作店家會是「同一份程式碼 + 自己的 Render / Neon / Cloudflare 帳號」，不是另外分支或另一包程式碼。

### 子系統

| 子系統 | Repo | 部署 |
|---|---|---|
| 後端 API | [`booking-king-backend`](https://github.com/beethoreven/booking-king-backend) | Render（`https://booking-king-backend.onrender.com`） |
| 前端網站 | [`booking-king-web`](https://github.com/beethoreven/booking-king-web) | Cloudflare Workers（`https://booking-king-web.beethoreven.workers.dev`） |

資料庫是 Neon Postgres，開在 **ap-southeast-1（Singapore）**，與 Render 同區。這不是效能微調而是前提：姊妹專案 zh-cn-to-tw 實測，兩端跨區時單次查詢 1.76 秒，同區後 0.03 秒，差 59 倍。本專案上線後實測 `/api/ready` 為 0.21 秒，符合同區預期。

### 使用方式

**第一次拿到全部程式碼：**

```bash
git clone --recurse-submodules git@github.com-beethoreven:beethoreven/booking-king.git
```

**已經 clone 過，只是要把子模組抓齊：**

```bash
git submodule update --init --recursive
```

**更新某個子模組到它自己 repo 的最新版本：**

```bash
cd booking-king-backend   # 或 booking-king-web
git pull origin main
cd ..
git add booking-king-backend
git commit -m "Update booking-king-backend submodule pointer"
```

最後這個 `git add` + `commit` 不能省略——沒做的話，子模組本機檔案雖然是新的，但這個 wrapper repo 記錄的「該指向哪個 commit」還是舊的，別人 `clone` 這個 repo 還是會抓到舊版本。

---

### 上線 SOP

★ 上線步驟刻意放在這裡而不是各子系統的 README，因為它**跨越兩邊**：前端網址要填進後端的 `ALLOWED_ORIGINS` 與 Google OAuth，後端網址要填進前端的 `index.html`。這三條交叉引用拆開之後就沒有人能照著做完。

#### Part A. 建立 repo 與推送

三個 repo **都可以設 Private**。前端不需要公開，因為用的是 Cloudflare Workers 而不是 GitHub Pages（GitHub Pages 免費方案只能從公開 repo 發佈，而且一個 repo 只能掛一個自訂網域，多店家會卡住）。

★ GitHub 的 SSH 別名是 **`github.com-beethoreven`**，不是純 `github.com`。用錯會推不上去。

**順序不能反**：先推兩個 submodule，再推 meta。meta 記錄的是 submodule 的 commit，反過來會指向 GitHub 上還不存在的 commit。

```bash
cd booking-king-backend
git remote add origin git@github.com-beethoreven:beethoreven/booking-king-backend.git
git branch -M main && git push -u origin main

cd ../booking-king-web
git remote add origin git@github.com-beethoreven:beethoreven/booking-king-web.git
git branch -M main && git push -u origin main

cd ..
git submodule set-url booking-king-backend git@github.com-beethoreven:beethoreven/booking-king-backend.git
git submodule set-url booking-king-web git@github.com-beethoreven:beethoreven/booking-king-web.git
git add .gitmodules && git commit -m "Point submodules at GitHub"
git remote add origin git@github.com-beethoreven:beethoreven/booking-king.git
git branch -M main && git push -u origin main
```

#### Part B. Neon 資料庫

1. neon.tech → **Create project**
2. **Region 必須選 Singapore（ap-southeast-1）**。★ 建好之後改不了，只能重建專案搬資料。
3. 複製 Connection string 備用。

不需要先建表。後端啟動時 `ensure_schema()` 會自動建齊。

#### Part C. Google OAuth

Google Cloud Console → Credentials → **Create OAuth client ID** → 類型選 **Web application**。

「已授權的 JavaScript 來源」要包含**所有**會用到的網址：

```
http://localhost:5173
http://127.0.0.1:5173
https://booking-king-web.beethoreven.workers.dev
```

★ 結尾**不要**加斜線。
★ 用戶端名稱只是控制台裡的標籤，改名不影響功能。
★ 本機與正式共用**同一個** Client ID。分成兩個的話 `index.html` 只能寫死一個，本機開發每次都得在網址加 `?googleClientId=...`，而忘記加的症狀是「登入按鈕按下去沒反應」——每天都會踩。

#### Part D. Render 後端

**New → Web Service** → 連 GitHub → 選 `booking-king-backend`

| 欄位 | 值 |
|---|---|
| Region | **Singapore** |
| Branch | `main` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `gunicorn --workers 2 --threads 4 --timeout 60 --bind 0.0.0.0:$PORT app:app` |

★ Start Command 必須用 gunicorn，不要用 `python app.py`（那是開發伺服器）。
★ 連線數 = `workers × 連線池 max_size(5)`。2 個 worker 是 10 條，Neon 免費夠用。調高 workers 要一起想這個數字。

#### Part E. Cloudflare 前端

左側 **Compute → Workers & Pages → 右上角「Create application」** → 連 GitHub → 選 `booking-king-web`

★ Cloudflare 已經把 Pages 併進 Workers，所以：
- 畫面標題會寫「Create a **Worker**」，那是對的，**不要去找 Pages**
- 網址是 `https://<專案名>.<帳號>.workers.dev`，**不是** `.pages.dev`
- repo 裡必須有 `wrangler.jsonc`（已經加好了）。沒有它 `npx wrangler deploy` 會失敗，而錯誤訊息是「找不到進入點」，看不出真正原因是缺設定檔

| 欄位 | 值 |
|---|---|
| Project name | `booking-king-web` |
| **Build command** | **留空**（純靜態，沒有建置步驟） |
| Deploy command | `npx wrangler deploy`（預設值） |
| Builds for non-production branches | **取消勾選**（只有一條 main） |
| API token | `Create new token`（讓它自動建） |
| Variable name / value | **留空**（那是給 Worker 程式用的，靜態站不需要） |

#### Part F. 把三邊接起來

拿到兩個網址之後，回頭補三個地方。**少任何一個，登入都會失敗**：

1. **Render** 的 `ALLOWED_ORIGINS` = 前端網址
2. **Google OAuth** 的授權來源加上前端網址
3. **`index.html`** 的 `__BOOKING_KING_API_BASE__` = 後端網址，改完 `git push`，Cloudflare 會自動重新部署

#### Part G. 環境變數總覽（Render）

| 變數 | 必填 | 說明 |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon 連線字串。沒設定的話後端**啟動就失敗**（刻意的，見下方報告） |
| `GOOGLE_CLIENT_ID` | ✅ | 沒設定的話 `/auth/login` 一律回 401 |
| `ALLOWED_ORIGINS` | ✅ | 前端網址，逗號分隔、含 `https://`、**結尾不要斜線** |
| `JOB_TOKEN` | ✅ | 每日排程與 `/internal/idle-gap-stats` 的通行證。沒設定那兩支一律 503 |
| `SESSION_IDLE_DAYS` | ⬜ | 預設 90。session 閒置多久失效（滑動窗口） |
| `AUTH_CACHE_TTL_SECONDS` | ⬜ | 預設 30。停用帳號後最慢這麼久生效 |

產 `JOB_TOKEN`：

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

#### Part H. 驗證

```bash
curl https://booking-king-backend.onrender.com/api/health
```
預期 `{"status":"ok"}`。這支**刻意不碰資料庫**，所以它能分辨「服務掛了」與「資料庫比較慢」。

```bash
curl https://booking-king-backend.onrender.com/api/ready
```
預期 `{"status":"ok","database":"ok"}`。這支會連資料庫。

CORS 是否設對：

```bash
curl -i -X OPTIONS https://booking-king-backend.onrender.com/api/mmg \
  -H "Origin: https://booking-king-web.beethoreven.workers.dev" \
  -H "Access-Control-Request-Method: GET"
```
回應要含 `access-control-allow-origin: https://booking-king-web.beethoreven.workers.dev`。
沒有這一行就是 `ALLOWED_ORIGINS` 填錯，最常見的是結尾多一個斜線。

**瀏覽器端驗證**：打開前端，在主控台執行

```js
fetch(window.__BOOKING_KING_API_BASE__ + '/api/mmg').then(r => r.status)
```

得到 **401 就是對的**——那代表請求成功穿過 CORS 到達後端，只是沒帶登入憑證。
如果得到 `Failed to fetch`，那才是 CORS 被擋。

---

#### Part I. 排程（cron-job.org）

後端有一支每日批次 `POST /api/jobs/daily`，**不會自己跑**——Render 免費方案會讓服務
休眠，睡著的行程裡沒有計時器會醒來，所以觸發必須從外面來。

**一次請求做四件事**（`jobs.py`，各自一個交易，一支失敗不影響其他三支）：

| 步驟 | 做什麼 | 沒跑會怎樣 |
|---|---|---|
| `ended` | 已成立、且場次時間加劇本時長已過 → 標成已結束 | 玩過的場次永遠停在「已成立」 |
| `cancelled` | 日期已過卻還沒走完流程的預約 → 取消 | 待辦愈積愈多，**容量計算會把作廢的組別繼續算進去** |
| `waitlist_expired` | 候補掛超過 3 天、且正選還在 → 取消 | **對玩家的承諾跳票**（介面明寫「候補將於三天後自動失效」） |
| `listing` | 劇本上下架狀態落地 | 只影響管理員看到的欄位；玩家端是每次查詢即時算的 |

回應裡的 `stale_booked` 是健康指標，**正常永遠是 0**。不是 0 就代表漏跑過，
到管理員介面按一次「場次整理」補完（那一版不設回看窗口）。

★ 四件任務**不是四個排程**。排程服務眼中的「一個工作」只是一條「什麼時間、打哪個
網址」的規則，它不知道對面做了什麼。塞進同一次請求是因為每次請求都可能要付一次
冷啟動——拆成四個等於把服務叫醒四次。

##### 冷啟動會撞到逾時（實測）

2026-09-01 對正式環境量到的數字：

| | 耗時 |
|---|---|
| `/api/health` 冷啟動 | **32.4 秒** |
| `/api/health` 醒著 | 0.19 秒 |
| `/api/ready` 醒著（含一次 DB 來回） | 0.26 秒 |

而 cron-job.org 免費方案**等 30 秒就關閉連線**，並且**連續失敗超過 25 次會自動停用
那個工作**。

兩件事合起來是個有日期的陷阱：如果 00:00 打過來時服務是睡的，那一打必定逾時；
每晚一次，大約 **25 天後排程被安靜地關掉**，而每日任務就從此停擺。

★ 逾時的時候不要假設「工作還是有跑完」。請求在 Render 那端被 hold 著等服務啟動，
客戶端提早斷線之後它會不會照送，沒有證據，所以一律當作沒跑。

反過來說，只要服務是醒的，整批 5 個交易在零點幾秒內跑完（一次連線加查詢只要
0.05 秒，同區的效果），離 30 秒差兩個數量級。**所以要解的不是「任務太慢」，
是「別讓它在睡著的時候被打」。**

##### 要設哪幾個工作

依那家店有沒有保活，分兩種。**兩種都是 2 個工作。**

★ 預設走甲。乙是給「刻意決定不保活」的部署用的，那是一個要明講的選擇，
不要因為某個部署是 demo 就自動歸到乙——那個 25 次自動停用的陷阱只在乙會踩到。

**甲、免費方案 + 營業時段保活**（預設）

| | 工作 1：保活 | 工作 2：每日任務 |
|---|---|---|
| URL | `<backend>/api/health` | `<backend>/api/jobs/daily` |
| 方法 | GET | **POST** |
| 排程 | `*/10 * * * *` | `0 0 * * *` |
| 標頭 | 不用 | `X-Job-Token: <JOB_TOKEN>` |

全天候保活，服務永遠是醒的，所以每日任務不會撞冷啟動、也不需要暖機。
額度用量 24 × 31 = **744 / 750 小時**（單一服務就幾乎用滿）。

★ 要省額度就縮窗口，見下方的窗口對照表。步經徑刻意不縮，理由也在下面。

★ 保活**只能打 `/api/health`**。打 `/api/ready` 會連資料庫，等於每 10 分鐘叫醒
Neon 一次，直接把每月 100 CU-hours 燒光。

##### 第三個工作：每週的異常點數遞減

| | 工作 3：每週遞減 |
|---|---|
| URL | `<backend>/api/jobs/weekly` |
| 方法 | **POST** |
| 排程 | `0 8 * * 1`（每週一上午 8 點） |
| 標頭 | `X-Job-Token: <JOB_TOKEN>` |

所有人的異常點數減 1，並把已到期的停權落地。**沒有這一支，累進停權就不能用**
——點數只增不減的話，偶爾誤觸的老客人累積幾年必然被封（見 auth_utils/guard.py）。

★ **時間要挑在保活窗口「之內」。** 這一支漏跑完全沒關係（點數多留一週，下次
補回來），但那不是「可以隨便挑時間」的理由——正好相反：既然什麼時候跑都沒差，
就該挑**最便宜**的時間。排在窗口外會撞 32 秒冷啟動、把服務叫醒多算
instance-hours、還大概率留下一筆逾時的失敗紀錄，而換到的東西是零。

  ★ 這條判準對每一個「漏跑沒關係」的排程都適用：容錯高**不等於**可以隨便排。

##### 驗證

```bash
curl -X POST https://booking-king-backend.onrender.com/api/jobs/weekly \
  -H "X-Job-Token: <你的 JOB_TOKEN>"
```

回 `{"decayed_users": N}`，N 是這次有幾個人被減點。重跑安全：多跑一次只是多減
一點，不會壞。

★ **750 小時是整個 workspace 共用的，不是這個服務的。** 階層是
workspace → project → environment → service，額度和帳單都在最上層——分成不同的
project **不會**各自拿到一份額度。所以窗口要先扣掉同一個帳號裡其他服務的用量。

要看的是 <https://dashboard.render.com/billing> 的 **Monthly Included Usage** 區塊，
那裡的 `Free Instance Hours　X / 750 hours` 就是這個帳，頁面上直接寫著
「This applies to the entire workspace」。

★ **不要看發票判斷額度。** 發票上 `Free　$0.0000/hr　744　$0.00` 那一列，`Free` 是
**方案名稱**、`$0.0000/hr` 是 Free 方案的費率，整列講的是「跑了 744 小時、費率 $0、
所以 $0」——跟 750 額度無關。對照 Pipeline Minutes 那一段就看得出差別：那裡有一條
明確的 `Free minutes -82` 扣抵列，instance hours 沒有。

先把別的服務吃掉多少查出來，再回頭決定窗口：

| 窗口 | cron | 本服務用量 |
|---|---|---|
| 06:00–02:00（20 小時） | `*/10 6-23,0-1 * * *` | 620 |
| 09:00–01:00（16 小時） | `*/10 9-23,0 * * *` | 496 |
| 12:00–01:00（13 小時） | `*/10 12-23,0 * * *` | 403 |

三個都把 00:00 包在裡面，所以都不需要暖機工作。**留至少 100 小時餘裕**——
超過額度不是降速，是整個 workspace 的免費服務一起停用到下個月，而 Render
**不保證會事先通知**（文件裡沒有提到這種通知）。

★ 實例：2026-08 這個帳號的三個服務分別跑了 `fireless-war-backend` 744 小時
（整月一秒沒睡）、`zh-cn-to-tw-backend` 616 小時、`booking-king-backend` 20 小時，
合計 **1,380 小時**。窗口再怎麼調都救不了這種量級——步經徑那 496 或 620 的差別，
在這個倍數面前沒有意義，真正該處理的是那兩個服務。

★ **未解的觀察，不要當成保證。** 上面那 1,380 小時是 750 的 1.8 倍，而那個月
**既沒有被收費、也沒有被停用**。文件說會停用、Billing 頁說會收費，實際兩件都沒發生。
這只能說明那一次沒有被執行，不能推論成以後不會。用 Monthly Included Usage 那個
計量器持續看，不要靠推論。

★ **步經徑取全天候保活（744），案主的決定。** 明知整個 workspace 早就超標而仍然
照設，理由是這個 Render 帳號在他自己手上、代價可控，而**沒有真的爆過一次，就不會
知道爆的時候實際發生什麼**——是停用、是收費、有沒有預警。文件與 Billing 頁講的
後果不一致，八月的實測又跟兩者都不符；與其繼續推論，不如讓它撞一次把行為量出來。
這是刻意的取捨，不是漏看。

★ **這個結構是這個帳號特有的，不會延續下去。** 目前三個不相干的專案擠在同一個
workspace，是歷史累積的結果。從第二家店開始，每家店自己一個 Google 帳號、自己一個
workspace，那時一個 workspace 只跑一個服務，上面的共用問題不存在。

★ **一個被否證掉的假設，記在這裡是為了不要有人再走一次。**
曾經懷疑 `instance-hours` 量的是「instance **存在**多久」而不是「進程**醒著**多久」，
因為 2026-08 的三個數字都能用「從建立日算到月底」湊出來（744.00 剛好是整月、
20.02 對應首次部署的 20.5 小時前、616.29 往回推是 08/06）。

**那是曲線擬合，不是證據**——三個服務、三個未知的建立日期，任何「從某日起算」的
模型都必然湊得出來。真正的檢驗是計量器的**爬升速率**，而它不通過：兩次讀數之間
只增加 0.56 小時（1.72 → 2.28），若三個服務各自持續計時，那代表中間只過了 11 分鐘，
與實際相差很遠。

★ **那個觀察做完了，2026-09-01：計量器量的就是真實運行時間。**

| 時間 | Free Instance Hours |
|---|---|
| 18:42 | 4.42 |
| 21:18 | 7.03 |

經過 2.60 小時，計量器增加 2.61 小時——**速率剛好 1.00**。「instance 存在就計時」
會是 3 個服務 × 2.60 = 7.8，差很遠。而 1.00 而不是接近 0，代表當下**只有一個服務
在持續累計**，那正是唯一有 24/7 保活的 booking-king。

★ **所以計量器與發票是同一套帳**，先前以為的「差三個數量級」是誤判——那只是量
測當下三個服務裡有兩個在睡。八月就是真的跑了 1,380 小時、真的超過 750，而**那個
上限就是沒有被執行**。

★ 剩下唯一沒解釋的是 fireless-war：如果計量器量的是真實運行時間，744 小時就代表
它整月沒睡，而它的 Render log 顯示間隔動輒 3~8 小時。兩者只能有一個對。下一步是
確認**那份 log 是不是完整的**（是不是只 grep 了某一支端點），而不是再去猜計費邏輯。

**乙、不保活**（沒有壓秒需求、慢一分鐘無所謂的部署）

| | 工作 1：暖機 | 工作 2：每日任務 |
|---|---|---|
| URL | `<backend>/api/health` | `<backend>/api/jobs/daily` |
| 方法 | GET | **POST** |
| 排程 | `50,55 23 * * *` | `0 0 * * *` |
| 標頭 | 不用 | `X-Job-Token: <JOB_TOKEN>` |

★ **暖機故意打兩次，這是為了避開那個 25 次的自動停用。** 23:50 那一打會付冷啟動、
大概率逾時被記成失敗；23:55 那一打服務已經醒了，一定成功——同一個工作只要有成功，
連續失敗數就歸零，永遠累積不到 25。單打一次的話，那個工作會在一個月內被關掉。

★ 服務閒置 15 分鐘才睡，23:55 到 00:00 只有 5 分鐘，所以每日任務打過來時還醒著。

**丙、付費方案（Starter 以上）** —— 服務不休眠，沒有冷啟動也不需要保活，
**只要工作 2 一個**。

##### cron-job.org 上實際怎麼填

1. 註冊並登入 <https://cron-job.org>（免費，工作數不限）
2. **Create cronjob**
3. **Title** 填得認得出是哪家店，例如 `步經徑 · 每日任務`
4. **URL** 填上表的網址
5. **Schedule** 切到 expert mode，貼上表裡的 cron 字串
6. 展開 **Advanced**：
   - **Request method** 改成 `POST`（每日任務才要；保活／暖機維持 GET）
   - **Headers** 新增一列：名稱 `X-Job-Token`，值是 Render 上那個 `JOB_TOKEN`
   - 開啟失敗通知，寄到你的信箱
7. 存檔，然後從工作的詳情／編輯頁跑一次手動執行，展開執行紀錄看回應

★ **手動執行要在第一次排程觸發之前做完**，而且它跟下面的 curl 驗的**不是同一件事**：
curl 驗的是「token 本身對不對」，手動執行驗的是「**你在介面上填的 header 有沒有
真的送出去**」。header 名稱打錯、值前後多一個空白、method 忘了改成 POST——這三種
curl 一個都測不出來，只會在第一次排程執行時失敗，而排程只會告訴你「失敗」。

`JOB_TOKEN` 的產生方式見 Part G。**這個值要跟 Render 環境變數裡的完全一致**，
不一致的話這支回 401，而排程只會告訴你「失敗」，不會告訴你是 token 錯了——
所以下一步的手動驗證不要跳過。

##### 驗證

```bash
curl -X POST https://booking-king-backend.onrender.com/api/jobs/daily \
  -H "X-Job-Token: <你的 JOB_TOKEN>"
```

預期拿到各步驟的筆數，例如：

```json
{"ended": 0, "cancelled": 0, "waitlist_expired": 0, "listing": 0, "stale_booked": 0}
```

- 回 **401** → token 不對
- 回 **503** → Render 上根本沒設 `JOB_TOKEN`
- `stale_booked` **不是 0** → 過去漏跑過，到管理員介面按「場次整理」補完

★ 這支**重跑安全**：每一支都是「把符合條件的列改成某個狀態」，改完就不再符合條件，
所以手動測、排程重試、按兩次「場次整理」，結果都一樣。

##### 集中還是分開

排程可以**全部設在同一個 cron-job.org 帳號**，即使各店的 Render／Neon 是分開的。
理由是它不是那家店的基礎設施，是一個打電話的人：它不存任何店家資料，只存網址和
`JOB_TOKEN`；而那個 token 保護的兩支端點都只動「已經過去」的資料且重跑安全，
提早被觸發做的事跟 00:00 自己跑完全一樣。

★ 這個結論**取決於 `JOB_TOKEN` 後面掛什麼**。哪天在同一個 token 後面加了有破壞性的
端點，集中的風險評估就要重算。

★ 快取（Redis）**不能比照辦理**，它存的是店家資料，必須跟著店家走。

---

### 上線過程中修正的問題

這一節記錄實際部署時才浮現、而本機測試不可能發現的問題。

#### gunicorn 多 worker 讓後端完全起不來

`ensure_schema()` 用 `threading.Lock` 加一個模組層級旗標保護，確保「建表與補欄位只跑一次」。那對執行緒是正確的，**對行程完全無效**。

正式環境用 `gunicorn --workers 2`，那是兩個**獨立的行程**。兩個同時進入 `ensure_schema()`、同時對同一張表下 `ALTER TABLE`、互相搶 `AccessExclusiveLock` 而死結。實測結果：

```
psycopg.errors.DeadlockDetected: deadlock detected
DETAIL: Process 1116 waits for AccessExclusiveLock on relation 237625;
        blocked by process 1115.
[ERROR] Worker (pid:20987) exited with code 3
[ERROR] Reason: Worker failed to boot.
```

**服務根本不會啟動。** 而這在整個專案的歷史中都是隱形的，因為所有測試都跑在 `python app.py`（單一行程）。

修法是在原本那把鎖裡面再加一把**跨行程**的鎖：

```sql
SELECT pg_advisory_xact_lock(hashtext('booking-king:ensure_schema'))
```

advisory lock 是交易層級的，呼叫端 commit 時自動釋放，就算行程中途死掉也會放。第二個 worker 會擋在這一行，等第一個建完才進去，然後發現該有的都有了——那一段本來就是冪等的。以 `--workers 4` 重測：四個 worker 全部啟動、0 個死結、12 個併發 `/api/ready` 全部 200。

★ **冪等的 DDL 不是保護**。`CREATE TABLE IF NOT EXISTS` 的存在檢查與後面的 `ALTER` 是兩道分開的語句，中間就是競態；而型別變更、約束的 drop/add 每次開機都會無條件執行，照樣拿獨占鎖。

#### Cloudflare 把 Pages 併進 Workers 了

原本的計畫是用 Cloudflare Pages。實際操作發現介面已經改版：

- Pages 收進左側 **Compute** 底下，不再是頂層項目
- 按鈕叫 **Create application**，不是「Create → Pages」
- 建立流程的標題是「Create a **Worker**」，部署指令是 `npx wrangler deploy`
- 網址是 `*.workers.dev`，不是 `*.pages.dev`

因此 repo 裡必須有 `wrangler.jsonc` 告訴它「這是一個只有靜態檔的站」。沒有它會失敗，而錯誤訊息指向「找不到進入點」，不會說是缺設定檔。設定裡**刻意沒有 `main` 欄位**——那是 Worker 程式的進入點，純靜態站沒有。

#### CORS 從「放行全部」改成白名單

原本是 `CORS(app, max_age=3600)`，允許任何來源。改成讀 `ALLOWED_ORIGINS`。

★ **沒設定時刻意放行全部並印一行警告**，而不是全擋。失敗關閉的話，本機開發與手動測試會在毫無提示的情況下壞掉，而症狀只是瀏覽器主控台的 CORS 錯誤——那是最難從畫面追回原因的一種失敗。

誠實的評估：這個改動在本系統實際擋掉的風險**很小**。CORS 主要防的是「瀏覽器自動附上你的登入憑證」，那是 cookie 的行為；本系統的憑證存在 `localStorage`、由前端明確帶上，惡意網站讀不到。而且 **CORS 擋不住請求抵達伺服器**，只擋呼叫方讀取回應——它不是防濫用的手段，那是速率限制在做的事。保留它的理由是零成本、將來若改用 cookie 會立刻變重要、而且「開放給全世界」在資安檢查時是要解釋的。

---

### 之後每加一家店

程式碼**不動**。新開一組屬於那家店的帳號與服務：

1. 那家店自己的 Google 帳號 → 自己的 Neon project（Singapore）
2. 自己的 Render service，**指向同一個 repo、同一條 `main`**，只有環境變數不同
3. 自己的 Cloudflare 專案，掛自己的網域
4. 到 cron-job.org 加那家店的排程（見 Part I）——**這一步很容易漏，漏了不會有任何錯誤訊息**，只會讓場次狀態慢慢失準、候補永遠不過期

★ 排程可以全部設在同一個 cron-job.org 帳號，不必跟著店家分（理由見 Part I）。快取不行。
★ 不同帳號 = 各自一份免費額度（Render 750 instance-hours、Neon 100 CU-hours 都是各自算）。
★ **先推步經徑，確認沒問題再推其他店。** Render 可以逐個 service 關掉自動部署。一份程式碼的代價就是一次壞發布會打到所有店，這個流程是用來擋它的。
★ 配色與圖片的客製空間已經留好：`style.css` 的 `:root` 是一組設計 token，換配色是覆寫變數而不是改程式；`brand-mark.png` 與 `favicon.png` 是換檔。

### 已知限制

- **Render 免費方案閒置 15 分鐘會休眠**，冷啟動**實測 32.4 秒**（2026-09-01 對正式環境量的）。保活要打 `/api/health`（不碰資料庫），**絕對不要打 `/api/ready`**——那會喚醒 Neon 燒掉 100 CU-hours 額度。而且不要全天候：24/7 會用掉 744/750 小時，只剩 6 小時餘裕，而超過的懲罰是整個 workspace 的免費服務停用到下個月。定案是 06:00–02:00（620/750）。設定見 Part I。
- **每月 Neon CU-hours 用量取決於「營業時段內最長無人存取間隔」有沒有超過 5 分鐘**。已埋量測：`GET /internal/idle-gap-stats`（需 `X-Job-Token`）。
- **自訂網域需要自備網域**。Cloudflare 端不收費且不限數量，網域本身要向註冊商購買。

---

## English

The project-overview repo for **BuJingJing** (步經徑), a booking system for script-murder game venues, wiring its frontend and backend together via git submodules so the whole codebase can be pulled with a single `clone`. This repo itself **is never deployed** — each subsystem connects to its own repo for deployment (see the table below). For technical details and architecture decisions, see each subsystem's own README.

BuJingJing doubles as the **demo and development environment** for this system. Each partner venue added later gets *the same code* plus its own Render / Neon / Cloudflare accounts — not a branch, and not a separate copy of the code.

### Subsystems

| Subsystem | Repo | Deployment |
|---|---|---|
| Backend API | [`booking-king-backend`](https://github.com/beethoreven/booking-king-backend) | Render (`https://booking-king-backend.onrender.com`) |
| Frontend | [`booking-king-web`](https://github.com/beethoreven/booking-king-web) | Cloudflare Workers (`https://booking-king-web.beethoreven.workers.dev`) |

The database is Neon Postgres in **ap-southeast-1 (Singapore)**, the same region as Render. This is a precondition rather than a performance tweak: measured on the sister project zh-cn-to-tw, a single query cost 1.76 s cross-region and 0.03 s same-region — a factor of 59. Measured here after deployment, `/api/ready` returns in 0.21 s, consistent with same-region.

### Usage

**First time cloning everything:**

```bash
git clone --recurse-submodules git@github.com-beethoreven:beethoreven/booking-king.git
```

**Already cloned, just need the submodules:**

```bash
git submodule update --init --recursive
```

**Updating a submodule to the latest commit on its own repo:**

```bash
cd booking-king-backend   # or booking-king-web
git pull origin main
cd ..
git add booking-king-backend
git commit -m "Update booking-king-backend submodule pointer"
```

That final `git add` + `commit` cannot be skipped — without it the submodule's local files are current but the pointer this wrapper repo records still refers to the old commit, so anyone cloning this repo still gets the old version.

---

### Setup Guide

★ The deployment steps live here rather than in each subsystem's README because they **span both sides**: the frontend URL goes into the backend's `ALLOWED_ORIGINS` and into Google OAuth, while the backend URL goes into the frontend's `index.html`. Split those three cross-references apart and nobody can follow the procedure end to end.

#### Part A. Create the repos and push

All three repos **can be Private**. The frontend does not need to be public because it uses Cloudflare Workers rather than GitHub Pages (GitHub Pages on the free plan publishes only from public repos, and allows one custom domain per repo — which would block the multi-venue plan).

★ The GitHub SSH alias is **`github.com-beethoreven`**, not plain `github.com`. The wrong one will fail to authenticate.

**Order matters**: push both submodules first, then the meta repo. The meta repo records submodule commits; reversed, it would point at commits that do not exist on GitHub yet.

```bash
cd booking-king-backend
git remote add origin git@github.com-beethoreven:beethoreven/booking-king-backend.git
git branch -M main && git push -u origin main

cd ../booking-king-web
git remote add origin git@github.com-beethoreven:beethoreven/booking-king-web.git
git branch -M main && git push -u origin main

cd ..
git submodule set-url booking-king-backend git@github.com-beethoreven:beethoreven/booking-king-backend.git
git submodule set-url booking-king-web git@github.com-beethoreven:beethoreven/booking-king-web.git
git add .gitmodules && git commit -m "Point submodules at GitHub"
git remote add origin git@github.com-beethoreven:beethoreven/booking-king.git
git branch -M main && git push -u origin main
```

#### Part B. Neon database

1. neon.tech → **Create project**
2. **Region must be Singapore (ap-southeast-1)**. ★ This cannot be changed afterwards; the only path is a new project and a data migration.
3. Copy the connection string for later.

No need to create tables first. `ensure_schema()` builds everything on backend startup.

#### Part C. Google OAuth

Google Cloud Console → Credentials → **Create OAuth client ID** → type **Web application**.

"Authorized JavaScript origins" must include **every** URL that will be used:

```
http://localhost:5173
http://127.0.0.1:5173
https://booking-king-web.beethoreven.workers.dev
```

★ **No** trailing slash.
★ The client name is only a console label; renaming does not affect behaviour.
★ Local and production share **one** Client ID. With two, `index.html` can only hardcode one of them, so local development would need `?googleClientId=...` on every visit — and forgetting it presents as "the login button does nothing", which you would hit daily.

#### Part D. Render backend

**New → Web Service** → connect GitHub → pick `booking-king-backend`

| Field | Value |
|---|---|
| Region | **Singapore** |
| Branch | `main` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `gunicorn --workers 2 --threads 4 --timeout 60 --bind 0.0.0.0:$PORT app:app` |

★ The start command must use gunicorn, not `python app.py` (that is the development server).
★ Connections = `workers × pool max_size (5)`. Two workers is ten, which the Neon free plan handles. Raising the worker count means revisiting that number.

#### Part E. Cloudflare frontend

Left sidebar **Compute → Workers & Pages → "Create application"** (top right) → connect GitHub → pick `booking-king-web`

★ Cloudflare has folded Pages into Workers, so:
- The screen is titled "Create a **Worker**" — that is correct, **do not go looking for Pages**
- The URL is `https://<project>.<account>.workers.dev`, **not** `.pages.dev`
- The repo must contain `wrangler.jsonc` (already added). Without it `npx wrangler deploy` fails, and the error points at a missing entry point rather than at the missing config

| Field | Value |
|---|---|
| Project name | `booking-king-web` |
| **Build command** | **Leave empty** (static site, no build step) |
| Deploy command | `npx wrangler deploy` (default) |
| Builds for non-production branches | **Uncheck** (there is only `main`) |
| API token | `Create new token` (let it generate one) |
| Variable name / value | **Leave empty** (those are for Worker code; a static site needs none) |

#### Part F. Wire the three sides together

Once both URLs exist, go back and fill in three places. **Miss any one and login fails**:

1. **Render**'s `ALLOWED_ORIGINS` = the frontend URL
2. **Google OAuth** authorized origins gains the frontend URL
3. **`index.html`**'s `__BOOKING_KING_API_BASE__` = the backend URL, then `git push`; Cloudflare redeploys automatically

#### Part G. Environment variables (Render)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon connection string. Missing means the backend **fails to start** — deliberately, see the report below |
| `GOOGLE_CLIENT_ID` | ✅ | Missing means `/auth/login` always returns 401 |
| `ALLOWED_ORIGINS` | ✅ | Frontend URL; comma-separated, include `https://`, **no trailing slash** |
| `JOB_TOKEN` | ✅ | Credential for the daily job and `/internal/idle-gap-stats`. Unset means both return 503 |
| `SESSION_IDLE_DAYS` | ⬜ | Default 90. Idle window before a session expires (sliding) |
| `AUTH_CACHE_TTL_SECONDS` | ⬜ | Default 30. Longest delay before a deactivation takes effect |

Generate `JOB_TOKEN`:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

#### Part H. Verification

```bash
curl https://booking-king-backend.onrender.com/api/health
```
Expect `{"status":"ok"}`. This endpoint **deliberately never touches the database**, so it can distinguish "the service is down" from "the database is slow".

```bash
curl https://booking-king-backend.onrender.com/api/ready
```
Expect `{"status":"ok","database":"ok"}`. This one does hit the database.

Whether CORS is right:

```bash
curl -i -X OPTIONS https://booking-king-backend.onrender.com/api/mmg \
  -H "Origin: https://booking-king-web.beethoreven.workers.dev" \
  -H "Access-Control-Request-Method: GET"
```
The response must contain `access-control-allow-origin: https://booking-king-web.beethoreven.workers.dev`.
Its absence means `ALLOWED_ORIGINS` is wrong — most often a trailing slash.

**From the browser**: open the frontend and run in the console

```js
fetch(window.__BOOKING_KING_API_BASE__ + '/api/mmg').then(r => r.status)
```

**401 is the correct result** — it means the request cleared CORS and reached the backend, carrying no credentials. `Failed to fetch` is what a CORS block looks like.

---

#### Part I. Scheduling (cron-job.org)

The backend has a daily batch at `POST /api/jobs/daily` that **does not run itself** — a
free Render service spins down when idle, and a sleeping process has no timer that will
wake up. The trigger has to come from outside.

**One request, four tasks** (`jobs.py`, each in its own transaction, so one failing does
not take the other three down):

| Step | What it does | If it never runs |
|---|---|---|
| `ended` | Confirmed sessions whose time plus the script's duration has passed → mark ended | Sessions already played stay "confirmed" forever |
| `cancelled` | Bookings whose date has passed without completing the flow → cancel | The to-do list keeps growing, and **capacity still counts groups that are long void** |
| `waitlist_expired` | Waitlist entries older than 3 days where the booked group still stands → cancel | **A promise to players is broken** — the UI says a waitlist entry expires after three days |
| `listing` | Persist the listed/delisted status onto the column | Only affects what an admin sees; the player side computes it live on every query |

`stale_booked` in the response is a health signal and is **always 0** in normal operation.
Anything else means a run was missed — press "場次整理" in the admin UI once to catch up
(that version applies no lookback window).

★ Four tasks is **not four schedules**. A "job" to a scheduler is only a rule saying
"at this time, call this URL"; it has no idea what happens at the other end. They share
one request because every request may have to pay a cold start — four jobs would wake the
service four times.

##### Cold start collides with the timeout (measured)

Measured against production on 2026-09-01:

| | Time |
|---|---|
| `/api/health`, cold | **32.4 s** |
| `/api/health`, warm | 0.19 s |
| `/api/ready`, warm (includes one DB round trip) | 0.26 s |

cron-job.org's free plan **closes the connection after 30 seconds**, and **deactivates a
job once it fails more than 25 times in a row**.

Together those are a trap with a date on it: if the service is asleep when 00:00 comes
around, that call always times out — once a night, so roughly **25 days later the schedule
is quietly switched off**, and the daily batch stops happening at all.

★ On a timeout, do not assume the work still completed. Render holds the request while the
service spins up, and there is no evidence about whether it still forwards it once the
client has hung up — so treat it as not having run.

The other way round: while the service is awake the whole batch of 5 transactions finishes
in a fraction of a second (one connection plus query costs 0.05 s — that is what
same-region buys), two orders of magnitude clear of the timeout. **So the thing to fix is
not "the task is slow", it is "don't call it while it is asleep".**

##### Which jobs to create

Two shapes, depending on whether that venue is kept alive. **Both are 2 jobs.**

★ A is the default. B is for a deployment that has *deliberately* decided against
keep-alive — an explicit choice, not something a deployment falls into for being a demo.
The 25-failure deactivation trap only applies to B.

**A. Free plan with business-hours keep-alive** (the default)

| | Job 1: keep-alive | Job 2: daily batch |
|---|---|---|
| URL | `<backend>/api/health` | `<backend>/api/jobs/daily` |
| Method | GET | **POST** |
| Schedule | `*/10 * * * *` | `0 0 * * *` |
| Header | none | `X-Job-Token: <JOB_TOKEN>` |

Round-the-clock, so the service is always awake: the daily batch never meets a cold start
and no warm-up is needed. Quota use is 24 × 31 = **744 / 750 hours** — one service very
nearly exhausts the allowance on its own.

★ To conserve quota, narrow the window using the table below. 步經徑 deliberately does not;
the reasoning follows.

★ Keep-alive **must hit `/api/health`**. `/api/ready` touches the database, which would
wake Neon every 10 minutes and burn the whole 100 CU-hours monthly allowance.

##### A third job: the weekly abuse-point decay

| | Job 3: weekly decay |
|---|---|
| URL | `<backend>/api/jobs/weekly` |
| Method | **POST** |
| Schedule | `0 8 * * 1` (Mondays, 08:00) |
| Header | `X-Job-Token: <JOB_TOKEN>` |

Drops everyone's abuse points by one and lands expired suspensions. **Escalating
suspension does not work without it** — points only ever rise, so a long-standing
customer who misfires occasionally is eventually banned (see auth_utils/guard.py).

★ **Schedule it inside the keep-alive window.** Missing a run costs nothing here
(points stay a week longer and the next run catches up), but that is not a licence to
pick any time — the opposite: precisely because the timing does not matter, pick the
*cheapest* time. Outside the window it meets a 32-second cold start, wakes the service
for extra instance-hours, and most likely records a timeout, in exchange for nothing.

  ★ The rule generalises to every schedule whose runs are optional: tolerant of being
  missed is **not** the same as free to place anywhere.

##### Verification

```bash
curl -X POST https://booking-king-backend.onrender.com/api/jobs/weekly \
  -H "X-Job-Token: <your JOB_TOKEN>"
```

Expect `{"decayed_users": N}`, N being how many accounts lost a point. Safe to re-run:
running twice just decays one more point.

★ **The 750 hours belong to the whole workspace, not to this service.** The hierarchy is
workspace → project → environment → service, and both quota and billing sit at the top —
splitting services into separate projects does **not** give each one its own allowance. So
the window has to be chosen after subtracting whatever else in that account is running.

The number to read is on <https://dashboard.render.com/billing>, in the
**Monthly Included Usage** section: `Free Instance Hours  X / 750 hours`. The page itself
says "This applies to the entire workspace".

★ **Do not read the allowance off an invoice.** On an invoice, the line
`Free  $0.0000/hr  744  $0.00` means the service ran 744 hours on the **Free instance
type**, whose rate is $0/hr, so it cost $0 — it says nothing about the 750. Compare the
Pipeline Minutes section, which does show an explicit `Free minutes -82` credit line;
instance hours have no such line.

Find out what the other services consume, then pick the window:

| Window | cron | This service's usage |
|---|---|---|
| 06:00–02:00 (20 h) | `*/10 6-23,0-1 * * *` | 620 |
| 09:00–01:00 (16 h) | `*/10 9-23,0 * * *` | 496 |
| 12:00–01:00 (13 h) | `*/10 12-23,0 * * *` | 403 |

All three contain 00:00, so none of them needs a warm-up job. **Leave at least 100 hours of
margin** — going over does not throttle anything, it suspends every free service in the
workspace until the next month, and Render **does not promise a warning first** (no such
notification is mentioned in the docs).

★ A worked example: in 2026-08 this account's three services ran
`fireless-war-backend` for 744 hours (awake every hour of the month),
`zh-cn-to-tw-backend` for 616, and `booking-king-backend` for 20 — **1,380 hours** in
total. No choice of window rescues a workspace at that scale: the difference between 496
and 620 is noise against that multiple, and the other two services are the real problem.

★ **An unexplained observation — do not treat it as a guarantee.** Those 1,380 hours are
1.8× the 750 allowance, and that month brought **neither a charge nor a suspension**. The
docs say suspension, the Billing page says charges, and neither happened. That says the
limit went unenforced once; it does not say it always will. Watch the Monthly Included
Usage meter rather than reasoning about it.

★ **步經徑 runs round-the-clock (744) — the owner's call.** Setting it knowing the
workspace is already far over the allowance is deliberate: this Render account is his own, so
the downside is bounded, and **until it actually blows up once nobody knows what blowing up
looks like** — suspension, a charge, whether there is any warning. The docs and the Billing
page describe different consequences, and August matched neither; rather than keep reasoning
about it, let it hit the wall once and measure the behaviour. A considered trade-off, not an
oversight.

★ **This arrangement is peculiar to this account and does not carry forward.** Three
unrelated projects currently share one workspace, which is an accident of history. From the
second venue onward each gets its own Google account and therefore its own workspace, where
a workspace runs a single service and the sharing problem above does not arise.

★ **A hypothesis that was disproved — recorded so nobody walks it again.**
It was briefly suspected that `instance-hours` counts how long an instance **exists** rather
than how long the process is **awake**, because all three August figures could be produced by
"from creation date to end of month" (744.00 is exactly a full month, 20.02 lands 20.5 hours
before it ends which is when that service first deployed, and 616.29 works back to 08/06).

**That was curve-fitting, not evidence** — three services with three unknown creation dates
will fit any "counting from some date" model. The real test is how fast the meter climbs, and
it fails: two readings differed by 0.56 hours (1.72 → 2.28), which under three
always-counting services would mean only 11 minutes had passed. Far more than that had.

★ **That observation was made on 2026-09-01: the meter counts real running time.**

| Clock | Free Instance Hours |
|---|---|
| 18:42 | 4.42 |
| 21:18 | 7.03 |

2.60 hours elapsed, 2.61 hours gained — a rate of exactly **1.00**. Counting mere existence
would have given 3 services × 2.60 = 7.8. And 1.00 rather than near zero means exactly one
service was accruing: booking-king, the only one with round-the-clock keep-alive.

★ **So the meter and the invoice are the same ledger.** The "three orders of magnitude"
apart was a misreading — two of the three services simply happened to be asleep when the
meter was read. August really did run 1,380 hours, really did exceed 750, and the limit
simply **went unenforced**.

★ The one thing still unexplained is fireless-war: if the meter counts real running time,
744 hours means it never slept all month, while its Render log shows gaps of 3 to 8 hours.
Only one of those can be right. The next step is establishing whether that log was complete
(or filtered to a single endpoint), not guessing further at billing logic.

**B. No keep-alive** (a deployment with no to-the-second releases, where a one-minute wait is fine)

| | Job 1: warm-up | Job 2: daily batch |
|---|---|---|
| URL | `<backend>/api/health` | `<backend>/api/jobs/daily` |
| Method | GET | **POST** |
| Schedule | `50,55 23 * * *` | `0 0 * * *` |
| Header | none | `X-Job-Token: <JOB_TOKEN>` |

★ **The warm-up deliberately fires twice, to dodge that 25-failure deactivation.** The
23:50 call pays the cold start and will most likely time out and be recorded as a failure;
the 23:55 call finds the service awake and succeeds — and one success resets the streak, so
it can never reach 25. Fire it once only and the job gets switched off within a month.

★ A service sleeps after 15 idle minutes, and 23:55 to 00:00 is only 5, so it is still
awake when the daily batch arrives.

**C. Paid plan (Starter and above)** — the service never sleeps, so there is no cold start
and no keep-alive: **job 2 alone is enough**.

##### What to fill in on cron-job.org

1. Register and sign in at <https://cron-job.org> (free, no limit on the number of jobs)
2. **Create cronjob**
3. **Title** — make the venue recognisable, e.g. `步經徑 · daily batch`
4. **URL** — from the table above
5. **Schedule** — switch to expert mode and paste the cron string from the table
6. Expand **Advanced**:
   - **Request method** → `POST` (daily batch only; keep-alive and warm-up stay GET)
   - **Headers** → add `X-Job-Token` with the `JOB_TOKEN` value from Render
   - Turn on failure notifications to your email
7. Save, then trigger a manual run from the job's detail/edit page and open the execution
   history to read the response

★ **Do the manual run before the first scheduled execution**, and note it does **not** test
the same thing as the curl below: curl checks that the token itself is right, while a manual
run checks that **the header you typed into the UI is actually being sent**. A misspelt
header name, a stray space around the value, a method left as GET — curl catches none of
those. They surface on the first scheduled run, and the scheduler only reports "failed".

`JOB_TOKEN` is generated in Part G. **It must match the Render environment variable
exactly** — a mismatch returns 401, and the scheduler will only tell you "failed", not that
the token was wrong. Which is why the manual check below is not optional.

##### Verification

```bash
curl -X POST https://booking-king-backend.onrender.com/api/jobs/daily \
  -H "X-Job-Token: <your JOB_TOKEN>"
```

Expect a count per step:

```json
{"ended": 0, "cancelled": 0, "waitlist_expired": 0, "listing": 0, "stale_booked": 0}
```

- **401** → wrong token
- **503** → `JOB_TOKEN` is not set on Render at all
- `stale_booked` **not 0** → runs were missed; press "場次整理" in the admin UI to catch up

★ The endpoint is **safe to re-run**: every step moves rows matching a condition into a
state that no longer matches it, so a manual test, a scheduler retry, and pressing
"場次整理" twice all produce the same result.

##### Centralised or per-venue

Schedules can all live in **one cron-job.org account**, even when each venue's Render and
Neon are separate. The scheduler is not that venue's infrastructure — it is a caller: it
stores no venue data, only URLs and a `JOB_TOKEN`, and the two endpoints that token
protects both act solely on data already in the past and are safe to re-run, so triggering
one early does exactly what 00:00 would have done anyway.

★ That conclusion **depends on what sits behind `JOB_TOKEN`**. Put anything destructive
behind the same token and the centralisation trade-off has to be re-evaluated.

★ The cache (Redis) **does not get the same treatment** — it holds venue data, so it stays
with the venue.

---

### Problems found during deployment

This section records issues that only surfaced against real hosting and could not have been found locally.

#### Multiple gunicorn workers stopped the backend booting at all

`ensure_schema()` was guarded by a `threading.Lock` and a module-level flag, so that table creation and column backfill run exactly once. That is correct for threads and **useless across processes**.

Production runs `gunicorn --workers 2`, which is two **separate processes**. Both entered `ensure_schema()`, both issued `ALTER TABLE` against the same relation, and they deadlocked against each other over `AccessExclusiveLock`:

```
psycopg.errors.DeadlockDetected: deadlock detected
DETAIL: Process 1116 waits for AccessExclusiveLock on relation 237625;
        blocked by process 1115.
[ERROR] Worker (pid:20987) exited with code 3
[ERROR] Reason: Worker failed to boot.
```

**The service never comes up.** This was invisible for the entire history of the project because every test ran under `python app.py`, a single process.

The fix adds a **cross-process** lock inside the existing one:

```sql
SELECT pg_advisory_xact_lock(hashtext('booking-king:ensure_schema'))
```

An advisory lock is transaction-scoped, released on the caller's commit, and released even if the process dies. The second worker blocks there until the first finishes, then finds the schema already current — that section is idempotent by design. Re-verified at `--workers 4`: all four booted, zero deadlocks, twelve concurrent `/api/ready` all returned 200.

★ **Idempotent DDL is not protection here.** The existence check in `CREATE TABLE IF NOT EXISTS` and the following `ALTER` are separate statements with a race between them, and the unconditional type changes and constraint drop/add run on every boot and take the exclusive lock regardless.

#### Cloudflare has folded Pages into Workers

The plan was Cloudflare Pages. The actual dashboard has changed:

- Pages now sits under **Compute** in the sidebar, no longer a top-level item
- The button is **Create application**, not "Create → Pages"
- The creation flow is titled "Create a **Worker**", and the deploy command is `npx wrangler deploy`
- The URL is `*.workers.dev`, not `*.pages.dev`

So the repo needs `wrangler.jsonc` to declare itself a static site. Without it the deploy fails, and the error points at a missing entry point rather than at the missing config. The config **deliberately has no `main` field** — that would be a Worker script, and a purely static site has none.

#### CORS narrowed from "allow everything" to an allowlist

It was `CORS(app, max_age=3600)`, accepting any origin. It now reads `ALLOWED_ORIGINS`.

★ **When unset it deliberately allows everything and prints a warning** rather than failing closed. Failing closed would break local development and manual testing with no signal beyond a CORS error in the browser console — about the hardest failure to trace back to its cause.

An honest assessment: the risk this actually removes in this system is **small**. CORS mainly guards against the browser automatically attaching your credentials, which is cookie behaviour; here the credential lives in `localStorage` and is attached explicitly by the frontend, and a hostile site cannot read it. Also, **CORS does not stop a request reaching the server** — it only stops the caller reading the response, so it is not an abuse-prevention mechanism; rate limiting does that. It is kept because it costs nothing, becomes important immediately if auth ever moves to cookies, and "open to the world" is something to explain during any security review.

---

### Adding each additional venue

The code **does not change**. Create a fresh set of accounts and services for that venue:

1. That venue's own Google account → its own Neon project (Singapore)
2. Its own Render service, **pointing at the same repo and the same `main`**, differing only in environment variables
3. Its own Cloudflare project, on its own domain
4. Add that venue's schedules on cron-job.org (see Part I) — **this step is easy to forget and fails silently**; nothing errors, the session statuses just drift out of date and waitlist entries never expire

★ Schedules can all live in one cron-job.org account rather than being split per venue (reasoning in Part I). The cache cannot.
★ Separate accounts mean separate free quotas (Render's 750 instance-hours and Neon's 100 CU-hours are both counted per account).
★ **Deploy BuJingJing first, confirm it, then the rest.** Render allows disabling auto-deploy per service. The price of a single codebase is that one bad release reaches every venue; this procedure is what holds that back.
★ Room for per-venue theming already exists: `style.css`'s `:root` is a set of design tokens, so changing colours means overriding variables rather than editing code, and `brand-mark.png` / `favicon.png` are file swaps.

### Known limitations

- **Render's free plan sleeps after 15 idle minutes**, with a cold start **measured at 32.4 s** against production on 2026-09-01. Keep-alive must hit `/api/health` (no database) and **never `/api/ready`** — that would wake Neon and burn the 100 CU-hours quota. Do not run it around the clock either: 24/7 consumes 744 of the 750 hours, leaving 6 hours of margin, and going over suspends every free service in that workspace until the next month. The settled window is 06:00–02:00 (620/750). See Part I to set it up.
- **Monthly Neon CU-hours depend on whether the longest gap between accesses during business hours exceeds 5 minutes.** Instrumentation is in place: `GET /internal/idle-gap-stats` (requires `X-Job-Token`).
- **A custom domain requires owning a domain.** Cloudflare charges nothing and imposes no limit on the number; the domain itself is bought from a registrar.
