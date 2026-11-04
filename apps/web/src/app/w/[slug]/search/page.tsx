'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { TaskRow } from '@/components/task/bits';
import { Card } from '@/components/ui';
import { useSearch } from '@/lib/tasks';

function Results() {
  const { slug } = useParams<{ slug: string }>();
  const q = useSearchParams().get('q') ?? '';
  const { data, isLoading } = useSearch(slug, q);
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold leading-8">Search</h1>
      <p className="mt-1 text-muted">{q ? <>Results for “{q}”</> : 'Type in the search box above to find tasks by title, description or ID.'}</p>
      {isLoading && <div className="mt-6 h-32 animate-pulse rounded-xl bg-surface" />}
      {data && !data.length && <p className="mt-6 text-muted">No tasks match “{q}”. Check the spelling or try fewer words.</p>}
      {!!data?.length && (
        <Card className="mt-6 divide-y divide-border overflow-hidden">
          {data.map((t) => <TaskRow key={t.id} task={t} href={`?q=${encodeURIComponent(q)}&task=${t.ref}`} />)}
        </Card>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <Results />
    </Suspense>
  );
}
