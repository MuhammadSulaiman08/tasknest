import { Router } from 'express';
import { createTaskSchema, moveTaskSchema, updateTaskSchema } from '@tasknest/shared';
import { validateBody } from '../../middleware/validate.js';
import { requireRole } from '../../middleware/workspace.js';
import * as svc from './tasks.service.js';

export const tasksRouter = Router();

// Board data: every live top-level task in the project
tasksRouter.get('/projects/:key/tasks', async (req, res) => {
  res.json({ data: await svc.board(req.workspace!.id, String(req.params.key)) });
});

tasksRouter.post('/projects/:key/tasks', requireRole('member'), validateBody(createTaskSchema), async (req, res) => {
  res.status(201).json({ data: await svc.create(req.workspace!.id, req.userId!, String(req.params.key), req.body) });
});

tasksRouter.get('/my-tasks', async (req, res) => {
  res.json({ data: await svc.myTasks(req.workspace!.id, req.userId!) });
});

tasksRouter.get('/search', async (req, res) => {
  res.json({ data: await svc.search(req.workspace!.id, String(req.query.q ?? '')) });
});

tasksRouter.get('/tasks/:ref', async (req, res) => {
  res.json({ data: await svc.detail(req.workspace!.id, String(req.params.ref)) });
});

tasksRouter.patch('/tasks/:ref', requireRole('member'), validateBody(updateTaskSchema), async (req, res) => {
  res.json({ data: await svc.update(req.workspace!.id, String(req.params.ref), req.body) });
});

tasksRouter.patch('/tasks/:ref/move', requireRole('member'), validateBody(moveTaskSchema), async (req, res) => {
  res.json({ data: await svc.move(req.workspace!.id, String(req.params.ref), req.body) });
});

tasksRouter.delete('/tasks/:ref', requireRole('member'), async (req, res) => {
  await svc.remove(req.workspace!.id, String(req.params.ref));
  res.status(204).end();
});
