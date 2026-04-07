import type { UserRole } from '@contractflow/shared';
import type { Request } from 'express';

/** Payload decodificado do JWT de acesso ou refresh. */
export type JwtPayload = {
  sub: string;
  email: string;
  licenseKey: string;
  machineId: string;
  role: UserRole;
  tokenType: 'access' | 'refresh';
  jti?: string;
  nonce?: string;
};

/** Request Express enriquecido com dados do token autenticado. */
export type AuthRequest = Request & {
  auth?: JwtPayload;
};
