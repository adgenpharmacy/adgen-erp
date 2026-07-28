/**
 * Stock adjustment audit trail — every change to stock that is not a purchase or a sale.
 *
 * The legacy app overwrote batch quantities in place with no record, which is why nobody could
 * tell whether its stock had been corrected by hand or corrupted by a bug. Here each change
 * stores the before, the after, who made it and why.
 */
import { Router, Response } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, AuthenticatedRequest, requireOwner } from '../middlewares/auth.middleware';
import { AdjustmentSource } from '@prisma/client';

const router = Router();

router.use(authenticate);

// GET /api/stock-adjustments — newest first, optionally filtered by source or product
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { source, productId, limit } = req.query;
    const take = Math.min(parseInt(String(limit ?? '200'), 10) || 200, 1000);

    const where: { source?: AdjustmentSource; productId?: string } = {};
    if (source && Object.values(AdjustmentSource).includes(source as AdjustmentSource)) {
      where.source = source as AdjustmentSource;
    }
    if (productId) where.productId = String(productId);

    const rows = await prisma.stockAdjustment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        product: { select: { name: true, packSize: true, packUnit: true, contentUnit: true } },
        batch: { select: { batchNumber: true, expiryDate: true, purchaseRate: true } },
        user: { select: { name: true, role: true } },
      },
    });

    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stock-adjustments/summary — headline counts for the admin page
router.get('/summary', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const bySource = await prisma.stockAdjustment.groupBy({
      by: ['source'],
      _count: { _all: true },
      _sum: { quantityDelta: true },
    });

    const latest = await prisma.stockAdjustment.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    res.json({
      bySource: bySource.map((s) => ({
        source: s.source,
        count: s._count._all,
        netUnits: s._sum.quantityDelta || 0,
      })),
      total: bySource.reduce((sum, s) => sum + s._count._all, 0),
      lastAdjustedAt: latest?.createdAt ?? null,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/stock-adjustments — correct a batch by hand. Owner only.
router.post('/', requireOwner, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { batchId, newQuantity, reason, source } = req.body;

    if (!batchId || newQuantity === undefined || newQuantity === null) {
      return res.status(400).json({ error: 'batchId and newQuantity are required' });
    }
    const target = parseFloat(newQuantity);
    if (Number.isNaN(target) || target < 0) {
      return res.status(400).json({ error: 'newQuantity must be zero or more' });
    }
    // A reason is mandatory. The legacy app accepted "?" on eight of its ten adjustments,
    // which left an audit trail that recorded nothing worth reading.
    const cleanReason = String(reason ?? '').trim();
    if (cleanReason.length < 3) {
      return res.status(400).json({ error: 'A reason is required so the change can be explained later' });
    }

    const chosenSource =
      source && Object.values(AdjustmentSource).includes(source)
        ? (source as AdjustmentSource)
        : AdjustmentSource.MANUAL;

    const result = await prisma.$transaction(async (tx) => {
      const batch = await tx.inventoryBatch.findUnique({
        where: { id: batchId },
        select: { id: true, productId: true, quantity: true },
      });
      if (!batch) throw new Error('Batch not found');

      const updated = await tx.inventoryBatch.update({
        where: { id: batch.id },
        data: { quantity: target },
      });

      const adjustment = await tx.stockAdjustment.create({
        data: {
          batchId: batch.id,
          productId: batch.productId,
          // Kept fractional: half-strip corrections are normal at the counter.
          quantityDelta: Math.round((target - batch.quantity) * 1000) / 1000,
          previousQuantity: batch.quantity,
          newQuantity: target,
          reason: cleanReason,
          source: chosenSource,
          userId: req.user?.id ?? null,
        },
        include: {
          product: { select: { name: true } },
          batch: { select: { batchNumber: true, expiryDate: true } },
          user: { select: { name: true, role: true } },
        },
      });

      return { adjustment, updated };
    });

    res.status(201).json(result.adjustment);
  } catch (e: any) {
    const status = e.message === 'Batch not found' ? 404 : 500;
    res.status(status).json({ error: e.message });
  }
});

export default router;
