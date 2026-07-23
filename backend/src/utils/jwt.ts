import jwt from 'jsonwebtoken';

const getJwtSecret = (): string => {
  return process.env.JWT_SECRET || 'adgen_pharmacy_erp_jwt_secret_key_2026';
};

const JWT_EXPIRES_IN = '7d';

export interface TokenPayload {
  userId: string;
  email: string;
  role: 'OWNER' | 'EMPLOYEE';
}

export const signToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRES_IN });
};

export const verifyToken = (token: string): TokenPayload => {
  return jwt.verify(token, getJwtSecret()) as TokenPayload;
};
