import { mentionToken } from '@tasknest/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/index.js';
import { runDueSoonJob } from '../src/modules/notifications/notifications.service.js';
import { addMember, api, bearer, createWorkspace, resetDb, signUp } from './helpers.js';

beforeEach(resetDb);
afterAll(() => db.destroy());

const P = '/api/v1/w/acme';
type Session = Awaited<ReturnType<typeof signUp>>;

async function setup() {
  const owner = await signUp({ fullName: 'Ayesha Khan' });
  const bilal = await signUp({ fullName: 'Bilal Ahmed' });
  const hira = await signUp({ fullName: 'Hira Memon' });
  await createWorkspace(owner.token, 'acme');
  await addMember(owner.token, 'acme', bilal, 'member');
  await addMember(owner.token, 'acme', hira, 'member');
  await api().post(`${P}/projects`).set(bearer(owner.token)).send({ name: 'Website', key: 'WEB' }).expect(201);
  return { owner, bilal, hira };
}
const inbox = async (s: Session) => (await api().get(`${P}/notifications`).set(bearer(s.token)).expect(200)).body;

describe('notifications', () => {
  it('notifies the assignee on create and on reassignment, never the actor', async () => {
    const { owner, bilal, hira } = await setup();
    await api().post(`${P}/projects/WEB/tasks`).set(bearer(owner.token)).send({ title: 'Login page', assigneeId: bilal.user.id }).expect(201);
    let b = await inbox(bilal);
    expect(b.unreadCount).toBe(1);
    expect(b.data[0]).toMatchObject({ type: 'assigned', actor: { fullName: 'Ayesha Khan' }, task: { ref: 'WEB-1', title: 'Login page' }, read: false });

    await api().patch(`${P}/tasks/WEB-1`).set(bearer(owner.token)).send({ assigneeId: hira.user.id }).expect(200);
    expect((await inbox(hira)).data[0].type).toBe('assigned');
    // assigning yourself creates nothing
    await api().patch(`${P}/tasks/WEB-1`).set(bearer(owner.token)).send({ assigneeId: owner.user.id }).expect(200);
    expect((await inbox(owner)).unreadCount).toBe(0);
    // re-saving the same assignee does not notify again
    await api().patch(`${P}/tasks/WEB-1`).set(bearer(bilal.token)).send({ assigneeId: owner.user.id, title: 'Login page v2' }).expect(200);
    expect((await inbox(owner)).unreadCount).toBe(0);
  });

  it('mentions notify mentioned members; assignee and reporter get "commented" once', async () => {
    const { owner, bilal, hira } = await setup();
    await api().post(`${P}/projects/WEB/tasks`).set(bearer(owner.token)).send({ title: 'Schema', assigneeId: bilal.user.id }).expect(201);
    await api().post(`${P}/notifications/read`).set(bearer(bilal.token)).send({}).expect(204);

    const outsider = await signUp({ fullName: 'Not Member' });
    const body = `Can ${mentionToken({ id: hira.user.id, fullName: 'Hira Memon' })} review? cc ${mentionToken({ id: outsider.user.id, fullName: 'Not Member' })}`;
    await api().post(`${P}/tasks/WEB-1/comments`).set(bearer(bilal.token)).send({ body }).expect(201);

    const h = await inbox(hira);
    expect(h.data[0]).toMatchObject({ type: 'mentioned', actor: { fullName: 'Bilal Ahmed' }, excerpt: 'Can @Hira Memon review? cc @Not Member' });
    const o = await inbox(owner); // reporter
    expect(o.data.map((n: { type: string }) => n.type)).toEqual(['commented']);
    expect((await inbox(bilal)).unreadCount).toBe(0); // author gets nothing
    const n = await db.selectFrom('notifications').select('user_id').where('user_id', '=', outsider.user.id).execute();
    expect(n).toHaveLength(0); // non-members cannot be mentioned
  });

  it('editing a comment notifies only newly mentioned people', async () => {
    const { owner, bilal, hira } = await setup();
    await api().post(`${P}/projects/WEB/tasks`).set(bearer(owner.token)).send({ title: 'T' }).expect(201);
    const c = await api().post(`${P}/tasks/WEB-1/comments`).set(bearer(owner.token)).send({ body: `Hi ${mentionToken({ id: bilal.user.id, fullName: 'Bilal Ahmed' })}` }).expect(201);
    await api().patch(`${P}/comments/${c.body.data.id}`).set(bearer(owner.token)).send({ body: `Hi ${mentionToken({ id: bilal.user.id, fullName: 'Bilal Ahmed' })} and ${mentionToken({ id: hira.user.id, fullName: 'Hira Memon' })}` }).expect(200);
    expect((await inbox(bilal)).data).toHaveLength(1);
    expect((await inbox(hira)).data).toHaveLength(1);
  });

  it('marks some or all notifications as read, scoped to the workspace', async () => {
    const { owner, bilal } = await setup();
    for (const t of ['A', 'B', 'C']) await api().post(`${P}/projects/WEB/tasks`).set(bearer(owner.token)).send({ title: t, assigneeId: bilal.user.id }).expect(201);
    const all = await inbox(bilal);
    expect(all.unreadCount).toBe(3);
    await api().post(`${P}/notifications/read`).set(bearer(bilal.token)).send({ ids: [all.data[0].id] }).expect(204);
    expect((await inbox(bilal)).unreadCount).toBe(2);
    await api().post(`${P}/notifications/read`).set(bearer(bilal.token)).send({}).expect(204);
    const after = await inbox(bilal);
    expect(after.unreadCount).toBe(0);
    expect(after.data.every((n: { read: boolean }) => n.read)).toBe(true);
  });

  it('due-soon job notifies once per due date, and again after the date changes', async () => {
    const { owner, bilal } = await setup();
    const soon = new Date(Date.now() + 6 * 3600_000).toISOString();
    const later = new Date(Date.now() + 5 * 864e5).toISOString();
    await api().post(`${P}/projects/WEB/tasks`).set(bearer(owner.token)).send({ title: 'Due soon', assigneeId: bilal.user.id, dueDate: soon }).expect(201);
    await api().post(`${P}/projects/WEB/tasks`).set(bearer(owner.token)).send({ title: 'Due later', assigneeId: bilal.user.id, dueDate: later }).expect(201);
    await api().post(`${P}/projects/WEB/tasks`).set(bearer(owner.token)).send({ title: 'Done already', assigneeId: bilal.user.id, dueDate: soon, status: 'done' }).expect(201);
    await api().post(`${P}/notifications/read`).set(bearer(bilal.token)).send({}).expect(204);

    expect(await runDueSoonJob()).toBe(1);
    expect(await runDueSoonJob()).toBe(0); // not twice
    const b = await inbox(bilal);
    expect(b.data[0]).toMatchObject({ type: 'due_soon', task: { ref: 'WEB-1' }, actor: null });

    await api().patch(`${P}/tasks/WEB-1`).set(bearer(owner.token)).send({ dueDate: new Date(Date.now() + 3 * 3600_000).toISOString() }).expect(200);
    expect(await runDueSoonJob()).toBe(1);
  });
});
