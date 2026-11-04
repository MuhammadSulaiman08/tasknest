import type { RequestHandler } from 'express';
import { AppError } from '../lib/AppError.js';
import { verifyAccessToken } from '../lib/tokens.js';

export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue');
  try {
    req.userId = verifyAccessToken(header.slice(7));
  } catch (err) {
    const expired = (err as Error).name === 'TokenExpiredError';
    throw new AppError(401, expired ? 'TOKEN_EXPIRED' : 'UNAUTHENTICATED', 'Sign in to continue');
  }
  next();
};
