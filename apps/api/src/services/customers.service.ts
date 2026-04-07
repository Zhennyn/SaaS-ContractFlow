import type { Customer } from '@contractflow/shared';
import { v4 as uuid } from 'uuid';
import { ConflictError, NotFoundError, ValidationError } from '../types/errors.js';
import { customersRepository } from '../repositories/customers.repository.js';
import { logger } from '../utils/logger.js';

type CustomerInput = {
  name: string;
  email: string;
  company: string;
  phone: string;
  notes: string;
};

function isoNow() {
  return new Date().toISOString();
}

export const customersService = {
  listForUser(userId: string): Customer[] {
    return customersRepository.findAllByUser(userId);
  },

  create(userId: string, data: CustomerInput): Customer {
    const id = uuid();
    const customer = customersRepository.insert(id, userId, data, isoNow());
    logger.info('Cliente criado', { customerId: id, userId });
    return customer;
  },

  update(id: string, userId: string, data: CustomerInput): Customer {
    const existing = customersRepository.findById(id, userId);
    if (!existing) throw new NotFoundError('Cliente');

    const changes = customersRepository.update(id, userId, data, isoNow());
    if (!changes) throw new NotFoundError('Cliente');

    logger.info('Cliente atualizado', { customerId: id, userId });
    return customersRepository.findById(id, userId)!;
  },

  delete(id: string, userId: string): void {
    const linked = customersRepository.countLinkedContracts(id, userId);
    if (linked > 0) {
      throw new ValidationError('Remova os contratos vinculados antes de excluir o cliente.');
    }

    const changes = customersRepository.delete(id, userId);
    if (!changes) throw new NotFoundError('Cliente');

    logger.info('Cliente excluido', { customerId: id, userId });
  }
};
