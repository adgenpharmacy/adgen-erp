import { Router, Response } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, AuthenticatedRequest, requireOwner } from '../middlewares/auth.middleware';

const router = Router();

// GET /api/customers — Fetch all customers with query search (q) & computed credit balance (amountPaid synced)
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { q } = req.query;
    const searchStr = typeof q === 'string' ? q.trim() : '';

    const whereClause: any = {};
    if (searchStr) {
      whereClause.OR = [
        { name: { contains: searchStr, mode: 'insensitive' } },
        { phone: { contains: searchStr, mode: 'insensitive' } },
        { doctorName: { contains: searchStr, mode: 'insensitive' } },
      ];
    }

    let customers = await prisma.customer.findMany({
      where: whereClause,
      include: {
        salesBills: {
          where: { isSettled: false },
          select: { grandTotal: true, amountPaid: true },
        },
        salesReturns: {
          select: { totalReturnAmount: true, refundMethod: true },
        },
      },
    });

    if (searchStr) {
      const queryLower = searchStr.toLowerCase();
      customers = customers.sort((a, b) => {
        const aName = (a.name || '').toLowerCase();
        const bName = (b.name || '').toLowerCase();
        const aPhone = (a.phone || '').toLowerCase();
        const bPhone = (b.phone || '').toLowerCase();

        const aStartsWith = aName.startsWith(queryLower) || aPhone.startsWith(queryLower);
        const bStartsWith = bName.startsWith(queryLower) || bPhone.startsWith(queryLower);

        if (aStartsWith && !bStartsWith) return -1;
        if (!aStartsWith && bStartsWith) return 1;
        return aName.localeCompare(bName);
      });
    } else {
      customers = customers.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }

    const result = customers.map((c: any) => {
      const grossDebt = (c.salesBills || []).reduce(
        (sum: number, bill: any) => sum + ((bill.grandTotal || 0) - (bill.amountPaid || 0)),
        0
      );
      const unlinkedCreditNotes = (c.salesReturns || [])
        .filter((sr: any) => sr.refundMethod === 'CREDIT_NOTE' && !sr.salesBillId)
        .reduce((sum: number, sr: any) => sum + (sr.totalReturnAmount || 0), 0);

      const { salesBills, salesReturns, ...custData } = c;
      return {
        ...custData,
        creditBalance: Math.max(0, grossDebt - unlinkedCreditNotes),
      };
    });

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/customers — Create customer
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, phone, email, address, gstNumber, doctorName } = req.body;
    const customer = await prisma.customer.create({
      data: { name, phone, email, address, gstNumber, doctorName },
    });
    res.status(201).json(customer);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// PUT /api/customers/:id — Update customer
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    // Named rather than passing req.body straight through — same reason as suppliers.
    const { name, phone, email, address, gstNumber, doctorName } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (phone !== undefined) data.phone = phone;
    if (email !== undefined) data.email = email;
    if (address !== undefined) data.address = address;
    if (gstNumber !== undefined) data.gstNumber = gstNumber;
    if (doctorName !== undefined) data.doctorName = doctorName;

    const updated = await prisma.customer.update({ where: { id }, data });
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * DELETE /api/customers/:id — Remove a customer record.
 *
 * The Customer model has no isActive column, so unlike suppliers this cannot be softened into a
 * hide — it is a real delete. It is therefore refused outright for anyone who appears on a bill,
 * a credit note or the ledger: deleting them would detach those documents from the person they
 * were raised for. What it does allow is clearing out duplicates and mistyped entries, which is
 * the case the directory actually needed and had no answer for.
 */
router.delete('/:id', authenticate, requireOwner, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const [bills, returns, ledger] = await Promise.all([
      prisma.salesBill.count({ where: { customerId: id } }),
      prisma.salesReturn.count({ where: { customerId: id } }),
      prisma.ledgerEntry.count({ where: { customerId: id } }),
    ]);

    if (bills > 0 || returns > 0 || ledger > 0) {
      const history = [
        bills > 0 ? `${bills} bill${bills === 1 ? '' : 's'}` : null,
        returns > 0 ? `${returns} credit note${returns === 1 ? '' : 's'}` : null,
        ledger > 0 ? `${ledger} ledger entr${ledger === 1 ? 'y' : 'ies'}` : null,
      ]
        .filter(Boolean)
        .join(', ');

      return res.status(409).json({
        error:
          `${customer.name} appears on ${history} and cannot be deleted without detaching those records. ` +
          `Correct the name and details instead.`,
      });
    }

    await prisma.customer.delete({ where: { id } });
    res.json({ message: 'Customer deleted' });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
