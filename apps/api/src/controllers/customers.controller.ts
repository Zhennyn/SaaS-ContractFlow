import type { Response, NextFunction } from 'express';
import type { AuthRequest } from '../types/auth.types.js';
import { customerSchema } from '../validators/customers.validator.js';
import { customersService } from '../services/customers.service.js';
import { ValidationError } from '../types/errors.js';

function getString(val: any): string | undefined {
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val[0];
  return undefined;
}

function getNumber(val: any, def: number = 0): number {
  const str = getString(val);
  return str ? Math.max(0, Number(str)) : def;
}

export const customersController = {
  list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      // Se houver query params de busca, usa search
      if (req.query.search) {
        const result = customersService.search(req.auth!.sub, {
          search: getString(req.query.search),
          limit: getNumber(req.query.limit, 50),
          offset: getNumber(req.query.offset, 0)
        });
        return res.json({
          data: result.customers,
          pagination: {
            limit: Math.min(getNumber(req.query.limit, 50), 500),
            offset: getNumber(req.query.offset, 0),
            total: result.total
          }
        });
      }

      // Caso contrário, retorna todos
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
