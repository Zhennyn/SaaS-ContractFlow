import { db } from '../db.js';
import type { LicenseStatus, ManagedLicense } from '@contractflow/shared';

type LicenseRow = {
  id: string;
  license_key: string;
  plan_name: string;
  status: string;
  expires_at: string;
  activated_machine_id: string | null;
  user_id: string;
  created_at: string;
  activated_at: string | null;
};

export function toManagedLicense(row: LicenseRow): ManagedLicense {
  return {
    id: row.id,
    key: row.license_key,
    planName: row.plan_name,
    status: row.status as LicenseStatus,
    expiresAt: row.expires_at,
    activatedMachineId: row.activated_machine_id,
    createdAt: row.created_at,
    activatedAt: row.activated_at
  };
}

export function toLicenseSummary(row: LicenseRow) {
  return {
    key: row.license_key,
    planName: row.plan_name,
    status: row.status as LicenseStatus,
    expiresAt: row.expires_at,
    activatedMachineId: row.activated_machine_id
  };
}

export const licensesRepository = {
  findByKey(licenseKey: string): LicenseRow | undefined {
    return db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(licenseKey) as LicenseRow | undefined;
  },

  findAllByUser(userId: string): ManagedLicense[] {
    const rows = db
      .prepare('SELECT * FROM licenses WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as LicenseRow[];
    return rows.map(toManagedLicense);
  },

  findByIdAndUser(id: string, userId: string): LicenseRow | undefined {
    return db.prepare('SELECT * FROM licenses WHERE id = ? AND user_id = ?').get(id, userId) as LicenseRow | undefined;
  },

  insert(
    id: string,
    userId: string,
    licenseKey: string,
    planName: string,
    status: LicenseStatus,
    expiresAt: string,
    createdAt: string
  ): void {
    db.prepare(
      `INSERT INTO licenses (id, license_key, plan_name, status, expires_at, activated_machine_id, user_id, created_at, activated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, licenseKey, planName, status, expiresAt, null, userId, createdAt, null);
  },

  update(id: string, userId: string, planName: string, status: LicenseStatus, expiresAt: string): number {
    return db.prepare(
      'UPDATE licenses SET plan_name = ?, status = ?, expires_at = ? WHERE id = ? AND user_id = ?'
    ).run(planName, status, expiresAt, id, userId).changes;
  },

  activateMachine(id: string, machineId: string, activatedAt: string): void {
    db.prepare('UPDATE licenses SET activated_machine_id = ?, activated_at = ? WHERE id = ?')
      .run(machineId, activatedAt, id);
  },

  resetMachine(id: string, userId: string): number {
    return db.prepare(
      'UPDATE licenses SET activated_machine_id = NULL, activated_at = NULL WHERE id = ? AND user_id = ?'
    ).run(id, userId).changes;
  },

  expire(id: string): void {
    db.prepare("UPDATE licenses SET status = 'expired' WHERE id = ?").run(id);
  }
};
