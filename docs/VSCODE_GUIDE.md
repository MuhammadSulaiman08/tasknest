# TaskNest — VS Code Guide

_Set up, run, test, debug and deploy TaskNest from Visual Studio Code, step by step._

## 1. What you will end up with

By the end of this guide TaskNest runs on your computer: the website at http://localhost:3000, the API at http://localhost:4000 and PostgreSQL in Docker. You will be able to run the 57 automated tests, set breakpoints in VS Code, browse the database, and deploy a live demo link for your resume.

![Figure 1. The project board you should see after setup (demo account)](screenshots/11-board.png)

| Time needed | What | Section |
| --- | --- | --- |
| 20–30 min | Install tools (once) | 2 |
| 5 min | Open the project and run first-time setup | 3–5 |
| 1 min | Start the app on any later day | 6 |
| 30–45 min | Deploy a free live demo | 11 |

## 2. Install the tools (one time)

The steps are written for **Windows 10/11**; macOS notes are in brackets. Accept the default options in every installer unless the step says otherwise.

| Tool | Version | Where to get it | Check it worked (in a new terminal) |
| --- | --- | --- | --- |
| Node.js | 22 LTS | nodejs.org → "LTS" installer | `node -v` shows v22.x |
| pnpm | 10 | Run `npm install -g pnpm` after Node is installed | `pnpm -v` shows 10.x |
| Git | Latest | git-scm.com/download/win (macOS: comes with Xcode tools) | `git --version` |
| Docker Desktop | Latest | docker.com/products/docker-desktop | Docker icon is green; `docker info` works |
| VS Code | Latest | code.visualstudio.com | Opens normally |
| Google Chrome | Latest | google.com/chrome | Needed only for the "Debug Web (Chrome)" option |

> **Note:** Docker Desktop on Windows asks to enable WSL 2. Say yes and restart if asked. If your laptop cannot run Docker, skip it and use section 2.1 instead.

### 2.1 No Docker? Install PostgreSQL directly

1. Download PostgreSQL 16 from postgresql.org/download/windows (EDB installer). Remember the password you set for the `postgres` user; port stays 5432.
2. Open **pgAdmin** (installed with it) → right-click Databases → Create → Database. Create two databases: `tasknest` and `tasknest_test`.
3. Later, in section 5, put your password into `apps/api/.env`: `DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/tasknest`.
4. Run tests with `$env:TEST_DATABASE_URL="postgres://postgres:YOUR_PASSWORD@localhost:5432/tasknest_test"; pnpm test` in PowerShell.

### 2.2 Windows: allow pnpm scripts in PowerShell

If PowerShell says "running scripts is disabled on this system" when you type `pnpm`, run this once, then close and reopen the terminal:

```
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

## 3. Open the project in VS Code

1. Unzip **tasknest.zip** somewhere with a short path, for example `C:\dev\tasknest` (avoid OneDrive folders; they slow down `node_modules`).
2. In VS Code: **File → Open Folder…** and choose the `tasknest` folder (the one that contains `package.json` and `pnpm-workspace.yaml`).
3. When asked "Do you trust the authors of the files in this folder?", click **Yes, I trust the authors**.
4. A pop-up says "This workspace has extension recommendations". Click **Install**. (Or open the Extensions panel with Ctrl+Shift+X, type `@recommended`, and install everything under "Workspace Recommendations".)
5. Open a terminal inside VS Code with **Ctrl+`** (the key above Tab). All commands in this guide are typed there.

### 3.1 Recommended extensions and what they do

| Extension | Why you want it |
| --- | --- |
| Prettier | Formats code on every save using the project's `.prettierrc` |
| ESLint | Highlights common mistakes while you type |
| Tailwind CSS IntelliSense | Autocompletes class names like `bg-primary` and shows the colour |
| Vitest | Adds a Testing panel with a ▶ button next to every API test |
| SQLTools + PostgreSQL driver | Browse tables and run SQL inside VS Code (connection is pre-configured) |
| Docker | See the database container, its logs, and start/stop it with a click |
| REST Client | Send API requests from `apps/api/http/api.http` without Postman |
| GitLens | Shows who changed each line and when; nicer Git history |
| Error Lens | Shows TypeScript errors inline at the end of the line |
| Pretty TypeScript Errors | Makes long TypeScript errors readable |
| DotENV | Colours `.env` files |

## 4. A quick tour of the folders

