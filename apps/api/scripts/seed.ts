/**
 * Seeds a demo workspace for screenshots and the live demo.
 *   Login: demo@tasknest.app / password123
 * Safe to re-run: it deletes the previous demo users and workspace first.
 */
import { sql } from 'kysely';
import { db } from '../src/db/index.js';
import * as auth from '../src/modules/auth/auth.service.js';
import * as comments from '../src/modules/comments/comments.service.js';
import * as projects from '../src/modules/projects/projects.service.js';
import * as tasks from '../src/modules/tasks/tasks.service.js';
import { createWithOwner } from '../src/modules/workspaces/workspaces.repo.js';

const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

async function main() {
  const emails = ['demo@tasknest.app', 'bilal@tasknest.app', 'sana@tasknest.app', 'hira@tasknest.app'];
  await db.deleteFrom('workspaces').where('slug', '=', 'demo-team').execute();
  await db.deleteFrom('users').where('email', 'in', emails).execute();

  const [ayesha, bilal, sana, hira] = await Promise.all([
    auth.register({ fullName: 'Ayesha Khan', email: emails[0], password: 'password123' }),
    auth.register({ fullName: 'Bilal Ahmed', email: emails[1], password: 'password123' }),
    auth.register({ fullName: 'Sana Ali', email: emails[2], password: 'password123' }),
    auth.register({ fullName: 'Hira Memon', email: emails[3], password: 'password123' }),
  ]).then((s) => s.map((x) => x.user));

  const ws = await createWithOwner({ name: 'Demo Team', slug: 'demo-team', ownerId: ayesha.id });
  await db.insertInto('workspace_members').values([
    { workspace_id: ws.id, user_id: bilal.id, role: 'admin' },
    { workspace_id: ws.id, user_id: hira.id, role: 'member' },
    { workspace_id: ws.id, user_id: sana.id, role: 'guest' },
  ]).execute();

  await projects.create(ws.id, ayesha.id, { name: 'Website', key: 'WEB', description: 'Public marketing site and sign-up flow', leadId: ayesha.id, startDate: day(-20), dueDate: day(40) });
  await projects.create(ws.id, ayesha.id, { name: 'Mobile App', key: 'MOB', description: 'React Native client', leadId: bilal.id, startDate: day(-5), dueDate: day(75) });
  await projects.create(ws.id, ayesha.id, { name: 'Final Year Report', key: 'FYP', leadId: hira.id });

  type S = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled';
  type P = 'low' | 'medium' | 'high' | 'urgent';
  const web: [string, S, P, string | null, number | null, string?][] = [
    ['Write the product requirements document', 'done', 'high', ayesha.id, -14],
    ['Design the database schema', 'done', 'urgent', bilal.id, -10, 'Tables for users, workspaces, projects, tasks and comments with partial indexes.'],
    ['Set up CI pipeline with GitHub Actions', 'done', 'medium', bilal.id, -6],
    ['Build sign-up and login pages', 'in_review', 'high', hira.id, 1, 'Inline validation, show/hide password, redirect to onboarding.'],
    ['Implement refresh token rotation', 'in_progress', 'urgent', bilal.id, 2, 'Rotate on every use and revoke the family when an old token is reused.'],
    ['Kanban board with drag and drop', 'in_progress', 'high', ayesha.id, 5],
    ['Responsive layout for mobile', 'todo', 'medium', hira.id, 8],
    ['Write onboarding copy', 'todo', 'low', ayesha.id, 12],
    ['Accessibility pass (keyboard + contrast)', 'todo', 'medium', null, 15],
    ['Set up error monitoring with Sentry', 'todo', 'low', bilal.id, null],
    ['Deploy to Vercel, Render and Neon', 'todo', 'high', bilal.id, 18],
    ['Landing page hero illustration', 'backlog', 'low', null, null],
    ['Email digest of overdue tasks', 'backlog', 'medium', null, null],
    ['Dark mode toggle', 'cancelled', 'low', null, null],
  ];
  const mob: [string, S, P, string | null, number | null][] = [
    ['Choose navigation library', 'done', 'medium', bilal.id, -3],
    ['Login screen', 'in_progress', 'high', hira.id, 4],
    ['Push notifications', 'todo', 'medium', bilal.id, 20],
    ['Offline task cache', 'backlog', 'low', null, null],
  ];
  const fyp: [string, S, P, string | null, number | null][] = [
    ['Literature review chapter', 'in_progress', 'high', hira.id, -1],
    ['System design chapter', 'todo', 'high', ayesha.id, 10],
    ['Prepare final presentation', 'todo', 'medium', null, 30],
  ];

  const insertAll = async (key: string, list: typeof mob | typeof web) => {
    const out: Record<string, string> = {};
    for (const [title, status, priority, assigneeId, due, description] of list as typeof web) {
      const t = await tasks.create(ws.id, ayesha.id, key, {
        title, status, priority, assigneeId, description,
        dueDate: due === null ? null : `${day(due)}T23:59:59Z`,
        estimatePoints: [1, 2, 3, 5, 8][title.length % 5],
      });
      out[title] = t.ref;
    }
    return out;
  };
  const webRefs = await insertAll('WEB', web);
  await insertAll('MOB', mob);
  await insertAll('FYP', fyp);

  // Subtasks on the board task
  const board = await tasks.detail(ws.id, webRefs['Kanban board with drag and drop']);
  for (const [title, status] of [['Column layout', 'done'], ['Drag between columns', 'done'], ['Keyboard drag support', 'in_progress'], ['Optimistic updates', 'todo']] as const) {
    await tasks.create(ws.id, ayesha.id, 'WEB', { title, status, priority: 'medium', parentTaskId: board.id, assigneeId: ayesha.id });
  }

  // A conversation
  const ref = webRefs['Implement refresh token rotation'];
  const c1 = await comments.create(ws.id, sana.id, ref, { body: 'How long do access tokens last? Users on slow connections should not be logged out mid-task.' });
  await comments.create(ws.id, bilal.id, ref, { body: '15 minutes, and the app refreshes silently in the background, so users never notice.', parentCommentId: c1.id });
  await comments.create(ws.id, ayesha.id, ref, { body: 'Please add a test for the reuse case, where an old token should revoke the whole family.' });
  await comments.create(ws.id, hira.id, webRefs['Build sign-up and login pages'], { body: 'Ready for review. Screenshots are in the PR.' });

  // Spread created_at so "recent activity" looks natural
  await sql`UPDATE tasks SET created_at = now() - (random() * interval '20 days') WHERE workspace_id = ${ws.id}`.execute(db);

  console.log('Seeded workspace "Demo Team" (/w/demo-team). Log in with demo@tasknest.app / password123');
  await db.destroy();
}

main().catch(async (e) => {
  console.error(e);
  await db.destroy();
  process.exit(1);
});
