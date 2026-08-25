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
