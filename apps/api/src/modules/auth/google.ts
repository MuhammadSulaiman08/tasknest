import crypto from 'node:crypto';
import { Router } from 'express';
import { config, googleEnabled, isProd } from '../../config.js';
import { db } from '../../db/index.js';
import { AppError } from '../../lib/AppError.js';
import { logger } from '../../lib/logger.js';
import { issueSession, toPublicUser } from './auth.service.js';
import { sendSession } from './session.js';

/**
 * Google sign-in (OAuth 2.0 authorization-code flow), switched on by GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET.
 * The browser starts at <WEB_ORIGIN>/api/v1/auth/google (proxied by Next.js), so the refresh cookie
 * set on the callback is first-party for the web app.
 */
const STATE_COOKIE = 'tn_oauth_state';
const redirectUri = () => `${config.WEB_ORIGIN}/api/v1/auth/google/callback`;

export const googleRouter = Router();

googleRouter.get('/auth/providers', (_req, res) => {
  res.json({ google: googleEnabled });
});

googleRouter.get('/auth/google', (req, res) => {
  if (!googleEnabled) throw new AppError(404, 'PROVIDER_DISABLED', 'Google sign-in is not configured');
  const state = crypto.randomBytes(16).toString('base64url');
  const next = typeof req.query.next === 'string' && req.query.next.startsWith('/') && !req.query.next.startsWith('//') ? req.query.next : '';
  res.cookie(STATE_COOKIE, `${state}|${next}`, { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/api/v1/auth/google', maxAge: 10 * 60_000 });
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: config.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  }).toString();
  res.redirect(url.toString());
});

googleRouter.get('/auth/google/callback', async (req, res) => {
  const fail = (reason: string) => res.redirect(`${config.WEB_ORIGIN}/login?error=${encodeURIComponent(reason)}`);
  if (!googleEnabled) return fail('Google sign-in is not configured');
  const [savedState, next] = String(req.cookies?.[STATE_COOKIE] ?? '').split('|');
  res.clearCookie(STATE_COOKIE, { path: '/api/v1/auth/google' });
  if (!savedState || savedState !== req.query.state || typeof req.query.code !== 'string') return fail('Google sign-in was cancelled or expired, please try again');

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: req.query.code,
        client_id: config.GOOGLE_CLIENT_ID!,
        client_secret: config.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri(),
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) throw new Error(`token exchange failed: ${tokenRes.status}`);
    const { access_token } = (await tokenRes.json()) as { access_token: string };
    const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${access_token}` } });
    if (!infoRes.ok) throw new Error(`userinfo failed: ${infoRes.status}`);
    const info = (await infoRes.json()) as { sub: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
    if (!info.email || !info.email_verified) return fail('Your Google account email is not verified');

    // Find by Google id, else link to an existing account with the same verified email, else create one
    const email = info.email.toLowerCase();
    let user = await db.selectFrom('users').selectAll().where('google_id', '=', info.sub).where('deleted_at', 'is', null).executeTakeFirst();
    if (!user) {
      user = await db.selectFrom('users').selectAll().where('email', '=', email).where('deleted_at', 'is', null).executeTakeFirst();
      if (user) {
        await db.updateTable('users').set({ google_id: info.sub, avatar_url: user.avatar_url ?? info.picture ?? null }).where('id', '=', user.id).execute();
      } else {
        user = await db
          .insertInto('users')
          .values({ email, full_name: (info.name || email.split('@')[0]).slice(0, 120), google_id: info.sub, avatar_url: info.picture ?? null })
          .returningAll()
          .executeTakeFirstOrThrow();
      }
    }
    if (!user.is_active) return fail('This account is disabled');
    await db.updateTable('users').set({ last_login_at: new Date() }).where('id', '=', user.id).execute();
    const session = await issueSession(toPublicUser(user));
    sendSession(res, session, 302, false);
    res.redirect(`${config.WEB_ORIGIN}/login?sso=1${next ? `&next=${encodeURIComponent(next)}` : ''}`);
  } catch (err) {
    logger.error({ err }, 'google sign-in failed');
    fail('Google sign-in failed, please try again');
  }
});
