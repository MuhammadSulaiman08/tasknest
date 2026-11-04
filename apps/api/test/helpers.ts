import { sql } from 'kysely';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from '../src/db/index.js';

export const app = createApp();
export const api = () => request(app);

export async function resetDb() {
  await sql`TRUNCATE users, workspaces, workspace_members, projects, tasks, comments, refresh_tokens, invitations CASCADE`.execute(db);
}

let n = 0;
/** Registers a user and returns their access token, refresh cookie and profile. */
export async function signUp(overrides: Partial<{ fullName: string; email: string; password: string }> = {}) {
  n += 1;
  const body = { fullName: `User ${n}`, email: `user${n}@example.com`, password: 'password123', ...overrides };
  const res = await api().post('/api/v1/auth/register').send(body).expect(201);
  const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('tn_refresh='))!;
  return { token: res.body.accessToken as string, cookie: cookie.split(';')[0], user: res.body.user, password: body.password };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function createWorkspace(token: string, slug = 'acme', name = 'Acme') {
  const res = await api().post('/api/v1/workspaces').set(bearer(token)).send({ name, slug }).expect(201);
  return res.body.data as { id: string; slug: string };
}

/** Owner invites `email` with `role`; the invitee accepts. */
export async function addMember(ownerToken: string, slug: string, invitee: { token: string; user: { email: string } }, role = 'member') {
  const inv = await api().post(`/api/v1/w/${slug}/invitations`).set(bearer(ownerToken)).send({ email: invitee.user.email, role }).expect(201);
  const token = (inv.body.data.inviteUrl as string).split('/invite/')[1];
  await api().post(`/api/v1/invitations/${token}/accept`).set(bearer(invitee.token)).expect(200);
}
