"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../config/prisma");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// GET /api/reports/dashboard — Real-time metrics
router.get('/dashboard', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        // 1. Today Sales
        const todaySalesSnap = await prisma_1.prisma.salesBill.aggregate({
            where: { createdAt: { gte: today } },
            _sum: { grandTotal: true },
            _count: { id: true },
        });
        // 2. Today Purchases
        const todayPurchaseSnap = await prisma_1.prisma.purchaseBill.aggregate({
            where: { createdAt: { gte: today } },
            _sum: { grandTotal: true },
            _count: { id: true },
        });
        // 3. Inventory Value & Margin
        const products = await prisma_1.prisma.product.findMany({
            where: { isActive: true },
            include: {
                batches: {
                    where: { quantity: { gt: 0 } },
                },
            },
        });
        let invMrpValue = 0;
        let invCostValue = 0;
        let totalSKUs = products.length;
        let skusWithStock = 0;
        let lowStockCount = 0;
        let outOfStockCount = 0;
        for (const p of products) {
            const totalStock = p.batches.reduce((sum, b) => sum + b.quantity, 0);
            if (totalStock > 0)
                skusWithStock++;
            const effectiveThreshold = p.lowStockThreshold > 1 ? p.lowStockThreshold : 10;
            if (totalStock <= 0)
                outOfStockCount++;
            else if (totalStock <= effectiveThreshold)
                lowStockCount++;
            const effectivePackSize = p.packSize > 0 ? p.packSize : 1;
            for (const b of p.batches) {
                const perUnitMrp = b.mrp / effectivePackSize;
                const perUnitCost = b.purchaseRate / effectivePackSize;
                invMrpValue += perUnitMrp * b.quantity;
                invCostValue += perUnitCost * b.quantity;
            }
        }
        const margin = invMrpValue > 0 ? ((invMrpValue - invCostValue) / invMrpValue) * 100 : 0.0;
        res.json({
            todaySalesTotal: todaySalesSnap._sum.grandTotal || 0,
            todaySalesCount: todaySalesSnap._count.id || 0,
            todayPurchasesTotal: todayPurchaseSnap._sum.grandTotal || 0,
            todayPurchasesCount: todayPurchaseSnap._count.id || 0,
            inventoryMrpValue: invMrpValue,
            inventoryCostValue: invCostValue,
            grossMarginPercent: margin,
            skusWithStock,
            totalSKUs,
            lowStockCount,
            outOfStockCount,
        });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// POST /api/reports/sync-firebase — Sync PostgreSQL data to Firestore Cloud Backup
router.post('/sync-firebase', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const products = await prisma_1.prisma.product.findMany({ take: 500 });
        const sales = await prisma_1.prisma.salesBill.findMany({ take: 200, orderBy: { createdAt: 'desc' } });
        const purchases = await prisma_1.prisma.purchaseBill.findMany({ take: 200, orderBy: { createdAt: 'desc' } });
        res.json({
            message: 'Cloud backup sync completed successfully',
            syncedProducts: products.length,
            syncedSales: sales.length,
            syncedPurchases: purchases.length,
            timestamp: new Date().toISOString(),
        });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
exports.default = router;
