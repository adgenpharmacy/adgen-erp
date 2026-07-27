import jwt from 'jsonwebtoken';

const FALLBACK_DEV_SECRET = 'adgen-local-dev-only-do-not-use-in-production';

let warnedAboutMissingSecret = false;

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;

  if (secret && secret.trim().length >= 32) {
    return secret.trim();
  }

  // Never allow an unset/weak secret to silently sign real tokens.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'JWT_SECRET is missing or too short (min 32 chars). Refusing to start in production with an insecure signing key.'
    );
  }

  if (!warnedAboutMissingSecret) {
    warnedAboutMissingSecret = true;
    console.warn(
      '\n⚠️  JWT_SECRET is not set — using an insecure development-only key.\n' +
      '   Set a strong JWT_SECRET in backend/.env before deploying.\n' +
      '   Generate one with:  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n'
    );
  }
  return FALLBACK_DEV_SECRET;
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
