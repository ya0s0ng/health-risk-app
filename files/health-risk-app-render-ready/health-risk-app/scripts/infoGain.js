// scripts/infoGain.js
//
// 【進階加分項目】依題目說明文件 2.4 節：
// 「請 AI 幫你針對這份種子資料，實際計算每個特徵的資訊增益（Information Gain），
//   找出真正該優先切分的特徵與最佳門檻值，這正是 C4.5 演算法實際運作的方式」
//
// 這個腳本做的事：
// 1. 讀取 health.db 裡的 90 筆種子資料
// 2. 對 sleep_hours / steps / mood_score 三個特徵，各自嘗試所有可能的二元切分門檻
// 3. 計算每個切分的「資訊增益」= 切分前亂度(entropy) - 切分後加權平均亂度
// 4. 找出每個特徵的最佳門檻、以及全部特徵中資訊增益最高的（=> 決策樹根節點該選誰）
//
// 注意：這裡用「目前的決策樹分類結果」當作標籤來算資訊增益，
// 也可以改成你自己對每一天主觀判斷的風險等級，效果是一樣的原理。

const db = require('../db');

// ---------- entropy（熵）計算：標準資訊理論公式 ----------
// entropy = -Σ p(i) * log2(p(i))，p(i) 是每個類別出現的比例
function entropy(labels) {
  const total = labels.length;
  if (total === 0) return 0;

  const counts = {};
  for (const label of labels) {
    counts[label] = (counts[label] || 0) + 1;
  }

  let ent = 0;
  for (const label in counts) {
    const p = counts[label] / total;
    ent -= p * Math.log2(p);
  }
  return ent;
}

// ---------- 針對某個數值特徵，嘗試所有可能門檻值，找出資訊增益最高的切分點 ----------
// 做法（C4.5的核心概念）：把資料依該特徵排序，
// 取相鄰兩個不同數值的中點當作候選門檻，分別計算「<門檻」與「>=門檻」兩組的資訊增益
function bestSplitForFeature(rows, featureKey, labelKey) {
  const baseEntropy = entropy(rows.map((r) => r[labelKey]));
  const sorted = [...rows].sort((a, b) => a[featureKey] - b[featureKey]);

  const uniqueValues = [...new Set(sorted.map((r) => r[featureKey]))];
  let best = { threshold: null, gain: -Infinity };

  for (let i = 0; i < uniqueValues.length - 1; i++) {
    const threshold = (uniqueValues[i] + uniqueValues[i + 1]) / 2;

    const left = rows.filter((r) => r[featureKey] < threshold);
    const right = rows.filter((r) => r[featureKey] >= threshold);

    if (left.length === 0 || right.length === 0) continue;

    const weightedEntropy =
      (left.length / rows.length) * entropy(left.map((r) => r[labelKey])) +
      (right.length / rows.length) * entropy(right.map((r) => r[labelKey]));

    const gain = baseEntropy - weightedEntropy;

    if (gain > best.gain) {
      best = { threshold, gain, leftCount: left.length, rightCount: right.length };
    }
  }

  return { feature: featureKey, baseEntropy, ...best };
}

// ---------- 主程式 ----------
function main() {
  const rows = db.prepare('SELECT * FROM health_logs').all();

  if (rows.length === 0) {
    console.log('資料庫是空的，請先執行 npm run seed 匯入種子資料。');
    return;
  }

  console.log(`讀取 ${rows.length} 筆紀錄，開始計算資訊增益...\n`);

  const features = ['sleep_hours', 'steps', 'mood_score'];
  const results = features.map((f) => bestSplitForFeature(rows, f, 'risk_level'));

  console.log('=== 各特徵最佳切分門檻與資訊增益 ===');
  for (const r of results) {
    console.log(
      `特徵：${r.feature.padEnd(12)} | 最佳門檻值：${r.threshold?.toFixed(2)} | 資訊增益：${r.gain.toFixed(4)} | 左邊筆數：${r.leftCount} / 右邊筆數：${r.rightCount}`
    );
  }

  const rootFeature = results.reduce((a, b) => (a.gain > b.gain ? a : b));
  console.log(
    `\n=> 建議的決策樹根節點特徵：${rootFeature.feature}（門檻 ${rootFeature.threshold.toFixed(2)}），因為它的資訊增益最高（${rootFeature.gain.toFixed(4)}）`
  );
  console.log(
    '\n提示：把這個門檻值拿去跟 decisionTree.js 裡目前手動設定的門檻比較，' +
      '如果差異很大，代表現在的樹可以依照這個結果調整，更貼近資料本身的訊號。'
  );
}

main();
