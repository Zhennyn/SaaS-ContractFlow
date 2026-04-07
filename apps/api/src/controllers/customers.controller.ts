import type { Response, NextFunction } from 'express';
import type { AuthRequest } from '../types/auth.types.js';
import { customerSchema } from '../validators/customers.validator.js';
import { customersService } from '../services/customers.service.js';
import { ValidationError } from '../types/errors.js';

export const customersController = {
  list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      res.json(customersService.listForUser(req.auth!.sub));
    } catch (err) {
      next(err);
    }
  },

  create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const parsed = customerSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('Cliente invalido.');
      const customer = customersService.create(req.auth!.sub, parsed.data);
      res.status(201).json(customer);
    } catch (err) {
      next(err);
    }
  },

  update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const parsed = customerSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('Cliente invalido.');
      const customer = customersService.update(req.params.id as string, req.auth!.sub, parsed.data);
      res.json(customer);
    } catch (err) {
      next(err);
    }
  },

  remove(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      customersService.delete(req.params.id as string, req.auth!.sub);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
};
