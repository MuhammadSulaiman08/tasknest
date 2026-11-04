# TaskNest

A multi-tenant project management SaaS for small teams: workspaces, role-based access, projects and Kanban boards.
Built as a portfolio project with **Next.js, Express, PostgreSQL and TypeScript**.

> **Status:** Milestone M0 plus the first part of Phase 1 (weeks 1–3 of the [project plan](docs/TaskNest_Project_Plan.docx)).
> Accounts, sessions, workspaces, members, roles and invitations work end to end. Projects and the task board come next.

## What works today

| Area | Features |
| --- | --- |
| Accounts | Sign up, log in, log out, session restore on reload |
| Security | bcrypt hashing, 15-minute JWT access tokens, rotating HttpOnly refresh cookies with reuse detection, rate-limited login, Helmet headers |
| Workspaces | Create with a custom URL (live availability check), switch between workspaces, rename, soft delete |
| Team | Invite by email with a role, copyable invite link, accept/join flow, change roles, remove members, leave a workspace |
| Roles | Owner > Admin > Member > Guest, enforced on every API route |
| Tenant isolation | Non-members get `404` on every workspace route, so workspace names are never revealed |
| UI | Landing page, auth pages, two-step onboarding, app shell with sidebar, responsive down to 360 px, light and dark mode |

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js 15 (App Router), React 19, Tailwind CSS 4, TanStack Query |
| Backend | Node.js 22, Express 5, Zod validation, pino logging |
| Database | PostgreSQL 16, Kysely (type-safe SQL), plain SQL migrations |
| Shared | `@tasknest/shared`: Zod schemas and types used by both apps |
| Testing | Vitest + Supertest against a real PostgreSQL; Playwright end-to-end |
| CI | GitHub Actions: type check, API tests, web build |

## Project structure

```
tasknest/
├── apps/
│   ├── api/                 Express REST API
│   │   ├── migrations/      001_initial_schema.sql, 002_auth_and_invitations.sql
│   │   ├── scripts/         migrate.ts (minimal migration runner)
│   │   ├── src/
│   │   │   ├── middleware/  authenticate, loadWorkspace + requireRole, validate, errorHandler
│   │   │   ├── modules/     auth/, workspaces/  (routes → service → repo)
│   │   │   └── db/          Kysely instance + generated types
│   │   └── test/            integration tests
│   └── web/                 Next.js frontend
│       └── src/
│           ├── app/         routes: /, /login, /signup, /onboarding, /invite/[token], /w/[slug]/...
│           ├── components/  AppShell, InviteForm, ui/
│           └── lib/         api client (auto-refresh), auth context, data hooks
├── packages/shared/         Zod schemas + shared types
└── docs/                    PRD, TRD, App Flow, UI/UX Brief, Backend spec, Plan
```

## Run it locally

Requirements: Node.js 22, pnpm 10, Docker (or any PostgreSQL 16).

```bash
pnpm install
docker compose up -d db                       # PostgreSQL on localhost:5432

cp apps/api/.env.example apps/api/.env        # defaults match docker-compose
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @tasknest/api migrate           # creates all tables

pnpm --filter @tasknest/api dev               # API on http://localhost:4000
pnpm --filter @tasknest/web dev               # web on http://localhost:3000
```

The web app proxies `/api/*` to the API (see `apps/web/next.config.ts`), so the refresh cookie stays first-party.

### Tests

```bash
createdb tasknest_test   # or: docker compose exec db createdb -U tasknest tasknest_test
TEST_DATABASE_URL=postgres://tasknest:tasknest@localhost:5432/tasknest_test pnpm --filter @tasknest/api test
```

The test run rebuilds the test database from the migrations, then runs 25 integration tests covering
registration, login, refresh-token rotation and theft detection, role permissions, tenant isolation and invitations.

## API (so far)

| Method | Path | Who |
| --- | --- | --- |
| POST | `/api/v1/auth/register` · `/auth/login` · `/auth/refresh` · `/auth/logout` | Public |
| GET | `/api/v1/me` | Signed in |
| POST | `/api/v1/workspaces` | Signed in |
| GET | `/api/v1/workspaces/slug-available?slug=` | Signed in |
| GET / PATCH / DELETE | `/api/v1/w/:slug` | Guest / Admin / Owner |
| GET | `/api/v1/w/:slug/members` | Guest |
| PATCH / DELETE | `/api/v1/w/:slug/members/:userId` | Admin (or self to leave) |
| GET / POST / DELETE | `/api/v1/w/:slug/invitations[/:id]` | Admin |
| GET | `/api/v1/invitations/:token` | Public |
| POST | `/api/v1/invitations/:token/accept` | Signed in (matching email) |

Errors always use one shape: `{ "error": { "code", "message", "fields?", "requestId" } }`.

## Roadmap

- [x] Week 1: monorepo, schema, migrations, CI, design tokens
- [x] Weeks 2–3: auth, workspaces, members, invitations, onboarding
- [ ] Week 4: projects
- [ ] Weeks 5–6: tasks API and Kanban board with drag and drop
- [ ] Week 7: task drawer, comments, My tasks
- [ ] Week 8: polish, accessibility pass, deploy (Vercel + Render + Neon)

## Notes

- Invite emails are not sent yet; the API returns an invite link for the admin to share (email arrives in v1.2).
- Fonts are bundled from npm (`@fontsource-variable`) so builds work offline.
