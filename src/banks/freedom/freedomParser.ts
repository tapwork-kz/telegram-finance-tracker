import { ParsedStatementResult, StatementParser, NormalizedTransaction } from '../../types';
import * as XLSX from 'xlsx';

/**
 * FreedomStatementParser (Freedom Bank / Freedom Finance)
 * Characteristics:
 * - "Freedom Bank", "Фридом Банк", "Freedom Finance"
 * - Multi-currency support (KZT, USD, EUR, RUB)
 * - Distinct columns for Card/Account, Currency, Operation Type
 */
export class FreedomStatementParser implements StatementParser {
  public bankCode = 'freedom';
  public bankName = 'Freedom Bank';

  public canParse(filename: string, content: Uint8Array | string): boolean {
    const fn = filename.toLowerCase();
    if (fn.includes('freedom') || fn.includes('фридом')) return true;

    if (typeof content === 'string') {
      const lower = content.toLowerCase();
      if (lower.includes('freedom') || lower.includes('фридом')) return true;
    }
    return false;
  }

  public async parse(filename: string, content: Uint8Array | string): Promise<ParsedStatementResult> {
    const transactions: NormalizedTransaction[] = [];
    let accountNumber: string | undefined;

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
    let amountCol = -1;
    let currCol = -1;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].map(c => String(c || '').toLowerCase().trim());
      const dIdx = r.findIndex(c => c.includes('дата') || c.includes('date'));
      const aIdx = r.findIndex(c => c.includes('сумма') || c.includes('amount'));

      if (dIdx !== -1 && aIdx !== -1) {
        headerRowIdx = i;
        dateCol = dIdx;
        amountCol = aIdx;
        descCol = r.findIndex(c => c.includes('детали') || c.includes('описание') || c.includes('операция'));
        if (descCol === -1) descCol = 1;
        currCol = r.findIndex(c => c.includes('валюта') || c.includes('currency'));
        break;
      }
    }

    if (headerRowIdx === -1) {
      throw new Error('FreedomStatementParser: Не найдены заголовки выписки Freedom Bank');
    }

    let totalIncome = 0;
    let totalExpense = 0;

    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length === 0) continue;

      const rawDate = String(r[dateCol] || '').trim();
      const rawDesc = String(r[descCol] || '').trim();
      const rawAmt = String(r[amountCol] || '').trim();
      const currency = currCol !== -1 && r[currCol] ? String(r[currCol]).trim().toUpperCase() : 'KZT';

      if (!rawDate || !/^\d{2}[./-]\d{2}[./-]\d{2,4}/.test(rawDate)) {
        continue;
      }

      const isoDate = this.parseDate(rawDate);
      const isIncome = rawAmt.includes('+') || rawDesc.toLowerCase().includes('пополнение');
      const clean = rawAmt.replace(/[^\d,.-]/g, '').replace(',', '.');
      const val = Math.abs(parseFloat(clean) || 0);

      if (val === 0) continue;

      if (isIncome) totalIncome += val;
      else totalExpense += val;

      transactions.push({
        bankId: 'bank_freedom',
        bankCode: 'freedom',
        operationDate: isoDate,
        amount: val,
        currency,
        direction: isIncome ? 'income' : 'expense',
        description: rawDesc || 'Freedom операция',
        accountNumber
      });
    }

    const dates = transactions.map(t => t.operationDate).sort();

    return {
      bankCode: this.bankCode,
      bankName: this.bankName,
      accountNumber,
      statementGeneratedAt: new Date().toISOString(),
      minDate: dates[0],
      maxDate: dates[dates.length - 1],
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalExpense: Math.round(totalExpense * 100) / 100,
      operationsCount: transactions.length,
      transactions,
      confidence: 0.95
    };
  }

  private parseDate(str: string): string {
    const m = str.match(/^(\d{2})[./-](\d{2})[./-](\d{2,4})/);
    if (!m) return new Date().toISOString();
    let year = m[3];
    if (year.length === 2) year = '20' + year;
    return `${year}-${m[2]}-${m[1]}T12:00:00+05:00`;
  }
}
