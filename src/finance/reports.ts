import { formatMoney } from '../utils/dates';
import { NormalizedTransaction } from '../types';

export interface CategorySummary {
  category: string;
  totalExpense: number;
  percentage: number;
  count: number;
  icon?: string;
}

export interface FinancialAnalytics {
  periodLabel: string;
  totalIncome: number;
  totalExpense: number;
  netCashFlow: number; // income - expense
  totalTransfers: number;
  transferCount: number;
  totalCommissions: number;
  operationsCount: number;
  topCategories: CategorySummary[];
  bankExpenses: Record<string, number>;
  dailyExpenses: Record<string, number>;
  largestExpense?: NormalizedTransaction;
  largestIncome?: NormalizedTransaction;
  isComplete: boolean;
  missingBanks: string[];
}

export class FinancialReportsService {
  private static categoryIcons: Record<string, string> = {
    'Продукты': '🍔',
    'Рестораны': '☕️',
    'Кафе': '☕️',
    'Такси': '🚕',
    'Топливо': '⛽️',
    'Автомобиль': '🚗',
    'Жильё': '🏠',
    'Коммунальные услуги': '💡',
    'Связь': '📱',
    'Интернет': '🌐',
    'Здоровье': '💊',
    'Одежда': '👗',
    'Покупки': '🛒',
    'Развлечения': '🎬',
    'Подписки': '📺',
    'Кредиты': '💳',
    'Банковские комиссии': '🏦',
    'Переводы': '🔄',
    'Другое': '📦'
  };

  public static getCategoryIcon(cat: string): string {
    return this.categoryIcons[cat] || '🏷';
  }

  public static computeAnalytics(
    transactions: NormalizedTransaction[],
    periodLabel: string,
    uploadedBanks: string[],
    allExpectedBanks: string[] = ['kaspi', 'halyk', 'bcc', 'alatau', 'freedom']
  ): FinancialAnalytics {
    let totalIncome = 0;
    let totalExpense = 0;
    let totalTransfers = 0;
    let transferCount = 0;
    let totalCommissions = 0;

    const categoryTotals: Record<string, { total: number; count: number }> = {};
    const bankExpenses: Record<string, number> = {};
    const dailyExpenses: Record<string, number> = {};

    let largestExpense: NormalizedTransaction | undefined;
    let largestIncome: NormalizedTransaction | undefined;

    for (const tx of transactions) {
      const isInternal = (tx as any).isInternalTransfer || tx.direction === 'transfer';
      const dayKey = tx.operationDate.slice(0, 10);

      if (isInternal) {
        // Count transfer amount once (avoid doubling both expense and income legs)
        if (tx.direction === 'expense' || !tx.direction) {
          totalTransfers += tx.amount;
        }
        transferCount++;
        continue; // exclude internal transfers from general income/expense!
      }

      if (tx.direction === 'income') {
        totalIncome += tx.amount;
        if (!largestIncome || tx.amount > largestIncome.amount) {
          largestIncome = tx;
        }
      } else if (tx.direction === 'expense') {
        totalExpense += tx.amount;

        // Daily
        dailyExpenses[dayKey] = (dailyExpenses[dayKey] || 0) + tx.amount;

        // Bank breakdown
        bankExpenses[tx.bankCode] = (bankExpenses[tx.bankCode] || 0) + tx.amount;

        // Category breakdown
        const cat = tx.category || 'Другое';
        if (!categoryTotals[cat]) {
          categoryTotals[cat] = { total: 0, count: 0 };
        }
        categoryTotals[cat].total += tx.amount;
        categoryTotals[cat].count += 1;

        if (cat === 'Банковские комиссии') {
          totalCommissions += tx.amount;
        }

        if (!largestExpense || tx.amount > largestExpense.amount) {
          largestExpense = tx;
        }
      }
    }

    const topCategories: CategorySummary[] = Object.entries(categoryTotals)
      .map(([cat, info]) => ({
        category: cat,
        totalExpense: info.total,
        percentage: totalExpense > 0 ? Math.round((info.total / totalExpense) * 100) : 0,
        count: info.count,
        icon: this.getCategoryIcon(cat)
      }))
      .sort((a, b) => b.totalExpense - a.totalExpense);

    const missingBanks = allExpectedBanks.filter(b => !uploadedBanks.includes(b));
    const isComplete = missingBanks.length === 0;

    return {
      periodLabel,
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalExpense: Math.round(totalExpense * 100) / 100,
      netCashFlow: Math.round((totalIncome - totalExpense) * 100) / 100,
      totalTransfers: Math.round(totalTransfers * 100) / 100,
      transferCount,
      totalCommissions: Math.round(totalCommissions * 100) / 100,
      operationsCount: transactions.length,
      topCategories,
      bankExpenses,
      dailyExpenses,
      largestExpense,
      largestIncome,
      isComplete,
      missingBanks
    };
  }

  /**
   * Formats Telegram Report text
   */
  public static formatTelegramReport(analytics: FinancialAnalytics): string {
    const balanceSign = analytics.netCashFlow >= 0 ? '+' : '';
    const balanceStr = `${balanceSign}${formatMoney(analytics.netCashFlow)}`;

    let msg = `📊 Финансовый отчёт\n${analytics.periodLabel}\n\n`;
    msg += `Доходы:    ${formatMoney(analytics.totalIncome)}\n`;
    msg += `Расходы:   ${formatMoney(analytics.totalExpense)}\n`;
    msg += `Баланс:    ${balanceStr}\n`;
    msg += `Операций:  ${analytics.operationsCount}\n\n`;

    if (analytics.topCategories.length > 0) {
      msg += `Топ категорий:\n`;
      const top5 = analytics.topCategories.slice(0, 5);
      for (const c of top5) {
        msg += `${c.icon} ${c.category} — ${formatMoney(c.totalExpense)} (${c.percentage}%)\n`;
      }
      msg += `\n`;
    }

    if (!analytics.isComplete) {
      msg += `⚠️ Внимание: Данные частичные.\nНе загружены выписки:\n`;
      for (const mb of analytics.missingBanks) {
        msg += `❌ ${mb.toUpperCase()}\n`;
      }
    } else {
      msg += `✅ Все 5 банков успешно учтены.\n`;
    }

    return msg;
  }
}
