'use client';

import { FolderKanban, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { CreateProjectDialog } from '@/components/CreateProjectDialog';
import { MiniAvatar, formatDue } from '@/components/task/bits';
import { Button, Card } from '@/components/ui';
import { useProjects } from '@/lib/tasks';
import { canAdmin, useWorkspace } from '@/lib/workspaces';

export default function ProjectsPage() {
  const { slug } = useParams<{ slug: string }>();
  const ws = useWorkspace(slug).data!;
  const projects = useProjects(slug);
  const [creating, setCreating] = useState(false);
  const active = projects.data?.filter((p) => p.status !== 'archived') ?? [];
  const archived = projects.data?.filter((p) => p.status === 'archived') ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold leading-8">Projects</h1>
          <p className="mt-1 text-muted">{active.length} active{archived.length ? `, ${archived.length} archived` : ''}</p>
        </div>
        {canAdmin(ws.role) && <Button onClick={() => setCreating(true)}><Plus className="size-4" /> New project</Button>}
      </div>

      {projects.isLoading && <div className="mt-6 grid gap-4 sm:grid-cols-2">{[0, 1].map((i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-surface" />)}</div>}

      {projects.data && !projects.data.length && (
        <Card className="mt-6 flex flex-col items-center p-10 text-center">
          <FolderKanban className="size-10 text-muted" aria-hidden />
          <h2 className="mt-3 text-[15px] font-semibold">No projects yet</h2>
          <p className="mt-1 max-w-sm text-muted">{canAdmin(ws.role) ? 'Create your first project to get a board for your team’s tasks.' : 'An admin has not created any projects yet.'}</p>
          {canAdmin(ws.role) && <Button className="mt-4" onClick={() => setCreating(true)}><Plus className="size-4" /> Create your first project</Button>}
        </Card>
      )}

      {[{ title: null, list: active }, { title: 'Archived', list: archived }].map(({ title, list }) =>
        list.length ? (
          <section key={title ?? 'active'} className="mt-6">
            {title && <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-muted">{title}</h2>}
            <div className="grid gap-4 sm:grid-cols-2">
              {list.map((p) => {
                const done = p.totalTasks - p.openTasks;
                return (
                  <Link key={p.id} href={`/w/${slug}/p/${p.key}`} className="block">
                    <Card className="h-full p-5 transition-colors hover:border-primary/50">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-primary-subtle px-1.5 py-0.5 font-mono text-xs font-medium text-primary">{p.key}</span>
                        <h3 className="truncate text-[15px] font-semibold">{p.name}</h3>
                        {p.lead && <span className="ml-auto"><MiniAvatar name={p.lead.fullName} /></span>}
                      </div>
                      {p.description && <p className="mt-2 line-clamp-2 text-[13px] text-muted">{p.description}</p>}
                      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-canvas" aria-hidden>
                        <div className="h-full bg-success" style={{ width: p.totalTasks ? `${(done / p.totalTasks) * 100}%` : 0 }} />
                      </div>
                      <p className="mt-2 flex justify-between text-xs text-muted">
                        <span>{p.openTasks} open · {done} closed</span>
                        {p.dueDate && <span>Due {formatDue(`${p.dueDate}T00:00:00Z`)}</span>}
                      </p>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null,
      )}
      {creating && <CreateProjectDialog slug={slug} onClose={() => setCreating(false)} />}
    </div>
  );
}
