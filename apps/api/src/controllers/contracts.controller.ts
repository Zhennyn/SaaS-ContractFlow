import type { Response, NextFunction } from 'express';
import type { AuthRequest } from '../types/auth.types.js';
import { contractSchema, clmTransitionSchema } from '../validators/contracts.validator.js';
import { contractsService } from '../services/contracts.service.js';
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

export const contractsController = {
  list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      // Se houver query params de filtro, usa search
      if (req.query.status || req.query.clmStatus || req.query.search) {
        const result = contractsService.search(req.auth!.sub, {
          status: getString(req.query.status),
          clmStatus: getString(req.query.clmStatus),
          search: getString(req.query.search),
          limit: getNumber(req.query.limit, 50),
          offset: getNumber(req.query.offset, 0)
        });
        return res.json({
          data: result.contracts,
          pagination: {
            limit: Math.min(getNumber(req.query.limit, 50), 500),
            offset: getNumber(req.query.offset, 0),
            total: result.total
          }
        });
      }

      // Caso contrário, retorna todos (sem paginação, para compatibilidade)
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
