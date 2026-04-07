import type { Customer } from '@contractflow/shared';
import { v4 as uuid } from 'uuid';
import { ConflictError, NotFoundError, ValidationError } from '../types/errors.js';
import { customersRepository } from '../repositories/customers.repository.js';
import { auditService } from './audit.service.js';
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

  /**
   * Busca clientes com filtro e pagination
   */
  search(
    userId: string,
    options: {
      search?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    return customersRepository.findWithSearch(userId, {
      search: options.search,
      limit: options.limit ? Math.min(Number(options.limit), 500) : 50,
      offset: options.offset ? Number(options.offset) : 0
    });
  },

  create(userId: string, data: CustomerInput): Customer {
    const id = uuid();
    const customer = customersRepository.insert(id, userId, data, isoNow());
    
    auditService.logAction({
      userId,
      action: 'CUSTOMER_CREATED',
      resourceType: 'customer',
      resourceId: id,
      newValues: {
        name: customer.name,
        email: customer.email,
        company: customer.company
      }
    });
    
    logger.info('Cliente criado', { customerId: id, userId });
    return customer;
  },

  update(id: string, userId: string, data: CustomerInput): Customer {
    const existing = customersRepository.findById(id, userId);
    if (!existing) throw new NotFoundError('Cliente');

    const changes = customersRepository.update(id, userId, data, isoNow());
    if (!changes) throw new NotFoundError('Cliente');

    const updated = customersRepository.findById(id, userId)!;
    auditService.logAction({
      userId,
      action: 'CUSTOMER_UPDATED',
      resourceType: 'customer',
      resourceId: id,
      oldValues: {
        name: existing.name,
        email: existing.email,
        company: existing.company
      },
      newValues: {
        name: updated.name,
        email: updated.email,
        company: updated.company
      }
    });

    logger.info('Cliente atualizado', { customerId: id, userId });
    return updated;
  },

  delete(id: string, userId: string): void {
    const linked = customersRepository.countLinkedContracts(id, userId);
    if (linked > 0) {
      throw new ValidationError('Remova os contratos vinculados antes de excluir o cliente.');
    }

    const existing = customersRepository.findById(id, userId);
    if (!existing) throw new NotFoundError('Cliente');

    const changes = customersRepository.delete(id, userId);
    if (!changes) throw new NotFoundError('Cliente');

    auditService.logAction({
      userId,
      action: 'CUSTOMER_DELETED',
      resourceType: 'customer',
      resourceId: id,
      oldValues: {
        name: existing.name,
        email: existing.email,
        company: existing.company
      }
    });

    logger.info('Cliente excluido', { customerId: id, userId });
  }
};
