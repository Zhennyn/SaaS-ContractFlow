import type { Request, Response } from 'express';
import { auditService } from '../services/audit.service.js';

function getString(val: any): string | undefined {
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val[0];
  return undefined;
}

function getNumber(val: any, def: number = 0): number {
  const str = getString(val);
  return str ? Math.max(0, Number(str)) : def;
}

export const auditController = {
  /**
   * GET /audit/resource/:resourceType/:resourceId
   * Obtém histórico de auditoria de um recurso específico
   */
  getResourceAudit(req: Request, res: Response) {
    const resourceType = getString(req.params.resourceType) || '';
    const resourceId = getString(req.params.resourceId) || '';
    const limit = Math.min(getNumber(req.query.limit, 50), 500);
    const offset = getNumber(req.query.offset, 0);

    const history = auditService.getResourceHistory(resourceType, resourceId, { limit, offset });
    const count = auditService.getResourceChangeCount(resourceType, resourceId);

    res.json({
      data: history,
      pagination: {
        limit,
        offset,
        total: count
      }
    });
  },

  /**
   * GET /audit/user
   * Obtém histórico de auditoria do usuário atual
   */
  getUserAudit(req: Request, res: Response) {
    const userId = (req as any).user?.sub || '';
    const limit = Math.min(getNumber(req.query.limit, 50), 500);
    const offset = getNumber(req.query.offset, 0);

    const history = auditService.getUserHistory(userId, { limit, offset });

    res.json({
      data: history,
      pagination: {
        limit,
        offset
      }
    });
  },

  /**
   * GET /audit/all (admin only)
   * Obtém todo o histórico de auditoria
   */
  getAllAudit(req: Request, res: Response) {
    const limit = Math.min(getNumber(req.query.limit, 50), 500);
    const offset = getNumber(req.query.offset, 0);

    const history = auditService.getAllHistory({ limit, offset });

    res.json({
      data: history,
      pagination: {
        limit,
        offset
      }
    });
  }
};
