import { Router } from 'express';
import { createProjectSchema, updateProjectSchema } from '@tasknest/shared';
import { validateBody } from '../../middleware/validate.js';
import { requireRole } from '../../middleware/workspace.js';
import * as svc from './projects.service.js';

export const projectsRouter = Router();

projectsRouter.get('/projects', async (req, res) => {
  res.json({ data: await svc.list(req.workspace!.id) });
});

projectsRouter.post('/projects', requireRole('admin'), validateBody(createProjectSchema), async (req, res) => {
  res.status(201).json({ data: await svc.create(req.workspace!.id, req.userId!, req.body) });
});

projectsRouter.get('/projects/:key', async (req, res) => {
  res.json({ data: await svc.getByKey(req.workspace!.id, String(req.params.key)) });
});

projectsRouter.patch('/projects/:key', requireRole('admin'), validateBody(updateProjectSchema), async (req, res) => {
  res.json({ data: await svc.update(req.workspace!.id, String(req.params.key), req.body) });
});
