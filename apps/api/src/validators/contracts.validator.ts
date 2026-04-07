import { z } from 'zod';
import type { ContractClmStatus, ContractStatus, PaymentCycle } from '@contractflow/shared';

export const contractSchema = z.object({
  customerId: z.string().min(1),
  title: z.string().min(3),
  description: z.string().default(''),
  valueCents: z.number().int().positive(),
  startDate: z.string().min(10),
  endDate: z.string().min(10),
  renewalDate: z.string().min(10),
  status: z.enum(['active', 'renewing', 'expired'] satisfies [ContractStatus, ...ContractStatus[]]),
  autoRenew: z.boolean(),
  paymentCycle: z.enum(['monthly', 'quarterly', 'yearly', 'custom'] satisfies [PaymentCycle, ...PaymentCycle[]]),
  notes: z.string().default('')
});

export const clmTransitionSchema = z.object({
  clmStatus: z.enum(['draft', 'in_review', 'approved', 'signed'] satisfies [ContractClmStatus, ...ContractClmStatus[]])
});

export type ContractInput = z.infer<typeof contractSchema>;
export type ClmTransitionInput = z.infer<typeof clmTransitionSchema>;
