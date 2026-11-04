'use client';

import type { WorkspaceRole } from '@tasknest/shared';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Avatar } from '@/components/AppShell';
import { InviteForm } from '@/components/InviteForm';
import { Button, Card } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/forms';
import { canAdmin, useChangeRole, useInvitations, useMembers, useRemoveMember, useRevokeInvite, useWorkspace } from '@/lib/workspaces';

const roleLabel: Record<WorkspaceRole, string> = { owner: 'Owner', admin: 'Admin', member: 'Member', guest: 'Guest' };
const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export default function MembersPage() {
  const { slug } = useParams<{ slug: string }>();
  const { me, reloadMe } = useAuth();
  const router = useRouter();
  const ws = useWorkspace(slug).data!;
  const isAdmin = canAdmin(ws.role);
  const members = useMembers(slug);
  const invitations = useInvitations(slug, isAdmin);
  const changeRole = useChangeRole(slug);
  const remove = useRemoveMember(slug);
  const revoke = useRevokeInvite(slug);
  const [error, setError] = useState('');

  async function onRemove(id: string, name: string, self: boolean) {
    if (!confirm(self ? `Leave ${ws.name}? You will lose access to its projects.` : `Remove ${name} from ${ws.name}?`)) return;
    setError('');
    try {
      await remove.mutateAsync(id);
      if (self) {
        const m = await reloadMe();
        router.replace(m?.workspaces[0] ? `/w/${m.workspaces[0].slug}` : '/onboarding');
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold leading-8">Members</h1>
      <p className="mt-1 text-muted">People in {ws.name} and what they can do.</p>

      {isAdmin && (
        <Card className="mt-6 p-5">
          <h2 className="text-[15px] font-semibold">Invite people</h2>
          <p className="mb-4 mt-1 text-[13px] text-muted">Members create and edit tasks. Admins also manage projects and people. Guests can only read and comment.</p>
          <InviteForm slug={slug} />
        </Card>
      )}

      {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}

      <Card className="mt-6 overflow-hidden">
        <table className="w-full text-left">
          <caption className="sr-only">Workspace members</caption>
          <thead className="border-b border-border bg-canvas text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">Name</th>
              <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">Joined</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Role</th>
              <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {members.isLoading &&
              [0, 1].map((i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td colSpan={4} className="px-4 py-3"><div className="h-7 animate-pulse rounded bg-canvas" /></td>
                </tr>
              ))}
            {members.data?.map((m) => {
              const self = m.id === me?.user.id;
              const editable = isAdmin && m.role !== 'owner' && !self;
              return (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={m.fullName} size={32} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{m.fullName}{self && <span className="font-normal text-muted"> (you)</span>}</p>
                        <p className="truncate text-xs text-muted">{m.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-muted sm:table-cell">{fmt(m.joinedAt)}</td>
                  <td className="px-4 py-3">
                    {editable ? (
                      <select
                        aria-label={`Role for ${m.fullName}`}
                        value={m.role}
                        onChange={(e) => changeRole.mutate({ userId: m.id, role: e.target.value }, { onError: (err) => setError(errorMessage(err)) })}
                        className="h-8 rounded-md border border-border bg-surface px-2 text-[13px]"
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                        <option value="guest">Guest</option>
                      </select>
                    ) : (
                      <span className="rounded-full bg-primary-subtle px-2 py-0.5 text-xs font-medium text-primary">{roleLabel[m.role]}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {(editable || (self && m.role !== 'owner')) && (
                      <Button variant="ghost-danger" size="sm" onClick={() => onRemove(m.id, m.fullName, self)}>
                        {self ? 'Leave' : 'Remove'}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {isAdmin && !!invitations.data?.length && (
        <>
          <h2 className="mt-8 text-[15px] font-semibold">Pending invites</h2>
          <Card className="mt-3 divide-y divide-border">
            {invitations.data.map((i) => (
              <div key={i.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{i.email}</p>
                  <p className="text-xs text-muted">{roleLabel[i.role]} · expires {fmt(i.expiresAt)}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => revoke.mutate(i.id)}>Revoke</Button>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
