import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from './config/index.js';
import { checkConnection } from './database/pool.js';
import authRoutes from './routes/auth.routes.js';
import posRoutes from './routes/pos.routes.js';
import productsRoutes from './routes/products.routes.js';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '10mb' }));

// Rate limiting
app.use(rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false
}));

// Health check
app.get('/health', async (_req, res) => {
  const dbOk = await checkConnection();
  res.json({ status: dbOk ? 'healthy' : 'degraded', db: dbOk });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/products', productsRoutes);

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
});

// Start server
app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});

export default app;
