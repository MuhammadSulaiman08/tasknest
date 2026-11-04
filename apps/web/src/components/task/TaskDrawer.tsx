'use client';

import { priorityLabels, statusLabels, type CommentItem, type TaskDetail, type TaskPriority, type TaskStatus, type UserRef } from '@tasknest/shared';
import clsx from 'clsx';
import { Check, Link2, Loader2, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/forms';
import { useCommentMutations, useComments, useCreateTask, useDeleteTask, useTask, useUpdateTask } from '@/lib/tasks';
import { canAdmin, useMembers, type Workspace } from '@/lib/workspaces';
import { MiniAvatar, PRIORITY_ORDER, PriorityIcon, STATUS_ORDER, StatusIcon, formatDue } from './bits';
import { CommentBody, MentionInput, fromStored, toStored, type MentionInputHandle } from './MentionInput';

const timeAgo = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

/** Renders the drawer when the URL has ?task=REF; closing removes the parameter. */
export function TaskDrawerHost({ workspace }: { workspace: Workspace }) {
  const params = useSearchParams();
  const ref = params.get('task');
  const router = useRouter();
  const pathname = usePathname();
  const close = () => {
    const q = new URLSearchParams(params.toString());
    q.delete('task');
    router.push(q.size ? `${pathname}?${q}` : pathname, { scroll: false });
  };
  useEffect(() => {
    if (!ref) return;
    // Escape in a field leaves the field (keeping its text); Escape again closes the drawer
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const el = e.target as HTMLElement;
      if (el.closest('input,textarea,select')) el.blur();
      else close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, params]);
  if (!ref) return null;
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/30" onClick={close} aria-hidden />
      <aside role="dialog" aria-modal="true" aria-label={`Task ${ref}`} className="absolute inset-y-0 right-0 flex w-full flex-col bg-surface shadow-2xl sm:w-[520px]">
        <TaskPanel key={ref} workspace={workspace} taskRef={ref} onClose={close} />
      </aside>
    </div>
  );
}

