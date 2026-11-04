import { Router } from 'express';
import { z } from 'zod';
import { commentBodySchema } from '@tasknest/shared';
import { AppError } from '../../lib/AppError.js';
import { validateBody } from '../../middleware/validate.js';
import * as svc from './comments.service.js';

export const commentsRouter = Router();
const uuid = z.string().uuid();
const commentId = (raw: unknown) => {
  const r = uuid.safeParse(raw);
  if (!r.success) throw new AppError(404, 'COMMENT_NOT_FOUND', 'Comment not found');
  return r.data;
};

// Every role, including guests, can read and write comments
commentsRouter.get('/tasks/:ref/comments', async (req, res) => {
  res.json({ data: await svc.list(req.workspace!.id, String(req.params.ref)) });
});

commentsRouter.post('/tasks/:ref/comments', validateBody(commentBodySchema), async (req, res) => {
  res.status(201).json({ data: await svc.create(req.workspace!.id, req.userId!, String(req.params.ref), req.body) });
});

commentsRouter.patch('/comments/:id', validateBody(commentBodySchema.pick({ body: true })), async (req, res) => {
  res.json({ data: await svc.edit(req.workspace!.id, req.userId!, commentId(req.params.id), req.body.body) });
});

commentsRouter.delete('/comments/:id', async (req, res) => {
  await svc.remove(req.workspace!.id, req.userId!, req.workspace!.role, commentId(req.params.id));
  res.status(204).end();
});
