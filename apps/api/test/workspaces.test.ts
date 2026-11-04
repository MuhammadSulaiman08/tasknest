import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/index.js';
import { addMember, api, bearer, createWorkspace, resetDb, signUp } from './helpers.js';

beforeEach(resetDb);
afterAll(() => db.destroy());

describe('creating workspaces', () => {
  it('creates a workspace and makes the creator its owner', async () => {
    const u = await signUp();
    const res = await api().post('/api/v1/workspaces').set(bearer(u.token)).send({ name: 'Sukkur IBA FYP', slug: 'Sukkur-IBA-FYP' }).expect(201);
    expect(res.body.data).toMatchObject({ name: 'Sukkur IBA FYP', slug: 'sukkur-iba-fyp', role: 'owner' });
    const me = await api().get('/api/v1/me').set(bearer(u.token)).expect(200);
    expect(me.body.workspaces).toEqual([{ id: res.body.data.id, name: 'Sukkur IBA FYP', slug: 'sukkur-iba-fyp', role: 'owner' }]);
  });

  it('rejects a taken slug with 409 and reports availability', async () => {
    const a = await signUp();
    const b = await signUp();
    await createWorkspace(a.token, 'acme');
    const res = await api().post('/api/v1/workspaces').set(bearer(b.token)).send({ name: 'Other', slug: 'acme' }).expect(409);
    expect(res.body.error.code).toBe('SLUG_TAKEN');
    const check = await api().get('/api/v1/workspaces/slug-available?slug=acme').set(bearer(b.token)).expect(200);
    expect(check.body.data.available).toBe(false);
    const free = await api().get('/api/v1/workspaces/slug-available?slug=acme-2').set(bearer(b.token)).expect(200);
    expect(free.body.data.available).toBe(true);
  });

  it('validates the slug format', async () => {
    const u = await signUp();
    const res = await api().post('/api/v1/workspaces').set(bearer(u.token)).send({ name: 'X', slug: 'bad slug!' }).expect(422);
    expect(res.body.error.fields.slug).toBeDefined();
  });
});

describe('tenant isolation', () => {
  it('returns 404 (not 403) to non-members for every workspace route', async () => {
    const owner = await signUp();
    const outsider = await signUp();
    await createWorkspace(owner.token, 'private-team');
    for (const path of ['', '/members', '/invitations']) {
      const res = await api().get(`/api/v1/w/private-team${path}`).set(bearer(outsider.token)).expect(404);
      expect(res.body.error.code).toBe('WORKSPACE_NOT_FOUND');
    }
  });

  it('hides soft-deleted workspaces', async () => {
    const owner = await signUp();
    await createWorkspace(owner.token, 'gone');
    await api().delete('/api/v1/w/gone').set(bearer(owner.token)).expect(204);
    await api().get('/api/v1/w/gone').set(bearer(owner.token)).expect(404);
  });
});

describe('roles', () => {
  it('lets admins rename the workspace but not members or guests', async () => {
    const owner = await signUp();
    const member = await signUp();
    const guest = await signUp();
    await createWorkspace(owner.token, 'team');
    await addMember(owner.token, 'team', member, 'member');
    await addMember(owner.token, 'team', guest, 'guest');

    await api().patch('/api/v1/w/team').set(bearer(member.token)).send({ name: 'Nope' }).expect(403);
    await api().patch('/api/v1/w/team').set(bearer(guest.token)).send({ name: 'Nope' }).expect(403);
    const ok = await api().patch('/api/v1/w/team').set(bearer(owner.token)).send({ name: 'Team Renamed' }).expect(200);
    expect(ok.body.data.name).toBe('Team Renamed');
  });

  it('only the owner can delete the workspace', async () => {
    const owner = await signUp();
    const admin = await signUp();
    await createWorkspace(owner.token, 'team');
    await addMember(owner.token, 'team', admin, 'admin');
    await api().delete('/api/v1/w/team').set(bearer(admin.token)).expect(403);
  });

  it('protects the owner from role changes and removal', async () => {
    const owner = await signUp();
    const admin = await signUp();
    await createWorkspace(owner.token, 'team');
    await addMember(owner.token, 'team', admin, 'admin');
    const a = await api().patch(`/api/v1/w/team/members/${owner.user.id}`).set(bearer(admin.token)).send({ role: 'guest' }).expect(403);
    expect(a.body.error.code).toBe('CANNOT_CHANGE_OWNER');
    const b = await api().delete(`/api/v1/w/team/members/${owner.user.id}`).set(bearer(admin.token)).expect(403);
    expect(b.body.error.code).toBe('CANNOT_REMOVE_OWNER');
  });

  it('lets an admin change roles, and a member leave on their own', async () => {
    const owner = await signUp();
    const m = await signUp();
    await createWorkspace(owner.token, 'team');
    await addMember(owner.token, 'team', m, 'member');
    await api().patch(`/api/v1/w/team/members/${m.user.id}`).set(bearer(owner.token)).send({ role: 'guest' }).expect(204);
    const members = await api().get('/api/v1/w/team/members').set(bearer(m.token)).expect(200);
    expect(members.body.data.find((x: { id: string }) => x.id === m.user.id).role).toBe('guest');
    await api().delete(`/api/v1/w/team/members/${m.user.id}`).set(bearer(m.token)).expect(204);
    await api().get('/api/v1/w/team').set(bearer(m.token)).expect(404);
  });
});

