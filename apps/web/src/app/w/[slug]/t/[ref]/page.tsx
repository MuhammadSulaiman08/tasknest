'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { FullPageSpinner } from '@/components/ui';
import { useTask } from '@/lib/tasks';

/** Shareable task link: opens the task's drawer on top of its project board. */
export default function TaskLink() {
  const { slug, ref } = useParams<{ slug: string; ref: string }>();
  const router = useRouter();
  const task = useTask(slug, ref);
  useEffect(() => {
    if (task.data) router.replace(`/w/${slug}/p/${task.data.project.key}?task=${task.data.ref}`);
    if (task.error) router.replace(`/w/${slug}`);
  }, [task.data, task.error, slug, router]);
  return <FullPageSpinner />;
}
