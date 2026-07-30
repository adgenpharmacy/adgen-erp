import { Router, Response } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, AuthenticatedRequest } from '../middlewares/auth.middleware';

const router = Router();

// GET /api/ledger — Fetch all ledger entries (amountPaid synced)
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    /*
     * The three reads are independent — the cross-referencing below happens in memory — so they
     * go out together. Run one after another they cost three separate database round trips,
     * which made this the slowest endpoint on the dashboard's opening fan-out.
     */
    const [entries, creditSalesBills, unpaidPurchaseBills] = await Promise.all([
      prisma.ledgerEntry.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          party: { select: { id: true, name: true } },
          salesBill: { select: { id: true, invoiceNumber: true, customerName: true, grandTotal: true, amountPaid: true, isSettled: true } },
          purchaseBill: { select: { id: true, invoiceNumber: true, grandTotal: true, isPaid: true } },
        },
      }),
      // Credit sales bills that may need a stand-in ledger row.
      prisma.salesBill.findMany({
        where: {
          OR: [
            { paymentMethod: 'CREDIT' },
            { isSettled: false },
          ],
        },
        include: { customer: { select: { id: true, name: true, phone: true } } },
      }),
      // Unpaid purchase bills that may need a stand-in ledger row.
      prisma.purchaseBill.findMany({
        where: { isPaid: false },
        include: { party: { select: { id: true, name: true } } },
      }),
    ]);

    // A ledger row keeps the amount that was originally owed. Once a payment is recorded against
    // the linked bill that row no longer reflects reality, so expose the live outstanding balance
    // alongside it — the synthetic rows below already reported outstanding, and the two disagreed.
    const entriesWithOutstanding = entries.map((e) => {
      let outstandingAmount = e.amount;

      if (e.salesBill) {
        outstandingAmount = Math.max(0, e.salesBill.grandTotal - (e.salesBill.amountPaid || 0));
      } else if (e.purchaseBill) {
        outstandingAmount = e.purchaseBill.isPaid ? 0 : e.amount;
      } else if (e.isSettled) {
        outstandingAmount = 0;
      }

      return { ...e, outstandingAmount };
    });

    const existingSalesBillIds = new Set(entries.map(e => e.salesBillId).filter(Boolean));
    const existingPurchaseBillIds = new Set(entries.map(e => e.purchaseBillId).filter(Boolean));

    const syntheticSalesEntries = creditSalesBills
      // Only stand in for bills that still owe something. A fully-paid credit sale was previously
      // still listed as an "Unpaid Credit Sale" while simultaneously being flagged Settled.
      .filter(b => !existingSalesBillIds.has(b.id) && b.grandTotal - (b.amountPaid || 0) > 0.01)
      .map(b => ({
        id: `synth-sale-${b.id}`,
        partyType: 'CUSTOMER',
        customerId: b.customerId,
        partyId: null,
        transactionType: 'CREDIT',
        amount: b.grandTotal - b.amountPaid,
        outstandingAmount: Math.max(0, b.grandTotal - b.amountPaid),
        description: `Unpaid Credit Sale Invoice #${b.invoiceNumber} (${b.customerName || b.customer?.name || 'Walk-in'})`,
        isSettled: false,
        salesBillId: b.id,
        purchaseBillId: null,
        createdAt: b.createdAt,
        updatedAt: b.createdAt,
        customer: b.customer || (b.customerName ? { id: 'anon', name: b.customerName, phone: b.customerPhone || '' } : null),
        party: null,
      }));

    const syntheticPurchaseEntries = unpaidPurchaseBills
      .filter(b => !existingPurchaseBillIds.has(b.id))
      .map(b => ({
        id: `synth-pur-${b.id}`,
        partyType: 'SUPPLIER',
        customerId: null,
        partyId: b.partyId,
        transactionType: 'DEBIT',
        amount: b.grandTotal - (b.amountPaid || 0),
        outstandingAmount: Math.max(0, b.grandTotal - (b.amountPaid || 0)),
        description: `Unpaid Supplier Purchase Bill #${b.invoiceNumber} (${b.party?.name || 'Supplier'})`,
        isSettled: false,
        salesBillId: null,
        purchaseBillId: b.id,
        createdAt: b.createdAt,
        updatedAt: b.createdAt,
        customer: null,
        party: b.party,
      }));

    const allEntries = [...entriesWithOutstanding, ...syntheticSalesEntries, ...syntheticPurchaseEntries].sort((a: any, b: any) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    res.json(allEntries);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/ledger/payment — Record customer or supplier debt repayment
router.post('/payment', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { type, customerId, partyId, amount, notes } = req.body;
    const paymentAmount = parseFloat(amount);

    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({ error: 'Valid payment amount is required' });
    }

    const entry = await prisma.$transaction(async (tx) => {
      // 1. Create Ledger entry for payment
      const ledgerRecord = await tx.ledgerEntry.create({
        data: {
          partyType: type === 'CUSTOMER' ? 'CUSTOMER' : 'SUPPLIER',
          customerId: type === 'CUSTOMER' ? customerId : null,
          partyId: type === 'PARTY' || type === 'SUPPLIER' ? partyId : null,
          transactionType: type === 'CUSTOMER' ? 'DEBIT' : 'CREDIT',
          amount: paymentAmount,
          description: notes || `Debt Repayment Settlement (${type})`,
          isSettled: true,
        },
      });

      // 2. If Customer payment, apply funds to open sales bills sequentially
      if (type === 'CUSTOMER' && customerId) {
        let remainingFunds = paymentAmount;
        const openBills = await tx.salesBill.findMany({
          where: { customerId, isSettled: false },
          orderBy: { createdAt: 'asc' },
        });

        for (const bill of openBills) {
          if (remainingFunds <= 0) break;
          const due = bill.grandTotal - bill.amountPaid;
          const payForBill = Math.min(due, remainingFunds);
          const newAmountPaid = bill.amountPaid + payForBill;
          const isSettled = newAmountPaid >= bill.grandTotal;

          await tx.salesBill.update({
            where: { id: bill.id },
            data: {
              amountPaid: newAmountPaid,
              isSettled,
            },
          });

          remainingFunds -= payForBill;
        }
      }

      // 3. If Supplier payment, mark open purchase bills as paid sequentially with partial payment support
      if ((type === 'PARTY' || type === 'SUPPLIER') && partyId) {
        let remainingFunds = paymentAmount;
        const openBills = await tx.purchaseBill.findMany({
          where: { partyId, isPaid: false },
          orderBy: { createdAt: 'asc' },
        });

        for (const bill of openBills) {
          if (remainingFunds <= 0) break;
          const currentPaid = bill.amountPaid || 0;
          const remainingBillDebt = bill.grandTotal - currentPaid;
          const payForBill = Math.min(remainingFunds, remainingBillDebt);
          const newAmountPaid = currentPaid + payForBill;
          const isPaid = newAmountPaid >= bill.grandTotal - 0.01;

          await tx.purchaseBill.update({
            where: { id: bill.id },
            data: {
              amountPaid: newAmountPaid,
              isPaid,
            },
          });

          remainingFunds -= payForBill;
        }
      }

      return ledgerRecord;
    });

    res.status(201).json(entry);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/ledger/settle — Settle a customer or supplier bill payment
router.post('/settle', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { ledgerId, salesBillId, purchaseBillId, paymentMethod, amountPaid } = req.body;

    await prisma.$transaction(async (tx) => {
      // 1. Mark ledger entry as settled
      if (ledgerId) {
        await tx.ledgerEntry.update({
          where: { id: ledgerId },
          data: { isSettled: true },
        });
      }

      // 2. Update Sales Bill if customer payment
      if (salesBillId) {
        const bill = await tx.salesBill.findUnique({ where: { id: salesBillId } });
        if (bill) {
          const due = Math.max(0, bill.grandTotal - bill.amountPaid);
          const payVal = parseFloat(amountPaid);
          const actualPay = !isNaN(payVal) && payVal > 0 ? Math.min(due, payVal) : due;
          const newAmountPaid = Math.min(bill.grandTotal, bill.amountPaid + actualPay);
          const isSettled = newAmountPaid >= bill.grandTotal - 0.01;
          await tx.salesBill.update({
            where: { id: salesBillId },
            data: {
              amountPaid: newAmountPaid,
              isSettled,
            },
          });
        }
      }

      // 3. Update Purchase Bill if supplier payment
      if (purchaseBillId) {
        const bill = await tx.purchaseBill.findUnique({ where: { id: purchaseBillId } });
        if (bill) {
          const currentPaid = bill.amountPaid || 0;
          const due = Math.max(0, bill.grandTotal - currentPaid);
          const payVal = parseFloat(amountPaid);
          const actualPay = !isNaN(payVal) && payVal > 0 ? Math.min(due, payVal) : due;
          const newAmountPaid = Math.min(bill.grandTotal, currentPaid + actualPay);
          const isPaid = newAmountPaid >= bill.grandTotal - 0.01;
          await tx.purchaseBill.update({
            where: { id: purchaseBillId },
            data: {
              amountPaid: newAmountPaid,
              isPaid,
            },
          });
        }
      }
    });

    res.json({ message: 'Payment settled successfully' });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
