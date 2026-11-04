-- In-app notifications (assignment, mention, comment, due soon)
CREATE TABLE notifications (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    workspace_id  UUID        NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    type          VARCHAR(30) NOT NULL,
    task_id       UUID        REFERENCES tasks (id) ON DELETE CASCADE,
    comment_id    UUID        REFERENCES comments (id) ON DELETE CASCADE,
    actor_id      UUID        REFERENCES users (id) ON DELETE SET NULL,
    read_at       TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT notifications_type_check CHECK (type IN ('assigned', 'mentioned', 'commented', 'due_soon'))
);
-- Bell list: newest first per user and workspace; unread count
CREATE INDEX notifications_user_ws_idx ON notifications (user_id, workspace_id, created_at DESC);
CREATE INDEX notifications_unread_idx  ON notifications (user_id, workspace_id) WHERE read_at IS NULL;

-- One "due soon" notification per due date: cleared when the due date changes
ALTER TABLE tasks ADD COLUMN due_soon_notified_at TIMESTAMPTZ;

-- Google sign-in
ALTER TABLE users ADD COLUMN google_id TEXT;
CREATE UNIQUE INDEX users_google_id_uq ON users (google_id) WHERE google_id IS NOT NULL;
