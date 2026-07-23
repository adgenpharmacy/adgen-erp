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

const app = express();
const PORT = process.env.PORT || 5000;

// Security & Middleware
app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(morgan('dev'));

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

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Pharmacy ERP Backend (Node + Prisma + PostgreSQL 3NF)', timestamp: new Date() });
});

// Centralized Express Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled API Error:', err);
  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal Server Error' 
    : (err.message || 'An unexpected error occurred');
  res.status(status).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`🚀 Pharmacy ERP Server running on http://localhost:${PORT}`);
});

export default app;
