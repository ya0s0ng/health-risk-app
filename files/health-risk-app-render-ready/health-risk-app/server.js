// server.js
//
// Express 後端伺服器：實作題目說明文件 2.5 節指定的 API 端點，
// 並在新增/修改紀錄時，把決策樹分類結果（decisionTree.js）真正嵌入商務邏輯
// （新增一筆紀錄後立刻計算並寫入 risk_level，而不是前端自己算）。

const express = require('express');
const path = require('path');
const db = require('./db');
const { classifyRisk, classifyRiskWithPath } = require('./decisionTree');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // 提供前端靜態檔案

// ---------- GET /health-logs：取得所有健康日誌紀錄 ----------
app.get('/health-logs', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM health_logs ORDER BY log_date ASC')
    .all();
  res.json(rows);
});

// ---------- POST /health-logs：新增一筆健康日誌 ----------
// 新增時立刻用決策樹計算 risk_level 並一併寫入，這就是「決策樹分類結果
// 真正嵌入商務邏輯」的具體做法：不是另外存一張表、也不是前端自己判斷。
app.post('/health-logs', (req, res) => {
  const { log_date, sleep_hours, steps, mood_score } = req.body;

  if (
    !log_date ||
    sleep_hours === undefined ||
    steps === undefined ||
    mood_score === undefined
  ) {
    return res.status(400).json({
      error: '缺少必要欄位：log_date, sleep_hours, steps, mood_score 皆為必填',
    });
  }

  const risk_level = classifyRisk({
    sleep_hours: Number(sleep_hours),
    steps: Number(steps),
    mood_score: Number(mood_score),
  });

  const result = db
    .prepare(
      `INSERT INTO health_logs (log_date, sleep_hours, steps, mood_score, risk_level)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(log_date, Number(sleep_hours), Number(steps), Number(mood_score), risk_level);

  const newRow = db
    .prepare('SELECT * FROM health_logs WHERE id = ?')
    .get(result.lastInsertRowid);

  res.status(201).json(newRow);
});

// ---------- PUT /health-logs/:id：修改指定日誌 ----------
// 修改數值後，risk_level 也要重新跑一次決策樹計算，否則資料會不一致。
app.put('/health-logs/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM health_logs WHERE id = ?').get(id);

  if (!existing) {
    return res.status(404).json({ error: '找不到該筆紀錄' });
  }

  const log_date = req.body.log_date ?? existing.log_date;
  const sleep_hours = req.body.sleep_hours ?? existing.sleep_hours;
  const steps = req.body.steps ?? existing.steps;
  const mood_score = req.body.mood_score ?? existing.mood_score;

  const risk_level = classifyRisk({
    sleep_hours: Number(sleep_hours),
    steps: Number(steps),
    mood_score: Number(mood_score),
  });

  db.prepare(
    `UPDATE health_logs
     SET log_date = ?, sleep_hours = ?, steps = ?, mood_score = ?, risk_level = ?
     WHERE id = ?`
  ).run(log_date, Number(sleep_hours), Number(steps), Number(mood_score), risk_level, id);

  const updated = db.prepare('SELECT * FROM health_logs WHERE id = ?').get(id);
  res.json(updated);
});

// ---------- DELETE /health-logs/:id：刪除指定日誌 ----------
app.delete('/health-logs/:id', (req, res) => {
  const { id } = req.params;
  const result = db.prepare('DELETE FROM health_logs WHERE id = ?').run(id);

  if (result.changes === 0) {
    return res.status(404).json({ error: '找不到該筆紀錄' });
  }

  res.json({ message: '刪除成功', id: Number(id) });
});

// ---------- GET /health-logs/risk：依決策樹邏輯計算並回傳目前風險等級 ----------
// 「目前」定義為：最新一筆（log_date 最大）的紀錄。
// 若該筆紀錄尚無 risk_level（例如種子資料剛匯入、還沒跑過分類），這裡會即時計算一次。
app.get('/health-logs/risk', (req, res) => {
  const latest = db
    .prepare('SELECT * FROM health_logs ORDER BY log_date DESC, id DESC LIMIT 1')
    .get();

  if (!latest) {
    return res.status(404).json({ error: '尚無任何健康日誌紀錄' });
  }

  const { risk_level, path: decisionPath } =
    latest.risk_level
      ? { risk_level: latest.risk_level, path: classifyRiskWithPath(latest).path }
      : classifyRiskWithPath(latest);

  res.json({
    log_date: latest.log_date,
    sleep_hours: latest.sleep_hours,
    steps: latest.steps,
    mood_score: latest.mood_score,
    risk_level,
    decision_path: decisionPath,
  });
});

app.listen(PORT, () => {
  console.log(`伺服器已啟動：http://localhost:${PORT}`);
});
