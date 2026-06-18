// scripts/generateSeed.js
//
// 依照題目說明文件 2.3 節的 Prompt 規則生成 90 天健康日誌種子資料：
//   ① 25 天：睡眠少(4-5.5h) + 步數少(1000-3500) + 心情差(1-4分)  -> 預期高風險
//   ② 40 天：數值混合普通                                        -> 預期中風險為主
//   ③ 25 天：睡眠足(7-9h) + 步數多(6000-10000) + 心情好(6-9分)   -> 預期低風險
//
// 重點：使用固定亂數種子（seedRandom），確保「有規律但非完全固定數字」，
// 符合文件要求「資料要有訊號，不能是純隨機」。
// risk_level 故意不寫入 SQL（留 NULL），因為規格明定它「由決策樹邏輯計算後寫入，非種子資料」。

const fs = require('fs');
const path = require('path');

// 簡單的可重現亂數產生器（線性同餘法），避免每次執行結果完全不同，方便除錯比對
function makeRng(seed) {
  let s = seed;
  return function () {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
const rng = makeRng(42);

function randFloat(min, max, decimals = 1) {
  const v = min + rng() * (max - min);
  return Number(v.toFixed(decimals));
}
function randInt(min, max) {
  return Math.floor(min + rng() * (max - min + 1));
}

// 90 天日期，往回推算到今天（不含今天，最後一天是昨天）
function generateDates(count) {
  const dates = [];
  const today = new Date();
  for (let i = count; i >= 1; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10)); // YYYY-MM-DD
  }
  return dates;
}

const dates = generateDates(90);

// 建立 90 筆紀錄：25 筆高風險組、40 筆普通混合組、25 筆低風險組
// 先各自產生群組資料，再打散日期順序（讓資料看起來像真實情境下隨機分布在不同天，而非整齊分區段）
const rows = [];

for (let i = 0; i < 25; i++) {
  rows.push({
    sleep_hours: randFloat(4, 5.5),
    steps: randInt(1000, 3500),
    mood_score: randInt(1, 4),
    group: 'high',
  });
}
for (let i = 0; i < 40; i++) {
  // 混合普通組：刻意讓數值落在門檻值兩側交錯出現，製造真正的「中間情況」
  // 這樣決策樹的中風險分支才有足夠案例覆蓋（而不是全部都剛好卡在同一邊）
  rows.push({
    sleep_hours: randFloat(5.5, 7.5),
    steps: randInt(3000, 7000),
    mood_score: randInt(4, 7),
    group: 'normal',
  });
}
for (let i = 0; i < 25; i++) {
  rows.push({
    sleep_hours: randFloat(7, 9),
    steps: randInt(6000, 10000),
    mood_score: randInt(6, 9),
    group: 'low',
  });
}

// 打散順序（Fisher-Yates，用同一個 rng 保持可重現）
for (let i = rows.length - 1; i > 0; i--) {
  const j = Math.floor(rng() * (i + 1));
  [rows[i], rows[j]] = [rows[j], rows[i]];
}

// 對應日期
rows.forEach((row, idx) => {
  row.log_date = dates[idx];
});

// 依日期排序輸出（讓 SQL 檔案裡資料是按時間順序排列，比較好閱讀檢查）
rows.sort((a, b) => (a.log_date < b.log_date ? -1 : 1));

// 產生 SQL INSERT 語句
const lines = [
  '-- health_logs 種子資料：90 天健康日誌',
  '-- 規律設計：25天高風險組 / 40天普通混合組 / 25天低風險組（依題目說明文件 2.3節 Prompt 規則）',
  '-- risk_level 故意留空（NULL），由後端決策樹邏輯計算後寫入，符合資料表設計規格',
  '',
];
for (const row of rows) {
  lines.push(
    `INSERT INTO health_logs (log_date, sleep_hours, steps, mood_score, risk_level) VALUES ('${row.log_date}', ${row.sleep_hours}, ${row.steps}, ${row.mood_score}, NULL);`
  );
}

const sql = lines.join('\n') + '\n';
const outPath = path.join(__dirname, '..', 'seed_data.sql');
fs.writeFileSync(outPath, sql, 'utf-8');

console.log(`已產生 ${rows.length} 筆種子資料 -> ${outPath}`);
console.log('各組筆數統計：', {
  high: rows.filter((r) => r.group === 'high').length,
  normal: rows.filter((r) => r.group === 'normal').length,
  low: rows.filter((r) => r.group === 'low').length,
});
