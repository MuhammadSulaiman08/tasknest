import { z } from 'zod';

// ---------- Enums (mirror the PostgreSQL enum types) ----------
export const workspaceRoles = ['owner', 'admin', 'member', 'guest'] as const;
export const taskStatuses = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled'] as const;
export const taskPriorities = ['low', 'medium', 'high', 'urgent'] as const;
export const projectStatuses = ['active', 'on_hold', 'completed', 'archived'] as const;

export type WorkspaceRole = (typeof workspaceRoles)[number];
export type TaskStatus = (typeof taskStatuses)[number];
export type TaskPriority = (typeof taskPriorities)[number];

// ---------- Auth ----------
export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters'); // bcrypt limit

export const registerSchema = z.object({
  fullName: z.string().trim().min(1, 'Name is required').max(120),
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

// ---------- Workspaces ----------
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, 'URL must be at least 2 characters')
  .max(60)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens');

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  slug: slugSchema,
});
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

export const updateWorkspaceSchema = createWorkspaceSchema.partial();

export const updateMemberRoleSchema = z.object({
  role: z.enum(['admin', 'member', 'guest']),
});

/** Turn a workspace name into a URL slug suggestion: "Sukkur IBA FYP" -> "sukkur-iba-fyp" */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// ---------- API shapes ----------
export interface ApiError {
  error: { code: string; message: string; fields?: Record<string, string>; requestId?: string };
}

export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  timezone: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
}

export interface AuthResponse {
  accessToken: string;
  user: PublicUser;
}

export interface MeResponse {
  user: PublicUser;
  workspaces: WorkspaceSummary[];
}
