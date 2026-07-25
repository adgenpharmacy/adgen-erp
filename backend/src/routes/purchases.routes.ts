import { Router, Response } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, AuthenticatedRequest, requireOwner } from '../middlewares/auth.middleware';
import { validateCreatePurchase } from '../middlewares/validation.middleware';

const router = Router();

// GET /api/purchases — Fetch all purchase bills
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const bills = await prisma.purchaseBill.findMany({
      orderBy: [{ purchaseDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        party: true,
        items: {
          include: {
            product: { select: { name: true, packSize: true, contentUnit: true } },
          },
        },
      },
    });
    res.json(bills);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/purchases/next-number — Get next DB sequential purchase invoice number
router.get('/next-number', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const latestBill = await prisma.purchaseBill.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { invoiceNumber: true },
    });
    
    let nextSeq = 1001;
    if (latestBill && latestBill.invoiceNumber) {
      const match = latestBill.invoiceNumber.match(/PUR-(\d+)/);
      if (match) {
        nextSeq = parseInt(match[1], 10) + 1;
      } else {
        const count = await prisma.purchaseBill.count();
        nextSeq = count + 1001;
      }
    }
    
    const nextNum = `PUR-${String(nextSeq).padStart(6, '0')}`;
    res.json({ nextInvoiceNumber: nextNum });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/purchases — Create Purchase Bill & Auto-Generate Inventory Batches
