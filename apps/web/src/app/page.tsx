import Link from 'next/link';
import { Logo } from '@/components/ui';

const columns = [
  { name: 'To do', cards: [{ ref: 'WEB-4', title: 'Write onboarding copy', p: 'Medium' }, { ref: 'WEB-6', title: 'Set up CI pipeline', p: 'High' }] },
  { name: 'In progress', cards: [{ ref: 'WEB-2', title: 'Design database schema', p: 'Urgent' }] },
  { name: 'Done', cards: [{ ref: 'WEB-1', title: 'Write the PRD', p: 'Low' }] },
];

export default function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="/login" className="rounded-md px-3 py-2 font-medium hover:bg-primary-subtle">
            Log in
          </Link>
          <Link href="/signup" className="rounded-md bg-primary px-4 py-2 font-medium text-white hover:brightness-110">
            Get started free
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-12 sm:pt-20">
        <section className="max-w-2xl">
          <h1 className="text-4xl font-bold leading-[44px] tracking-tight sm:text-5xl sm:leading-[56px]">Plan projects without the clutter.</h1>
          <p className="mt-5 text-lg leading-7 text-muted">
            TaskNest gives small teams one place for projects, tasks and the conversation around them. Set up in five minutes, no training needed.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="rounded-md bg-primary px-5 py-2.5 font-medium text-white hover:brightness-110">
              Create your workspace
            </Link>
            <Link href="/login" className="rounded-md border border-border bg-surface px-5 py-2.5 font-medium hover:bg-primary-subtle">
              I have an account
            </Link>
          </div>
        </section>

        <section aria-label="Example board" className="mt-16 overflow-x-auto rounded-xl border border-border bg-canvas p-4 sm:p-6">
          <div className="flex min-w-[720px] gap-3">
            {columns.map((col) => (
              <div key={col.name} className="w-[280px] shrink-0">
                <div className="mb-3 flex items-center gap-2 px-1 text-[15px] font-semibold">
                  {col.name} <span className="text-xs font-medium text-muted">{col.cards.length}</span>
                </div>
                <div className="space-y-2">
                  {col.cards.map((c) => (
                    <div key={c.ref} className="rounded-lg border border-border bg-surface p-3">
                      <p className="font-medium">{c.title}</p>
                      <p className="mt-2 flex items-center justify-between text-xs text-muted">
                        <span className="font-mono">{c.ref}</span>
                        <span>{c.p}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16 grid gap-6 sm:grid-cols-3">
          {[
            ['Kanban boards', 'Drag tasks across columns. Every task has one owner, a priority and a due date.'],
            ['Team workspaces', 'Invite your team with roles: owners, admins, members and read-only guests.'],
            ['Comments on tasks', 'Keep decisions next to the work, not lost in a chat thread.'],
          ].map(([t, d]) => (
            <div key={t}>
              <h2 className="text-[15px] font-semibold">{t}</h2>
              <p className="mt-1 text-muted">{d}</p>
            </div>
          ))}
        </section>
      </main>
      <footer className="border-t border-border py-6 text-center text-xs text-muted">Built with Next.js, Express and PostgreSQL · Portfolio project</footer>
    </div>
  );
}
