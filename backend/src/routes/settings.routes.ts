import { Router, Response } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, requireOwner, AuthenticatedRequest } from '../middlewares/auth.middleware';

const router = Router();
router.use(authenticate);

/** The profile is a single row; this id is fixed so there can only ever be one. */
const PROFILE_ID = 'default';

/**
 * Fields the owner may edit. Anything not listed here is ignored, so a malformed or
 * malicious body cannot write to columns that were never meant to be settable.
 */
const EDITABLE_FIELDS = [
  'name',
  'tagline',
  'addressLine',
  'city',
  'state',
  'pincode',
  'phone',
  'email',
  'gstNumber',
  'dlNumber',
  'invoiceFooter',
] as const;

/** GET /api/settings — readable by any signed-in user; invoices need it to render. */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Created on first read so a fresh deployment always has something to edit.
    const profile = await prisma.pharmacyProfile.upsert({
      where: { id: PROFILE_ID },
      update: {},
      create: { id: PROFILE_ID },
    });
    res.json(profile);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** PUT /api/settings — owner only. These values appear on every printed tax invoice. */
router.put('/', requireOwner, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data: Record<string, string | null> = {};
    for (const field of EDITABLE_FIELDS) {
      if (req.body[field] !== undefined) {
        const value = String(req.body[field] ?? '').trim();
        data[field] = value.length > 0 ? value : null;
      }
    }

    // `name` is the only field that must not be blanked — it heads every document.
    if (data.name === null) {
      return res.status(400).json({ error: 'Pharmacy name is required.' });
    }

    const profile = await prisma.pharmacyProfile.upsert({
      where: { id: PROFILE_ID },
      update: data,
      create: { id: PROFILE_ID, ...data },
    });

    res.json(profile);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