```
tasknest/
├── .vscode/              VS Code settings, debug configs, tasks, extension list
├── apps/
│   ├── api/              Express API (port 4000)
│   │   ├── migrations/   SQL that creates the tables
│   │   ├── scripts/      migrate.ts, seed.ts (demo data)
│   │   ├── http/         api.http: ready-made requests for REST Client
│   │   ├── src/
│   │   │   ├── middleware/   auth, workspace + role checks, validation, errors
│   │   │   ├── modules/      auth, workspaces, projects, tasks, comments, notifications
│   │   │   └── realtime/     Socket.IO live updates
│   │   └── test/         57 integration tests (Vitest + Supertest)
│   └── web/              Next.js website (port 3000)
│       └── src/
│           ├── app/          pages: /login, /w/[slug]/p/[key] (board), ...
│           ├── components/   Board, TaskDrawer, AppShell, ui/
│           └── lib/          API client, auth, data hooks
├── packages/shared/      validation rules + types used by BOTH apps
├── docs/                 PRD, TRD, App Flow, UI/UX, Backend, Plan, this guide
├── docker-compose.yml    PostgreSQL 16 for local development
└── scripts/first-run.mjs one-command setup
```

Tip: press **Ctrl+P** and type part of a file name (for example `Board.tsx`) to open it instantly.

## 5. First-time setup

Make sure Docker Desktop is running (green whale icon), then run these two commands in the VS Code terminal:

```
pnpm install          # downloads all packages (2–4 minutes the first time)
pnpm first-run        # creates .env files, starts PostgreSQL, creates tables, loads demo data
```

You should see `✓ All set` at the end. The script created `apps/api/.env` and `apps/web/.env.local` from the example files; the defaults already match the Docker database, so you do not need to edit them.

**Without Docker** (section 2.1): run `pnpm first-run --no-docker` after setting your password in `apps/api/.env`.

#### Prefer clicking to typing?

Press **Ctrl+Shift+P** → type **Tasks: Run Task** → choose **Setup: first run**. Every command in this guide also exists as a task.

## 6. Run the app (every day)

### Option A: one command

```
pnpm dev     # starts the API and the website together
```

### Option B: two terminals (easier to read logs)

1. In the terminal, click the **split terminal** icon (or Ctrl+Shift+5).
2. Left terminal: `pnpm dev:api`. Wait for "API listening on http://localhost:4000".
3. Right terminal: `pnpm dev:web`. Wait for "Ready".

### Option C: VS Code task

Press **Ctrl+Shift+B** (Run Build Task). It starts "Dev: API + Web" in two terminal tabs.

### Log in

Open **http://localhost:3000** and log in with the demo account. Other demo users show the role system:

| Email | Password | Role | Try this |
| --- | --- | --- | --- |
| demo@tasknest.app | password123 | Owner | Everything: projects, members, archive |
| bilal@tasknest.app | password123 | Admin | Manage projects and people |
| hira@tasknest.app | password123 | Member | Create and drag tasks |
| sana@tasknest.app | password123 | Guest | Read-only board, can still comment |

#### See live updates and notifications

1. Open a second browser window in private/incognito mode and log in as `bilal@tasknest.app`.
2. Open the Website board in both windows. The small green dot next to the search box means live updates are on.
3. As Ayesha, drag a card or add a task: it appears in Bilal's window within a second.
4. As Ayesha, open a task and type `@Bi` in a comment, pick Bilal Ahmed and send. Bilal's bell shows a red badge; clicking the notification opens the task.

Stop the servers with **Ctrl+C** in each terminal. The database keeps running in Docker; stop it with `pnpm db:down` if you want. To restore the demo data at any time: `pnpm db:seed`.

## 7. Run the tests

### From the terminal

```
pnpm test         # 57 API tests against the tasknest_test database
pnpm typecheck    # TypeScript checks for every package
```

### From the Testing panel

1. Click the **flask icon** in the left Activity Bar (installed by the Vitest extension).
2. Expand the tree: `auth`, `workspaces`, `tasks`, `notifications`, `google`, `realtime` and `position` test files.
3. Click ▶ next to any test or file. Green tick = pass. Click a failed test to jump to the failing line.

> **Note:** The test database is wiped and rebuilt at the start of every test run, so tests never touch your demo data.

## 8. Debug with breakpoints

The debug configurations are already set up in `.vscode/launch.json`. Stop any running `pnpm dev` first so the ports are free.

