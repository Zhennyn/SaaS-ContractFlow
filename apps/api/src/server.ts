import 'dotenv/config';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { Contract, ContractStatus, Customer, DashboardPayload, LicenseStatus, ManagedLicense, PaymentCycle, UserRole, UserSession } from '@contractflow/shared';
import { v4 as uuid } from 'uuid';
import { db, initializeDatabase } from './db.js';

initializeDatabase();

const port = Number(process.env.API_PORT ?? 4000);
const jwtSecret = process.env.JWT_SECRET ?? 'replace-this-secret';
const corsOrigin = process.env.CORS_ORIGIN ?? 'http://127.0.0.1:5173';

const app = express();
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(6),
  licenseKey: z.string().min(8),
  machineId: z.string().min(6)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20),
  machineId: z.string().min(6)
});

const customerSchema = z.object({
  name: z.string().min(2),
  email: z.email(),
  company: z.string().min(2),
  phone: z.string().min(8),
  notes: z.string().default('')
});

const contractSchema = z.object({
  customerId: z.string().min(1),
  title: z.string().min(3),
  valueCents: z.number().int().positive(),
  startDate: z.string().min(10),
  endDate: z.string().min(10),
  renewalDate: z.string().min(10),
  status: z.enum(['active', 'renewing', 'expired'] satisfies ContractStatus[]),
  autoRenew: z.boolean(),
  paymentCycle: z.enum(['monthly', 'quarterly', 'yearly', 'custom'] satisfies PaymentCycle[]),
  notes: z.string().default('')
});

const licenseSchema = z.object({
  planName: z.string().min(2),
  expiresAt: z.iso.datetime(),
  status: z.enum(['active', 'expired', 'suspended'] satisfies LicenseStatus[])
});

type JwtPayload = {
  sub: string;
  email: string;
  licenseKey: string;
  machineId: string;
  role: UserRole;
  tokenType: 'access' | 'refresh';
};

type AuthRequest = Request & {
  auth?: JwtPayload;
};

const accessTokenTtlSeconds = 60 * 15;
const refreshTokenTtlSeconds = 60 * 60 * 24 * 30;

function isoNow() {
  return new Date().toISOString();
}

