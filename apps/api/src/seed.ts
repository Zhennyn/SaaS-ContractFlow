import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { db, initializeDatabase } from './db.js';

initializeDatabase();

const now = new Date().toISOString();
const passwordHash = bcrypt.hashSync('admin123', 10);

const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get('owner@contractflow.local') as { id: string } | undefined;
const userId = existingUser?.id ?? uuid();

if (!existingUser) {
  db.prepare(
    'INSERT INTO users (id, email, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, 'owner@contractflow.local', passwordHash, 'ContractFlow Owner', 'owner', now);
} else {
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run('owner', userId);
}

const existingLicense = db.prepare('SELECT id FROM licenses WHERE license_key = ?').get('CFLOW-DEMO-2026') as { id: string } | undefined;
const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString();

if (!existingLicense) {
  db.prepare(
    `INSERT INTO licenses (
      id, license_key, plan_name, status, expires_at, activated_machine_id, user_id, created_at, activated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(uuid(), 'CFLOW-DEMO-2026', 'Growth Annual', 'active', expiresAt, null, userId, now, null);
}

const customerCount = db.prepare('SELECT COUNT(*) as total FROM customers').get() as { total: number };
if (customerCount.total === 0) {
  const customerA = uuid();
  const customerB = uuid();

  db.prepare(
    'INSERT INTO customers (id, user_id, name, email, company, phone, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(customerA, userId, 'Marina Souza', 'marina@atlascontabil.com', 'Atlas Contabil', '(11) 99999-1000', 'Cliente com renovacao anual.', now, now);

  db.prepare(
    'INSERT INTO customers (id, user_id, name, email, company, phone, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(customerB, userId, 'Carlos Lima', 'carlos@lumina.ag', 'Lumina Agencia', '(21) 98888-9000', 'Renovacao semestral em negociacao.', now, now);

  db.prepare(
    `INSERT INTO contracts (
      id, user_id, customer_id, title, description, value_cents, start_date, end_date, renewal_date,
      status, clm_status, auto_renew, payment_cycle, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(uuid(), userId, customerA, 'Assessoria Contabil Premium', 'Servicos contabeis com cobertura fiscal e tributaria.', 249900, '2025-01-10', '2026-01-10', '2026-01-05', 'renewing', 'approved', 1, 'yearly', 'Renovacao com reajuste previsto.', now, now);

  db.prepare(
    `INSERT INTO contracts (
      id, user_id, customer_id, title, description, value_cents, start_date, end_date, renewal_date,
      status, clm_status, auto_renew, payment_cycle, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(uuid(), userId, customerB, 'Gestao de Midia e Performance', 'Gestao completa de midia paga e organica para e-commerce.', 189900, '2025-06-01', '2026-06-01', '2026-05-15', 'active', 'signed', 0, 'monthly', 'Cliente avalia aditivo de escopo.', now, now);
}

console.log('Seed concluido.');
console.log('Login: owner@contractflow.local / admin123');
console.log('Licenca: CFLOW-DEMO-2026');
