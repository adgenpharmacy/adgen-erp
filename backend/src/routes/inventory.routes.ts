import { Router, Response } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, AuthenticatedRequest, requireOwner } from '../middlewares/auth.middleware';

const router = Router();

// Helper function to calculate medical search relevance score
function calculateSearchRelevance(product: any, query: string): number {
  if (!query) return 0;
  const q = query.toLowerCase().trim();
  const name = (product.name || '').toLowerCase();
  const generic = (product.genericName || '').toLowerCase();
  const company = (product.companyName || '').toLowerCase();

  // 1. Name starts directly with search query (Highest priority) -> 100 points
  if (name.startsWith(q)) return 100;

  // 2. A word inside product name starts with query -> 80 points
  const words = name.split(/\s+/);
  if (words.some((w: string) => w.startsWith(q))) return 80;

  // 3. Generic name or company starts with query -> 60 points
  if (generic.startsWith(q) || company.startsWith(q)) return 60;

  // 4. Name contains query as a substring -> 40 points
  if (name.includes(q)) return 40;

  // 5. Generic or company contains query as a substring -> 20 points
  if (generic.includes(q) || company.includes(q)) return 20;

  return 0;
}

// GET /api/inventory — Fetch inventory with server-side query search (q) & pagination limits
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { q, limit } = req.query;
    const searchStr = typeof q === 'string' ? q.trim() : '';
    const take = limit ? parseInt(limit as string) : 5000;

    const whereClause: any = { isActive: true };
    if (searchStr) {
      whereClause.OR = [
        { name: { contains: searchStr, mode: 'insensitive' } },
        { genericName: { contains: searchStr, mode: 'insensitive' } },
        { companyName: { contains: searchStr, mode: 'insensitive' } },
      ];
    }

    let products = await prisma.product.findMany({
      where: whereClause,
      take,
      include: {
        batches: {
          orderBy: { expiryDate: 'asc' },
        },
      },
    });

    // If search query exists, sort by medical relevance score first, then name
    if (searchStr) {
      products = products.sort((a, b) => {
        const scoreA = calculateSearchRelevance(a, searchStr);
        const scoreB = calculateSearchRelevance(b, searchStr);
        if (scoreB !== scoreA) {
          return scoreB - scoreA; // Highest relevance score first
        }
        return a.name.localeCompare(b.name);
      });
    } else {
      products = products.sort((a, b) => a.name.localeCompare(b.name));
    }

    const inventoryList = products.map((prod) => {
      const totalStock = prod.batches.reduce((sum, b) => sum + b.quantity, 0);
      const packSize = prod.packSize || 1;
      const totalMrpValue = prod.batches.reduce((sum, b) => {
        const perUnitMrp = b.mrp / packSize;
        return sum + (perUnitMrp * b.quantity);
      }, 0);

      const totalCostValue = prod.batches.reduce((sum, b) => {
        const perUnitCost = b.purchaseRate / packSize;
        return sum + (perUnitCost * b.quantity);
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
        systemStock: totalStock,
        totalMrpValue: Math.round(totalMrpValue * 100) / 100,
        totalCostValue: Math.round(totalCostValue * 100) / 100,
        batches: prod.batches,
      };
    });

    res.json(inventoryList);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/inventory/adjust — Manual Stock Adjustment & Reconciliation
router.put('/adjust', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { batchId, productId, newQuantity, adjustmentType, reason } = req.body;

    if (!batchId && !productId) {
      return res.status(400).json({ error: 'batchId or productId is required' });
    }

    const updatedBatch = await prisma.$transaction(async (tx) => {
      let targetBatch = null;

      if (batchId) {
        targetBatch = await tx.inventoryBatch.findUnique({
          where: { id: batchId },
          include: { product: true },
        });
      } else if (productId) {
        targetBatch = await tx.inventoryBatch.findFirst({
          where: { productId },
          orderBy: { expiryDate: 'asc' },
          include: { product: true },
        });
      }

      if (!targetBatch) {
        throw new Error('Target inventory batch not found for adjustment');
      }

      let finalQty = targetBatch.quantity;
      const parsedVal = parseFloat(newQuantity);

      if (isNaN(parsedVal)) {
        throw new Error('Valid newQuantity is required');
      }

      if (adjustmentType === 'ADD_STOCK') {
        finalQty += parsedVal;
      } else if (adjustmentType === 'SUBTRACT_STOCK') {
        finalQty = Math.max(0, finalQty - parsedVal);
      } else {
        // SET_QUANTITY
        finalQty = Math.max(0, parsedVal);
      }

      const updated = await tx.inventoryBatch.update({
        where: { id: targetBatch.id },
        data: {
          quantity: finalQty,
          updatedAt: new Date(),
        },
        include: { product: true },
      });

      console.log(
        `[Anshu Engine] Stock Adjustment on Batch ${targetBatch.batchNumber} (${targetBatch.product?.name}): Old=${targetBatch.quantity} -> New=${finalQty} (${reason || 'Manual Correction'}) by User ${req.user?.name || req.user?.id}`
      );

      return updated;
    });

    res.json({
      message: 'Inventory stock adjusted successfully!',
      batch: updatedBatch,
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

export default router;

