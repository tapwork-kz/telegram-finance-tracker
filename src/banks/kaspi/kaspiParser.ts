import { ParsedStatementResult, StatementParser, NormalizedTransaction } from '../../types';
import * as XLSX from 'xlsx';
import { inflate } from 'pako';

/**
 * KaspiStatementParser
 * Supported formats: PDF, XLSX, XLS, CSV, TXT
 * Fully supports Kaspi statements with embedded CID/CMap streams in pure JS (Cloudflare Workers compatible).
 */
export class KaspiStatementParser implements StatementParser {
  public bankCode = 'kaspi';
  public bankName = 'Kaspi Bank';

  public canParse(filename: string, content: Uint8Array | string): boolean {
    const fn = filename.toLowerCase();
    if (fn.includes('kaspi') || fn.includes('gold') || fn.includes('каспи')) return true;

    if (typeof content === 'string') {
      const lower = content.toLowerCase();
      if (lower.includes('kaspi') || lower.includes('каспи')) return true;
    }
    return false;
  }

  public async parse(filename: string, content: Uint8Array | string): Promise<ParsedStatementResult> {
    const fn = filename.toLowerCase();
    if (fn.endsWith('.pdf') && content instanceof Uint8Array) {
      return this.parsePdf(content);
    }
    return this.parseSpreadsheetOrText(content);
  }

  /**
   * Pure JS PDF parser using pako for stream decompression and ToUnicode CMap font mapping
   */
  private parsePdf(buffer: Uint8Array): ParsedStatementResult {
    const streams = this.extractDecompressedStreams(buffer);
    const cmap = this.buildCMap(streams);
    const tokens = this.extractTokens(streams, cmap);

    let accountNumber: string | undefined;
    const transactions: NormalizedTransaction[] = [];

    // Detect IBAN/Account
    for (const tok of tokens) {
      const m = tok.match(/KZ\d{18}/i);
      if (m) {
        accountNumber = m[0].toUpperCase();
        break;
      }
    }

    let totalIncome = 0;
    let totalExpense = 0;

    for (let i = 0; i < tokens.length; i++) {
      if (/^\d{2}\.\d{2}\.\d{2}$/.test(tokens[i])) {
        const rawDate = tokens[i];
        const rawAmt = tokens[i + 1] || '';
        const opType = tokens[i + 2] || '';
        const details = tokens[i + 3] || '';

        if (rawAmt.includes('₸') || /[+-]\s*\d/.test(rawAmt)) {
          const isIncome = rawAmt.includes('+') || opType.toLowerCase().includes('пополнение');
          const clean = rawAmt.replace(/[^\d,.-]/g, '').replace(',', '.');
          const val = Math.abs(parseFloat(clean) || 0);

          if (val > 0) {
            if (isIncome) totalIncome += val;
            else totalExpense += val;

            const isoDate = this.parseShortDate(rawDate);
            transactions.push({
              bankId: 'bank_kaspi',
              bankCode: 'kaspi',
              operationDate: isoDate,
              amount: val,
              currency: 'KZT',
              direction: isIncome ? 'income' : 'expense',
              description: `${opType} ${details}`.trim() || 'Kaspi операция',
              merchant: details || undefined,
              accountNumber
            });
            i += 3;
          }
        }
      }
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
      confidence: 0.99
    };
  }

  private extractDecompressedStreams(buf: Uint8Array): Uint8Array[] {
    const streams: Uint8Array[] = [];
    let pos = 0;
    const len = buf.length;

    while (pos < len - 10) {
      // Look for ASCII "stream"
      if (
        buf[pos] === 115 && buf[pos + 1] === 116 && buf[pos + 2] === 114 &&
        buf[pos + 3] === 101 && buf[pos + 4] === 97 && buf[pos + 5] === 109
      ) {
        let sStart = pos + 6;
        if (buf[sStart] === 13 && buf[sStart + 1] === 10) sStart += 2;
        else if (buf[sStart] === 10) sStart += 1;

        // Look for ASCII "endstream"
        let sEnd = sStart;
        while (sEnd < len - 9) {
          if (
            buf[sEnd] === 101 && buf[sEnd + 1] === 110 && buf[sEnd + 2] === 100 &&
            buf[sEnd + 3] === 115 && buf[sEnd + 4] === 116 && buf[sEnd + 5] === 114 &&
            buf[sEnd + 6] === 101 && buf[sEnd + 7] === 97 && buf[sEnd + 8] === 109
          ) {
            break;
          }
          sEnd++;
        }

        if (sEnd < len - 9) {
          const raw = buf.subarray(sStart, sEnd);
          try {
            const decomp = inflate(raw);
            streams.push(decomp);
          } catch {
            streams.push(raw);
          }
          pos = sEnd + 9;
          continue;
        }
      }
      pos++;
    }
    return streams;
  }

