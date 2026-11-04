'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { FullPageSpinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';

/** Signed-out users are sent to /login?next=<current page> and returned after login. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status, signedOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (status === 'anonymous') router.replace(signedOut ? '/login' : `/login?next=${encodeURIComponent(pathname)}`);
  }, [status, signedOut, pathname, router]);
  return status === 'authenticated' ? <>{children}</> : <FullPageSpinner />;
}
