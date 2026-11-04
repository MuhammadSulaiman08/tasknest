import type { CreateProjectInput, ProjectSummary } from '@tasknest/shared';
import { sql } from 'kysely';
import { db } from '../../db/index.js';
import { AppError } from '../../lib/AppError.js';
import { assertMember, toDateOnly } from '../../lib/members.js';
import { emitToWorkspace } from '../../realtime/bus.js';

function baseQuery(workspaceId: string) {
  return db
    .selectFrom('projects as p')
    .leftJoin('users as l', 'l.id', 'p.lead_id')
    .select([
      'p.id',
      'p.key',
      'p.name',
      'p.description',
      'p.status',
      'p.start_date',
      'p.due_date',
      'p.created_at',
      'l.id as leadId',
      'l.full_name as leadName',
      sql<number>`(SELECT count(*)::int FROM tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL AND t.parent_task_id IS NULL)`.as('totalTasks'),
      sql<number>`(SELECT count(*)::int FROM tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL AND t.parent_task_id IS NULL AND t.status NOT IN ('done', 'cancelled'))`.as('openTasks'),
    ])
    .where('p.workspace_id', '=', workspaceId)
    .where('p.deleted_at', 'is', null);
}

type Row = Awaited<ReturnType<ReturnType<typeof baseQuery>['executeTakeFirstOrThrow']>>;

const toSummary = (r: Row): ProjectSummary => ({
  id: r.id,
  key: r.key,
  name: r.name,
  description: r.description,
  status: r.status,
  lead: r.leadId ? { id: r.leadId, fullName: r.leadName! } : null,
  startDate: toDateOnly(r.start_date),
  dueDate: toDateOnly(r.due_date),
  openTasks: r.openTasks,
  totalTasks: r.totalTasks,
  createdAt: r.created_at.toISOString(),
});

export async function list(workspaceId: string) {
  const rows = await baseQuery(workspaceId).orderBy('p.name').execute();
  return rows.map(toSummary);
}

export async function getByKey(workspaceId: string, key: string) {
  const row = await baseQuery(workspaceId).where('p.key', '=', key.toUpperCase()).executeTakeFirst();
  if (!row) throw new AppError(404, 'PROJECT_NOT_FOUND', 'Project not found');
  return toSummary(row);
}

export async function create(workspaceId: string, userId: string, input: CreateProjectInput) {
  await assertMember(workspaceId, input.leadId, 'leadId');
  const { id } = await db
    .insertInto('projects')
    .values({
      workspace_id: workspaceId,
      name: input.name,
      key: input.key,
      description: input.description || null,
      lead_id: input.leadId ?? null,
      created_by: userId,
      start_date: input.startDate ?? null,
      due_date: input.dueDate ?? null,
    })
    .returning('id')
    .executeTakeFirstOrThrow(); // 23505 on projects_workspace_key_uq -> PROJECT_KEY_TAKEN
  emitToWorkspace(workspaceId, 'project.changed', { key: input.key });
  return getByKey(workspaceId, input.key);
}

export async function update(
  workspaceId: string,
  key: string,
  input: { name?: string; description?: string | null; leadId?: string | null; status?: ProjectSummary['status']; startDate?: string | null; dueDate?: string | null },
) {
  const project = await getByKey(workspaceId, key);
  await assertMember(workspaceId, input.leadId, 'leadId');
  const start = input.startDate !== undefined ? input.startDate : project.startDate;
  const due = input.dueDate !== undefined ? input.dueDate : project.dueDate;
  if (start && due && due < start) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid', { dueDate: 'Due date must be on or after the start date' });
  }
  await db
    .updateTable('projects')
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description || null }),
      ...(input.leadId !== undefined && { lead_id: input.leadId }),
      ...(input.startDate !== undefined && { start_date: input.startDate }),
      ...(input.dueDate !== undefined && { due_date: input.dueDate }),
      ...(input.status !== undefined && {
        status: input.status,
        archived_at: input.status === 'archived' ? new Date() : null,
      }),
    })
    .where('id', '=', project.id)
    .execute();
  emitToWorkspace(workspaceId, 'project.changed', { key: project.key });
  return getByKey(workspaceId, key);
}

/** Resolves a project key to its id inside a workspace (404 if missing). */
export async function resolveProject(workspaceId: string, key: string) {
  const row = await db
    .selectFrom('projects')
    .select(['id', 'key', 'name', 'status'])
    .where('workspace_id', '=', workspaceId)
    .where('key', '=', key.toUpperCase())
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (!row) throw new AppError(404, 'PROJECT_NOT_FOUND', 'Project not found');
  return row;
}