router.post('/', authenticate, validateCreatePurchase, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { invoiceNumber, partyId, purchaseDate, isPaid, items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Purchase bill must contain at least one item' });
    }

    const purchaseResult = await prisma.$transaction(async (tx) => {
      let subtotal = 0;
      let taxTotal = 0;
      const billItemsToCreate = [];

      for (const item of items) {
        const { productId, batchNumber, expiryDate, quantity, freeQuantity, purchaseRate, mrp, taxPercent, gstPercent } = item;
        const parsedTax = taxPercent !== undefined && taxPercent !== null 
          ? parseFloat(taxPercent) 
          : (gstPercent !== undefined && gstPercent !== null ? parseFloat(gstPercent) : 0);

        const prod = await tx.product.findUnique({ where: { id: productId } });
        if (!prod) throw new Error(`Product ${productId} not found`);

        const packSize = prod.packSize || 1;
        const totalPacks = parseFloat(quantity) + parseFloat(freeQuantity || 0);
        const totalContentUnits = totalPacks * packSize; // Convert to single units (e.g. tablets)

        const itemSubtotal = parseFloat(quantity) * parseFloat(purchaseRate);
        const itemTax = itemSubtotal * (parsedTax / 100);
        const itemTotal = itemSubtotal + itemTax;

        subtotal += itemSubtotal;
        taxTotal += itemTax;

        billItemsToCreate.push({
          productId,
          batchNumber,
          expiryDate: new Date(expiryDate),
          quantity: parseFloat(quantity),
          freeQuantity: parseFloat(freeQuantity || 0),
          purchaseRate: parseFloat(purchaseRate),
          mrp: parseFloat(mrp),
          taxPercent: parsedTax,
          totalAmount: itemTotal,
        });
      }

      const grandTotal = subtotal + taxTotal;

      // 1. Create PurchaseBill
      const bill = await tx.purchaseBill.create({
        data: {
          invoiceNumber,
          partyId,
          purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
          subtotal,
          taxTotal,
          grandTotal,
          isPaid: Boolean(isPaid),
          items: {
            create: billItemsToCreate,
          },
        },
        include: {
          items: true,
          party: true,
        },
      });

      // 2. Auto-create/Ingest into InventoryBatch linked with purchaseBillId
      for (const item of items) {
        const { productId, batchNumber, expiryDate, quantity, freeQuantity, mrp, purchaseRate } = item;
        const prod = await tx.product.findUnique({ where: { id: productId } });
        const packSize = prod?.packSize || 1;
        const totalPacks = parseFloat(quantity) + parseFloat(freeQuantity || 0);
        const totalContentUnits = totalPacks * packSize;

        await tx.inventoryBatch.create({
          data: {
            productId,
            batchNumber,
            expiryDate: new Date(expiryDate),
            quantity: totalContentUnits,
            mrp: parseFloat(mrp),
            purchaseRate: parseFloat(purchaseRate),
            purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
            purchaseBillId: bill.id,
          },
        });
      }

      // 3. Create Ledger Entry if Unpaid Credit Purchase
      if (!isPaid) {
        await tx.ledgerEntry.create({
          data: {
            partyType: 'SUPPLIER',
            partyId,
            transactionType: 'DEBIT',
            amount: grandTotal,
            purchaseBillId: bill.id,
            description: `Purchase Bill #${invoiceNumber}`,
            isSettled: false,
          },
        });
      }

      return bill;
    });

    res.status(201).json(purchaseResult);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// GET /api/purchases/:id — Fetch single purchase bill with items
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const bill = await prisma.purchaseBill.findUnique({
      where: { id },
      include: {
        party: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });
    if (!bill) return res.status(404).json({ error: 'Purchase bill not found' });
    res.json(bill);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/purchases/:id — Edit purchase bill
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { invoiceNumber, partyId, purchaseDate, isPaid, grandTotal, notes, items } = req.body;

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Update purchase bill header
      const bill = await tx.purchaseBill.update({
        where: { id },
        data: {
          invoiceNumber: invoiceNumber !== undefined ? invoiceNumber : undefined,
          partyId: partyId !== undefined ? partyId : undefined,
          isPaid: isPaid !== undefined ? Boolean(isPaid) : undefined,
          purchaseDate: purchaseDate ? new Date(purchaseDate) : undefined,
          grandTotal: grandTotal !== undefined ? parseFloat(grandTotal) : undefined,
          notes: notes !== undefined ? notes : undefined,
        },
      });

      // 2. If new items provided, update bill items and sync inventory batches
      if (items && Array.isArray(items) && items.length > 0) {
        await tx.purchaseBillItem.deleteMany({ where: { purchaseBillId: id } });
        await tx.inventoryBatch.deleteMany({ where: { purchaseBillId: id } });

        let subtotal = 0;
        let taxTotal = 0;
        const billItemsToCreate = [];

        for (const item of items) {
          const { productId, batchNumber, expiryDate, quantity, freeQuantity, purchaseRate, mrp, discountPercent, taxPercent, gstPercent } = item;
          const parsedTax = taxPercent !== undefined && taxPercent !== null 
            ? parseFloat(taxPercent) 
            : (gstPercent !== undefined && gstPercent !== null ? parseFloat(gstPercent) : 12);
            
          const lineGross = (quantity || 1) * (purchaseRate || 0);
          const lineDisc = lineGross * ((discountPercent || 0) / 100);
          const lineNet = Math.max(0, lineGross - lineDisc);
          const lineTax = lineNet * (parsedTax / 100);

          subtotal += lineNet;
          taxTotal += lineTax;

          billItemsToCreate.push({
            purchaseBillId: id,
            productId,
            batchNumber: batchNumber || 'DEF-001',
            expiryDate: expiryDate ? new Date(expiryDate) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            quantity: parseFloat(quantity) || 1,
            freeQuantity: parseFloat(freeQuantity) || 0,
            purchaseRate: parseFloat(purchaseRate) || 0,
            mrp: parseFloat(mrp) || 0,
            discountPercent: parseFloat(discountPercent) || 0,
            taxPercent: parsedTax,
            totalAmount: lineNet + lineTax,
          });

          // Sync InventoryBatch
          const prod = await tx.product.findUnique({ where: { id: productId } });
          const packSize = prod?.packSize || 1;
          const totalPacks = (parseFloat(quantity) || 1) + (parseFloat(freeQuantity) || 0);

          await tx.inventoryBatch.create({
            data: {
              productId,
              batchNumber: batchNumber || 'DEF-001',
              expiryDate: expiryDate ? new Date(expiryDate) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
              quantity: totalPacks * packSize,
              mrp: parseFloat(mrp) || 0,
              purchaseRate: parseFloat(purchaseRate) || 0,
              purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
              purchaseBillId: id,
            },
          });
        }

        await tx.purchaseBillItem.createMany({ data: billItemsToCreate });
        await tx.purchaseBill.update({
          where: { id },
          data: {
            subtotal,
            taxTotal,
            grandTotal: subtotal + taxTotal,
          },
        });
      }

      return tx.purchaseBill.findUnique({
        where: { id },
        include: { party: true, items: true },
      });
    });

    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE /api/purchases/:id — Delete purchase bill with stock check & ledger cleanup
router.delete('/:id', authenticate, requireOwner, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.$transaction(async (tx) => {
      // Check if stock from this purchase bill has already been sold
      const batches = await tx.inventoryBatch.findMany({
        where: { purchaseBillId: id },
        include: { salesBillItems: true },
      });

      const hasSoldStock = batches.some((b) => b.salesBillItems.length > 0);
      if (hasSoldStock) {
        throw new Error('Cannot delete purchase bill: stock from this bill has already been sold in customer sales.');
      }

      // Delete linked ledger entries
      await tx.ledgerEntry.deleteMany({
        where: { purchaseBillId: id },
      });

      // Delete linked inventory batches
      await tx.inventoryBatch.deleteMany({
        where: { purchaseBillId: id },
      });

      // Delete purchase bill (items cascade delete)
      await tx.purchaseBill.delete({ where: { id } });
    });

    res.json({ message: 'Purchase bill, batches, and ledger entries deleted successfully' });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
