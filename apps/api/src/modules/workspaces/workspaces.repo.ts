import type { WorkspaceRole } from '@tasknest/shared';
import { db } from '../../db/index.js';

export async function createWithOwner(v: { name: string; slug: string; ownerId: string }) {
  return db.transaction().execute(async (trx) => {
    const ws = await trx
      .insertInto('workspaces')
      .values({ name: v.name, slug: v.slug, owner_id: v.ownerId })
      .returning(['id', 'name', 'slug', 'plan', 'created_at'])
      .executeTakeFirstOrThrow();
    await trx
      .insertInto('workspace_members')
      .values({ workspace_id: ws.id, user_id: v.ownerId, role: 'owner' })
      .execute();
    return ws;
  });
}

export function slugAvailable(slug: string) {
  return db
    .selectFrom('workspaces')
    .select('id')
    .where('slug', '=', slug)
    .where('deleted_at', 'is', null)
    .executeTakeFirst()
    .then((r) => !r);
}

export function update(id: string, values: { name?: string; slug?: string }) {
  return db
    .updateTable('workspaces')
    .set(values)
    .where('id', '=', id)
    .returning(['id', 'name', 'slug', 'plan', 'created_at'])
    .executeTakeFirstOrThrow();
}

export function softDelete(id: string) {
  return db.updateTable('workspaces').set({ deleted_at: new Date() }).where('id', '=', id).execute();
}

export function listMembers(workspaceId: string) {
  return db
    .selectFrom('workspace_members as m')
    .innerJoin('users as u', 'u.id', 'm.user_id')
    .select(['u.id', 'u.full_name as fullName', 'u.email', 'u.avatar_url as avatarUrl', 'm.role', 'm.joined_at as joinedAt'])
    .where('m.workspace_id', '=', workspaceId)
    .where('u.deleted_at', 'is', null)
    .orderBy('m.joined_at')
    .execute();
}

export function findMember(workspaceId: string, userId: string) {
  return db
    .selectFrom('workspace_members')
    .select(['user_id', 'role'])
    .where('workspace_id', '=', workspaceId)
    .where('user_id', '=', userId)
    .executeTakeFirst();
}

export function setMemberRole(workspaceId: string, userId: string, role: WorkspaceRole) {
  return db
    .updateTable('workspace_members')
    .set({ role })
    .where('workspace_id', '=', workspaceId)
    .where('user_id', '=', userId)
    .execute();
}

export function removeMember(workspaceId: string, userId: string) {
  return db
    .deleteFrom('workspace_members')
    .where('workspace_id', '=', workspaceId)
    .where('user_id', '=', userId)
    .execute();
}

// ---------- Invitations ----------
export function upsertInvitation(v: {
  workspaceId: string;
  email: string;
  role: Exclude<WorkspaceRole, 'owner'>;
  tokenHash: string;
  invitedBy: string;
  expiresAt: Date;
}) {
  // One pending invite per (workspace, email): re-inviting replaces the token and role
  return db.transaction().execute(async (trx) => {
    await trx
      .deleteFrom('invitations')
      .where('workspace_id', '=', v.workspaceId)
      .where('email', '=', v.email)
      .where('accepted_at', 'is', null)
      .execute();
    return trx
      .insertInto('invitations')
      .values({
        workspace_id: v.workspaceId,
        email: v.email,
        role: v.role,
        token_hash: v.tokenHash,
        invited_by: v.invitedBy,
        expires_at: v.expiresAt,
      })
      .returning(['id', 'email', 'role', 'expires_at as expiresAt', 'created_at as createdAt'])
      .executeTakeFirstOrThrow();
  });
}

export function listPendingInvitations(workspaceId: string) {
  return db
    .selectFrom('invitations')
    .select(['id', 'email', 'role', 'expires_at as expiresAt', 'created_at as createdAt'])
    .where('workspace_id', '=', workspaceId)
    .where('accepted_at', 'is', null)
    .where('expires_at', '>', new Date())
    .orderBy('created_at', 'desc')
    .execute();
}

export function deleteInvitation(workspaceId: string, id: string) {
  return db
    .deleteFrom('invitations')
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', id)
    .where('accepted_at', 'is', null)
    .executeTakeFirst();
}

export function findInvitationByHash(tokenHash: string) {
  return db
    .selectFrom('invitations as i')
    .innerJoin('workspaces as w', 'w.id', 'i.workspace_id')
    .leftJoin('users as u', 'u.id', 'i.invited_by')
    .select([
      'i.id',
      'i.email',
      'i.role',
      'i.expires_at',
      'i.accepted_at',
      'i.workspace_id',
      'w.name as workspaceName',
      'w.slug as workspaceSlug',
      'w.deleted_at as workspaceDeletedAt',
      'u.full_name as invitedByName',
    ])
    .where('i.token_hash', '=', tokenHash)
    .executeTakeFirst();
}

export async function acceptInvitation(invitationId: string, workspaceId: string, userId: string, role: WorkspaceRole) {
  await db.transaction().execute(async (trx) => {
    await trx.updateTable('invitations').set({ accepted_at: new Date() }).where('id', '=', invitationId).execute();
    await trx
      .insertInto('workspace_members')
      .values({ workspace_id: workspaceId, user_id: userId, role })
      .onConflict((oc) => oc.columns(['workspace_id', 'user_id']).doNothing())
      .execute();
  });
}