function futureIso(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function hashToken(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function issueSessionTokens(user: { id: string; email: string; role: UserRole }, licenseKey: string, machineId: string) {
  const accessPayload: JwtPayload = {
    sub: user.id,
    email: user.email,
    licenseKey,
    machineId,
    role: user.role,
    tokenType: 'access'
  };

  const refreshTokenId = uuid();
  const refreshTokenSecret = crypto.randomBytes(32).toString('hex');
  const refreshPayload: JwtPayload = {
    ...accessPayload,
    tokenType: 'refresh'
  };

  const token = jwt.sign(accessPayload, jwtSecret, { expiresIn: accessTokenTtlSeconds });
  const refreshToken = jwt.sign({ ...refreshPayload, jti: refreshTokenId, nonce: refreshTokenSecret }, jwtSecret, { expiresIn: refreshTokenTtlSeconds });
  db.prepare(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(refreshTokenId, user.id, hashToken(refreshToken), futureIso(refreshTokenTtlSeconds), isoNow(), null);

  return { token, refreshToken };
}

function buildSession(user: any, license: any, machineId: string): UserSession {
  const tokens = issueSessionTokens({ id: user.id, email: user.email, role: user.role as UserRole }, license.license_key, machineId);
  return {
    token: tokens.token,
    refreshToken: tokens.refreshToken,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      role: user.role
    },
    license: normalizeLicense({ ...license, activated_machine_id: license.activated_machine_id ?? machineId })
  };
}

function normalizeLicense(row: any) {
  return {
    key: row.license_key,
    planName: row.plan_name,
    status: row.status,
    expiresAt: row.expires_at,
    activatedMachineId: row.activated_machine_id
  };
}

function normalizeManagedLicense(row: any): ManagedLicense {
  return {
    id: row.id,
    key: row.license_key,
    planName: row.plan_name,
    status: row.status,
    expiresAt: row.expires_at,
    activatedMachineId: row.activated_machine_id,
    createdAt: row.created_at,
    activatedAt: row.activated_at
  };
}

function getLicenses(userId: string): ManagedLicense[] {
  const rows = db
    .prepare('SELECT * FROM licenses WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId) as any[];

  return rows.map(normalizeManagedLicense);
}

function generateLicenseKey() {
  const token = Math.random().toString(36).slice(2, 8).toUpperCase();
  const segment = Date.now().toString().slice(-6);
  return `CFLOW-${segment}-${token}`;
}

function getContracts(userId: string): Contract[] {
  const rows = db
    .prepare(
      `SELECT contracts.*, customers.name as customer_name
       FROM contracts
       JOIN customers ON customers.id = contracts.customer_id
       WHERE contracts.user_id = ?
       ORDER BY renewal_date ASC`
    )
    .all(userId) as any[];

  return rows.map((row) => ({
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    title: row.title,
    valueCents: row.value_cents,
    startDate: row.start_date,
    endDate: row.end_date,
    renewalDate: row.renewal_date,
    status: row.status,
    autoRenew: Boolean(row.auto_renew),
    paymentCycle: row.payment_cycle,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

function getCustomers(userId: string): Customer[] {
  const rows = db.prepare('SELECT * FROM customers WHERE user_id = ? ORDER BY created_at DESC').all(userId) as any[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    company: row.company,
    phone: row.phone,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token ausente.' });
  }

  try {
    const payload = jwt.verify(header.slice(7), jwtSecret) as JwtPayload;
    if (payload.tokenType !== 'access') {
      return res.status(401).json({ message: 'Token invalido.' });
    }
    const license = db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(payload.licenseKey) as any;

    if (!license || license.status !== 'active') {
      return res.status(403).json({ message: 'Licenca invalida ou suspensa.' });
    }

    if (license.activated_machine_id && license.activated_machine_id !== payload.machineId) {
      return res.status(403).json({ message: 'Licenca vinculada a outra maquina.' });
    }

    req.auth = payload;
    next();
  } catch {
    return res.status(401).json({ message: 'Token invalido.' });
  }
}

function ownerOnly(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.auth?.role !== 'owner') {
    return res.status(403).json({ message: 'Apenas usuarios owner podem administrar licencas.' });
  }

  return next();
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: isoNow() });
});

app.post('/auth/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Dados de login invalidos.', issues: parsed.error.flatten() });
  }

  const { email, password, licenseKey, machineId } = parsed.data;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
  const license = db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(licenseKey) as any;

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ message: 'Credenciais invalidas.' });
  }

  if (!license || license.user_id !== user.id) {
    return res.status(403).json({ message: 'Licenca nao encontrada para este usuario.' });
  }

  if (license.status !== 'active') {
    return res.status(403).json({ message: 'Licenca nao esta ativa.' });
  }

  if (new Date(license.expires_at).getTime() < Date.now()) {
    db.prepare('UPDATE licenses SET status = ? WHERE id = ?').run('expired', license.id);
    return res.status(403).json({ message: 'Licenca expirada.' });
  }

  if (license.activated_machine_id && license.activated_machine_id !== machineId) {
    return res.status(403).json({ message: 'Essa licenca ja foi ativada em outra maquina.' });
  }

  if (!license.activated_machine_id) {
    db.prepare('UPDATE licenses SET activated_machine_id = ?, activated_at = ? WHERE id = ?').run(machineId, isoNow(), license.id);
  }

  const session = buildSession(user, license, machineId);

  return res.json(session);
});

app.post('/auth/refresh', (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Dados invalidos para refresh.' });
  }

  const refreshRow = db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked_at IS NULL').get(hashToken(parsed.data.refreshToken)) as any;
  if (!refreshRow) {
    return res.status(401).json({ message: 'Refresh token invalido.' });
  }

  if (new Date(refreshRow.expires_at).getTime() < Date.now()) {
    db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?').run(isoNow(), refreshRow.id);
    return res.status(401).json({ message: 'Refresh token expirado.' });
  }

  try {
    const payload = jwt.verify(parsed.data.refreshToken, jwtSecret) as JwtPayload & { jti?: string };
    if (payload.tokenType !== 'refresh') {
      return res.status(401).json({ message: 'Refresh token invalido.' });
    }

    if (!payload.jti || payload.jti !== refreshRow.id) {
      return res.status(401).json({ message: 'Refresh token invalido.' });
    }

    if (payload.machineId !== parsed.data.machineId) {
      return res.status(403).json({ message: 'Refresh token nao pertence a esta maquina.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub) as any;
    const license = db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(payload.licenseKey) as any;

    if (!user || !license || license.status !== 'active') {
      return res.status(403).json({ message: 'Sessao nao pode ser renovada.' });
    }

    if (license.activated_machine_id && license.activated_machine_id !== parsed.data.machineId) {
      return res.status(403).json({ message: 'Licenca vinculada a outra maquina.' });
    }

    db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?').run(isoNow(), refreshRow.id);
    const nextSession = buildSession(user, license, parsed.data.machineId);
    return res.json(nextSession);
  } catch {
    return res.status(401).json({ message: 'Refresh token invalido.' });
  }
});

app.get('/me', authMiddleware, (req: AuthRequest, res) => {
  const user = db.prepare('SELECT id, email, display_name, role FROM users WHERE id = ?').get(req.auth?.sub) as any;
  const license = db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(req.auth?.licenseKey) as any;

  return res.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      role: user.role
    },
    license: normalizeLicense(license)
  });
});

