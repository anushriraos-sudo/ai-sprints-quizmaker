/**
 * Resolve the currently authenticated user from the session cookie.
 *
 * Server-only. Never import this from a file marked `'use client'`.
 */

import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";
import { getSessionUserId } from "@/lib/services/session-service";
import { getUserById, toPublicUser } from "@/lib/services/user-service";
import type { PublicUser } from "@/lib/types/user";

export async function getCurrentUser(): Promise<PublicUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  const userId = await getSessionUserId(token);
  if (!userId) {
    return null;
  }

  const user = await getUserById(userId);
  return user ? toPublicUser(user) : null;
}

export async function getCurrentUserIdFromToken(
  token: string | undefined,
): Promise<string | null> {
  if (!token) {
    return null;
  }

  return getSessionUserId(token);
}
