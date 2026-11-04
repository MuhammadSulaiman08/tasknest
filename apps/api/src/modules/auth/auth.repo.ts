import type { Kysely, Transaction } from 'kysely';
import { db } from '../../db/index.js';
import type { DB } from '../../db/types.js';

type Conn = Kysely<DB> | Transaction<DB>;

const publicUserColumns = ['id', 'email', 'full_name', 'avatar_url', 'timezone'] as const;

export function findActiveUserByEmail(email: string) {
  return db
    .selectFrom('users')
    .select([...publicUserColumns, 'password_hash', 'is_active'])
    .where('email', '=', email)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
}

export function findUserById(id: string) {
  return db
    .selectFrom('users')
    .select(publicUserColumns)
    .where('id', '=', id)
    .where('deleted_at', 'is', null)
    .where('is_active', '=', true)
    .executeTakeFirst();
}

export function insertUser(values: { email: string; fullName: string; passwordHash: string }) {
  return db
    .insertInto('users')
    .values({ email: values.email, full_name: values.fullName, password_hash: values.passwordHash })
    .returning(publicUserColumns)
    .executeTakeFirstOrThrow();
}

export function touchLastLogin(userId: string) {
  return db.updateTable('users').set({ last_login_at: new Date() }).where('id', '=', userId).execute();
}

export function insertRefreshToken(
  conn: Conn,
  v: { userId: string; tokenHash: string; familyId: string; expiresAt: Date },
) {
  return conn
    .insertInto('refresh_tokens')
    .values({ user_id: v.userId, token_hash: v.tokenHash, family_id: v.familyId, expires_at: v.expiresAt })
    .execute();
}

/** Locks the row so two concurrent refreshes with the same token cannot both succeed. */
export function findRefreshTokenForUpdate(trx: Transaction<DB>, tokenHash: string) {
  return trx
    .selectFrom('refresh_tokens')
    .selectAll()
    .where('token_hash', '=', tokenHash)
    .forUpdate()
    .executeTakeFirst();
}

export function revokeRefreshToken(conn: Conn, id: string) {
  return conn.updateTable('refresh_tokens').set({ revoked_at: new Date() }).where('id', '=', id).execute();
}

export function revokeFamily(conn: Conn, familyId: string) {
  return conn
    .updateTable('refresh_tokens')
    .set({ revoked_at: new Date() })
    .where('family_id', '=', familyId)
    .where('revoked_at', 'is', null)
    .execute();
}

export function revokeByHash(tokenHash: string) {
  return db
    .updateTable('refresh_tokens')
    .set({ revoked_at: new Date() })
    .where('token_hash', '=', tokenHash)
    .where('revoked_at', 'is', null)
    .execute();
}

export function listWorkspacesForUser(userId: string) {
  return db
    .selectFrom('workspace_members as m')
    .innerJoin('workspaces as w', 'w.id', 'm.workspace_id')
    .select(['w.id', 'w.name', 'w.slug', 'm.role'])
    .where('m.user_id', '=', userId)
    .where('w.deleted_at', 'is', null)
    .orderBy('w.name')
    .execute();
}
