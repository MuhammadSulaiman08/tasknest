import type { RealtimeEvents } from '@tasknest/shared';
import type { Server } from 'socket.io';

/**
 * Thin wrapper so services can publish events without knowing about Socket.IO.
 * When no socket server is attached (tests, scripts) every emit is a no-op.
 */
let io: Server | null = null;

export const attachIo = (server: Server | null) => {
  io = server;
};

export const workspaceRoom = (workspaceId: string) => `ws:${workspaceId}`;
export const userRoom = (userId: string) => `user:${userId}`;

export function emitToWorkspace<E extends keyof RealtimeEvents>(workspaceId: string, event: E, payload: RealtimeEvents[E]) {
  io?.to(workspaceRoom(workspaceId)).emit(event, payload);
}

export function emitToUser<E extends keyof RealtimeEvents>(userId: string, event: E, payload: RealtimeEvents[E]) {
  io?.to(userRoom(userId)).emit(event, payload);
}
