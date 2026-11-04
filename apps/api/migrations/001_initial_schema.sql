-- =====================================================================
-- Project Management SaaS — PostgreSQL Schema
-- Target: PostgreSQL 14+
-- Tables: users, workspaces, workspace_members, projects, tasks, comments
-- =====================================================================


-- gen_random_uuid() is built in from PG13; citext gives case-insensitive emails
CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------
CREATE TYPE workspace_role AS ENUM ('owner', 'admin', 'member', 'guest');
CREATE TYPE project_status AS ENUM ('active', 'on_hold', 'completed', 'archived');
CREATE TYPE task_status    AS ENUM ('backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled');
CREATE TYPE task_priority  AS ENUM ('low', 'medium', 'high', 'urgent');

-- ---------------------------------------------------------------------
-- Shared trigger: keep updated_at current on every UPDATE
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- USERS
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           CITEXT       NOT NULL,
    password_hash   TEXT,                               -- NULL for SSO-only accounts
    full_name       VARCHAR(120) NOT NULL,
    avatar_url      TEXT,
    timezone        VARCHAR(64)  NOT NULL DEFAULT 'UTC',
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,                        -- soft delete

    CONSTRAINT users_email_format CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

-- Email must be unique among non-deleted users (allows re-signup after deletion)
CREATE UNIQUE INDEX users_email_uq ON users (email) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- WORKSPACES  (the tenant boundary in a multi-tenant SaaS)
-- ---------------------------------------------------------------------
CREATE TABLE workspaces (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL,
    slug        VARCHAR(60)  NOT NULL,                  -- used in URLs: app.com/acme
    owner_id    UUID         NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    plan        VARCHAR(20)  NOT NULL DEFAULT 'free',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ,

    CONSTRAINT workspaces_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT workspaces_plan_check  CHECK (plan IN ('free', 'pro', 'business', 'enterprise'))
);

CREATE UNIQUE INDEX workspaces_slug_uq ON workspaces (slug) WHERE deleted_at IS NULL;
CREATE INDEX workspaces_owner_idx ON workspaces (owner_id);

CREATE TRIGGER trg_workspaces_updated_at
    BEFORE UPDATE ON workspaces
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- WORKSPACE_MEMBERS  (many-to-many: users <-> workspaces, with a role)
-- ---------------------------------------------------------------------
CREATE TABLE workspace_members (
    workspace_id  UUID           NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    user_id       UUID           NOT NULL REFERENCES users (id)      ON DELETE CASCADE,
    role          workspace_role NOT NULL DEFAULT 'member',
    invited_by    UUID           REFERENCES users (id) ON DELETE SET NULL,
    joined_at     TIMESTAMPTZ    NOT NULL DEFAULT now(),
    created_at    TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ    NOT NULL DEFAULT now(),

    PRIMARY KEY (workspace_id, user_id)
);

-- PK covers "members of workspace X"; this covers "workspaces for user Y" (sidebar query)
CREATE INDEX workspace_members_user_idx ON workspace_members (user_id);

CREATE TRIGGER trg_workspace_members_updated_at
    BEFORE UPDATE ON workspace_members
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- PROJECTS
-- ---------------------------------------------------------------------
CREATE TABLE projects (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID           NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    name          VARCHAR(150)   NOT NULL,
    key           VARCHAR(10)    NOT NULL,              -- short prefix, e.g. "WEB" -> WEB-42
    description   TEXT,
    status        project_status NOT NULL DEFAULT 'active',
    lead_id       UUID           REFERENCES users (id) ON DELETE SET NULL,
    created_by    UUID           NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    start_date    DATE,
    due_date      DATE,
    task_counter  INTEGER        NOT NULL DEFAULT 0,    -- source for per-project task numbers
    created_at    TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ    NOT NULL DEFAULT now(),
    archived_at   TIMESTAMPTZ,
    deleted_at    TIMESTAMPTZ,

    CONSTRAINT projects_key_format CHECK (key ~ '^[A-Z][A-Z0-9]{1,9}$'),
    CONSTRAINT projects_dates_check CHECK (due_date IS NULL OR start_date IS NULL OR due_date >= start_date)
);

-- Project key unique within a workspace
CREATE UNIQUE INDEX projects_workspace_key_uq
    ON projects (workspace_id, key) WHERE deleted_at IS NULL;

-- Main listing query: live projects in a workspace, filtered by status
CREATE INDEX projects_workspace_status_idx
    ON projects (workspace_id, status) WHERE deleted_at IS NULL;

