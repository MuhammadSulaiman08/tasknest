'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { AuthCard } from '@/components/auth/AuthCard';
import { Button, FullPageSpinner } from '@/components/ui';
import { ApiRequestError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/forms';

interface Preview { email: string; role: string; workspace: { name: string; slug: string }; invitedBy: string | null }

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const { status, me, reloadMe, logout } = useAuth();
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const preview = useQuery({ queryKey: ['invite', token], retry: false, queryFn: () => api<{ data: Preview }>(`/invitations/${token}`).then((r) => r.data) });

  if (preview.isLoading || status === 'loading') return <FullPageSpinner />;
  if (preview.error) {
    return (
      <AuthCard title="Invite unavailable" footer={<Link href="/" className="text-primary hover:underline">Go to TaskNest</Link>}>
        <p className="text-muted">{preview.error instanceof ApiRequestError ? preview.error.message : 'This invite link is not valid.'}</p>
      </AuthCard>
    );
  }
  const inv = preview.data!;
  const next = encodeURIComponent(`/invite/${token}`);
  const wrongAccount = status === 'authenticated' && me && me.user.email.toLowerCase() !== inv.email.toLowerCase();

  async function join() {
    setJoining(true);
    setError('');
    try {
      const r = await api<{ data: { slug: string } }>(`/invitations/${token}/accept`, { method: 'POST' });
      await reloadMe();
      router.replace(`/w/${r.data.slug}`);
    } catch (err) {
      setError(errorMessage(err));
      setJoining(false);
    }
  }

  return (
    <AuthCard
      title={`Join ${inv.workspace.name}`}
      subtitle={`${inv.invitedBy ?? 'A teammate'} invited ${inv.email} to join as ${inv.role === 'admin' ? 'an admin' : `a ${inv.role}`}.`}
      footer={<Link href="/" className="text-primary hover:underline">What is TaskNest?</Link>}
    >
      {status === 'anonymous' ? (
        <div className="space-y-2">
          <Link href={`/signup?next=${next}`} className="flex h-9 w-full items-center justify-center rounded-md bg-primary font-medium text-white hover:brightness-110">Create an account to join</Link>
          <Link href={`/login?next=${next}`} className="flex h-9 w-full items-center justify-center rounded-md border border-border font-medium hover:bg-primary-subtle">I already have an account</Link>
        </div>
      ) : wrongAccount ? (
        <div className="space-y-3">
          <p className="text-sm">You are signed in as <strong>{me!.user.email}</strong>, but this invite is for <strong>{inv.email}</strong>.</p>
          <Button variant="secondary" className="w-full" onClick={() => logout()}>Switch account</Button>
        </div>
      ) : (
        <>
          <Button className="w-full" onClick={join} loading={joining}>Join workspace</Button>
          {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
        </>
      )}
    </AuthCard>
  );
}
