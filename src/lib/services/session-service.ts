/**
 * Session persistence for Quiz Maker.
 *
 * Server-only. Never import this from a file marked `'use client'`.
 * All D1 access for the sessions table lives here.
 */

import {
  generateSessionToken,
  hashSessionToken,
} from "@/lib/auth/session-token";
import { getDb } from "@/lib/db";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24;
export const REMEMBER_ME_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type SessionRecord = {
  token: string;
  expiresAt: string;
  rememberMe: boolean;
  maxAgeSeconds: number;
};

function maxAgeForRememberMe(rememberMe: boolean): number {
  return rememberMe ? REMEMBER_ME_MAX_AGE_SECONDS : SESSION_MAX_AGE_SECONDS;
}

function expiresAtFromNow(maxAgeSeconds: number): string {
  return new Date(Date.now() + maxAgeSeconds * 1000).toISOString();
}

function sqliteNow(): string {
  return new Date().toISOString();
}

export async function createSession(
  userId: string,
  rememberMe: boolean,
): Promise<SessionRecord> {
  const maxAgeSeconds = maxAgeForRememberMe(rememberMe);
  const expiresAt = expiresAtFromNow(maxAgeSeconds);
  const { token, tokenHash } = await generateSessionToken();
  const db = await getDb();

  await db
    .prepare(
      `INSERT INTO sessions (token_hash, user_id, expires_at)
       VALUES (?1, ?2, ?3)`,
    )
    .bind(tokenHash, userId, expiresAt)
    .run();

  return {
    token,
    expiresAt,
    rememberMe,
    maxAgeSeconds,
  };
}

export async function getSessionUserId(token: string): Promise<string | null> {
  const tokenHash = await hashSessionToken(token);
  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT user_id FROM sessions
       WHERE token_hash = ?1 AND expires_at > ?2`,
    )
    .bind(tokenHash, sqliteNow())
    .all<{ user_id: string }>();

  return results[0]?.user_id ?? null;
}

export async function deleteSession(token: string): Promise<void> {
  const tokenHash = await hashSessionToken(token);
  const db = await getDb();

  await db
    .prepare(`DELETE FROM sessions WHERE token_hash = ?1`)
    .bind(tokenHash)
    .run();
}
