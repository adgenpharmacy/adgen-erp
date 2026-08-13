import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma';
import { authenticate, AuthenticatedRequest, requireOwner, invalidateUserCache } from '../middlewares/auth.middleware';
import { signToken } from '../utils/jwt';

const router = Router();

// GET /api/users — Fetch all users (Owner only)
router.get('/', authenticate, requireOwner, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        designation: true,
        isActive: true,
        isApproved: true,
        createdAt: true,
      },
    });
    res.json(users);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Shape returned to the Employees screen. Never includes passwordHash. */
const STAFF_FIELDS = {
  id: true,
  name: true,
  email: true,
  role: true,
  designation: true,
  isActive: true,
  isApproved: true,
  createdAt: true,
} as const;

const MIN_PASSWORD_LENGTH = 8;

/** The rule the Add Staff form advertises. It was advertised but never enforced. */
function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

/**
 * POST /api/users/register — PUBLIC self-signup from the login screen.
 *
 * Deliberately always EMPLOYEE and always unapproved: this endpoint is unauthenticated, so
 * anything it could grant is something a stranger could grant themselves. An owner adding a
 * colleague uses POST /api/users instead, which is authenticated and creates a working account.
 */
router.post('/register', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, email, password, designation } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ error: passwordError });

    const cleanEmail = email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existing) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        name: name.trim(),
        email: cleanEmail,
        passwordHash: hashedPassword,
        role: 'EMPLOYEE',
        designation: designation || 'Pharmacist',
        isActive: true,
        isApproved: false, // Requires owner approval
      },
      select: STAFF_FIELDS,
    });

    res.json({ message: 'Registration submitted! Awaiting owner approval.', user: newUser });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/users — Owner creates a staff account that works immediately.
 *
 * The Employees screen used to post to /register, which hardcodes EMPLOYEE and leaves the
 * account unapproved. So the owner filled in the form, chose a role, pressed Save — and the
 * person appeared under Pending Approvals as an Employee regardless of what was chosen, unable
 * to sign in until approved separately. An owner adding their own staff has already made the
 * decision that approval exists to record, so it is recorded here.
 */
router.post('/', authenticate, requireOwner, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, email, password, designation, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ error: passwordError });

    const cleanEmail = email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existing) {
      return res.status(400).json({ error: 'A user with this email already exists' });
    }

    const newUser = await prisma.user.create({
      data: {
        name: name.trim(),
        email: cleanEmail,
        passwordHash: await bcrypt.hash(password, 10),
        // Honoured, unlike /register: the form has always offered this choice.
        role: role === 'OWNER' ? 'OWNER' : 'EMPLOYEE',
        designation: designation || 'Pharmacist',
        isActive: true,
        isApproved: true,
      },
      select: STAFF_FIELDS,
    });

    res.status(201).json(newUser);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/users/login — Pure database login & signed JWT token generation
router.post('/login', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Account is deactivated. Please contact pharmacy admin.' });
    }

    if (user.role === 'EMPLOYEE' && !user.isApproved) {
      return res.status(403).json({ error: 'Account pending owner approval. Please contact pharmacy admin.' });
    }

    if (!user.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Verify password strictly using bcrypt against PostgreSQL DB
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Issue signed JWT Token
    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        designation: user.designation,
        isApproved: user.isApproved,
      },
      token,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/users/:id/approve — Owner approves staff member
