import { Router } from 'express';
import { customersController } from '../controllers/customers.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authMiddleware);

router.get('/', customersController.list);
router.post('/', customersController.create);
router.put('/:id', customersController.update);
router.delete('/:id', customersController.remove);

export default router;
