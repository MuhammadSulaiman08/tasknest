'use client';

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { statusLabels, type TaskCard as Card, type TaskStatus } from '@tasknest/shared';
import clsx from 'clsx';
import { ChevronRight, ListChecks, MessageSquare, Plus } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage } from '@/lib/forms';
import { useCreateTask, useMoveTask } from '@/lib/tasks';
import { DueChip, MiniAvatar, PriorityIcon, STATUS_ORDER, StatusIcon } from '../task/bits';

type Columns = Record<TaskStatus, Card[]>;

const group = (tasks: Card[]): Columns => {
  const cols = Object.fromEntries(STATUS_ORDER.map((s) => [s, [] as Card[]])) as unknown as Columns;
  for (const t of [...tasks].sort((a, b) => a.position - b.position)) cols[t.status].push(t);
  return cols;
};

const findColumn = (cols: Columns, id: string): TaskStatus | undefined =>
  (STATUS_ORDER as string[]).includes(id) ? (id as TaskStatus) : STATUS_ORDER.find((s) => cols[s].some((t) => t.id === id));

// ------------------------------------------------------------------ card

function CardBody({ task, dragging }: { task: Card; dragging?: boolean }) {
  return (
    <div
      className={clsx(
        'rounded-lg border border-border bg-surface p-3 text-left transition-shadow',
        dragging ? 'rotate-2 shadow-xl' : 'hover:border-primary/50',
      )}
    >
      <p className={clsx('line-clamp-3 font-medium leading-5', task.status === 'cancelled' && 'text-muted line-through')}>{task.title}</p>
      <div className="mt-2.5 flex items-center gap-2">
        <span className="font-mono text-[11px] text-muted">{task.ref}</span>
        <PriorityIcon priority={task.priority} />
        <DueChip dueDate={task.dueDate} status={task.status} />
        <span className="ml-auto flex items-center gap-2 text-[11px] text-muted">
          {task.subtaskCount > 0 && (
            <span className="inline-flex items-center gap-0.5" title={`${task.subtasksDone} of ${task.subtaskCount} subtasks done`}>
              <ListChecks className="size-3.5" aria-hidden /> {task.subtasksDone}/{task.subtaskCount}
            </span>
          )}
          {task.commentCount > 0 && (
            <span className="inline-flex items-center gap-0.5" title={`${task.commentCount} comments`}>
              <MessageSquare className="size-3.5" aria-hidden /> {task.commentCount}
            </span>
          )}
          {task.assignee && <MiniAvatar name={task.assignee.fullName} />}
        </span>
      </div>
    </div>
  );
}

