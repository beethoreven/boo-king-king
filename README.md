# booking-king

劇本殺遊戲預訂系統。Meta repo，實際程式碼在兩個 submodule：

- [booking-king-backend](booking-king-backend/) — 後端
- [booking-king-web](booking-king-web/) — 前端

## 基礎架構決策（2026-08-25 定案）

機房：Render + Neon 都在 **Singapore (ap-southeast-1)**。這不是效能微調，是前提——
兩端跨區時單次資料庫查詢實測 1.76 秒，同區後降到 0.03 秒（姊妹專案 zh-cn-to-tw 實測，59 倍）。

流量形態：平時每日 1-12 筆預約；新劇本開賣瞬間 1 分鐘內 30-36 筆，當天累計 50-60 筆。
真正的負載來源不是預約筆數，是開賣當下同時刷新「還有沒有位子」的人。

其餘決策（連線池參數、防超賣機制、重試安全性）見
[booking-king-backend/README.md](booking-king-backend/README.md) 與
[booking-king-backend/db/connection.py](booking-king-backend/db/connection.py) 內的註解。

## Clone

```bash
git clone --recurse-submodules <this-repo-url>
```

---

# 上線 SOP（步經徑第一次上線）

寫給實際操作的人照著做。每一步都標明**你做**還是**指令**。
建立帳號、按網頁上的按鈕這類需要你自己的憑證的動作，一律由你執行。

架構定案：**backend / web / meta 各一個 repo、各一條 `main`、零 fork。**
之後每家店是「同一份 code + 自己的 Render / Neon / Cloudflare」，不是另一包 code。

---

## 第 0 步：先確認這些前提

- GitHub 的 SSH 別名是 **`github.com-beethoreven`**（不是純 `github.com`）。
  下面所有 remote 網址都用這個別名，用錯會推不上去。
- 三個 repo 目前**都還沒有 remote**，也就是還沒有任何東西上過 GitHub。
- Neon 與 Render **必須都開在 Singapore（ap-southeast-1）**。
  這不是效能微調，跨區實測慢 59 倍，見本檔開頭。

---

## 第 1 步：建立三個 GitHub repo（你做）

在 GitHub 上建立三個 **空的**（不要勾 README / .gitignore / LICENSE）repo：

| repo 名稱 | 可見性 | 為什麼 |
|---|---|---|
| `booking-king-backend` | **Private** | 後端原始碼不會送到瀏覽器，藏得住就藏 |
| `booking-king-web` | **Private** | Cloudflare Pages 免費方案支援私有 repo |
| `booking-king` | **Private** | meta，只有 submodule 指標 |

★ 三個都可以 private，是因為前端用 **Cloudflare Pages** 而不是 GitHub Pages。
GitHub Pages 免費方案只能從公開 repo 發佈，而且一個 repo 只能掛一個自訂網域——
之後多店家會卡在這裡。

---

## 第 2 步：推上去（指令）

先推兩個 submodule，再推 meta——meta 記錄的是 submodule 的 commit，順序反了會指向不存在的 commit。

```bash
cd /Users/darkather/Codebase/booking-king/booking-king-backend
git remote add origin git@github.com-beethoreven:beethoreven/booking-king-backend.git
git branch -M main
git push -u origin main
```

```bash
cd /Users/darkather/Codebase/booking-king/booking-king-web
git remote add origin git@github.com-beethoreven:beethoreven/booking-king-web.git
git branch -M main
git push -u origin main
```

meta 目前的 submodule 是本機路徑，要改成 GitHub 網址：

```bash
cd /Users/darkather/Codebase/booking-king
git submodule set-url booking-king-backend git@github.com-beethoreven:beethoreven/booking-king-backend.git
git submodule set-url booking-king-web git@github.com-beethoreven:beethoreven/booking-king-web.git
git add .gitmodules && git commit -m "Point submodules at GitHub"
git remote add origin git@github.com-beethoreven:beethoreven/booking-king.git
git branch -M main
git push -u origin main
```

---

## 第 3 步：Neon 資料庫（你做）

1. neon.tech 註冊／登入 → **Create project**
2. **Region 選 Singapore (ap-southeast-1)**。★ 這個之後改不了，只能重建專案搬資料。
3. 建好後複製 **Connection string**（`postgresql://...?sslmode=require`），等一下要貼到 Render。

不需要先建表。後端啟動時 `ensure_schema()` 會自動建好。

---

## 第 4 步：Google OAuth（你做）

Google Cloud Console → APIs & Services → Credentials → **Create OAuth client ID**

- 類型：**Web application**
- **Authorized JavaScript origins** 填前端網址。第一次還不知道，先填 Cloudflare 給的
  `https://<專案名>.pages.dev`；之後掛了自訂網域要**回來再加一條**。
- 複製 **Client ID**（`...apps.googleusercontent.com`）

★ 這裡漏填來源是最常見的卡關：登入按鈕會沒反應而且主控台只有一句 origin 錯誤。

---

## 第 5 步：Render 後端（你做）

**New → Web Service** → 連 GitHub → 選 `booking-king-backend`

| 欄位 | 填什麼 |
|---|---|
| Region | **Singapore** |
| Branch | `main` |
| Runtime | Python 3 |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `gunicorn --workers 2 --threads 4 --timeout 60 --bind 0.0.0.0:$PORT app:app` |

