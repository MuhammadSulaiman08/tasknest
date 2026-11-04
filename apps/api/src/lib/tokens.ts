import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 30;

export function signAccessToken(userId: string): string {
  return jwt.sign({}, config.JWT_SECRET, {
    algorithm: 'HS256',
    subject: userId,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): string {
  const payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] });
  if (typeof payload === 'string' || !payload.sub) throw new Error('Invalid token payload');
  return payload.sub;
}

/** 256-bit random token, URL-safe */
export const randomToken = () => crypto.randomBytes(32).toString('base64url');

/** Only hashes of tokens are stored in the database */
export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
