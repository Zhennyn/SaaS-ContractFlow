import crypto from 'node:crypto';
import { db } from '../db.js';

export type RefreshTokenRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
  revoked_at: string | null;
};

function hashToken(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export const refreshTokensRepository = {
  insert(id: string, userId: string, rawToken: string, expiresAt: string, createdAt: string): void {
    db.prepare(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, userId, hashToken(rawToken), expiresAt, createdAt, null);
  },

  findByRawToken(rawToken: string): RefreshTokenRow | undefined {
    return db
      .prepare('SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked_at IS NULL')
      .get(hashToken(rawToken)) as RefreshTokenRow | undefined;
  },

  revoke(id: string, revokedAt: string): void {
    db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?').run(revokedAt, id);
  }
};
