export interface Env {
  DB: D1Database;
  STATEMENTS_BUCKET?: R2Bucket;
  ENVIRONMENT: string;
  DEFAULT_TIMEZONE: string;
  STATEMENT_REMINDER_INTERVAL_HOURS: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  ALLOWED_TELEGRAM_USER_IDS?: string;
}

export type PeriodType = 'decade_1' | 'decade_2' | 'decade_3' | 'custom';
export type PeriodStatus = 'waiting' | 'partial' | 'complete' | 'processing' | 'processed' | 'error';
export type TransactionDirection = 'income' | 'expense' | 'transfer';
export type StatementStatus = 'uploaded' | 'processing' | 'parsed' | 'error';

export interface DecadePeriod {
  id: string; // e.g. '2026-10-decade-1'
  userId: string;
  periodStart: string; // ISO in Asia/Almaty: YYYY-MM-DDTHH:mm:ss+05:00
  periodEnd: string;
  periodType: PeriodType;
  status: PeriodStatus;
  year: number;
  month: number;
  decadeIndex: number;
  label: string; // '01.10–09.10'
  createdAt: string;
  completedAt?: string | null;
}

export interface BankConfig {
  code: string;
  name: string;
  supportedFormats: string[];
}

export interface NormalizedTransaction {
  bankId: string;
  bankCode: string;
  bankTransactionId?: string;
  operationDate: string; // ISO YYYY-MM-DDTHH:mm:ss
  valueDate?: string;
  amount: number; // always positive in storage
  currency: string;
  direction: TransactionDirection;
  description: string;
  merchant?: string;
  category?: string;
  accountNumber?: string;
  isInternalTransfer?: boolean;
  rawDetails?: Record<string, any>;
  externalHash?: string;
}

export interface ParsedStatementResult {
  bankCode: string;
  bankName: string;
  accountNumber?: string;
  statementGeneratedAt?: string;
  minDate?: string;
  maxDate?: string;
  totalIncome: number;
  totalExpense: number;
  operationsCount: number;
  transactions: NormalizedTransaction[];
  rawTextPreview?: string;
  confidence: number; // 0 to 1
}

export interface StatementParser {
  bankCode: string;
  bankName: string;
  canParse(filename: string, content: Uint8Array | string): boolean;
  parse(filename: string, content: Uint8Array | string): Promise<ParsedStatementResult>;
}
