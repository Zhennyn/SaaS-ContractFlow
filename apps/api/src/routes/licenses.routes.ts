import { Router } from 'express';
import { licensesController } from '../controllers/licenses.controller.js';
import { authMiddleware, ownerOnly } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authMiddleware, ownerOnly);

router.get('/', licensesController.list);
router.post('/', licensesController.create);
router.put('/:id', licensesController.update);
router.post('/:id/reset-machine', licensesController.resetMachine);

export default router;
