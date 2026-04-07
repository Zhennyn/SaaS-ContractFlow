import { v4 as uuid } from 'uuid';
import type { LicenseStatus, ManagedLicense } from '@contractflow/shared';
import { NotFoundError } from '../types/errors.js';
import { licensesRepository, toManagedLicense } from '../repositories/licenses.repository.js';
import { logger } from '../utils/logger.js';

function isoNow() {
  return new Date().toISOString();
}

function generateLicenseKey(): string {
  const token = Math.random().toString(36).slice(2, 8).toUpperCase();
  const segment = Date.now().toString().slice(-6);
  return `CFLOW-${segment}-${token}`;
}

export const licensesService = {
  listForUser(userId: string): ManagedLicense[] {
    return licensesRepository.findAllByUser(userId);
  },

  create(
    userId: string,
    planName: string,
    status: LicenseStatus,
    expiresAt: string
  ): ManagedLicense {
    const id = uuid();
    const licenseKey = generateLicenseKey();
    const now = isoNow();
    licensesRepository.insert(id, userId, licenseKey, planName, status, expiresAt, now);
    const row = licensesRepository.findByIdAndUser(id, userId)!;
    logger.info('Licenca criada', { licenseId: id, licenseKey, userId });
    return toManagedLicense(row);
  },

  update(
    id: string,
    userId: string,
    planName: string,
    status: LicenseStatus,
    expiresAt: string
  ): ManagedLicense {
    const changes = licensesRepository.update(id, userId, planName, status, expiresAt);
    if (!changes) throw new NotFoundError('Licenca');
    const row = licensesRepository.findByIdAndUser(id, userId)!;
    return toManagedLicense(row);
  },

  resetMachine(id: string, userId: string): ManagedLicense {
    const row = licensesRepository.findByIdAndUser(id, userId);
    if (!row) throw new NotFoundError('Licenca');
    licensesRepository.resetMachine(id, userId);
    logger.info('Machine ID resetado', { licenseId: id, userId });
    const updated = licensesRepository.findByIdAndUser(id, userId)!;
    return toManagedLicense(updated);
  }
};
