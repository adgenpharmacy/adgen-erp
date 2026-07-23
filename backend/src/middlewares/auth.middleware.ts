import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: 'OWNER' | 'EMPLOYEE';
  };
}

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // 1. Fetch default Owner User from PostgreSQL DB
    let user = await prisma.user.findFirst({ where: { role: 'OWNER' } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          name: 'Pharmacy Owner',
          email: 'owner@adgen.com',
          passwordHash: '$2a$10$abcdef1234567890dummyhash',
          role: 'OWNER',
        } as any,
      });
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as any,
    };

    next();
  } catch (error) {
    console.error('Authentication Error:', error);
    return res.status(500).json({ error: 'Authentication internal error' });
  }
};

export const requireOwner = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (req.user?.role !== 'OWNER') {
    return res.status(403).json({ error: 'Forbidden: Owner role required' });
  }
  next();
};
