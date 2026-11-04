'use client';

import { registerSchema } from '@tasknest/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AuthCard } from '@/components/auth/AuthCard';
import { useRedirectIfSignedIn } from '@/components/auth/useRedirectIfSignedIn';
import { Button, Field, Input } from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { homePath, useAuth } from '@/lib/auth';
import { errorMessage, fieldErrors } from '@/lib/forms';

function SignupForm() {
  const { register } = useAuth();
  const router = useRouter();
  const { next } = useRedirectIfSignedIn();
  const [values, setValues] = useState({ fullName: '', email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    const errs = fieldErrors(registerSchema, values);
    setErrors(errs ?? {});
    if (errs) return;
    setSubmitting(true);
    try {
      const me = await register(values);
      router.replace(next ?? homePath(me));
    } catch (err) {
      if (err instanceof ApiRequestError && err.fields) setErrors(err.fields);
      else setFormError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="Set up your team in under five minutes."
      footer={
        <>
          Already have an account?{' '}
          <Link className="font-medium text-primary hover:underline" href={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`}>
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field id="fullName" label="Full name" error={errors.fullName}>
          <Input id="fullName" autoComplete="name" value={values.fullName} onChange={set('fullName')} invalid={!!errors.fullName} aria-describedby={errors.fullName ? 'fullName-error' : undefined} />
        </Field>
        <Field
          id="email"
          label="Work or university email"
          error={errors.email}
        >
          <Input id="email" type="email" autoComplete="email" value={values.email} onChange={set('email')} invalid={!!errors.email} aria-describedby={errors.email ? 'email-error' : undefined} />
        </Field>
        {errors.email && errors.email.includes('already exists') && (
          <p className="-mt-2 text-xs">
            <Link href="/login" className="text-primary hover:underline">
              Log in instead
            </Link>
          </p>
        )}
        <Field id="password" label="Password" error={errors.password} hint="At least 8 characters">
          <div className="relative">
            <Input id="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={values.password} onChange={set('password')} invalid={!!errors.password} className="pr-16" aria-describedby={errors.password ? 'password-error' : undefined} />
            <button type="button" onClick={() => setShowPassword((s) => !s)} className="absolute inset-y-0 right-2 my-auto h-7 rounded px-2 text-xs text-muted hover:text-text">
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </Field>
        {formError && <p role="alert" className="text-sm text-danger">{formError}</p>}
        <Button type="submit" className="w-full" loading={submitting}>
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
