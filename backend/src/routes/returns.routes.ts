import { Router, Response } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, AuthenticatedRequest, requireOwner } from '../middlewares/auth.middleware';
import { nextSeriesNumber } from '../lib/billing-math';

const router = Router();
router.use(authenticate);

/*
 * Return numbers used to be `SR-`/`PR-` plus the last six digits of Date.now(). Those six digits
 * are milliseconds within a ~16 minute 40 second window, so the counter repeats roughly three
 * times an hour: two credit notes raised months apart routinely carried the same number. A debit
 * or credit note is an accounting document that gets quoted back by suppliers and auditors, so
 * duplicates are not survivable.
 *
 * Same rule as the sales and purchase invoice series: derive from the highest already issued,
 * which neither reuses a number after a deletion nor breaks on a backdated document.
 */
const SALES_RETURN_PREFIX = 'SR-';
const PURCHASE_RETURN_PREFIX = 'PR-';

async function nextReturnNumber(
  tx: { findMany: (args: any) => Promise<{ returnNumber: string }[]> },
  prefix: string
): Promise<string> {
  const issued = await tx.findMany({
    where: { returnNumber: { startsWith: prefix } },
    select: { returnNumber: true },
  });
  return nextSeriesNumber(issued.map((r) => r.returnNumber), prefix);
}

// ==========================================
// 1. SALES RETURNS (CREDIT NOTES)
// ==========================================

