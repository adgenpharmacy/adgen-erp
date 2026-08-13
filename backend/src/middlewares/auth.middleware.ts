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

interface AccountRecord {
  id: string;
  email: string;
  name: string;
  role: 'OWNER' | 'EMPLOYEE';
  isActive: boolean;
  isApproved: boolean;
}

/**
 * Short-lived account cache.
 *
 * Every authenticated request used to spend a full database round trip re-reading the same
 * user row before doing any work. Against a remote Postgres that round trip is ~700ms, so it
 * was the single largest fixed cost on every screen — a dashboard load fans out to eight
 * endpoints and paid it eight times.
 *
 * The trade-off is that a deactivation, deletion or role change takes up to TTL to be felt by
 * an already-issued token, so the routes that change those call `invalidateUserCache`.
 */
const USER_CACHE_TTL_MS = 30_000;
const userCache = new Map<string, { account: AccountRecord | null; expiresAt: number }>();

export const invalidateUserCache = (userId?: string) => {
  if (userId) userCache.delete(userId);
  else userCache.clear();
};

const loadAccount = async (userId: string): Promise<AccountRecord | null> => {
  const cached = userCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.account;

  const account = (await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      isApproved: true,
    },
  })) as AccountRecord | null;

  userCache.set(userId, { account, expiresAt: Date.now() + USER_CACHE_TTL_MS });
  return account;
};

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

    const user = await loadAccount(decoded.userId);

    if (!user) {
      return res.status(401).json({ error: 'User account not found.' });
    }

    /*
     * `code` distinguishes "this account no longer has access" from "this account may not do
     * this particular thing" (requireOwner, below, which is also a 403). The client ends the
     * session on the former only — without the distinction it could not tell them apart, so a
     * revoked staff member kept a session that failed on every screen with no explanation, while
     * logging out on every 403 would sign an ordinary employee out for clicking an owner action.
     */
    if (!user.isActive) {
      return res.status(403).json({
        error: 'This account has been disabled. Contact the pharmacy owner.',
        code: 'ACCOUNT_REVOKED',
      });
    }

    if (user.role === 'EMPLOYEE' && !user.isApproved) {
      return res.status(403).json({
        error: 'Account pending owner approval.',
        code: 'ACCOUNT_REVOKED',
      });
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
