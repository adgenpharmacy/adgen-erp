import { Router, Response } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, AuthenticatedRequest } from '../middlewares/auth.middleware';

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
      const creditNotes = (c.salesReturns || [])
        .filter((sr: any) => sr.refundMethod === 'CREDIT_NOTE')
        .reduce((sum: number, sr: any) => sum + (sr.totalReturnAmount || 0), 0);

      const { salesBills, salesReturns, ...custData } = c;
      return {
        ...custData,
        creditBalance: Math.max(0, grossDebt - creditNotes),
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
    const updated = await prisma.customer.update({
      where: { id },
      data: req.body,
    });
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
