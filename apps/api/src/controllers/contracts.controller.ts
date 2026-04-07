import type { Response, NextFunction } from 'express';
import type { AuthRequest } from '../types/auth.types.js';
import { contractSchema, clmTransitionSchema } from '../validators/contracts.validator.js';
import { contractsService } from '../services/contracts.service.js';
import { ValidationError } from '../types/errors.js';

export const contractsController = {
  list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      res.json(contractsService.listForUser(req.auth!.sub));
    } catch (err) {
      next(err);
    }
  },

  getOne(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      res.json(contractsService.getByIdForUser(req.params.id as string, req.auth!.sub));
    } catch (err) {
      next(err);
    }
  },

  create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const parsed = contractSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('Contrato invalido.');
      const contract = contractsService.create(req.auth!.sub, parsed.data);
      res.status(201).json(contract);
    } catch (err) {
      next(err);
    }
  },

  update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const parsed = contractSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('Contrato invalido.');
      const contract = contractsService.update(req.params.id as string, req.auth!.sub, parsed.data);
      res.json(contract);
    } catch (err) {
      next(err);
    }
  },

  remove(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      contractsService.delete(req.params.id as string, req.auth!.sub);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  transitionClmStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const parsed = clmTransitionSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('Status CLM invalido.');
      const contract = contractsService.transitionClmStatus(req.params.id as string, req.auth!.sub, parsed.data.clmStatus);
      res.json(contract);
    } catch (err) {
      next(err);
    }
  }
};
