import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../types/errors.js';
import { logger } from '../utils/logger.js';

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    logger.warn('AppError', { statusCode: err.statusCode, message: err.message });
    res.status(err.statusCode).json({ message: err.message });
    return;
  }

  logger.error('Erro inesperado', { error: err instanceof Error ? err.message : String(err) });
  res.status(500).json({ message: 'Erro interno no servidor.' });
}
