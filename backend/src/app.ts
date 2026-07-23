import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
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

import { requestLogger } from './middlewares/logger.middleware';

const app = express();
const PORT = process.env.PORT || 5000;

// Security & Middleware
app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(morgan('dev'));
app.use(requestLogger);

// API Routes
app.use('/api/products', productsRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/parties', partiesRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/purchases', purchasesRoutes);
app.use('/api/ledger', ledgerRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/system', systemRoutes);

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

// Centralized Express Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`🚀 Pharmacy ERP API Server running on port ${PORT}`);
});

export default app;
