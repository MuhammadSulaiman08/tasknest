import { Router } from 'express';
import { z } from 'zod';
import { createWorkspaceSchema, emailSchema, slugSchema, updateMemberRoleSchema, updateWorkspaceSchema } from '@tasknest/shared';
import { AppError } from '../../lib/AppError.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validateBody } from '../../middleware/validate.js';
import { loadWorkspace, requireRole } from '../../middleware/workspace.js';
import * as svc from './workspaces.service.js';

const inviteSchema = z.object({ email: emailSchema, role: z.enum(['admin', 'member', 'guest']).default('member') });

export const workspacesRouter = Router();

// ----- Not tied to one workspace -----
workspacesRouter.post('/workspaces', authenticate, validateBody(createWorkspaceSchema), async (req, res) => {
  const ws = await svc.create(req.userId!, req.body);
  res.status(201).json({ data: { ...ws, role: 'owner' } });
});

workspacesRouter.get('/workspaces/slug-available', authenticate, async (req, res) => {
  const parsed = slugSchema.safeParse(req.query.slug);
  if (!parsed.success) return res.json({ data: { available: false, reason: parsed.error.issues[0].message } });
  res.json({ data: { available: await svc.checkSlug(parsed.data) } });
});

workspacesRouter.get('/invitations/:token', async (req, res) => {
  res.json({ data: await svc.previewInvitation(String(req.params.token)) });
});

workspacesRouter.post('/invitations/:token/accept', authenticate, async (req, res) => {
  res.json({ data: await svc.acceptInvitation(String(req.params.token), req.userId!) });
});

// ----- Scoped to /w/:slug -----
const w = Router({ mergeParams: true });
workspacesRouter.use('/w/:slug', authenticate, loadWorkspace, w);

w.get('/', (req, res) => {
  const { id, name, slug, role } = req.workspace!;
  res.json({ data: { id, name, slug, role } });
});

w.patch('/', requireRole('admin'), validateBody(updateWorkspaceSchema), async (req, res) => {
  res.json({ data: await svc.update(req.workspace!, req.body) });
});

w.delete('/', requireRole('owner'), async (req, res) => {
  await svc.remove(req.workspace!);
  res.status(204).end();
});

w.get('/members', async (req, res) => {
  res.json({ data: await svc.listMembers(req.workspace!) });
});

w.patch('/members/:userId', requireRole('admin'), validateBody(updateMemberRoleSchema), async (req, res) => {
  await svc.changeRole(req.workspace!, req.userId!, String(req.params.userId), req.body.role);
  res.status(204).end();
});

w.delete('/members/:userId', async (req, res) => {
  await svc.removeMember(req.workspace!, req.userId!, req.workspace!.role, String(req.params.userId));
  res.status(204).end();
});

w.get('/invitations', requireRole('admin'), async (req, res) => {
  res.json({ data: await svc.listInvitations(req.workspace!) });
});

w.post('/invitations', requireRole('admin'), validateBody(inviteSchema), async (req, res) => {
  res.status(201).json({ data: await svc.invite(req.workspace!, req.userId!, req.body.email, req.body.role) });
});

w.delete('/invitations/:id', requireRole('admin'), async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) throw new AppError(404, 'INVITATION_NOT_FOUND', 'Invitation not found');
  await svc.revokeInvitation(req.workspace!, String(req.params.id));
  res.status(204).end();
});
