import { Router, Response } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, AuthenticatedRequest } from '../middlewares/auth.middleware';

const router = Router();

// GET /api/reports/dashboard — Real-time metrics
router.get('/dashboard', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Today Sales
    const todaySalesSnap = await prisma.salesBill.aggregate({
      where: { createdAt: { gte: today } },
      _sum: { grandTotal: true },
      _count: { id: true },
    });

    // 2. Today Purchases
    const todayPurchaseSnap = await prisma.purchaseBill.aggregate({
      where: { createdAt: { gte: today } },
      _sum: { grandTotal: true },
      _count: { id: true },
    });

    // 3. Inventory Value & Margin
    const products = await prisma.product.findMany({
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
      if (totalStock > 0) skusWithStock++;
      const effectiveThreshold = p.lowStockThreshold || 5;
      if (totalStock <= 0) outOfStockCount++;
      else if (totalStock <= effectiveThreshold) lowStockCount++;

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
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// NOTE: a POST /sync-firebase endpoint used to live here. It reported
// "Cloud backup sync completed successfully" while only counting rows — it never wrote to
// Firestore or anywhere else. It has been removed rather than left to give false assurance.
// Use GET /api/system/export-data for a real, downloadable backup.

export default router;
