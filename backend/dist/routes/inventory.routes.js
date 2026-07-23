"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../config/prisma");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// GET /api/inventory — Fetch inventory with server-side query search (q) & pagination limits
router.get('/', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const { q, limit } = req.query;
        const searchStr = typeof q === 'string' ? q.trim() : '';
        const take = limit ? parseInt(limit) : 5000;
        const whereClause = { isActive: true };
        if (searchStr) {
            whereClause.OR = [
                { name: { contains: searchStr, mode: 'insensitive' } },
                { genericName: { contains: searchStr, mode: 'insensitive' } },
                { companyName: { contains: searchStr, mode: 'insensitive' } },
            ];
        }
        const products = await prisma_1.prisma.product.findMany({
            where: whereClause,
            take,
            orderBy: { name: 'asc' },
            include: {
                batches: {
                    where: { quantity: { gt: 0 } },
                    orderBy: { expiryDate: 'asc' },
                },
            },
        });
        const inventoryList = products.map((prod) => {
            const totalStock = prod.batches.reduce((sum, b) => sum + b.quantity, 0);
            const packSize = prod.packSize || 1;
            const totalMrpValue = prod.batches.reduce((sum, b) => {
                const perUnitMrp = b.mrp / packSize;
                return sum + (perUnitMrp * b.quantity);
            }, 0);
            const latestBatch = prod.batches[0];
            const mrp = prod.mrp || latestBatch?.mrp || 0;
            const purchaseRate = prod.purchaseRate || latestBatch?.purchaseRate || 0;
            return {
                id: prod.id,
                productId: prod.id,
                name: prod.name,
                productName: prod.name,
                genericName: prod.genericName,
                companyName: prod.companyName,
                productType: prod.productType,
                packSize: prod.packSize,
                packUnit: prod.packUnit || 'Strip',
                contentUnit: prod.contentUnit || 'Tablet',
                mrp,
                purchaseRate,
                lowStockThreshold: prod.lowStockThreshold,
                totalStock,
                totalMrpValue,
                isLowStock: totalStock > 0 && totalStock <= prod.lowStockThreshold,
                isOutOfStock: totalStock <= 0,
                batches: prod.batches,
                product: prod,
            };
        });
        res.json(inventoryList);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// GET /api/inventory/fefo/:productId — Fetch batches in FEFO order for sale dispensing
router.get('/fefo/:productId', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const { productId } = req.params;
        const now = new Date();
        const batches = await prisma_1.prisma.inventoryBatch.findMany({
            where: {
                productId,
                quantity: { gt: 0 },
                expiryDate: { gt: now },
            },
            orderBy: { expiryDate: 'asc' },
        });
        res.json(batches);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// POST /api/inventory/adjust — Manual stock adjustment (Owner Only)
router.post('/adjust', auth_middleware_1.authenticate, auth_middleware_1.requireOwner, async (req, res) => {
    try {
        const { batchId, newQuantity, reason } = req.body;
        const updatedBatch = await prisma_1.prisma.inventoryBatch.update({
            where: { id: batchId },
            data: {
                quantity: parseFloat(newQuantity),
                isManualAdjustment: true,
                adjustmentReason: reason || 'Manual audit correction',
            },
        });
        res.json(updatedBatch);
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
exports.default = router;