describe('invitations', () => {
  it('previews and accepts an invite, joining with the invited role', async () => {
    const owner = await signUp({ fullName: 'Ayesha' });
    const invitee = await signUp({ email: 'bilal@example.com' });
    await createWorkspace(owner.token, 'fyp', 'FYP Team');
    const inv = await api().post('/api/v1/w/fyp/invitations').set(bearer(owner.token)).send({ email: 'BILAL@example.com', role: 'admin' }).expect(201);
    expect(inv.body.data.inviteUrl).toMatch(/^http:\/\/localhost:3000\/invite\//);
    const token = inv.body.data.inviteUrl.split('/invite/')[1];

    const preview = await api().get(`/api/v1/invitations/${token}`).expect(200);
    expect(preview.body.data).toEqual({ email: 'bilal@example.com', role: 'admin', workspace: { name: 'FYP Team', slug: 'fyp' }, invitedBy: 'Ayesha' });

    await api().post(`/api/v1/invitations/${token}/accept`).set(bearer(invitee.token)).expect(200);
    const ws = await api().get('/api/v1/w/fyp').set(bearer(invitee.token)).expect(200);
    expect(ws.body.data.role).toBe('admin');
    // single use
    expect((await api().post(`/api/v1/invitations/${token}/accept`).set(bearer(invitee.token)).expect(410)).body.error.code).toBe('INVITATION_USED');
  });

  it('refuses an invite accepted by a different email', async () => {
    const owner = await signUp();
    const other = await signUp();
    await createWorkspace(owner.token, 'fyp');
    const inv = await api().post('/api/v1/w/fyp/invitations').set(bearer(owner.token)).send({ email: 'someone@example.com' }).expect(201);
    const token = inv.body.data.inviteUrl.split('/invite/')[1];
    const res = await api().post(`/api/v1/invitations/${token}/accept`).set(bearer(other.token)).expect(403);
    expect(res.body.error.code).toBe('INVITE_EMAIL_MISMATCH');
  });

  it('only admins can invite; re-inviting replaces the pending invite', async () => {
    const owner = await signUp();
    const member = await signUp();
    await createWorkspace(owner.token, 'fyp');
    await addMember(owner.token, 'fyp', member, 'member');
    await api().post('/api/v1/w/fyp/invitations').set(bearer(member.token)).send({ email: 'x@example.com' }).expect(403);
    await api().post('/api/v1/w/fyp/invitations').set(bearer(owner.token)).send({ email: 'x@example.com', role: 'guest' }).expect(201);
    await api().post('/api/v1/w/fyp/invitations').set(bearer(owner.token)).send({ email: 'x@example.com', role: 'member' }).expect(201);
    const list = await api().get('/api/v1/w/fyp/invitations').set(bearer(owner.token)).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].role).toBe('member');
    await api().delete(`/api/v1/w/fyp/invitations/${list.body.data[0].id}`).set(bearer(owner.token)).expect(204);
  });

  it('returns 404 for an unknown invite token', async () => {
    await api().get('/api/v1/invitations/does-not-exist').expect(404);
  });
});
