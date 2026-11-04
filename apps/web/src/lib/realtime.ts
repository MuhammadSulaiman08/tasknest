'use client';

import type { RealtimeEvents } from '@tasknest/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken, refreshSession } from './api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Live updates: one socket per open workspace. Each server event invalidates the
 * matching TanStack Query caches, so boards, drawers and the bell refresh by themselves.
 */
export function useRealtime(slug: string) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket: Socket = io(API_URL, {
      path: '/socket.io',
      transports: ['websocket'],
      // Called on every (re)connect, so an expired token is replaced by the latest one
      auth: (cb) => cb({ token: getAccessToken() ?? '' }),
    });

    const handlers: { [E in keyof RealtimeEvents]: (p: RealtimeEvents[E]) => void } = {
      'task.changed': ({ projectKey, ref }) => {
        qc.invalidateQueries({ queryKey: ['board', slug, projectKey] });
        qc.invalidateQueries({ queryKey: ['task', slug, ref] });
        qc.invalidateQueries({ queryKey: ['my-tasks', slug] });
        qc.invalidateQueries({ queryKey: ['projects', slug] });
      },
      'comment.changed': ({ ref }) => {
        qc.invalidateQueries({ queryKey: ['comments', slug, ref] });
        qc.invalidateQueries({ queryKey: ['board', slug] });
      },
      'project.changed': () => qc.invalidateQueries({ queryKey: ['projects', slug] }),
      'notification.created': () => qc.invalidateQueries({ queryKey: ['notifications', slug] }),
    };
    for (const [event, fn] of Object.entries(handlers)) socket.on(event, fn as (p: unknown) => void);

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('workspace:join', { slug });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', async (err) => {
      setConnected(false);
      if (err.message === 'UNAUTHENTICATED' && (await refreshSession())) socket.connect();
    });
    return () => {
      socket.close();
    };
  }, [slug, qc]);

  return connected;
}
