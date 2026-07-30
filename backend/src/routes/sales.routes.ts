import { Router, Response } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, AuthenticatedRequest, requireOwner } from '../middlewares/auth.middleware';
import { validateCreateSale } from '../middlewares/validation.middleware';
import { resolveBillTimestamp, nextSeriesNumber, splitInclusiveTax } from '../lib/billing-math';

const router = Router();

const INVOICE_PREFIX = 'INV-';

const WALK_IN_NAME = 'Walk-in Retail Customer';

/**
 * Normalise a typed customer name.
 *
 * Only an empty value or a bare "?" falls back to the walk-in placeholder. The previous rule
 * also rejected anything shorter than two characters, so a bill saved for "J" came back as
 * "Walk-in Retail Customer" — the edit screen looked like it had ignored the change.
 */
function resolveCustomerName(raw: unknown, fallback?: string | null): string {
  if (typeof raw !== 'string') return (fallback || '').trim() || WALK_IN_NAME;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '?') return WALK_IN_NAME;
  return trimmed;
}

/**
 * The GST rate a sale line is taxed at.
 *
 * The rate belongs to the stock, not to the counter: it is whatever was entered on the supplier
 * bill that brought the batch in, so output tax on a medicine matches the input tax claimed for
 * the same goods. The counter used to send a flat 12% for every line regardless of the product,
 * which mis-stated the liability on everything sold at 5% or 18%.
 *
 * The product's configured rate is only a fallback, for stock that predates the batch-level rate
 * (legacy imports and openings with no purchase bill behind them).
 */
function batchTaxRate(
  batch: { taxPercent?: number | null } | undefined,
  product?: { gstPercent?: number | null }
): number {
  const fromPurchase = Number(batch?.taxPercent) || 0;
  if (fromPurchase > 0) return fromPurchase;
  return Number(product?.gstPercent) || 0;
}

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

  return nextSeriesNumber(bills.map((b) => b.invoiceNumber), INVOICE_PREFIX);
}

