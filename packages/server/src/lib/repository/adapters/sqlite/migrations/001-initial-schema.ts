import type { Database } from "bun:sqlite";

export const runMigrations = (db: Database): void => {
	db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'checking',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_accounts_name ON accounts(name);
    CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type);
    CREATE INDEX IF NOT EXISTS idx_accounts_createdAt ON accounts(createdAt);

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      accountId INTEGER NOT NULL,
      date TEXT NOT NULL,
      amount REAL NOT NULL,
      rawMerchantString TEXT NOT NULL,
      merchantId INTEGER,
      categoryId INTEGER,
      subcategoryId INTEGER,
      categoryOverride TEXT,
      manualCategory INTEGER DEFAULT 0,
      isRefund INTEGER DEFAULT 0,
      linkedRefundId INTEGER,
      anomalyFlags TEXT,
      isDuplicateExcluded INTEGER DEFAULT 0,
      duplicateNote TEXT,
      importedAt TEXT NOT NULL,
      importMonth TEXT NOT NULL,
      importBatchId TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tx_accountId ON transactions(accountId);
    CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_tx_amount ON transactions(amount);
    CREATE INDEX IF NOT EXISTS idx_tx_merchantId ON transactions(merchantId);
    CREATE INDEX IF NOT EXISTS idx_tx_categoryId ON transactions(categoryId);
    CREATE INDEX IF NOT EXISTS idx_tx_subcategoryId ON transactions(subcategoryId);
    CREATE INDEX IF NOT EXISTS idx_tx_manualCategory ON transactions(manualCategory);
    CREATE INDEX IF NOT EXISTS idx_tx_linkedRefundId ON transactions(linkedRefundId);
    CREATE INDEX IF NOT EXISTS idx_tx_importMonth ON transactions(importMonth);
    CREATE INDEX IF NOT EXISTS idx_tx_importBatchId ON transactions(importBatchId);
    CREATE INDEX IF NOT EXISTS idx_tx_account_month ON transactions(accountId, importMonth);

    CREATE TABLE IF NOT EXISTS merchants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      defaultCategoryId INTEGER,
      createdAt TEXT NOT NULL,
      firstSeen TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_merchants_name ON merchants(name);
    CREATE INDEX IF NOT EXISTS idx_merchants_defaultCategoryId ON merchants(defaultCategoryId);
    CREATE INDEX IF NOT EXISTS idx_merchants_firstSeen ON merchants(firstSeen);

    CREATE TABLE IF NOT EXISTS rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchantId INTEGER NOT NULL,
      pattern TEXT NOT NULL,
      categoryOverride INTEGER,
      matchCount INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rules_merchantId ON rules(merchantId);
    CREATE INDEX IF NOT EXISTS idx_rules_pattern ON rules(pattern);

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_key ON settings(key);

    CREATE TABLE IF NOT EXISTS appSettings (
      id TEXT PRIMARY KEY,
      llm TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      color TEXT NOT NULL,
      icon TEXT NOT NULL,
      parentId INTEGER,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_categories_parentId ON categories(parentId);
    CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
    CREATE INDEX IF NOT EXISTS idx_categories_sortOrder ON categories(sortOrder);

    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchantId INTEGER NOT NULL,
      merchantName TEXT NOT NULL,
      typicalAmount REAL NOT NULL,
      frequency TEXT NOT NULL,
      intervalDays INTEGER NOT NULL,
      lastChargeDate TEXT NOT NULL,
      firstChargeDate TEXT NOT NULL,
      chargeCount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      transactionIds TEXT NOT NULL DEFAULT '[]',
      detectedAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_subscriptions_merchantId ON subscriptions(merchantId);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
  `);

	try {
		db.exec("ALTER TABLE merchants ADD COLUMN imageUrl TEXT");
	} catch {
		// Column already exists
	}
};
