import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { loginSchema, registerSchema } from '@tasknest/shared';
import { config } from '../../config.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validateBody } from '../../middleware/validate.js';
import * as auth from './auth.service.js';
import { REFRESH_COOKIE, cookieOptions, sendSession } from './session.js';

const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: config.NODE_ENV === 'test' ? 1000 : 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again in 1 minute' } }),
});

export const authRouter = Router();

authRouter.post('/auth/register', loginLimiter, validateBody(registerSchema), async (req, res) => {
  sendSession(res, await auth.register(req.body), 201);
});

authRouter.post('/auth/login', loginLimiter, validateBody(loginSchema), async (req, res) => {
  sendSession(res, await auth.login(req.body));
});

authRouter.post('/auth/refresh', async (req, res) => {
  try {
    sendSession(res, await auth.refresh(req.cookies?.[REFRESH_COOKIE]));
  } catch (err) {
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
    throw err;
  }
});

authRouter.post('/auth/logout', async (req, res) => {
  await auth.logout(req.cookies?.[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
  res.status(204).end();
});

authRouter.get('/me', authenticate, async (req, res) => {
  res.json(await auth.me(req.userId!));
});
