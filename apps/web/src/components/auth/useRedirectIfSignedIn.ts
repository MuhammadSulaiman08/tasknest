'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { homePath, useAuth } from '@/lib/auth';

/** Signed-in users who open /login or /signup go to `next` or their workspace. */
export function useRedirectIfSignedIn() {
  const { status, me } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get('next');
  useEffect(() => {
    if (status === 'authenticated' && me) router.replace(safeNext(next) ?? homePath(me));
  }, [status, me, next, router]);
  return { status, next: safeNext(next) };
}

/** Only allow same-site relative paths, so ?next= cannot redirect off-site. */
export const safeNext = (n: string | null) => (n && n.startsWith('/') && !n.startsWith('//') ? n : null);
