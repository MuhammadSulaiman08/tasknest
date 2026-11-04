'use client';

import { emailSchema } from '@tasknest/shared';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button, Input } from '@/components/ui';
import { errorMessage } from '@/lib/forms';
import { useInvite } from '@/lib/workspaces';

/** Invite by email. Until email delivery ships, the invite link is shown for the admin to copy. */
export function InviteForm({ slug }: { slug: string }) {
  const invite = useInvite(slug);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [error, setError] = useState('');
  const [link, setLink] = useState<{ email: string; url: string; emailSent: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    try {
      const inv = await invite.mutateAsync({ email: parsed.data, role });
      setLink({ email: inv.email, url: inv.inviteUrl!, emailSent: !!(inv as { emailSent?: boolean }).emailSent });
      setCopied(false);
      setEmail('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="invite-email" className="sr-only">Email address</label>
        <Input id="invite-email" type="email" placeholder="teammate@example.com" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!error} />
        <label htmlFor="invite-role" className="sr-only">Role</label>
        <select id="invite-role" value={role} onChange={(e) => setRole(e.target.value)} className="h-9 rounded-md border border-border bg-surface px-2 text-sm">
          <option value="member">Member</option>
          <option value="admin">Admin</option>
          <option value="guest">Guest (read and comment)</option>
        </select>
        <Button type="submit" loading={invite.isPending} className="shrink-0">Send invite</Button>
      </form>
      {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
      {link && (
        <div className="mt-3 rounded-md border border-border bg-primary-subtle p-3">
          <p className="text-[13px]">{link.emailSent ? <>Invite emailed to <strong>{link.email}</strong>. You can also share this link:</> : <>Invite created for <strong>{link.email}</strong>. Share this link with them:</>}</p>
          <div className="mt-2 flex gap-2">
            <Input readOnly value={link.url} aria-label="Invite link" className="font-mono text-xs" onFocus={(e) => e.target.select()} />
            <Button type="button" variant="secondary" onClick={() => navigator.clipboard.writeText(link.url).then(() => setCopied(true))}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
