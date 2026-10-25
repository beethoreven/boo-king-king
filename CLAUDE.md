# boo-king-king

劇本殺預約系統。meta repo，底下兩個 submodule：`boo-king-king-backend`（Flask，Render）、
`boo-king-king-web`（靜態站，Cloudflare Workers）。上線 SOP 與每加一家店的步驟在 `README.md`。

## 部署長怎樣（2026-10-25）

| 部署 | 後端 | 前端分支 | 後端部署方式 |
|---|---|---|---|
| demo（步經徑） | 自己的服務 `boo-king-king-tutor-arthur-demo`，單店寫法 | `main` | push 就自動部署（等於 staging） |
| 正式店家（eli、tutor-arthur…） | 共用一個服務 `boo-king-king-api`，多店家寫法 | `eli`、`tutor-arthur`… | 案主在 Render 手動部署 |

- 改後端：推上去 demo 會自己更新；正式店家要提醒案主到 Render 手動部署 `boo-king-king-api`。
- 改前端：通用修改做在 `main`，再合進每一條店家分支（`eli`、`tutor-arthur`）。`index.html` 與
  `wrangler.jsonc` 每條分支各自不同，合併衝突時保留分支自己的值。

## ★ 後端的多店家規則（不能忘）

一個後端服務同時服務好幾家店，每個請求依 `/v/<店家>` 連那一家的資料庫。

**任何存在記憶體、跨請求共用的東西（快取、計數、旗標、單例的狀態）一律用
`tenancy.PerTenant` 或 `tenancy.TableCache`；每店設定一律從 `tenancy.current()` 讀，
不要直接讀 `os.environ` 的 `DATABASE_URL`、`JOB_TOKEN` 這類。** 理由與做法在
`boo-king-king-backend/tenancy.py` 開頭。

改完後端一定要跑：

```bash
cd boo-king-king-backend && ./.venv/bin/python -m pytest
```

- `tests/test_tenant_state.py` 掃整個後端，出現沒按店家分開的狀態就失敗。真的不該分開的
  才加進它的 `ALLOWED`，而且要寫理由。
- `tests/test_cross_tenant.py` 用兩家測試店（臨時的本機 Postgres，不碰 Neon）驗證結果分得開。

## 其他

- 本機 `.env` 指的是 demo 的資料庫，不要指到正式店家的。
- Python 版本照 `boo-king-king-backend/.python-version`（正式服務另外用環境變數 `PYTHON_VERSION` 釘住）。
