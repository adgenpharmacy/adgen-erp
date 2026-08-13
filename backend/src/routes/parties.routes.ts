import { Router, Response } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, AuthenticatedRequest, requireOwner } from '../middlewares/auth.middleware';

const router = Router();

// GET /api/parties — Fetch all suppliers with query search (q) & computed outstanding balance (amountPaid synced)
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { q } = req.query;
    const searchStr = typeof q === 'string' ? q.trim() : '';

    // Removed suppliers stay in the table so their purchase bills keep a name on them, but they
    // are out of the directory and out of the supplier picker on a new purchase entry.
    const whereClause: any = { isActive: true };
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
    // Named rather than passing req.body straight through, so a stray field in the payload
    // cannot write a column the form has no business setting.
    const { name, phone, email, address, gstNumber, dlNumber } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (phone !== undefined) data.phone = phone;
    if (email !== undefined) data.email = email;
    if (address !== undefined) data.address = address;
    if (gstNumber !== undefined) data.gstNumber = gstNumber;
    if (dlNumber !== undefined) data.dlNumber = dlNumber;

    const updated = await prisma.party.update({ where: { id }, data });
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * DELETE /api/parties/:id — Remove a supplier from the directory.
 *
 * A soft delete: purchase bills keep their supplier, the ledger keeps its history, and the row
 * simply stops appearing in the directory and in the supplier picker. A duplicate typed twice
 * previously had to stay forever.
 *
 * Refused while money is outstanding — hiding a supplier the shop still owes would remove the
 * debt from view without settling it.
 */
router.delete('/:id', authenticate, requireOwner, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const party = await prisma.party.findUnique({
      where: { id },
      include: { purchaseBills: { where: { isPaid: false }, select: { grandTotal: true, amountPaid: true } } },
    });
    if (!party) return res.status(404).json({ error: 'Supplier not found' });

    const outstanding = party.purchaseBills.reduce(
      (sum, b) => sum + (b.grandTotal - (b.amountPaid || 0)),
      0
    );
    if (outstanding > 0.01) {
      return res.status(409).json({
        error: `${party.name} still has ₹${outstanding.toFixed(2)} outstanding. Settle the balance before removing them.`,
      });
    }

    await prisma.party.update({ where: { id }, data: { isActive: false } });
    res.json({ message: 'Supplier removed from the directory' });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
