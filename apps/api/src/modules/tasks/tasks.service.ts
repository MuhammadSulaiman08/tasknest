import type { MoveTaskInput, TaskCard, TaskDetail, TaskStatus } from '@tasknest/shared';
import { parseTaskRef } from '@tasknest/shared';
import { sql, type Transaction } from 'kysely';
import { db } from '../../db/index.js';
import type { DB } from '../../db/types.js';
import { AppError } from '../../lib/AppError.js';
import { assertMember } from '../../lib/members.js';
import { emitToWorkspace } from '../../realtime/bus.js';
import { notify } from '../notifications/notifications.service.js';
import { resolveProject } from '../projects/projects.service.js';
import { STEP, needsRebalance, positionBetween } from './position.js';

// ---------------------------------------------------------------- queries

function cardQuery(workspaceId: string) {
  return db
    .selectFrom('tasks as t')
    .innerJoin('projects as p', 'p.id', 't.project_id')
    .leftJoin('users as a', 'a.id', 't.assignee_id')
    .select([
      't.id',
      't.number',
      't.title',
      't.status',
      't.priority',
      't.position',
      't.due_date',
      't.estimate_points',
      't.parent_task_id',
      't.completed_at',
      't.updated_at',
      't.project_id',
      'p.key as projectKey',
      'a.id as assigneeId',
      'a.full_name as assigneeName',
      sql<number>`(SELECT count(*)::int FROM tasks s WHERE s.parent_task_id = t.id AND s.deleted_at IS NULL)`.as('subtaskCount'),
      sql<number>`(SELECT count(*)::int FROM tasks s WHERE s.parent_task_id = t.id AND s.deleted_at IS NULL AND s.status = 'done')`.as('subtasksDone'),
      sql<number>`(SELECT count(*)::int FROM comments c WHERE c.task_id = t.id AND c.deleted_at IS NULL)`.as('commentCount'),
    ])
    .where('t.workspace_id', '=', workspaceId)
    .where('t.deleted_at', 'is', null)
    .where('p.deleted_at', 'is', null);
}

type CardRow = Awaited<ReturnType<ReturnType<typeof cardQuery>['executeTakeFirstOrThrow']>>;

export const toCard = (r: CardRow): TaskCard & { projectKey: string } => ({
  id: r.id,
  ref: `${r.projectKey}-${r.number}`,
  number: r.number,
  title: r.title,
  status: r.status,
  priority: r.priority,
  position: Number(r.position),
  assignee: r.assigneeId ? { id: r.assigneeId, fullName: r.assigneeName! } : null,
  dueDate: r.due_date ? r.due_date.toISOString() : null,
  estimatePoints: r.estimate_points,
  parentTaskId: r.parent_task_id,
  subtaskCount: r.subtaskCount,
  subtasksDone: r.subtasksDone,
  commentCount: r.commentCount,
  completedAt: r.completed_at ? r.completed_at.toISOString() : null,
  updatedAt: r.updated_at.toISOString(),
  projectKey: r.projectKey,
});

/** Finds a live task by its human ref ("WEB-42") inside the workspace, or throws 404. */
export async function resolveTask(workspaceId: string, ref: string) {
  const parsed = parseTaskRef(ref);
  if (!parsed) throw new AppError(404, 'TASK_NOT_FOUND', 'Task not found');
  const row = await db
    .selectFrom('tasks as t')
    .innerJoin('projects as p', 'p.id', 't.project_id')
    .select(['t.id', 't.project_id', 't.status', 't.parent_task_id', 'p.key'])
    .where('t.workspace_id', '=', workspaceId)
    .where('p.key', '=', parsed.key)
    .where('t.number', '=', parsed.number)
    .where('t.deleted_at', 'is', null)
    .where('p.deleted_at', 'is', null)
    .executeTakeFirst();
  if (!row) throw new AppError(404, 'TASK_NOT_FOUND', 'Task not found');
  return row;
}

// ---------------------------------------------------------------- reads

/** All live top-level tasks of a project, ordered for the board. */
export async function board(workspaceId: string, projectKey: string) {
  const project = await resolveProject(workspaceId, projectKey);
  const rows = await cardQuery(workspaceId)
    .where('t.project_id', '=', project.id)
    .where('t.parent_task_id', 'is', null)
    .orderBy('t.position')
    .orderBy('t.created_at')
    .execute();
  return rows.map(toCard);
}

