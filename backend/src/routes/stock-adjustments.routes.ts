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

/** Marks a row as the undo of another, and lets a second undo be refused. */
const reversalReason = (id: string) => `Reversal of adjustment ${id}`;

/**
 * POST /api/stock-adjustments/:id/reverse — undo a correction. Owner only.
 *
 * A mistyped count could not be taken back: the batch had already been overwritten and the only
 * remedy was a second adjustment typed by hand, which required working out the original quantity
 * from the audit row and getting the arithmetic right under pressure.
 *
 * Deliberately NOT a delete. This table's whole purpose is that a change to stock which is
 * neither a purchase nor a sale leaves a record — deleting the row would reproduce exactly the
 * legacy behaviour it was built to replace, where stock moved and nothing said why. So the undo
 * is itself an adjustment, carrying the inverse delta and naming the row it reverses.
 */
router.post('/:id/reverse', requireOwner, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await prisma.$transaction(async (tx) => {
      const original = await tx.stockAdjustment.findUnique({
        where: { id },
        include: { product: { select: { name: true, contentUnit: true } } },
      });
      if (!original) throw new Error('Adjustment not found');

      const alreadyReversed = await tx.stockAdjustment.findFirst({
        where: { reason: reversalReason(id) },
        select: { id: true },
      });
      if (alreadyReversed) throw new Error('This adjustment has already been reversed');

      const batch = await tx.inventoryBatch.findUnique({
        where: { id: original.batchId },
        select: { id: true, productId: true, quantity: true, batchNumber: true },
      });
      if (!batch) throw new Error('The batch this adjustment applied to no longer exists');

      // Undoing an adjustment that ADDED stock takes it away again, which cannot go below zero —
      // it will already have been sold. Refuse rather than clamp, so the shelf is never silently
      // left disagreeing with the record.
      const target = Math.round((batch.quantity - original.quantityDelta) * 1000) / 1000;
      if (target < 0) {
        throw new Error(
          `Cannot reverse this adjustment: it added ${original.quantityDelta} ` +
            `${original.product?.contentUnit || 'unit'}(s) to batch ${batch.batchNumber}, but only ` +
            `${batch.quantity} remain — the rest has been sold.`
        );
      }

      await tx.inventoryBatch.update({ where: { id: batch.id }, data: { quantity: target } });

      return tx.stockAdjustment.create({
        data: {
          batchId: batch.id,
          productId: batch.productId,
          quantityDelta: Math.round((target - batch.quantity) * 1000) / 1000,
          previousQuantity: batch.quantity,
          newQuantity: target,
          reason: reversalReason(id),
          // MANUAL regardless of what is being reversed: a person did this, now. Copying the
          // original's source would file the undo of a legacy import as a legacy import, and the
          // "From old app" filter would then show an entry the old app never produced.
          source: AdjustmentSource.MANUAL,
          userId: req.user?.id ?? null,
        },
        include: {
          product: { select: { name: true } },
          batch: { select: { batchNumber: true, expiryDate: true } },
          user: { select: { name: true, role: true } },
        },
      });
    });

    res.status(201).json(result);
  } catch (e: any) {
    const status = e.message === 'Adjustment not found' ? 404 : 400;
    res.status(status).json({ error: e.message });
  }
});

export default router;
