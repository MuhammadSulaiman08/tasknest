'use client';

import { createWorkspaceSchema, slugify } from '@tasknest/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { InviteForm } from '@/components/InviteForm';
import { Button, Card, Field, Input, Logo } from '@/components/ui';
import { ApiRequestError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, fieldErrors } from '@/lib/forms';

function useSlugAvailability(slug: string) {
  const [state, setState] = useState<{ checking: boolean; available?: boolean; reason?: string }>({ checking: false });
  useEffect(() => {
    if (!slug) return setState({ checking: false });
    setState({ checking: true });
    const t = setTimeout(async () => {
      try {
        const r = await api<{ data: { available: boolean; reason?: string } }>(`/workspaces/slug-available?slug=${encodeURIComponent(slug)}`);
        setState({ checking: false, ...r.data });
      } catch {
        setState({ checking: false });
      }
    }, 300);
    return () => clearTimeout(t);
  }, [slug]);
  return state;
}

function Onboarding() {
  const { me, reloadMe } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ slug: string; name: string } | null>(null);
  const availability = useSlugAvailability(slug);

  const onName = (v: string) => {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  };

  async function createWorkspace(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    const errs = fieldErrors(createWorkspaceSchema, { name, slug });
    setErrors(errs ?? {});
    if (errs) return;
    setSubmitting(true);
    try {
      const r = await api<{ data: { slug: string; name: string } }>('/workspaces', { method: 'POST', json: { name, slug } });
      setCreated(r.data);
      await reloadMe();
      setStep(2);
    } catch (err) {
      if (err instanceof ApiRequestError && err.fields) setErrors(err.fields);
      else setFormError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const slugHint = !slug ? 'Used in links to your workspace' : availability.checking ? 'Checking…' : availability.available ? '✓ Available' : availability.reason ?? (availability.available === false ? `Taken, try ${slug}-2` : undefined);

  return (
    <main className="grid min-h-screen place-items-center px-4 py-12">
      <div className="w-full max-w-[480px]">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <Card className="p-6 sm:p-8">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Step {step} of 2</p>
          {step === 1 ? (
            <>
              <h1 className="mt-1 text-[22px] font-semibold leading-8">Name your workspace</h1>
              <p className="mt-1 text-muted">Hi {me?.user.fullName.split(' ')[0]}. A workspace is where your team&apos;s projects live.</p>
              <form onSubmit={createWorkspace} noValidate className="mt-6 space-y-4">
                <Field id="ws-name" label="Workspace name" error={errors.name}>
                  <Input id="ws-name" autoFocus placeholder="e.g. Sukkur IBA FYP" value={name} onChange={(e) => onName(e.target.value)} invalid={!!errors.name} />
                </Field>
                <Field id="ws-slug" label="Workspace URL" error={errors.slug} hint={<span className={availability.available === false ? 'text-danger' : availability.available ? 'text-success' : ''}>{slugHint}</span>}>
                  <div className="flex items-center rounded-md border border-border bg-surface pl-3 focus-within:outline-2 focus-within:outline-primary">
                    <span className="shrink-0 text-muted">tasknest.app/w/</span>
                    <input
                      id="ws-slug"
                      value={slug}
                      onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()); }}
                      className="h-9 w-full bg-transparent pr-3 font-mono text-[13px] outline-none"
                      aria-invalid={!!errors.slug || undefined}
                    />
                  </div>
                </Field>
                {formError && <p role="alert" className="text-sm text-danger">{formError}</p>}
                <Button type="submit" className="w-full" loading={submitting} disabled={availability.available === false}>Continue</Button>
              </form>
            </>
          ) : (
            <>
              <h1 className="mt-1 text-[22px] font-semibold leading-8">Invite your team</h1>
              <p className="mt-1 text-muted">Add people to <strong>{created?.name}</strong>. You can always do this later from Settings.</p>
              <div className="mt-6"><InviteForm slug={created!.slug} /></div>
              <div className="mt-6 flex justify-between">
                <Button variant="ghost" onClick={() => router.push(`/w/${created!.slug}`)}>Skip for now</Button>
                <Button onClick={() => router.push(`/w/${created!.slug}`)}>Go to workspace</Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}

export default function OnboardingPage() {
  return (
    <RequireAuth>
      <Onboarding />
    </RequireAuth>
  );
}
