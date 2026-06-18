# 智慧健康日誌與風險評估系統（題目 A）

## 一、安裝與啟動（在你自己的電腦上執行）

> 這個專案使用 Node.js 內建的 `node:sqlite` 模組存取資料庫，**不需要安裝
> 任何資料庫套件、也不需要 Visual Studio 或任何 C++ 編譯工具**。
> 只要 Node.js 版本 ≥ 22.5，`npm install` 只會裝 express，幾秒鐘就結束。
> 執行時終端機會印出一行 `ExperimentalWarning: SQLite is an experimental feature`，
> 這是正常的提示訊息，不是錯誤，不影響任何功能。

```bash
# 1. 進到專案資料夾
cd health-risk-app

# 2. 安裝依賴套件（只有 express，很快）
npm install

# 3. 把種子資料灌進資料庫，並套用決策樹計算 risk_level
npm run seed

# 4. 啟動伺服器
npm start
```

啟動後開瀏覽器到 `http://localhost:3000` 就會看到介面。

若你的 Node.js 版本低於 22.5（執行 `node -v` 檢查），`node:sqlite` 模組不存在，
請先去 [nodejs.org](https://nodejs.org) 更新到最新的 LTS 版本。

## 二、專案結構

```
health-risk-app/
├── server.js          後端主程式：CRUD API + 風險查詢 API
├── db.js              SQLite 資料庫連線與建表
├── decisionTree.js    決策樹分類邏輯（核心！附完整樹狀圖註解）
├── seed_data.sql       90 天種子資料（SQL INSERT 語句）
├── scripts/
│   ├── generateSeed.js  產生 seed_data.sql 的腳本
│   ├── seed.js           把 seed_data.sql 灌入資料庫 + 回填決策樹結果
│   └── infoGain.js       【進階加分】計算資訊增益，找最佳切分門檻
└── public/             前端（純 HTML/CSS/JS，無框架）
    ├── index.html
    ├── style.css
    └── app.js
```

## 三、決策樹邏輯說明（口頭報告/口試時可以這樣講）

風險判斷是「三層判斷」，不是單一個 if：

1. **第一層：睡眠時數** 是否小於 6 小時
2. **第二層：步數** 是否小於 4000 步（依睡眠結果分支判斷）
3. **第三層：心情分數**，只在「睡眠不足但步數還可以」或「睡眠步數都正常」
   這兩種卡在中間、無法直接定案的情況，才會用心情分數做最終判斷

這樣設計刻意處理了評分標準提到的中間情況：**睡眠正常、步數正常，但心情差**
→ 結果是「中風險」，不是「低風險」，因為心情不好仍然是一個警訊，不能被
前兩個正常指標蓋過去。完整邏輯與圖示在 `decisionTree.js` 的註解裡。

## 四、進階加分：資訊增益分析

執行：

```bash
npm run infogain
```

這會讀取資料庫裡的 90 筆資料，對 `sleep_hours`、`steps`、`mood_score` 三個特徵
各自嘗試所有可能門檻值，計算資訊增益（entropy 下降量），找出真正該優先切分
的特徵與最佳門檻。我已經先跑過一次，結果是：

| 特徵 | 最佳門檻 | 資訊增益 |
|---|---|---|
| sleep_hours | 5.85 | 0.7855 |
| steps | 4136.5 | 0.7561 |
| mood_score | 5.50 | 0.8066 |

有趣的發現：**心情分數的資訊增益其實略高於睡眠時數**，意味著純粹從資料統計
角度看，心情分數的區分力最強。但 `decisionTree.js` 仍選擇睡眠作為根節點，
這是刻意保留的「領域知識 vs 資料驅動」的取捨——可以在報告裡討論這一點，
是很好的加分素材。

三個門檻值都跟程式碼裡手動設定的（6h / 4000步 / 4分和6分）非常接近，
證明原始的樹狀設計是有根據的，不是隨便猜的。

## 五、資料品質自我檢查（繳交前務必做）

1. 打開 `health.db`（可用 [DB Browser for SQLite](https://sqlitebrowser.org/) 這類免費工具，
   或在終端機執行 `sqlite3 health.db "SELECT * FROM health_logs LIMIT 10;"`）
2. 確認高風險組的睡眠/步數/心情數值真的偏低、低風險組真的偏高
3. 確認執行 `npm run seed` 後，`risk_level` 欄位三種等級都有資料
   （可執行 `npm run infogain` 順便看到統計，或直接在介面上滑動歷史列表確認）

## 六、給老師看的「與 AI 協作」素材

這次的對話記錄本身就包含：
- 三個題目的選題分析與理由
- 種子資料生成 Prompt 與規律設計
- 資料品質驗證過程（決策樹分類統計：高26/中23/低41）
- 資訊增益進階分析的完整計算與發現

建議截圖或匯出這份對話記錄的關鍵段落，作為「精準下 Prompt、有效除錯」
的佐證附在報告裡。
