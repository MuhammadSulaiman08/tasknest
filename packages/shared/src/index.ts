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

// ---------- Projects ----------
export const projectKeySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9]{1,9}$/, 'Key must be 2–10 letters or numbers, starting with a letter');

const optionalDate = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v ? v : v === undefined ? undefined : null));

export const createProjectSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(150),
    key: projectKeySchema,
    description: z.string().trim().max(5000).optional(),
    leadId: z.string().uuid().nullable().optional(),
    startDate: optionalDate,
    dueDate: optionalDate,
  })
  .refine((v) => !v.startDate || !v.dueDate || v.dueDate >= v.startDate, {
    message: 'Due date must be on or after the start date',
    path: ['dueDate'],
  });
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  leadId: z.string().uuid().nullable().optional(),
  status: z.enum(projectStatuses).optional(),
  startDate: optionalDate,
  dueDate: optionalDate,
});

/** Suggest a project key from its name: "Website Redesign" -> "WR", "Website" -> "WEB" */
export function suggestProjectKey(name: string): string {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  let key = words.length > 1 ? words.map((w) => w[0]).join('') : words[0].slice(0, 3);
  if (!/^[A-Z]/.test(key)) key = `P${key}`;
  return key.slice(0, 10).padEnd(2, 'X');
}

// ---------- Tasks ----------
// Accepts YYYY-MM-DD (stored as the end of that day, UTC) or a full ISO timestamp
const dueDateSchema = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.string().datetime({ offset: true }), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === undefined ? undefined : !v ? null : v.length === 10 ? `${v}T23:59:59Z` : v));

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(255),
  description: z.string().max(20000).optional(),
  status: z.enum(taskStatuses).default('todo'),
  priority: z.enum(taskPriorities).default('medium'),
  assigneeId: z.string().uuid().nullable().optional(),
  dueDate: dueDateSchema,
  estimatePoints: z.number().int().min(0).max(1000).nullable().optional(),
  parentTaskId: z.string().uuid().nullable().optional(),
});
export type CreateTaskInput = z.input<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(255),
    description: z.string().max(20000).nullable(),
    status: z.enum(taskStatuses),
    priority: z.enum(taskPriorities),
    assigneeId: z.string().uuid().nullable(),
    dueDate: dueDateSchema,
    estimatePoints: z.number().int().min(0).max(1000).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateTaskInput = z.input<typeof updateTaskSchema>;

/** Drop a card into `status`, between the card above (beforeId) and the card below (afterId). */
export const moveTaskSchema = z.object({
  status: z.enum(taskStatuses),
  beforeId: z.string().uuid().nullable().optional(),
  afterId: z.string().uuid().nullable().optional(),
});
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;

export interface UserRef {
  id: string;
  fullName: string;
}

export interface TaskCard {
  id: string;
  ref: string; // e.g. "WEB-42"
  number: number;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  position: number;
  assignee: UserRef | null;
  dueDate: string | null;
  estimatePoints: number | null;
  parentTaskId: string | null;
  subtaskCount: number;
  subtasksDone: number;
  commentCount: number;
  completedAt: string | null;
  updatedAt: string;
}

export interface TaskDetail extends TaskCard {
  description: string | null;
  reporter: UserRef | null;
  project: { id: string; key: string; name: string };
  parent: { id: string; ref: string; title: string } | null;
  subtasks: TaskCard[];
  createdAt: string;
}

export interface ProjectSummary {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: (typeof projectStatuses)[number];
  lead: UserRef | null;
  startDate: string | null;
  dueDate: string | null;
  openTasks: number;
  totalTasks: number;
  createdAt: string;
}

// ---------- Comments ----------
export const commentBodySchema = z.object({
  body: z.string().trim().min(1, 'Write something first').max(10000),
  parentCommentId: z.string().uuid().nullable().optional(),
});

export interface CommentItem {
  id: string;
  body: string;
  author: UserRef | null;
  parentCommentId: string | null;
  isEdited: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------- Display helpers ----------
export const statusLabels: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'To do',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done',
  cancelled: 'Cancelled',
};

export const priorityLabels: Record<TaskPriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

/** "web-42" -> { key: "WEB", number: 42 } */
export function parseTaskRef(ref: string): { key: string; number: number } | null {
  const m = /^([A-Za-z][A-Za-z0-9]{1,9})-(\d{1,9})$/.exec(ref.trim());
  return m ? { key: m[1].toUpperCase(), number: Number(m[2]) } : null;
}

// ---------- Mentions ----------
/** Mentions are stored in comment bodies as @[Full Name](user:<uuid>) and rendered as "@Full Name". */
export const MENTION_PATTERN = /@\[([^\]\n]{1,120})\]\(user:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/g;

export const mentionToken = (user: UserRef) => `@[${user.fullName.replace(/[\]\n]/g, '')}](user:${user.id})`;

export function extractMentionIds(body: string): string[] {
  return [...new Set([...body.matchAll(MENTION_PATTERN)].map((m) => m[2]))];
}

/** Plain-text version of a comment, with mention tokens turned into "@Name". */
export const stripMentions = (body: string) => body.replace(MENTION_PATTERN, (_m, name) => `@${name}`);

// ---------- Notifications ----------
export type NotificationType = 'assigned' | 'mentioned' | 'commented' | 'due_soon';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  actor: UserRef | null;
  task: { ref: string; title: string } | null;
  excerpt: string | null; // comment text for mentions and comments
  read: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  data: NotificationItem[];
  unreadCount: number;
}

// ---------- Real-time events (server -> browser) ----------
export interface RealtimeEvents {
  'task.changed': { projectKey: string; ref: string };
  'comment.changed': { ref: string };
  'project.changed': { key: string };
  'notification.created': { id: string };
}
