-- Migration 0001: Initial schema for Telegram Finance Tracker

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    telegram_user_id INTEGER NOT NULL UNIQUE,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_user_id);

CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    timezone TEXT NOT NULL DEFAULT 'Asia/Almaty',
    currency TEXT NOT NULL DEFAULT 'KZT',
    statement_reminder_interval_hours INTEGER NOT NULL DEFAULT 24,
    last_reminder_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS banks (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    supported_formats TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    bank_id TEXT NOT NULL,
    account_number TEXT,
    iban TEXT,
    name TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'KZT',
    balance REAL NOT NULL DEFAULT 0.0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (bank_id) REFERENCES banks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_bank ON accounts(bank_id);

CREATE TABLE IF NOT EXISTS financial_periods (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    period_type TEXT NOT NULL, -- 'decade_1', 'decade_2', 'decade_3', 'custom'
    status TEXT NOT NULL DEFAULT 'waiting', -- 'waiting', 'partial', 'complete', 'processing', 'processed', 'error'
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    decade_index INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_periods_user ON financial_periods(user_id);
CREATE INDEX IF NOT EXISTS idx_periods_status ON financial_periods(status);
CREATE INDEX IF NOT EXISTS idx_periods_start ON financial_periods(period_start);
CREATE INDEX IF NOT EXISTS idx_periods_end ON financial_periods(period_end);

CREATE TABLE IF NOT EXISTS statements (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    period_id TEXT,
    bank_id TEXT NOT NULL,
    account_id TEXT,
    filename TEXT NOT NULL,
    file_format TEXT NOT NULL,
    storage_r2_key TEXT,
    file_size INTEGER NOT NULL DEFAULT 0,
    generated_at TEXT,
    min_operation_date TEXT,
    max_operation_date TEXT,
    operations_count INTEGER NOT NULL DEFAULT 0,
    total_income REAL NOT NULL DEFAULT 0.0,
    total_expense REAL NOT NULL DEFAULT 0.0,
    status TEXT NOT NULL DEFAULT 'uploaded', -- 'uploaded', 'processing', 'parsed', 'error'
    error_message TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (period_id) REFERENCES financial_periods(id) ON DELETE SET NULL,
    FOREIGN KEY (bank_id) REFERENCES banks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_statements_user ON statements(user_id);
CREATE INDEX IF NOT EXISTS idx_statements_period ON statements(period_id);
CREATE INDEX IF NOT EXISTS idx_statements_bank ON statements(bank_id);

CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    user_id TEXT, -- NULL for default system categories
    name TEXT NOT NULL,
    icon TEXT,
    type TEXT NOT NULL DEFAULT 'expense', -- 'expense', 'income', 'transfer'
    is_custom INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);

CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    bank_id TEXT NOT NULL,
    account_id TEXT,
    statement_id TEXT,
    period_id TEXT,
    operation_date TEXT NOT NULL,
    value_date TEXT,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'KZT',
    direction TEXT NOT NULL, -- 'income', 'expense', 'transfer'
    description TEXT,
    merchant TEXT,
    category TEXT,
    category_id TEXT,
    bank_transaction_id TEXT,
    external_hash TEXT NOT NULL,
    source_file_id TEXT,
    is_internal_transfer INTEGER NOT NULL DEFAULT 0,
    linked_transfer_id TEXT,
    notes TEXT,
    is_user_edited INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (bank_id) REFERENCES banks(id) ON DELETE CASCADE,
    FOREIGN KEY (statement_id) REFERENCES statements(id) ON DELETE SET NULL,
    FOREIGN KEY (period_id) REFERENCES financial_periods(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_user_hash ON transactions(user_id, external_hash);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_period ON transactions(period_id);
CREATE INDEX IF NOT EXISTS idx_transactions_bank ON transactions(bank_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(operation_date);
CREATE INDEX IF NOT EXISTS idx_transactions_direction ON transactions(direction);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);

CREATE TABLE IF NOT EXISTS merchant_rules (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    pattern TEXT NOT NULL,
    target_category TEXT NOT NULL,
    target_merchant TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_merchant_rules_user ON merchant_rules(user_id);

CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    category TEXT NOT NULL,
    month TEXT NOT NULL, -- 'YYYY-MM'
    planned_amount REAL NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_user_cat_month ON budgets(user_id, category, month);

CREATE TABLE IF NOT EXISTS credits (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    bank_id TEXT,
    name TEXT NOT NULL,
    principal REAL NOT NULL,
    remaining_principal REAL NOT NULL,
    monthly_payment REAL NOT NULL,
    interest_rate REAL NOT NULL DEFAULT 0.0,
    payment_date INTEGER NOT NULL, -- day of month (1-31)
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'closed'
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_credits_user ON credits(user_id);

CREATE TABLE IF NOT EXISTS import_errors (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    statement_id TEXT,
    bank_code TEXT,
    raw_filename TEXT,
    error_type TEXT NOT NULL,
    error_message TEXT NOT NULL,
    raw_preview TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS period_bank_status (
    id TEXT PRIMARY KEY,
    period_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    bank_code TEXT NOT NULL, -- 'kaspi', 'halyk', 'bcc', 'alatau', 'freedom'
    statement_id TEXT,
    status TEXT NOT NULL DEFAULT 'waiting', -- 'waiting', 'uploaded', 'error', 'skipped'
    updated_at TEXT NOT NULL,
    FOREIGN KEY (period_id) REFERENCES financial_periods(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_period_bank_status_unique ON period_bank_status(period_id, bank_code);

INSERT OR IGNORE INTO banks (id, code, name, is_active, supported_formats, created_at) VALUES
('bank_kaspi', 'kaspi', 'Kaspi Bank', 1, 'csv,xlsx,pdf,txt', datetime('now')),
('bank_halyk', 'halyk', 'Halyk Bank', 1, 'csv,xlsx,xls,pdf', datetime('now')),
('bank_bcc', 'bcc', 'Банк ЦентрКредит (BCC)', 1, 'csv,xlsx,xls,pdf', datetime('now')),
('bank_alatau', 'alatau', 'Alatau City Bank', 1, 'csv,xlsx,pdf', datetime('now')),
('bank_freedom', 'freedom', 'Freedom Bank', 1, 'csv,xlsx,pdf', datetime('now'));