router.put('/:id/approve', authenticate, requireOwner, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updated = await prisma.user.update({
      where: { id },
      data: { isApproved: true, isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isApproved: true,
      },
    });
    // The authenticate middleware caches accounts briefly; drop this one so the approval is
    // effective on the staff member's very next request rather than up to 30s later.
    invalidateUserCache(id);
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * PATCH /api/users/:id — Owner edits a staff account.
 *
 * Covers everything the Employees screen could previously only achieve by deleting the account
 * and creating it again: renaming, changing designation or role, resetting a forgotten password,
 * and revoking access. Deleting to achieve any of those destroyed the person's attendance
 * history and detached every bill they had raised (see DELETE below).
 */
router.patch('/:id', authenticate, requireOwner, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, email, designation, role, isActive, isApproved, password } = req.body;

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return res.status(404).json({ error: 'Staff member not found' });

    const data: any = {};

    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) return res.status(400).json({ error: 'Name cannot be empty' });
      data.name = trimmed;
    }

    if (email !== undefined) {
      const cleanEmail = String(email).toLowerCase().trim();
      if (!cleanEmail) return res.status(400).json({ error: 'Email cannot be empty' });
      if (cleanEmail !== target.email) {
        const clash = await prisma.user.findUnique({ where: { email: cleanEmail } });
        if (clash) return res.status(400).json({ error: 'Another user already has this email' });
      }
      data.email = cleanEmail;
    }

    if (designation !== undefined) data.designation = String(designation).trim() || null;
    if (isApproved !== undefined) data.isApproved = Boolean(isApproved);

    if (password !== undefined && password !== '') {
      const passwordError = validatePassword(password);
      if (passwordError) return res.status(400).json({ error: passwordError });
      data.passwordHash = await bcrypt.hash(password, 10);
    }

    // Demoting or deactivating the last owner locks everybody out of Admin, Employees,
    // stock adjustments and every delete in the app, with no way back in through the UI.
    const losingOwner =
      (role !== undefined && role !== 'OWNER' && target.role === 'OWNER') ||
      (isActive !== undefined && !isActive && target.role === 'OWNER');

    if (losingOwner) {
      const otherOwners = await prisma.user.count({
        where: { role: 'OWNER', isActive: true, id: { not: id } },
      });
      if (otherOwners === 0) {
        return res.status(400).json({
          error: 'This is the only active owner. Promote another staff member to Owner first.',
        });
      }
    }

    if (role !== undefined) data.role = role === 'OWNER' ? 'OWNER' : 'EMPLOYEE';
    if (isActive !== undefined) data.isActive = Boolean(isActive);

    const updated = await prisma.user.update({ where: { id }, data, select: STAFF_FIELDS });

    // A role change, a revoked account or a new password must bite on the next request, not up
    // to the account cache's TTL later.
    invalidateUserCache(id);
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * DELETE /api/users/:id — Owner removes a staff account.
 *
 * This is a hard delete and it takes history with it: attendance sessions cascade away entirely,
 * and every sales bill and stock adjustment the person recorded has its author set to null. That
 * is acceptable for rejecting a signup nobody has used, and destructive for anyone who has
 * worked a shift — so an account with history is refused and pointed at deactivation instead,
 * which blocks sign-in while keeping the record of who did what.
 *
 * `?force=1` performs the delete anyway, for the rare case where the owner genuinely wants the
 * account and its history gone.
 */
router.delete('/:id', authenticate, requireOwner, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const force = req.query.force === '1' || req.query.force === 'true';

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return res.status(404).json({ error: 'Staff member not found' });

    if (id === req.user?.id) {
      return res.status(400).json({ error: 'You cannot delete your own account.' });
    }

    if (target.role === 'OWNER') {
      const otherOwners = await prisma.user.count({
        where: { role: 'OWNER', isActive: true, id: { not: id } },
      });
      if (otherOwners === 0) {
        return res.status(400).json({ error: 'This is the only active owner and cannot be deleted.' });
      }
    }

    if (!force) {
      const [bills, adjustments, shifts] = await Promise.all([
        prisma.salesBill.count({ where: { userId: id } }),
        prisma.stockAdjustment.count({ where: { userId: id } }),
        prisma.attendanceSession.count({ where: { userId: id } }),
      ]);

      if (bills > 0 || adjustments > 0 || shifts > 0) {
        const history = [
          bills > 0 ? `${bills} sales bill${bills === 1 ? '' : 's'}` : null,
          adjustments > 0 ? `${adjustments} stock adjustment${adjustments === 1 ? '' : 's'}` : null,
          shifts > 0 ? `${shifts} attendance record${shifts === 1 ? '' : 's'}` : null,
        ]
          .filter(Boolean)
          .join(', ');

        return res.status(409).json({
          error:
            `${target.name} has work on record (${history}). Deleting the account erases the attendance ` +
            `history and removes their name from those bills. Deactivate the account instead — it blocks ` +
            `sign-in and keeps the record intact.`,
          hasHistory: true,
        });
      }
    }

    await prisma.user.delete({ where: { id } });
    // Revoke immediately rather than letting a cached account survive its own deletion.
    invalidateUserCache(id);
    res.json({ message: 'Staff account deleted' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
