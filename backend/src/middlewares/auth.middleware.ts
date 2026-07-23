import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';
import { verifyToken } from '../utils/jwt';

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
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access denied. Missing or invalid Authorization header.' });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access denied. Token missing.' });
    }

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (err) {
      return res.status(401).json({ error: 'Session expired or invalid token. Please log in again.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        isApproved: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'User account not found.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'User account is deactivated. Please contact admin.' });
    }

    if (user.role === 'EMPLOYEE' && !user.isApproved) {
      return res.status(403).json({ error: 'Account pending owner approval.' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    next();
  } catch (error: any) {
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
