import { z } from 'zod';

export const customerSchema = z.object({
  name: z.string().min(2),
  email: z.email(),
  company: z.string().min(2),
  phone: z.string().min(8),
  notes: z.string().default('')
});

export type CustomerInput = z.infer<typeof customerSchema>;