function SaveState({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (state === 'idle') return null;
  return (
    <span className={clsx('inline-flex items-center gap-1 text-xs', state === 'error' ? 'text-danger' : 'text-muted')} aria-live="polite">
      {state === 'saving' && <Loader2 className="size-3 animate-spin" />}
      {state === 'saved' && <Check className="size-3" />}
      {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : 'Could not save'}
    </span>
  );
}

function TaskPanel({ workspace, taskRef, onClose }: { workspace: Workspace; taskRef: string; onClose: () => void }) {
  const slug = workspace.slug;
  const { data: task, isLoading, error } = useTask(slug, taskRef);
  const update = useUpdateTask(slug, taskRef);
  const del = useDeleteTask(slug);
  const members = useMembers(slug);
  const canEdit = workspace.role !== 'guest';
  const [save, setSave] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [copied, setCopied] = useState(false);
  const [fieldError, setFieldError] = useState('');

  async function patch(v: Parameters<typeof update.mutateAsync>[0]) {
    setSave('saving');
    setFieldError('');
    try {
      await update.mutateAsync(v);
      setSave('saved');
    } catch (err) {
      setSave('error');
      setFieldError(errorMessage(err));
    }
  }

  if (isLoading)
    return (
      <div className="grid flex-1 place-items-center" role="status" aria-label="Loading task">
        <Loader2 className="size-6 animate-spin text-muted" />
      </div>
    );
  if (error || !task)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="font-semibold">We could not find {taskRef}</p>
        <p className="text-muted">It may have been deleted.</p>
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </div>
    );

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <span className="font-mono text-[13px] text-muted">{task.ref}</span>
        <span className="text-muted">·</span>
        <Link href={`/w/${slug}/p/${task.project.key}`} className="truncate text-[13px] text-muted hover:text-text hover:underline">{task.project.name}</Link>
        <span className="ml-2"><SaveState state={save} /></span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => navigator.clipboard.writeText(`${location.origin}/w/${slug}/t/${task.ref}`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
            className="rounded-md p-1.5 text-muted hover:bg-primary-subtle hover:text-text"
            aria-label="Copy link to task"
            title={copied ? 'Copied' : 'Copy link'}
          >
            {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
          </button>
          {canEdit && (
            <button
              onClick={async () => {
                if (!confirm(`Delete ${task.ref}${task.subtaskCount ? ` and its ${task.subtaskCount} subtasks` : ''}?`)) return;
                await del.mutateAsync(task.ref);
                onClose();
              }}
              className="rounded-md p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
              aria-label="Delete task"
              title="Delete task"
            >
              <Trash2 className="size-4" />
            </button>
          )}
          <button onClick={onClose} className="rounded-md p-1.5 text-muted hover:bg-primary-subtle hover:text-text" aria-label="Close task">
            <X className="size-4" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {task.parent && (
          <Link href={`?task=${task.parent.ref}`} scroll={false} className="mb-2 inline-block text-xs text-muted hover:text-text">
            ↑ Subtask of <span className="font-mono">{task.parent.ref}</span> {task.parent.title}
          </Link>
        )}
        <TitleField task={task} canEdit={canEdit} onSave={(title) => patch({ title })} />
        {fieldError && <p role="alert" className="mt-1 text-xs text-danger">{fieldError}</p>}

        <dl className="mt-5 grid grid-cols-[110px_1fr] items-center gap-x-3 gap-y-2.5 text-[13px]">
          <dt className="text-muted">Status</dt>
          <dd>
            <SelectField
              label="Status"
              value={task.status}
              disabled={!canEdit}
              onChange={(v) => patch({ status: v as TaskStatus })}
              options={STATUS_ORDER.map((s) => ({ value: s, label: statusLabels[s] }))}
              icon={<StatusIcon status={task.status} />}
            />
          </dd>
          <dt className="text-muted">Assignee</dt>
          <dd>
            <SelectField
              label="Assignee"
              value={task.assignee?.id ?? ''}
              disabled={!canEdit}
              onChange={(v) => patch({ assigneeId: v || null })}
              options={[{ value: '', label: 'Unassigned' }, ...(members.data ?? []).filter((m) => m.role !== 'guest' || m.id === task.assignee?.id).map((m) => ({ value: m.id, label: m.fullName }))]}
              icon={task.assignee ? <MiniAvatar name={task.assignee.fullName} size={18} /> : null}
            />
          </dd>
          <dt className="text-muted">Priority</dt>
          <dd>
            <SelectField
              label="Priority"
              value={task.priority}
              disabled={!canEdit}
              onChange={(v) => patch({ priority: v as TaskPriority })}
              options={PRIORITY_ORDER.map((p) => ({ value: p, label: priorityLabels[p] }))}
              icon={<PriorityIcon priority={task.priority} />}
            />
          </dd>
          <dt className="text-muted">Due date</dt>
          <dd>
            {canEdit ? (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  aria-label="Due date"
                  value={task.dueDate ? task.dueDate.slice(0, 10) : ''}
                  onChange={(e) => patch({ dueDate: e.target.value || null })}
                  className="h-8 rounded-md border border-border bg-surface px-2 text-[13px]"
                />
                {task.dueDate && (
                  <button onClick={() => patch({ dueDate: null })} className="text-xs text-muted hover:text-text">Clear</button>
                )}
              </div>
            ) : (
              <span>{task.dueDate ? formatDue(task.dueDate) : 'No due date'}</span>
            )}
          </dd>
          <dt className="text-muted">Estimate</dt>
          <dd>
            {canEdit ? (
              <input
                type="number"
                min={0}
                max={1000}
                aria-label="Estimate in points"
                defaultValue={task.estimatePoints ?? ''}
                placeholder="Points"
                onBlur={(e) => {
                  const v = e.target.value === '' ? null : Number(e.target.value);
                  if (v !== task.estimatePoints) patch({ estimatePoints: v });
                }}
                className="h-8 w-24 rounded-md border border-border bg-surface px-2 text-[13px]"
              />
            ) : (
              <span>{task.estimatePoints ?? '–'}</span>
            )}
          </dd>
          <dt className="text-muted">Reporter</dt>
          <dd className="flex items-center gap-2">{task.reporter ? <><MiniAvatar name={task.reporter.fullName} size={18} /> {task.reporter.fullName}</> : '–'}</dd>
          <dt className="text-muted">Created</dt>
          <dd>{new Date(task.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</dd>
        </dl>

        <DescriptionField task={task} canEdit={canEdit} onSave={(description) => patch({ description })} />
        {!task.parent && <Subtasks task={task} slug={slug} canEdit={canEdit} />}
        <Comments slug={slug} taskRef={task.ref} workspace={workspace} />
      </div>
    </>
  );
}

function SelectField({ label, value, options, onChange, disabled, icon }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; disabled: boolean; icon?: React.ReactNode }) {
  const current = options.find((o) => o.value === value)?.label ?? '–';
  if (disabled) return <span className="inline-flex items-center gap-2">{icon}{current}</span>;
  return (
    <span className="relative inline-flex items-center gap-2 rounded-md px-2 py-1 hover:bg-primary-subtle">
      {icon}
      <span>{current}</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0">
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </span>
  );
}

function TitleField({ task, canEdit, onSave }: { task: TaskDetail; canEdit: boolean; onSave: (t: string) => void }) {
  const [value, setValue] = useState(task.title);
  useEffect(() => setValue(task.title), [task.title]);
  if (!canEdit) return <h2 className="text-lg font-semibold leading-7">{task.title}</h2>;
  const commit = () => {
    const t = value.trim();
    if (!t) return setValue(task.title);
    if (t !== task.title) onSave(t);
  };
  return (
    <textarea
      aria-label="Task title"
      value={value}
      rows={1}
      maxLength={255}
      onChange={(e) => setValue(e.target.value.replace(/\n/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
      className="field-sizing-content w-full resize-none rounded-md border border-transparent bg-transparent px-1 py-0.5 text-lg font-semibold leading-7 hover:border-border focus:border-primary"
    />
  );
}

function DescriptionField({ task, canEdit, onSave }: { task: TaskDetail; canEdit: boolean; onSave: (d: string | null) => void }) {
  const [value, setValue] = useState(task.description ?? '');
  useEffect(() => setValue(task.description ?? ''), [task.description]);
  return (
    <section className="mt-6">
      <h3 className="mb-2 text-[13px] font-semibold">Description</h3>
      {canEdit ? (
        <textarea
          aria-label="Description"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => value !== (task.description ?? '') && onSave(value.trim() ? value : null)}
          placeholder="Add more detail…"
          rows={4}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm leading-5"
        />
      ) : (
        <p className="whitespace-pre-wrap text-sm leading-5">{task.description || <span className="text-muted">No description</span>}</p>
      )}
    </section>
  );
}

function Subtasks({ task, slug, canEdit }: { task: TaskDetail; slug: string; canEdit: boolean }) {
  const create = useCreateTask(slug, task.project.key);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  return (
    <section className="mt-6">
      <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
        Subtasks
        {task.subtaskCount > 0 && <span className="font-normal text-muted">{task.subtasksDone} of {task.subtaskCount} done</span>}
      </h3>
      {task.subtaskCount > 0 && (
        <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-canvas" aria-hidden>
          <div className="h-full bg-success" style={{ width: `${(task.subtasksDone / task.subtaskCount) * 100}%` }} />
        </div>
      )}
      <ul className="divide-y divide-border rounded-md border border-border empty:hidden">
        {task.subtasks.map((s) => (
          <li key={s.id}>
            <Link href={`?task=${s.ref}`} scroll={false} className="flex items-center gap-2 px-3 py-2 hover:bg-primary-subtle">
              <StatusIcon status={s.status} />
              <span className="font-mono text-xs text-muted">{s.ref}</span>
              <span className={clsx('flex-1 truncate', s.status === 'done' && 'text-muted line-through')}>{s.title}</span>
              {s.assignee && <MiniAvatar name={s.assignee.fullName} size={18} />}
            </Link>
          </li>
        ))}
      </ul>
      {canEdit && (
        <form
          className="mt-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim()) return;
            setError('');
            try {
              await create.mutateAsync({ title: title.trim(), parentTaskId: task.id });
              setTitle('');
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          <input aria-label="New subtask title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="+ Add subtask, then Enter" className="h-8 w-full rounded-md border border-dashed border-border bg-transparent px-3 text-[13px] focus:border-solid focus:border-primary" />
          {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
        </form>
      )}
    </section>
  );
}

function Comments({ slug, taskRef, workspace }: { slug: string; taskRef: string; workspace: Workspace }) {
  const { me } = useAuth();
  const { data: comments, isLoading } = useComments(slug, taskRef);
  const { add, edit, remove } = useCommentMutations(slug, taskRef);
  const members = useMembers(slug);
  const people: UserRef[] = (members.data ?? []).filter((m) => m.id !== me?.user.id).map((m) => ({ id: m.id, fullName: m.fullName }));
  const [replyTo, setReplyTo] = useState<CommentItem | null>(null);
  const top = (comments ?? []).filter((c) => !c.parentCommentId);
  const replies = (id: string) => (comments ?? []).filter((c) => c.parentCommentId === id);

  const item = (c: CommentItem, isReply = false) => (
    <CommentView
      key={c.id}
      c={c}
      isReply={isReply}
      mine={c.author?.id === me?.user.id}
      canDelete={c.author?.id === me?.user.id || canAdmin(workspace.role)}
      onReply={() => setReplyTo(c)}
      onEdit={(body) => edit.mutateAsync({ id: c.id, body })}
      people={people}
      meId={me?.user.id}
      onDelete={() => confirm('Delete this comment?') && remove.mutate(c.id)}
    />
  );

  return (
    <section className="mt-8 border-t border-border pt-5">
      <h3 className="mb-3 text-[13px] font-semibold">Comments {comments?.length ? <span className="font-normal text-muted">{comments.length}</span> : null}</h3>
      {isLoading && <div className="h-12 animate-pulse rounded bg-canvas" />}
      <ul className="space-y-4">
        {top.map((c) => (
          <li key={c.id}>
            {item(c)}
            {replies(c.id).length > 0 && <ul className="ml-9 mt-3 space-y-3 border-l border-border pl-3">{replies(c.id).map((r) => <li key={r.id}>{item(r, true)}</li>)}</ul>}
          </li>
        ))}
      </ul>
      {!isLoading && !comments?.length && <p className="text-[13px] text-muted">No comments yet. Start the conversation.</p>}
      <Composer
        key={replyTo?.id ?? 'new'}
        replyTo={replyTo}
        people={people}
        onCancelReply={() => setReplyTo(null)}
        onSubmit={async (body) => {
          await add.mutateAsync({ body, parentCommentId: replyTo?.id ?? null });
          setReplyTo(null);
        }}
      />
    </section>
  );
}

function CommentView({ c, isReply, mine, canDelete, onReply, onEdit, onDelete, people, meId }: { c: CommentItem; isReply: boolean; mine: boolean; canDelete: boolean; onReply: () => void; onEdit: (b: string) => Promise<unknown>; onDelete: () => void; people: UserRef[]; meId?: string }) {
  const [editing, setEditing] = useState(false);
  const initial = fromStored(c.body);
  const [body, setBody] = useState(initial.text);
  const [mentions, setMentions] = useState<UserRef[]>(initial.mentions);
  const name = c.author?.fullName ?? 'Former member';
  return (
    <div className="flex gap-2.5">
      <MiniAvatar name={name} size={isReply ? 22 : 26} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px]">
          <span className="font-semibold">{name}</span> <span className="text-xs text-muted">{timeAgo(c.createdAt)}{c.isEdited && ' · edited'}</span>
        </p>
        {editing ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!body.trim()) return;
              await onEdit(toStored(body.trim(), mentions));
              setEditing(false);
            }}
            className="mt-1"
          >
            <MentionInput label="Edit comment" value={body} onChange={setBody} mentions={mentions} onMentionsChange={setMentions} people={people} rows={2} />
            <div className="mt-1 flex gap-2">
              <Button size="sm" type="submit">Save</Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => { setEditing(false); setBody(initial.text); setMentions(initial.mentions); }}>Cancel</Button>
            </div>
          </form>
        ) : (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-5"><CommentBody body={c.body} meId={meId} /></p>
        )}
        {!editing && (
          <div className="mt-1 flex gap-3 text-xs text-muted">
            {!isReply && <button onClick={onReply} className="hover:text-text">Reply</button>}
            {mine && <button onClick={() => setEditing(true)} className="hover:text-text">Edit</button>}
            {canDelete && <button onClick={onDelete} className="hover:text-danger">Delete</button>}
          </div>
        )}
      </div>
    </div>
  );
}

