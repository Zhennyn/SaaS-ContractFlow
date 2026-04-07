import fs from 'node:fs/promises';
import path from 'node:path';
import type { ContractAttachment } from '@contractflow/shared';
import { attachmentsRepository } from '../repositories/attachments.repository.js';
import { contractsRepository } from '../repositories/contracts.repository.js';
import { ValidationError, NotFoundError } from '../types/errors.js';
import { auditService } from './audit.service.js';
import { logger } from '../utils/logger.js';

const UPLOAD_DIR = path.resolve(process.cwd(), 'apps/api/data/uploads');
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const ALLOWED_MIME_TYPES = ['application/pdf', 'application/x-pdf'];

export const uploadService = {
  /**
   * Inicializa o diretório de uploads
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(UPLOAD_DIR, { recursive: true });
      logger.info('Upload directory initialized', { dir: UPLOAD_DIR });
    } catch (err) {
      logger.warn('Failed to create upload directory', { error: String(err) });
    }
  },

  /**
   * Faz upload de um arquivo para um contrato
   */
  async uploadFile(payload: {
    contractId: string;
    userId: string;
    fileName: string;
    fileBuffer: Buffer;
    mimeType: string;
  }): Promise<ContractAttachment> {
    // Valida que contrato existe e pertence ao usuário
    const contract = contractsRepository.findById(payload.contractId, payload.userId);
    if (!contract) {
      throw new NotFoundError('Contrato');
    }

    // Valida tipo MIME
    if (!ALLOWED_MIME_TYPES.includes(payload.mimeType)) {
      throw new ValidationError('Apenas arquivos PDF são permitidos');
    }

    // Valida tamanho
    if (payload.fileBuffer.length > MAX_FILE_SIZE) {
      throw new ValidationError(`Arquivo excede limite de 50 MB`);
    }

    // Valida nome de arquivo
    if (!payload.fileName) {
      throw new ValidationError('Nome de arquivo é obrigatório');
    }

    // Gera nome de arquivo seguro
    const safeFileName = generateSafeFileName(payload.fileName);
    const fileDir = path.join(UPLOAD_DIR, payload.contractId);
    const filePath = path.join(fileDir, safeFileName);

    // Cria diretório se não existir
    await fs.mkdir(fileDir, { recursive: true });

    // Escreve arquivo
    try {
      await fs.writeFile(filePath, payload.fileBuffer);
    } catch (err) {
      logger.error('Failed to write file', { error: String(err), path: filePath });
      throw new Error('Falha ao salvar arquivo');
    }

    // Registra no banco
    const attachment = attachmentsRepository.create({
      contractId: payload.contractId,
      fileName: payload.fileName,
      filePath: safeFileName, // Armazena apenas o nome, não o caminho completo
      fileSize: payload.fileBuffer.length,
      mimeType: payload.mimeType,
      uploadedBy: payload.userId
    });

    // Registra auditoria
    auditService.logAction({
      userId: payload.userId,
      action: 'CONTRACT_UPDATED',
      resourceType: 'contract',
      resourceId: payload.contractId,
      newValues: {
        attachment: {
          id: attachment.id,
          fileName: attachment.fileName,
          fileSize: attachment.fileSize
        }
      }
    });

    logger.info('File uploaded', {
      attachmentId: attachment.id,
      contractId: payload.contractId,
      fileName: safeFileName,
      fileSize: attachment.fileSize
    });

    return attachment;
  },

  /**
   * Obtém lista de attachments de um contrato
   */
  getAttachments(contractId: string, userId: string): ContractAttachment[] {
    // Valida acesso ao contrato
    const contract = contractsRepository.findById(contractId, userId);
    if (!contract) {
      throw new NotFoundError('Contrato');
    }

    return attachmentsRepository.findByContractId(contractId);
  },

  /**
   * Faz download de um arquivo
   */
  async downloadFile(payload: {
    attachmentId: string;
    contractId: string;
    userId: string;
  }): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    // Valida acesso ao contrato
    const contract = contractsRepository.findById(payload.contractId, payload.userId);
    if (!contract) {
      throw new NotFoundError('Contrato');
    }

    // Encontra attachment
    const attachment = attachmentsRepository.findById(payload.attachmentId, payload.contractId);
    if (!attachment) {
      throw new NotFoundError('Arquivo');
    }

    // Lê arquivo do sistema de arquivos
    const fileDir = path.join(UPLOAD_DIR, payload.contractId);
    const filePath = path.join(fileDir, attachment.filePath);

    let buffer: Buffer;
    try {
      buffer = await fs.readFile(filePath);
    } catch (err) {
      logger.error('Failed to read file', { error: String(err), path: filePath });
      throw new Error('Falha ao ler arquivo');
    }

    logger.info('File downloaded', {
      attachmentId: payload.attachmentId,
      contractId: payload.contractId,
      userId: payload.userId
    });

    return {
      buffer,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType
    };
  },

  /**
   * Deleta um arquivo
   */
  async deleteFile(payload: {
    attachmentId: string;
    contractId: string;
    userId: string;
  }): Promise<void> {
    // Valida acesso ao contrato
    const contract = contractsRepository.findById(payload.contractId, payload.userId);
    if (!contract) {
      throw new NotFoundError('Contrato');
    }

    // Encontra attachment
    const attachment = attachmentsRepository.findById(payload.attachmentId, payload.contractId);
    if (!attachment) {
      throw new NotFoundError('Arquivo');
    }

    // Deleta arquivo do sistema de arquivos
    const fileDir = path.join(UPLOAD_DIR, payload.contractId);
    const filePath = path.join(fileDir, attachment.filePath);

    try {
      await fs.unlink(filePath);
    } catch (err) {
      logger.warn('Failed to delete physical file', { error: String(err), path: filePath });
      // Continua mesmo se não conseguir deletar o arquivo físico
    }

    // Deleta registro do banco
    attachmentsRepository.delete(payload.attachmentId, payload.contractId);

    // Registra auditoria
    auditService.logAction({
      userId: payload.userId,
      action: 'CONTRACT_UPDATED',
      resourceType: 'contract',
      resourceId: payload.contractId,
      newValues: {
        removedAttachment: {
          id: payload.attachmentId,
          fileName: attachment.fileName
        }
      }
    });

    logger.info('File deleted', {
      attachmentId: payload.attachmentId,
      contractId: payload.contractId,
      userId: payload.userId
    });
  }
};

/**
 * Gera um nome de arquivo seguro removendo caracteres especiais
 */
function generateSafeFileName(originalName: string): string {
  const timestamp = Date.now();
  const ext = originalName.slice(-4); // pega última extensão
  const base = originalName.replace(/[^a-zA-Z0-9.-]/g, '_').replace(/\.{2,}/g, '.');
  return `${timestamp}_${base}`;
}
