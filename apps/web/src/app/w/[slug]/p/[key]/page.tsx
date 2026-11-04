'use client';

import type { TaskCard } from '@tasknest/shared';
import { Archive, ArchiveRestore, Search } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Suspense, useCallback, useMemo, useState } from 'react';
import { Board } from '@/components/board/Board';
import { PRIORITY_ORDER } from '@/components/task/bits';
import { Button, Card } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useBoard, useProject, useUpdateProject } from '@/lib/tasks';
import { canAdmin, useMembers, useWorkspace } from '@/lib/workspaces';

function BoardSkeleton() {
  return (
    <div className="flex gap-3" role="status" aria-label="Loading board">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="w-[280px] shrink-0 space-y-2">
          <div className="h-5 w-24 animate-pulse rounded bg-border/60" />
          {[0, 1, 2].map((j) => <div key={j} className="h-20 animate-pulse rounded-lg bg-surface" />)}
        </div>
      ))}
    </div>
  );
}

function ProjectBoard() {
  const { slug, key } = useParams<{ slug: string; key: string }>();
  const ws = useWorkspace(slug).data!;
  const { me } = useAuth();
  const project = useProject(slug, key);
  const board = useBoard(slug, key);
  const members = useMembers(slug);
  const updateProject = useUpdateProject(slug, key);
  const [q, setQ] = useState('');
  const [assignee, setAssignee] = useState('');
  const [priority, setPriority] = useState('');

  const filter = useCallback(
    (t: TaskCard) =>
      (!q || t.title.toLowerCase().includes(q.toLowerCase()) || t.ref.toLowerCase() === q.toLowerCase()) &&
      (!assignee || (assignee === 'none' ? !t.assignee : t.assignee?.id === assignee)) &&
      (!priority || t.priority === priority),
    [q, assignee, priority],
  );
  const filtered = !!(q || assignee || priority);
  const total = board.data?.length ?? 0;
  const shown = useMemo(() => board.data?.filter(filter).length ?? 0, [board.data, filter]);

  if (project.error) {
    return (
      <Card className="mx-auto max-w-sm p-8 text-center">
        <h1 className="text-lg font-semibold">We could not find that project</h1>
        <Link href={`/w/${slug}/projects`} className="mt-3 inline-block text-primary hover:underline">All projects</Link>
      </Card>
    );
  }
  const archived = project.data?.status === 'archived';

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-2xl font-semibold leading-8">{project.data?.name ?? ' '}</h1>
            {project.data && <span className="rounded bg-primary-subtle px-1.5 py-0.5 font-mono text-xs font-medium text-primary">{project.data.key}</span>}
            {archived && <span className="rounded bg-canvas px-1.5 py-0.5 text-xs font-medium text-muted">Archived</span>}
          </div>
          {project.data?.description && <p className="mt-1 text-muted">{project.data.description}</p>}
        </div>
        {canAdmin(ws.role) && project.data && (
          <Button variant="secondary" size="sm" onClick={() => updateProject.mutate({ status: archived ? 'active' : 'archived' })} loading={updateProject.isPending}>
            {archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />} {archived ? 'Restore' : 'Archive'}
          </Button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2" role="search" aria-label="Filter tasks">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted" aria-hidden />
          <input aria-label="Filter by title" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter tasks" className="h-9 w-52 rounded-md border border-border bg-surface pl-8 pr-3 text-sm" />
        </div>
        <select aria-label="Filter by assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)} className="h-9 rounded-md border border-border bg-surface px-2 text-sm">
          <option value="">Anyone</option>
          {me && <option value={me.user.id}>Me</option>}
          <option value="none">Unassigned</option>
          {members.data?.filter((m) => m.id !== me?.user.id).map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
        </select>
        <select aria-label="Filter by priority" value={priority} onChange={(e) => setPriority(e.target.value)} className="h-9 rounded-md border border-border bg-surface px-2 text-sm">
          <option value="">Any priority</option>
          {PRIORITY_ORDER.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
        </select>
        {filtered && (
          <>
            <span className="text-xs text-muted">{shown} of {total} tasks</span>
            <button onClick={() => { setQ(''); setAssignee(''); setPriority(''); }} className="text-xs text-primary hover:underline">Clear filters</button>
          </>
        )}
      </div>

      {board.isLoading ? (
        <BoardSkeleton />
      ) : (
        <Board slug={slug} projectKey={key.toUpperCase()} tasks={board.data ?? []} canEdit={ws.role !== 'guest' && !archived} filter={filter} />
      )}
    </div>
  );
}

export default function ProjectBoardPage() {
  return (
    <Suspense>
      <ProjectBoard />
    </Suspense>
  );
}
