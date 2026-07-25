import { Router, Response } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, AuthenticatedRequest, requireOwner } from '../middlewares/auth.middleware';
import { validateCreateSale } from '../middlewares/validation.middleware';

const router = Router();

// GET /api/sales — Fetch all sales bills
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const bills = await prisma.salesBill.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        customer: true,
        user: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { name: true, packSize: true, contentUnit: true } },
            batch: { select: { batchNumber: true, expiryDate: true, purchaseRate: true, mrp: true } },
          },
        },
      },
    });
    res.json(bills);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/sales — Create sale with atomic stock deduction & ledger entry
router.post('/', authenticate, validateCreateSale, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { 
      customerId, customerName, customerPhone, doctorName, notes, 
      paymentMethod, discount, items, isRoundOff, roundOffAmount 
    } = req.body;
    const userId = req.user!.id;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Sale must contain at least one item' });
    }

    // Execute within a single PostgreSQL ACID Transaction
    const saleResult = await prisma.$transaction(async (tx) => {
      let subtotal = 0;
      let taxTotal = 0;
      const billItemsToCreate = [];

      for (const item of items) {
        const { productId, batchId, quantity, unitPrice, taxPercent } = item;

        // 1. Fetch & lock batch stock
        const batch = await tx.inventoryBatch.findUnique({
          where: { id: batchId },
        });

        if (!batch) {
          throw new Error(`Batch ${batchId} not found`);
        }

        if (batch.quantity < quantity) {
          throw new Error(`Insufficient stock for batch ${batch.batchNumber}. Available: ${batch.quantity}, Requested: ${quantity}`);
        }

        // 2. Calculate item totals (MRP is tax-inclusive)
        const itemTotal = quantity * unitPrice;
        const taxRate = (taxPercent || 0) / 100;
        const itemTax = taxRate > 0 ? itemTotal - (itemTotal / (1 + taxRate)) : 0;
        const itemSubtotal = itemTotal - itemTax;

        subtotal += itemSubtotal;
        taxTotal += itemTax;

        billItemsToCreate.push({
          productId,
          batchId,
          quantity: parseFloat(quantity),
          unitPrice: parseFloat(unitPrice),
          taxPercent: parseFloat(taxPercent || 0),
          totalAmount: itemTotal,
        });

        // 3. Deduct stock from batch
        await tx.inventoryBatch.update({
          where: { id: batchId },
          data: { quantity: { decrement: parseFloat(quantity) } },
        });
      }

      const discountAmount = parseFloat(discount || 0);
      let grandTotal = (subtotal + taxTotal) - discountAmount;
      
      const applyRoundOff = isRoundOff ?? true;
      const rOffAmt = applyRoundOff && roundOffAmount !== undefined ? parseFloat(roundOffAmount) : 0;
      
      if (applyRoundOff) {
         // Apply user provided roundoff or calculate it
         if (roundOffAmount !== undefined) {
             grandTotal += rOffAmt;
         } else {
             const rounded = Math.round(grandTotal);
             grandTotal = rounded;
         }
      }

      const cAmt = parseFloat(req.body.cashAmount || (paymentMethod === 'CASH' ? grandTotal : 0));
      const uAmt = parseFloat(req.body.upiAmount || (paymentMethod === 'UPI' ? grandTotal : 0));
      const cardAmt = parseFloat(req.body.cardAmount || (paymentMethod === 'CARD' ? grandTotal : 0));
      const credAmt = parseFloat(req.body.creditAmount || (paymentMethod === 'CREDIT' ? grandTotal : 0));

      const isCredit = paymentMethod === 'CREDIT' || (paymentMethod === 'SPLIT' && credAmt > 0);
      const amountPaid = paymentMethod === 'SPLIT' ? (cAmt + uAmt + cardAmt) : (isCredit ? 0 : grandTotal);

      let cleanCustName = (customerName || '').trim();
      if (!cleanCustName || cleanCustName === '?' || cleanCustName.length < 2) {
        cleanCustName = 'Walk-in Retail Customer';
      }

      const generatedInvoiceNum = `INV-${Date.now().toString().slice(-6)}`;

      // 4. Create SalesBill with customer metadata & FEFO line items
      const bill = await tx.salesBill.create({
        data: {
          invoiceNumber: generatedInvoiceNum,
          customerId: customerId || null,
          customerName: cleanCustName,
          customerPhone: customerPhone || null,
          doctorName: doctorName || null,
          notes: notes || null,
          isRoundOff: applyRoundOff,
          roundOffAmount: rOffAmt,
          userId,
          paymentMethod,
          cashAmount: cAmt,
          upiAmount: uAmt,
          cardAmount: cardAmt,
          creditAmount: credAmt,
          subtotal,
          taxTotal,
          discount: discountAmount,
          grandTotal,
          amountPaid,
          isSettled: !isCredit,
          items: {
            create: billItemsToCreate,
          },
        },
        include: {
          items: true,
          customer: true,
        },
      });

      // 5. Create Ledger Entry if Credit Sale
      if (isCredit) {
        let targetCustomerId = customerId || null;
        if (!targetCustomerId && cleanCustName && cleanCustName !== 'Walk-in Retail Customer') {
          const existingCust = await tx.customer.findFirst({
            where: { name: { equals: cleanCustName, mode: 'insensitive' } },
          });
          if (existingCust) {
            targetCustomerId = existingCust.id;
          } else {
            const newCust = await tx.customer.create({
              data: {
                name: cleanCustName,
                phone: customerPhone || null,
              },
            });
            targetCustomerId = newCust.id;
          }
        }

        await tx.ledgerEntry.create({
          data: {
            partyType: 'CUSTOMER',
            customerId: targetCustomerId,
            transactionType: 'CREDIT',
            amount: grandTotal,
            salesBillId: bill.id,
            paymentMethod: 'CREDIT',
            description: `Credit Sale Invoice #${bill.invoiceNumber} (${cleanCustName})`,
            isSettled: false,
          },
        });
      }

      return bill;
    });

    res.status(201).json(saleResult);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE /api/sales/:id — Delete sale & restore batch stock
