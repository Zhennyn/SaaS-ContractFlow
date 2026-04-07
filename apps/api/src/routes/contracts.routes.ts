import { Router } from 'express';
import { contractsController } from '../controllers/contracts.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authMiddleware);

router.get('/', contractsController.list);
router.get('/:id', contractsController.getOne);
router.post('/', contractsController.create);
router.put('/:id', contractsController.update);
router.delete('/:id', contractsController.remove);
router.patch('/:id/clm-status', contractsController.transitionClmStatus);

export default router;
