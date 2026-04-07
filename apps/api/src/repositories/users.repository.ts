import { db } from '../db.js';

export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  role: string;
  created_at: string;
};

export const usersRepository = {
  findByEmail(email: string): UserRow | undefined {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
  },

  findById(id: string): UserRow | undefined {
    return db.prepare('SELECT id, email, display_name, role FROM users WHERE id = ?').get(id) as UserRow | undefined;
  }
};