router.delete('/:id', authenticate, requireOwner, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.$transaction(async (tx) => {
      const bill = await tx.salesBill.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!bill) throw new Error('Sales bill not found');

      // 1. Restore batch stock safely
      for (const item of bill.items) {
        if (item.batchId) {
          const batch = await tx.inventoryBatch.findUnique({ where: { id: item.batchId } });
          if (batch) {
            await tx.inventoryBatch.update({
              where: { id: item.batchId },
              data: { quantity: { increment: item.quantity } },
            });
          }
        }
      }

      // 2. Delete linked customer ledger entries if any
      await tx.ledgerEntry.deleteMany({ where: { salesBillId: id } });

      // 3. Delete bill (Cascades to items)
      await tx.salesBill.delete({ where: { id } });
    });

    res.json({ message: 'Sale deleted and stock restored successfully' });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// GET /api/sales/:id — Fetch single sales bill with items & batch info
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const bill = await prisma.salesBill.findUnique({
      where: { id },
      include: {
        customer: true,
        user: { select: { id: true, name: true } },
        items: {
          include: {
            product: true,
            batch: true,
          },
        },
      },
    });
    if (!bill) return res.status(404).json({ error: 'Sales bill not found' });
    res.json(bill);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/sales/:id — Edit sales bill metadata & items
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { customerId, customerName, customerPhone, doctorName, notes, paymentMethod, isRoundOff, roundOffAmount, items } = req.body;

    const saleResult = await prisma.$transaction(async (tx) => {
      // 1. Fetch current sales bill
      const existingBill = await tx.salesBill.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!existingBill) throw new Error('Sales bill not found');

      // 2. If new items provided, restore stock for old items first
      if (items && Array.isArray(items) && items.length > 0) {
        for (const item of existingBill.items) {
          await tx.inventoryBatch.update({
            where: { id: item.batchId },
            data: { quantity: { increment: item.quantity } },
          });
        }

        await tx.salesBillItem.deleteMany({ where: { salesBillId: id } });

        let subtotal = 0;
        let taxTotal = 0;
        const billItemsToCreate = [];

        for (const item of items) {
          const { productId, batchId, quantity, unitPrice, discountPercent, taxPercent } = item;

          const batch = await tx.inventoryBatch.findUnique({ where: { id: batchId } });
          if (!batch) throw new Error(`Batch ${batchId} not found`);
          if (batch.quantity < quantity) {
            throw new Error(`Insufficient stock for batch ${batch.batchNumber}. Available: ${batch.quantity}, Requested: ${quantity}`);
          }

          // Deduct stock
          await tx.inventoryBatch.update({
            where: { id: batchId },
            data: { quantity: { decrement: quantity } },
          });

          const gross = (quantity || 1) * (unitPrice || 0);
          const disc = gross * ((discountPercent || 0) / 100);
          const lineNet = Math.max(0, gross - disc);
          const lineTax = lineNet * ((taxPercent || 12) / 100);

          subtotal += lineNet;
          taxTotal += lineTax;

          billItemsToCreate.push({
            salesBillId: id,
            productId,
            batchId,
            quantity: parseFloat(quantity) || 1,
            unitPrice: parseFloat(unitPrice) || 0,
            discountPercent: parseFloat(discountPercent) || 0,
            taxPercent: parseFloat(taxPercent) || 12,
            totalAmount: lineNet + lineTax,
          });
        }

        await tx.salesBillItem.createMany({ data: billItemsToCreate });

        const rawGrandTotal = subtotal + taxTotal;
        const parsedRoundOff = parseFloat(roundOffAmount) || 0;
        const finalGrandTotal = isRoundOff ? Math.round(rawGrandTotal) : (rawGrandTotal + parsedRoundOff);

        await tx.salesBill.update({
          where: { id },
          data: {
            subtotal,
            taxTotal,
            roundOffAmount: parsedRoundOff,
            grandTotal: finalGrandTotal,
          },
        });
      }

      // Update header details
      return tx.salesBill.update({
        where: { id },
        data: {
          customerId: customerId || null,
          customerName: customerName !== undefined ? customerName : undefined,
          customerPhone: customerPhone !== undefined ? customerPhone : undefined,
          doctorName: doctorName !== undefined ? doctorName : undefined,
          notes: notes !== undefined ? notes : undefined,
          paymentMethod: paymentMethod !== undefined ? paymentMethod : undefined,
          grandTotal: req.body.grandTotal !== undefined ? parseFloat(req.body.grandTotal) : undefined,
          isRoundOff: isRoundOff !== undefined ? Boolean(isRoundOff) : undefined,
        },
        include: { customer: true, items: true },
      });
    });

    res.json(saleResult);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
