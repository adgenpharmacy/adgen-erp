import { Router, Response } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, AuthenticatedRequest, requireOwner } from '../middlewares/auth.middleware';
import { validateCreateSale } from '../middlewares/validation.middleware';

const router = Router();

const INVOICE_PREFIX = 'INV-';

/**
 * Derive the next sales invoice number from the highest number already issued.
 *
 * Counting rows (count + 1) reuses numbers after a deletion, and reading the most
 * recent row by createdAt breaks when bills are backdated — both produce duplicate
 * invoice numbers, which is not acceptable on a GST invoice series.
 */
async function nextSalesInvoiceNumber(tx: {
  salesBill: { findMany: (args: any) => Promise<{ invoiceNumber: string | null }[]> };
}): Promise<string> {
  const bills = await tx.salesBill.findMany({
    where: { invoiceNumber: { startsWith: INVOICE_PREFIX } },
    select: { invoiceNumber: true },
  });

  let highest = 0;
  for (const b of bills) {
    const match = b.invoiceNumber?.match(/(\d+)\s*$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (!Number.isNaN(n) && n > highest) highest = n;
    }
  }

  return `${INVOICE_PREFIX}${String(highest + 1).padStart(6, '0')}`;
}

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
            product: { select: { name: true, genericName: true, hsnCode: true, gstPercent: true, purchaseRate: true, packSize: true, packUnit: true, contentUnit: true } },
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