  private buildCMap(streams: Uint8Array[]): Map<number, string> {
    const cmap = new Map<number, string>();
    for (const s of streams) {
      const str = new TextDecoder('latin1').decode(s);
      if (str.includes('beginbfrange')) {
        const rangeRegex = /<([0-9a-fA-F]+)>\s+<([0-9a-fA-F]+)>\s+<([0-9a-fA-F]+)>/g;
        let m;
        while ((m = rangeRegex.exec(str)) !== null) {
          const startSrc = parseInt(m[1], 16);
          const endSrc = parseInt(m[2], 16);
          let startDst = parseInt(m[3], 16);
          for (let src = startSrc; src <= endSrc; src++) {
            cmap.set(src, String.fromCharCode(startDst));
            startDst++;
          }
        }
      }
      if (str.includes('beginbfchar')) {
        const charRegex = /<([0-9a-fA-F]+)>\s+<([0-9a-fA-F]+)>/g;
        let m;
        while ((m = charRegex.exec(str)) !== null) {
          cmap.set(parseInt(m[1], 16), String.fromCharCode(parseInt(m[2], 16)));
        }
      }
    }
    return cmap;
  }

  private extractTokens(streams: Uint8Array[], cmap: Map<number, string>): string[] {
    const tokens: string[] = [];

    const decodeToken = (tok: string): string => {
      let res = '';
      if (tok.startsWith('<') && tok.endsWith('>')) {
        const hex = tok.slice(1, -1);
        for (let i = 0; i < hex.length; i += 4) {
          const code = parseInt(hex.slice(i, i + 4), 16);
          if (cmap.has(code)) res += cmap.get(code);
          else if (code === 3) res += ' ';
          else res += ' ';
        }
      } else if (tok.startsWith('(') && tok.endsWith(')')) {
        const raw = tok.slice(1, -1);
        for (let i = 0; i < raw.length; i += 2) {
          const code = (raw.charCodeAt(i) << 8) | raw.charCodeAt(i + 1);
          if (cmap.has(code)) res += cmap.get(code);
          else if (code === 3) res += ' ';
          else res += ' ';
        }
      }
      return res.trim();
    };

    for (const s of streams) {
      const raw = new TextDecoder('latin1').decode(s);
      if (!raw.includes('BT')) continue;

      const tjRegex = /(<[0-9a-fA-F]+>|\(.*?\))\s*Tj/g;
      let m;
      while ((m = tjRegex.exec(raw)) !== null) {
        const dec = decodeToken(m[1]);
        if (dec.length > 0) tokens.push(dec);
      }
    }
    return tokens;
  }

  private parseSpreadsheetOrText(content: Uint8Array | string): ParsedStatementResult {
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

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].map(c => String(c || '').toLowerCase().trim());
      const dIdx = r.findIndex(c => c.includes('дата') || c.includes('date'));
      const aIdx = r.findIndex(c => c.includes('сумма') || c.includes('amount'));
      if (dIdx !== -1 && aIdx !== -1) {
        headerRowIdx = i;
        dateCol = dIdx;
        amountCol = aIdx;
        descCol = r.findIndex(c => c.includes('операци') || c.includes('детали') || c.includes('описание'));
        if (descCol === -1) descCol = 1;
        break;
      }
    }

    if (headerRowIdx === -1) {
      throw new Error('KaspiStatementParser: Не удалось определить структуру таблицы');
    }

    let totalIncome = 0;
    let totalExpense = 0;

    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length === 0) continue;

      const rawDate = String(r[dateCol] || '').trim();
      const rawDesc = String(r[descCol] || '').trim();
      const rawAmount = String(r[amountCol] || '').trim();

      if (!rawDate || !/^\d{2}[./-]\d{2}[./-]\d{2,4}/.test(rawDate)) continue;

      const isoDate = this.parseKaspiDate(rawDate);
      const isIncome = rawAmount.includes('+') || rawDesc.toLowerCase().includes('пополнение');
      const clean = rawAmount.replace(/[^\d,.-]/g, '').replace(',', '.');
      const val = Math.abs(parseFloat(clean) || 0);

      if (val === 0) continue;

      if (isIncome) totalIncome += val;
      else totalExpense += val;

      transactions.push({
        bankId: 'bank_kaspi',
        bankCode: 'kaspi',
        operationDate: isoDate,
        amount: val,
        currency: 'KZT',
        direction: isIncome ? 'income' : 'expense',
        description: rawDesc,
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

  private parseShortDate(str: string): string {
    const parts = str.split('.');
    return `20${parts[2]}-${parts[1]}-${parts[0]}T12:00:00+05:00`;
  }

  private parseKaspiDate(str: string): string {
    const m = str.match(/^(\d{2})[./-](\d{2})[./-](\d{2,4})(?:\s+(\d{2}):(\d{2}))?/);
    if (!m) return new Date().toISOString();
    let year = m[3];
    if (year.length === 2) year = '20' + year;
    return `${year}-${m[2]}-${m[1]}T12:00:00+05:00`;
  }
}
