import type { Contract, ContractClmStatus } from '@contractflow/shared';
import { v4 as uuid } from 'uuid';
import { ForbiddenError, NotFoundError, ValidationError } from '../types/errors.js';
import {
  contractsRepository,
  type ContractUpsertData
} from '../repositories/contracts.repository.js';
import { customersRepository } from '../repositories/customers.repository.js';
import { logger } from '../utils/logger.js';

/**
 * Mapa de transições CLM válidas.
 * signed é estado terminal — nenhuma transição é permitida a partir dele.
 * A transição signed → draft é explicitamente bloqueada conforme regra de negócio.
 */
const CLM_VALID_TRANSITIONS: Record<ContractClmStatus, ContractClmStatus[]> = {
  draft: ['in_review'],
  in_review: ['draft', 'approved'],
  approved: ['signed'],
  signed: []
};

function isoNow() {
  return new Date().toISOString();
}

export const contractsService = {
  listForUser(userId: string): Contract[] {
    return contractsRepository.findAllByUser(userId);
  },

  getByIdForUser(id: string, userId: string): Contract {
    const contract = contractsRepository.findById(id, userId);
    if (!contract) throw new NotFoundError('Contrato');
    return contract;
  },

  create(userId: string, data: ContractUpsertData): Contract {
    // Valida que o cliente pertence ao mesmo usuário.
    const customer = customersRepository.findById(data.customerId, userId);
    if (!customer) throw new ValidationError('Cliente nao encontrado para este usuario.');

    const id = uuid();
    const now = isoNow();
    const contract = contractsRepository.insert(id, userId, data, 'draft', now);
    logger.info('Contrato criado', { contractId: id, userId });
    return contract;
  },

  update(id: string, userId: string, data: ContractUpsertData): Contract {
    const existing = contractsRepository.findById(id, userId);
    if (!existing) throw new NotFoundError('Contrato');

    // Valida que o cliente de destino (se alterado) pertence ao mesmo usuário.
    if (data.customerId !== existing.customerId) {
      const customer = customersRepository.findById(data.customerId, userId);
      if (!customer) throw new ValidationError('Cliente nao encontrado para este usuario.');
    }

    const now = isoNow();
    contractsRepository.update(id, userId, data, now);
    logger.info('Contrato atualizado', { contractId: id, userId });
    return contractsRepository.findById(id, userId)!;
  },

  delete(id: string, userId: string): void {
    const existing = contractsRepository.findById(id, userId);
    if (!existing) throw new NotFoundError('Contrato');
    contractsRepository.delete(id, userId);
    logger.info('Contrato excluido', { contractId: id, userId });
  },

  /**
   * Transiciona o status CLM de um contrato aplicando as regras de negócio.
   * Transições inválidas (ex: signed → qualquer estado) são rejeitadas.
   */
  transitionClmStatus(id: string, userId: string, targetClmStatus: ContractClmStatus): Contract {
    const contract = contractsRepository.findById(id, userId);
    if (!contract) throw new NotFoundError('Contrato');

    const allowedNext = CLM_VALID_TRANSITIONS[contract.clmStatus];

    if (!allowedNext.includes(targetClmStatus)) {
      throw new ForbiddenError(
        `Transicao invalida de "${contract.clmStatus}" para "${targetClmStatus}". ` +
          `Transicoes permitidas: ${allowedNext.length > 0 ? allowedNext.join(', ') : 'nenhuma (estado terminal)'}.`
      );
    }

    const now = isoNow();
    contractsRepository.updateClmStatus(id, userId, targetClmStatus, now);
    logger.info('Status CLM transicionado', { contractId: id, from: contract.clmStatus, to: targetClmStatus, userId });
    return contractsRepository.findById(id, userId)!;
  }
};
