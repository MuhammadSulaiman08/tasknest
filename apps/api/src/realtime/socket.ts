import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { logger } from '../lib/logger.js';
import { verifyAccessToken } from '../lib/tokens.js';
import { attachIo, userRoom, workspaceRoom } from './bus.js';

/**
 * Socket.IO server for live updates.
 * - The browser connects with its access token: { auth: { token } }.
 * - Every socket joins its user room (notifications).
 * - "workspace:join" { slug } joins the workspace room after a membership check.
 */
export function attachSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: config.WEB_ORIGIN, credentials: true },
  });

  io.use((socket, next) => {
    try {
      socket.data.userId = verifyAccessToken(String(socket.handshake.auth?.token ?? ''));
      next();
    } catch {
      next(new Error('UNAUTHENTICATED'));
    }
  });

  io.on('connection', (socket) => {
    const userId: string = socket.data.userId;
    socket.join(userRoom(userId));

    socket.on('workspace:join', async (msg: { slug?: string }, ack?: (r: { ok: boolean }) => void) => {
      const ws = await db
        .selectFrom('workspaces as w')
        .innerJoin('workspace_members as m', 'm.workspace_id', 'w.id')
        .select('w.id')
        .where('w.slug', '=', String(msg?.slug ?? '').toLowerCase())
        .where('w.deleted_at', 'is', null)
        .where('m.user_id', '=', userId)
        .executeTakeFirst();
      // Leave any previous workspace room before joining the new one
      for (const room of socket.rooms) if (room.startsWith('ws:')) socket.leave(room);
      if (ws) socket.join(workspaceRoom(ws.id));
      ack?.({ ok: !!ws });
    });
  });

  attachIo(io);
  logger.info('real-time server attached');
  return io;
}
