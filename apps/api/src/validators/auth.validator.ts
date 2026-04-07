import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(6),
  licenseKey: z.string().min(8),
  machineId: z.string().min(6)
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20),
  machineId: z.string().min(6)
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
