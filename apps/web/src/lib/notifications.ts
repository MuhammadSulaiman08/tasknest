'use client';

import type { NotificationsResponse } from '@tasknest/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export const useNotifications = (slug: string) =>
  useQuery({
    queryKey: ['notifications', slug],
    queryFn: () => api<NotificationsResponse>(`/w/${slug}/notifications`),
    refetchInterval: 60_000, // fallback if the live connection drops
  });

export function useMarkRead(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => api(`/w/${slug}/notifications/read`, { method: 'POST', json: ids ? { ids } : {} }),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: ['notifications', slug] });
      qc.setQueryData<NotificationsResponse>(['notifications', slug], (old) =>
        old && {
          data: old.data.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)),
          unreadCount: ids ? Math.max(0, old.unreadCount - old.data.filter((n) => ids.includes(n.id) && !n.read).length) : 0,
        },
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['notifications', slug] }),
  });
}
