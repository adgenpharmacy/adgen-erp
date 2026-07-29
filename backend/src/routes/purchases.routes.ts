import { Router, Response } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, AuthenticatedRequest, requireOwner } from '../middlewares/auth.middleware';
import { validateCreatePurchase } from '../middlewares/validation.middleware';

const router = Router();

/**
 * Parses a batch expiry, refusing anything unusable.
 *
 * `new Date(...)` happily returns an Invalid Date for junk input, which Prisma then rejects
 * with a raw driver dump — the counter saw the whole `purchaseBill.create` payload on screen
 * and no indication of which line was at fault. A stock batch with no valid expiry must never
 * reach the database anyway: FEFO ordering depends on it.
 */
function parseExpiry(value: unknown, label: string): Date {
  const parsed = new Date(String(value ?? '').trim());
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Expiry date for "${label}" is missing or invalid. Enter it as MM/YY.`);
  }
  return parsed;
}

// GET /api/purchases — Fetch all purchase bills
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const bills = await prisma.purchaseBill.findMany({
      orderBy: [{ purchaseDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        party: true,
        items: {
          include: {
            product: { select: { name: true, genericName: true, hsnCode: true, gstPercent: true, packSize: true, packUnit: true, contentUnit: true } },
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
    const count = await prisma.purchaseBill.count();
    const nextInvoiceNumber = `PUR-${String(count + 1).padStart(6, '0')}`;
    res.json({ nextInvoiceNumber });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/purchases — Create Purchase Bill & Auto-Generate Inventory Batches
router.post('/', authenticate, validateCreatePurchase, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { invoiceNumber, partyId, purchaseDate, isPaid, items, discount, isRoundOff, roundOffAmount } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Purchase bill must contain at least one item' });
    }

    /*
     * Load every product up front, outside the transaction.
     *
     * The loops below used to call findUnique per line — twice, once for the bill item and
     * again for the stock batch — so a 70-line bill opened 140 sequential round trips inside
     * an interactive transaction. Against Supabase's pooler that runs past Prisma's 5s limit,
     * the transaction closes mid-flight, and the next write fails with "Transaction not found".
     */
    const productIds = [...new Set(items.map((i: { productId: string }) => i.productId))];
    const productList = await prisma.product.findMany({ where: { id: { in: productIds } } });
    const productMap = new Map(productList.map((p) => [p.id, p]));

    const purchaseResult = await prisma.$transaction(async (tx) => {
      let subtotal = 0;
      let taxTotal = 0;
      const billItemsToCreate = [];

      for (const item of items) {
        const { productId, batchNumber, expiryDate, quantity, freeQuantity, purchaseRate, mrp, discountPercent, taxPercent, gstPercent } = item;

        const prod = productMap.get(productId);
        if (!prod) throw new Error(`Product ${productId} not found`);

        // Fall back to the product's configured GST rate rather than an arbitrary constant,
        // so a bill's totals stay identical when it is later edited via PUT.
        const parsedTax = taxPercent !== undefined && taxPercent !== null
          ? parseFloat(taxPercent)
          : (gstPercent !== undefined && gstPercent !== null ? parseFloat(gstPercent) : (prod.gstPercent ?? 0));

        const lineGross = (parseFloat(quantity) || 0) * (parseFloat(purchaseRate) || 0);
        const lineDisc = lineGross * ((parseFloat(discountPercent) || 0) / 100);
        const lineNet = Math.max(0, lineGross - lineDisc);
        const lineTax = lineNet * (parsedTax / 100);

        subtotal += lineNet;
        taxTotal += lineTax;

        billItemsToCreate.push({
          productId,
          batchNumber,
          expiryDate: parseExpiry(expiryDate, prod.name),
          quantity: parseFloat(quantity),
          freeQuantity: parseFloat(freeQuantity || 0),
          purchaseRate: parseFloat(purchaseRate),
          mrp: parseFloat(mrp),
          discountPercent: parseFloat(discountPercent) || 0,
          taxPercent: parsedTax,
          totalAmount: lineNet + lineTax,
        });
      }

      // Bill-level (scheme) discount and round-off, mirroring how SalesBill computes its total
      // so a purchase memo's arithmetic is reproducible from its stored columns.
      const discountAmount = Math.max(0, parseFloat(discount) || 0);
      const rawGrandTotal = Math.max(0, (subtotal + taxTotal) - discountAmount);

      const shouldRound = isRoundOff === undefined ? true : Boolean(isRoundOff);
      let grandTotal = rawGrandTotal;
      let computedRoundOff = 0;
      if (shouldRound) {
        grandTotal = Math.round(rawGrandTotal);
        computedRoundOff = Math.round((grandTotal - rawGrandTotal) * 100) / 100;
      } else if (roundOffAmount !== undefined) {
        computedRoundOff = parseFloat(roundOffAmount) || 0;
        grandTotal = rawGrandTotal + computedRoundOff;
      }

      let finalInvoiceNum = (invoiceNumber || '').trim();
      if (!finalInvoiceNum) {
        const lastBill = await tx.purchaseBill.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { invoiceNumber: true },
        });
        let nextNum = 1;
        if (lastBill?.invoiceNumber) {
          const match = lastBill.invoiceNumber.match(/\d+/);
          if (match) nextNum = parseInt(match[0], 10) + 1;
        }
        finalInvoiceNum = `PUR-${String(nextNum).padStart(6, '0')}`;
      }

      // 1. Create PurchaseBill
      const bill = await tx.purchaseBill.create({
        data: {
          invoiceNumber: finalInvoiceNum,
          partyId,
          purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
          subtotal,
          taxTotal,
          discount: discountAmount,
          grandTotal,
          isPaid: Boolean(isPaid),
          isRoundOff: shouldRound,
          roundOffAmount: computedRoundOff,
          amountPaid: Boolean(isPaid) ? grandTotal : 0,
          items: {
            create: billItemsToCreate,
          },
        },
        include: {
          items: true,
          party: true,
        },
      });

      // 2. Auto-create/Ingest into InventoryBatch linked with purchaseBillId (Deduplicate matching batchNumber)
      for (const item of items) {
        const { productId, batchNumber, expiryDate, quantity, freeQuantity, mrp, purchaseRate } = item;
        const prod = productMap.get(productId);
        const packSize = prod?.packSize || 1;
        const totalPacks = parseFloat(quantity) + parseFloat(freeQuantity || 0);
        const totalContentUnits = totalPacks * packSize;

        /*
         * Match on expiry as well as batch number.
         *
         * Suppliers here are inconsistent about batch numbers — many lines carry the
         * distributor's name ("ANILA", "MEDIHUB") rather than a real batch code, so the same
         * label recurs across deliveries with different expiries. Matching on the label alone
         * merged those into one row and then overwrote its expiry with the newest delivery's,
         * which both destroys the earlier expiry date and breaks FEFO: stock expiring sooner
         * becomes invisible and is dispensed last.
         *
         * The month is the granularity that matters — a batch is stamped MM/YY — and it is the
         * same key rebuild-inventory groups by, so stock and the bills cannot drift apart.
         */
        const parsedExpiry = parseExpiry(expiryDate, prod?.name ?? batchNumber);
        const monthStart = new Date(Date.UTC(parsedExpiry.getUTCFullYear(), parsedExpiry.getUTCMonth(), 1));
        const nextMonth = new Date(Date.UTC(parsedExpiry.getUTCFullYear(), parsedExpiry.getUTCMonth() + 1, 1));

        const existingBatch = await tx.inventoryBatch.findFirst({
          where: {
            productId,
            batchNumber,
            expiryDate: { gte: monthStart, lt: nextMonth },
          },
        });

        if (existingBatch) {
          await tx.inventoryBatch.update({
            where: { id: existingBatch.id },
            data: {
              quantity: { increment: totalContentUnits },
              mrp: parseFloat(mrp),
              purchaseRate: parseFloat(purchaseRate),
            },
          });
        } else {
          await tx.inventoryBatch.create({
            data: {
              productId,
              batchNumber,
              expiryDate: parseExpiry(expiryDate, prod?.name ?? batchNumber),
              quantity: totalContentUnits,
              mrp: parseFloat(mrp),
              purchaseRate: parseFloat(purchaseRate),
              purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
              purchaseBillId: bill.id,
            },
          });
        }
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
            description: `Purchase Bill #${finalInvoiceNum}`,
            isSettled: false,
          },
        });
      }

      return bill;
    }, {
      // A long bill does many sequential writes; Prisma's 5s default closes the transaction
      // mid-flight and the next statement fails with "Transaction not found".
      timeout: 30000,
      maxWait: 15000,
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
    const { invoiceNumber, partyId, purchaseDate, isPaid, notes, items, discount, isRoundOff, roundOffAmount } = req.body;

    // Prefetched outside the transaction for the same reason as the create path: per-line
    // lookups inside an interactive transaction blow past Prisma's time limit on a long bill.
    const editProductIds: string[] = [...new Set(((items ?? []) as { productId: string }[]).map((i) => i.productId))];
    const editProductList = await prisma.product.findMany({ where: { id: { in: editProductIds } } });
    const productMap = new Map(editProductList.map((p) => [p.id, p]));

    const updated = await prisma.$transaction(async (tx) => {
      const existingBill = await tx.purchaseBill.findUnique({
        where: { id },
        include: { items: true, batches: true },
      });

      if (!existingBill) throw new Error('Purchase bill not found');

      let subtotal = existingBill.subtotal;
      let taxTotal = existingBill.taxTotal;

      // Update bill items and inventory batches if items provided
      if (items && Array.isArray(items) && items.length > 0) {
        await tx.purchaseBillItem.deleteMany({ where: { purchaseBillId: id } });

        subtotal = 0;
        taxTotal = 0;
        const billItemsToCreate = [];

        const existingBatches = await tx.inventoryBatch.findMany({
          where: { purchaseBillId: id },
        });

        for (const item of items) {
          const { productId, batchNumber, expiryDate, quantity, freeQuantity, purchaseRate, mrp, discountPercent, taxPercent, gstPercent } = item;
          const prodForTax = productMap.get(productId);
          const parsedTax = taxPercent !== undefined && taxPercent !== null
            ? parseFloat(taxPercent)
            : (gstPercent !== undefined && gstPercent !== null ? parseFloat(gstPercent) : (prodForTax?.gstPercent ?? 0));

          const lineGross = (parseFloat(quantity) || 1) * (parseFloat(purchaseRate) || 0);
          const lineDisc = lineGross * ((parseFloat(discountPercent) || 0) / 100);
          const lineNet = Math.max(0, lineGross - lineDisc);
          const lineTax = lineNet * (parsedTax / 100);

          subtotal += lineNet;
          taxTotal += lineTax;

          billItemsToCreate.push({
            purchaseBillId: id,
            productId,
            batchNumber: batchNumber || 'DEF-001',
            expiryDate: expiryDate ? parseExpiry(expiryDate, prodForTax?.name ?? batchNumber) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            quantity: parseFloat(quantity) || 1,
            freeQuantity: parseFloat(freeQuantity) || 0,
            purchaseRate: parseFloat(purchaseRate) || 0,
            mrp: parseFloat(mrp) || 0,
            discountPercent: parseFloat(discountPercent) || 0,
            taxPercent: parsedTax,
            totalAmount: lineNet + lineTax,
          });

          // Sync InventoryBatch
          const prod = productMap.get(productId);
          const packSize = prod?.packSize || 1;
          const totalPacks = (parseFloat(quantity) || 1) + (parseFloat(freeQuantity) || 0);
          const newQty = totalPacks * packSize;

          // Same expiry-aware matching as the create path, so editing a bill cannot merge two
          // different-expiry batches that were correctly kept apart when it was first saved.
          const editExpiry = expiryDate ? parseExpiry(expiryDate, prodForTax?.name ?? batchNumber) : null;
          const sameMonth = (a: Date, b: Date) =>
            a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
          const matchBatch = existingBatches.find(
            (b) =>
              b.productId === productId &&
              b.batchNumber === batchNumber &&
              (editExpiry ? sameMonth(b.expiryDate, editExpiry) : true)
          );
          if (matchBatch) {
            const oldItem = existingBill.items.find(i => i.productId === productId && i.batchNumber === batchNumber);
            const oldPacks = oldItem ? (oldItem.quantity + (oldItem.freeQuantity || 0)) : 0;
            const oldContentUnits = oldPacks * packSize;
            const deltaQty = newQty - oldContentUnits;
            const updatedBatchQty = Math.max(0, matchBatch.quantity + deltaQty);

            await tx.inventoryBatch.update({
              where: { id: matchBatch.id },
              data: {
                quantity: updatedBatchQty,
                mrp: parseFloat(mrp) || matchBatch.mrp,
                purchaseRate: parseFloat(purchaseRate) || matchBatch.purchaseRate,
                expiryDate: expiryDate ? parseExpiry(expiryDate, prod?.name ?? batchNumber) : matchBatch.expiryDate,
              },
            });
          } else {
            await tx.inventoryBatch.create({
              data: {
                productId,
                batchNumber: batchNumber || 'DEF-001',
                expiryDate: expiryDate ? parseExpiry(expiryDate, prod?.name ?? batchNumber) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                quantity: newQty,
                mrp: parseFloat(mrp) || 0,
                purchaseRate: parseFloat(purchaseRate) || 0,
                purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
                purchaseBillId: id,
              },
            });
          }
        }

        await tx.purchaseBillItem.createMany({ data: billItemsToCreate });
      }

      // Same bill-level discount / round-off treatment as POST, so an edit cannot silently
      // change a bill's total just because the client omitted a field.
      const discountAmount = discount !== undefined
        ? Math.max(0, parseFloat(discount) || 0)
        : existingBill.discount;
      const rawGrandTotal = Math.max(0, (subtotal + taxTotal) - discountAmount);

      const shouldRound = isRoundOff !== undefined ? Boolean(isRoundOff) : existingBill.isRoundOff;
      let grandTotal = rawGrandTotal;
      let computedRoundOff = 0;
      if (shouldRound) {
        grandTotal = Math.round(rawGrandTotal);
        computedRoundOff = Math.round((grandTotal - rawGrandTotal) * 100) / 100;
      } else if (roundOffAmount !== undefined) {
        computedRoundOff = parseFloat(roundOffAmount) || 0;
        grandTotal = rawGrandTotal + computedRoundOff;
      }
      const finalPartyId = partyId || existingBill.partyId;
      const finalInvoiceNumber = invoiceNumber || existingBill.invoiceNumber;
      const finalIsPaid = isPaid !== undefined ? Boolean(isPaid) : existingBill.isPaid;

      // Update purchase bill header
      const bill = await tx.purchaseBill.update({
        where: { id },
        data: {
          invoiceNumber: finalInvoiceNumber,
          partyId: finalPartyId,
          isPaid: finalIsPaid,
          purchaseDate: purchaseDate ? new Date(purchaseDate) : existingBill.purchaseDate,
          subtotal,
          taxTotal,
          discount: discountAmount,
          grandTotal,
          isRoundOff: shouldRound,
          roundOffAmount: computedRoundOff,
          // Keep amountPaid consistent with the paid flag, so supplier balances and the
          // ledger's settle maths agree with what the bill claims.
          amountPaid: finalIsPaid ? grandTotal : Math.min(existingBill.amountPaid, grandTotal),
          notes: notes !== undefined ? notes : existingBill.notes,
        },
      });

      // Synchronize Supplier Ledger Entries
      await tx.ledgerEntry.deleteMany({ where: { purchaseBillId: id } });

      if (!finalIsPaid) {
        await tx.ledgerEntry.create({
          data: {
            partyType: 'SUPPLIER',
            partyId: finalPartyId,
            transactionType: 'DEBIT',
            amount: grandTotal,
            purchaseBillId: id,
            description: `Purchase Bill #${finalInvoiceNumber}`,
            isSettled: false,
          },
        });
      }

      return tx.purchaseBill.findUnique({
        where: { id },
        include: { party: true, items: true },
      });
    }, {
      // A long bill does many sequential writes; Prisma's 5s default closes the transaction
      // mid-flight and the next statement fails with "Transaction not found".
      timeout: 30000,
      maxWait: 15000,
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
      const bill = await tx.purchaseBill.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!bill) throw new Error('Purchase bill not found');

      // Check if stock from this purchase bill has already been sold
      const batches = await tx.inventoryBatch.findMany({
        where: { purchaseBillId: id },
        include: { salesBillItems: true },
      });

      const hasSoldStock = batches.some((b) => b.salesBillItems.length > 0);
      if (hasSoldStock) {
        throw new Error('Cannot delete purchase bill: stock from this bill has already been sold in customer sales.');
      }

      // Reverse exactly the quantity this bill contributed. A batch number can be topped up by
      // several bills, so deleting every batch row tied to this bill would wipe out stock that
      // other bills (or manual corrections) added.
      for (const item of bill.items) {
        const prod = await tx.product.findUnique({ where: { id: item.productId } });
        const packSize = prod?.packSize || 1;
        const contributedUnits = (item.quantity + (item.freeQuantity || 0)) * packSize;

        const batch = await tx.inventoryBatch.findFirst({
          where: { productId: item.productId, batchNumber: item.batchNumber },
          include: { salesBillItems: { select: { id: true } } },
        });
        if (!batch) continue;

        // A batch topped up by this bill may also carry stock sold from an earlier bill.
        if (batch.salesBillItems.length > 0) {
          throw new Error(
            `Cannot delete purchase bill: batch ${batch.batchNumber} has already been sold in customer sales.`
          );
        }

        const remaining = Math.max(0, batch.quantity - contributedUnits);

        if (remaining === 0 && batch.purchaseBillId === id) {
          await tx.inventoryBatch.delete({ where: { id: batch.id } });
        } else {
          await tx.inventoryBatch.update({
            where: { id: batch.id },
            data: { quantity: remaining },
          });
        }
      }

      // Detach any remaining batch rows so the bill can be removed without FK errors
      await tx.inventoryBatch.updateMany({
        where: { purchaseBillId: id },
        data: { purchaseBillId: null },
      });

      // Delete linked ledger entries
      await tx.ledgerEntry.deleteMany({
        where: { purchaseBillId: id },
      });

      // Delete purchase bill (items cascade delete)
      await tx.purchaseBill.delete({ where: { id } });
    }, {
      // A long bill does many sequential writes; Prisma's 5s default closes the transaction
      // mid-flight and the next statement fails with "Transaction not found".
      timeout: 30000,
      maxWait: 15000,
    });

    res.json({ message: 'Purchase bill, batches, and ledger entries deleted successfully' });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
