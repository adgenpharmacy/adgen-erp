import { Router, Response } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, AuthenticatedRequest, requireOwner } from '../middlewares/auth.middleware';

const router = Router();

// GET /api/users — Fetch all users
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
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
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const newUser = await prisma.user.create({
      data: {
        firebaseUid: `uid_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        name,
        email,
        role: 'EMPLOYEE',
        designation: designation || 'Pharmacist',
        isActive: true,
        isApproved: false, // Requires owner approval
      },
    });

    res.json({ message: 'Registration submitted! Awaiting owner approval.', user: newUser });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/users/login — Verify employee login & approval status
router.post('/login', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Verify Owner Credentials
    if (email.toLowerCase() === 'owner@adgenpharmacy.com') {
      if (password !== 'owner123' && password !== 'password123') {
        return res.status(401).json({ error: 'Invalid credentials. Password incorrect for Owner account.' });
      }

      let owner = await prisma.user.findUnique({ where: { email } });
      if (!owner) {
        owner = await prisma.user.create({
          data: {
            firebaseUid: 'owner_firebase_uid_001',
            name: 'Pharmacy Owner',
            email,
            role: 'OWNER',
            isActive: true,
            isApproved: true,
          },
        });
      }
      return res.json({
        user: {
          id: owner.id,
          name: owner.name,
          email: owner.email,
          role: 'OWNER',
          isApproved: true,
        },
        token: 'owner_jwt_token_valid',
      });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'User not found. Please register first.' });
    }

    if (user.role === 'EMPLOYEE' && !user.isApproved) {
      return res.status(403).json({ error: 'Account pending owner approval. Please contact pharmacy admin.' });
    }

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isApproved: user.isApproved,
      },
      token: `token_${user.id}`,
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
    });
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
