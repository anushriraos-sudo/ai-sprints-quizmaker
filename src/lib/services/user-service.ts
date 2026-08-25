/**
 * User persistence for Quiz Maker.
 *
 * Server-only. Never import this from a file marked `'use client'`.
 * All D1 access for the users table lives here.
 */

import { getDb } from "@/lib/db";
import type { PublicUser, UserRecord, UserRow } from "@/lib/types/user";

const USER_COLUMNS =
  "id, first_name, last_name, username, email, password_hash, created_at";

export type CreateUserInput = {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  passwordHash: string;
};

export type CreateUserDuplicateField = "username" | "email";

export type CreateUserResult =
  | { ok: true; user: PublicUser }
  | { ok: false; duplicate: CreateUserDuplicateField };

function rowToPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    username: row.username,
    email: row.email,
    createdAt: row.created_at,
  };
}

function rowToUserRecord(row: UserRow): UserRecord {
  return {
    ...rowToPublicUser(row),
    passwordHash: row.password_hash,
  };
}

function userRecordToPublicUser(record: UserRecord): PublicUser {
  return {
    id: record.id,
    firstName: record.firstName,
    lastName: record.lastName,
    username: record.username,
    email: record.email,
    createdAt: record.createdAt,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/** Map a D1 UNIQUE constraint failure to the offending field, if recognized. */
export function parseUniqueViolation(
  error: unknown,
): CreateUserDuplicateField | null {
  const message = errorMessage(error);
  if (message.includes("users.username")) {
    return "username";
  }
  if (message.includes("users.email")) {
    return "email";
  }
  return null;
}

async function selectUserRow(
  column: "id" | "email" | "username",
  value: string,
): Promise<UserRow | null> {
  const db = await getDb();
  const { results } = await db
    .prepare(`SELECT ${USER_COLUMNS} FROM users WHERE ${column} = ?1`)
    .bind(value)
    .all<UserRow>();
  return results[0] ?? null;
}

export async function createUser(
  input: CreateUserInput,
): Promise<CreateUserResult> {
  const db = await getDb();

  try {
    await db
      .prepare(
        `INSERT INTO users (first_name, last_name, username, email, password_hash)
         VALUES (?1, ?2, ?3, ?4, ?5)`,
      )
      .bind(
        input.firstName,
        input.lastName,
        input.username,
        input.email,
        input.passwordHash,
      )
      .run();
  } catch (error) {
    const duplicate = parseUniqueViolation(error);
    if (duplicate) {
      return { ok: false, duplicate };
    }
    throw error;
  }

  const row = await selectUserRow("email", input.email);
  if (!row) {
    throw new Error("User insert succeeded but subsequent lookup failed");
  }

  return { ok: true, user: rowToPublicUser(row) };
}

export async function getUserById(id: string): Promise<UserRecord | null> {
  const row = await selectUserRow("id", id);
  return row ? rowToUserRecord(row) : null;
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const row = await selectUserRow("email", email);
  return row ? rowToUserRecord(row) : null;
}

export async function getUserByUsername(
  username: string,
): Promise<UserRecord | null> {
  const row = await selectUserRow("username", username);
  return row ? rowToUserRecord(row) : null;
}

export function toPublicUser(record: UserRecord): PublicUser {
  return userRecordToPublicUser(record);
}
