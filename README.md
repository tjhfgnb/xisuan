# 析算

分數計算機。輸入算式後按等於，用分數逐步寫出過程（通分、約分、帶分數、小數）。全部在瀏覽器計算。

## 部署到 Cloudflare

[dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → 匯入 GitHub 倉庫 `tjhfgnb/xisuan`（分支 `main`）。

| 欄位 | 值 |
|---|---|
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node.js version | `22`（倉庫已有 `.node-version`） |

不需要資料庫或環境變數。完成後網址會是 `https://xisuan.pages.dev`（或你自訂的專案名）。
