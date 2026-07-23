import { Request, Response, NextFunction } from 'express';
import { firebaseAuth } from '../config/firebase';
import { prisma } from '../config/prisma';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    firebaseUid: string;
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
      if (process.env.NODE_ENV === 'development' && process.env.ALLOW_DEV_AUTH_BYPASS !== 'false') {
        let devUser = await prisma.user.findFirst({ where: { role: 'OWNER' } });
        if (!devUser) {
          devUser = await prisma.user.create({
            data: {
              firebaseUid: 'dev_owner_uid',
              name: 'Owner Admin',
              email: 'owner@adgenpharmacy.com',
              role: 'OWNER',
            },
          });
        }
        req.user = {
          id: devUser.id,
          firebaseUid: devUser.firebaseUid,
          email: devUser.email,
          name: devUser.name,
          role: devUser.role,
        };
        return next();
      }
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid authorization token' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await firebaseAuth.verifyIdToken(token);

    // Sync or fetch user record in PostgreSQL
    let user = await prisma.user.findUnique({
      where: { firebaseUid: decodedToken.uid },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          firebaseUid: decodedToken.uid,
          email: decodedToken.email || '',
          name: decodedToken.name || decodedToken.email?.split('@')[0] || 'Staff User',
          role: decodedToken.email?.includes('owner') ? 'OWNER' : 'EMPLOYEE',
        },
      });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Forbidden: Account is inactive' });
    }

    req.user = {
      id: user.id,
      firebaseUid: user.firebaseUid,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    next();
  } catch (error) {
    console.error('Authentication Error:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid Firebase token' });
  }
};

export const requireOwner = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (req.user?.role !== 'OWNER') {
    return res.status(403).json({ error: 'Forbidden: Owner permission required' });
  }
  next();
};
