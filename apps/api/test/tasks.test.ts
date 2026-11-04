import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/index.js';
import { addMember, api, bearer, createWorkspace, resetDb, signUp } from './helpers.js';

beforeEach(resetDb);
afterAll(() => db.destroy());

type Session = Awaited<ReturnType<typeof signUp>>;
const P = '/api/v1/w/acme';

async function setup() {
  const owner = await signUp({ fullName: 'Ayesha Khan' });
  const member = await signUp({ fullName: 'Bilal Ahmed' });
  const guest = await signUp({ fullName: 'Sana Ali' });
  await createWorkspace(owner.token, 'acme');
  await addMember(owner.token, 'acme', member, 'member');
  await addMember(owner.token, 'acme', guest, 'guest');
  await api().post(`${P}/projects`).set(bearer(owner.token)).send({ name: 'Website', key: 'web' }).expect(201);
  return { owner, member, guest };
}

const addTask = (s: Session, body: Record<string, unknown>) => api().post(`${P}/projects/WEB/tasks`).set(bearer(s.token)).send(body);
const boardOrder = async (s: Session, status: string) =>
  (await api().get(`${P}/projects/WEB/tasks`).set(bearer(s.token)).expect(200)).body.data
    .filter((t: { status: string }) => t.status === status)
    .map((t: { ref: string }) => t.ref);

describe('projects', () => {
  it('creates projects (admin only), uppercases keys, and rejects duplicate keys', async () => {
    const { owner, member } = await setup();
    await api().post(`${P}/projects`).set(bearer(member.token)).send({ name: 'Nope', key: 'NOPE' }).expect(403);
    const dup = await api().post(`${P}/projects`).set(bearer(owner.token)).send({ name: 'Again', key: 'WEB' }).expect(409);
    expect(dup.body.error.code).toBe('PROJECT_KEY_TAKEN');
    const list = await api().get(`${P}/projects`).set(bearer(member.token)).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ key: 'WEB', name: 'Website', status: 'active', openTasks: 0, totalTasks: 0 });
  });

  it('validates dates and archives a project', async () => {
    const { owner } = await setup();
    const bad = await api().post(`${P}/projects`).set(bearer(owner.token)).send({ name: 'X', key: 'XX', startDate: '2026-12-01', dueDate: '2026-11-01' }).expect(422);
    expect(bad.body.error.fields.dueDate).toBeDefined();
    const arch = await api().patch(`${P}/projects/WEB`).set(bearer(owner.token)).send({ status: 'archived' }).expect(200);
    expect(arch.body.data.status).toBe('archived');
    const blocked = await addTask(owner, { title: 'Late' }).expect(409);
    expect(blocked.body.error.code).toBe('PROJECT_ARCHIVED');
  });
});

describe('tasks', () => {
  it('numbers tasks per project and returns full details', async () => {
    const { owner, member } = await setup();
    const a = await addTask(member, { title: 'Build login page', priority: 'high', assigneeId: member.user.id, dueDate: '2026-11-20' }).expect(201);
    const b = await addTask(member, { title: 'Design schema' }).expect(201);
    expect(a.body.data).toMatchObject({ ref: 'WEB-1', title: 'Build login page', priority: 'high', status: 'todo', assignee: { id: member.user.id, fullName: 'Bilal Ahmed' }, dueDate: '2026-11-20T23:59:59.000Z', reporter: { fullName: 'Bilal Ahmed' }, project: { key: 'WEB' } });
    expect(b.body.data.ref).toBe('WEB-2');
    const d = await api().get(`${P}/tasks/web-1`).set(bearer(owner.token)).expect(200);
    expect(d.body.data.title).toBe('Build login page');
  });

  it('numbers stay unique under concurrent inserts', async () => {
    const { member } = await setup();
    const results = await Promise.all(Array.from({ length: 15 }, (_, i) => addTask(member, { title: `T${i}` })));
    const refs = results.map((r) => r.body.data.ref).sort();
    expect(new Set(refs).size).toBe(15);
  });

  it('guests can read but not write tasks', async () => {
    const { guest, member } = await setup();
    await addTask(member, { title: 'Visible' }).expect(201);
    await api().get(`${P}/projects/WEB/tasks`).set(bearer(guest.token)).expect(200);
    await addTask(guest, { title: 'Nope' }).expect(403);
    await api().patch(`${P}/tasks/WEB-1`).set(bearer(guest.token)).send({ title: 'x' }).expect(403);
  });

  it('rejects an assignee who is not a workspace member', async () => {
    const { member } = await setup();
    const outsider = await signUp();
    const res = await addTask(member, { title: 'X', assigneeId: outsider.user.id }).expect(422);
    expect(res.body.error.fields.assigneeId).toBeDefined();
  });

  it('sets completed_at when moved to done and clears it when reopened', async () => {
    const { member } = await setup();
    await addTask(member, { title: 'Ship it' }).expect(201);
    const done = await api().patch(`${P}/tasks/WEB-1`).set(bearer(member.token)).send({ status: 'done' }).expect(200);
    expect(done.body.data.completedAt).not.toBeNull();
    const reopened = await api().patch(`${P}/tasks/WEB-1`).set(bearer(member.token)).send({ status: 'in_progress' }).expect(200);
    expect(reopened.body.data.completedAt).toBeNull();
  });

  it('supports one level of subtasks', async () => {
    const { member } = await setup();
    const parent = await addTask(member, { title: 'Parent' }).expect(201);
    const child = await addTask(member, { title: 'Child', parentTaskId: parent.body.data.id }).expect(201);
    await addTask(member, { title: 'Grandchild', parentTaskId: child.body.data.id }).expect(422);
    await api().patch(`${P}/tasks/WEB-2`).set(bearer(member.token)).send({ status: 'done' }).expect(200);
    const d = await api().get(`${P}/tasks/WEB-1`).set(bearer(member.token)).expect(200);
    expect(d.body.data).toMatchObject({ subtaskCount: 1, subtasksDone: 1 });
    expect(d.body.data.subtasks[0].ref).toBe('WEB-2');
    // subtasks are not cards on the board
    expect(await boardOrder(member, 'todo')).toEqual(['WEB-1']);
  });

  it('soft-deletes a task and its subtasks', async () => {
    const { member } = await setup();
    const parent = await addTask(member, { title: 'Parent' }).expect(201);
    await addTask(member, { title: 'Child', parentTaskId: parent.body.data.id }).expect(201);
    await api().delete(`${P}/tasks/WEB-1`).set(bearer(member.token)).expect(204);
    await api().get(`${P}/tasks/WEB-1`).set(bearer(member.token)).expect(404);
    await api().get(`${P}/tasks/WEB-2`).set(bearer(member.token)).expect(404);
  });
});

