// db.js
// 負責建立/連接 SQLite 資料庫檔案，並確保 health_logs 資料表存在。
//
// 使用 Node.js 內建的 node:sqlite 模組（Node 22.5+ 開始提供），
// 完全不需要額外安裝資料庫套件，避免 Windows 上 better-sqlite3 需要
// C++ 編譯環境（Visual Studio）才能安裝的問題。
// API 設計刻意模仿 better-sqlite3（.prepare().all() / .get() / .run()），
// 所以 server.js 等其他檔案完全不用改寫呼叫方式。

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

// 資料庫檔案會建立在專案根目錄下的 health.db
// 第一次執行時若檔案不存在，node:sqlite 會自動建立空檔案
const db = new DatabaseSync(path.join(__dirname, 'health.db'));

// 建立資料表（若不存在）。risk_level 允許 NULL，
// 因為依規格說明：風險等級是「由決策樹邏輯計算後寫入，非種子資料」
db.exec(`
  CREATE TABLE IF NOT EXISTS health_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    log_date TEXT NOT NULL,
    sleep_hours REAL NOT NULL,
    steps INTEGER NOT NULL,
    mood_score INTEGER NOT NULL,
    risk_level TEXT
  );
`);

// ---------- 部署環境自動種子（重點：解決 Render 等平台 ephemeral filesystem 的問題）----------
// Render 免費方案的檔案系統在重新部署/重啟後會被清空，health.db 也會跟著消失。
// 若每次啟動都檢查一次「資料表是否為空」，是空的才匯入種子資料，
// 就能保證老師打開 Live Demo URL 時，資料永遠都在，不需要手動連線執行 npm run seed。
// 本機開發如果已經有資料，這段不會動到既有資料（只在「完全空」時才匯入）。
function autoSeedIfEmpty() {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM health_logs').get();
  if (count > 0) return;

  const sqlPath = path.join(__dirname, 'seed_data.sql');
  if (!fs.existsSync(sqlPath)) return;

  console.log('[autoSeed] health_logs 是空的，自動匯入種子資料...');
  const sql = fs.readFileSync(sqlPath, 'utf-8');
  db.exec(sql);

  // 延遲載入，避免 decisionTree.js 與 db.js 互相 require 造成循環依賴
  const { classifyRisk } = require('./decisionTree');
  const rows = db.prepare('SELECT * FROM health_logs').all();
  const update = db.prepare('UPDATE health_logs SET risk_level = ? WHERE id = ?');

  db.exec('BEGIN');
  try {
    for (const row of rows) {
      const risk = classifyRisk({
        sleep_hours: row.sleep_hours,
        steps: row.steps,
        mood_score: row.mood_score,
      });
      update.run(risk, row.id);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  console.log(`[autoSeed] 已自動匯入並分類 ${rows.length} 筆紀錄`);
}

autoSeedIfEmpty();

module.exports = db;