// GET /api/sales — Fetch all sales bills
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    /*
     * `?summary=1` returns bills without their lines.
     *
     * The full shape carries every item plus its product and batch for every bill on record —
     * hundreds of kilobytes that the list screen renders as a row count. Reports still needs
     * the lines to compute COGS, so the trim is opt-in rather than the default.
     */
    const summaryOnly = req.query.summary === '1' || req.query.summary === 'true';

    /*
     * `?q=` searches the bill and what is on it.
     *
     * The list is fetched without its lines, so the counter could not find "every bill that has
     * Dolo on it" from the browser — the medicine names simply were not there. Matching the
     * line items server-side is the only place that question can be answered.
     */
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const where = q
      ? {
          OR: [
            { invoiceNumber: { contains: q, mode: 'insensitive' as const } },
            { customerName: { contains: q, mode: 'insensitive' as const } },
            { customerPhone: { contains: q } },
            { customer: { name: { contains: q, mode: 'insensitive' as const } } },
            { items: { some: { product: { name: { contains: q, mode: 'insensitive' as const } } } } },
            { items: { some: { product: { genericName: { contains: q, mode: 'insensitive' as const } } } } },
          ],
        }
      : {};

    const bills = await prisma.salesBill.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: true,
        user: { select: { id: true, name: true } },
        ...(summaryOnly
          ? { _count: { select: { items: true } } }
          : {
              items: {
                include: {
                  product: { select: { name: true, genericName: true, hsnCode: true, gstPercent: true, purchaseRate: true, packSize: true, packUnit: true, contentUnit: true } },
                  // taxPercent: the rate this stock was bought at. Reports need it to value COGS
                  // inclusive of tax when the shop is not GST-registered and cannot reclaim it.
                  batch: { select: { batchNumber: true, expiryDate: true, purchaseRate: true, mrp: true, taxPercent: true } },
                },
              },
            }),
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
      paymentMethod, discount, items, isRoundOff, roundOffAmount, billDate 
    } = req.body;

    /*
     * Bills are dated by createdAt. A pharmacy routinely enters a sale a day or two late, or
     * catches up after a power cut, so the counter can override the date. Anything unparseable
     * or in the future falls back to now rather than being written blindly.
     */
    // Rule lives in lib/billing-math and is covered by billing-math.test.ts.
    const saleTimestamp = resolveBillTimestamp(billDate, new Date());

    const userId = req.user!.id;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Sale must contain at least one item' });
    }

    // Execute within a single PostgreSQL ACID Transaction
    const saleResult = await prisma.$transaction(async (tx) => {
      const billItemsToCreate = [];
      const batchStockTracker: Record<string, number> = {};

      /*
       * Candidate batches, earliest expiry first (FEFO) — but never an expired one.
       *
       * Without the date filter this did the opposite of what it should: FEFO sorts by
       * expiry ascending, so an expired batch sorted to the front and was dispensed first.
       * Selling expired medicine is a regulatory problem, not just a data one.
       *
       * Compared against the start of today so a batch expiring this month is still sellable
       * for the whole of it, which is how a pharmacist reads an MM/YY stamp.
       *
       * Read once for every medicine on the bill rather than once per line: each query is a
       * network round trip to the database, and a ten-line bill spent ten of them here before
       * writing anything.
       */
      const today = new Date();
      const startOfToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

      const productIds = [...new Set(items.map((i: any) => i.productId).filter(Boolean))] as string[];
      const [allBatches, productRows] = await Promise.all([
        tx.inventoryBatch.findMany({
          where: {
            productId: { in: productIds },
            quantity: { gt: 0 },
            expiryDate: { gte: startOfToday },
          },
          orderBy: { expiryDate: 'asc' },
        }),
        tx.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, gstPercent: true },
        }),
      ]);
      const productById = new Map(productRows.map((p) => [p.id, p]));

      const batchesByProduct = new Map<string, typeof allBatches>();
      for (const b of allBatches) {
        const list = batchesByProduct.get(b.productId);
        if (list) list.push(b);
        else batchesByProduct.set(b.productId, [b]);
      }

      for (const item of items) {
        let { productId, batchId, quantity, unitPrice, taxPercent, discountPercent } = item;
        let qtyNeeded = parseFloat(quantity) || 0;
        const lineDiscountPercent = parseFloat(discountPercent) || 0;

        if (qtyNeeded <= 0) continue;

        // Copied per line: the reordering below is local to this line's FEFO pick.
        const availableBatches = [...(batchesByProduct.get(productId) || [])];

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
          const prod = productById.get(productId);
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

          billItemsToCreate.push({
            productId: batch.productId || productId,
            batchId: batch.id,
            quantity: qtyToTake,
            unitPrice: parseFloat(unitPrice),
            discountPercent: lineDiscountPercent,
            taxPercent: batchTaxRate(batch, productById.get(batch.productId || productId)),
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

      /*
       * GST is extracted from what the customer actually pays, so the bill-level discount comes
       * off before the split. See splitInclusiveTax in lib/billing-math.
       */
      const discountAmount = parseFloat(discount || 0);
      const split = splitInclusiveTax(
        billItemsToCreate.map((i) => ({ total: i.totalAmount, taxPercent: i.taxPercent })),
        discountAmount
      );
      const subtotal = split.subtotal;
      const taxTotal = split.taxTotal;
      const rawGrandTotal = Math.max(0, subtotal + taxTotal);


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

      const cleanCustName = resolveCustomerName(customerName);

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
          ...(saleTimestamp ? { createdAt: saleTimestamp } : {}),
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
          const searchName = (cleanCustName && cleanCustName !== WALK_IN_NAME)
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

      const discountAmount = discount !== undefined ? parseFloat(discount) : existingBill.discount;
      /*
       * Lines the totals are derived from: the ones being saved, or the bill's current ones when
       * the edit only touches the header. Either way the split below is the single place the
       * money is divided into net revenue and GST.
       */
      let taxableLines: { total: number; taxPercent: number }[] = existingBill.items.map((i) => ({
        total: i.totalAmount,
        taxPercent: i.taxPercent,
      }));

      // 2. If items provided, restore stock for old items first & recreate line items
      if (items && Array.isArray(items) && items.length > 0) {
        /*
         * Stock movement is settled per batch rather than per line.
         *
         * Editing a bill undoes the old lines and applies the new ones; done line by line that
         * was two database round trips per line plus one read each, so a ten-line bill spent
         * ~30 of them. Netting the movement per batch means one read for all of them and one
         * write per batch actually touched.
         */
        const restoreByBatch = new Map<string, number>();
        for (const old of existingBill.items) {
          if (!old.batchId) continue;
          restoreByBatch.set(old.batchId, (restoreByBatch.get(old.batchId) || 0) + old.quantity);
        }

        const deductByBatch = new Map<string, number>();
        for (const item of items) {
          if (!item.batchId) throw new Error('Every line must name the batch it is sold from');
          deductByBatch.set(item.batchId, (deductByBatch.get(item.batchId) || 0) + (parseFloat(item.quantity) || 0));
        }

        const involvedBatchIds = [...new Set([...restoreByBatch.keys(), ...deductByBatch.keys()])];
        const editProductIds = [...new Set(items.map((i: any) => i.productId).filter(Boolean))] as string[];
        const [batchRows, editProducts] = await Promise.all([
          tx.inventoryBatch.findMany({ where: { id: { in: involvedBatchIds } } }),
          tx.product.findMany({ where: { id: { in: editProductIds } }, select: { id: true, gstPercent: true } }),
        ]);
        const batchById = new Map(batchRows.map((b) => [b.id, b]));
        const productById = new Map(editProducts.map((p) => [p.id, p]));

        for (const [batchId, needed] of deductByBatch) {
          const batch = batchById.get(batchId);
          if (!batch) throw new Error(`Batch ${batchId} not found`);
          // What this bill previously took from the batch is available to it again.
          const available = batch.quantity + (restoreByBatch.get(batchId) || 0);
          if (available < needed) {
            throw new Error(`Insufficient stock for batch ${batch.batchNumber}. Available: ${available}, Requested: ${needed}`);
          }
        }

        for (const batchId of involvedBatchIds) {
          const delta = (restoreByBatch.get(batchId) || 0) - (deductByBatch.get(batchId) || 0);
          if (delta === 0) continue;
          await tx.inventoryBatch.update({
            where: { id: batchId },
            data: { quantity: { increment: delta } },
          });
        }

        await tx.salesBillItem.deleteMany({ where: { salesBillId: id } });

        const billItemsToCreate = [];

        for (const item of items) {
          const { productId, batchId, quantity, unitPrice, discountPercent } = item;

          // Mirror POST: the per-item discount reduces the line before tax is extracted.
          // It was stored on the row but never applied, so editing a bill restored the
          // undiscounted total.
          const lineDiscountPercent = parseFloat(discountPercent) || 0;
          const lineGross = (parseFloat(quantity) || 0) * (parseFloat(unitPrice) || 0);
          const lineDiscount = lineGross * (lineDiscountPercent / 100);
          const itemTotal = Math.max(0, lineGross - lineDiscount);

          billItemsToCreate.push({
            salesBillId: id,
            productId,
            batchId,
            quantity: parseFloat(quantity) || 1,
            unitPrice: parseFloat(unitPrice) || 0,
            discountPercent: lineDiscountPercent,
            // Same rule as POST: the rate comes off the batch, not off the request.
            taxPercent: batchTaxRate(batchById.get(batchId), productById.get(productId)),
            totalAmount: itemTotal,
          });
        }

        await tx.salesBillItem.createMany({ data: billItemsToCreate });
        taxableLines = billItemsToCreate.map((i) => ({ total: i.totalAmount, taxPercent: i.taxPercent }));
      }

      const split = splitInclusiveTax(taxableLines, discountAmount);
      const subtotal = split.subtotal;
      const taxTotal = split.taxTotal;
      const rawGrandTotal = Math.max(0, subtotal + taxTotal);
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

      const cleanCustName = customerName !== undefined
        ? resolveCustomerName(customerName)
        : resolveCustomerName(existingBill.customerName);

      /*
       * Allow the bill date to be corrected on edit. Bills are dated by createdAt, and the
       * edit form previously showed today rather than the bill's own date and discarded any
       * change — so correcting a mis-dated sale appeared to work and did nothing.
       */
      // Moves only the calendar date, keeping the bill's own time of day.
      const editTimestamp = resolveBillTimestamp(req.body.billDate, existingBill.createdAt);

      /*
       * The counter edits the name as free text and sends no customerId. Keeping the old link
       * left the bill pointing at the previous customer, so the printed memo and the customer's
       * ledger disagreed with the name on the invoice. Renaming to someone else drops the stale
       * link; a credit bill re-resolves its customer by name a few lines below.
       */
      const renamed = cleanCustName !== existingBill.customerName;
      const finalCustomerId = customerId !== undefined
        ? (customerId || null)
        : (renamed ? null : existingBill.customerId);

      // Update SalesBill header
      const updatedBill = await tx.salesBill.update({
        where: { id },
        data: {
          ...(editTimestamp ? { createdAt: editTimestamp } : {}),
          customerId: finalCustomerId,
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
          const searchName = (cleanCustName && cleanCustName !== WALK_IN_NAME)
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
