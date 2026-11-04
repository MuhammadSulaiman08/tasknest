import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import { forwardRef } from 'react';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'ghost-danger' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
};

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-9 px-4 text-sm',
        variant === 'primary' && 'bg-primary text-white hover:brightness-110',
        variant === 'secondary' && 'border border-border bg-surface text-text hover:bg-primary-subtle',
        variant === 'ghost' && 'text-text hover:bg-primary-subtle',
        variant === 'ghost-danger' && 'text-danger hover:bg-danger/10',
        variant === 'danger' && 'bg-danger text-white hover:brightness-110',
        className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ invalid, className, ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      {...props}
      className={clsx(
        'h-9 w-full rounded-md border bg-surface px-3 text-sm text-text placeholder:text-muted',
        invalid ? 'border-danger' : 'border-border',
        className,
      )}
    />
  );
});

/** Label + control + help/error text, wired up for screen readers. */
export function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-medium text-text">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={clsx('rounded-xl border border-border bg-surface', className)} />;
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-2 font-semibold text-text', className)}>
      <span className="grid size-7 place-items-center rounded-md bg-primary text-white" aria-hidden>
        <svg viewBox="0 0 16 16" className="size-4" fill="currentColor">
          <rect x="2" y="3" width="3" height="10" rx="1" />
          <rect x="6.5" y="3" width="3" height="7" rx="1" />
          <rect x="11" y="3" width="3" height="4" rx="1" />
        </svg>
      </span>
      TaskNest
    </span>
  );
}

export function FullPageSpinner() {
  return (
    <div className="grid min-h-screen place-items-center" role="status" aria-label="Loading">
      <Loader2 className="size-6 animate-spin text-muted" />
    </div>
  );
}
