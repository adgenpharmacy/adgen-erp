import { Router, Response } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, AuthenticatedRequest } from '../middlewares/auth.middleware';

const router = Router();

// GET /api/parties — Fetch all suppliers with query search (q) & computed outstanding balance (amountPaid synced)
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { q } = req.query;
    const searchStr = typeof q === 'string' ? q.trim() : '';

    const whereClause: any = {};
    if (searchStr) {
      whereClause.OR = [
        { name: { contains: searchStr, mode: 'insensitive' } },
        { phone: { contains: searchStr, mode: 'insensitive' } },
        { gstNumber: { contains: searchStr, mode: 'insensitive' } },
      ];
    }

    let parties = await prisma.party.findMany({
      where: whereClause,
      include: {
        purchaseBills: {
          where: { isPaid: false },
          select: { grandTotal: true, amountPaid: true },
        },
      },
    });

    if (searchStr) {
      const queryLower = searchStr.toLowerCase();
      parties = parties.sort((a, b) => {
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
      parties = parties.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }

    const result = parties.map((p) => {
      const outstandingBalance = p.purchaseBills.reduce(
        (sum, bill) => sum + (bill.grandTotal - (bill.amountPaid || 0)),
        0
      );
      const { purchaseBills, ...partyData } = p;
      return {
        ...partyData,
        outstandingBalance,
      };
    });

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/parties — Create supplier
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, phone, email, address, gstNumber, dlNumber } = req.body;
    const party = await prisma.party.create({
      data: { name, phone, email, address, gstNumber, dlNumber },
    });
    res.status(201).json(party);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// PUT /api/parties/:id — Update supplier
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updated = await prisma.party.update({
      where: { id },
      data: req.body,
    });
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
