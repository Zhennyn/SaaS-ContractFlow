import { randomUUID } from 'node:crypto';
import type { AuditLog } from '@contractflow/shared';
import { db } from '../db.js';

export interface AuditLogRow {
  id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  old_values: string | null;
  new_values: string | null;
  ip_address: string | null;
  created_at: string;
}

export const auditRepository = {
  create(payload: {
    userId: string;
    action: string;
    resourceType: string;
    resourceId: string;
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
    ipAddress?: string | null;
  }): AuditLog {
    const id = randomUUID();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO audit_logs (
        id, user_id, action, resource_type, resource_id,
        old_values, new_values, ip_address, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      payload.userId,
      payload.action,
      payload.resourceType,
      payload.resourceId,
      payload.oldValues ? JSON.stringify(payload.oldValues) : null,
      payload.newValues ? JSON.stringify(payload.newValues) : null,
      payload.ipAddress ?? null,
      now
    );

    return {
      id,
      userId: payload.userId,
      action: payload.action as any,
      resourceType: payload.resourceType as 'contract' | 'customer' | 'license' | 'user',
      resourceId: payload.resourceId,
      oldValues: payload.oldValues ?? null,
      newValues: payload.newValues ?? null,
      ipAddress: payload.ipAddress ?? null,
      createdAt: now
    };
  },

  listByResource(resourceType: string, resourceId: string, limit: number = 50, offset: number = 0): AuditLog[] {
    const stmt = db.prepare(`
      SELECT * FROM audit_logs
      WHERE resource_type = ? AND resource_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(resourceType, resourceId, limit, offset) as AuditLogRow[];
    return rows.map(rowToModel);
  },

  listByUser(userId: string, limit: number = 50, offset: number = 0): AuditLog[] {
    const stmt = db.prepare(`
      SELECT * FROM audit_logs
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(userId, limit, offset) as AuditLogRow[];
    return rows.map(rowToModel);
  },

  listAll(limit: number = 50, offset: number = 0): AuditLog[] {
    const stmt = db.prepare(`
      SELECT * FROM audit_logs
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(limit, offset) as AuditLogRow[];
    return rows.map(rowToModel);
  },

  countByResource(resourceType: string, resourceId: string): number {
    const stmt = db.prepare(
      'SELECT COUNT(*) as count FROM audit_logs WHERE resource_type = ? AND resource_id = ?'
    );
    const result = stmt.get(resourceType, resourceId) as { count: number };
    return result.count;
  }
};

function rowToModel(row: AuditLogRow): AuditLog {
  return {
    id: row.id,
    userId: row.user_id,
    action: row.action as any,
    resourceType: row.resource_type as 'contract' | 'customer' | 'license' | 'user',
    resourceId: row.resource_id,
    oldValues: row.old_values ? JSON.parse(row.old_values) : null,
    newValues: row.new_values ? JSON.parse(row.new_values) : null,
    ipAddress: row.ip_address,
    createdAt: row.created_at
  };
}
