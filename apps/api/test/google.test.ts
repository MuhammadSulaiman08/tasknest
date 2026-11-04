import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db/index.js';
import { api, bearer, resetDb, signUp } from './helpers.js';

beforeEach(resetDb);
afterEach(() => vi.restoreAllMocks());
afterAll(() => db.destroy());

/** Mocks Google's token and userinfo endpoints for the callback. */
function mockGoogle(info: Record<string, unknown>) {
  const real = globalThis.fetch;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.startsWith('https://oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'goog-at' }), { status: 200 });
    if (url.startsWith('https://openidconnect.googleapis.com/v1/userinfo')) return new Response(JSON.stringify(info), { status: 200 });
    return real(input, init);
  });
}

async function start(next = '') {
  const res = await api().get(`/api/v1/auth/google${next ? `?next=${encodeURIComponent(next)}` : ''}`).expect(302);
  const location = new URL(res.headers.location);
  const stateCookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('tn_oauth_state='))!.split(';')[0];
  return { location, state: location.searchParams.get('state')!, stateCookie };
}

describe('Google sign-in', () => {
  it('advertises the provider and redirects to Google with the right parameters', async () => {
    expect((await api().get('/api/v1/auth/providers').expect(200)).body).toEqual({ google: true });
    const { location, state } = await start();
    expect(location.origin + location.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(location.searchParams.get('client_id')).toBe('test-client-id.apps.googleusercontent.com');
    expect(location.searchParams.get('redirect_uri')).toBe('http://localhost:3000/api/v1/auth/google/callback');
    expect(location.searchParams.get('scope')).toBe('openid email profile');
    expect(state).toHaveLength(22);
  });

  it('creates an account on first sign-in, sets the refresh cookie and returns to the app', async () => {
    mockGoogle({ sub: 'g-123', email: 'New.User@gmail.com', email_verified: true, name: 'New User' });
    const { state, stateCookie } = await start('/w/acme');
    const res = await api().get(`/api/v1/auth/google/callback?code=abc&state=${state}`).set('Cookie', stateCookie).expect(302);
    expect(res.headers.location).toBe('http://localhost:3000/login?sso=1&next=%2Fw%2Facme');
    const refresh = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('tn_refresh='))!.split(';')[0];
    const session = await api().post('/api/v1/auth/refresh').set('Cookie', refresh).expect(200);
    expect(session.body.user).toMatchObject({ email: 'new.user@gmail.com', fullName: 'New User' });
    const me = await api().get('/api/v1/me').set(bearer(session.body.accessToken)).expect(200);
    expect(me.body.user.email).toBe('new.user@gmail.com');
  });

  it('links to an existing account with the same verified email', async () => {
    const existing = await signUp({ email: 'ayesha@gmail.com', fullName: 'Ayesha Khan' });
    mockGoogle({ sub: 'g-ayesha', email: 'ayesha@gmail.com', email_verified: true, name: 'Ayesha K' });
    const { state, stateCookie } = await start();
    const res = await api().get(`/api/v1/auth/google/callback?code=abc&state=${state}`).set('Cookie', stateCookie).expect(302);
    const refresh = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('tn_refresh='))!.split(';')[0];
    const session = await api().post('/api/v1/auth/refresh').set('Cookie', refresh).expect(200);
    expect(session.body.user.id).toBe(existing.user.id);
    expect(session.body.user.fullName).toBe('Ayesha Khan'); // existing name kept
  });

  it('rejects a mismatched state (CSRF protection) and unverified emails', async () => {
    const { stateCookie } = await start();
    const bad = await api().get('/api/v1/auth/google/callback?code=abc&state=forged').set('Cookie', stateCookie).expect(302);
    expect(bad.headers.location).toMatch(/\/login\?error=/);

    mockGoogle({ sub: 'g-x', email: 'x@gmail.com', email_verified: false });
    const s = await start();
    const unverified = await api().get(`/api/v1/auth/google/callback?code=abc&state=${s.state}`).set('Cookie', s.stateCookie).expect(302);
    expect(decodeURIComponent(unverified.headers.location)).toMatch(/not verified/);
    expect(await db.selectFrom('users').select('id').where('email', '=', 'x@gmail.com').executeTakeFirst()).toBeUndefined();
  });
});
