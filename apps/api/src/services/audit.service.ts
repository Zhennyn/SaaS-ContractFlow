import type { AuditLog, AuditAction } from '@contractflow/shared';
import { auditRepository } from '../repositories/audit.repository.js';

export const auditService = {
  /**
   * Registra uma ação no log de auditoria.
   * Deve ser chamado após qualquer operação que altere dados críticos.
   */
  logAction(payload: {
    userId: string;
    action: AuditAction;
    resourceType: 'contract' | 'customer' | 'license' | 'user';
    resourceId: string;
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
    ipAddress?: string | null;
  }): AuditLog {
    return auditRepository.create(payload);
  },

  /**
   * Obtém histórico de auditoria de um recurso específico.
   */
  getResourceHistory(
    resourceType: string,
    resourceId: string,
    options: { limit?: number; offset?: number } = {}
  ): AuditLog[] {
    return auditRepository.listByResource(
      resourceType,
      resourceId,
      options.limit ?? 50,
      options.offset ?? 0
    );
  },

  /**
   * Obtém histórico de auditoria de um usuário.
   */
  getUserHistory(userId: string, options: { limit?: number; offset?: number } = {}): AuditLog[] {
    return auditRepository.listByUser(userId, options.limit ?? 50, options.offset ?? 0);
  },

  /**
   * Obtém histórico de auditoria global (apenas para admin).
   */
  getAllHistory(options: { limit?: number; offset?: number } = {}): AuditLog[] {
    return auditRepository.listAll(options.limit ?? 50, options.offset ?? 0);
  },

  /**
   * Conta quantas mudanças foram feitas em um recurso.
   */
  getResourceChangeCount(resourceType: string, resourceId: string): number {
    return auditRepository.countByResource(resourceType, resourceId);
  }
};
