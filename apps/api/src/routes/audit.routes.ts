import { Router } from 'express';
import { auditController } from '../controllers/audit.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

// Todas as rotas de auditoria requerem autenticação
router.use(authMiddleware);

/**
 * GET /audit/resource/:resourceType/:resourceId
 * Obtém histórico de um recurso específico
 * Query params: limit, offset
 */
router.get('/resource/:resourceType/:resourceId', auditController.getResourceAudit);

/**
 * GET /audit/user
 * Obtém histórico do usuário autenticado
 * Query params: limit, offset
 */
router.get('/user', auditController.getUserAudit);

/**
 * GET /audit/all
 * Obtém todo histórico (admin only)
 * Query params: limit, offset
 */
router.get('/all', auditController.getAllAudit);

export default router;
