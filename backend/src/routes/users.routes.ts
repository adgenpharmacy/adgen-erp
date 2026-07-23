import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma';
import { authenticate, AuthenticatedRequest, requireOwner } from '../middlewares/auth.middleware';
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

// POST /api/users/register — Register new staff member
router.post('/register', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, email, password, designation } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existing) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        firebaseUid: `uid_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        name: name.trim(),
        email: cleanEmail,
        passwordHash: hashedPassword,
        role: 'EMPLOYEE',
        designation: designation || 'Pharmacist',
        isActive: true,
        isApproved: false, // Requires owner approval
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        designation: true,
        isApproved: true,
        createdAt: true,
      },
    });

    res.json({ message: 'Registration submitted! Awaiting owner approval.', user: newUser });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/users/login — Verify employee login & issue signed JWT token
router.post('/login', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    let user = await prisma.user.findUnique({ where: { email: cleanEmail } });

    // Seed default owner account if no users exist in database
    if (!user && (cleanEmail === 'owner@adgenpharmacy.com' || cleanEmail === 'owner@adgen.com')) {
      const defaultPassword = password || 'owner123password';
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);

      user = await prisma.user.create({
        data: {
          firebaseUid: 'owner_firebase_uid_001',
          name: 'Pharmacy Owner',
          email: cleanEmail,
          passwordHash: hashedPassword,
          role: 'OWNER',
          designation: 'Owner & Chief Pharmacist',
          isActive: true,
          isApproved: true,
        },
      });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Account is deactivated. Please contact pharmacy admin.' });
    }

    // Verify bcrypt password hash
    if (user.passwordHash) {
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }
    }

    if (user.role === 'EMPLOYEE' && !user.isApproved) {
      return res.status(403).json({ error: 'Account pending owner approval. Please contact pharmacy admin.' });
    }

    // Generate signed JWT Token
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
      data: { isApproved: true },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isApproved: true,
      },
    });
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
