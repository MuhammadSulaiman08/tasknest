import { priorityLabels, statusLabels, type TaskCard, type TaskPriority, type TaskStatus } from '@tasknest/shared';
import clsx from 'clsx';
import { MessageSquare } from 'lucide-react';
import Link from 'next/link';

export const STATUS_ORDER: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled'];
export const PRIORITY_ORDER: TaskPriority[] = ['urgent', 'high', 'medium', 'low'];

const statusColor: Record<TaskStatus, string> = {
  backlog: '#7A8599',
  todo: 'var(--text-muted)',
  in_progress: 'var(--primary)',
  in_review: '#7A4FC2',
  done: 'var(--success)',
  cancelled: '#9AA3B2',
};

/** Each status has its own shape as well as colour, so it reads without colour (UI/UX Brief 4.2). */
export function StatusIcon({ status, size = 14 }: { status: TaskStatus; size?: number }) {
  const c = statusColor[status];
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" role="img" aria-label={statusLabels[status]} className="shrink-0">
      {status === 'backlog' && <circle cx="8" cy="8" r="6" fill="none" stroke={c} strokeWidth="1.5" strokeDasharray="2.2 2" />}
      {status === 'todo' && <circle cx="8" cy="8" r="6" fill="none" stroke={c} strokeWidth="1.5" />}
      {status === 'in_progress' && (
        <>
          <circle cx="8" cy="8" r="6" fill="none" stroke={c} strokeWidth="1.5" />
          <path d="M8 4a4 4 0 0 1 0 8z" fill={c} />
        </>
      )}
      {status === 'in_review' && (
        <>
          <circle cx="8" cy="8" r="6" fill="none" stroke={c} strokeWidth="1.5" />
          <circle cx="8" cy="8" r="2.2" fill={c} />
        </>
      )}
      {status === 'done' && (
        <>
          <circle cx="8" cy="8" r="7" fill={c} />
          <path d="M5 8.2l2 2 4-4.2" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {status === 'cancelled' && (
        <>
          <circle cx="8" cy="8" r="7" fill={c} />
          <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

const priorityBars: Record<TaskPriority, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
const priorityColor: Record<TaskPriority, string> = { urgent: 'var(--danger)', high: '#E07B24', medium: 'var(--warning)', low: 'var(--text-muted)' };

/** Signal bars: 4 = urgent … 1 = low, plus an accessible label. */
export function PriorityIcon({ priority, withLabel = false }: { priority: TaskPriority; withLabel?: boolean }) {
  const n = priorityBars[priority];
  return (
    <span className="inline-flex items-center gap-1" title={`${priorityLabels[priority]} priority`}>
      <svg width="14" height="14" viewBox="0 0 16 16" role="img" aria-label={`${priorityLabels[priority]} priority`}>
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={1 + i * 3.8} y={12 - i * 3} width="2.6" height={3 + i * 3} rx="0.8" fill={i < n ? priorityColor[priority] : 'var(--border)'} />
        ))}
      </svg>
      {withLabel && <span>{priorityLabels[priority]}</span>}
    </span>
  );
}

export function dueState(dueDate: string | null, status: TaskStatus) {
  if (!dueDate || status === 'done' || status === 'cancelled') return 'normal' as const;
  const ms = new Date(dueDate).getTime() - Date.now();
  if (ms < 0) return 'overdue' as const;
  if (ms < 864e5) return 'soon' as const;
  return 'normal' as const;
}

export const formatDue = (d: string) => {
  const date = new Date(d);
  const sameYear = date.getUTCFullYear() === new Date().getUTCFullYear();
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }), timeZone: 'UTC' });
};

/** Grey normally, amber within 24 h, red "Overdue" when past due and not done. */
export function DueChip({ dueDate, status }: { dueDate: string | null; status: TaskStatus }) {
  if (!dueDate) return null;
  const s = dueState(dueDate, status);
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium',
        s === 'overdue' && 'bg-danger/10 text-danger',
        s === 'soon' && 'bg-warning/15 text-text',
        s === 'normal' && 'bg-canvas text-muted',
      )}
    >
      {s === 'overdue' ? `Overdue · ${formatDue(dueDate)}` : formatDue(dueDate)}
    </span>
  );
}

export function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

export function avatarColor(name: string) {
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
  return `hsl(${hue} 45% 45%)`;
}

export function MiniAvatar({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <span title={name} className="grid shrink-0 place-items-center rounded-full font-semibold text-white" style={{ width: size, height: size, fontSize: size * 0.42, background: avatarColor(name) }}>
      <span aria-hidden>{initials(name)}</span>
      <span className="sr-only">Assigned to {name}</span>
    </span>
  );
}

/** One line in a task list (My tasks, search results). Opens the task drawer. */
export function TaskRow({ task, href }: { task: TaskCard & { projectKey?: string }; href: string }) {
  return (
    <Link href={href} scroll={false} className="flex items-center gap-3 px-4 py-2.5 hover:bg-primary-subtle">
      <StatusIcon status={task.status} />
      <span className="w-16 shrink-0 font-mono text-xs text-muted">{task.ref}</span>
      <span className={clsx('min-w-0 flex-1 truncate', task.status === 'cancelled' && 'text-muted line-through')}>{task.title}</span>
      {task.commentCount > 0 && (
        <span className="hidden items-center gap-1 text-xs text-muted sm:inline-flex">
          <MessageSquare className="size-3.5" aria-hidden /> {task.commentCount}
        </span>
      )}
      <PriorityIcon priority={task.priority} />
      <span className="hidden sm:inline"><DueChip dueDate={task.dueDate} status={task.status} /></span>
      {task.assignee && <MiniAvatar name={task.assignee.fullName} />}
    </Link>
  );
}
