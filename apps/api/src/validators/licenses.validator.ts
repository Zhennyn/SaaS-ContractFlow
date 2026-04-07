import { z } from 'zod';
import type { LicenseStatus } from '@contractflow/shared';

export const licenseSchema = z.object({
  planName: z.string().min(2),
  expiresAt: z.iso.datetime(),
  status: z.enum(['active', 'expired', 'suspended'] satisfies [LicenseStatus, ...LicenseStatus[]])
});

export type LicenseInput = z.infer<typeof licenseSchema>;
