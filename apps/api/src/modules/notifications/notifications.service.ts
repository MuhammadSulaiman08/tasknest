import { stripMentions, type NotificationItem, type NotificationType } from '@tasknest/shared';
import { sql } from 'kysely';
import { db } from '../../db/index.js';
import { logger } from '../../lib/logger.js';
import { emitToUser } from '../../realtime/bus.js';

export interface NewNotification {
  userId: string;
  workspaceId: string;
  type: NotificationType;
  taskId: string;
  commentId?: string | null;
  actorId?: string | null;
}

/** Inserts notifications (never to the actor themselves) and pushes a live event to each recipient. */
export async function notify(items: NewNotification[]) {
  const rows = items.filter((n) => n.userId !== n.actorId);
  if (!rows.length) return;
  const inserted = await db
    .insertInto('notifications')
    .values(rows.map((n) => ({ user_id: n.userId, workspace_id: n.workspaceId, type: n.type, task_id: n.taskId, comment_id: n.commentId ?? null, actor_id: n.actorId ?? null })))
    .returning(['id', 'user_id'])
    .execute();
  for (const r of inserted) emitToUser(r.user_id, 'notification.created', { id: r.id });
}

export async function list(workspaceId: string, userId: string, limit = 30): Promise<{ data: NotificationItem[]; unreadCount: number }> {
  const rows = await db
    .selectFrom('notifications as n')
    .leftJoin('users as a', 'a.id', 'n.actor_id')
    .leftJoin('tasks as t', 't.id', 'n.task_id')
    .leftJoin('projects as p', 'p.id', 't.project_id')
    .leftJoin('comments as c', 'c.id', 'n.comment_id')
    .select([
      'n.id',
      'n.type',
      'n.read_at',
      'n.created_at',
      'a.id as actorId',
      'a.full_name as actorName',
      't.number',
      't.title',
      't.deleted_at as taskDeletedAt',
      'p.key',
      'c.body',
      'c.deleted_at as commentDeletedAt',
    ])
    .where('n.user_id', '=', userId)
    .where('n.workspace_id', '=', workspaceId)
    .orderBy('n.created_at', 'desc')
    .limit(limit)
    .execute();
  const { count } = await db
    .selectFrom('notifications')
    .select(sql<number>`count(*)::int`.as('count'))
    .where('user_id', '=', userId)
    .where('workspace_id', '=', workspaceId)
    .where('read_at', 'is', null)
    .executeTakeFirstOrThrow();

  const data = rows
    .filter((r) => !r.taskDeletedAt)
    .map((r) => {
      const text = r.body && !r.commentDeletedAt ? stripMentions(r.body) : null;
      return {
        id: r.id,
        type: r.type as NotificationType,
        actor: r.actorId ? { id: r.actorId, fullName: r.actorName! } : null,
        task: r.key ? { ref: `${r.key}-${r.number}`, title: r.title! } : null,
        excerpt: text ? (text.length > 140 ? `${text.slice(0, 139)}…` : text) : null,
        read: !!r.read_at,
        createdAt: r.created_at.toISOString(),
      };
    });
  return { data, unreadCount: count };
}

export async function markRead(workspaceId: string, userId: string, ids?: string[]) {
  await db
    .updateTable('notifications')
    .set({ read_at: new Date() })
    .where('user_id', '=', userId)
    .where('workspace_id', '=', workspaceId)
    .where('read_at', 'is', null)
    .$if(!!ids?.length, (qb) => qb.where('id', 'in', ids!))
    .execute();
}

/**
 * "Due soon" job: notifies assignees of open tasks due within 24 hours, once per due date.
 * An advisory lock means only one API instance runs it at a time.
 */
export async function runDueSoonJob(now = new Date()) {
  const lock = await sql<{ locked: boolean }>`SELECT pg_try_advisory_lock(42001) AS locked`.execute(db);
  if (!lock.rows[0]?.locked) return 0;
  try {
    const due = await db
      .updateTable('tasks')
      .set({ due_soon_notified_at: now })
      .where('deleted_at', 'is', null)
      .where('assignee_id', 'is not', null)
      .where('status', 'not in', ['done', 'cancelled'])
      .where('due_soon_notified_at', 'is', null)
      .where('due_date', '>', now)
      .where('due_date', '<=', new Date(now.getTime() + 864e5))
      .returning(['id', 'workspace_id', 'assignee_id'])
      .execute();
    await notify(due.map((t) => ({ userId: t.assignee_id!, workspaceId: t.workspace_id, type: 'due_soon' as const, taskId: t.id })));
    if (due.length) logger.info({ count: due.length }, 'due-soon notifications sent');
    return due.length;
  } finally {
    await sql`SELECT pg_advisory_unlock(42001)`.execute(db);
  }
}
