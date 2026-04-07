import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(process.cwd(), 'apps/api/data');
const dbPath = path.join(dataDir, 'contractflow.db');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS licenses (
      id TEXT PRIMARY KEY,
      license_key TEXT NOT NULL UNIQUE,
      plan_name TEXT NOT NULL,
      status TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      activated_machine_id TEXT,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      activated_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users (id)
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      company TEXT NOT NULL,
      phone TEXT NOT NULL,
      notes TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users (id)
    );

    CREATE TABLE IF NOT EXISTS contracts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      value_cents INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      renewal_date TEXT NOT NULL,
      status TEXT NOT NULL,
      clm_status TEXT NOT NULL DEFAULT 'draft',
      auto_renew INTEGER NOT NULL,
      payment_cycle TEXT NOT NULL,
      notes TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users (id),
      FOREIGN KEY (customer_id) REFERENCES customers (id)
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      revoked_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users (id)
    );
  `);

  // Migrações incrementais — adicionam colunas sem recriar tabelas.
  const usersColumns = db.prepare("PRAGMA table_info('users')").all() as Array<{ name: string }>;
  if (!usersColumns.some((c) => c.name === 'role')) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'owner'");
  }

  const contractColumns = db.prepare("PRAGMA table_info('contracts')").all() as Array<{ name: string }>;
  if (!contractColumns.some((c) => c.name === 'clm_status')) {
    db.exec("ALTER TABLE contracts ADD COLUMN clm_status TEXT NOT NULL DEFAULT 'draft'");
  }
  if (!contractColumns.some((c) => c.name === 'description')) {
    db.exec("ALTER TABLE contracts ADD COLUMN description TEXT NOT NULL DEFAULT ''");
  }
}