app.get('/customers', authMiddleware, (req: AuthRequest, res) => {
  return res.json(getCustomers(req.auth!.sub));
});

app.post('/customers', authMiddleware, (req: AuthRequest, res) => {
  const parsed = customerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Cliente invalido.' });
  }

  const now = isoNow();
  const customer = { id: uuid(), ...parsed.data, createdAt: now, updatedAt: now };
  db.prepare(
    `INSERT INTO customers (id, user_id, name, email, company, phone, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(customer.id, req.auth!.sub, customer.name, customer.email, customer.company, customer.phone, customer.notes, customer.createdAt, customer.updatedAt);

  return res.status(201).json(customer);
});

app.put('/customers/:id', authMiddleware, (req: AuthRequest, res) => {
  const parsed = customerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Cliente invalido.' });
  }

  const now = isoNow();
  const result = db.prepare(
    `UPDATE customers
     SET name = ?, email = ?, company = ?, phone = ?, notes = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`
  ).run(parsed.data.name, parsed.data.email, parsed.data.company, parsed.data.phone, parsed.data.notes, now, req.params.id, req.auth!.sub);

  if (!result.changes) {
    return res.status(404).json({ message: 'Cliente nao encontrado.' });
  }

  return res.json({ id: req.params.id, ...parsed.data, updatedAt: now });
});

app.delete('/customers/:id', authMiddleware, (req: AuthRequest, res) => {
  const linkedContracts = db.prepare('SELECT COUNT(*) as total FROM contracts WHERE customer_id = ? AND user_id = ?').get(req.params.id, req.auth!.sub) as { total: number };
  if (linkedContracts.total > 0) {
    return res.status(400).json({ message: 'Remova os contratos vinculados antes de excluir o cliente.' });
  }

  const result = db.prepare('DELETE FROM customers WHERE id = ? AND user_id = ?').run(req.params.id, req.auth!.sub);
  if (!result.changes) {
    return res.status(404).json({ message: 'Cliente nao encontrado.' });
  }

  return res.status(204).send();
});

app.get('/contracts', authMiddleware, (req: AuthRequest, res) => {
  return res.json(getContracts(req.auth!.sub));
});

app.get('/licenses', authMiddleware, ownerOnly, (req: AuthRequest, res) => {
  return res.json(getLicenses(req.auth!.sub));
});

app.post('/licenses', authMiddleware, ownerOnly, (req: AuthRequest, res) => {
  const parsed = licenseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Licenca invalida.', issues: parsed.error.flatten() });
  }

  const now = isoNow();
  const id = uuid();
  const licenseKey = generateLicenseKey();

  db.prepare(
    `INSERT INTO licenses (
      id, license_key, plan_name, status, expires_at, activated_machine_id, user_id, created_at, activated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, licenseKey, parsed.data.planName, parsed.data.status, parsed.data.expiresAt, null, req.auth!.sub, now, null);

  const created = db.prepare('SELECT * FROM licenses WHERE id = ?').get(id) as any;
  return res.status(201).json(normalizeManagedLicense(created));
});

app.put('/licenses/:id', authMiddleware, ownerOnly, (req: AuthRequest, res) => {
  const parsed = licenseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Licenca invalida.', issues: parsed.error.flatten() });
  }

  const result = db.prepare(
    `UPDATE licenses
     SET plan_name = ?, status = ?, expires_at = ?
     WHERE id = ? AND user_id = ?`
  ).run(parsed.data.planName, parsed.data.status, parsed.data.expiresAt, req.params.id, req.auth!.sub);

  if (!result.changes) {
    return res.status(404).json({ message: 'Licenca nao encontrada.' });
  }

  const updated = db.prepare('SELECT * FROM licenses WHERE id = ?').get(req.params.id) as any;
  return res.json(normalizeManagedLicense(updated));
});

