import { Router, Response } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, AuthenticatedRequest } from '../middlewares/auth.middleware';

const router = Router();
router.use(authenticate);

// ==========================================
// 1. SALES RETURNS (CREDIT NOTES)
// ==========================================

// GET /api/returns/sales
router.get('/sales', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const returns = await prisma.salesReturn.findMany({
      include: {
        salesBill: true,
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(returns);
  } catch (error) {
    console.error('Error fetching sales returns:', error);
    res.status(500).json({ error: 'Failed to fetch sales returns' });
  }
});

// POST /api/returns/sales
router.post('/sales', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { salesBillId, customerId, refundMethod, notes, items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one return item is required' });
    }

    const returnNumber = `SR-${Date.now().toString().slice(-6)}`;
    const totalReturnAmount = items.reduce((sum: number, item: any) => {
      return sum + (parseFloat(item.quantity || 1) * parseFloat(item.unitPrice || 0));
    }, 0);

    const salesReturn = await prisma.$transaction(async (tx) => {
      const record = await tx.salesReturn.create({
        data: {
          returnNumber,
          salesBillId: salesBillId || null,
          customerId: customerId || null,
          totalReturnAmount,
          refundMethod: refundMethod || 'CASH',
          notes,
          items: {
            create: items.map((item: any) => ({
              productId: item.productId,
              batchNumber: item.batchNumber || null,
              quantity: parseFloat(item.quantity),
              unitPrice: parseFloat(item.unitPrice),
              totalAmount: parseFloat(item.quantity) * parseFloat(item.unitPrice),
              condition: item.condition || 'RESTOCK',
              reason: item.reason || null,
            })),
          },
        },
        include: { items: true },
      });

      // If item condition is RESTOCK, restore quantity back to InventoryBatch
      for (const item of items) {
        if (item.condition === 'RESTOCK' && item.productId && item.batchNumber) {
          const batch = await tx.inventoryBatch.findFirst({
            where: {
              productId: item.productId,
              batchNumber: item.batchNumber,
            },
          });

          if (batch) {
            await tx.inventoryBatch.update({
              where: { id: batch.id },
              data: { quantity: batch.quantity + parseFloat(item.quantity) },
            });
          }
        }
      }

      // Create Ledger entry for Credit Note
      if (customerId) {
        await tx.ledgerEntry.create({
          data: {
            partyType: 'CUSTOMER',
            customerId,
            transactionType: 'CREDIT',
            amount: totalReturnAmount,
            paymentMethod: refundMethod || 'CREDIT_NOTE',
            description: `Sales Return Credit Note ${returnNumber}`,
            isSettled: true,
          },
        });
      }

      return record;
    });

    console.log(`[Anshu Engine] Sales Return created: ${returnNumber} (₹${totalReturnAmount})`);
    res.status(201).json(salesReturn);
  } catch (error) {
    console.error('Error creating sales return:', error);
    res.status(500).json({ error: 'Failed to process sales return' });
  }
});

// ==========================================
// 2. PURCHASE RETURNS (DEBIT NOTES)
// ==========================================

// GET /api/returns/purchases
router.get('/purchases', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const returns = await prisma.purchaseReturn.findMany({
      include: {
        purchaseBill: true,
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(returns);
  } catch (error) {
    console.error('Error fetching purchase returns:', error);
    res.status(500).json({ error: 'Failed to fetch purchase returns' });
  }
});

// POST /api/returns/purchases
router.post('/purchases', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { purchaseBillId, partyId, refundMethod, notes, items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one return item is required' });
    }

    const returnNumber = `PR-${Date.now().toString().slice(-6)}`;
    const totalReturnAmount = items.reduce((sum: number, item: any) => {
      return sum + (parseFloat(item.quantity || 1) * parseFloat(item.purchaseRate || 0));
    }, 0);

    const purchaseReturn = await prisma.$transaction(async (tx) => {
      const record = await tx.purchaseReturn.create({
        data: {
          returnNumber,
          purchaseBillId: purchaseBillId || null,
          partyId: partyId || null,
          totalReturnAmount,
          refundMethod: refundMethod || 'DEBIT_NOTE',
          notes,
          items: {
            create: items.map((item: any) => ({
              productId: item.productId,
              batchNumber: item.batchNumber || null,
              quantity: parseFloat(item.quantity),
              purchaseRate: parseFloat(item.purchaseRate),
              totalAmount: parseFloat(item.quantity) * parseFloat(item.purchaseRate),
              reason: item.reason || null,
            })),
          },
        },
        include: { items: true },
      });

      // Deduct stock from matching InventoryBatch
      for (const item of items) {
        if (item.productId && item.batchNumber) {
          const batch = await tx.inventoryBatch.findFirst({
            where: {
              productId: item.productId,
              batchNumber: item.batchNumber,
            },
          });

          if (batch) {
            const newQty = Math.max(0, batch.quantity - parseFloat(item.quantity));
            await tx.inventoryBatch.update({
              where: { id: batch.id },
              data: { quantity: newQty },
            });
          }
        }
      }

      // Create Ledger entry for Supplier Debit Note
      if (partyId) {
        await tx.ledgerEntry.create({
          data: {
            partyType: 'SUPPLIER',
            partyId,
            transactionType: 'DEBIT',
            amount: totalReturnAmount,
            paymentMethod: refundMethod || 'DEBIT_NOTE',
            description: `Purchase Return Debit Note ${returnNumber}`,
            isSettled: true,
          },
        });
      }

      return record;
    });

    console.log(`[Anshu Engine] Purchase Return created: ${returnNumber} (₹${totalReturnAmount})`);
    res.status(201).json(purchaseReturn);
  } catch (error) {
    console.error('Error creating purchase return:', error);
    res.status(500).json({ error: 'Failed to process purchase return' });
  }
});

export default router;