describe('board moves', () => {
  it('reorders within a column and moves across columns', async () => {
    const { member } = await setup();
    const ids: Record<string, string> = {};
    for (const t of ['A', 'B', 'C']) ids[t] = (await addTask(member, { title: t }).expect(201)).body.data.id;
    expect(await boardOrder(member, 'todo')).toEqual(['WEB-1', 'WEB-2', 'WEB-3']);

    // Move C to the top of To do
    await api().patch(`${P}/tasks/WEB-3/move`).set(bearer(member.token)).send({ status: 'todo', beforeId: null, afterId: ids.A }).expect(200);
    expect(await boardOrder(member, 'todo')).toEqual(['WEB-3', 'WEB-1', 'WEB-2']);

    // Move A into an empty In progress column
    await api().patch(`${P}/tasks/WEB-1/move`).set(bearer(member.token)).send({ status: 'in_progress' }).expect(200);
    expect(await boardOrder(member, 'todo')).toEqual(['WEB-3', 'WEB-2']);
    expect(await boardOrder(member, 'in_progress')).toEqual(['WEB-1']);

    // Move B between nothing and A in In progress (above A)
    await api().patch(`${P}/tasks/WEB-2/move`).set(bearer(member.token)).send({ status: 'in_progress', afterId: ids.A }).expect(200);
    expect(await boardOrder(member, 'in_progress')).toEqual(['WEB-2', 'WEB-1']);
  });

  it('rejects neighbours from another column', async () => {
    const { member } = await setup();
    const a = (await addTask(member, { title: 'A' }).expect(201)).body.data.id;
    await addTask(member, { title: 'B' }).expect(201);
    const res = await api().patch(`${P}/tasks/WEB-2/move`).set(bearer(member.token)).send({ status: 'done', beforeId: a }).expect(422);
    expect(res.body.error.code).toBe('INVALID_MOVE');
  });

  it('keeps order correct after many moves into the same gap (rebalance)', async () => {
    const { member } = await setup();
    const a = (await addTask(member, { title: 'A' }).expect(201)).body.data.id;
    const b = (await addTask(member, { title: 'B' }).expect(201)).body.data.id;
    // Repeatedly insert new cards directly below A (halving the gap each time)
    let below = b;
    for (let i = 0; i < 45; i++) {
      const t = (await addTask(member, { title: `X${i}` }).expect(201)).body.data;
      await api().patch(`${P}/tasks/${t.ref}/move`).set(bearer(member.token)).send({ status: 'todo', beforeId: a, afterId: below }).expect(200);
      below = t.id;
    }
    const order = await boardOrder(member, 'todo');
    expect(order[0]).toBe('WEB-1');
    expect(order[1]).toBe('WEB-47'); // last inserted sits right under A
    expect(order.at(-1)).toBe('WEB-2');
    expect(order).toHaveLength(47);
  });
});

