import type { Request, Response } from 'express';
import { uploadService } from '../services/upload.service.js';
import { logger } from '../utils/logger.js';

export const uploadController = {
  /**
   * POST /contracts/:contractId/attachments
   * Faz upload de arquivo para um contrato
   * Body: multipart/form-data com campo 'file'
   */
  async uploadAttachment(req: Request, res: Response) {
    const userId = (req as any).user?.sub || '';
    const { contractId } = req.params as { contractId: string };

    // Valida se arquivo foi enviado
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo foi enviado' });
    }

    try {
      const attachment = await uploadService.uploadFile({
        contractId,
        userId,
        fileName: req.file.originalname || 'document.pdf',
        fileBuffer: req.file.buffer,
        mimeType: req.file.mimetype || 'application/pdf'
      });

      res.status(201).json(attachment);
    } catch (err) {
      logger.error('Upload failed', { error: String(err) });
      throw err;
    }
  },

  /**
   * GET /contracts/:contractId/attachments
   * Lista todos os attachments de um contrato
   */
  getAttachments(req: Request, res: Response) {
    const userId = (req as any).user?.sub || '';
    const { contractId } = req.params as { contractId: string };

    const attachments = uploadService.getAttachments(contractId, userId);
    res.json(attachments);
  },

  /**
   * GET /contracts/:contractId/attachments/:attachmentId/download
   * Faz download de um arquivo
   */
  async downloadAttachment(req: Request, res: Response) {
    const userId = (req as any).user?.sub || '';
    const { contractId, attachmentId } = req.params as { contractId: string; attachmentId: string };

    try {
      const { buffer, fileName, mimeType } = await uploadService.downloadFile({
        attachmentId,
        contractId,
        userId
      });

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(buffer);
    } catch (err) {
      logger.error('Download failed', { error: String(err) });
      throw err;
    }
  },

  /**
   * DELETE /contracts/:contractId/attachments/:attachmentId
   * Deleta um arquivo
   */
  async deleteAttachment(req: Request, res: Response) {
    const userId = (req as any).user?.sub || '';
    const { contractId, attachmentId } = req.params as { contractId: string; attachmentId: string };

    try {
      await uploadService.deleteFile({
        attachmentId,
        contractId,
        userId
      });

      res.status(204).send();
    } catch (err) {
      logger.error('Delete failed', { error: String(err) });
      throw err;
    }
  }
};
