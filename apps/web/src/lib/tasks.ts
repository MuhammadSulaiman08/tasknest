'use client';

import type { CommentItem, CreateProjectInput, CreateTaskInput, MoveTaskInput, ProjectSummary, TaskCard, TaskDetail, UpdateTaskInput } from '@tasknest/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

const k = {
  projects: (s: string) => ['projects', s] as const,
  board: (s: string, key: string) => ['board', s, key] as const,
  task: (s: string, ref: string) => ['task', s, ref] as const,
  comments: (s: string, ref: string) => ['comments', s, ref] as const,
  my: (s: string) => ['my-tasks', s] as const,
};

// ---------- Projects ----------
export const useProjects = (slug: string) =>
  useQuery({ queryKey: k.projects(slug), queryFn: () => api<{ data: ProjectSummary[] }>(`/w/${slug}/projects`).then((r) => r.data) });

export const useProject = (slug: string, key: string) =>
  useQuery({ queryKey: ['project', slug, key], retry: false, queryFn: () => api<{ data: ProjectSummary }>(`/w/${slug}/projects/${key}`).then((r) => r.data) });

export function useCreateProject(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: CreateProjectInput) => api<{ data: ProjectSummary }>(`/w/${slug}/projects`, { method: 'POST', json: v }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: k.projects(slug) }),
  });
}

export function useUpdateProject(slug: string, key: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: Partial<ProjectSummary> & { leadId?: string | null }) => api<{ data: ProjectSummary }>(`/w/${slug}/projects/${key}`, { method: 'PATCH', json: v }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: k.projects(slug) });
      qc.invalidateQueries({ queryKey: ['project', slug, key] });
    },
  });
}

// ---------- Tasks ----------
export const useBoard = (slug: string, key: string) =>
  useQuery({ queryKey: k.board(slug, key), queryFn: () => api<{ data: TaskCard[] }>(`/w/${slug}/projects/${key}/tasks`).then((r) => r.data) });

export const useTask = (slug: string, ref: string | null) =>
  useQuery({
    queryKey: k.task(slug, ref ?? ''),
    enabled: !!ref,
    retry: false,
    queryFn: () => api<{ data: TaskDetail }>(`/w/${slug}/tasks/${ref}`).then((r) => r.data),
  });

export const useMyTasks = (slug: string) =>
  useQuery({ queryKey: k.my(slug), queryFn: () => api<{ data: (TaskCard & { projectKey: string })[] }>(`/w/${slug}/my-tasks`).then((r) => r.data) });

export const useSearch = (slug: string, q: string) =>
  useQuery({
    queryKey: ['search', slug, q],
    enabled: q.trim().length > 0,
    queryFn: () => api<{ data: (TaskCard & { projectKey: string })[] }>(`/w/${slug}/search?q=${encodeURIComponent(q)}`).then((r) => r.data),
  });

/** After any task write, refresh every list that might show it. */
function useInvalidateTasks(slug: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['board', slug] });
    qc.invalidateQueries({ queryKey: k.my(slug) });
    qc.invalidateQueries({ queryKey: ['task', slug] });
    qc.invalidateQueries({ queryKey: k.projects(slug) });
    qc.invalidateQueries({ queryKey: ['search', slug] });
  };
}

export function useCreateTask(slug: string, key: string) {
  const invalidate = useInvalidateTasks(slug);
  return useMutation({
    mutationFn: (v: CreateTaskInput) => api<{ data: TaskDetail }>(`/w/${slug}/projects/${key}/tasks`, { method: 'POST', json: v }).then((r) => r.data),
    onSuccess: invalidate,
  });
}

export function useUpdateTask(slug: string, ref: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateTasks(slug);
  return useMutation({
    mutationFn: (v: UpdateTaskInput) => api<{ data: TaskDetail }>(`/w/${slug}/tasks/${ref}`, { method: 'PATCH', json: v }).then((r) => r.data),
    // Optimistically show the change in the drawer
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: k.task(slug, ref) });
      const prev = qc.getQueryData<TaskDetail>(k.task(slug, ref));
      if (prev) qc.setQueryData(k.task(slug, ref), { ...prev, ...v } as TaskDetail);
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(k.task(slug, ref), ctx.prev),
    onSuccess: (data) => qc.setQueryData(k.task(slug, ref), data),
    onSettled: invalidate,
  });
}

export function useMoveTask(slug: string, key: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ref, ...v }: MoveTaskInput & { ref: string }) => api<{ data: TaskDetail }>(`/w/${slug}/tasks/${ref}/move`, { method: 'PATCH', json: v }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: k.board(slug, key) });
      qc.invalidateQueries({ queryKey: k.my(slug) });
      qc.invalidateQueries({ queryKey: k.projects(slug) });
    },
  });
}

export function useDeleteTask(slug: string) {
  const invalidate = useInvalidateTasks(slug);
  return useMutation({ mutationFn: (ref: string) => api(`/w/${slug}/tasks/${ref}`, { method: 'DELETE' }), onSuccess: invalidate });
}

// ---------- Comments ----------
export const useComments = (slug: string, ref: string) =>
  useQuery({ queryKey: k.comments(slug, ref), queryFn: () => api<{ data: CommentItem[] }>(`/w/${slug}/tasks/${ref}/comments`).then((r) => r.data) });

export function useCommentMutations(slug: string, ref: string) {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: k.comments(slug, ref) });
    qc.invalidateQueries({ queryKey: ['board', slug] });
  };
  return {
    add: useMutation({
      mutationFn: (v: { body: string; parentCommentId?: string | null }) => api<{ data: CommentItem }>(`/w/${slug}/tasks/${ref}/comments`, { method: 'POST', json: v }),
      onSuccess: refresh,
    }),
    edit: useMutation({
      mutationFn: (v: { id: string; body: string }) => api(`/w/${slug}/comments/${v.id}`, { method: 'PATCH', json: { body: v.body } }),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: (id: string) => api(`/w/${slug}/comments/${id}`, { method: 'DELETE' }), onSuccess: refresh }),
  };
}
