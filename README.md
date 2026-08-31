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

★ 不同帳號 = 各自一份免費額度（Render 750 instance-hours、Neon 100 CU-hours 都是各自算）。
★ **先推步經徑，確認沒問題再推其他店。** Render 可以逐個 service 關掉自動部署。一份程式碼的代價就是一次壞發布會打到所有店，這個流程是用來擋它的。
★ 配色與圖片的客製空間已經留好：`style.css` 的 `:root` 是一組設計 token，換配色是覆寫變數而不是改程式；`brand-mark.png` 與 `favicon.png` 是換檔。

### 已知限制

- **Render 免費方案閒置 15 分鐘會休眠**，冷啟動約一分鐘。保活要打 `/api/health`（不碰資料庫），**絕對不要打 `/api/ready`**——那會喚醒 Neon 燒掉 100 CU-hours 額度。而且只在營業時段打：免費方案每月 750 instance-hours，24/7 會用掉 744 小時幾乎沒餘裕。
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

★ Separate accounts mean separate free quotas (Render's 750 instance-hours and Neon's 100 CU-hours are both counted per account).
★ **Deploy BuJingJing first, confirm it, then the rest.** Render allows disabling auto-deploy per service. The price of a single codebase is that one bad release reaches every venue; this procedure is what holds that back.
★ Room for per-venue theming already exists: `style.css`'s `:root` is a set of design tokens, so changing colours means overriding variables rather than editing code, and `brand-mark.png` / `favicon.png` are file swaps.

### Known limitations

- **Render's free plan sleeps after 15 idle minutes**, with roughly a one-minute cold start. Keep-alive must hit `/api/health` (no database) and **never `/api/ready`** — that would wake Neon and burn the 100 CU-hours quota. Keep it to business hours too: the free plan allows 750 instance-hours a month, and running 24/7 consumes 744 with almost no margin.
- **Monthly Neon CU-hours depend on whether the longest gap between accesses during business hours exceeds 5 minutes.** Instrumentation is in place: `GET /internal/idle-gap-stats` (requires `X-Job-Token`).
- **A custom domain requires owning a domain.** Cloudflare charges nothing and imposes no limit on the number; the domain itself is bought from a registrar.