CREATE INDEX projects_lead_idx       ON projects (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX projects_created_by_idx ON projects (created_by);

CREATE TRIGGER trg_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- TASKS
-- ---------------------------------------------------------------------
CREATE TABLE tasks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID          NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    workspace_id    UUID          NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE, -- denormalized for tenant-wide queries
    parent_task_id  UUID          REFERENCES tasks (id) ON DELETE CASCADE,               -- subtasks
    number          INTEGER       NOT NULL,             -- human-readable: WEB-42
    title           VARCHAR(255)  NOT NULL,
    description     TEXT,
    status          task_status   NOT NULL DEFAULT 'todo',
    priority        task_priority NOT NULL DEFAULT 'medium',
    assignee_id     UUID          REFERENCES users (id) ON DELETE SET NULL,
    reporter_id     UUID          NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    position        NUMERIC(20,10) NOT NULL DEFAULT 0,  -- fractional ordering for drag-and-drop boards
    estimate_points SMALLINT,
    due_date        TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,

    -- Full-text search over title + description, maintained automatically
    search_vector   TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B')
    ) STORED,

    CONSTRAINT tasks_estimate_check   CHECK (estimate_points IS NULL OR estimate_points >= 0),
    CONSTRAINT tasks_not_own_parent   CHECK (parent_task_id IS NULL OR parent_task_id <> id),
    CONSTRAINT tasks_completed_check  CHECK (
        (status = 'done' AND completed_at IS NOT NULL) OR (status <> 'done')
    )
);

-- Task number unique per project (WEB-42 is never reused)
CREATE UNIQUE INDEX tasks_project_number_uq ON tasks (project_id, number);

-- Kanban board: tasks in a project grouped by status, in drag order
CREATE INDEX tasks_board_idx
    ON tasks (project_id, status, position) WHERE deleted_at IS NULL;

-- "My tasks" view: open tasks assigned to a user, soonest due first
CREATE INDEX tasks_assignee_open_idx
    ON tasks (assignee_id, due_date)
    WHERE deleted_at IS NULL AND status NOT IN ('done', 'cancelled');

-- Workspace-wide filters (e.g. all urgent tasks across projects)
CREATE INDEX tasks_workspace_status_priority_idx
    ON tasks (workspace_id, status, priority) WHERE deleted_at IS NULL;

-- Subtask lookups
CREATE INDEX tasks_parent_idx ON tasks (parent_task_id) WHERE parent_task_id IS NOT NULL;

-- Overdue-task reminders job
CREATE INDEX tasks_due_open_idx
    ON tasks (due_date)
    WHERE deleted_at IS NULL AND due_date IS NOT NULL AND status NOT IN ('done', 'cancelled');

CREATE INDEX tasks_reporter_idx ON tasks (reporter_id);

-- Full-text search
CREATE INDEX tasks_search_idx ON tasks USING GIN (search_vector);

CREATE TRIGGER trg_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-assign the next per-project task number and copy workspace_id from the project
CREATE OR REPLACE FUNCTION assign_task_number()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE projects
       SET task_counter = task_counter + 1
     WHERE id = NEW.project_id
    RETURNING task_counter, workspace_id
         INTO NEW.number, NEW.workspace_id;   -- row lock prevents duplicate numbers under concurrency
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tasks_assign_number
    BEFORE INSERT ON tasks
    FOR EACH ROW EXECUTE FUNCTION assign_task_number();

-- Set / clear completed_at automatically when status changes
CREATE OR REPLACE FUNCTION set_task_completed_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'done' AND NEW.completed_at IS NULL THEN
        NEW.completed_at := now();
    ELSIF NEW.status <> 'done' THEN
        NEW.completed_at := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tasks_completed_at
    BEFORE INSERT OR UPDATE OF status ON tasks
    FOR EACH ROW EXECUTE FUNCTION set_task_completed_at();

-- ---------------------------------------------------------------------
-- COMMENTS
-- ---------------------------------------------------------------------
CREATE TABLE comments (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id            UUID        NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    author_id          UUID        REFERENCES users (id) ON DELETE SET NULL,  -- keep comment if user leaves
    parent_comment_id  UUID        REFERENCES comments (id) ON DELETE CASCADE, -- threaded replies
    body               TEXT        NOT NULL,
    is_edited          BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at         TIMESTAMPTZ,

    CONSTRAINT comments_body_not_blank CHECK (length(trim(body)) > 0)
);

-- Task detail page: comments for a task in chronological order
CREATE INDEX comments_task_created_idx
    ON comments (task_id, created_at) WHERE deleted_at IS NULL;

CREATE INDEX comments_author_idx ON comments (author_id);
CREATE INDEX comments_parent_idx ON comments (parent_comment_id) WHERE parent_comment_id IS NOT NULL;

CREATE TRIGGER trg_comments_updated_at
    BEFORE UPDATE ON comments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