app.post('/licenses/:id/reset-machine', authMiddleware, ownerOnly, (req: AuthRequest, res) => {
  const result = db.prepare(
    `UPDATE licenses
     SET activated_machine_id = NULL, activated_at = NULL
     WHERE id = ? AND user_id = ?`
  ).run(req.params.id, req.auth!.sub);

  if (!result.changes) {
    return res.status(404).json({ message: 'Licenca nao encontrada.' });
  }

  const updated = db.prepare('SELECT * FROM licenses WHERE id = ?').get(req.params.id) as any;
  return res.json(normalizeManagedLicense(updated));
});

app.post('/contracts', authMiddleware, (req: AuthRequest, res) => {
  const parsed = contractSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Contrato invalido.', issues: parsed.error.flatten() });
  }

  const customerExists = db.prepare('SELECT id FROM customers WHERE id = ? AND user_id = ?').get(parsed.data.customerId, req.auth!.sub) as { id: string } | undefined;
  if (!customerExists) {
    return res.status(400).json({ message: 'Cliente nao encontrado.' });
  }

  const now = isoNow();
  const contract = { id: uuid(), ...parsed.data, createdAt: now, updatedAt: now };
  db.prepare(
    `INSERT INTO contracts (
      id, user_id, customer_id, title, value_cents, start_date, end_date, renewal_date, status, auto_renew, payment_cycle, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    contract.id,
    req.auth!.sub,
    contract.customerId,
    contract.title,
    contract.valueCents,
    contract.startDate,
    contract.endDate,
    contract.renewalDate,
    contract.status,
    contract.autoRenew ? 1 : 0,
    contract.paymentCycle,
    contract.notes,
    contract.createdAt,
    contract.updatedAt
  );

  const created = getContracts(req.auth!.sub).find((item) => item.id === contract.id);
  return res.status(201).json(created);
});

app.put('/contracts/:id', authMiddleware, (req: AuthRequest, res) => {
  const parsed = contractSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Contrato invalido.', issues: parsed.error.flatten() });
  }

  const now = isoNow();
  const result = db.prepare(
    `UPDATE contracts
     SET customer_id = ?, title = ?, value_cents = ?, start_date = ?, end_date = ?, renewal_date = ?, status = ?, auto_renew = ?, payment_cycle = ?, notes = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`
  ).run(
    parsed.data.customerId,
    parsed.data.title,
    parsed.data.valueCents,
    parsed.data.startDate,
    parsed.data.endDate,
    parsed.data.renewalDate,
    parsed.data.status,
    parsed.data.autoRenew ? 1 : 0,
    parsed.data.paymentCycle,
    parsed.data.notes,
    now,
    req.params.id,
    req.auth!.sub
  );

  if (!result.changes) {
    return res.status(404).json({ message: 'Contrato nao encontrado.' });
  }

  const updated = getContracts(req.auth!.sub).find((item) => item.id === req.params.id);
  return res.json(updated);
});

app.delete('/contracts/:id', authMiddleware, (req: AuthRequest, res) => {
  const result = db.prepare('DELETE FROM contracts WHERE id = ? AND user_id = ?').run(req.params.id, req.auth!.sub);
  if (!result.changes) {
    return res.status(404).json({ message: 'Contrato nao encontrado.' });
  }

  return res.status(204).send();
});

app.get('/dashboard', authMiddleware, (req: AuthRequest, res) => {
  const contracts = getContracts(req.auth!.sub);
  const now = Date.now();
  const thirtyDays = 1000 * 60 * 60 * 24 * 30;
  const payload: DashboardPayload = {
    metrics: {
      activeContracts: contracts.filter((contract) => contract.status === 'active').length,
      expiringSoon: contracts.filter((contract) => {
        const renewal = new Date(contract.renewalDate).getTime();
        return renewal >= now && renewal <= now + thirtyDays;
      }).length,
      expiredContracts: contracts.filter((contract) => new Date(contract.endDate).getTime() < now || contract.status === 'expired').length,
      monthlyRecurringRevenueCents: contracts
        .filter((contract) => contract.status !== 'expired')
        .reduce((total, contract) => total + (contract.paymentCycle === 'monthly' ? contract.valueCents : contract.valueCents / 12), 0),
      projectedRenewalValueCents: contracts
        .filter((contract) => {
          const renewal = new Date(contract.renewalDate).getTime();
          return renewal >= now && renewal <= now + thirtyDays;
        })
        .reduce((total, contract) => total + contract.valueCents, 0)
    },
    upcomingRenewals: contracts.slice(0, 5)
  };

  return res.json(payload);
});

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  return res.status(500).json({ message: 'Erro interno no servidor.' });
});

app.listen(port, () => {
  console.log(`ContractFlow API rodando na porta ${port}`);
});