| Configuration (Run and Debug panel, Ctrl+Shift+D) | Use it to |
| --- | --- |
| Debug API | Pause inside an API request, e.g. in `tasks.service.ts` |
| Debug Web (server side) | Run Next.js under the debugger |
| Debug Web (Chrome) | Breakpoints in React components (start the web app first) |
| Debug API + Web | Both servers under the debugger at once |
| Debug API tests (current file) | Open a test file, then start this to step through it |

#### Try it: watch a card move

1. Open `apps/api/src/modules/tasks/tasks.service.ts` and find `export async function move`.
2. Click in the gutter left of the line `let position = positionBetween(before, after);` to add a red dot.
3. Choose **Debug API + Web** in the Run and Debug panel and press **F5**.
4. In the browser, drag a card to another column. VS Code pauses on your line.
5. Hover over `before` and `after` to see the neighbours' positions; press **F10** to step and **F5** to continue.

## 9. Look at the database inside VS Code

1. Click the **SQLTools** icon (database cylinder) in the Activity Bar.
2. The connection **TaskNest (local Docker)** is already listed. Click the plug icon to connect.
3. Expand Tables to browse data, or click **New SQL File** and run a query with **Ctrl+E Ctrl+E**.

```
-- Tasks per status in the Website project
SELECT t.status, count(*) FROM tasks t
JOIN projects p ON p.id = t.project_id
WHERE p.key = 'WEB' AND t.deleted_at IS NULL
GROUP BY t.status ORDER BY 2 DESC;

-- See the fractional positions that keep the board in order
SELECT number, title, status, position FROM tasks WHERE status = 'todo' ORDER BY position;
```

Using your own PostgreSQL (section 2.1)? Edit the connection in `.vscode/settings.json` (`username` postgres, your password).

### Call the API directly

Open `apps/api/http/api.http`. Click **Send Request** above "1. Log in"; the token is reused by the other requests automatically. Try "5. Create a task" and refresh the board in the browser.

## 10. Make a change and save it with Git

### 10.1 Example change: rename a column label

1. Open `packages/shared/src/index.ts` and find `statusLabels`.
2. Change `in_review: 'In review'` to `in_review: 'Review'` and save (Ctrl+S).
3. The browser updates by itself: the board column is renamed. Shared code is used by both apps, which is why it lives in `packages/shared`.
4. Change it back if you prefer, or keep it and commit.

### 10.2 Where things live when you add features

| You want to… | Edit these files |
| --- | --- |
| Add a field to tasks (e.g. labels) | New migration in `apps/api/migrations/` → `pnpm db:migrate` → `pnpm --filter @tasknest/api db:types` → schema in `packages/shared` → `tasks.service.ts` → `TaskDrawer.tsx` |
| Add an API endpoint | `apps/api/src/modules/<module>/<module>.routes.ts` + service, plus a test in `apps/api/test/` |
| Add a page | New folder under `apps/web/src/app/w/[slug]/` with a `page.tsx` |
| Change colours or fonts | `apps/web/src/app/globals.css` (design tokens) |

### 10.3 Commit and push to GitHub

1. First time only, tell Git who you are: `git config --global user.name "Your Name"` and `git config --global user.email "you@example.com"`.
2. Open **Source Control** (Ctrl+Shift+G). Changed files are listed. Type a message such as `feat: rename review column` and click **Commit**.
3. Click **Publish Branch** (first time). VS Code asks you to sign in to GitHub, then lets you choose **public** repository. Pick public so recruiters can see it.
4. After that, use **Sync Changes** to push new commits.

> **Note:** Your `.env` files are listed in `.gitignore`, so secrets are never pushed. Never commit real passwords or API keys.

## 11. Deploy a free live demo

A live link makes the resume entry much stronger. The plan uses three free services: **Neon** (database), **Render** (API) and **Vercel** (website). Push the code to GitHub first (section 10.3).

### 11.1 Database on Neon

1. Sign up at neon.tech with GitHub → **Create project** → name `tasknest`, region closest to you, PostgreSQL 16.
2. Copy the **connection string** (it starts with `postgresql://` and ends with `?sslmode=require`).
3. In VS Code create `apps/api/.env.production` (it is git-ignored) with:

```
DATABASE_URL=postgresql://...your-neon-string...?sslmode=require
JWT_SECRET=paste-a-long-random-string-of-40-plus-characters
WEB_ORIGIN=https://tasknest-yourname.vercel.app
NODE_ENV=production
```

