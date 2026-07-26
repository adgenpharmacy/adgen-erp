import { Router, Response } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, AuthenticatedRequest } from '../middlewares/auth.middleware';

const router = Router();

// GET /api/ledger — Fetch all ledger entries (amountPaid synced)
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const entries = await prisma.ledgerEntry.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        party: { select: { id: true, name: true } },
        salesBill: { select: { id: true, invoiceNumber: true, customerName: true, grandTotal: true, amountPaid: true, isSettled: true } },
        purchaseBill: { select: { id: true, invoiceNumber: true, grandTotal: true, isPaid: true } },
      },
    });

    const existingSalesBillIds = new Set(entries.map(e => e.salesBillId).filter(Boolean));
    const existingPurchaseBillIds = new Set(entries.map(e => e.purchaseBillId).filter(Boolean));

    // Fetch any credit sales bills not in ledger
    const creditSalesBills = await prisma.salesBill.findMany({
      where: {
        OR: [
          { paymentMethod: 'CREDIT' },
          { isSettled: false },
        ],
      },
      include: { customer: { select: { id: true, name: true, phone: true } } },
    });

    const syntheticSalesEntries = creditSalesBills
      .filter(b => !existingSalesBillIds.has(b.id))
      .map(b => ({
        id: `synth-sale-${b.id}`,
        partyType: 'CUSTOMER',
        customerId: b.customerId,
        partyId: null,
        transactionType: 'CREDIT',
        amount: b.grandTotal - b.amountPaid,
        description: `Unpaid Credit Sale Invoice #${b.invoiceNumber} (${b.customerName || b.customer?.name || 'Walk-in'})`,
        isSettled: b.isSettled,
        salesBillId: b.id,
        purchaseBillId: null,
        createdAt: b.createdAt,
        updatedAt: b.createdAt,
        customer: b.customer || (b.customerName ? { id: 'anon', name: b.customerName, phone: b.customerPhone || '' } : null),
        party: null,
      }));

    // Fetch any unpaid purchase bills not in ledger
    const unpaidPurchaseBills = await prisma.purchaseBill.findMany({
      where: { isPaid: false },
      include: { party: { select: { id: true, name: true } } },
    });

    const syntheticPurchaseEntries = unpaidPurchaseBills
      .filter(b => !existingPurchaseBillIds.has(b.id))
      .map(b => ({
        id: `synth-pur-${b.id}`,
        partyType: 'SUPPLIER',
        customerId: null,
        partyId: b.partyId,
        transactionType: 'DEBIT',
        amount: b.grandTotal - (b.amountPaid || 0),
        description: `Unpaid Supplier Purchase Bill #${b.invoiceNumber} (${b.party?.name || 'Supplier'})`,
        isSettled: false,
        salesBillId: null,
        purchaseBillId: b.id,
        createdAt: b.createdAt,
        updatedAt: b.createdAt,
        customer: null,
        party: b.party,
      }));

    const allEntries = [...entries, ...syntheticSalesEntries, ...syntheticPurchaseEntries].sort((a: any, b: any) => {
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
          const newAmountPaid = bill.amountPaid + parseFloat(amountPaid);
          const isSettled = newAmountPaid >= bill.grandTotal;
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
        await tx.purchaseBill.update({
          where: { id: purchaseBillId },
          data: { isPaid: true },
        });
      }
    });

    res.json({ message: 'Payment settled successfully' });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
