/**
 * Auth business logic for Quiz Maker.
 *
 * Server-only. Never import this from a file marked `'use client'`.
 */

import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  verifyPassword,
} from "@/lib/auth/password";
import {
  createUser,
  getUserByEmail,
  getUserByUsername,
  toPublicUser,
} from "@/lib/services/user-service";
import type { AuthErrorResponse } from "@/lib/types/auth-api";
import type { PublicUser } from "@/lib/types/user";
import { type LoginInput, type RegisterInput } from "@/lib/validations/auth";

const DUPLICATE_EMAIL = "That email is already registered";
const DUPLICATE_USERNAME = "That username is taken";
const GENERIC_ERROR = "Something went wrong. Please try again.";
const INVALID_CREDENTIALS = "Invalid email or password";

export type AuthHandlerError = {
  error: AuthErrorResponse;
  status: number;
};

export type RegisterHandlerResult = { user: PublicUser } | AuthHandlerError;
export type LoginHandlerResult = { user: PublicUser } | AuthHandlerError;

function isRecognizedPasswordHash(stored: string): boolean {
  const parts = stored.split("$");
  return parts.length === 4 && parts[0] === "pbkdf2";
}

export async function registerUser(
  input: RegisterInput,
): Promise<RegisterHandlerResult> {
  try {
    const [existingUsername, existingEmail] = await Promise.all([
      getUserByUsername(input.username),
      getUserByEmail(input.email),
    ]);

    const fieldErrors: Partial<Record<string, string[]>> = {};
    if (existingUsername) {
      fieldErrors.username = [DUPLICATE_USERNAME];
    }
    if (existingEmail) {
      fieldErrors.email = [DUPLICATE_EMAIL];
    }
    if (Object.keys(fieldErrors).length > 0) {
      return { error: { fieldErrors }, status: 400 };
    }

    const passwordHash = await hashPassword(input.password);
    const created = await createUser({
      firstName: input.firstName,
      lastName: input.lastName,
      username: input.username,
      email: input.email,
      passwordHash,
    });

    if (!created.ok) {
      const message =
        created.duplicate === "username"
          ? DUPLICATE_USERNAME
          : DUPLICATE_EMAIL;
      return {
        error: { fieldErrors: { [created.duplicate]: [message] } },
        status: 400,
      };
    }

    return { user: created.user };
  } catch (error) {
    console.error("registerUser failed", error);
    return { error: { formError: GENERIC_ERROR }, status: 500 };
  }
}

export async function loginUser(
  input: LoginInput,
): Promise<LoginHandlerResult> {
  try {
    const user = await getUserByEmail(input.email);

    if (user && !isRecognizedPasswordHash(user.passwordHash)) {
      console.error("Malformed password hash for user", user.id);
    }

    const storedHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const valid = await verifyPassword(input.password, storedHash);

    if (!valid || !user) {
      return {
        error: { formError: INVALID_CREDENTIALS },
        status: 401,
      };
    }

    return { user: toPublicUser(user) };
  } catch (error) {
    console.error("loginUser failed", error);
    return { error: { formError: GENERIC_ERROR }, status: 500 };
  }
}

export function logoutUser() {
  return { redirectTo: "/login" as const };
}