1. Create the tables: `pnpm --filter @tasknest/api migrate:prod`.
2. Load the demo workspace: `pnpm --filter @tasknest/api seed:prod`.

Generate a random secret in the terminal with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### 11.2 API on Render

1. Sign up at render.com with GitHub → **New → Web Service** → pick your `tasknest` repository.
2. Settings: Root Directory: leave empty. Runtime: Node. Instance type: **Free**.
3. Build Command: `corepack enable && pnpm install --frozen-lockfile`
4. Start Command: `pnpm --filter @tasknest/api start`
5. Environment variables: `DATABASE_URL`, `JWT_SECRET`, `WEB_ORIGIN` (same values as `.env.production`), `NODE_ENV=production`, `NODE_VERSION=22`. Optional: the Google and Resend variables from section 11.4.
6. Under Advanced, set Health Check Path to `/health`. Click **Create Web Service** and wait for "Live".
7. Open `https://<your-service>.onrender.com/health`. You should see `{"status":"ok"}`.

### 11.3 Website on Vercel

1. Sign up at vercel.com with GitHub → **Add New → Project** → import `tasknest`.
2. Root Directory: click Edit and choose `apps/web`. Framework: Next.js (detected).
3. Environment variables: `API_URL` and `NEXT_PUBLIC_API_URL`, both set to your Render URL, e.g. `https://tasknest-api.onrender.com` (no slash at the end). The second one is used by the browser for live updates.
4. Click **Deploy**. When it finishes, copy the site URL.
5. If the Vercel URL differs from the `WEB_ORIGIN` you guessed, update `WEB_ORIGIN` on Render and redeploy the API.
6. Open the site and log in with `demo@tasknest.app` / `password123`.

> **Note:** Render's free tier sleeps after 15 minutes without traffic, so the first request can take about 30–50 seconds. Mention "first load may take a moment" in your README, or open the link yourself a minute before an interview.

### 11.4 Optional: Google sign-in and invite emails

Both features are built in and switch on when their keys are set. Without them the app works normally: the Google button is hidden and invite links are shown to copy (and printed in the API log).

#### Google sign-in

1. Go to console.cloud.google.com → create a project → **APIs & Services → OAuth consent screen** → External → fill in app name and your email → add yourself as a test user.
2. **Credentials → Create credentials → OAuth client ID** → Web application.
3. Authorised redirect URIs: add `http://localhost:3000/api/v1/auth/google/callback` and, for the live site, `https://<your-vercel-url>/api/v1/auth/google/callback`.
4. Copy the Client ID and Client secret into `apps/api/.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (and into Render for production). Restart the API.
5. The login and sign-up pages now show **Continue with Google**. An existing account with the same email is linked automatically.

#### Invite emails with Resend

1. Sign up at resend.com and create an API key.
2. Set `RESEND_API_KEY` in `apps/api/.env` (and on Render). Without your own domain, Resend only delivers to your own email address, which is enough for a demo.
3. Invites now say "Invite emailed to …" and still show the link to copy.

## 12. Put it on your resume

Suggested project entry (edit the numbers once you have your own deployment):

```
TaskNest | Multi-tenant project management SaaS       github.com/<you>/tasknest | <live link>
Next.js · React · TypeScript · Node.js/Express · PostgreSQL · Socket.IO · Tailwind · Vitest
- Built a Jira-style SaaS with workspaces, role-based access (owner/admin/member/guest),
  Kanban boards with drag and drop, subtasks, threaded comments with @mentions,
  in-app notifications and real-time updates over WebSockets (Socket.IO).
- Designed a PostgreSQL schema with partial and full-text indexes, trigger-based task
  numbering and fractional ordering so a card move writes a single row.
- Implemented JWT auth with rotating refresh tokens and reuse detection plus Google OAuth;
  enforced tenant isolation on every route and covered it with 57 integration tests in CI.
- Planned the work in Agile sprints and documented it with a PRD, TRD, app flow,
  UI/UX brief and backend specification.
