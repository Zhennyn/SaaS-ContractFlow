import { db } from '../db.js';
import type { Contract, ContractClmStatus, ContractStatus, PaymentCycle } from '@contractflow/shared';

type ContractRow = {
  id: string;
  user_id: string;
  customer_id: string;
  customer_name: string;
  title: string;
  description: string;
  value_cents: number;
  start_date: string;
  end_date: string;
  renewal_date: string;
  status: string;
  clm_status: string;
  auto_renew: number;
  payment_cycle: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

function toModel(row: ContractRow): Contract {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    title: row.title,
    description: row.description,
    valueCents: row.value_cents,
    startDate: row.start_date,
    endDate: row.end_date,
    renewalDate: row.renewal_date,
    status: row.status as ContractStatus,
    clmStatus: row.clm_status as ContractClmStatus,
    autoRenew: Boolean(row.auto_renew),
    paymentCycle: row.payment_cycle as PaymentCycle,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/** Payload para criar/atualizar um contrato (sem campos derivados). */
export type ContractUpsertData = {
  customerId: string;
  title: string;
  description: string;
  valueCents: number;
  startDate: string;
  endDate: string;
  renewalDate: string;
  status: ContractStatus;
  autoRenew: boolean;
  paymentCycle: PaymentCycle;
  notes: string;
};

export const contractsRepository = {
  findAllByUser(userId: string): Contract[] {
    const rows = db
      .prepare(
        `SELECT contracts.*, customers.name as customer_name
         FROM contracts
         JOIN customers ON customers.id = contracts.customer_id
         WHERE contracts.user_id = ?
         ORDER BY renewal_date ASC`
      )
      .all(userId) as ContractRow[];
    return rows.map(toModel);
  },

  findById(id: string, userId: string): Contract | undefined {
    const row = db
      .prepare(
        `SELECT contracts.*, customers.name as customer_name
         FROM contracts
         JOIN customers ON customers.id = contracts.customer_id
         WHERE contracts.id = ? AND contracts.user_id = ?`
      )
      .get(id, userId) as ContractRow | undefined;
    return row ? toModel(row) : undefined;
  },

  insert(id: string, userId: string, data: ContractUpsertData, clmStatus: ContractClmStatus, now: string): Contract {
    db.prepare(
      `INSERT INTO contracts
         (id, user_id, customer_id, title, description, value_cents, start_date, end_date, renewal_date,
          status, clm_status, auto_renew, payment_cycle, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, userId, data.customerId, data.title, data.description,
      data.valueCents, data.startDate, data.endDate, data.renewalDate,
      data.status, clmStatus, data.autoRenew ? 1 : 0, data.paymentCycle, data.notes, now, now
    );
    // Busca o registro completo com customer_name via JOIN.
    return this.findById(id, userId)!;
  },

  update(id: string, userId: string, data: ContractUpsertData, now: string): number {
    const result = db.prepare(
      `UPDATE contracts
       SET customer_id = ?, title = ?, description = ?, value_cents = ?, start_date = ?,
           end_date = ?, renewal_date = ?, status = ?, auto_renew = ?, payment_cycle = ?,
           notes = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    ).run(
      data.customerId, data.title, data.description,
      data.valueCents, data.startDate, data.endDate, data.renewalDate,
      data.status, data.autoRenew ? 1 : 0, data.paymentCycle, data.notes, now, id, userId
    );
    return result.changes;
  },

  updateClmStatus(id: string, userId: string, clmStatus: ContractClmStatus, now: string): number {
    return db.prepare(
      'UPDATE contracts SET clm_status = ?, updated_at = ? WHERE id = ? AND user_id = ?'
    ).run(clmStatus, now, id, userId).changes;
  },

  delete(id: string, userId: string): number {
    return db.prepare('DELETE FROM contracts WHERE id = ? AND user_id = ?').run(id, userId).changes;
  }
};