function Composer({ replyTo, people, onCancelReply, onSubmit }: { replyTo: CommentItem | null; people: UserRef[]; onCancelReply: () => void; onSubmit: (body: string) => Promise<void> }) {
  const [body, setBody] = useState('');
  const [mentions, setMentions] = useState<UserRef[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef<MentionInputHandle>(null);
  useEffect(() => {
    if (replyTo) ref.current?.focus();
  }, [replyTo]);
  async function submit() {
    if (!body.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit(toStored(body.trim(), mentions));
      setBody('');
      setMentions([]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-5">
      {replyTo && (
        <p className="mb-1 flex items-center gap-2 text-xs text-muted">
          Replying to {replyTo.author?.fullName ?? 'comment'}
          <button onClick={onCancelReply} className="underline hover:text-text">Cancel</button>
        </p>
      )}
      <MentionInput
        ref={ref}
        label={replyTo ? 'Write a reply' : 'Write a comment'}
        value={body}
        onChange={setBody}
        mentions={mentions}
        onMentionsChange={setMentions}
        people={people}
        onSubmit={submit}
        placeholder={replyTo ? 'Write a reply…' : 'Write a comment… Type @ to mention someone'}
      />
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-muted">@ to mention · Ctrl + Enter to send</span>
        <Button size="sm" onClick={submit} loading={busy} disabled={!body.trim()}>{replyTo ? 'Reply' : 'Comment'}</Button>
      </div>
    </div>
  );
}
