export function renderWebAppHtml(): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Wallet | Финансы</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --text: #f8fafc;
      --subtext: #94a3b8;
      --accent: #38bdf8;
      --income: #10b981;
      --expense: #ef4444;
      --border: #334155;
    }
    body {
      margin: 0;
      padding: 0 0 70px 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      -webkit-font-smoothing: antialiased;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 16px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .header h1 {
      font-size: 20px;
      font-weight: 700;
      margin: 0;
    }
    .card {
      background: var(--card-bg);
      border-radius: 16px;
      padding: 18px;
      margin-bottom: 16px;
      border: 1px solid var(--border);
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    .summary-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 12px;
    }
    .summary-item {
      background: rgba(15, 23, 42, 0.6);
      padding: 12px;
      border-radius: 12px;
    }
    .summary-label {
      font-size: 12px;
      color: var(--subtext);
      margin-bottom: 4px;
    }
    .summary-val {
      font-size: 18px;
      font-weight: 700;
    }
    .income-val { color: var(--income); }
    .expense-val { color: var(--expense); }
    .balance-val { color: var(--accent); }

    .period-tabs {
      display: flex;
      background: var(--card-bg);
      border-radius: 12px;
      padding: 4px;
      margin-bottom: 16px;
      border: 1px solid var(--border);
    }
    .period-tab {
      flex: 1;
      text-align: center;
      padding: 8px 4px;
      font-size: 13px;
      font-weight: 600;
      border-radius: 8px;
      cursor: pointer;
      color: var(--subtext);
      transition: all 0.2s;
    }
    .period-tab.active {
      background: var(--accent);
      color: #0f172a;
    }
    .section-title {
      font-size: 15px;
      font-weight: 600;
      margin: 0 0 12px 0;
      display: flex;
      justify-content: space-between;
    }
    .chart-container {
      position: relative;
      height: 220px;
      margin-bottom: 8px;
    }
    .tx-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid var(--border);
    }
    .tx-item:last-child { border-bottom: none; }
    .tx-left { display: flex; align-items: center; gap: 12px; }
    .tx-icon {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: rgba(56, 189, 248, 0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
    }
    .tx-title { font-size: 14px; font-weight: 600; }
    .tx-sub { font-size: 11px; color: var(--subtext); }
    .tx-amount { font-size: 15px; font-weight: 700; text-align: right; }

    .bottom-nav {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: var(--card-bg);
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: space-around;
      padding: 8px 0;
      z-index: 100;
    }
    .nav-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      font-size: 10px;
      color: var(--subtext);
      cursor: pointer;
    }
    .nav-item.active { color: var(--accent); font-weight: 600; }
    .nav-icon { font-size: 20px; margin-bottom: 2px; }

    .badge-status {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      background: rgba(239, 68, 68, 0.2);
      color: var(--expense);
    }
    .badge-status.complete {
      background: rgba(16, 185, 129, 0.2);
      color: var(--income);
    }
  </style>
