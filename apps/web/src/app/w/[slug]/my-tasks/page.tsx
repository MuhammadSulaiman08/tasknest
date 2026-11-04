'use client';

import type { TaskCard } from '@tasknest/shared';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { TaskRow } from '@/components/task/bits';
import { Card } from '@/components/ui';
import { useMyTasks } from '@/lib/tasks';

const endOfDay = (offsetDays: number) => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  d.setDate(d.getDate() + offsetDays);
  return d.getTime();
};

function groupTasks(tasks: TaskCard[]) {
  const now = Date.now(), today = endOfDay(0), week = endOfDay(7);
  const groups: { title: string; tone?: 'danger'; items: TaskCard[] }[] = [
    { title: 'Overdue', tone: 'danger', items: [] },
    { title: 'Today', items: [] },
    { title: 'This week', items: [] },
    { title: 'Later', items: [] },
    { title: 'No due date', items: [] },
  ];
  for (const t of tasks) {
    if (!t.dueDate) groups[4].items.push(t);
    else {
      const due = new Date(t.dueDate).getTime();
      groups[due < now ? 0 : due <= today ? 1 : due <= week ? 2 : 3].items.push(t);
    }
  }
  return groups.filter((g) => g.items.length);
}

export default function MyTasksPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading } = useMyTasks(slug);
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold leading-8">My tasks</h1>
      <p className="mt-1 text-muted">Open tasks assigned to you across every project.</p>
      {isLoading && <div className="mt-6 h-48 animate-pulse rounded-xl bg-surface" />}
      {data && !data.length && (
        <Card className="mt-6 flex flex-col items-center p-10 text-center">
          <CheckCircle2 className="size-10 text-success" aria-hidden />
          <h2 className="mt-3 text-[15px] font-semibold">You are all caught up</h2>
          <p className="mt-1 text-muted">Nothing is assigned to you right now.</p>
          <Link href={`/w/${slug}/projects`} className="mt-3 text-primary hover:underline">Browse projects</Link>
        </Card>
      )}
      {data &&
        groupTasks(data).map((g) => (
          <section key={g.title} className="mt-6">
            <h2 className={`mb-2 text-[13px] font-semibold ${g.tone === 'danger' ? 'text-danger' : ''}`}>
              {g.title} <span className="font-normal text-muted">{g.items.length}</span>
            </h2>
            <Card className="divide-y divide-border overflow-hidden">
              {g.items.map((t) => <TaskRow key={t.id} task={t} href={`?task=${t.ref}`} />)}
            </Card>
          </section>
        ))}
    </div>
  );
}
