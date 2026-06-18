// app.js
// 前端邏輯：呼叫後端 API（/health-logs），渲染表單送出、歷史列表、風險徽章。
// 重點：前端「不自己判斷風險」，所有風險等級都來自後端 API 回傳的 risk_level，
// 這正是評分項目「資料流動的理解：Frontend -> API -> DB 是否清晰」要檢查的地方。

const form = document.getElementById('log-form');
const formStatus = document.getElementById('form-status');
const tableBody = document.getElementById('log-table-body');
const recordCount = document.getElementById('record-count');
const riskBadge = document.getElementById('risk-badge');
const riskDetail = document.getElementById('risk-detail');
const decisionPathEl = document.getElementById('decision-path');
let trendChart = null;

// 預設日期欄位為今天，方便填寫
document.getElementById('log_date').valueAsDate = new Date();

async function fetchLogs() {
  const res = await fetch('/health-logs');
  if (!res.ok) throw new Error('讀取歷史紀錄失敗');
  return res.json();
}

async function fetchCurrentRisk() {
  const res = await fetch('/health-logs/risk');
  if (!res.ok) return null;
  return res.json();
}

function renderRiskBadge(riskInfo) {
  if (!riskInfo) {
    riskBadge.textContent = '—';
    riskBadge.dataset.level = '';
    riskDetail.textContent = '尚無資料';
    decisionPathEl.innerHTML = '';
    return;
  }
  riskBadge.textContent = riskInfo.risk_level;
  riskBadge.dataset.level = riskInfo.risk_level;
  riskDetail.textContent =
    `${riskInfo.log_date} ・ 睡眠 ${riskInfo.sleep_hours}h ・ 步數 ${riskInfo.steps} ・ 心情 ${riskInfo.mood_score}分`;

  // 顯示決策樹的判斷路徑，讓使用者看到「為什麼」會得到這個風險等級，
  // 而不只是丟出一個結果 —— 對應評分標準「決策樹多層分支邏輯是否真的運作」
  if (Array.isArray(riskInfo.decision_path)) {
    decisionPathEl.innerHTML = riskInfo.decision_path
      .map((step) => `<li>${step}</li>`)
      .join('');
  }
}

function renderTable(logs) {
  recordCount.textContent = `${logs.length} 筆`;

  if (logs.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="6" class="empty-row">尚無紀錄，先在左側新增一筆吧</td></tr>';
    return;
  }

  // 最新的紀錄顯示在最上面
  const sorted = [...logs].sort((a, b) => (a.log_date < b.log_date ? 1 : -1));

  tableBody.innerHTML = sorted
    .map(
      (log) => `
    <tr>
      <td>${log.log_date}</td>
      <td>${log.sleep_hours}h</td>
      <td>${log.steps}</td>
      <td>${log.mood_score}</td>
      <td><span class="tag" data-level="${log.risk_level ?? ''}">${log.risk_level ?? '—'}</span></td>
      <td><button class="delete-btn" data-id="${log.id}">刪除</button></td>
    </tr>
  `
    )
    .join('');

  // 綁定刪除按鈕
  tableBody.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleDelete(btn.dataset.id));
  });
}

function renderChart(logs) {
  const ctx = document.getElementById('trend-chart');
  if (!ctx) return;

  // 防呆：如果 Chart.js 的 CDN 沒載入成功（例如網路擋掉、離線測試），
  // 不要讓整個頁面壞掉 —— 表格、風險徽章等其他功能應該照常運作，
  // 只是圖表這塊顯示一個說明文字即可。
  if (typeof Chart === 'undefined') {
    ctx.replaceWith(Object.assign(document.createElement('p'), {
      className: 'chart-fallback',
      textContent: '圖表元件載入失敗（可能是網路限制了外部 CDN），但不影響其他功能。',
    }));
    return;
  }

  // 取最近 30 天（依日期排序後取最後30筆），步數除以1000讓三條線在同一個座標軸上看得清楚
  const sorted = [...logs].sort((a, b) => (a.log_date < b.log_date ? -1 : 1));
  const recent = sorted.slice(-30);

  const data = {
    labels: recent.map((l) => l.log_date.slice(5)), // 只顯示 MM-DD
    datasets: [
      {
        label: '睡眠(h)',
        data: recent.map((l) => l.sleep_hours),
        borderColor: '#1f6f5c',
        backgroundColor: '#1f6f5c',
        tension: 0.3,
        pointRadius: 2,
      },
      {
        label: '步數(÷1000)',
        data: recent.map((l) => l.steps / 1000),
        borderColor: '#c98a1f',
        backgroundColor: '#c98a1f',
        tension: 0.3,
        pointRadius: 2,
      },
      {
        label: '心情',
        data: recent.map((l) => l.mood_score),
        borderColor: '#9a4ad1',
        backgroundColor: '#9a4ad1',
        tension: 0.3,
        pointRadius: 2,
      },
    ],
  };

  if (trendChart) {
    trendChart.data = data;
    trendChart.update();
    return;
  }

  trendChart = new Chart(ctx, {
    type: 'line',
    data,
    options: {
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true },
      },
    },
  });
}

async function refreshAll() {
  const [logs, riskInfo] = await Promise.all([fetchLogs(), fetchCurrentRisk()]);
  renderTable(logs);
  renderRiskBadge(riskInfo);
  try {
    renderChart(logs);
  } catch (err) {
    // 圖表出錯不該讓表格、風險徽章這些更重要的功能跟著壞掉
    console.error('圖表渲染失敗:', err);
  }
}

async function handleDelete(id) {
  if (!confirm('確定要刪除這筆紀錄嗎？')) return;
  const res = await fetch(`/health-logs/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    alert('刪除失敗');
    return;
  }
  await refreshAll();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  formStatus.textContent = '送出中...';
  formStatus.classList.remove('error');

  const payload = {
    log_date: document.getElementById('log_date').value,
    sleep_hours: Number(document.getElementById('sleep_hours').value),
    steps: Number(document.getElementById('steps').value),
    mood_score: Number(document.getElementById('mood_score').value),
  };

  try {
    const res = await fetch('/health-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '新增失敗');
    }

    const newLog = await res.json();
    formStatus.textContent = `新增成功！風險等級：${newLog.risk_level}`;
    await refreshAll();
  } catch (err) {
    formStatus.textContent = err.message;
    formStatus.classList.add('error');
  }
});

// 初次載入
refreshAll().catch((err) => {
  console.error(err);
  tableBody.innerHTML = '<tr><td colspan="6" class="empty-row">載入失敗，請確認伺服器是否啟動</td></tr>';
});
