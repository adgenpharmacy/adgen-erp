import { Router, Response } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, AuthenticatedRequest } from '../middlewares/auth.middleware';

const router = Router();

// GET /api/parties — Fetch all suppliers with dynamically computed outstanding balance
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parties = await prisma.party.findMany({
      orderBy: { name: 'asc' },
      include: {
        purchaseBills: {
          where: { isPaid: false },
          select: { grandTotal: true },
        },
      },
    });

    const result = parties.map((p) => {
      const outstandingBalance = p.purchaseBills.reduce(
        (sum, bill) => sum + bill.grandTotal,
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
