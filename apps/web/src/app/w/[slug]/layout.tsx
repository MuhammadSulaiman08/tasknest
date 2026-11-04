'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { Card, FullPageSpinner } from '@/components/ui';
import { useWorkspace } from '@/lib/workspaces';

function WorkspaceGate({ children }: { children: React.ReactNode }) {
  const { slug } = useParams<{ slug: string }>();
  const ws = useWorkspace(slug);
  if (ws.isLoading) return <FullPageSpinner />;
  if (ws.error || !ws.data) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <Card className="max-w-sm p-8 text-center">
          <h1 className="text-lg font-semibold">We could not find that workspace</h1>
          <p className="mt-2 text-muted">It may have been deleted, or you are not a member.</p>
          <Link href="/" className="mt-4 inline-block font-medium text-primary hover:underline">Back to home</Link>
        </Card>
      </main>
    );
  }
  return <AppShell workspace={ws.data}>{children}</AppShell>;
}

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <WorkspaceGate>{children}</WorkspaceGate>
    </RequireAuth>
  );
}
