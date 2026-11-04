import type { WorkspaceRole } from '@tasknest/shared';
import { config } from '../../config.js';
import { AppError } from '../../lib/AppError.js';
import { hashToken, randomToken } from '../../lib/tokens.js';
import { findUserById } from '../auth/auth.repo.js';
import * as repo from './workspaces.repo.js';

const INVITE_TTL_DAYS = 7;
type Ws = NonNullable<Express.Request['workspace']>;

export const create = (ownerId: string, input: { name: string; slug: string }) =>
  repo.createWithOwner({ ...input, ownerId });

export const checkSlug = (slug: string) => repo.slugAvailable(slug);

export const update = (ws: Ws, input: { name?: string; slug?: string }) => repo.update(ws.id, input);

export const remove = (ws: Ws) => repo.softDelete(ws.id);

export const listMembers = (ws: Ws) => repo.listMembers(ws.id);

export async function changeRole(ws: Ws, actorId: string, targetId: string, role: Exclude<WorkspaceRole, 'owner'>) {
  const target = await repo.findMember(ws.id, targetId);
  if (!target) throw new AppError(404, 'MEMBER_NOT_FOUND', 'Member not found');
  if (target.role === 'owner') throw new AppError(403, 'CANNOT_CHANGE_OWNER', 'The owner\'s role cannot be changed');
  if (targetId === actorId) throw new AppError(403, 'CANNOT_CHANGE_SELF', 'You cannot change your own role');
  await repo.setMemberRole(ws.id, targetId, role);
}

/** Admins can remove others; anyone except the owner can leave. */
export async function removeMember(ws: Ws, actorId: string, actorRole: WorkspaceRole, targetId: string) {
  const target = await repo.findMember(ws.id, targetId);
  if (!target) throw new AppError(404, 'MEMBER_NOT_FOUND', 'Member not found');
  if (target.role === 'owner') throw new AppError(403, 'CANNOT_REMOVE_OWNER', 'The owner cannot be removed');
  const isSelf = targetId === actorId;
  const isAdmin = actorRole === 'admin' || actorRole === 'owner';
  if (!isSelf && !isAdmin) throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do this');
  await repo.removeMember(ws.id, targetId);
}

export async function invite(ws: Ws, invitedBy: string, email: string, role: Exclude<WorkspaceRole, 'owner'>) {
  const token = randomToken();
  const invitation = await repo.upsertInvitation({
    workspaceId: ws.id,
    email,
    role,
    tokenHash: hashToken(token),
    invitedBy,
    expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 864e5),
  });
  // Email delivery arrives with the mailer (v1.2); until then the admin copies this link
  return { ...invitation, inviteUrl: `${config.WEB_ORIGIN}/invite/${token}` };
}

export const listInvitations = (ws: Ws) => repo.listPendingInvitations(ws.id);

export async function revokeInvitation(ws: Ws, id: string) {
  const r = await repo.deleteInvitation(ws.id, id);
  if (!r.numDeletedRows) throw new AppError(404, 'INVITATION_NOT_FOUND', 'Invitation not found');
}

async function loadValidInvitation(token: string) {
  const inv = await repo.findInvitationByHash(hashToken(token));
  if (!inv || inv.workspaceDeletedAt) throw new AppError(404, 'INVITATION_NOT_FOUND', 'This invite link is not valid');
  if (inv.accepted_at) throw new AppError(410, 'INVITATION_USED', 'This invite has already been used');
  if (inv.expires_at < new Date()) throw new AppError(410, 'INVITATION_EXPIRED', 'This invite has expired, ask an admin for a new one');
  return inv;
}

export async function previewInvitation(token: string) {
  const inv = await loadValidInvitation(token);
  return {
    email: inv.email,
    role: inv.role,
    workspace: { name: inv.workspaceName, slug: inv.workspaceSlug },
    invitedBy: inv.invitedByName,
  };
}

export async function acceptInvitation(token: string, userId: string) {
  const inv = await loadValidInvitation(token);
  const user = await findUserById(userId);
  if (!user || user.email.toLowerCase() !== inv.email.toLowerCase()) {
    throw new AppError(403, 'INVITE_EMAIL_MISMATCH', `This invite was sent to ${inv.email}. Sign in with that email to accept it.`);
  }
  await repo.acceptInvitation(inv.id, inv.workspace_id, userId, inv.role);
  return { slug: inv.workspaceSlug, name: inv.workspaceName, role: inv.role };
}
