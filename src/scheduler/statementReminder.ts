import { Env } from '../types';
import { TelegramClient } from '../telegram/client';
import { DecadePeriodService } from '../periods/decadePeriodService';
import { FinancialReportsService } from '../finance/reports';

export class StatementReminderService {
  /**
   * Run during Cloudflare Cron trigger
   */
  public static async checkAndSendReminders(env: Env, forcedDate?: Date) {
    const client = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
    const currentDate = forcedDate || new Date();
    const promptInfo = DecadePeriodService.getCurrentOrPromptDecade(currentDate);

    // Get all users
    const usersRes = await env.DB.prepare('SELECT id, telegram_user_id FROM users').all();
    const users = usersRes.results as { id: string; telegram_user_id: number }[];

    const expectedBanks = ['kaspi', 'halyk', 'bcc', 'alatau', 'freedom'];

    for (const user of users) {
      // Check uploaded banks for active decade
      const periodId = promptInfo.activeDecade.id;
      const uploadedRes = await env.DB.prepare(
        'SELECT bank_code FROM period_bank_status WHERE user_id = ? AND period_id = ? AND status = "uploaded"'
      ).bind(user.id, periodId).all();

      const uploadedBanks = (uploadedRes.results as { bank_code: string }[]).map(r => r.bank_code);
      const missingBanks = expectedBanks.filter(b => !uploadedBanks.includes(b));

      if (promptInfo.isPromptDay && uploadedBanks.length === 0) {
        // Scheduled prompt day (10th, 20th, 1st) - send initial notification
        const msg = `${promptInfo.promptMessage}\n\nНеобходимо предоставить выписки:\n` +
          expectedBanks.map(b => `□ ${this.bankDisplayName(b)}`).join('\n');
        await client.sendMessage(user.telegram_user_id, msg);
      } else if (missingBanks.length > 0 && missingBanks.length < 5) {
        // Check reminder interval
        const settingsRes = await env.DB.prepare(
          'SELECT statement_reminder_interval_hours, last_reminder_at FROM user_settings WHERE user_id = ?'
        ).bind(user.id).first();

        const intervalHours = (settingsRes as any)?.statement_reminder_interval_hours || 24;
        const lastReminder = (settingsRes as any)?.last_reminder_at;

        let shouldRemind = true;
        if (lastReminder) {
          const hoursSince = (Date.now() - new Date(lastReminder).getTime()) / (3600 * 1000);
          if (hoursSince < intervalHours) {
            shouldRemind = false;
          }
        }

        if (shouldRemind) {
          const msg = `⚠️ Не хватает выписок\nЗа период ${promptInfo.activeDecade.label} отсутствуют:\n` +
            missingBanks.map(b => `❌ ${this.bankDisplayName(b)}`).join('\n') +
            `\n\nПожалуйста, загрузите их.`;
          await client.sendMessage(user.telegram_user_id, msg);

          await env.DB.prepare(
            'UPDATE user_settings SET last_reminder_at = datetime("now") WHERE user_id = ?'
          ).bind(user.id).run();
        }
      }
    }
  }

  private static bankDisplayName(code: string): string {
    const map: Record<string, string> = {
      kaspi: 'Kaspi',
      halyk: 'Halyk',
      bcc: 'BCC',
      alatau: 'Alatau City Bank',
      freedom: 'Freedom Bank'
    };
    return map[code] || code.toUpperCase();
  }
}