```

- Pin the GitHub repository on your profile and add 2–3 screenshots from `docs/screenshots` to the README (already done).
- Record a 2-minute screen video: sign in → board → drag a card → open it → comment. Link it in the README.
- On LinkedIn, add TaskNest under **Projects** with the live link, and share a short post about what you learned.

## 13. Troubleshooting

| Problem | Fix |
| --- | --- |
| `pnpm` is not recognized | Close and reopen VS Code after installing; run `npm install -g pnpm`. On Windows also see section 2.2. |
| `docker compose` fails or "Docker is not running" | Start Docker Desktop and wait for the green whale icon, then run `pnpm first-run` again. |
| `ECONNREFUSED 127.0.0.1:5432` | The database is not running: `pnpm db:up`. With your own PostgreSQL, check the Windows service "postgresql-x64-16" is started. |
| Port 5432 already in use | Another PostgreSQL is installed. Stop it in Windows Services, or change the left port in `docker-compose.yml` to `"5433:5432"` and use 5433 in `.env`. |
| Port 3000 or 4000 already in use | An old server is still running. Close old terminals (trash icon) or restart VS Code. |
| Tests fail: database "tasknest_test" does not exist | Your Docker volume was created before the test DB was added. Run `pnpm db:down`, then `docker volume rm tasknest_pgdata`, then `pnpm first-run`. |
| "Too many attempts, try again in 1 minute" | Login is rate-limited to 5 tries per minute (a security feature). Wait 60 seconds. |
| "Invalid environment variables" when the API starts | An `.env` value is missing. Compare `apps/api/.env` with `apps/api/.env.example`. `JWT_SECRET` must be 32+ characters. |
| Logged out after every refresh | The API is not running or `API_URL` in `apps/web/.env.local` is wrong (should be `http://localhost:4000`). |
| Red squiggles but the app runs | Ctrl+Shift+P → **TypeScript: Select TypeScript Version** → **Use Workspace Version**; then **Developer: Reload Window**. |
| Changes in `packages/shared` not picked up by the API | Restart `pnpm dev:api` (the watcher only watches the API folder). |
| Grey dot instead of green (no live updates) | The browser cannot reach the API socket. Check `NEXT_PUBLIC_API_URL` in `apps/web/.env.local` (local: `http://localhost:4000`) and restart `pnpm dev:web`. Everything else still works; pages refresh every minute. |
| Google button does not appear | Set both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `apps/api/.env` and restart the API. |
| Google says redirect_uri_mismatch | Add the exact callback URL from section 11.4 to the OAuth client in Google Cloud, including http/https and port. |
| Render deploy fails on install | Make sure `NODE_VERSION=22` is set and the build command starts with `corepack enable`. |
| Live site loads but login fails | Check `API_URL` on Vercel (no trailing slash) and `WEB_ORIGIN` on Render (exact Vercel URL, https). |

## 14. Cheat sheet

### Project commands

| Command | What it does |
| --- | --- |
| `pnpm first-run` | Create .env files, start DB, migrate, seed (first time) |
| `pnpm dev` | Start API + website |
| `pnpm dev:api` / `pnpm dev:web` | Start one of them |
| `pnpm test` | Run the 57 API tests |
| `pnpm typecheck` | TypeScript check for all packages |
| `pnpm db:up` / `pnpm db:down` | Start / stop PostgreSQL in Docker |
| `pnpm db:migrate` | Apply new SQL migrations |
| `pnpm db:seed` | Reset the demo workspace |
| `pnpm --filter @tasknest/api db:types` | Regenerate database types after a migration |
| `pnpm build` | Production build of everything |
| `pnpm format` | Format all files with Prettier |

### VS Code shortcuts (Windows; on macOS use Cmd instead of Ctrl)

| Shortcut | Action |
| --- | --- |
| Ctrl+P | Open a file by name |
| Ctrl+Shift+P | Command Palette (run any command or task) |
| Ctrl+` | Show / hide the terminal |
| Ctrl+Shift+B | Start API + Web (default build task) |
| F5 / Shift+F5 | Start / stop debugging |
| F9 | Toggle breakpoint on the current line |
| F12 | Go to definition |
| Shift+F12 | Find all references |
| F2 | Rename a symbol everywhere |
| Ctrl+Shift+F | Search across all files |
| Ctrl+Shift+G | Source Control (Git) |
| Alt+Shift+F | Format the current file |

### Keyboard shortcuts inside TaskNest

| Key | Action |
| --- | --- |
| / | Focus the search box |
| Tab to a card, then Space, arrow keys, Space | Move a card without a mouse |
| Esc | Leave a field, then close the task drawer |
| Ctrl+Enter | Post a comment |
| Enter in quick add | Add the task and keep typing the next one |
