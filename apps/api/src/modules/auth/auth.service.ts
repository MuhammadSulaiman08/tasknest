import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { LoginInput, PublicUser, RegisterInput } from '@tasknest/shared';
import { db } from '../../db/index.js';
import { AppError } from '../../lib/AppError.js';
import { REFRESH_TOKEN_TTL_DAYS, hashToken, randomToken, signAccessToken } from '../../lib/tokens.js';
import * as repo from './auth.repo.js';

const BCRYPT_COST = process.env.NODE_ENV === 'test' ? 4 : 12;
// Compared against when the email does not exist, so response time does not reveal which emails are registered
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

export const toPublicUser = (u: {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  timezone: string;
}): PublicUser => ({ id: u.id, email: u.email, fullName: u.full_name, avatarUrl: u.avatar_url, timezone: u.timezone });

export async function issueSession(user: PublicUser, familyId: string = crypto.randomUUID()): Promise<Session> {
  const refreshToken = randomToken();
  await repo.insertRefreshToken(db, {
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    familyId,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 864e5),
  });
  return { accessToken: signAccessToken(user.id), refreshToken, user };
}

export async function register(input: RegisterInput): Promise<Session> {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  const row = await repo.insertUser({ email: input.email, fullName: input.fullName, passwordHash }); // 23505 -> EMAIL_TAKEN
  return issueSession(toPublicUser(row));
}

export async function login(input: LoginInput): Promise<Session> {
  const row = await repo.findActiveUserByEmail(input.email);
  const ok = await bcrypt.compare(input.password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !row.password_hash || !ok || !row.is_active) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }
  await repo.touchLastLogin(row.id);
  return issueSession(toPublicUser(row));
}

/**
 * Rotates a refresh token. Reusing an already-rotated token means it was likely stolen,
 * so the whole family (every token from that login) is revoked.
 */
export async function refresh(presentedToken: string | undefined): Promise<Session> {
  if (!presentedToken) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue');
  const tokenHash = hashToken(presentedToken);

  const result = await db.transaction().execute(async (trx) => {
    const token = await repo.findRefreshTokenForUpdate(trx, tokenHash);
    if (!token || token.expires_at < new Date()) return { kind: 'invalid' as const };
    if (token.revoked_at) {
      await repo.revokeFamily(trx, token.family_id);
      return { kind: 'reused' as const };
    }
    await repo.revokeRefreshToken(trx, token.id);
    const next = randomToken();
    await repo.insertRefreshToken(trx, {
      userId: token.user_id,
      tokenHash: hashToken(next),
      familyId: token.family_id,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 864e5),
    });
    return { kind: 'ok' as const, userId: token.user_id, refreshToken: next };
  });

  if (result.kind !== 'ok') throw new AppError(401, 'UNAUTHENTICATED', 'Your session ended, please sign in again');
  const user = await repo.findUserById(result.userId);
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Your session ended, please sign in again');
  return { accessToken: signAccessToken(user.id), refreshToken: result.refreshToken, user: toPublicUser(user) };
}

export async function logout(presentedToken: string | undefined) {
  if (presentedToken) await repo.revokeByHash(hashToken(presentedToken));
}

export async function me(userId: string) {
  const user = await repo.findUserById(userId);
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue');
  const workspaces = await repo.listWorkspacesForUser(userId);
  return { user: toPublicUser(user), workspaces };
}