// GET /api/returns/sales
router.get('/sales', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const returns = await prisma.salesReturn.findMany({
      include: {
        salesBill: { select: { id: true, invoiceNumber: true, customerName: true, grandTotal: true, createdAt: true } },
        customer: { select: { id: true, name: true, phone: true } },
        // SalesReturnItem keeps productId as a plain column with no relation, so the medicine
        // name is resolved from the catalogue the client already holds.
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

/**
 * GET /api/returns/sales/returnable/:salesBillId
 *
 * What is still returnable on an invoice, line by line: what was sold, what earlier credit notes
 * already took back, and the balance. The counter used to retype the medicine, batch and price
 * by hand and only discovered an over-return when the save was rejected — the arithmetic that
 * decides the limit lives on the server, so it is the server that answers what the limit is.
 */
router.get('/sales/returnable/:salesBillId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { salesBillId } = req.params;

    const bill = await prisma.salesBill.findUnique({
      where: { id: salesBillId },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        items: {
          include: {
            product: { select: { name: true, packSize: true, packUnit: true, contentUnit: true } },
            batch: { select: { batchNumber: true, expiryDate: true } },
          },
        },
      },
    });

    if (!bill) return res.status(404).json({ error: 'Sales bill not found' });

    const priorReturns = await prisma.salesReturn.findMany({
      where: { salesBillId },
      include: { items: true },
    });

    const alreadyReturned = new Map<string, number>();
    for (const ret of priorReturns) {
      for (const ri of ret.items) {
        alreadyReturned.set(ri.productId, (alreadyReturned.get(ri.productId) || 0) + ri.quantity);
      }
    }

    // The balance is tracked per product, matching how the create route validates it.
    const remainingByProduct = new Map<string, number>();
    for (const item of bill.items) {
      const sold = remainingByProduct.get(item.productId) ?? 0;
      remainingByProduct.set(item.productId, sold + item.quantity);
    }
    for (const [productId, returned] of alreadyReturned) {
      remainingByProduct.set(productId, Math.max(0, (remainingByProduct.get(productId) ?? 0) - returned));
    }

    const seen = new Set<string>();
    const lines = bill.items.map((item) => {
      // A product appearing on two lines shares one balance; attribute it to the first line.
      const remaining = seen.has(item.productId) ? 0 : remainingByProduct.get(item.productId) ?? 0;
      seen.add(item.productId);

      return {
        productId: item.productId,
        productName: item.product?.name ?? 'Medicine',
        packSize: item.product?.packSize ?? 1,
        packUnit: item.product?.packUnit ?? 'Strip',
        contentUnit: item.product?.contentUnit ?? 'Tablet',
        batchNumber: item.batch?.batchNumber ?? null,
        expiryDate: item.batch?.expiryDate ?? null,
        soldQuantity: item.quantity,
        alreadyReturned: alreadyReturned.get(item.productId) ?? 0,
        returnableQuantity: Math.min(remaining, item.quantity),
        unitPrice: item.unitPrice,
        discountPercent: item.discountPercent,
        taxPercent: item.taxPercent,
      };
    });

    res.json({
      salesBillId: bill.id,
      invoiceNumber: bill.invoiceNumber,
      createdAt: bill.createdAt,
      customerId: bill.customerId,
      customerName: bill.customerName ?? bill.customer?.name ?? null,
      customerPhone: bill.customerPhone ?? bill.customer?.phone ?? null,
      grandTotal: bill.grandTotal,
      lines,
    });
  } catch (error: any) {
    console.error('Error reading returnable sales lines:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/returns/sales
router.post('/sales', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { salesBillId, customerId, refundMethod, notes, items, discount } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one return item is required' });
    }

    /*
     * Deduction withheld from the refund — opened packaging, a restocking fee, a part credit
     * agreed at the counter. Stored separately from the line values so the credit note still
     * shows what the goods were worth and what was actually handed back, and capped at the
     * gross so a refund can never go negative.
     */
    const grossReturnAmount = items.reduce((sum: number, item: any) => {
      return sum + (parseFloat(item.quantity || 1) * parseFloat(item.unitPrice || 0));
    }, 0);
    const deduction = Math.min(Math.max(0, parseFloat(discount) || 0), grossReturnAmount);
    const totalReturnAmount = grossReturnAmount - deduction;

    const salesReturn = await prisma.$transaction(async (tx) => {
      // Validate return item quantities if linked to a sales bill
      if (salesBillId) {
        const originalBill = await tx.salesBill.findUnique({
          where: { id: salesBillId },
          include: { items: true },
        });
        if (originalBill) {
          // Account for everything already returned against this invoice, otherwise the same
          // line can be returned repeatedly — each time restocking and issuing a fresh credit note.
          const priorReturns = await tx.salesReturn.findMany({
            where: { salesBillId },
            include: { items: true },
          });

          const alreadyReturned = new Map<string, number>();
          for (const ret of priorReturns) {
            for (const ri of ret.items) {
              alreadyReturned.set(ri.productId, (alreadyReturned.get(ri.productId) || 0) + ri.quantity);
            }
          }

          for (const retItem of items) {
            const soldQty = originalBill.items
              .filter((i: any) => i.productId === retItem.productId)
              .reduce((sum: number, i: any) => sum + i.quantity, 0);

            if (soldQty === 0) {
              throw new Error(`Product ${retItem.productId} was not sold on invoice ${originalBill.invoiceNumber}`);
            }

            const prior = alreadyReturned.get(retItem.productId) || 0;
            const remaining = soldQty - prior;

            if (parseFloat(retItem.quantity) > remaining) {
              throw new Error(
                `Return quantity (${retItem.quantity}) exceeds the returnable balance (${remaining}) for this item on invoice ${originalBill.invoiceNumber}. Sold: ${soldQty}, already returned: ${prior}.`
              );
            }
          }
        }
      }

      // Inside the transaction, so the number is derived against the same snapshot it is written to.
      const returnNumber = await nextReturnNumber(tx.salesReturn, SALES_RETURN_PREFIX);

      const record = await tx.salesReturn.create({
        data: {
          returnNumber,
          salesBillId: salesBillId || null,
          customerId: customerId || null,
          discount: deduction,
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

      /*
       * Put RESTOCK items back on the shelf.
       *
       * This used to be wrapped in `if (batch)`: when the batch number did not match anything
       * the credit note was still issued and the goods simply never returned to stock. The
       * customer got their refund and the medicine vanished from inventory. A batch is created
       * when none matches, so a restock can never be silently dropped.
       */
      for (const item of items) {
        if (item.condition !== 'RESTOCK' || !item.productId) continue;
        const qty = parseFloat(item.quantity) || 0;
        if (qty <= 0) continue;

        const batchNumber = (item.batchNumber || '').trim() || 'DEFAULT';

        const batch = await tx.inventoryBatch.findFirst({
          where: { productId: item.productId, batchNumber },
        });

        if (batch) {
          // Atomic increment rather than read-then-write, so two returns of the same batch
          // landing together cannot overwrite each other's result.
          await tx.inventoryBatch.update({
            where: { id: batch.id },
            data: { quantity: { increment: qty } },
          });
          continue;
        }

        // Model the new batch on the product's existing stock so its expiry and rates are
        // realistic rather than invented.
        const template = await tx.inventoryBatch.findFirst({
          where: { productId: item.productId },
          orderBy: { expiryDate: 'desc' },
        });

        await tx.inventoryBatch.create({
          data: {
            productId: item.productId,
            batchNumber,
            expiryDate: template?.expiryDate ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            quantity: qty,
            mrp: template?.mrp ?? (parseFloat(item.unitPrice) || 0),
            purchaseRate: template?.purchaseRate ?? 0,
          },
        });
      }

      // Create Ledger entry for Credit Note (Reduces Customer Debt)
      if (customerId) {
        await tx.ledgerEntry.create({
          data: {
            partyType: 'CUSTOMER',
            customerId,
            transactionType: 'DEBIT',
            amount: totalReturnAmount,
            salesBillId: salesBillId || null,
            paymentMethod: refundMethod || 'CREDIT_NOTE',
            description: `Sales Return Credit Note ${returnNumber}`,
            isSettled: true,
          },
        });

        // Apply credit note to linked sales bill if present
        if (salesBillId) {
          const bill = await tx.salesBill.findUnique({ where: { id: salesBillId } });
          if (bill) {
            const newAmountPaid = Math.min(bill.grandTotal, bill.amountPaid + totalReturnAmount);
            await tx.salesBill.update({
              where: { id: salesBillId },
              data: {
                amountPaid: newAmountPaid,
                isSettled: newAmountPaid >= bill.grandTotal - 0.01,
              },
            });
          }
        }
      }

      return record;
    }, {
      // Same reason as purchases: a long bill exceeds Prisma's 5s interactive-transaction
      // limit, the transaction closes, and the next write fails with "Transaction not found".
      timeout: 30000,
      maxWait: 15000,
    });

    console.log(`[ERP] Sales Return created: ${salesReturn.returnNumber} (₹${totalReturnAmount})`);
    res.status(201).json(salesReturn);
  } catch (error: any) {
    /*
     * A refused return is nearly always a business rule speaking — more returned than sold,
     * stock already gone — not a server fault. It was answered with a bare 500 and "Failed to
     * process sales return", so the counter saw a crash instead of the reason and the operator
     * had no idea what to change.
     */
    console.error('Error creating sales return:', error);
    res.status(400).json({ error: error?.message || 'Failed to process sales return' });
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
        purchaseBill: { select: { id: true, invoiceNumber: true, purchaseDate: true, grandTotal: true, party: { select: { id: true, name: true } } } },
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

/**
 * GET /api/returns/purchases/returnable/:purchaseBillId
 *
 * The supplier bill's lines with the batch, expiry and rate they were received at, and how much
 * of each is still on the shelf. Returning goods to a distributor means naming the exact batch —
 * that is what they check against — and it was being typed from memory.
 */
router.get('/purchases/returnable/:purchaseBillId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { purchaseBillId } = req.params;

    const bill = await prisma.purchaseBill.findUnique({
      where: { id: purchaseBillId },
      include: {
        party: { select: { id: true, name: true } },
        items: { include: { product: { select: { name: true, packSize: true, packUnit: true } } } },
      },
    });

    if (!bill) return res.status(404).json({ error: 'Purchase bill not found' });

    const priorReturns = await prisma.purchaseReturn.findMany({
      where: { purchaseBillId },
      include: { items: true },
    });

    const alreadyReturned = new Map<string, number>();
    for (const ret of priorReturns) {
      for (const ri of ret.items) {
        alreadyReturned.set(ri.productId, (alreadyReturned.get(ri.productId) || 0) + ri.quantity);
      }
    }

    // Stock actually on hand for the batch, so a return cannot be raised for goods already sold.
    const batches = await prisma.inventoryBatch.findMany({
      where: { productId: { in: bill.items.map((i) => i.productId) } },
      select: { productId: true, batchNumber: true, expiryDate: true, quantity: true },
    });

    const lines = bill.items.map((item) => {
      const packSize = item.product?.packSize ?? 1;
      const receivedUnits = (item.quantity + (item.freeQuantity || 0)) * packSize;
      const returned = alreadyReturned.get(item.productId) ?? 0;

      const batch = batches.find(
        (b) => b.productId === item.productId && b.batchNumber.trim().toUpperCase() === (item.batchNumber || '').trim().toUpperCase()
      );
      const onHand = batch?.quantity ?? 0;
      const daysToExpiry = item.expiryDate
        ? Math.ceil((new Date(item.expiryDate).getTime() - Date.now()) / (1000 * 3600 * 24))
        : null;

      return {
        productId: item.productId,
        productName: item.product?.name ?? 'Medicine',
        packSize,
        packUnit: item.product?.packUnit ?? 'Strip',
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
        daysToExpiry,
        isExpired: daysToExpiry !== null && daysToExpiry < 0,
        purchaseRate: item.purchaseRate,
        taxPercent: item.taxPercent,
        receivedUnits,
        alreadyReturned: returned,
        onHandUnits: onHand,
        // Cannot send back more than was received, nor more than is still on the shelf.
        returnableUnits: Math.max(0, Math.min(receivedUnits - returned, onHand)),
      };
    });

    res.json({
      purchaseBillId: bill.id,
      invoiceNumber: bill.invoiceNumber,
      purchaseDate: bill.purchaseDate,
      partyId: bill.partyId,
      partyName: bill.party?.name ?? null,
      grandTotal: bill.grandTotal,
      lines,
    });
  } catch (error: any) {
    console.error('Error reading returnable purchase lines:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/returns/purchases/expired
 *
 * Expired and near-expiry stock, grouped by batch, with the supplier bill each batch came from.
 * This is the usual reason a pharmacy raises a debit note, and it starts from "what is expiring"
 * rather than "which invoice was it on" — nobody remembers that.
 */
router.get('/purchases/expired', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const withinDays = parseInt(String(req.query.withinDays ?? '30'), 10);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + (Number.isFinite(withinDays) ? withinDays : 30));

    const batches = await prisma.inventoryBatch.findMany({
      where: { quantity: { gt: 0 }, expiryDate: { lte: cutoff } },
      orderBy: { expiryDate: 'asc' },
      include: {
        product: { select: { id: true, name: true, packSize: true, packUnit: true } },
        purchaseBill: { select: { id: true, invoiceNumber: true, partyId: true, party: { select: { id: true, name: true } } } },
      },
    });

    res.json(
      batches.map((b) => ({
        batchId: b.id,
        productId: b.productId,
        productName: b.product?.name ?? 'Medicine',
        packSize: b.product?.packSize ?? 1,
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate,
        daysToExpiry: Math.ceil((new Date(b.expiryDate).getTime() - Date.now()) / (1000 * 3600 * 24)),
        quantity: b.quantity,
        purchaseRate: b.purchaseRate,
        taxPercent: b.taxPercent,
        purchaseBillId: b.purchaseBillId,
        invoiceNumber: b.purchaseBill?.invoiceNumber ?? null,
        partyId: b.purchaseBill?.partyId ?? null,
        partyName: b.purchaseBill?.party?.name ?? null,
      }))
    );
  } catch (error: any) {
    console.error('Error reading expired stock:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/returns/purchases
router.post('/purchases', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { purchaseBillId, partyId, refundMethod, notes, items, discount } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one return item is required' });
    }

    // Deduction the supplier applies to the debit note; the stored total is net of it.
    const grossReturnAmount = items.reduce((sum: number, item: any) => {
      return sum + (parseFloat(item.quantity || 1) * parseFloat(item.purchaseRate || 0));
    }, 0);
    const deduction = Math.min(Math.max(0, parseFloat(discount) || 0), grossReturnAmount);
    const totalReturnAmount = grossReturnAmount - deduction;

    const purchaseReturn = await prisma.$transaction(async (tx) => {
      // Validate purchase return quantities if linked to a purchase bill
      if (purchaseBillId) {
        const originalBill = await tx.purchaseBill.findUnique({
          where: { id: purchaseBillId },
          include: { items: true },
        });
        if (originalBill) {
          for (const retItem of items) {
            const purItem = originalBill.items.find((i: any) => i.productId === retItem.productId);
            if (purItem) {
              const prod = await tx.product.findUnique({ where: { id: retItem.productId } });
              const packSize = prod?.packSize || 1;
              const totalPurchasedUnits = (purItem.quantity + (purItem.freeQuantity || 0)) * packSize;
              if (parseFloat(retItem.quantity) > totalPurchasedUnits) {
                throw new Error(`Purchase return quantity (${retItem.quantity}) cannot exceed total purchased units (${totalPurchasedUnits})`);
              }
            }
          }
        }
      }

      const returnNumber = await nextReturnNumber(tx.purchaseReturn, PURCHASE_RETURN_PREFIX);

      const record = await tx.purchaseReturn.create({
        data: {
          returnNumber,
          purchaseBillId: purchaseBillId || null,
          partyId: partyId || null,
          discount: deduction,
          totalReturnAmount,
          refundMethod: refundMethod || 'DEBIT_NOTE',
          notes,
          items: {
            create: items.map((item: any) => ({
              productId: item.productId,
              batchNumber: item.batchNumber || null,
              // Kept on the line so the debit note names the exact batch and expiry going back.
              expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
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
            continue;
          }

          /*
           * No batch carries that number. Previously the debit note was still issued and
           * nothing left stock, so goods sent back to the supplier stayed on the books and
           * inventory drifted upward. Take the quantity from the product's other batches,
           * shortest-dated first, and refuse the return outright if the stock is not there.
           */
          let outstanding = parseFloat(item.quantity) || 0;
          const fallback = await tx.inventoryBatch.findMany({
            where: { productId: item.productId, quantity: { gt: 0 } },
            orderBy: { expiryDate: 'asc' },
          });
          const onHand = fallback.reduce((s, b) => s + b.quantity, 0);

          if (onHand < outstanding) {
            const prod = await tx.product.findUnique({
              where: { id: item.productId },
              select: { name: true },
            });
            throw new Error(
              `Cannot return ${outstanding} of ${prod?.name ?? item.productId} to the supplier: ` +
                `only ${onHand} in stock, and no batch numbered "${item.batchNumber}" exists.`
            );
          }

          for (const b of fallback) {
            if (outstanding <= 0) break;
            const take = Math.min(outstanding, b.quantity);
            await tx.inventoryBatch.update({
              where: { id: b.id },
              data: { quantity: { decrement: take } },
            });
            outstanding -= take;
          }
        }
      }

      // Create Ledger entry for Supplier Debit Note (Reduces Supplier Debt)
      if (partyId) {
        await tx.ledgerEntry.create({
          data: {
            partyType: 'SUPPLIER',
            partyId,
            transactionType: 'CREDIT',
            amount: totalReturnAmount,
            purchaseBillId: purchaseBillId || null,
            paymentMethod: refundMethod || 'DEBIT_NOTE',
            description: `Purchase Return Debit Note ${returnNumber}`,
            isSettled: true,
          },
        });

        // Apply debit note to linked purchase bill if present
        if (purchaseBillId) {
          const bill = await tx.purchaseBill.findUnique({ where: { id: purchaseBillId } });
          if (bill) {
            const currentPaid = bill.amountPaid || 0;
            const newAmountPaid = Math.min(bill.grandTotal, currentPaid + totalReturnAmount);
            await tx.purchaseBill.update({
              where: { id: purchaseBillId },
              data: {
                amountPaid: newAmountPaid,
                isPaid: newAmountPaid >= bill.grandTotal - 0.01,
              },
            });
          }
        }
      }

      return record;
    }, {
      // Same reason as purchases: a long bill exceeds Prisma's 5s interactive-transaction
      // limit, the transaction closes, and the next write fails with "Transaction not found".
      timeout: 30000,
      maxWait: 15000,
    });

    console.log(`[ERP] Purchase Return created: ${purchaseReturn.returnNumber} (₹${totalReturnAmount})`);
    res.status(201).json(purchaseReturn);
  } catch (error: any) {
    // Same as sales returns: the message explains what is wrong, so it must reach the screen.
    console.error('Error creating purchase return:', error);
    res.status(400).json({ error: error?.message || 'Failed to process purchase return' });
  }
});

// ==========================================
// 3. CANCELLING A RETURN
// ==========================================

/*
 * Returns were create-only. A credit note raised against the wrong invoice, for the wrong
 * medicine, or simply twice by a double-click could not be withdrawn from the app at all: the
 * stock was already back on the shelf, the refund already on the customer's ledger, and the only
 * remedy was editing the database by hand.
 *
 * Cancelling undoes precisely what raising it did, in reverse, using the amounts stored on the
 * record rather than recomputing them — so a rate or MRP that has changed since cannot make the
 * reversal disagree with the entry it is reversing.
 *
 * Owner-only, in line with deleting a sale or a purchase bill.
 */

/** The batch a return line moved stock through: the one it named, else the shortest-dated. */
async function findReturnBatch(tx: any, productId: string, batchNumber: string | null | undefined) {
  const label = (batchNumber || '').trim() || 'DEFAULT';
  const named = await tx.inventoryBatch.findFirst({ where: { productId, batchNumber: label } });
  if (named) return named;
  return tx.inventoryBatch.findFirst({ where: { productId }, orderBy: { expiryDate: 'asc' } });
}

// DELETE /api/returns/sales/:id — Cancel a credit note: pull the restocked goods back off the
// shelf, undo the refund on the ledger and on the invoice it was applied to.
router.delete('/sales/:id', requireOwner, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.$transaction(async (tx) => {
      const record = await tx.salesReturn.findUnique({ where: { id }, include: { items: true } });
      if (!record) throw new Error('Credit note not found');

      // 1. Remove the stock the return put back. DAMAGED lines never reached the shelf.
      for (const item of record.items) {
        if (item.condition !== 'RESTOCK') continue;
        const qty = item.quantity || 0;
        if (qty <= 0) continue;

        const batch = await findReturnBatch(tx, item.productId, item.batchNumber);
        const product = await tx.product.findUnique({
          where: { id: item.productId },
          select: { name: true },
        });

        if (!batch || batch.quantity < qty) {
          throw new Error(
            `Cannot cancel ${record.returnNumber}: ${qty} of ${product?.name ?? item.productId} was put back ` +
              `by this credit note but only ${batch?.quantity ?? 0} remains in stock — it has since been sold. ` +
              `Reverse that sale first.`
          );
        }

        await tx.inventoryBatch.update({
          where: { id: batch.id },
          data: { quantity: { decrement: qty } },
        });
      }

      /*
       * 2. Undo the credit on the customer's ledger.
       *
       * Matched on the description the create path writes, narrowed by the customer, the bill and
       * the amount. The description alone is not safe to match on: a return number is
       * `SR-` plus the last six digits of the millisecond clock, which repeats about every
       * seventeen minutes, so two credit notes months apart can carry the same number.
       */
      await tx.ledgerEntry.deleteMany({
        where: {
          description: `Sales Return Credit Note ${record.returnNumber}`,
          customerId: record.customerId,
          salesBillId: record.salesBillId,
          amount: record.totalReturnAmount,
        },
      });

      // 3. Undo the credit applied to the invoice, so the customer owes it again.
      if (record.salesBillId) {
        const bill = await tx.salesBill.findUnique({ where: { id: record.salesBillId } });
        if (bill) {
          const restored = Math.max(0, bill.amountPaid - record.totalReturnAmount);
          await tx.salesBill.update({
            where: { id: record.salesBillId },
            data: { amountPaid: restored, isSettled: restored >= bill.grandTotal - 0.01 },
          });
        }
      }

      // 4. Remove the record (lines cascade).
      await tx.salesReturn.delete({ where: { id } });
    }, { timeout: 30000, maxWait: 15000 });

    res.json({ message: 'Credit note cancelled, stock and balances reversed' });
  } catch (error: any) {
    console.error('Error cancelling sales return:', error);
    res.status(400).json({ error: error?.message || 'Failed to cancel credit note' });
  }
});

// DELETE /api/returns/purchases/:id — Cancel a debit note: put the goods sent back to the
// supplier onto the shelf again and restore what was owed.
router.delete('/purchases/:id', requireOwner, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.$transaction(async (tx) => {
      const record = await tx.purchaseReturn.findUnique({ where: { id }, include: { items: true } });
      if (!record) throw new Error('Debit note not found');

      // 1. Return the stock to the shelf. A debit note may have drawn its quantity from several
      //    batches when no batch carried the number written on it; the goods come back to the
      //    named batch, or to the shortest-dated one, which is where FEFO would have taken them.
      for (const item of record.items) {
        const qty = item.quantity || 0;
        if (qty <= 0) continue;

        const batch = await findReturnBatch(tx, item.productId, item.batchNumber);

        if (batch) {
          await tx.inventoryBatch.update({
            where: { id: batch.id },
            data: { quantity: { increment: qty } },
          });
          continue;
        }

        // Every batch of this product is gone. Recreate one so the goods are not lost, dated
        // from the line itself where the debit note recorded an expiry.
        await tx.inventoryBatch.create({
          data: {
            productId: item.productId,
            batchNumber: (item.batchNumber || '').trim() || 'DEFAULT',
            expiryDate: item.expiryDate ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            quantity: qty,
            mrp: 0,
            purchaseRate: item.purchaseRate || 0,
          },
        });
      }

      // 2. Undo the credit on the supplier's ledger, narrowed the same way as a credit note —
      //    see the note there on why the return number alone is not a safe match.
      await tx.ledgerEntry.deleteMany({
        where: {
          description: `Purchase Return Debit Note ${record.returnNumber}`,
          partyId: record.partyId,
          purchaseBillId: record.purchaseBillId,
          amount: record.totalReturnAmount,
        },
      });

      // 3. Restore what was owed on the supplier bill.
      if (record.purchaseBillId) {
        const bill = await tx.purchaseBill.findUnique({ where: { id: record.purchaseBillId } });
        if (bill) {
          const restored = Math.max(0, (bill.amountPaid || 0) - record.totalReturnAmount);
          await tx.purchaseBill.update({
            where: { id: record.purchaseBillId },
            data: { amountPaid: restored, isPaid: restored >= bill.grandTotal - 0.01 },
          });
        }
      }

      await tx.purchaseReturn.delete({ where: { id } });
    }, { timeout: 30000, maxWait: 15000 });

    res.json({ message: 'Debit note cancelled, stock and balances reversed' });
  } catch (error: any) {
    console.error('Error cancelling purchase return:', error);
    res.status(400).json({ error: error?.message || 'Failed to cancel debit note' });
  }
});

export default router;
