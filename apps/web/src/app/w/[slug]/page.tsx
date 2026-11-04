'use client';

import { CheckCircle2, Circle, FolderKanban, ListTodo, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { CreateProjectDialog } from '@/components/CreateProjectDialog';
import { TaskRow } from '@/components/task/bits';
import { Card } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useMyTasks, useProjects } from '@/lib/tasks';
import { canAdmin, useMembers, useWorkspace } from '@/lib/workspaces';

export default function WorkspaceHome() {
  const { slug } = useParams<{ slug: string }>();
  const { me } = useAuth();
  const ws = useWorkspace(slug).data!;
  const members = useMembers(slug);
  const projects = useProjects(slug);
  const myTasks = useMyTasks(slug);
  const [creating, setCreating] = useState(false);
  const teamSize = members.data?.length ?? 0;
  const projectCount = projects.data?.filter((p) => p.status !== 'archived').length ?? 0;
  const taskCount = projects.data?.reduce((n, p) => n + p.totalTasks, 0) ?? 0;
  const admin = canAdmin(ws.role);

  const steps = [
    { done: true, label: 'Create your workspace' },
    { done: teamSize > 1, label: 'Invite a teammate', href: admin ? `/w/${slug}/settings/members` : undefined },
    { done: projectCount > 0, label: 'Create your first project', onClick: admin ? () => setCreating(true) : undefined },
    { done: taskCount > 0, label: 'Add tasks and drag them across the board', href: projects.data?.[0] ? `/w/${slug}/p/${projects.data[0].key}` : undefined },
  ];
  const allDone = steps.every((s) => s.done);
  const upcoming = myTasks.data?.slice(0, 6) ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold leading-8">Good to see you, {me?.user.fullName.split(' ')[0]}</h1>
      <p className="mt-1 text-muted">
        You are {ws.role === 'admin' || ws.role === 'owner' ? 'an' : 'a'} <strong className="font-medium text-text">{ws.role}</strong> in {ws.name}.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          { icon: FolderKanban, label: 'Projects', value: projectCount, href: `/w/${slug}/projects` },
          { icon: ListTodo, label: 'Assigned to me', value: myTasks.data?.length ?? '–', href: `/w/${slug}/my-tasks` },
          { icon: Users, label: 'Team members', value: teamSize || '–', href: `/w/${slug}/settings/members` },
        ].map(({ icon: Icon, label, value, href }) => (
          <Link key={label} href={href}>
            <Card className="p-5 transition-colors hover:border-primary/50">
              <div className="flex items-center gap-2 text-muted"><Icon className="size-4" aria-hidden /> {label}</div>
              <p className="mt-2 text-2xl font-semibold">{value}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className={`mt-4 grid gap-4 ${allDone ? '' : 'md:grid-cols-[1fr_320px]'}`}>
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5">
            <h2 className="text-[15px] font-semibold">Up next for you</h2>
            <Link href={`/w/${slug}/my-tasks`} className="text-[13px] text-primary hover:underline">All my tasks</Link>
          </div>
          {myTasks.isLoading && <div className="m-5 h-24 animate-pulse rounded bg-canvas" />}
          {myTasks.data && !upcoming.length && <p className="px-5 py-6 text-muted">Nothing assigned to you. Pick a task from a project board.</p>}
          <div className="mt-3 divide-y divide-border border-t border-border empty:hidden">
            {upcoming.map((t) => <TaskRow key={t.id} task={t} href={`?task=${t.ref}`} />)}
          </div>
        </Card>
        {!allDone && (
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold">Getting started</h2>
            <ul className="mt-4 space-y-3">
              {steps.map((s) => (
                <li key={s.label} className="flex items-start gap-3">
                  {s.done ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-label="Done" /> : <Circle className="mt-0.5 size-5 shrink-0 text-border" aria-label="Not done" />}
                  {!s.done && s.href ? (
                    <Link href={s.href} className="font-medium text-primary hover:underline">{s.label}</Link>
                  ) : !s.done && s.onClick ? (
                    <button onClick={s.onClick} className="text-left font-medium text-primary hover:underline">{s.label}</button>
                  ) : (
                    <span className={s.done ? 'text-muted line-through' : ''}>{s.label}</span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
      {creating && <CreateProjectDialog slug={slug} onClose={() => setCreating(false)} />}
    </div>
  );
}
