-- Refresh tokens (rotated on every use; family_id groups one login's chain)
CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL UNIQUE,
    family_id   UUID        NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx   ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);

-- Workspace invitations
CREATE TABLE invitations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID           NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    email         CITEXT         NOT NULL,
    role          workspace_role NOT NULL DEFAULT 'member',
    token_hash    TEXT           NOT NULL UNIQUE,
    invited_by    UUID           REFERENCES users (id) ON DELETE SET NULL,
    expires_at    TIMESTAMPTZ    NOT NULL,
    accepted_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ    NOT NULL DEFAULT now(),

    CONSTRAINT invitations_role_not_owner CHECK (role <> 'owner')
);
CREATE UNIQUE INDEX invitations_pending_uq
    ON invitations (workspace_id, email) WHERE accepted_at IS NULL;
