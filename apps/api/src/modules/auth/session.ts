import type { CookieOptions, Response } from 'express';
import { config, isProd } from '../../config.js';
import { REFRESH_TOKEN_TTL_DAYS } from '../../lib/tokens.js';
import type { Session } from './auth.service.js';

export const REFRESH_COOKIE = 'tn_refresh';

export const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  path: '/api/v1/auth',
  domain: config.COOKIE_DOMAIN,
};

/** Sets the refresh cookie; by default also sends { accessToken, user } as JSON. */
export function sendSession(res: Response, session: Session, status = 200, json = true) {
  res.cookie(REFRESH_COOKIE, session.refreshToken, { ...cookieOptions, maxAge: REFRESH_TOKEN_TTL_DAYS * 864e5 });
  if (json) res.status(status).json({ accessToken: session.accessToken, user: session.user });
}