export async function detail(workspaceId: string, ref: string): Promise<TaskDetail> {
  const { id } = await resolveTask(workspaceId, ref);
  const row = await cardQuery(workspaceId)
    .leftJoin('users as r', 'r.id', 't.reporter_id')
    .leftJoin('tasks as parent', 'parent.id', 't.parent_task_id')
    .select([
      't.description',
      't.created_at',
      'r.id as reporterId',
      'r.full_name as reporterName',
      'p.name as projectName',
      'parent.id as parentId',
      'parent.number as parentNumber',
      'parent.title as parentTitle',
    ])
    .where('t.id', '=', id)
    .executeTakeFirstOrThrow();
  const subtasks = await cardQuery(workspaceId).where('t.parent_task_id', '=', id).orderBy('t.position').orderBy('t.created_at').execute();
  return {
    ...toCard(row),
    description: row.description,
    reporter: row.reporterId ? { id: row.reporterId, fullName: row.reporterName! } : null,
    project: { id: row.project_id, key: row.projectKey, name: row.projectName },
    parent: row.parentId ? { id: row.parentId, ref: `${row.projectKey}-${row.parentNumber}`, title: row.parentTitle! } : null,
    subtasks: subtasks.map(toCard),
    createdAt: row.created_at.toISOString(),
  };
}

/** Open tasks assigned to the user across all projects, soonest due first. */
export async function myTasks(workspaceId: string, userId: string) {
  const rows = await cardQuery(workspaceId)
    .where('t.assignee_id', '=', userId)
    .where('t.status', 'not in', ['done', 'cancelled'])
    .orderBy(sql`t.due_date ASC NULLS LAST`)
    .orderBy('t.priority', 'desc')
    .orderBy('t.created_at')
    .execute();
  return rows.map(toCard);
}

/** Full-text search on title (weight A) and description (weight B); an exact ref ("WEB-4") ranks first. */
export async function search(workspaceId: string, q: string) {
  const query = q.trim().slice(0, 200);
  if (!query) return [];
  const ref = parseTaskRef(query);
  const rows = await cardQuery(workspaceId)
    .where((eb) =>
      eb.or([
        eb(sql`t.search_vector`, '@@', sql`websearch_to_tsquery('english', ${query})`),
        ...(ref ? [eb.and([eb('p.key', '=', ref.key), eb('t.number', '=', ref.number)])] : []),
        eb('t.title', 'ilike', `%${query.replace(/[%_\\]/g, '\\$&')}%`),
      ]),
    )
    .$if(!!ref, (qb) => qb.orderBy(sql`(p.key = ${ref!.key} AND t.number = ${ref!.number})`, 'desc'))
    .orderBy(sql`ts_rank(t.search_vector, websearch_to_tsquery('english', ${query}))`, 'desc')
    .orderBy('t.updated_at', 'desc')
    .limit(20)
    .execute();
  return rows.map(toCard);
}

// ---------------------------------------------------------------- writes

async function bottomPosition(conn: Transaction<DB> | typeof db, projectId: string, status: TaskStatus, parentId: string | null) {
  const r = await conn
    .selectFrom('tasks')
    .select(sql<string | null>`max(position)`.as('max'))
    .where('project_id', '=', projectId)
    .where('status', '=', status)
    .where('deleted_at', 'is', null)
    .where((eb) => (parentId ? eb('parent_task_id', '=', parentId) : eb('parent_task_id', 'is', null)))
    .executeTakeFirst();
  return (r?.max ? Number(r.max) : 0) + STEP;
}

export async function create(
  workspaceId: string,
  userId: string,
  projectKey: string,
  input: {
    title: string;
    description?: string;
    status: TaskStatus;
    priority: TaskDetail['priority'];
    assigneeId?: string | null;
    dueDate?: string | null;
    estimatePoints?: number | null;
    parentTaskId?: string | null;
  },
) {
  const project = await resolveProject(workspaceId, projectKey);
  if (project.status === 'archived') throw new AppError(409, 'PROJECT_ARCHIVED', 'This project is archived');
  await assertMember(workspaceId, input.assigneeId, 'assigneeId');

  if (input.parentTaskId) {
    const parent = await db
      .selectFrom('tasks')
      .select(['id', 'parent_task_id'])
      .where('id', '=', input.parentTaskId)
      .where('project_id', '=', project.id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!parent) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid', { parentTaskId: 'Parent task not found in this project' });
    if (parent.parent_task_id) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid', { parentTaskId: 'Subtasks cannot have their own subtasks' });
  }

  const position = await bottomPosition(db, project.id, input.status, input.parentTaskId ?? null);
  const row = await db
    .insertInto('tasks')
    .values({
      project_id: project.id,
      workspace_id: workspaceId, // also set by trigger from the project
      number: 0, // replaced by the per-project counter in trg_tasks_assign_number
      title: input.title,
      description: input.description || null,
      status: input.status,
      priority: input.priority,
      assignee_id: input.assigneeId ?? null,
      reporter_id: userId,
      due_date: input.dueDate ?? null,
      estimate_points: input.estimatePoints ?? null,
      parent_task_id: input.parentTaskId ?? null,
      position,
    })
    .returning(['id', 'number'])
    .executeTakeFirstOrThrow();
  if (input.assigneeId) await notify([{ userId: input.assigneeId, workspaceId, type: 'assigned', taskId: row.id, actorId: userId }]);
  const ref = `${project.key}-${row.number}`;
  emitToWorkspace(workspaceId, 'task.changed', { projectKey: project.key, ref });
  return detail(workspaceId, ref);
}

