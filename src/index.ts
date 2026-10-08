import { Env } from './types';
import { TelegramHandler } from './telegram/handler';
import { TelegramClient } from './telegram/client';
import { validateTelegramWebAppData } from './telegram/webAppAuth';
import { StatementReminderService } from './scheduler/statementReminder';
import { DecadePeriodService } from './periods/decadePeriodService';
import { FinancialReportsService } from './finance/reports';
import { renderWebAppHtml } from './webapp/render';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const webAppUrl = `${url.origin}/app`;

    // Root status endpoint
    if (url.pathname === '/' && request.method === 'GET') {
      return new Response(
        JSON.stringify({
          status: 'online',
          app: 'telegram-finance-tracker',
          timezone: env.DEFAULT_TIMEZONE || 'Asia/Almaty',
          reminder_interval_hours: env.STATEMENT_REMINDER_INTERVAL_HOURS || '24',
          timestamp: new Date().toISOString()
        }, null, 2),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url.pathname === '/debug-db') {
      try {
        const users = await env.DB.prepare('SELECT * FROM users LIMIT 5').all();
        const stmts = await env.DB.prepare('SELECT * FROM statements LIMIT 5').all();
        const txs = await env.DB.prepare('SELECT id, user_id, amount, description, operation_date FROM transactions LIMIT 10').all();
        const periods = await env.DB.prepare('SELECT * FROM financial_periods LIMIT 5').all();
        return new Response(JSON.stringify({ users: users.results, statements: stmts.results, txs: txs.results, periods: periods.results }, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
      }
    }
    if (url.pathname === '/setup-webhook' && request.method === 'GET') {
      const webhookUrl = `${url.origin}/telegram/webhook`;
      const client = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
      const res = await client.setWebhook(webhookUrl, env.TELEGRAM_WEBHOOK_SECRET);
      await client.setMenuButton(webAppUrl);
      return new Response(JSON.stringify({ webhookUrl, webAppUrl, result: res }, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Telegram Bot Webhook endpoint
    if (url.pathname === '/telegram/webhook' && request.method === 'POST') {
      // Validate secret token header
      const secretHeader = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
      if (env.TELEGRAM_WEBHOOK_SECRET && secretHeader !== env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response('Unauthorized webhook token', { status: 401 });
      }

      try {
        const update = await request.json();
        const handler = new TelegramHandler(env, webAppUrl);
        await handler.handleUpdate(update);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        console.error('Webhook error:', err);
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Telegram Web App HTML Page: /app
    if (url.pathname === '/app') {
      return new Response(renderWebAppHtml(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // Web App REST API: /api/dashboard
    if (url.pathname === '/api/dashboard' && request.method === 'GET') {
      try {
        const initData = request.headers.get('X-Telegram-Init-Data') || '';
        let effectiveUserId = 'usr_default';
        if (initData) {
        const auth = await validateTelegramWebAppData(initData, env.TELEGRAM_BOT_TOKEN);
        if (auth.isValid && auth.user?.id) {
          const uRow = await env.DB.prepare('SELECT id FROM users WHERE telegram_user_id = ?').bind(auth.user.id).first();
          if (uRow && (uRow as any).id) {
            effectiveUserId = (uRow as any).id;
          } else {
            effectiveUserId = `usr_${auth.user.id}`;
          }
        }
      } else {
        // Fallback for direct browser preview
        const firstUser = await env.DB.prepare('SELECT id FROM users ORDER BY created_at ASC LIMIT 1').first();
        if (firstUser && (firstUser as any).id) {
          effectiveUserId = (firstUser as any).id;
        }
      }

      // Check decade index query param
      const decadeParam = parseInt(url.searchParams.get('decade') || '1', 10);
      const parts = DecadePeriodService.getDecadesForMonth(2026, 10, effectiveUserId);
      const targetDecade = decadeParam >= 1 && decadeParam <= 3 ? parts[decadeParam - 1] : parts[0];

      // Query transactions for target period
      let txRows: any[] = [];
      if (decadeParam === 0) {
        // entire month
        const res = await env.DB.prepare(
          'SELECT * FROM transactions WHERE user_id = ? ORDER BY operation_date DESC'
        ).bind(effectiveUserId).all();
        txRows = res.results;
      } else {
        const res = await env.DB.prepare(
          'SELECT * FROM transactions WHERE user_id = ? AND period_id = ? ORDER BY operation_date DESC'
        ).bind(effectiveUserId, targetDecade.id).all();
        txRows = res.results;
      }

      const normTx = txRows.map(t => ({
        ...t,
        bankCode: t.bank_id,
        operationDate: t.operation_date,
        isInternalTransfer: Boolean(t.is_internal_transfer)
      }));

      // Query uploaded banks
      let uploadedBanks: string[] = [];
      if (decadeParam === 0) {
        const upRes = await env.DB.prepare(
          'SELECT DISTINCT bank_code FROM period_bank_status WHERE user_id = ? AND status = "uploaded"'
        ).bind(effectiveUserId).all();
        uploadedBanks = (upRes.results as any[]).map(r => r.bank_code);
      } else {
        const upRes = await env.DB.prepare(
          'SELECT bank_code FROM period_bank_status WHERE user_id = ? AND period_id = ? AND status = "uploaded"'
        ).bind(effectiveUserId, targetDecade.id).all();
        uploadedBanks = (upRes.results as any[]).map(r => r.bank_code);
      }

      const periodTitle = decadeParam === 0 ? 'Весь октябрь 2026' : targetDecade.label;
      const analytics = FinancialReportsService.computeAnalytics(normTx, periodTitle, uploadedBanks);

      return new Response(
        JSON.stringify({
          ...analytics,
          recentTransactions: txRows.slice(0, 50)
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

    // Web App REST API: /api/periods
    if (url.pathname === '/api/periods' && request.method === 'GET') {
      const decades = DecadePeriodService.getDecadesForMonth(2026, 10);
      return new Response(JSON.stringify(decades), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Reprocess period: /api/period/:id/reprocess
    if (url.pathname.includes('/reprocess') && request.method === 'POST') {
      return new Response(JSON.stringify({ ok: true, status: 'reprocessed' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not Found', { status: 404 });
  },

  /**
   * Cloudflare Cron Trigger (Scheduled Task)
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(StatementReminderService.checkAndSendReminders(env));
  }
};
