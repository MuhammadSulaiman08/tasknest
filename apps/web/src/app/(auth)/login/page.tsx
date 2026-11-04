'use client';

import { loginSchema } from '@tasknest/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AuthCard } from '@/components/auth/AuthCard';
import { useRedirectIfSignedIn } from '@/components/auth/useRedirectIfSignedIn';
import { Button, Field, Input } from '@/components/ui';
import { homePath, useAuth } from '@/lib/auth';
import { errorMessage, fieldErrors } from '@/lib/forms';

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const { next } = useRedirectIfSignedIn();
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    const errs = fieldErrors(loginSchema, values);
    setErrors(errs ?? {});
    if (errs) return;
    setSubmitting(true);
    try {
      const me = await login(values);
      router.replace(next ?? homePath(me));
    } catch (err) {
      setFormError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Log in to your TaskNest account."
      footer={
        <>
          New to TaskNest?{' '}
          <Link className="font-medium text-primary hover:underline" href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ''}`}>
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field id="email" label="Email" error={errors.email}>
          <Input id="email" type="email" autoComplete="email" value={values.email} onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))} invalid={!!errors.email} />
        </Field>
        <Field id="password" label="Password" error={errors.password}>
          <Input id="password" type="password" autoComplete="current-password" value={values.password} onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))} invalid={!!errors.password} />
        </Field>
        {formError && <p role="alert" className="text-sm text-danger">{formError}</p>}
        <Button type="submit" className="w-full" loading={submitting}>
          Log in
        </Button>
      </form>
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