export async function update(
  workspaceId: string,
  ref: string,
  actorId: string,
  input: {
    title?: string;
    description?: string | null;
    status?: TaskStatus;
    priority?: TaskDetail['priority'];
    assigneeId?: string | null;
    dueDate?: string | null;
    estimatePoints?: number | null;
  },
) {
  const task = await resolveTask(workspaceId, ref);
  await assertMember(workspaceId, input.assigneeId, 'assigneeId');
  const before = await db.selectFrom('tasks').select(['assignee_id']).where('id', '=', task.id).executeTakeFirstOrThrow();
  const statusChanged = input.status !== undefined && input.status !== task.status;
  await db
    .updateTable('tasks')
    .set({
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description || null }),
      ...(input.priority !== undefined && { priority: input.priority }),
      ...(input.assigneeId !== undefined && { assignee_id: input.assigneeId }),
      ...(input.dueDate !== undefined && { due_date: input.dueDate, due_soon_notified_at: null }),
      ...(input.estimatePoints !== undefined && { estimate_points: input.estimatePoints }),
      ...(statusChanged && {
        status: input.status,
        // Changing status from a dropdown drops the card at the bottom of its new column
        position: await bottomPosition(db, task.project_id, input.status!, task.parent_task_id),
      }),
    })
    .where('id', '=', task.id)
    .execute();
  if (input.assigneeId && input.assigneeId !== before.assignee_id) {
    await notify([{ userId: input.assigneeId, workspaceId, type: 'assigned', taskId: task.id, actorId }]);
  }
  emitToWorkspace(workspaceId, 'task.changed', { projectKey: task.key, ref: ref.toUpperCase() });
  return detail(workspaceId, ref);
}

/**
 * Moves a card to `status`, between `beforeId` (card above) and `afterId` (card below).
 * Only the moved row is written, except in the rare case the gap is exhausted and the column is renumbered.
 */
export async function move(workspaceId: string, ref: string, input: MoveTaskInput) {
  const task = await resolveTask(workspaceId, ref);
  await db.transaction().execute(async (trx) => {
    // Lock the project's row so two concurrent moves in the same project are serialised
    await trx.selectFrom('projects').select('id').where('id', '=', task.project_id).forUpdate().execute();

    const neighbour = async (id: string | null | undefined) => {
      if (!id) return undefined;
      if (id === task.id) throw new AppError(422, 'INVALID_MOVE', 'A task cannot be placed next to itself');
      const n = await trx
        .selectFrom('tasks')
        .select(['position', 'status'])
        .where('id', '=', id)
        .where('project_id', '=', task.project_id)
        .where('deleted_at', 'is', null)
        .where((eb) => (task.parent_task_id ? eb('parent_task_id', '=', task.parent_task_id) : eb('parent_task_id', 'is', null)))
        .executeTakeFirst();
      if (!n || n.status !== input.status) throw new AppError(422, 'INVALID_MOVE', 'The neighbouring card is not in that column');
      return Number(n.position);
    };

    let before = await neighbour(input.beforeId);
    let after = await neighbour(input.afterId);
    if (before !== undefined && after !== undefined && before >= after) {
      throw new AppError(422, 'INVALID_MOVE', 'Neighbouring cards are out of order, refresh and try again');
    }
    let position = positionBetween(before, after);

    if (needsRebalance(before, after, position)) {
      await rebalance(trx, task.project_id, input.status, task.parent_task_id);
      before = await neighbour(input.beforeId);
      after = await neighbour(input.afterId);
      position = positionBetween(before, after);
    }

    await trx.updateTable('tasks').set({ status: input.status, position }).where('id', '=', task.id).execute();
  });
  emitToWorkspace(workspaceId, 'task.changed', { projectKey: task.key, ref: ref.toUpperCase() });
  return detail(workspaceId, ref);
}

/** Renumbers a column to 1024, 2048, 3072… keeping the current order. */
async function rebalance(trx: Transaction<DB>, projectId: string, status: TaskStatus, parentId: string | null) {
  await sql`
    UPDATE tasks t SET position = o.rn * ${STEP}
    FROM (
      SELECT id, row_number() OVER (ORDER BY position, created_at) AS rn
      FROM tasks
      WHERE project_id = ${projectId} AND status = ${status} AND deleted_at IS NULL
        AND ${parentId ? sql`parent_task_id = ${parentId}` : sql`parent_task_id IS NULL`}
    ) o
    WHERE t.id = o.id`.execute(trx);
}

export async function remove(workspaceId: string, ref: string) {
  const task = await resolveTask(workspaceId, ref);
  const now = new Date();
  await db
    .updateTable('tasks')
    .set({ deleted_at: now })
    .where((eb) => eb.or([eb('id', '=', task.id), eb('parent_task_id', '=', task.id)]))
    .where('deleted_at', 'is', null)
    .execute();
  emitToWorkspace(workspaceId, 'task.changed', { projectKey: task.key, ref: ref.toUpperCase() });
}