describe('my tasks and search', () => {
  it('lists my open tasks across projects, soonest due first', async () => {
    const { owner, member } = await setup();
    await api().post(`${P}/projects`).set(bearer(owner.token)).send({ name: 'Mobile', key: 'MOB' }).expect(201);
    await addTask(member, { title: 'Later', assigneeId: member.user.id, dueDate: '2026-12-20' }).expect(201);
    await api().post(`${P}/projects/MOB/tasks`).set(bearer(member.token)).send({ title: 'Sooner', assigneeId: member.user.id, dueDate: '2026-11-10' }).expect(201);
    await addTask(member, { title: 'Done one', assigneeId: member.user.id, status: 'done' }).expect(201);
    await addTask(member, { title: 'Not mine', assigneeId: owner.user.id }).expect(201);
    const res = await api().get(`${P}/my-tasks`).set(bearer(member.token)).expect(200);
    expect(res.body.data.map((t: { ref: string }) => t.ref)).toEqual(['MOB-1', 'WEB-1']);
  });

  it('finds tasks by words in title or description, and by ref', async () => {
    const { member } = await setup();
    await addTask(member, { title: 'Build login page', description: 'Use JWT tokens' }).expect(201);
    await addTask(member, { title: 'Design database schema' }).expect(201);
    const byTitle = await api().get(`${P}/search?q=login`).set(bearer(member.token)).expect(200);
    expect(byTitle.body.data.map((t: { ref: string }) => t.ref)).toEqual(['WEB-1']);
    const byDesc = await api().get(`${P}/search?q=jwt`).set(bearer(member.token)).expect(200);
    expect(byDesc.body.data[0].ref).toBe('WEB-1');
    const byRef = await api().get(`${P}/search?q=web-2`).set(bearer(member.token)).expect(200);
    expect(byRef.body.data[0].ref).toBe('WEB-2');
  });

  it('never leaks tasks across workspaces', async () => {
    const { member } = await setup();
    await addTask(member, { title: 'Secret plan' }).expect(201);
    const other = await signUp();
    await createWorkspace(other.token, 'other');
    await api().get('/api/v1/w/other/tasks/WEB-1').set(bearer(other.token)).expect(404);
    const s = await api().get('/api/v1/w/other/search?q=secret').set(bearer(other.token)).expect(200);
    expect(s.body.data).toEqual([]);
    await api().get(`${P}/tasks/WEB-1`).set(bearer(other.token)).expect(404);
  });
});

describe('comments', () => {
  it('lets every role comment, threads replies one level deep, and counts them', async () => {
    const { member, guest } = await setup();
    await addTask(member, { title: 'Discuss' }).expect(201);
    const c1 = await api().post(`${P}/tasks/WEB-1/comments`).set(bearer(guest.token)).send({ body: 'Looks good' }).expect(201);
    expect(c1.body.data).toMatchObject({ body: 'Looks good', author: { fullName: 'Sana Ali' }, parentCommentId: null });
    const r1 = await api().post(`${P}/tasks/WEB-1/comments`).set(bearer(member.token)).send({ body: 'Thanks', parentCommentId: c1.body.data.id }).expect(201);
    const r2 = await api().post(`${P}/tasks/WEB-1/comments`).set(bearer(guest.token)).send({ body: 'Reply to reply', parentCommentId: r1.body.data.id }).expect(201);
    expect(r2.body.data.parentCommentId).toBe(c1.body.data.id); // flattened to one level
    const list = await api().get(`${P}/tasks/WEB-1/comments`).set(bearer(member.token)).expect(200);
    expect(list.body.data).toHaveLength(3);
    const card = (await api().get(`${P}/projects/WEB/tasks`).set(bearer(member.token))).body.data[0];
    expect(card.commentCount).toBe(3);
  });

  it('only the author edits; author or admin deletes', async () => {
    const { owner, member, guest } = await setup();
    await addTask(member, { title: 'Discuss' }).expect(201);
    const c = (await api().post(`${P}/tasks/WEB-1/comments`).set(bearer(member.token)).send({ body: 'First' }).expect(201)).body.data;
    await api().patch(`${P}/comments/${c.id}`).set(bearer(guest.token)).send({ body: 'Hacked' }).expect(403);
    const edited = await api().patch(`${P}/comments/${c.id}`).set(bearer(member.token)).send({ body: 'First (edited)' }).expect(200);
    expect(edited.body.data).toMatchObject({ body: 'First (edited)', isEdited: true });
    await api().delete(`${P}/comments/${c.id}`).set(bearer(guest.token)).expect(403);
    await api().delete(`${P}/comments/${c.id}`).set(bearer(owner.token)).expect(204);
    expect((await api().get(`${P}/tasks/WEB-1/comments`).set(bearer(member.token))).body.data).toEqual([]);
  });

  it('rejects empty comments', async () => {
    const { member } = await setup();
    await addTask(member, { title: 'Discuss' }).expect(201);
    await api().post(`${P}/tasks/WEB-1/comments`).set(bearer(member.token)).send({ body: '   ' }).expect(422);
  });
});