// GET /api/sales/next-number — Get next DB sequential sales invoice number
router.get('/next-number', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const nextInvoiceNumber = await nextSalesInvoiceNumber(prisma);
    res.json({ nextInvoiceNumber });
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
      const batchStockTracker: Record<string, number> = {};

      for (const item of items) {
        let { productId, batchId, quantity, unitPrice, taxPercent, discountPercent } = item;
        let qtyNeeded = parseFloat(quantity) || 0;
        const lineDiscountPercent = parseFloat(discountPercent) || 0;

        if (qtyNeeded <= 0) continue;

        /*
         * Candidate batches, earliest expiry first (FEFO) — but never an expired one.
         *
         * Without the date filter this did the opposite of what it should: FEFO sorts by
         * expiry ascending, so an expired batch sorted to the front and was dispensed first.
         * Selling expired medicine is a regulatory problem, not just a data one.
         *
         * Compared against the start of today so a batch expiring this month is still sellable
         * for the whole of it, which is how a pharmacist reads an MM/YY stamp.
         */
        const today = new Date();
        const startOfToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

        const availableBatches = await tx.inventoryBatch.findMany({
          where: {
            productId,
            quantity: { gt: 0 },
            expiryDate: { gte: startOfToday },
          },
          orderBy: { expiryDate: 'asc' },
        });

        // If explicit batchId provided, put it first in candidate list
        if (batchId) {
          const specIdx = availableBatches.findIndex(b => b.id === batchId);
          if (specIdx > 0) {
            const [spec] = availableBatches.splice(specIdx, 1);
            availableBatches.unshift(spec);
          }
        }

        const totalAvailableStock = availableBatches.reduce((sum, b) => {
          const used = batchStockTracker[b.id] || 0;
          return sum + Math.max(0, b.quantity - used);
        }, 0);

        if (availableBatches.length === 0 || totalAvailableStock < qtyNeeded) {
          // Name the medicine and say when stock exists but is expired, otherwise the counter
          // sees quantity on the inventory screen and an "available 0" refusal on the till.
          const prod = await tx.product.findUnique({ where: { id: productId }, select: { name: true } });
          const expiredUnits = await tx.inventoryBatch.aggregate({
            where: { productId, quantity: { gt: 0 }, expiryDate: { lt: startOfToday } },
            _sum: { quantity: true },
          });
          const expired = expiredUnits._sum.quantity || 0;

          throw new Error(
            `Not enough sellable stock for ${prod?.name ?? productId}. ` +
              `Needed ${qtyNeeded}, available ${totalAvailableStock}.` +
              (expired > 0 ? ` A further ${expired} unit(s) are in stock but past their expiry and cannot be sold.` : '')
          );
        }

        // Deduct from candidate batches sequentially
        for (const batch of availableBatches) {
          if (qtyNeeded <= 0) break;

          const usedAlready = batchStockTracker[batch.id] || 0;
          const availableInBatch = Math.max(0, batch.quantity - usedAlready);

          if (availableInBatch <= 0) continue;

          const qtyToTake = Math.min(qtyNeeded, availableInBatch);
          batchStockTracker[batch.id] = usedAlready + qtyToTake;
          qtyNeeded -= qtyToTake;

          // Apply the per-item discount BEFORE extracting tax. This was previously ignored
          // entirely: the counter showed a discounted line total while the bill was saved at
          // full price, so revenue and GST were overstated on every discounted sale.
          const lineGross = qtyToTake * parseFloat(unitPrice);
          const lineDiscount = lineGross * (lineDiscountPercent / 100);
          const itemTotal = Math.max(0, lineGross - lineDiscount);

          // MRP is tax-inclusive under Indian retail GST, so tax is extracted from the
          // discounted amount actually charged.
          const taxRate = (taxPercent || 0) / 100;
          const itemTax = taxRate > 0 ? itemTotal - (itemTotal / (1 + taxRate)) : 0;
          const itemSubtotal = itemTotal - itemTax;

          subtotal += itemSubtotal;
          taxTotal += itemTax;

          billItemsToCreate.push({
            productId: batch.productId || productId,
            batchId: batch.id,
            quantity: qtyToTake,
            unitPrice: parseFloat(unitPrice),
            discountPercent: lineDiscountPercent,
            taxPercent: parseFloat(taxPercent || 0),
            totalAmount: itemTotal,
          });

          await tx.inventoryBatch.update({
            where: { id: batch.id },
            data: {
              quantity: { decrement: qtyToTake },
            },
          });
        }
      }

      const discountAmount = parseFloat(discount || 0);
      const rawGrandTotal = Math.max(0, (subtotal + taxTotal) - discountAmount);
      
      const applyRoundOff = isRoundOff ?? true;
      let grandTotal = rawGrandTotal;
      let computedRoundOff = 0;
      
      if (applyRoundOff) {
        grandTotal = Math.round(rawGrandTotal);
        computedRoundOff = Math.round((grandTotal - rawGrandTotal) * 100) / 100;
      } else if (roundOffAmount !== undefined) {
        computedRoundOff = parseFloat(roundOffAmount) || 0;
        grandTotal = rawGrandTotal + computedRoundOff;
      }

      const cAmt = parseFloat(req.body.cashAmount || (paymentMethod === 'CASH' ? grandTotal : 0));
      const uAmt = parseFloat(req.body.upiAmount || (paymentMethod === 'UPI' ? grandTotal : 0));
      const cardAmt = parseFloat(req.body.cardAmount || (paymentMethod === 'CARD' ? grandTotal : 0));
      const credAmt = parseFloat(req.body.creditAmount || (paymentMethod === 'CREDIT' ? grandTotal : 0));

      const isCredit = paymentMethod === 'CREDIT' || (paymentMethod === 'SPLIT' && credAmt > 0);
      const debtAmount = paymentMethod === 'SPLIT' ? credAmt : (isCredit ? grandTotal : 0);
      const amountPaid = paymentMethod === 'SPLIT' ? (cAmt + uAmt + cardAmt) : (isCredit ? 0 : grandTotal);

      let cleanCustName = (customerName || '').trim();
      if (!cleanCustName || cleanCustName === '?' || cleanCustName.length < 2) {
        cleanCustName = 'Walk-in Retail Customer';
      }

      let finalInvoiceNum = (req.body.invoiceNumber || '').trim();
      if (!finalInvoiceNum) {
        finalInvoiceNum = await nextSalesInvoiceNumber(tx);
      } else {
        // Reject a duplicate rather than silently issuing two bills with the same number.
        const clash = await tx.salesBill.findFirst({
          where: { invoiceNumber: finalInvoiceNum },
          select: { id: true },
        });
        if (clash) {
          throw new Error(`Invoice number ${finalInvoiceNum} already exists.`);
        }
      }

      // 4. Create SalesBill with customer metadata & FEFO line items
      const bill = await tx.salesBill.create({
        data: {
          invoiceNumber: finalInvoiceNum,
          customerId: customerId || null,
          customerName: cleanCustName,
          customerPhone: customerPhone || null,
          doctorName: doctorName || null,
          notes: notes || null,
          isRoundOff: applyRoundOff,
          roundOffAmount: computedRoundOff,
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
          isSettled: !isCredit || (debtAmount <= 0),
          items: {
            create: billItemsToCreate,
          },
        },
        include: {
          items: true,
          customer: true,
        },
      });

      // 5. Create Ledger Entry if Credit Sale or Split Sale with Credit Portion
      if (isCredit && debtAmount > 0) {
        let targetCustomerId = customerId || null;
        if (!targetCustomerId) {
          const searchName = (cleanCustName && cleanCustName.length >= 2 && cleanCustName !== 'Walk-in Retail Customer')
            ? cleanCustName
            : 'Walk-in Credit Customer';
          const existingCust = await tx.customer.findFirst({
            where: { name: { equals: searchName, mode: 'insensitive' } },
          });
          if (existingCust) {
            targetCustomerId = existingCust.id;
          } else {
            const newCust = await tx.customer.create({
              data: {
                name: searchName,
                phone: customerPhone || null,
              },
            });
            targetCustomerId = newCust.id;
          }

          await tx.salesBill.update({
            where: { id: bill.id },
            data: { customerId: targetCustomerId },
          });
        }

        await tx.ledgerEntry.create({
          data: {
            partyType: 'CUSTOMER',
            customerId: targetCustomerId,
            transactionType: 'CREDIT',
            amount: debtAmount,
            salesBillId: bill.id,
            paymentMethod: paymentMethod === 'SPLIT' ? 'SPLIT_CREDIT' : 'CREDIT',
            description: `Credit Sale Invoice #${bill.invoiceNumber} (${cleanCustName})`,
            isSettled: false,
          },
        });
      }

      return bill;
    }, {
      // Same reason as purchases: a long bill exceeds Prisma's 5s interactive-transaction
      // limit, the transaction closes, and the next write fails with "Transaction not found".
      timeout: 30000,
      maxWait: 15000,
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

      // Items already restocked by a sales return must not be restocked a second time here.
      const priorReturns = await tx.salesReturn.findMany({
        where: { salesBillId: id },
        include: { items: true },
      });

      const restockedByReturns = new Map<string, number>();
      for (const ret of priorReturns) {
        for (const ri of ret.items) {
          if (ri.condition !== 'RESTOCK') continue;
          restockedByReturns.set(ri.productId, (restockedByReturns.get(ri.productId) || 0) + ri.quantity);
        }
      }

      // 1. Restore batch stock safely, net of anything a return already put back
      for (const item of bill.items) {
        if (!item.batchId) continue;

        const alreadyBack = restockedByReturns.get(item.productId) || 0;
        const toRestore = Math.max(0, item.quantity - alreadyBack);
        restockedByReturns.set(item.productId, Math.max(0, alreadyBack - item.quantity));

        if (toRestore <= 0) continue;

        const batch = await tx.inventoryBatch.findUnique({ where: { id: item.batchId } });
        if (batch) {
          await tx.inventoryBatch.update({
            where: { id: item.batchId },
            data: { quantity: { increment: toRestore } },
          });
        }
      }

      // 2. Delete linked SalesReturn records to prevent FK constraint failure
      await tx.salesReturn.deleteMany({ where: { salesBillId: id } });

      // 3. Delete linked customer ledger entries if any
      await tx.ledgerEntry.deleteMany({ where: { salesBillId: id } });

      // 4. Delete bill (Cascades to items)
      await tx.salesBill.delete({ where: { id } });
    }, {
      // Same reason as purchases: a long bill exceeds Prisma's 5s interactive-transaction
      // limit, the transaction closes, and the next write fails with "Transaction not found".
      timeout: 30000,
      maxWait: 15000,
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
    const { 
      customerId, customerName, customerPhone, doctorName, notes, 
      paymentMethod, discount, isRoundOff, roundOffAmount, items 
    } = req.body;

    const saleResult = await prisma.$transaction(async (tx) => {
      // 1. Fetch current sales bill
      const existingBill = await tx.salesBill.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!existingBill) throw new Error('Sales bill not found');

      let subtotal = existingBill.subtotal;
      let taxTotal = existingBill.taxTotal;
      let discountAmount = discount !== undefined ? parseFloat(discount) : existingBill.discount;

      // 2. If items provided, restore stock for old items first & recreate line items
      if (items && Array.isArray(items) && items.length > 0) {
        for (const item of existingBill.items) {
          if (item.batchId) {
            await tx.inventoryBatch.update({
              where: { id: item.batchId },
              data: { quantity: { increment: item.quantity } },
            });
          }
        }

        await tx.salesBillItem.deleteMany({ where: { salesBillId: id } });

        subtotal = 0;
        taxTotal = 0;
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
            data: { quantity: { decrement: parseFloat(quantity) } },
          });

          // Mirror POST: the per-item discount reduces the line before tax is extracted.
          // It was stored on the row but never applied, so editing a bill restored the
          // undiscounted total.
          const lineDiscountPercent = parseFloat(discountPercent) || 0;
          const lineGross = (parseFloat(quantity) || 0) * (parseFloat(unitPrice) || 0);
          const lineDiscount = lineGross * (lineDiscountPercent / 100);
          const itemTotal = Math.max(0, lineGross - lineDiscount);

          const taxRate = (taxPercent || 0) / 100;
          const itemTax = taxRate > 0 ? itemTotal - (itemTotal / (1 + taxRate)) : 0;
          const itemSubtotal = itemTotal - itemTax;

          subtotal += itemSubtotal;
          taxTotal += itemTax;

          billItemsToCreate.push({
            salesBillId: id,
            productId,
            batchId,
            quantity: parseFloat(quantity) || 1,
            unitPrice: parseFloat(unitPrice) || 0,
            discountPercent: lineDiscountPercent,
            taxPercent: parseFloat(taxPercent) || 0,
            totalAmount: itemTotal,
          });
        }

        await tx.salesBillItem.createMany({ data: billItemsToCreate });
      }

      const rawGrandTotal = Math.max(0, (subtotal + taxTotal) - discountAmount);
      const applyRoundOff = isRoundOff !== undefined ? Boolean(isRoundOff) : existingBill.isRoundOff;
      let grandTotal = rawGrandTotal;
      let computedRoundOff = 0;

      if (applyRoundOff) {
        grandTotal = Math.round(rawGrandTotal);
        computedRoundOff = Math.round((grandTotal - rawGrandTotal) * 100) / 100;
      } else if (roundOffAmount !== undefined) {
        computedRoundOff = parseFloat(roundOffAmount) || 0;
        grandTotal = rawGrandTotal + computedRoundOff;
      }

      const finalMethod = paymentMethod || existingBill.paymentMethod || 'CASH';
      const cAmt = req.body.cashAmount !== undefined ? parseFloat(req.body.cashAmount) : (finalMethod === 'CASH' ? grandTotal : 0);
      const uAmt = req.body.upiAmount !== undefined ? parseFloat(req.body.upiAmount) : (finalMethod === 'UPI' ? grandTotal : 0);
      const cardAmt = req.body.cardAmount !== undefined ? parseFloat(req.body.cardAmount) : (finalMethod === 'CARD' ? grandTotal : 0);
      const credAmt = req.body.creditAmount !== undefined ? parseFloat(req.body.creditAmount) : (finalMethod === 'CREDIT' ? grandTotal : 0);

      const isCredit = finalMethod === 'CREDIT' || (finalMethod === 'SPLIT' && credAmt > 0);
      const debtAmount = finalMethod === 'SPLIT' ? credAmt : (isCredit ? grandTotal : 0);
      const amountPaid = finalMethod === 'SPLIT' ? (cAmt + uAmt + cardAmt) : (isCredit ? 0 : grandTotal);

      let cleanCustName = customerName !== undefined ? (customerName || '').trim() : existingBill.customerName;
      if (!cleanCustName || cleanCustName === '?' || cleanCustName.length < 2) {
        cleanCustName = 'Walk-in Retail Customer';
      }

      // Update SalesBill header
      const updatedBill = await tx.salesBill.update({
        where: { id },
        data: {
          customerId: customerId !== undefined ? (customerId || null) : existingBill.customerId,
          customerName: cleanCustName,
          customerPhone: customerPhone !== undefined ? (customerPhone || null) : existingBill.customerPhone,
          doctorName: doctorName !== undefined ? (doctorName || null) : existingBill.doctorName,
          notes: notes !== undefined ? (notes || null) : existingBill.notes,
          paymentMethod: finalMethod,
          cashAmount: cAmt,
          upiAmount: uAmt,
          cardAmount: cardAmt,
          creditAmount: credAmt,
          subtotal,
          taxTotal,
          discount: discountAmount,
          isRoundOff: applyRoundOff,
          roundOffAmount: computedRoundOff,
          grandTotal,
          amountPaid,
          isSettled: !isCredit || (debtAmount <= 0),
        },
        include: { customer: true, items: true },
      });

      // Synchronize Ledger Entries: Delete old sales bill ledger entries & recreate if credit remains
      await tx.ledgerEntry.deleteMany({ where: { salesBillId: id } });

      if (isCredit && debtAmount > 0) {
        let targetCustomerId = updatedBill.customerId;
        if (!targetCustomerId) {
          const searchName = (cleanCustName && cleanCustName.length >= 2 && cleanCustName !== 'Walk-in Retail Customer')
            ? cleanCustName
            : 'Walk-in Credit Customer';
          const existingCust = await tx.customer.findFirst({
            where: { name: { equals: searchName, mode: 'insensitive' } },
          });
          if (existingCust) {
            targetCustomerId = existingCust.id;
          } else {
            const newCust = await tx.customer.create({
              data: {
                name: searchName,
                phone: updatedBill.customerPhone || null,
              },
            });
            targetCustomerId = newCust.id;
          }

          await tx.salesBill.update({
            where: { id },
            data: { customerId: targetCustomerId },
          });
        }

        await tx.ledgerEntry.create({
          data: {
            partyType: 'CUSTOMER',
            customerId: targetCustomerId,
            transactionType: 'CREDIT',
            amount: debtAmount,
            salesBillId: id,
            paymentMethod: finalMethod === 'SPLIT' ? 'SPLIT_CREDIT' : 'CREDIT',
            description: `Credit Sale Invoice #${updatedBill.invoiceNumber} (${cleanCustName})`,
            isSettled: false,
          },
        });
      }

      return updatedBill;
    }, {
      // Same reason as purchases: a long bill exceeds Prisma's 5s interactive-transaction
      // limit, the transaction closes, and the next write fails with "Transaction not found".
      timeout: 30000,
      maxWait: 15000,
    });

    res.json(saleResult);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});



export default router;
