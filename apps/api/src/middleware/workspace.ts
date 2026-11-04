import type { RequestHandler } from 'express';
import type { WorkspaceRole } from '@tasknest/shared';
import { db } from '../db/index.js';
import { AppError } from '../lib/AppError.js';

const rank: Record<WorkspaceRole, number> = { guest: 0, member: 1, admin: 2, owner: 3 };

/**
 * Loads the workspace from :slug and the caller's role in it.
 * Non-members get 404 (not 403) so workspace names are never revealed.
 */
export const loadWorkspace: RequestHandler = async (req, _res, next) => {
  const row = await db
    .selectFrom('workspaces as w')
    .innerJoin('workspace_members as m', 'm.workspace_id', 'w.id')
    .select(['w.id', 'w.name', 'w.slug', 'w.owner_id as ownerId', 'm.role'])
    .where('w.slug', '=', String(req.params.slug).toLowerCase())
    .where('w.deleted_at', 'is', null)
    .where('m.user_id', '=', req.userId!)
    .executeTakeFirst();
  if (!row) throw new AppError(404, 'WORKSPACE_NOT_FOUND', 'Workspace not found');
  req.workspace = row;
  next();
};

export const requireRole =
  (min: WorkspaceRole): RequestHandler =>
  (req, _res, next) => {
    if (rank[req.workspace!.role] < rank[min]) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do this');
    }
    next();
  };

export const hasRole = (role: WorkspaceRole, min: WorkspaceRole) => rank[role] >= rank[min];
