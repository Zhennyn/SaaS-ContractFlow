import { Router } from 'express';
import multer from 'multer';
import { contractsController } from '../controllers/contracts.controller.js';
import { uploadController } from '../controllers/upload.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authMiddleware);

router.get('/', contractsController.list);
router.get('/:id', contractsController.getOne);
router.post('/', contractsController.create);
router.put('/:id', contractsController.update);
router.delete('/:id', contractsController.remove);
router.patch('/:id/clm-status', contractsController.transitionClmStatus);

// Attachment routes
router.post('/:contractId/attachments', upload.single('file'), uploadController.uploadAttachment);
router.get('/:contractId/attachments', uploadController.getAttachments);
router.get('/:contractId/attachments/:attachmentId/download', uploadController.downloadAttachment);
router.delete('/:contractId/attachments/:attachmentId', uploadController.deleteAttachment);

export default router;
