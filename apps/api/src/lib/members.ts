import { db } from '../db/index.js';
import { AppError } from './AppError.js';

/** Throws 422 if `userId` is not a member of the workspace (used for assignees and project leads). */
export async function assertMember(workspaceId: string, userId: string | null | undefined, field: string) {
  if (!userId) return;
  const row = await db
    .selectFrom('workspace_members')
    .select('user_id')
    .where('workspace_id', '=', workspaceId)
    .where('user_id', '=', userId)
    .executeTakeFirst();
  if (!row) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid', { [field]: 'Must be a member of this workspace' });
}

/** Postgres returns DATE columns as Date objects at local midnight; send them as YYYY-MM-DD. */
export const toDateOnly = (d: Date | string | null) => {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
