import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../../middleware/validate.js';
import * as svc from './notifications.service.js';

export const notificationsRouter = Router();

notificationsRouter.get('/notifications', async (req, res) => {
  res.json(await svc.list(req.workspace!.id, req.userId!));
});

// { ids: [...] } marks those as read; an empty body marks everything as read
notificationsRouter.post('/notifications/read', validateBody(z.object({ ids: z.array(z.string().uuid()).max(100).optional() })), async (req, res) => {
  await svc.markRead(req.workspace!.id, req.userId!, req.body.ids);
  res.status(204).end();
});
