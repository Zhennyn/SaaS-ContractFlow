import { randomUUID } from 'node:crypto';
import type { ContractAttachment } from '@contractflow/shared';
import { db } from '../db.js';

export interface AttachmentRow {
  id: string;
  contract_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  uploaded_by: string;
  uploaded_at: string;
}

export const attachmentsRepository = {
  create(payload: {
    contractId: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    mimeType: string;
    uploadedBy: string;
  }): ContractAttachment {
    const id = randomUUID();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO contract_attachments (
        id, contract_id, file_name, file_path, file_size,
        mime_type, uploaded_by, uploaded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      payload.contractId,
      payload.fileName,
      payload.filePath,
      payload.fileSize,
      payload.mimeType,
      payload.uploadedBy,
      now
    );

    return {
      id,
      contractId: payload.contractId,
      fileName: payload.fileName,
      filePath: payload.filePath,
      fileSize: payload.fileSize,
      mimeType: payload.mimeType,
      uploadedBy: payload.uploadedBy,
      uploadedAt: now
    };
  },

  findByContractId(contractId: string): ContractAttachment[] {
    const stmt = db.prepare(`
      SELECT * FROM contract_attachments
      WHERE contract_id = ?
      ORDER BY uploaded_at DESC
    `);

    const rows = stmt.all(contractId) as AttachmentRow[];
    return rows.map(rowToModel);
  },

  findById(id: string, contractId: string): ContractAttachment | null {
    const stmt = db.prepare(`
      SELECT * FROM contract_attachments
      WHERE id = ? AND contract_id = ?
    `);

    const row = stmt.get(id, contractId) as AttachmentRow | undefined;
    return row ? rowToModel(row) : null;
  },

  delete(id: string, contractId: string): boolean {
    const stmt = db.prepare(`
      DELETE FROM contract_attachments
      WHERE id = ? AND contract_id = ?
    `);

    const result = stmt.run(id, contractId);
    return result.changes > 0;
  },

  deleteByContractId(contractId: string): number {
    const stmt = db.prepare('DELETE FROM contract_attachments WHERE contract_id = ?');
    const result = stmt.run(contractId);
    return result.changes;
  }
};

function rowToModel(row: AttachmentRow): ContractAttachment {
  return {
    id: row.id,
    contractId: row.contract_id,
    fileName: row.file_name,
    filePath: row.file_path,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at
  };
}
