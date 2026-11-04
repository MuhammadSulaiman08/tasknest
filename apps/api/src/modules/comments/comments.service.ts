import { extractMentionIds, type CommentItem, type WorkspaceRole } from '@tasknest/shared';
import { sql } from 'kysely';
import { db } from '../../db/index.js';
import { AppError } from '../../lib/AppError.js';
import { hasRole } from '../../middleware/workspace.js';
import { emitToWorkspace } from '../../realtime/bus.js';
import { notify, type NewNotification } from '../notifications/notifications.service.js';
import { resolveTask } from '../tasks/tasks.service.js';

/** Only users who are members of this workspace can be mentioned. */
async function memberIds(workspaceId: string, ids: string[]) {
  if (!ids.length) return [];
  const rows = await db.selectFrom('workspace_members').select('user_id').where('workspace_id', '=', workspaceId).where('user_id', 'in', ids).execute();
  return rows.map((r) => r.user_id);
}

function query(workspaceId: string) {
  return db
    .selectFrom('comments as c')
    .innerJoin('tasks as t', 't.id', 'c.task_id')
    .innerJoin('projects as p', 'p.id', 't.project_id')
    .leftJoin('users as u', 'u.id', 'c.author_id')
    .select([sql<string>`p.key || '-' || t.number`.as('taskRef'), 'c.id', 'c.body', 'c.parent_comment_id', 'c.is_edited', 'c.created_at', 'c.updated_at', 'u.id as authorId', 'u.full_name as authorName'])
    .where('t.workspace_id', '=', workspaceId)
    .where('t.deleted_at', 'is', null)
    .where('c.deleted_at', 'is', null);
}

type Row = Awaited<ReturnType<ReturnType<typeof query>['executeTakeFirstOrThrow']>>;

const toItem = (r: Row): CommentItem => ({
  id: r.id,
  body: r.body,
  author: r.authorId ? { id: r.authorId, fullName: r.authorName! } : null,
  parentCommentId: r.parent_comment_id,
  isEdited: r.is_edited,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});

export async function list(workspaceId: string, ref: string) {
  const task = await resolveTask(workspaceId, ref);
  const rows = await query(workspaceId).where('c.task_id', '=', task.id).orderBy('c.created_at').execute();
  return rows.map(toItem);
}

export async function create(workspaceId: string, userId: string, ref: string, input: { body: string; parentCommentId?: string | null }) {
  const task = await resolveTask(workspaceId, ref);
  let parentId: string | null = null;
  if (input.parentCommentId) {
    const parent = await db
      .selectFrom('comments')
      .select(['id', 'parent_comment_id'])
      .where('id', '=', input.parentCommentId)
      .where('task_id', '=', task.id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!parent) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid', { parentCommentId: 'Comment not found' });
    parentId = parent.parent_comment_id ?? parent.id; // replies are one level deep
  }
  const { id } = await db
    .insertInto('comments')
    .values({ task_id: task.id, author_id: userId, body: input.body, parent_comment_id: parentId })
    .returning('id')
    .executeTakeFirstOrThrow();

  // Mentioned members get "mentioned"; the assignee and reporter get "commented" (each person once, never the author)
  const mentioned = await memberIds(workspaceId, extractMentionIds(input.body));
  const people = await db.selectFrom('tasks').select(['assignee_id', 'reporter_id']).where('id', '=', task.id).executeTakeFirstOrThrow();
  const watchers = [people.assignee_id, people.reporter_id].filter((u): u is string => !!u && !mentioned.includes(u));
  const items: NewNotification[] = [
    ...mentioned.map((u) => ({ userId: u, workspaceId, type: 'mentioned' as const, taskId: task.id, commentId: id, actorId: userId })),
    ...[...new Set(watchers)].map((u) => ({ userId: u, workspaceId, type: 'commented' as const, taskId: task.id, commentId: id, actorId: userId })),
  ];
  await notify(items);
  emitToWorkspace(workspaceId, 'comment.changed', { ref: ref.toUpperCase() });
  return toItem(await query(workspaceId).where('c.id', '=', id).executeTakeFirstOrThrow());
}

async function load(workspaceId: string, id: string) {
  const row = await query(workspaceId).where('c.id', '=', id).executeTakeFirst();
  if (!row) throw new AppError(404, 'COMMENT_NOT_FOUND', 'Comment not found');
  return row;
}

export async function edit(workspaceId: string, userId: string, id: string, body: string) {
  const c = await load(workspaceId, id);
  if (c.authorId !== userId) throw new AppError(403, 'FORBIDDEN', 'You can only edit your own comments');
  await db.updateTable('comments').set({ body, is_edited: true }).where('id', '=', id).execute();
  // Notify only people newly mentioned by the edit
  const before = new Set(extractMentionIds(c.body));
  const added = await memberIds(workspaceId, extractMentionIds(body).filter((u) => !before.has(u)));
  const t = await db.selectFrom('comments').select('task_id').where('id', '=', id).executeTakeFirstOrThrow();
  await notify(added.map((u) => ({ userId: u, workspaceId, type: 'mentioned' as const, taskId: t.task_id, commentId: id, actorId: userId })));
  emitToWorkspace(workspaceId, 'comment.changed', { ref: c.taskRef });
  return toItem(await load(workspaceId, id));
}

/** Authors delete their own comments; admins can delete any comment. Replies go with their parent. */
export async function remove(workspaceId: string, userId: string, role: WorkspaceRole, id: string) {
  const c = await load(workspaceId, id);
  if (c.authorId !== userId && !hasRole(role, 'admin')) throw new AppError(403, 'FORBIDDEN', 'You can only delete your own comments');
  await db
    .updateTable('comments')
    .set({ deleted_at: new Date() })
    .where((eb) => eb.or([eb('id', '=', id), eb('parent_comment_id', '=', id)]))
    .execute();
  emitToWorkspace(workspaceId, 'comment.changed', { ref: c.taskRef });
}
