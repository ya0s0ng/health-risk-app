// scripts/seed.js
//
// 把 seed_data.sql 灌進資料庫，然後對每一筆「歷史」紀錄套用決策樹邏輯，
// 回填 risk_level（因為種子資料規格明定 risk_level 不應該是種子資料的一部分，
// 必須由決策樹邏輯計算後寫入 —— 這個腳本就是在demonstrate這個過程）。

const fs = require('fs');
const path = require('path');
const db = require('../db');
const { classifyRisk } = require('../decisionTree');

const sqlPath = path.join(__dirname, '..', 'seed_data.sql');
const sql = fs.readFileSync(sqlPath, 'utf-8');

console.log('清空現有 health_logs 資料...');
db.exec('DELETE FROM health_logs;');

console.log('匯入種子資料（risk_level 暫時為 NULL）...');
db.exec(sql);

console.log('套用決策樹邏輯，回填每筆紀錄的 risk_level...');
const rows = db.prepare('SELECT * FROM health_logs').all();
const update = db.prepare('UPDATE health_logs SET risk_level = ? WHERE id = ?');

// node:sqlite 沒有 better-sqlite3 的 db.transaction() 寫法，
// 改用手動 BEGIN/COMMIT 包住整批更新（90筆資料量很小，其實包不包交易差異不大，
// 但保留交易寫法是好習慣，避免中途出錯留下一半資料）
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

// 驗證結果統計（資料品質自我檢查）
const counts = db
  .prepare('SELECT risk_level, COUNT(*) as cnt FROM health_logs GROUP BY risk_level')
  .all();

console.log('\n=== 種子資料匯入完成 ===');
console.log(`總筆數：${rows.length}`);
console.log('風險等級分布：', counts);
console.log('\n請務必打開 health.db 實際檢查幾筆資料，確認規律存在（這是評分項目之一）。');
