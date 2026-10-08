import { Env } from '../types';
import { TelegramClient } from './client';
import { TelegramKeyboards } from './keyboards';
import { StatementDetector } from '../statements/detector';
import { Deduplicator } from '../statements/deduplicator';
import { TransferDetector } from '../finance/transfers';
import { TransactionCategorizer } from '../finance/categories';
import { FinancialReportsService } from '../finance/reports';
import { DecadePeriodService } from '../periods/decadePeriodService';
import { formatMoney } from '../utils/dates';

export class TelegramHandler {
  private client: TelegramClient;
  private detector: StatementDetector;

  constructor(private env: Env, private webAppUrl: string) {
    this.client = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
    this.detector = new StatementDetector();
  }

  public async handleUpdate(update: any): Promise<void> {
    if (update.message) {
      await this.handleMessage(update.message);
    } else if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query);
    }
  }

  private async ensureUser(from: any): Promise<string> {
    const telegramUserId = from.id;
    
    // Check if user already exists
    const existingUser = await this.env.DB.prepare(
      'SELECT id FROM users WHERE telegram_user_id = ?'
    ).bind(telegramUserId).first();

    let userId: string;
    if (existingUser && (existingUser as any).id) {
      userId = (existingUser as any).id;
      // Update names
      await this.env.DB.prepare(
        'UPDATE users SET username = ?, first_name = ?, last_name = ?, updated_at = datetime("now") WHERE id = ?'
      ).bind(from.username || null, from.first_name || '', from.last_name || '', userId).run();
    } else {
      userId = `usr_${telegramUserId}`;
      await this.env.DB.prepare(
        `INSERT INTO users (id, telegram_user_id, username, first_name, last_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      ).bind(userId, telegramUserId, from.username || null, from.first_name || '', from.last_name || '').run();
    }

    await this.env.DB.prepare(
      `INSERT OR IGNORE INTO user_settings (user_id, timezone, currency, statement_reminder_interval_hours, created_at, updated_at)
       VALUES (?, 'Asia/Almaty', 'KZT', 24, datetime('now'), datetime('now'))`
    ).bind(userId).run();

    return userId;
  }

  private async handleMessage(msg: any): Promise<void> {
    const chatId = msg.chat.id;
    const from = msg.from;
    const text = (msg.text || '').trim();

    const userId = await this.ensureUser(from);

    // Document upload handling
    if (msg.document) {
      await this.handleDocumentUpload(chatId, userId, msg.document);
      return;
    }

    if (text === '/start' || text === '📊 Главное меню') {
      const welcome = `👋 <b>Добро пожаловать в персональный финансовый трекер!</b>\n\n` +
        `Система автоматически учитывает доходы, расходы и переводы по декадам месяца для банков Казахстана:\n` +
        `• Kaspi Bank\n• Halyk Bank\n• Банк ЦентрКредит (BCC)\n• Alatau City Bank\n• Freedom Bank\n\n` +
        `Отправляйте файлы выписок (Excel, CSV) прямо в этот чат или откройте интерактивный <b>Dashboard</b>!`;
      await this.client.sendMessage(chatId, welcome, TelegramKeyboards.getMainMenu(this.webAppUrl));
      return;
    }

    if (text === '/help') {
      const help = `ℹ️ <b>Справка по боту:</b>\n\n` +
        `1. <b>Декадный цикл:</b>\n` +
        `   • 1 декада: 1–9 число\n` +
        `   • 2 декада: 10–19 число\n` +
        `   • 3 декада: 20–конец месяца\n\n` +
        `2. <b>Загрузка выписок:</b> просто отправьте полученный файл выписки из мобильного банкинга.\n\n` +
        `3. <b>Команды:</b>\n` +
        `/status — состояние текущей декады\n` +
        `/period — подробности по периодам\n` +
        `/banks — статус выписок по банкам\n` +
        `/dashboard — открыть Mini App`;
      await this.client.sendMessage(chatId, help);
      return;
    }

    if (text === '/status' || text === '📋 Текущий период') {
      await this.sendPeriodStatus(chatId, userId);
      return;
    }

    if (text === '/report' || text === '📊 Отчёт') {
      await this.sendPeriodReport(chatId, userId);
      return;
    }

    if (text === '📥 Загрузить выписку') {
      await this.client.sendMessage(chatId, '📤 Пожалуйста, отправьте файл банковской выписки (Excel, CSV, XLSX).');
      return;
    }

    if (text === '💳 Банки') {
      await this.sendBanksInfo(chatId, userId);
      return;
    }

    if (text === '💰 Бюджет' || text === '/budgets') {
      await this.client.sendMessage(chatId, `💰 Управление бюджетами доступно в Web App!`, TelegramKeyboards.getOpenDashboardInline(this.webAppUrl));
      return;
    }

    if (text === '⚙️ Настройки' || text === '/settings') {
      await this.client.sendMessage(chatId, `⚙️ Настройки:\nЧасовой пояс: <b>Asia/Almaty (UTC+5)</b>\nИнтервал напоминаний: <b>24ч</b>\nВалюта: <b>KZT</b>`);
      return;
    }

    // Default reply
    await this.client.sendMessage(chatId, `Выберите действие из меню:`, TelegramKeyboards.getMainMenu(this.webAppUrl));
  }

  private async handleDocumentUpload(chatId: number, userId: string, doc: any): Promise<void> {
    const filename = doc.file_name || 'statement.csv';
    await this.client.sendMessage(chatId, `⏳ Анализирую файл <b>${filename}</b>...`);

    // Download file
    const fileInfo = await this.client.getFile(doc.file_id);
    if (!fileInfo.ok || !fileInfo.result?.file_path) {
      await this.client.sendMessage(chatId, '❌ Не удалось загрузить файл из Telegram. Попробуйте еще раз.');
      return;
    }

    const fileBuffer = await this.client.downloadFile(fileInfo.result.file_path);
    const uint8 = new Uint8Array(fileBuffer);
    const asText = new TextDecoder().decode(uint8);

    // Save to R2 if available
    const r2Key = `${userId}/${Date.now()}_${filename}`;
    if (this.env.STATEMENTS_BUCKET) {
      await this.env.STATEMENTS_BUCKET.put(r2Key, uint8);
    }

    // Detect bank (pass uint8 for PDF or binary files)
    const isBinary = filename.endsWith('.pdf') || filename.endsWith('.xlsx') || filename.endsWith('.xls');
    let parser = this.detector.detectBank(filename, isBinary ? uint8 : asText);

    if (!parser) {
      // Fallback: Ask user to choose bank!
      await this.client.sendMessage(
        chatId,
        `⚠️ Не удалось автоматически определить банк для файла <code>${filename}</code>.\nПожалуйста, выберите банк вручную:`,
        TelegramKeyboards.getBankSelectionInline(doc.file_id)
      );
      return;
    }

    try {
      const isTextFormat = filename.endsWith('.csv') || filename.endsWith('.txt');
      const parsed = await parser.parse(filename, isTextFormat ? asText : uint8);
      await this.ingestStatement(chatId, userId, parsed, filename, r2Key);
    } catch (e: any) {
      console.error('Ingest error:', e);
      await this.client.sendMessage(chatId, `❌ Ошибка при чтении выписки: ${e.message}\n${e.stack || ''}`);
      throw e;
    }
  }

  public async ingestStatement(
    chatId: number,
    userId: string,
    parsed: any,
    filename: string,
    r2Key: string
  ): Promise<void> {
    // Ensure bank exists in DB with both 'bank_kaspi' and 'kaspi'
    const bankDbId = parsed.bankCode.startsWith('bank_') ? parsed.bankCode : `bank_${parsed.bankCode}`;
    await this.env.DB.prepare(
      `INSERT OR IGNORE INTO banks (id, code, name, is_active, supported_formats, created_at)
       VALUES (?, ?, ?, 1, 'csv,xlsx,pdf', datetime('now'))`
    ).bind(bankDbId, parsed.bankCode, parsed.bankName).run();

    // Determine Decade period based on operation dates
    const refDate = parsed.minDate ? new Date(parsed.minDate) : new Date();
    const decade = DecadePeriodService.findDecadeForDate(refDate, userId);

    try {
      await this.env.DB.prepare(
        `INSERT OR IGNORE INTO financial_periods (id, user_id, period_start, period_end, period_type, status, year, month, decade_index, created_at)
         VALUES (?, ?, ?, ?, ?, 'partial', ?, ?, ?, datetime('now'))`
      ).bind(
        decade.id,
        userId,
        decade.periodStart,
        decade.periodEnd,
        decade.periodType,
        decade.year,
        decade.month,
        decade.decadeIndex
      ).run();
    } catch (e: any) {
      throw new Error(`DB financial_periods insert error: ${e.message}`);
    }

    const statementId = `stmt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    try {
      await this.env.DB.prepare(
        `INSERT INTO statements (id, user_id, period_id, bank_id, filename, file_format, storage_r2_key, min_operation_date, max_operation_date, operations_count, total_income, total_expense, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'parsed', datetime('now'))`
      ).bind(
        statementId,
        userId,
        decade.id,
        bankDbId,
        filename,
        filename.split('.').pop() || 'csv',
        r2Key,
        parsed.minDate || null,
        parsed.maxDate || null,
        parsed.operationsCount,
        parsed.totalIncome,
        parsed.totalExpense
      ).run();
    } catch (e: any) {
      throw new Error(`DB statements insert error: ${e.message} (bankDbId: ${bankDbId}, decade: ${decade.id})`);
    }

    // Retrieve existing hashes for deduplication
    const existingRes = await this.env.DB.prepare(
      'SELECT external_hash FROM transactions WHERE user_id = ?'
    ).bind(userId).all();
    const existingHashes = new Set<string>((existingRes.results as any[]).map(r => r.external_hash));

    // Deduplication
    const { unique, duplicatesCount } = await Deduplicator.filterDuplicates(parsed.transactions, existingHashes);

    // Categorization & insertion
    for (const tx of unique) {
      const category = tx.category || TransactionCategorizer.categorize(tx.description, tx.merchant);
      const txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      await this.env.DB.prepare(
        `INSERT INTO transactions (id, user_id, bank_id, statement_id, period_id, operation_date, amount, currency, direction, description, merchant, category, bank_transaction_id, external_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      ).bind(
        txId,
        userId,
        bankDbId,
        statementId,
        decade.id,
        tx.operationDate,
        tx.amount,
        tx.currency,
        tx.direction,
        tx.description,
        tx.merchant || null,
        category,
        tx.bankTransactionId || null,
        tx.externalHash
      ).run();
    }

    // Update bank status for period
    const statusId = `pbs_${decade.id}_${parsed.bankCode}`;
    await this.env.DB.prepare(
      `INSERT INTO period_bank_status (id, period_id, user_id, bank_code, statement_id, status, updated_at)
       VALUES (?, ?, ?, ?, ?, 'uploaded', datetime('now'))
       ON CONFLICT(period_id, bank_code) DO UPDATE SET statement_id = ?, status = 'uploaded', updated_at = datetime('now')`
    ).bind(statusId, decade.id, userId, parsed.bankCode, statementId, statementId).run();

    // Run internal transfers detector across all period transactions
    const allPeriodTxRes = await this.env.DB.prepare(
      'SELECT * FROM transactions WHERE user_id = ? AND period_id = ?'
    ).bind(userId, decade.id).all();
    const periodTxList = allPeriodTxRes.results as any[];

    const normTxList = periodTxList.map(t => ({
      ...t,
      bankCode: t.bank_id,
      operationDate: t.operation_date,
      isInternalTransfer: Boolean(t.is_internal_transfer)
    }));

    const { linkedPairs } = TransferDetector.linkTransfers(normTxList);
    for (const pair of linkedPairs) {
      await this.env.DB.prepare(
        'UPDATE transactions SET is_internal_transfer = 1, direction = "transfer" WHERE id = ? OR id = ?'
      ).bind((pair.expenseTx as any).id, (pair.incomeTx as any).id).run();
    }

    // Check all uploaded banks
    const uploadedBanksRes = await this.env.DB.prepare(
      'SELECT bank_code FROM period_bank_status WHERE user_id = ? AND period_id = ? AND status = "uploaded"'
    ).bind(userId, decade.id).all();

    const uploadedBanks = (uploadedBanksRes.results as any[]).map(r => r.bank_code);
    const expected = ['kaspi', 'halyk', 'bcc', 'alatau', 'freedom'];
    const isComplete = expected.every(b => uploadedBanks.includes(b));

    // Confirmation message to user
    const dateRangeStr = parsed.minDate && parsed.maxDate
      ? `${parsed.minDate.slice(8, 10)}.${parsed.minDate.slice(5, 7)}–${parsed.maxDate.slice(8, 10)}.${parsed.maxDate.slice(5, 7)}`
      : decade.label;

    let reply = `✅ <b>Выписка принята</b>\n` +
      `Банк: <b>${parsed.bankName}</b>\n` +
      `Период: <b>${dateRangeStr}</b>\n` +
      `Операций: <b>${unique.length}</b> новых (пропущено ${duplicatesCount} дубликатов)\n` +
      `Расходы: <b>${formatMoney(parsed.totalExpense)}</b>\n` +
      `Поступления: <b>${formatMoney(parsed.totalIncome)}</b>\n\n` +
      `<b>Статус декады:</b>\n` +
      `Kaspi:     ${uploadedBanks.includes('kaspi') ? '✅' : '⏳'}\n` +
      `Halyk:     ${uploadedBanks.includes('halyk') ? '✅' : '⏳'}\n` +
      `BCC:       ${uploadedBanks.includes('bcc') ? '✅' : '⏳'}\n` +
      `Alatau:    ${uploadedBanks.includes('alatau') ? '✅' : '⏳'}\n` +
      `Freedom:   ${uploadedBanks.includes('freedom') ? '✅' : '⏳'}\n`;

    await this.client.sendMessage(chatId, reply);

    // If all 5 uploaded: automatically trigger full financial report
    if (isComplete) {
      await this.env.DB.prepare(
        'UPDATE financial_periods SET status = "processed", completed_at = datetime("now") WHERE id = ?'
      ).bind(decade.id).run();

      const analytics = FinancialReportsService.computeAnalytics(normTxList, decade.label, uploadedBanks, expected);
      const reportText = `🎉 <b>Все банковские выписки получены!</b>\n\n` + FinancialReportsService.formatTelegramReport(analytics);
      await this.client.sendMessage(chatId, reportText, TelegramKeyboards.getOpenDashboardInline(this.webAppUrl));
    }
  }

  private async sendPeriodStatus(chatId: number, userId: string): Promise<void> {
    const promptInfo = DecadePeriodService.getCurrentOrPromptDecade(new Date(), userId);
    const decade = promptInfo.activeDecade;

    const uploadedRes = await this.env.DB.prepare(
      'SELECT bank_code FROM period_bank_status WHERE user_id = ? AND period_id = ? AND status = "uploaded"'
    ).bind(userId, decade.id).all();
    const uploadedBanks = (uploadedRes.results as any[]).map(r => r.bank_code);

    const statsRes = await this.env.DB.prepare(
      `SELECT count(*) as cnt,
              sum(case when direction = 'expense' and is_internal_transfer = 0 then amount else 0 end) as exp,
              sum(case when direction = 'income' and is_internal_transfer = 0 then amount else 0 end) as inc
       FROM transactions WHERE user_id = ? AND period_id = ?`
    ).bind(userId, decade.id).first();

    const expected = ['kaspi', 'halyk', 'bcc', 'alatau', 'freedom'];
    const missing = expected.filter(b => !uploadedBanks.includes(b));

    let msg = `📊 <b>Период: ${decade.label}</b>\n\n` +
      `Kaspi:     ${uploadedBanks.includes('kaspi') ? '✅' : '❌'}\n` +
      `Halyk:     ${uploadedBanks.includes('halyk') ? '✅' : '❌'}\n` +
      `BCC:       ${uploadedBanks.includes('bcc') ? '✅' : '❌'}\n` +
      `Alatau:    ${uploadedBanks.includes('alatau') ? '✅' : '❌'}\n` +
      `Freedom:   ${uploadedBanks.includes('freedom') ? '✅' : '❌'}\n\n` +
      `Операций: <b>${(statsRes as any)?.cnt || 0}</b>\n` +
      `Расходы:  <b>${formatMoney((statsRes as any)?.exp || 0)}</b>\n` +
      `Доходы:   <b>${formatMoney((statsRes as any)?.inc || 0)}</b>\n\n`;

    if (missing.length > 0) {
      msg += `⚠️ Период ещё не закрыт.\nНе хватает ${missing.length} выписок.`;
    } else {
      msg += `✅ Все 5 банков загружены! Период закрыт.`;
    }

    await this.client.sendMessage(chatId, msg, TelegramKeyboards.getOpenDashboardInline(this.webAppUrl));
  }

  private async sendPeriodReport(chatId: number, userId: string): Promise<void> {
    const promptInfo = DecadePeriodService.getCurrentOrPromptDecade(new Date(), userId);
    const decade = promptInfo.activeDecade;

    const txRes = await this.env.DB.prepare(
      'SELECT * FROM transactions WHERE user_id = ? AND period_id = ?'
    ).bind(userId, decade.id).all();

    const normTxList = (txRes.results as any[]).map(t => ({
      ...t,
      bankCode: t.bank_id,
      operationDate: t.operation_date,
      isInternalTransfer: Boolean(t.is_internal_transfer)
    }));

    const uploadedRes = await this.env.DB.prepare(
      'SELECT bank_code FROM period_bank_status WHERE user_id = ? AND period_id = ? AND status = "uploaded"'
    ).bind(userId, decade.id).all();
    const uploadedBanks = (uploadedRes.results as any[]).map(r => r.bank_code);

    const analytics = FinancialReportsService.computeAnalytics(normTxList, decade.label, uploadedBanks);
    const text = FinancialReportsService.formatTelegramReport(analytics);
    await this.client.sendMessage(chatId, text, TelegramKeyboards.getOpenDashboardInline(this.webAppUrl));
  }

  private async sendBanksInfo(chatId: number, userId: string): Promise<void> {
    const msg = `💳 <b>Поддерживаемые банки Казахстана:</b>\n\n` +
      `1. <b>Kaspi Bank</b> (XLSX, CSV, TXT)\n` +
      `2. <b>Halyk Bank</b> (XLSX, XLS, CSV)\n` +
      `3. <b>Банк ЦентрКредит (BCC)</b> (XLSX, CSV)\n` +
      `4. <b>Alatau City Bank</b> (XLSX, CSV)\n` +
      `5. <b>Freedom Bank</b> (XLSX, CSV, мультивалютные выписки)\n\n` +
      `<i>Вы можете загружать выписки в любом порядке — бот автоматически сгруппирует операции по декадам и проверит дубли.</i>`;
    await this.client.sendMessage(chatId, msg);
  }

  private async handleCallbackQuery(cb: any): Promise<void> {
    const data = cb.data || '';
    const chatId = cb.message?.chat?.id;
    const userId = `usr_${cb.from.id}`;

    if (data.startsWith('bank_select:')) {
      const parts = data.split(':');
      const bankCode = parts[1];
      const fileId = parts[2];
      await this.client.sendMessage(chatId, `Выбран банк: <b>${bankCode.toUpperCase()}</b>. Обрабатываю...`);
      // Re-trigger parse with explicit parser
      const parser = this.detector.getParserByCode(bankCode);
      if (parser) {
        const fileInfo = await this.client.getFile(fileId);
        if (fileInfo.ok && fileInfo.result?.file_path) {
          const buf = await this.client.downloadFile(fileInfo.result.file_path);
          const uint8 = new Uint8Array(buf);
          const asText = new TextDecoder().decode(uint8);
          const parsed = await parser.parse('manual.csv', asText);
          await this.ingestStatement(chatId, userId, parsed, 'manual.csv', '');
        }
      }
    }
  }
}
