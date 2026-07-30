import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

import productsRoutes from './routes/products.routes';
import inventoryRoutes from './routes/inventory.routes';
import customersRoutes from './routes/customers.routes';
import partiesRoutes from './routes/parties.routes';
import salesRoutes from './routes/sales.routes';
import purchasesRoutes from './routes/purchases.routes';
import ledgerRoutes from './routes/ledger.routes';
import reportsRoutes from './routes/reports.routes';
import usersRoutes from './routes/users.routes';
import systemRoutes from './routes/system.routes';
import settingsRoutes from './routes/settings.routes';
import stockAdjustmentRoutes from './routes/stock-adjustments.routes';

import { requestLogger } from './middlewares/logger.middleware';

const app = express();
const PORT = process.env.PORT || 5000;

// Security & Middleware
app.use(helmet());

/*
 * Gzip every response.
 *
 * The catalogue and inventory lists are ~1.8MB of JSON each and are fetched on every app load;
 * uncompressed that is the largest single cost of opening the software over a shop's broadband.
 * The same payload compresses to a fraction of that, and the shape of the data (repeated keys,
 * repeated medicine names) is close to the best case for gzip.
 */
app.use(compression());

// Restrict browser access to known origins. Set CORS_ORIGINS (comma-separated) in production.
const configuredOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients (curl, health checks) which send no Origin header.
      if (!origin) return callback(null, true);

      if (configuredOrigins.includes(origin)) return callback(null, true);

      // Outside production, permit local development hosts by default.
      if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }

      // Deny by omitting the CORS headers rather than throwing. Throwing here reached the global
      // error handler and answered an ordinary cross-origin probe with a 500, which reads as a
      // server fault in the logs. The browser blocks the response either way.
      return callback(null, false);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));
app.use(requestLogger);

import returnsRoutes from './routes/returns.routes';

/**
 * Rate limiting.
 *
 * Note: the default store is per-process. On a single self-hosted shop server that is a real
 * limit; on Vercel each lambda instance keeps its own counter, so it raises the cost of an
 * attack rather than capping it absolutely. A shared store (Redis) would be needed for a hard
 * guarantee there.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only failed sign-in attempts count toward the limit
  message: { error: 'Too many sign-in attempts. Please wait 15 minutes and try again.' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300, // generous: the dashboard fans out to 7 endpoints on every load
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

app.use('/api', apiLimiter);
// Credential endpoints get the strict limiter — without it passwords were brute-forceable.
app.use('/api/users/login', authLimiter);
app.use('/api/users/register', authLimiter);

// API Routes
app.use('/api/products', productsRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/parties', partiesRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/purchases', purchasesRoutes);
app.use('/api/returns', returnsRoutes);
app.use('/api/ledger', ledgerRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/stock-adjustments', stockAdjustmentRoutes);

// Welcome & Status
app.get(['/', '/api'], (req, res) => {
  res.json({
    status: 'online',
    service: 'AdGen Pharmacy ERP API Server',
    endpoints: {
      health: '/health',
      products: '/api/products',
      sales: '/api/sales',
      inventory: '/api/inventory',
      reports: '/api/reports'
    },
    timestamp: new Date()
  });
});

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Pharmacy ERP Backend (Node + Prisma + PostgreSQL 3NF)', timestamp: new Date() });
});

// 404 for unmatched API routes — previously these fell through and returned the HTML-less
// default, which the client surfaced as an unhelpful generic failure.
app.use('/api', (req: express.Request, res: express.Response) => {
  res.status(404).json({ error: `No API route matches ${req.method} ${req.originalUrl}` });
});

// Centralized Express Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled Server Error:', err);

  // Never return raw error text in production: Prisma failures embed table names, column names
  // and occasionally connection details. Log the real error, hand the client a safe one.
  const isProduction = process.env.NODE_ENV === 'production';
  res.status(500).json({
    error: isProduction ? 'Internal Server Error' : err.message || 'Internal Server Error',
  });
});

// Only bind a port when this file is the process entrypoint (`npm run dev` / `npm start`).
// On Vercel the app is imported by api/index.ts and invoked per-request, so listening there
// would make every cold start open a socket the platform never routes to.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Pharmacy ERP API Server running on port ${PORT}`);
  });
}

export default app;
