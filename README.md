# TaskNest

A multi-tenant project management SaaS for small teams: workspaces, role-based access, projects, Kanban boards with drag and drop, task details, subtasks and threaded comments.
Built as a portfolio project with **Next.js, Express, PostgreSQL and TypeScript**.

![Project board](docs/screenshots/11-board.png)

**Demo login:** `demo@tasknest.app` / `password123` (after running the seed, see below)

## Features

| Area | What it does |
| --- | --- |
| Kanban board | Six status columns, drag and drop with mouse, touch or keyboard, optimistic updates, quick add, filters by assignee, priority and text |
| Tasks | Per-project IDs (WEB-42), assignee, priority, due date with overdue highlighting, estimate, description, one level of subtasks with progress |
| Task drawer | Opens over any page with its own shareable URL; every field editable inline with "Saving… / Saved" feedback |
| Comments | Threaded replies, edit your own, admins can delete any; guests can comment |
| My tasks | Everything assigned to you across projects, grouped into Overdue, Today, This week, Later |
| Search | Full-text search on titles and descriptions (PostgreSQL `tsvector` + GIN index), or jump straight to `WEB-42`; press `/` anywhere |
| Projects | Create with an auto-suggested key, lead and dates; progress bars; archive and restore |
| Workspaces | Custom URL with live availability check, switcher, invites with copyable link, roles: Owner > Admin > Member > Guest |
| Security | bcrypt, 15-minute JWT access tokens, rotating HttpOnly refresh cookies with reuse (theft) detection, rate-limited login, Helmet headers |
| Tenant isolation | Every query is scoped to the workspace; non-members get `404` so workspace names never leak |
| Quality | 45 API integration tests against real PostgreSQL, end-to-end browser tests, GitHub Actions CI, responsive down to 360 px, light and dark mode, WCAG-minded focus states and labels |

| Home | Task drawer | Mobile |
| --- | --- | --- |
| ![Home](docs/screenshots/10-home-demo.png) | ![Drawer](docs/screenshots/12-drawer.png) | ![Mobile](docs/screenshots/15-mobile-board.png) |

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js 15 (App Router), React 19, Tailwind CSS 4, TanStack Query, dnd-kit |
| Backend | Node.js 22, Express 5, Zod, pino |
| Database | PostgreSQL 16, Kysely (type-safe SQL), SQL migrations, triggers, partial and GIN indexes |
| Shared | `@tasknest/shared`: one set of Zod schemas and types used by both apps |
| Testing | Vitest + Supertest (API), Playwright (end to end) |
| CI / Deploy | GitHub Actions; Vercel (web) + Render (API) + Neon (database) |

## Quick start

Requirements: Node.js 22, pnpm 10, Docker Desktop. **Using VS Code? Follow [docs/VSCODE_GUIDE.md](docs/VSCODE_GUIDE.md)** (also as a Word file in `docs/`).

```bash
pnpm install
pnpm first-run     # creates .env files, starts PostgreSQL in Docker, migrates, loads demo data
pnpm dev           # API on http://localhost:4000, web on http://localhost:3000
```

Open http://localhost:3000 and log in as `demo@tasknest.app` / `password123`.
Other demo users: `bilal@` (admin), `hira@` (member), `sana@` (guest), all `@tasknest.app` with the same password.

| Command | What it does |
| --- | --- |
| `pnpm test` | 45 API integration tests (uses the `tasknest_test` database) |
| `pnpm typecheck` | TypeScript checks for every package |
| `pnpm db:seed` | Reset the demo workspace |
| `pnpm db:migrate` | Apply new migrations |
| `pnpm build` | Production build |

## How it works

```
Browser ──> Next.js (Vercel) ──/api/* rewrite──> Express API (Render) ──> PostgreSQL (Neon)
```

- **One origin for the browser.** Next.js proxies `/api/*` to the API, so the refresh cookie stays first-party everywhere.
- **Board ordering.** Cards use fractional `position` values: a move writes one row, placed at the midpoint between its new neighbours. If a gap gets too small the column is renumbered in the same transaction.
- **Task numbers.** A `BEFORE INSERT` trigger increments a per-project counter under a row lock, so concurrent inserts never get the same `WEB-n`.
- **Layering.** Routes (HTTP + validation) → services (rules, permissions) → SQL. Every query takes the workspace id.

```
tasknest/
├── apps/api/        Express API: migrations, scripts (migrate, seed), src/modules/{auth,workspaces,projects,tasks,comments}, test/
├── apps/web/        Next.js app: src/app (routes), src/components (Board, TaskDrawer, AppShell), src/lib (API client, hooks)
├── packages/shared/ Zod schemas + types for both apps
├── docs/            PRD, TRD, App Flow, UI/UX Brief, Backend spec, Plan, VS Code guide, screenshots
└── .vscode/         recommended extensions, debug configs, tasks, database connection
```

## API overview

All routes are under `/api/v1`. Workspace routes are under `/w/:slug` and require membership.

| Method | Path | Minimum role |
| --- | --- | --- |
| POST | `/auth/register` · `/auth/login` · `/auth/refresh` · `/auth/logout` | Public |
| GET | `/me` | Signed in |
| POST | `/workspaces` | Signed in |
| GET / PATCH / DELETE | `/w/:slug` | Guest / Admin / Owner |
| GET · PATCH · DELETE | `/w/:slug/members[/:userId]` | Guest · Admin · Admin or self |
| GET · POST · DELETE | `/w/:slug/invitations[/:id]` | Admin |
| GET · POST | `/invitations/:token[/accept]` | Public · Signed in |
| GET · POST · GET · PATCH | `/w/:slug/projects[/:key]` | Guest · Admin · Guest · Admin |
| GET · POST | `/w/:slug/projects/:key/tasks` | Guest · Member |
| GET · PATCH · DELETE | `/w/:slug/tasks/:ref` | Guest · Member · Member |
| PATCH | `/w/:slug/tasks/:ref/move` | Member |
| GET | `/w/:slug/my-tasks` · `/w/:slug/search?q=` | Guest |
| GET · POST | `/w/:slug/tasks/:ref/comments` | Guest |
| PATCH · DELETE | `/w/:slug/comments/:id` | Author · Author or Admin |

Errors always use one shape: `{ "error": { "code", "message", "fields?", "requestId" } }`.
Try every endpoint from VS Code with `apps/api/http/api.http` (REST Client extension).

## Deploy

Step-by-step instructions for Neon, Render and Vercel are in [docs/VSCODE_GUIDE.md, section 11](docs/VSCODE_GUIDE.md#11-deploy-a-free-live-demo).
Note: Render's free tier sleeps when idle, so the first request can take about 30–50 seconds.

## Documentation

The project was planned before it was built. All documents are in [`docs/`](docs): product requirements (PRD), technical requirements (TRD), app flow, UI/UX brief, backend specification, 14-week project plan, and the VS Code guide.

## Roadmap

- [x] Auth, workspaces, members, roles, invitations
- [x] Projects, tasks, Kanban board with drag and drop, subtasks
- [x] Task drawer, threaded comments, My tasks, full-text search
- [ ] Google sign-in, @mentions and in-app notifications (v1.1)
- [ ] Real-time board updates with Socket.IO, email digests, attachments (v1.2)
