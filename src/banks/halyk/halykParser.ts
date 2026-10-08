import { ParsedStatementResult, StatementParser, NormalizedTransaction } from '../../types';
import * as XLSX from 'xlsx';

/**
 * HalykStatementParser
 * Supported: Excel (XLSX, XLS), CSV, PDF
 * Halyk statements usually feature:
 * - "Halyk Bank" / "Народный Банк Казахстана"
 * - Separate columns for "Дебет" (Expense) and "Кредит" (Income) or single Amount with type
 * - Dates format: DD.MM.YYYY
 */
export class HalykStatementParser implements StatementParser {
  public bankCode = 'halyk';
  public bankName = 'Halyk Bank';

  public canParse(filename: string, content: Uint8Array | string): boolean {
    const fn = filename.toLowerCase();
    if (fn.includes('halyk') || fn.includes('халык')) return true;

    if (typeof content === 'string') {
      const lower = content.toLowerCase();
      if (lower.includes('halyk') || lower.includes('халык') || lower.includes('народный банк')) return true;
    }
    return false;
  }

  public async parse(filename: string, content: Uint8Array | string): Promise<ParsedStatementResult> {
    const transactions: NormalizedTransaction[] = [];
    let accountNumber: string | undefined;
    let statementDate: string | undefined;

    let rows: any[][] = [];

    if (typeof content === 'string') {
      const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      for (const line of lines) {
        const delimiter = line.includes(';') ? ';' : line.includes('\t') ? '\t' : ',';
        const cols = line.split(delimiter).map(c => c.trim().replace(/^"|"$/g, ''));
        rows.push(cols);
      }
    } else {
      const workbook = XLSX.read(content, { type: 'buffer' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
    }

    let headerRowIdx = -1;
    let dateCol = -1;
    let descCol = -1;
    let debitCol = -1; // Expense
    let creditCol = -1; // Income
    let amountCol = -1;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].map(c => String(c || '').toLowerCase().trim());
      const lineStr = r.join(' ');

      if (lineStr.includes('iban') || lineStr.includes('счет') || lineStr.includes('счёт')) {
        const found = lineStr.match(/(kz\d{18})/i);
        if (found) accountNumber = found[1].toUpperCase();
      }

      const dIdx = r.findIndex(c => c.includes('дата') || c.includes('date'));
      const debIdx = r.findIndex(c => c.includes('дебет') || c.includes('расход') || c.includes('списание'));
      const credIdx = r.findIndex(c => c.includes('кредит') || c.includes('приход') || c.includes('пополнение'));
      const aIdx = r.findIndex(c => c.includes('сумма') || c.includes('amount'));

      if (dIdx !== -1 && (debIdx !== -1 || aIdx !== -1)) {
        headerRowIdx = i;
        dateCol = dIdx;
        debitCol = debIdx;
        creditCol = credIdx;
        amountCol = aIdx;
        descCol = r.findIndex(c => c.includes('назначение') || c.includes('детали') || c.includes('описание') || c.includes('контрагент'));
        if (descCol === -1) descCol = dIdx === 0 ? 1 : 0;
        break;
      }
    }

    if (headerRowIdx === -1) {
      throw new Error('HalykStatementParser: Не найдены заголовки выписки Halyk');
    }

    let totalIncome = 0;
    let totalExpense = 0;

    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length === 0) continue;

      const rawDate = String(r[dateCol] || '').trim();
      const rawDesc = String(r[descCol] || '').trim();

      if (!rawDate || !/^\d{2}[./-]\d{2}[./-]\d{2,4}/.test(rawDate)) {
        continue;
      }

      const isoDate = this.parseDate(rawDate);
      let income = 0;
      let expense = 0;

      if (debitCol !== -1 && creditCol !== -1) {
        expense = this.cleanAmount(String(r[debitCol] || ''));
        income = this.cleanAmount(String(r[creditCol] || ''));
      } else if (amountCol !== -1) {
        const amtStr = String(r[amountCol] || '');
        if (amtStr.includes('-') || rawDesc.toLowerCase().includes('списание') || rawDesc.toLowerCase().includes('оплата')) {
          expense = Math.abs(this.cleanAmount(amtStr));
        } else {
          income = Math.abs(this.cleanAmount(amtStr));
        }
      }

      if (income === 0 && expense === 0) continue;

      const isIncome = income > 0;
      const amount = isIncome ? income : expense;

      if (isIncome) totalIncome += amount;
      else totalExpense += amount;

      transactions.push({
        bankId: 'bank_halyk',
        bankCode: 'halyk',
        operationDate: isoDate,
        amount,
        currency: 'KZT',
        direction: isIncome ? 'income' : 'expense',
        description: rawDesc || 'Halyk операция',
        accountNumber
      });
    }

    const dates = transactions.map(t => t.operationDate).sort();

    return {
      bankCode: this.bankCode,
      bankName: this.bankName,
      accountNumber,
      statementGeneratedAt: statementDate || new Date().toISOString(),
      minDate: dates[0],
      maxDate: dates[dates.length - 1],
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalExpense: Math.round(totalExpense * 100) / 100,
      operationsCount: transactions.length,
      transactions,
      confidence: 0.95
    };
  }

  private cleanAmount(str: string): number {
    const clean = str.replace(/[^\d,.-]/g, '').replace(',', '.');
    const val = parseFloat(clean);
    return isNaN(val) ? 0 : val;
  }

  private parseDate(str: string): string {
    const m = str.match(/^(\d{2})[./-](\d{2})[./-](\d{2,4})(?:\s+(\d{2}):(\d{2}))?/);
    if (!m) return new Date().toISOString();
    let year = m[3];
    if (year.length === 2) year = '20' + year;
    const hours = m[4] || '12';
    const mins = m[5] || '00';
    return `${year}-${m[2]}-${m[1]}T${hours}:${mins}:00+05:00`;
  }
}
