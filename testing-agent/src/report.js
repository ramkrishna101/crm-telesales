export function generateReport(results, durationMs) {
  const total = results.length;
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const security = results.filter(r => r.status === 'SECURITY').length;
  const warned = results.filter(r => r.status === 'WARN').length;
  const score = Math.round((passed / total) * 100);

  // Group by suite
  const suites = {};
  for (const r of results) {
    if (!suites[r.suite]) suites[r.suite] = [];
    suites[r.suite].push(r);
  }

  const statusIcon = { PASS: '✅', FAIL: '❌', SECURITY: '🔐', WARN: '⚠️' };
  const statusClass = { PASS: 'pass', FAIL: 'fail', SECURITY: 'security', WARN: 'warn' };

  const suiteHtml = Object.entries(suites).map(([name, tests]) => {
    const suitePass = tests.filter(t => t.status === 'PASS').length;
    const rows = tests.map(t => `
      <tr class="row-${statusClass[t.status]}">
        <td class="icon">${statusIcon[t.status]}</td>
        <td class="test-name">${t.name}</td>
        <td><span class="badge badge-${statusClass[t.status]}">${t.status}</span></td>
        <td class="detail">${t.detail || '—'}</td>
        <td class="duration">${t.duration}ms</td>
      </tr>`).join('');
    return `
      <div class="suite-card">
        <div class="suite-header">
          <h3>${name}</h3>
          <span class="suite-score">${suitePass}/${tests.length} passed</span>
        </div>
        <table class="test-table">
          <thead><tr><th></th><th>Test</th><th>Status</th><th>Detail</th><th>Time</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>CRM Testing Agent Report</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Inter',sans-serif;background:#0a0f1e;color:#e2e8f0;min-height:100vh}
    .gradient-bg{background:linear-gradient(135deg,#0a0f1e 0%,#0d1b3e 50%,#0a0f1e 100%)}
    
    /* Header */
    .header{padding:48px 40px 32px;border-bottom:1px solid #1e293b;background:linear-gradient(180deg,#0d1b3e,transparent)}
    .header-inner{max-width:1200px;margin:0 auto}
    .header h1{font-size:2rem;font-weight:700;background:linear-gradient(135deg,#60a5fa,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:4px}
    .header .subtitle{color:#64748b;font-size:0.875rem}
    .run-meta{margin-top:16px;display:flex;gap:24px;font-size:0.8rem;color:#475569}
    .run-meta span{display:flex;align-items:center;gap:6px}

    /* Score banner */
    .score-banner{max-width:1200px;margin:32px auto;padding:0 40px}
    .score-grid{display:grid;grid-template-columns:auto 1fr 1fr 1fr 1fr;gap:24px;align-items:center}
    .score-circle{width:120px;height:120px;border-radius:50%;background:conic-gradient(${score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444'} ${score * 3.6}deg,#1e293b 0deg);display:flex;align-items:center;justify-content:center;position:relative}
    .score-inner{width:90px;height:90px;border-radius:50%;background:#0a0f1e;display:flex;flex-direction:column;align-items:center;justify-content:center}
    .score-num{font-size:1.75rem;font-weight:700;color:#e2e8f0}
    .score-label{font-size:0.6rem;color:#64748b;text-transform:uppercase;letter-spacing:1px}
    .stat-card{background:#111827;border:1px solid #1e293b;border-radius:12px;padding:20px;text-align:center}
    .stat-card .stat-num{font-size:2rem;font-weight:700;margin-bottom:4px}
    .stat-card .stat-lbl{font-size:0.75rem;color:#64748b;text-transform:uppercase;letter-spacing:1px}
    .stat-pass .stat-num{color:#22c55e}
    .stat-fail .stat-num{color:#ef4444}
    .stat-sec .stat-num{color:#f59e0b}
    .stat-warn .stat-num{color:#f97316}

    /* Progress bar */
    .progress-section{max-width:1200px;margin:0 auto 32px;padding:0 40px}
    .progress-bar{height:6px;background:#1e293b;border-radius:99px;overflow:hidden}
    .progress-fill{height:100%;background:linear-gradient(90deg,#22c55e,#86efac);border-radius:99px;transition:width 1s ease;width:${score}%}

    /* Main content */
    .main{max-width:1200px;margin:0 auto;padding:0 40px 60px}
    .section-title{font-size:1rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px}
    .suite-card{background:#111827;border:1px solid #1e293b;border-radius:16px;margin-bottom:20px;overflow:hidden;transition:border-color .2s}
    .suite-card:hover{border-color:#334155}
    .suite-header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #1e293b;background:#0d1b3e20}
    .suite-header h3{font-size:0.95rem;font-weight:600;color:#cbd5e1}
    .suite-score{font-size:0.8rem;color:#64748b;background:#1e293b;padding:4px 10px;border-radius:99px}

    .test-table{width:100%;border-collapse:collapse}
    .test-table th{text-align:left;padding:10px 16px;font-size:0.72rem;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #1e293b}
    .test-table td{padding:10px 16px;font-size:0.83rem;border-bottom:1px solid #0f172a;vertical-align:middle}
    .test-table tr:last-child td{border-bottom:none}
    .test-table .icon{width:32px;text-align:center;font-size:1rem}
    .test-name{color:#cbd5e1;font-weight:500}
    .detail{color:#475569;font-family:'JetBrains Mono',monospace;font-size:0.75rem;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .duration{color:#334155;font-family:'JetBrains Mono',monospace;font-size:0.75rem;text-align:right}

    .row-pass td{background:#052e16020}
    .row-fail td{background:#450a0a18}
    .row-security td{background:#451a0318}
    .row-warn td{background:#422a0518}

    .badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:0.7rem;font-weight:600;letter-spacing:0.5px}
    .badge-pass{background:#052e1640;color:#22c55e;border:1px solid #16532d}
    .badge-fail{background:#450a0a40;color:#ef4444;border:1px solid #7f1d1d}
    .badge-security{background:#451a0340;color:#f59e0b;border:1px solid #78350f}
    .badge-warn{background:#422a0540;color:#f97316;border:1px solid #7c2d12}

    /* Footer */
    .footer{text-align:center;padding:32px;border-top:1px solid #1e293b;color:#334155;font-size:0.8rem}
  </style>
</head>
<body class="gradient-bg">
  <div class="header">
    <div class="header-inner">
      <h1>🤖 CRM Testing Agent Report</h1>
      <p class="subtitle">Automated bug detection & security audit for Telesales CRM</p>
      <div class="run-meta">
        <span>📅 ${new Date().toLocaleString()}</span>
        <span>⏱ Total duration: ${durationMs}ms</span>
        <span>🎯 Tests run: ${total}</span>
        <span>🌐 ${process.env.API_URL || 'http://localhost:4000'}</span>
      </div>
    </div>
  </div>

  <div class="score-banner">
    <div class="score-grid">
      <div class="score-circle">
        <div class="score-inner">
          <span class="score-num">${score}%</span>
          <span class="score-label">Score</span>
        </div>
      </div>
      <div class="stat-card stat-pass"><div class="stat-num">${passed}</div><div class="stat-lbl">Passed</div></div>
      <div class="stat-card stat-fail"><div class="stat-num">${failed}</div><div class="stat-lbl">Failed</div></div>
      <div class="stat-card stat-sec"><div class="stat-num">${security}</div><div class="stat-lbl">Security Issues</div></div>
      <div class="stat-card stat-warn"><div class="stat-num">${warned}</div><div class="stat-lbl">Warnings</div></div>
    </div>
  </div>

  <div class="progress-section">
    <div class="progress-bar"><div class="progress-fill"></div></div>
  </div>

  <div class="main">
    <p class="section-title">Test Suites</p>
    ${suiteHtml}
  </div>

  <div class="footer">
    Generated by CRM Testing Agent · ${new Date().toISOString()}
  </div>
</body>
</html>`;
}
