import { db } from '../db.js';
import type { Customer } from '@contractflow/shared';

type CustomerRow = {
  id: string;
  user_id: string;
  name: string;
  email: string;
  company: string;
  phone: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

function toModel(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    company: row.company,
    phone: row.phone,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export const customersRepository = {
  findAllByUser(userId: string): Customer[] {
    const rows = db
      .prepare('SELECT * FROM customers WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as CustomerRow[];
    return rows.map(toModel);
  },

  findById(id: string, userId: string): Customer | undefined {
    const row = db
      .prepare('SELECT * FROM customers WHERE id = ? AND user_id = ?')
      .get(id, userId) as CustomerRow | undefined;
    return row ? toModel(row) : undefined;
  },

  insert(id: string, userId: string, data: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>, now: string): Customer {
    db.prepare(
      `INSERT INTO customers (id, user_id, name, email, company, phone, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, userId, data.name, data.email, data.company, data.phone, data.notes, now, now);
    return { id, ...data, createdAt: now, updatedAt: now };
  },

  update(id: string, userId: string, data: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>, now: string): number {
    const result = db.prepare(
      `UPDATE customers SET name = ?, email = ?, company = ?, phone = ?, notes = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    ).run(data.name, data.email, data.company, data.phone, data.notes, now, id, userId);
    return result.changes;
  },

  delete(id: string, userId: string): number {
    return db.prepare('DELETE FROM customers WHERE id = ? AND user_id = ?').run(id, userId).changes;
  },

  countLinkedContracts(customerId: string, userId: string): number {
    const row = db
      .prepare('SELECT COUNT(*) as total FROM contracts WHERE customer_id = ? AND user_id = ?')
      .get(customerId, userId) as { total: number };
    return row.total;
  }
};
