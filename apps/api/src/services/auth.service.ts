import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import type { UserRole, UserSession } from '@contractflow/shared';
import type { JwtPayload } from '../types/auth.types.js';
import { ForbiddenError, UnauthorizedError } from '../types/errors.js';
import { usersRepository } from '../repositories/users.repository.js';
import { licensesRepository, toLicenseSummary } from '../repositories/licenses.repository.js';
import { refreshTokensRepository } from '../repositories/refresh-tokens.repository.js';
import { logger } from '../utils/logger.js';

const jwtSecret = process.env.JWT_SECRET ?? 'replace-this-secret';
const ACCESS_TOKEN_TTL = 60 * 15;
const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 30;

function isoNow() {
  return new Date().toISOString();
}

function futureIso(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export function issueSessionTokens(
  user: { id: string; email: string; role: UserRole },
  licenseKey: string,
  machineId: string
): { token: string; refreshToken: string } {
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
    tokenType: 'refresh',
    jti: refreshTokenId,
    nonce: refreshTokenSecret
  };

  const token = jwt.sign(accessPayload, jwtSecret, { expiresIn: ACCESS_TOKEN_TTL });
  const refreshToken = jwt.sign(refreshPayload, jwtSecret, { expiresIn: REFRESH_TOKEN_TTL });

  refreshTokensRepository.insert(refreshTokenId, user.id, refreshToken, futureIso(REFRESH_TOKEN_TTL), isoNow());
  return { token, refreshToken };
}

export function buildSession(userRow: any, licenseRow: any, machineId: string): UserSession {
  const tokens = issueSessionTokens(
    { id: userRow.id, email: userRow.email, role: userRow.role as UserRole },
    licenseRow.license_key,
    machineId
  );
  return {
    token: tokens.token,
    refreshToken: tokens.refreshToken,
    user: {
      id: userRow.id,
      email: userRow.email,
      displayName: userRow.display_name,
      role: userRow.role as UserRole
    },
    license: toLicenseSummary({ ...licenseRow, activated_machine_id: licenseRow.activated_machine_id ?? machineId })
  };
}

export const authService = {
  async login(email: string, password: string, licenseKey: string, machineId: string): Promise<UserSession> {
    const user = usersRepository.findByEmail(email);
    const license = licensesRepository.findByKey(licenseKey);

    // Valida credenciais e licença em bloco para evitar timing-attack de enumeração.
    const passwordMatch = user ? await bcrypt.compare(password, user.password_hash) : false;

    if (!user || !passwordMatch) {
      logger.warn('Login falhou — credenciais invalidas', { email });
      throw new UnauthorizedError('Credenciais invalidas.');
    }

    if (!license || license.user_id !== user.id) {
      throw new ForbiddenError('Licenca nao encontrada para este usuario.');
    }

    if (license.status !== 'active') {
      throw new ForbiddenError('Licenca nao esta ativa.');
    }

    if (new Date(license.expires_at).getTime() < Date.now()) {
      licensesRepository.expire(license.id);
      throw new ForbiddenError('Licenca expirada.');
    }

    if (license.activated_machine_id && license.activated_machine_id !== machineId) {
      throw new ForbiddenError('Essa licenca ja foi ativada em outra maquina.');
    }

    if (!license.activated_machine_id) {
      licensesRepository.activateMachine(license.id, machineId, isoNow());
    }

    logger.info('Login bem-sucedido', { userId: user.id, email });
    return buildSession(user, license, machineId);
  },

  async refresh(rawRefreshToken: string, machineId: string): Promise<UserSession> {
    const tokenRow = refreshTokensRepository.findByRawToken(rawRefreshToken);
    if (!tokenRow) throw new UnauthorizedError('Refresh token invalido.');

    if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
      refreshTokensRepository.revoke(tokenRow.id, isoNow());
      throw new UnauthorizedError('Refresh token expirado.');
    }

    let payload: JwtPayload & { jti?: string };
    try {
      payload = jwt.verify(rawRefreshToken, jwtSecret) as JwtPayload;
    } catch {
      throw new UnauthorizedError('Refresh token invalido.');
    }

    if (payload.tokenType !== 'refresh') throw new UnauthorizedError('Refresh token invalido.');
    if (!payload.jti || payload.jti !== tokenRow.id) throw new UnauthorizedError('Refresh token invalido.');
    if (payload.machineId !== machineId) throw new ForbiddenError('Refresh token nao pertence a esta maquina.');

    const user = usersRepository.findById(payload.sub);
    const license = licensesRepository.findByKey(payload.licenseKey);

    if (!user || !license || license.status !== 'active') {
      throw new ForbiddenError('Sessao nao pode ser renovada.');
    }

    if (license.activated_machine_id && license.activated_machine_id !== machineId) {
      throw new ForbiddenError('Licenca vinculada a outra maquina.');
    }

    refreshTokensRepository.revoke(tokenRow.id, isoNow());
    return buildSession(user, license, machineId);
  }
};
