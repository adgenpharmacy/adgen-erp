"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const products_routes_1 = __importDefault(require("./routes/products.routes"));
const inventory_routes_1 = __importDefault(require("./routes/inventory.routes"));
const customers_routes_1 = __importDefault(require("./routes/customers.routes"));
const parties_routes_1 = __importDefault(require("./routes/parties.routes"));
const sales_routes_1 = __importDefault(require("./routes/sales.routes"));
const purchases_routes_1 = __importDefault(require("./routes/purchases.routes"));
const ledger_routes_1 = __importDefault(require("./routes/ledger.routes"));
const reports_routes_1 = __importDefault(require("./routes/reports.routes"));
const users_routes_1 = __importDefault(require("./routes/users.routes"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// Security & Middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({ origin: '*' }));
app.use(express_1.default.json());
app.use((0, morgan_1.default)('dev'));
// API Routes
app.use('/api/products', products_routes_1.default);
app.use('/api/inventory', inventory_routes_1.default);
app.use('/api/customers', customers_routes_1.default);
app.use('/api/parties', parties_routes_1.default);
app.use('/api/sales', sales_routes_1.default);
app.use('/api/purchases', purchases_routes_1.default);
app.use('/api/ledger', ledger_routes_1.default);
app.use('/api/reports', reports_routes_1.default);
app.use('/api/users', users_routes_1.default);
// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'Pharmacy ERP Backend (Node + Prisma + PostgreSQL 3NF)', timestamp: new Date() });
});
// Centralized Express Global Error Handler
app.use((err, req, res, next) => {
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
exports.default = app;
