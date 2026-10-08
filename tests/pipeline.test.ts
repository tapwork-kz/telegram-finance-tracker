import { describe, it, expect } from 'vitest';
import { KaspiStatementParser } from '../src/banks/kaspi/kaspiParser';
import { HalykStatementParser } from '../src/banks/halyk/halykParser';
import { BCCStatementParser } from '../src/banks/bcc/bccParser';
import { AlatauCityStatementParser } from '../src/banks/alatau/alatauParser';
import { FreedomStatementParser } from '../src/banks/freedom/freedomParser';
import { StatementDetector } from '../src/statements/detector';
import { Deduplicator } from '../src/statements/deduplicator';
import { TransferDetector } from '../src/finance/transfers';
import { TransactionCategorizer } from '../src/finance/categories';
import { FinancialReportsService } from '../src/finance/reports';
import {
  createKaspiFixtureCsv,
  createHalykFixtureCsv,
  createBCCFixtureCsv,
  createAlatauFixtureCsv,
  createFreedomFixtureCsv
} from '../fixtures/statementFixtures';

describe('Bank Parsers & Ingestion Pipeline', () => {
  const detector = new StatementDetector();

  it('correctly detects bank parsers by filename and content', () => {
    expect(detector.detectBank('kaspi_statement_october.csv', '')?.bankCode).toBe('kaspi');
    expect(detector.detectBank('statement_halyk.xlsx', '')?.bankCode).toBe('halyk');
    expect(detector.detectBank('bcc_card_report.csv', '')?.bankCode).toBe('bcc');
    expect(detector.detectBank('alatau_city_statement.csv', '')?.bankCode).toBe('alatau');
    expect(detector.detectBank('freedom_finance_report.csv', '')?.bankCode).toBe('freedom');
  });

  it('parses Kaspi fixture correctly', async () => {
    const parser = new KaspiStatementParser();
    const csv = createKaspiFixtureCsv();
    const result = await parser.parse('kaspi_october.csv', csv);

    expect(result.operationsCount).toBe(7);
    expect(result.totalIncome).toBe(300000);
    expect(result.totalExpense).toBe(94520);
    expect(result.transactions[0].direction).toBe('expense');
    expect(result.transactions[3].direction).toBe('income');
  });

  it('parses Halyk fixture correctly', async () => {
    const parser = new HalykStatementParser();
    const csv = createHalykFixtureCsv();
    const result = await parser.parse('halyk_october.csv', csv);

    expect(result.operationsCount).toBe(5);
    expect(result.totalIncome).toBe(50000);
    expect(result.totalExpense).toBe(28200);
  });

  it('parses BCC fixture correctly', async () => {
    const parser = new BCCStatementParser();
    const csv = createBCCFixtureCsv();
    const result = await parser.parse('bcc_october.csv', csv);

    expect(result.operationsCount).toBe(4);
    expect(result.totalIncome).toBe(400000);
    expect(result.totalExpense).toBe(28000);
    expect(result.transactions[0].bankTransactionId).toBe('BCC_TX_1001');
  });

  it('parses Alatau fixture correctly', async () => {
    const parser = new AlatauCityStatementParser();
    const csv = createAlatauFixtureCsv();
    const result = await parser.parse('alatau_october.csv', csv);

    expect(result.operationsCount).toBe(4);
    expect(result.totalIncome).toBe(50000);
    expect(result.totalExpense).toBe(23400);
  });

  it('parses Freedom fixture with multi-currency correctly', async () => {
    const parser = new FreedomStatementParser();
    const csv = createFreedomFixtureCsv();
    const result = await parser.parse('freedom_october.csv', csv);

    expect(result.operationsCount).toBe(4);
    expect(result.transactions.some(t => t.currency === 'USD')).toBe(true);
  });

  it('deduplicates identical and overlapping statements', async () => {
    const parser = new KaspiStatementParser();
    const csv = createKaspiFixtureCsv();
    const result1 = await parser.parse('kaspi_1.csv', csv);
    const result2 = await parser.parse('kaspi_1_retry.csv', csv);

    const existingHashes = new Set<string>();
    const pass1 = await Deduplicator.filterDuplicates(result1.transactions, existingHashes);
    expect(pass1.unique.length).toBe(7);
    expect(pass1.duplicatesCount).toBe(0);

    for (const tx of pass1.unique) {
      existingHashes.add(tx.externalHash!);
    }

    // Second import of same file should have 0 new unique transactions!
    const pass2 = await Deduplicator.filterDuplicates(result2.transactions, existingHashes);
    expect(pass2.unique.length).toBe(0);
    expect(pass2.duplicatesCount).toBe(7);
  });

  it('detects and links internal transfer between Kaspi and Halyk (Kaspi -> Halyk 50 000 ₸)', async () => {
    const kaspiParser = new KaspiStatementParser();
    const halykParser = new HalykStatementParser();

    const kaspiRes = await kaspiParser.parse('kaspi.csv', createKaspiFixtureCsv());
    const halykRes = await halykParser.parse('halyk.csv', createHalykFixtureCsv());

    const allTx = [...kaspiRes.transactions, ...halykRes.transactions];
    const { linkedPairs, totalTransferAmount } = TransferDetector.linkTransfers(allTx);

    expect(linkedPairs.length).toBe(1);
    expect(totalTransferAmount).toBe(50000);
    expect(linkedPairs[0].expenseTx.bankCode).toBe('kaspi');
    expect(linkedPairs[0].incomeTx.bankCode).toBe('halyk');

    // Generating analytics: internal transfers should NOT increase general expenses or income!
    const analytics = FinancialReportsService.computeAnalytics(
      allTx,
      '01–09 октября',
      ['kaspi', 'halyk']
    );

    // Kaspi exp (94520 - 50000 = 44520) + Halyk exp (28200) = 72720
    expect(analytics.totalExpense).toBe(72720);
    // Kaspi inc (300000) + Halyk inc (50000 - 50000 = 0) = 300000
    expect(analytics.totalIncome).toBe(300000);
    expect(analytics.totalTransfers).toBe(50000);
    expect(analytics.isComplete).toBe(false);
    expect(analytics.missingBanks).toContain('bcc');
    expect(analytics.missingBanks).toContain('alatau');
    expect(analytics.missingBanks).toContain('freedom');
  });

  it('categorizes expenses automatically with Priority for user rules', () => {
    expect(TransactionCategorizer.categorize('Покупка Magnum Mega Park')).toBe('Продукты');
    expect(TransactionCategorizer.categorize('Поездка Yandex.Go Комфорт')).toBe('Такси');
    expect(TransactionCategorizer.categorize('Заправка АЗС Helios')).toBe('Топливо');

    // Custom user rule override
    const customRules = [{ pattern: 'magnum', targetCategory: 'Подарки' }];
    expect(TransactionCategorizer.categorize('Покупка Magnum', undefined, customRules)).toBe('Подарки');
  });
});