</head>
<body>
  <div class="container" id="app">
    <div class="header">
      <div>
        <h1 id="userGreeting">Финансы</h1>
        <div id="periodSubtitle" style="font-size: 12px; color: var(--subtext);">Октябрь 2026</div>
      </div>
      <div id="periodBadge" class="badge-status">5 банков</div>
    </div>

    <!-- Decade selector -->
    <div class="period-tabs">
      <div class="period-tab active" onclick="switchDecade(1)">1–9 число</div>
      <div class="period-tab" onclick="switchDecade(2)">10–19 число</div>
      <div class="period-tab" onclick="switchDecade(3)">20–конец</div>
      <div class="period-tab" onclick="switchDecade(0)">Весь месяц</div>
    </div>

    <!-- Main balance card -->
    <div class="card">
      <div class="summary-label">Чистый баланс за период</div>
      <div class="summary-val balance-val" id="totalBalance">+354 680 ₸</div>

      <div class="summary-grid">
        <div class="summary-item">
          <div class="summary-label">Доходы</div>
          <div class="summary-val income-val" id="totalIncome">+600 000 ₸</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">Расходы</div>
          <div class="summary-val expense-val" id="totalExpense">-245 320 ₸</div>
        </div>
      </div>
    </div>

    <!-- Donut Chart: Categories -->
    <div class="card">
      <div class="section-title">
        <span>Расходы по категориям</span>
        <span id="catTotal" style="color: var(--subtext); font-size: 13px;"></span>
      </div>
      <div class="chart-container">
        <canvas id="categoryChart"></canvas>
      </div>
    </div>

    <!-- Bar Chart: Banks -->
    <div class="card">
      <div class="section-title">Расходы по банкам</div>
      <div class="chart-container">
        <canvas id="bankChart"></canvas>
      </div>
    </div>

    <!-- Operations List -->
    <div class="card">
      <div class="section-title">
        <span>Последние операции</span>
        <span id="opsCount" style="color: var(--subtext); font-size: 12px;"></span>
      </div>
      <div id="transactionsList">
        <!-- Rendered dynamically -->
      </div>
    </div>
  </div>

  <!-- Bottom Nav -->
  <div class="bottom-nav">
    <div class="nav-item active"><span class="nav-icon">📊</span>Обзор</div>
    <div class="nav-item" onclick="alert('Доступно в полной версии: поиск и фильтры по всем счетам')"><span class="nav-icon">💳</span>Операции</div>
    <div class="nav-item" onclick="alert('Банки: Kaspi, Halyk, BCC, Alatau, Freedom')"><span class="nav-icon">🏦</span>Банки</div>
    <div class="nav-item" onclick="alert('Бюджеты: Продукты 100k, Такси 30k, Топливо 40k')"><span class="nav-icon">💰</span>Бюджет</div>
  </div>

  <script>
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.expand();
      tg.ready();
      if (tg.initDataUnsafe?.user?.first_name) {
        document.getElementById('userGreeting').innerText = 'Привет, ' + tg.initDataUnsafe.user.first_name;
      }
    }

    let categoryChartInstance = null;
    let bankChartInstance = null;

    async function loadDashboard(decadeIdx = 1) {
      try {
        const initData = tg?.initData || '';
        const res = await fetch('/api/dashboard?decade=' + decadeIdx, {
          headers: { 'X-Telegram-Init-Data': initData }
        });
        const data = await res.json();
        renderData(data);
      } catch (e) {
        console.error('Error fetching dashboard:', e);
      }
    }

    function renderData(data) {
      document.getElementById('totalBalance').innerText = (data.netCashFlow >= 0 ? '+' : '') + formatKzt(data.netCashFlow);
      document.getElementById('totalIncome').innerText = '+' + formatKzt(data.totalIncome);
      document.getElementById('totalExpense').innerText = '-' + formatKzt(data.totalExpense);
      document.getElementById('periodSubtitle').innerText = data.periodLabel || 'Октябрь 2026';
      document.getElementById('opsCount').innerText = data.operationsCount + ' оп.';

      renderCategoryChart(data.topCategories || []);
      renderBankChart(data.bankExpenses || {});
      renderTransactions(data.recentTransactions || []);
    }

    function renderCategoryChart(cats) {
      const ctx = document.getElementById('categoryChart').getContext('2d');
      if (categoryChartInstance) categoryChartInstance.destroy();

      const labels = cats.slice(0, 6).map(c => c.category);
      const values = cats.slice(0, 6).map(c => c.totalExpense);
      const colors = ['#f43f5e', '#38bdf8', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

      categoryChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data: values,
            backgroundColor: colors,
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 11 } } }
          }
        }
      });
    }

    function renderBankChart(bankExpenses) {
      const ctx = document.getElementById('bankChart').getContext('2d');
      if (bankChartInstance) bankChartInstance.destroy();

      const labels = Object.keys(bankExpenses).map(b => b.toUpperCase());
      const values = Object.values(bankExpenses);

      bankChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Расход',
            data: values,
            backgroundColor: '#38bdf8',
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
            y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }
          },
          plugins: { legend: { display: false } }
        }
      });
    }

    function renderTransactions(txs) {
      const container = document.getElementById('transactionsList');
      if (!txs || txs.length === 0) {
        container.innerHTML = '<div style="color: var(--subtext); text-align: center; padding: 20px;">Нет операций</div>';
        return;
      }

      container.innerHTML = txs.map(t => {
        const isInc = t.direction === 'income';
        const isTransfer = t.direction === 'transfer' || t.is_internal_transfer;
        const color = isTransfer ? 'var(--accent)' : isInc ? 'var(--income)' : 'var(--expense)';
        const sign = isTransfer ? '⇄ ' : isInc ? '+' : '-';
        const icon = isTransfer ? '🔄' : isInc ? '💰' : '🛒';

        return \`
          <div class="tx-item">
            <div class="tx-left">
              <div class="tx-icon">\${icon}</div>
              <div>
                <div class="tx-title">\${escapeHtml(t.description || t.merchant || 'Операция')}</div>
                <div class="tx-sub">\${t.bank_id?.toUpperCase() || ''} • \${t.category || 'Другое'} • \${t.operation_date?.slice(0, 10)}</div>
              </div>
            </div>
            <div class="tx-amount" style="color: \${color}">
              \${sign}\${formatKzt(t.amount)}
            </div>
          </div>
        \`;
      }).join('');
    }

    function switchDecade(idx) {
      const tabs = document.querySelectorAll('.period-tab');
      tabs.forEach((t, i) => {
        if ((idx === 1 && i === 0) || (idx === 2 && i === 1) || (idx === 3 && i === 2) || (idx === 0 && i === 3)) {
          t.classList.add('active');
        } else {
          t.classList.remove('active');
        }
      });
      loadDashboard(idx);
    }

    function formatKzt(num) {
      return Math.round(num).toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g, ' ') + ' ₸';
    }

    function escapeHtml(str) {
      return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    loadDashboard(1);
  </script>
</body>
</html>`;
}
