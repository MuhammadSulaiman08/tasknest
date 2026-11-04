'use client';

import { createProjectSchema, suggestProjectKey } from '@tasknest/shared';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button, Field, Input } from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { errorMessage, fieldErrors } from '@/lib/forms';
import { useCreateProject } from '@/lib/tasks';
import { useMembers } from '@/lib/workspaces';

export function CreateProjectDialog({ slug, onClose }: { slug: string; onClose: () => void }) {
  const create = useCreateProject(slug);
  const members = useMembers(slug);
  const router = useRouter();
  const [v, setV] = useState({ name: '', key: '', description: '', leadId: '', startDate: '', dueDate: '' });
  const [keyTouched, setKeyTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    dialog.current?.querySelector('input')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (k: keyof typeof v, value: string) => setV((s) => ({ ...s, [k]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    const input = { ...v, leadId: v.leadId || null, description: v.description || undefined };
    const errs = fieldErrors(createProjectSchema, input);
    setErrors(errs ?? {});
    if (errs) return;
    try {
      const p = await create.mutateAsync(createProjectSchema.parse(input));
      onClose();
      router.push(`/w/${slug}/p/${p.key}`);
    } catch (err) {
      if (err instanceof ApiRequestError && err.fields) setErrors(err.fields);
      else setFormError(errorMessage(err));
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="create-project-title" className="relative w-full max-w-lg rounded-xl bg-surface p-6 shadow-2xl">
        <button onClick={onClose} className="absolute right-4 top-4 rounded-md p-1.5 text-muted hover:bg-primary-subtle" aria-label="Close"><X className="size-4" /></button>
        <h2 id="create-project-title" className="text-lg font-semibold">Create project</h2>
        <p className="mt-1 text-[13px] text-muted">Tasks in this project get IDs like <span className="font-mono">{(v.key || 'KEY').toUpperCase()}-1</span>.</p>
        <form onSubmit={submit} noValidate className="mt-5 space-y-4">
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Field id="p-name" label="Name" error={errors.name}>
              <Input id="p-name" value={v.name} placeholder="e.g. Website" invalid={!!errors.name} onChange={(e) => { set('name', e.target.value); if (!keyTouched) set('key', suggestProjectKey(e.target.value)); }} />
            </Field>
            <Field id="p-key" label="Key" error={errors.key}>
              <Input id="p-key" value={v.key} maxLength={10} invalid={!!errors.key} className="font-mono uppercase" onChange={(e) => { setKeyTouched(true); set('key', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); }} />
            </Field>
          </div>
          <Field id="p-desc" label="Description (optional)" error={errors.description}>
            <textarea id="p-desc" rows={2} value={v.description} onChange={(e) => set('description', e.target.value)} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm" />
          </Field>
          <Field id="p-lead" label="Lead (optional)" error={errors.leadId}>
            <select id="p-lead" value={v.leadId} onChange={(e) => set('leadId', e.target.value)} className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm">
              <option value="">No lead</option>
              {members.data?.filter((m) => m.role !== 'guest').map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="p-start" label="Start date" error={errors.startDate}>
              <Input id="p-start" type="date" value={v.startDate} onChange={(e) => set('startDate', e.target.value)} />
            </Field>
            <Field id="p-due" label="Due date" error={errors.dueDate}>
              <Input id="p-due" type="date" value={v.dueDate} invalid={!!errors.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
            </Field>
          </div>
          {formError && <p role="alert" className="text-sm text-danger">{formError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={create.isPending}>Create project</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
