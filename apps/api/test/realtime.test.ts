import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/index.js';
import { attachIo } from '../src/realtime/bus.js';
import { attachSocketServer } from '../src/realtime/socket.js';
import { addMember, api, app, bearer, createWorkspace, resetDb, signUp } from './helpers.js';

let server: Server;
let url: string;
const sockets: Socket[] = [];

beforeAll(async () => {
  server = createServer(app);
  attachSocketServer(server);
  await new Promise<void>((r) => server.listen(0, r));
  url = `http://localhost:${(server.address() as AddressInfo).port}`;
});
beforeEach(resetDb);
afterAll(async () => {
  sockets.forEach((s) => s.close());
  attachIo(null);
  await new Promise((r) => server.close(r));
  await db.destroy();
});

function open(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = connect(url, { auth: { token }, transports: ['websocket'], reconnection: false });
    sockets.push(s);
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}
const join = (s: Socket, slug: string) => new Promise<{ ok: boolean }>((r) => s.emit('workspace:join', { slug }, r));
const next = <T>(s: Socket, event: string) => new Promise<T>((r) => s.once(event, r));

describe('real-time updates', () => {
  it('rejects sockets without a valid token', async () => {
    await expect(open('nope')).rejects.toThrow('UNAUTHENTICATED');
  });

  it('pushes task and comment changes to workspace members, and notifications to the recipient', async () => {
    const owner = await signUp();
    const member = await signUp();
    await createWorkspace(owner.token, 'live');
    await addMember(owner.token, 'live', member, 'member');
    await api().post('/api/v1/w/live/projects').set(bearer(owner.token)).send({ name: 'Website', key: 'WEB' }).expect(201);

    const s = await open(member.token);
    expect(await join(s, 'live')).toEqual({ ok: true });

    const created = next<{ projectKey: string; ref: string }>(s, 'task.changed');
    const notified = next<{ id: string }>(s, 'notification.created');
    await api().post('/api/v1/w/live/projects/WEB/tasks').set(bearer(owner.token)).send({ title: 'Live', assigneeId: member.user.id }).expect(201);
    expect(await created).toEqual({ projectKey: 'WEB', ref: 'WEB-1' });
    expect((await notified).id).toMatch(/^[0-9a-f-]{36}$/);

    const moved = next(s, 'task.changed');
    await api().patch('/api/v1/w/live/tasks/WEB-1/move').set(bearer(owner.token)).send({ status: 'in_progress' }).expect(200);
    expect(await moved).toEqual({ projectKey: 'WEB', ref: 'WEB-1' });

    const commented = next(s, 'comment.changed');
    await api().post('/api/v1/w/live/tasks/WEB-1/comments').set(bearer(owner.token)).send({ body: 'Hello' }).expect(201);
    expect(await commented).toEqual({ ref: 'WEB-1' });
  });

  it('does not let non-members join a workspace room', async () => {
    const owner = await signUp();
    const outsider = await signUp();
    await createWorkspace(owner.token, 'private');
    const s = await open(outsider.token);
    expect(await join(s, 'private')).toEqual({ ok: false });
    let leaked = false;
    s.on('project.changed', () => (leaked = true));
    await api().post('/api/v1/w/private/projects').set(bearer(owner.token)).send({ name: 'Secret', key: 'SEC' }).expect(201);
    await new Promise((r) => setTimeout(r, 200));
    expect(leaked).toBe(false);
  });
});
