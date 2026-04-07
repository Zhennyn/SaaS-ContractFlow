import type { Request, Response, NextFunction } from 'express';
import { loginSchema, refreshSchema } from '../validators/auth.validator.js';
import { authService } from '../services/auth.service.js';
import { ValidationError } from '../types/errors.js';
import type { AuthRequest } from '../types/auth.types.js';
import { usersRepository } from '../repositories/users.repository.js';
import { licensesRepository, toLicenseSummary } from '../repositories/licenses.repository.js';

export const authController = {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('Dados de login invalidos.');
      const { email, password, licenseKey, machineId } = parsed.data;
      const session = await authService.login(email, password, licenseKey, machineId);
      res.json(session);
    } catch (err) {
      next(err);
    }
  },

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = refreshSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('Dados invalidos para refresh.');
      const session = await authService.refresh(parsed.data.refreshToken, parsed.data.machineId);
      res.json(session);
    } catch (err) {
      next(err);
    }
  },

  getMe(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = usersRepository.findById(req.auth!.sub);
      const license = licensesRepository.findByKey(req.auth!.licenseKey);
      res.json({
        user: {
          id: user!.id,
          email: user!.email,
          displayName: user!.display_name,
          role: user!.role
        },
        license: toLicenseSummary(license!)
      });
    } catch (err) {
      next(err);
    }
  }
};
