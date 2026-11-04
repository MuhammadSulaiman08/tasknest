'use client';

import { CheckCircle2, Circle, FolderKanban, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { canAdmin, useMembers, useWorkspace } from '@/lib/workspaces';

export default function WorkspaceHome() {
  const { slug } = useParams<{ slug: string }>();
  const { me } = useAuth();
  const ws = useWorkspace(slug).data!;
  const members = useMembers(slug);
  const teamSize = members.data?.length ?? 0;

  const steps = [
    { done: true, label: 'Create your workspace' },
    { done: teamSize > 1, label: 'Invite a teammate', href: canAdmin(ws.role) ? `/w/${slug}/settings/members` : undefined },
    { done: false, label: 'Create your first project', soon: true },
    { done: false, label: 'Add tasks and drag them across the board', soon: true },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold leading-8">Good to see you, {me?.user.fullName.split(' ')[0]}</h1>
      <p className="mt-1 text-muted">
        You are {ws.role === 'admin' || ws.role === 'owner' ? 'an' : 'a'} <strong className="font-medium text-text">{ws.role}</strong> in {ws.name}.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-[1fr_280px]">
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold">Getting started</h2>
          <ul className="mt-4 space-y-3">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-3">
                {s.done ? <CheckCircle2 className="size-5 text-success" aria-label="Done" /> : <Circle className="size-5 text-border" aria-label="Not done" />}
                {s.href && !s.done ? (
                  <Link href={s.href} className="font-medium text-primary hover:underline">{s.label}</Link>
                ) : (
                  <span className={s.done ? 'text-muted line-through' : ''}>{s.label}</span>
                )}
                {s.soon && <span className="rounded bg-canvas px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted">Next milestone</span>}
              </li>
            ))}
          </ul>
        </Card>
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-2 text-muted"><Users className="size-4" /> Team</div>
            <p className="mt-2 text-2xl font-semibold">{members.isLoading ? '–' : teamSize}</p>
            <Link href={`/w/${slug}/settings/members`} className="mt-1 inline-block text-[13px] text-primary hover:underline">View members</Link>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-2 text-muted"><FolderKanban className="size-4" /> Projects</div>
            <p className="mt-2 text-2xl font-semibold">0</p>
            <p className="mt-1 text-[13px] text-muted">Boards arrive in the next milestone.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
