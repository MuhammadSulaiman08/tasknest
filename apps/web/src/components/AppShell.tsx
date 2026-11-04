'use client';

import clsx from 'clsx';
import { Check, ChevronsUpDown, Home, ListTodo, LogOut, Menu, Plus, Settings, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Logo } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import type { Workspace } from '@/lib/workspaces';

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white"
      style={{ width: size, height: size, background: `hsl(${hue} 45% 45%)` }}
    >
      {initials}
    </span>
  );
}

function WorkspaceSwitcher({ current }: { current: Workspace }) {
  const { me } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-primary-subtle"
      >
        <span className="grid size-6 place-items-center rounded bg-primary text-[11px] font-bold text-white">{current.name[0]?.toUpperCase()}</span>
        <span className="flex-1 truncate font-semibold">{current.name}</span>
        <ChevronsUpDown className="size-4 text-muted" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 right-0 z-20 mt-1 rounded-lg border border-border bg-surface p-1 shadow-lg">
          {me?.workspaces.map((w) => (
            <Link key={w.id} role="menuitem" href={`/w/${w.slug}`} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-primary-subtle">
              <span className="flex-1 truncate">{w.name}</span>
              {w.slug === current.slug && <Check className="size-4 text-primary" aria-label="Current" />}
            </Link>
          ))}
          <div className="my-1 border-t border-border" />
          <Link role="menuitem" href="/onboarding" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted hover:bg-primary-subtle hover:text-text">
            <Plus className="size-4" /> New workspace
          </Link>
        </div>
      )}
    </div>
  );
}

export function AppShell({ workspace, children }: { workspace: Workspace; children: React.ReactNode }) {
  const { me, logout } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const base = `/w/${workspace.slug}`;
  const nav = [
    { href: base, label: 'Home', icon: Home, exact: true },
    { href: `${base}/my-tasks`, label: 'My tasks', icon: ListTodo, soon: true },
    { href: `${base}/settings/members`, label: 'Settings', icon: Settings },
  ];
  useEffect(() => setMobileOpen(false), [pathname]);

  const sidebar = (
    <nav aria-label="Main" className="flex h-full flex-col gap-1 p-3">
      <WorkspaceSwitcher current={workspace} />
      <div className="mt-3 space-y-0.5">
        {nav.map(({ href, label, icon: Icon, exact, soon }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return soon ? (
            <span key={href} className="flex cursor-default items-center gap-2.5 rounded-md px-2 py-1.5 text-muted" title="Arrives with tasks in week 5">
              <Icon className="size-[18px]" aria-hidden /> {label}
              <span className="ml-auto rounded bg-canvas px-1.5 text-[10px] font-medium uppercase">Soon</span>
            </span>
          ) : (
            <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={clsx('flex items-center gap-2.5 rounded-md px-2 py-1.5', active ? 'bg-primary-subtle font-medium text-primary' : 'hover:bg-primary-subtle')}>
              <Icon className="size-[18px]" aria-hidden /> {label}
            </Link>
          );
        })}
      </div>
      <p className="mt-6 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Projects</p>
      <p className="px-2 py-1 text-[13px] text-muted">Projects arrive in the next milestone.</p>
      <div className="mt-auto flex items-center gap-2 border-t border-border px-1 pt-3">
        <Avatar name={me?.user.fullName ?? '?'} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{me?.user.fullName}</p>
          <p className="truncate text-xs text-muted">{me?.user.email}</p>
        </div>
        <button
          onClick={() => logout()}
          className="rounded-md p-1.5 text-muted hover:bg-primary-subtle hover:text-text"
          aria-label="Log out"
          title="Log out"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-border bg-surface lg:block">{sidebar}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-30 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-surface shadow-xl">
            <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 rounded-md p-1.5 hover:bg-primary-subtle" aria-label="Close menu"><X className="size-4" /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur lg:px-6">
          <button onClick={() => setMobileOpen(true)} className="rounded-md p-1.5 hover:bg-primary-subtle lg:hidden" aria-label="Open menu"><Menu className="size-5" /></button>
          <span className="lg:hidden"><Logo /></span>
          <span className="hidden text-muted lg:inline">{workspace.name}</span>
        </header>
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
