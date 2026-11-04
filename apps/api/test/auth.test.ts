import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/index.js';
import { api, bearer, resetDb, signUp } from './helpers.js';

beforeEach(resetDb);
afterAll(() => db.destroy());

describe('POST /auth/register', () => {
  it('creates an account, returns an access token and sets an HttpOnly refresh cookie', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ fullName: '  Ayesha  ', email: 'Ayesha@Example.com', password: 'password123' })
      .expect(201);
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.user).toMatchObject({ fullName: 'Ayesha', email: 'ayesha@example.com' });
    expect(res.body.user.password_hash).toBeUndefined();
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).toMatch(/^tn_refresh=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
  });

  it('rejects invalid input with field errors', async () => {
    const res = await api().post('/api/v1/auth/register').send({ fullName: '', email: 'nope', password: 'short' }).expect(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['email', 'fullName', 'password']);
  });

  it('returns 409 EMAIL_TAKEN for a duplicate email, case-insensitively', async () => {
    await signUp({ email: 'dup@example.com' });
    const res = await api().post('/api/v1/auth/register').send({ fullName: 'X', email: 'DUP@example.com', password: 'password123' }).expect(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });
});

describe('POST /auth/login', () => {
  it('logs in with correct credentials', async () => {
    const u = await signUp({ email: 'bilal@example.com' });
    const res = await api().post('/api/v1/auth/login').send({ email: 'bilal@example.com', password: u.password }).expect(200);
    expect(res.body.user.id).toBe(u.user.id);
  });

  it('gives the same generic error for a wrong password and an unknown email', async () => {
    await signUp({ email: 'sana@example.com' });
    const a = await api().post('/api/v1/auth/login').send({ email: 'sana@example.com', password: 'wrong-password' }).expect(401);
    const b = await api().post('/api/v1/auth/login').send({ email: 'ghost@example.com', password: 'wrong-password' }).expect(401);
    expect(a.body.error).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(b.body.error.message).toBe(a.body.error.message);
  });
});

describe('GET /me', () => {
  it('requires a valid access token', async () => {
    await api().get('/api/v1/me').expect(401);
    const res = await api().get('/api/v1/me').set(bearer('not-a-jwt')).expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns the user and their workspaces', async () => {
    const u = await signUp();
    const res = await api().get('/api/v1/me').set(bearer(u.token)).expect(200);
    expect(res.body).toEqual({ user: u.user, workspaces: [] });
  });
});

describe('refresh token rotation', () => {
  it('rotates the token: the new cookie works, the old one does not', async () => {
    const u = await signUp();
    const r1 = await api().post('/api/v1/auth/refresh').set('Cookie', u.cookie).expect(200);
    const next = (r1.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    expect(next).not.toBe(u.cookie);
    expect(r1.body.accessToken).toBeTypeOf('string');
    await api().post('/api/v1/auth/refresh').set('Cookie', next).expect(200);
  });

  it('revokes the whole family when an old token is reused (theft detection)', async () => {
    const u = await signUp();
    const r1 = await api().post('/api/v1/auth/refresh').set('Cookie', u.cookie).expect(200);
    const current = (r1.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    await api().post('/api/v1/auth/refresh').set('Cookie', u.cookie).expect(401); // reuse of rotated token
    await api().post('/api/v1/auth/refresh').set('Cookie', current).expect(401); // family revoked
  });

  it('logout revokes the refresh token', async () => {
    const u = await signUp();
    await api().post('/api/v1/auth/logout').set('Cookie', u.cookie).expect(204);
    await api().post('/api/v1/auth/refresh').set('Cookie', u.cookie).expect(401);
  });

  it('refresh without a cookie is 401', async () => {
    await api().post('/api/v1/auth/refresh').expect(401);
  });
});

describe('errors', () => {
  it('returns a JSON 404 for unknown routes and 400 for malformed JSON', async () => {
    expect((await api().get('/api/v1/nope').expect(404)).body.error.code).toBe('ROUTE_NOT_FOUND');
    const res = await api().post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{bad').expect(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });
});
