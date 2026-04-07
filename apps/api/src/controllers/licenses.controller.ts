import type { Response, NextFunction } from 'express';
import type { AuthRequest } from '../types/auth.types.js';
import { licenseSchema } from '../validators/licenses.validator.js';
import { licensesService } from '../services/licenses.service.js';
import { ValidationError } from '../types/errors.js';

export const licensesController = {
  list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      res.json(licensesService.listForUser(req.auth!.sub));
    } catch (err) {
      next(err);
    }
  },

  create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const parsed = licenseSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('Licenca invalida.');
      const license = licensesService.create(
        req.auth!.sub,
        parsed.data.planName,
        parsed.data.status,
        parsed.data.expiresAt
      );
      res.status(201).json(license);
    } catch (err) {
      next(err);
    }
  },

  update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const parsed = licenseSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('Licenca invalida.');
      const license = licensesService.update(
        req.params.id as string,
        req.auth!.sub,
        parsed.data.planName,
        parsed.data.status,
        parsed.data.expiresAt
      );
      res.json(license);
    } catch (err) {
      next(err);
    }
  },

  resetMachine(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const license = licensesService.resetMachine(req.params.id as string, req.auth!.sub);
      res.json(license);
    } catch (err) {
      next(err);
    }
  }
};
