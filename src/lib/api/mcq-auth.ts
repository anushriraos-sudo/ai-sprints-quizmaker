/**
 * MCQ API authentication helpers.
 *
 * Server-only. API routes authenticate from the Request cookie because
 * middleware does not cover `/api/*`.
 */

import { NextResponse } from "next/server";

import { getCurrentUserIdFromToken } from "@/lib/auth/get-current-user";
import { parseSessionCookie } from "@/lib/auth/session-cookie";
import { getUserById, toPublicUser } from "@/lib/services/user-service";
import type { PublicUser } from "@/lib/types/user";

export const MCQ_GENERIC_ERROR = "Something went wrong. Please try again.";
export const MCQ_NOT_FOUND = "MCQ not found";
export const MCQ_AUTH_REQUIRED = "Authentication required";
export const MCQ_INVALID_BODY = "Invalid request body";
export const MCQ_INVALID_CHOICE = "One or more choices are invalid";
export const MCQ_INVALID_ATTEMPT_CHOICE =
  "Selected choice is invalid for this MCQ";

export async function getAuthenticatedUserFromRequest(
  request: Request,
): Promise<PublicUser | null> {
  const token = parseSessionCookie(request.headers.get("cookie"));
  if (!token) {
    return null;
  }

  const userId = await getCurrentUserIdFromToken(token);
  if (!userId) {
    return null;
  }

  const user = await getUserById(userId);
  return user ? toPublicUser(user) : null;
}

export function unauthorizedMcqResponse() {
  return NextResponse.json({ formError: MCQ_AUTH_REQUIRED }, { status: 401 });
}

export function notFoundMcqResponse() {
  return NextResponse.json({ formError: MCQ_NOT_FOUND }, { status: 404 });
}

export function invalidBodyResponse() {
  return NextResponse.json({ formError: MCQ_INVALID_BODY }, { status: 400 });
}

export function genericMcqErrorResponse() {
  return NextResponse.json({ formError: MCQ_GENERIC_ERROR }, { status: 500 });
}