★ Start Command 一定要用 gunicorn，不要用 `python app.py`。
　 而 workers 要 2 以上這件事已經驗過能正常啟動（`ensure_schema` 有跨行程鎖）。
★ 連線數算法：`workers × 連線池 max_size(5)`。2 個 worker = 10 條，Neon 免費夠用。
　 之後調高 workers 要一起想這個數字。

**Environment 變數**（Render 的 Environment 分頁，逐條貼）：

| 變數 | 值 |
|---|---|
| `DATABASE_URL` | 第 3 步的 Neon 連線字串 |
| `GOOGLE_CLIENT_ID` | 第 4 步的 Client ID |
| `ALLOWED_ORIGINS` | 前端網址，例如 `https://booking-king-web.pages.dev`。★ 逗號分隔、含 `https://`、**結尾不要斜線** |
| `JOB_TOKEN` | 自己產一組長亂數（見下方指令）。沒設定的話排程端點一律 503 |
| `SESSION_IDLE_DAYS` | `90` |
| `AUTH_CACHE_TTL_SECONDS` | `30` |

產 `JOB_TOKEN`：

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

★ `ALLOWED_ORIGINS` 沒設定的話後端會**放行任何來源**，只在啟動 log 印一行警告。
　 正式環境務必設定；第 7 步會回來補上真正的網址。

---

## 第 6 步：Cloudflare Pages 前端（你做）

左側 **Compute → Workers & Pages → Create → Pages → Connect to Git** → 選 `booking-king-web`

★ Cloudflare 2026 改版後，Pages 被收進左側的 **Compute** 底下，不再是頂層項目。
　 找不到的話，首頁「Ship something new → Create app」也會走到同一個流程。

| 欄位 | 填什麼 |
|---|---|
| Framework preset | **None** |
| Build command | **留空**（純靜態，沒有建置步驟） |
| Build output directory | `/` |

部署完會拿到 `https://<專案名>.pages.dev`。

然後把後端網址與 Google Client ID 寫進 `booking-king-web/index.html`：

```html
window.__BOOKING_KING_API_BASE__ = 'https://<你的-render-service>.onrender.com';
window.__GOOGLE_CLIENT_ID__ = '<你的 Client ID>';
```

改完 commit + push，Cloudflare 會自動重新部署。

★ 這兩個值放在 `index.html` 而不是環境變數，是因為前端是純靜態、沒有建置步驟。
　 它們本來就是公開資訊（瀏覽器一定看得到），不是秘密。

---

## 第 7 步：把三邊的網址接起來（你做）

前端網址確定之後，回頭補兩個地方——**這兩個沒補，登入一定失敗**：

1. **Render** 的 `ALLOWED_ORIGINS` 改成真正的前端網址
2. **Google OAuth** 的 Authorized JavaScript origins 加上同一個網址

---

## 第 8 步：驗證（指令）

```bash
curl https://<你的-render-service>.onrender.com/api/health
```
預期：`{"status":"ok"}`（這支不碰資料庫）

```bash
curl https://<你的-render-service>.onrender.com/api/ready
```
預期：`{"status":"ok","database":"ok"}`（這支會連資料庫，第一次可能要等 Neon 冷啟動）

CORS 有沒有設對：

```bash
curl -i -X OPTIONS https://<你的-render-service>.onrender.com/api/mmg -H "Origin: https://<你的前端網址>" -H "Access-Control-Request-Method: GET"
```
預期回應含 `Access-Control-Allow-Origin: https://<你的前端網址>`。
沒有這一行就是 `ALLOWED_ORIGINS` 填錯（最常見：結尾多一個斜線）。

**人工冒煙測試**：開前端 → Google 登入 → 填註冊資料 → 選劇本 → 選日期時間 → 送出預約。

---

## 第 9 步：保活（之後做，屬於第 4 項）

Render 免費方案閒置 15 分鐘會休眠，冷啟動約一分鐘。南極圈有壓秒訂場，那一分鐘是致命的。

- 保活**只打 `/api/health`**。那支刻意不碰資料庫。
- **絕對不要打 `/api/ready`**——每次都會喚醒 Neon，燒掉 100 CU-hours 的免費額度。
- **只在營業時段打，不要 24/7**。Render 免費每月 750 instance-hours，
  全天候會用掉 744 小時幾乎沒餘裕，超過會讓整個 workspace 停用到下個月。

---

## 之後每加一家店要做什麼

程式碼**不動**。新開一組屬於那家店的帳號與服務：

1. 那家店自己的 Google 帳號 → 自己的 Neon project（Singapore）
2. 自己的 Render service，**指向同一個 repo、同一條 `main`**，只有環境變數不同
3. 自己的 Cloudflare Pages 專案，掛自己的網域
4. 差異放在：Render 環境變數 + 那家店自己資料庫裡的設定

★ 不同帳號 = 各自一份免費額度（Render 750 小時、Neon 100 CU-hours 都是各自算）。

★ **先推步經徑，確認沒問題再推其他店**。Render 可以逐個 service 關掉自動部署。
　 一份 code 的代價就是一次壞發布會打到所有店，這個流程是用來擋它的。

★ **配色與圖片的客製空間**：`style.css` 的 `:root` 已經是一組設計 token
　（`--bg` / `--accent` / `--surface` …），換配色是覆寫變數、不是改程式；
　`brand-mark.png` 與 `favicon.png` 是換檔。真正實作屬於第 5 項。
