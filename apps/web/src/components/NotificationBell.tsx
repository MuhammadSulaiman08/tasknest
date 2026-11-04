'use client';

import type { NotificationItem } from '@tasknest/shared';
import clsx from 'clsx';
import { AtSign, Bell, CalendarClock, MessageSquare, UserPlus } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useMarkRead, useNotifications } from '@/lib/notifications';
import { MiniAvatar } from './task/bits';

const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

function describe(n: NotificationItem) {
  const who = n.actor?.fullName ?? 'Someone';
  switch (n.type) {
    case 'assigned': return <><strong>{who}</strong> assigned you a task</>;
    case 'mentioned': return <><strong>{who}</strong> mentioned you</>;
    case 'commented': return <><strong>{who}</strong> commented</>;
    case 'due_soon': return <>Due within 24 hours</>;
  }
}

const icon = { assigned: UserPlus, mentioned: AtSign, commented: MessageSquare, due_soon: CalendarClock };

export function NotificationBell({ slug }: { slug: string }) {
  const { data } = useNotifications(slug);
  const markRead = useMarkRead(slug);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const unread = data?.unreadCount ?? 0;

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, []);

  function openItem(n: NotificationItem) {
    if (!n.read) markRead.mutate([n.id]);
    setOpen(false);
    if (n.task) {
      const q = new URLSearchParams(params.toString());
      q.set('task', n.task.ref);
      router.push(`${pathname}?${q}`, { scroll: false });
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        className="relative grid size-9 place-items-center rounded-md text-muted hover:bg-primary-subtle hover:text-text"
      >
        <Bell className="size-[18px]" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-4 text-white" aria-hidden>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" className="absolute right-0 z-30 mt-2 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-[15px] font-semibold">Notifications</h2>
            {unread > 0 && <button onClick={() => markRead.mutate(undefined)} className="text-xs text-primary hover:underline">Mark all as read</button>}
          </div>
          <ul className="max-h-[420px] overflow-y-auto">
            {data?.data.map((n) => {
              const Icon = icon[n.type];
              return (
                <li key={n.id}>
                  <button onClick={() => openItem(n)} className={clsx('flex w-full gap-3 px-4 py-3 text-left hover:bg-primary-subtle', !n.read && 'bg-primary-subtle/50')}>
                    {n.actor ? <MiniAvatar name={n.actor.fullName} size={28} /> : <span className="grid size-7 shrink-0 place-items-center rounded-full bg-warning/20"><Icon className="size-4 text-warning" aria-hidden /></span>}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[13px]">
                        <Icon className="size-3.5 shrink-0 text-muted" aria-hidden />
                        <span className="truncate">{describe(n)}</span>
                        <span className="ml-auto shrink-0 text-xs text-muted">{ago(n.createdAt)}</span>
                      </span>
                      {n.task && <span className="mt-0.5 block truncate text-[13px]"><span className="font-mono text-xs text-muted">{n.task.ref}</span> {n.task.title}</span>}
                      {n.excerpt && <span className="mt-0.5 block line-clamp-2 text-xs text-muted">“{n.excerpt}”</span>}
                    </span>
                    {!n.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                  </button>
                </li>
              );
            })}
          </ul>
          {data && !data.data.length && <p className="px-4 py-8 text-center text-[13px] text-muted">You are all caught up. Assignments, mentions and comments on your tasks show up here.</p>}
        </div>
      )}
    </div>
  );
}
