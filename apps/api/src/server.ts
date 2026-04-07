import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { initializeDatabase } from './db.js';
import { requestLoggerMiddleware } from './middleware/request-logger.middleware.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import authRoutes from './routes/auth.routes.js';
import { authMiddleware } from './middleware/auth.middleware.js';
import { authController } from './controllers/auth.controller.js';
import contractsRoutes from './routes/contracts.routes.js';
import customersRoutes from './routes/customers.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import licensesRoutes from './routes/licenses.routes.js';
import auditRoutes from './routes/audit.routes.js';
import { uploadService } from './services/upload.service.js';

initializeDatabase();

const port = Number(process.env.API_PORT ?? 4000);
const corsOrigin = process.env.CORS_ORIGIN ?? 'http://127.0.0.1:5173';

// Inicializa seviço de uploads
uploadService.initialize().catch(console.error);

const app = express();
app.use(cors({ origin: corsOrigin }));
app.use(express.json());
app.use(requestLoggerMiddleware);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/auth', authRoutes);
app.use('/contracts', contractsRoutes);
app.use('/customers', customersRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/licenses', licensesRoutes);
app.use('/audit', auditRoutes);

// Legacy /me route (alias to /auth/me)
// Legacy /me alias kept for desktop client compatibility.
app.get('/me', authMiddleware, authController.getMe);

app.use(errorMiddleware);

app.listen(port, () => {
  console.log(`ContractFlow API rodando na porta ${port}`);
});