function SortableCard({ task, onOpen, disabled }: { task: Card; onOpen: (ref: string) => void; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx('list-none', isDragging && 'opacity-40')}
      data-testid={`card-${task.ref}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={() => onOpen(task.ref)}
        aria-label={`${task.ref}: ${task.title}. ${statusLabels[task.status]}.${disabled ? '' : ' Press space to move.'}`}
        className={clsx('block w-full rounded-lg', !disabled && 'cursor-grab active:cursor-grabbing')}
      >
        <CardBody task={task} />
      </button>
    </li>
  );
}

// ------------------------------------------------------------------ column

function QuickAdd({ slug, projectKey, status }: { slug: string; projectKey: string; status: TaskStatus }) {
  const create = useCreateTask(slug, projectKey);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return setOpen(false);
    setError('');
    setTitle(''); // keep the input open for the next task
    try {
      await create.mutateAsync({ title: t, status });
    } catch (err) {
      setTitle(t);
      setError(errorMessage(err));
    }
  }

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-muted hover:bg-surface hover:text-text">
        <Plus className="size-4" aria-hidden /> Add task
      </button>
    );
  return (
    <form onSubmit={submit}>
      <label className="sr-only" htmlFor={`quick-add-${status}`}>New task title in {statusLabels[status]}</label>
      <input
        id={`quick-add-${status}`}
        ref={ref}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => !title.trim() && setOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && (setTitle(''), setOpen(false))}
        placeholder="Task title, then Enter"
        maxLength={255}
        className="h-9 w-full rounded-md border border-primary bg-surface px-3 text-sm"
      />
      {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
    </form>
  );
}

function Column({
  status,
  tasks,
  collapsed,
  onToggle,
  onOpen,
  canEdit,
  slug,
  projectKey,
}: {
  status: TaskStatus;
  tasks: Card[];
  collapsed: boolean;
  onToggle: () => void;
  onOpen: (ref: string) => void;
  canEdit: boolean;
  slug: string;
  projectKey: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  if (collapsed) {
    return (
      <section ref={setNodeRef} aria-label={`${statusLabels[status]} (collapsed)`} className={clsx('w-12 shrink-0 rounded-lg', isOver && 'bg-primary-subtle')}>
        <button onClick={onToggle} className="flex h-full min-h-40 w-full flex-col items-center gap-2 rounded-lg py-3 text-muted hover:bg-surface" title={`Show ${statusLabels[status]}`}>
          <StatusIcon status={status} />
          <span className="text-xs font-medium [writing-mode:vertical-rl]">
            {statusLabels[status]} · {tasks.length}
          </span>
        </button>
      </section>
    );
  }
  return (
    <section aria-label={statusLabels[status]} className="flex w-[280px] shrink-0 flex-col">
      <header className="mb-2 flex items-center gap-2 px-1">
        <StatusIcon status={status} />
        <h3 className="text-[15px] font-semibold">{statusLabels[status]}</h3>
        <span className="text-xs font-medium text-muted">{tasks.length}</span>
        {(status === 'backlog' || status === 'cancelled') && (
          <button onClick={onToggle} className="ml-auto rounded p-1 text-muted hover:bg-surface" aria-label={`Collapse ${statusLabels[status]}`}>
            <ChevronRight className="size-4 rotate-180" />
          </button>
        )}
      </header>
      <SortableContext id={status} items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className={clsx('flex min-h-24 flex-1 flex-col gap-2 rounded-lg p-1 transition-colors', isOver && 'bg-primary-subtle')}>
          {tasks.map((t) => (
            <SortableCard key={t.id} task={t} onOpen={onOpen} disabled={!canEdit} />
          ))}
          {!tasks.length && <li className="list-none rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted">No tasks</li>}
        </ul>
      </SortableContext>
      {canEdit && status !== 'cancelled' && (
        <div className="mt-1 px-1">
          <QuickAdd slug={slug} projectKey={projectKey} status={status} />
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ board

export function Board({ slug, projectKey, tasks, canEdit, filter }: { slug: string; projectKey: string; tasks: Card[]; canEdit: boolean; filter: (t: Card) => boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const move = useMoveTask(slug, projectKey);
  const [columns, setColumns] = useState<Columns>(() => group(tasks));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ backlog: true, cancelled: true });
  const [error, setError] = useState('');
  const startColumn = useRef<TaskStatus | null>(null);

  // Follow the server unless a drag is in progress
  useEffect(() => {
    if (!activeId) setColumns(group(tasks));
  }, [tasks, activeId]);

  const visible = useMemo(() => Object.fromEntries(STATUS_ORDER.map((s) => [s, columns[s].filter(filter)])) as Columns, [columns, filter]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), // a click still opens the card
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const open = (ref: string) => {
    const q = new URLSearchParams(params.toString());
    q.set('task', ref);
    router.push(`${pathname}?${q}`, { scroll: false });
  };

  const activeTask = activeId ? STATUS_ORDER.flatMap((s) => columns[s]).find((t) => t.id === activeId) : undefined;

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    startColumn.current = findColumn(columns, String(e.active.id)) ?? null;
    setError('');
  }

  // Moving across columns while dragging: re-home the card so the target column makes room for it
  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const from = findColumn(columns, String(active.id));
    const to = findColumn(columns, String(over.id));
    if (!from || !to || from === to) return;
    setColumns((cols) => {
      const card = cols[from].find((t) => t.id === active.id);
      if (!card) return cols;
      const target = cols[to];
      const overIndex = target.findIndex((t) => t.id === over.id);
      const index = overIndex >= 0 ? overIndex : target.length;
      return {
        ...cols,
        [from]: cols[from].filter((t) => t.id !== active.id),
        [to]: [...target.slice(0, index), { ...card, status: to }, ...target.slice(index)],
      };
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    const id = String(active.id);
    const from = startColumn.current;
    setActiveId(null);
    if (!over || !from) return setColumns(group(tasks));

    const col = findColumn(columns, id);
    if (!col) return;
    let list = columns[col];
    const oldIndex = list.findIndex((t) => t.id === id);
    const overIndex = list.findIndex((t) => t.id === over.id);
    if (overIndex >= 0 && overIndex !== oldIndex) list = arrayMove(list, oldIndex, overIndex);
    const index = list.findIndex((t) => t.id === id);
    const card = list[index];

    const original = tasks.find((t) => t.id === id);
    const unchanged = original && original.status === col && group(tasks)[col].map((t) => t.id).join() === list.map((t) => t.id).join();
    setColumns((c) => ({ ...c, [col]: list.map((t) => (t.id === id ? { ...t, status: col } : t)) }));
    if (unchanged) return;

    move.mutate(
      { ref: card.ref, status: col, beforeId: list[index - 1]?.id ?? null, afterId: list[index + 1]?.id ?? null },
      {
        onError: (err) => {
          setError(`Could not move ${card.ref}: ${errorMessage(err)}`);
          setColumns(group(tasks)); // snap back
        },
      },
    );
  }

  return (
    <>
      {error && (
        <div role="alert" className="mb-3 flex items-center justify-between rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
          <button onClick={() => setError('')} className="text-xs underline">Dismiss</button>
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setColumns(group(tasks));
        }}
        accessibility={{
          announcements: {
            onDragStart: ({ active }) => `Picked up ${activeTask?.ref ?? active.id}.`,
            onDragOver: ({ over }) => (over ? `Over ${statusLabels[(findColumn(columns, String(over.id)) ?? 'todo') as TaskStatus]}.` : ''),
            onDragEnd: ({ over }) => (over ? `Dropped in ${statusLabels[(findColumn(columns, String(over.id)) ?? 'todo') as TaskStatus]}.` : 'Dropped.'),
            onDragCancel: () => 'Move cancelled.',
          },
        }}
      >
        <div className="-mx-4 overflow-x-auto px-4 pb-4 lg:-mx-8 lg:px-8">
          <div className="flex min-h-[60vh] gap-3">
            {STATUS_ORDER.map((s) => (
              <Column
                key={s}
                status={s}
                tasks={visible[s]}
                collapsed={!!collapsed[s]}
                onToggle={() => setCollapsed((c) => ({ ...c, [s]: !c[s] }))}
                onOpen={open}
                canEdit={canEdit}
                slug={slug}
                projectKey={projectKey}
              />
            ))}
          </div>
        </div>
        <DragOverlay>{activeTask ? <CardBody task={activeTask} dragging /> : null}</DragOverlay>
      </DndContext>
    </>
  );
}
