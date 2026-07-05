/* ═══════════════════════════════════════════════
   MindSafe AI — Analytics Dashboard
   Author: Mohammed Mufeed
   ═══════════════════════════════════════════════ */

// Theme persistence
const savedTheme = localStorage.getItem('mindsafe-theme') || 'dark';
setTheme(savedTheme);

let riskChart   = null;
let emotionChart = null;

/* ─── Theme ─── */
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('mindsafe-theme', theme);
  const icon = document.getElementById('themeIcon');
  if (icon) icon.className = theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  setTheme(current === 'dark' ? 'light' : 'dark');
}

/* ─── Chart defaults ─── */
Chart.defaults.color = 'rgba(255,255,255,0.55)';
Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";

const RISK_COLORS = {
  Safe:     { bg: 'rgba(16,185,129,0.75)',  border: '#10b981' },
  Moderate: { bg: 'rgba(245,158,11,0.75)',  border: '#f59e0b' },
  High:     { bg: 'rgba(249,115,22,0.75)',  border: '#f97316' },
  Critical: { bg: 'rgba(239,68,68,0.80)',   border: '#ef4444' },
};

const EMOTION_PALETTE = [
  'rgba(99,102,241,0.8)', 'rgba(239,68,68,0.8)', 'rgba(59,130,246,0.8)',
  'rgba(249,115,22,0.8)', 'rgba(168,85,247,0.8)', 'rgba(245,158,11,0.8)',
];

/* ─── Initialize Charts ─── */
function initCharts() {
  // Risk Distribution — Doughnut
  const riskCtx = document.getElementById('riskChart').getContext('2d');
  riskChart = new Chart(riskCtx, {
    type: 'doughnut',
    data: {
      labels: ['Safe', 'Moderate', 'High', 'Critical'],
      datasets: [{
        data: [0, 0, 0, 0],
        backgroundColor: Object.values(RISK_COLORS).map(c => c.bg),
        borderColor:     Object.values(RISK_COLORS).map(c => c.border),
        borderWidth: 2,
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { padding: 16, usePointStyle: true, pointStyle: 'circle' },
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.parsed} (${Math.round(ctx.parsed / (ctx.dataset.data.reduce((a,b)=>a+b,0)||1)*100)}%)`,
          }
        }
      },
      animation: { animateRotate: true, duration: 800 },
    }
  });

  // Emotion Breakdown — Horizontal Bar
  const emotionCtx = document.getElementById('emotionChart').getContext('2d');
  emotionChart = new Chart(emotionCtx, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        label: 'Occurrences',
        data: [],
        backgroundColor: EMOTION_PALETTE,
        borderRadius: 8,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.parsed.x} occurrence${ctx.parsed.x !== 1 ? 's' : ''}`,
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { stepSize: 1 },
        },
        y: {
          grid: { display: false },
        },
      },
      animation: { duration: 700 },
    }
  });
}

/* ─── Load & Render Stats ─── */
function loadStats() {
  const btn = document.getElementById('refreshBtn');
  btn.classList.add('spinning');

  $.getJSON('/api/stats', function(data) {
    // Stat cards
    const total = data.total || 0;
    $('#statTotal').text(total.toLocaleString());
    $('#statHighRisk').text((data.high_risk_count || 0).toLocaleString());
    $('#statSafe').text((data.safe_count || 0).toLocaleString());
    const rate = total > 0 ? Math.round((data.high_risk_count / total) * 100) : 0;
    $('#statRate').text(rate + '%');

    // Risk chart
    const rd = data.risk_distribution || {};
    riskChart.data.datasets[0].data = [
      rd.Safe     || 0,
      rd.Moderate || 0,
      rd.High     || 0,
      rd.Critical || 0,
    ];
    riskChart.update();

    // Emotion chart
    const ed = data.emotion_distribution || {};
    const emotions = Object.entries(ed).sort((a,b) => b[1]-a[1]);
    emotionChart.data.labels   = emotions.map(([k]) => k.charAt(0).toUpperCase() + k.slice(1));
    emotionChart.data.datasets[0].data = emotions.map(([,v]) => v);
    emotionChart.data.datasets[0].backgroundColor = emotions.map((_,i) => EMOTION_PALETTE[i % EMOTION_PALETTE.length]);
    emotionChart.update();

    // Recent table
    renderRecentTable(data.recent || []);

    // Timestamp
    $('#lastUpdated').text(new Date().toLocaleTimeString());
  }).always(() => {
    btn.classList.remove('spinning');
  });
}

/* ─── Render Recent Analyses Table ─── */
function renderRecentTable(items) {
  const tbody = $('#recentTableBody');
  if (!items.length) {
    tbody.html('<tr><td colspan="7" style="text-align:center;opacity:0.5;padding:32px;">No data yet — run some analyses in the chat!</td></tr>');
    return;
  }

  const RISK_TABLE_STYLES = {
    Safe:     'background:rgba(16,185,129,0.12);color:#34d399;border:1px solid rgba(16,185,129,0.25)',
    Moderate: 'background:rgba(245,158,11,0.12);color:#fbbf24;border:1px solid rgba(245,158,11,0.25)',
    High:     'background:rgba(249,115,22,0.12);color:#fb923c;border:1px solid rgba(249,115,22,0.25)',
    Critical: 'background:rgba(239,68,68,0.12);color:#f87171;border:1px solid rgba(239,68,68,0.30)',
  };

  const rows = items.map(item => {
    const rl    = item.risk_level || 'Safe';
    const style = RISK_TABLE_STYLES[rl] || RISK_TABLE_STYLES.Safe;
    const emos  = (item.emotions || []).join(', ') || '—';
    const text  = (item.text || '').substring(0, 60) + (item.text?.length > 60 ? '…' : '');
    return `
      <tr>
        <td style="color:var(--text-muted);white-space:nowrap">${item.timestamp || '—'}</td>
        <td title="${item.text || ''}">${text}</td>
        <td><span class="table-risk-badge" style="${style}">${rl}</span></td>
        <td style="font-weight:700">${item.severity_score || 0}</td>
        <td>${item.ml_confidence || 0}%</td>
        <td>${item.dl_confidence || 0}%</td>
        <td style="color:var(--text-muted);font-size:0.78rem">${emos}</td>
      </tr>`;
  }).join('');

  tbody.html(rows);
}

/* ─── Boot ─── */
$(document).ready(function() {
  initCharts();
  loadStats();
  // Auto-refresh every 30 seconds
  setInterval(loadStats, 30000);
});
