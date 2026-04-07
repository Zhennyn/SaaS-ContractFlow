import jwt from 'jsonwebtoken';
import type { Response, NextFunction } from 'express';
import type { JwtPayload } from '../types/auth.types.js';
import type { AuthRequest } from '../types/auth.types.js';
import { licensesRepository } from '../repositories/licenses.repository.js';
import { ForbiddenError, UnauthorizedError } from '../types/errors.js';

const jwtSecret = process.env.JWT_SECRET ?? 'replace-this-secret';

export function authMiddleware(req: AuthRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Token ausente.'));
  }

  try {
    const payload = jwt.verify(header.slice(7), jwtSecret) as JwtPayload;
    if (payload.tokenType !== 'access') {
      return next(new UnauthorizedError('Token invalido.'));
    }

    const license = licensesRepository.findByKey(payload.licenseKey);
    if (!license || license.status !== 'active') {
      return next(new ForbiddenError('Licenca invalida ou suspensa.'));
    }

    if (license.activated_machine_id && license.activated_machine_id !== payload.machineId) {
      return next(new ForbiddenError('Licenca vinculada a outra maquina.'));
    }

    req.auth = payload;
    next();
  } catch {
    next(new UnauthorizedError('Token invalido.'));
  }
}

export function ownerOnly(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (req.auth?.role !== 'owner') {
    return next(new ForbiddenError('Apenas usuarios owner podem realizar esta acao.'));
  }
  next();
}
