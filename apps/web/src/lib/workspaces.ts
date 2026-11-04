'use client';

import type { WorkspaceRole } from '@tasknest/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export interface Member { id: string; fullName: string; email: string; avatarUrl: string | null; role: WorkspaceRole; joinedAt: string }
export interface Invitation { id: string; email: string; role: WorkspaceRole; expiresAt: string; createdAt: string; inviteUrl?: string }
export interface Workspace { id: string; name: string; slug: string; role: WorkspaceRole }

export const useWorkspace = (slug: string) =>
  useQuery({ queryKey: ['workspace', slug], queryFn: () => api<{ data: Workspace }>(`/w/${slug}`).then((r) => r.data), retry: false });

export const useMembers = (slug: string) =>
  useQuery({ queryKey: ['members', slug], queryFn: () => api<{ data: Member[] }>(`/w/${slug}/members`).then((r) => r.data) });

export const useInvitations = (slug: string, enabled: boolean) =>
  useQuery({ queryKey: ['invitations', slug], enabled, queryFn: () => api<{ data: Invitation[] }>(`/w/${slug}/invitations`).then((r) => r.data) });

export function useInvite(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { email: string; role: string }) => api<{ data: Invitation }>(`/w/${slug}/invitations`, { method: 'POST', json: v }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invitations', slug] }),
  });
}

export function useRevokeInvite(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/w/${slug}/invitations/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invitations', slug] }),
  });
}

export function useChangeRole(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { userId: string; role: string }) => api(`/w/${slug}/members/${v.userId}`, { method: 'PATCH', json: { role: v.role } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', slug] }),
  });
}

export function useRemoveMember(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api(`/w/${slug}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', slug] }),
  });
}

export const canAdmin = (role?: WorkspaceRole) => role === 'owner' || role === 'admin';
