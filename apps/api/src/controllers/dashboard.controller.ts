import type { Response, NextFunction } from 'express';
import type { AuthRequest } from '../types/auth.types.js';
import { dashboardService } from '../services/dashboard.service.js';

export const dashboardController = {
  get(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      res.json(dashboardService.getPayload(req.auth!.sub));
    } catch (err) {
      next(err);
    }
  }
};
