import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserRow } from "@/lib/types/user";

const { getCloudflareContextMock } = vi.hoisted(() => ({
  getCloudflareContextMock: vi.fn(),
}));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: getCloudflareContextMock,
}));

import {
  createUser,
  getUserByEmail,
  getUserById,
  getUserByUsername,
  parseUniqueViolation,
} from "@/lib/services/user-service";

function createFakeDb() {
  const rows: UserRow[] = [];

  const prepare = vi.fn((sql: string) => {
    let bindings: unknown[] = [];
    const statement = {
      bind: vi.fn((...values: unknown[]) => {
        bindings = values;
        return statement;
      }),
      run: vi.fn(async () => {
        if (!sql.includes("INSERT INTO users")) {
          throw new Error(`Unexpected run query: ${sql}`);
        }

        const [, , username, email] = bindings as string[];
        if (rows.some((row) => row.username.toLowerCase() === username.toLowerCase())) {
          throw new Error(
            "UNIQUE constraint failed: users.username: SQLITE_CONSTRAINT",
          );
        }
        if (rows.some((row) => row.email.toLowerCase() === email.toLowerCase())) {
          throw new Error(
            "UNIQUE constraint failed: users.email: SQLITE_CONSTRAINT",
          );
        }

        rows.push({
          id: `user-${rows.length + 1}`,
          first_name: bindings[0] as string,
          last_name: bindings[1] as string,
          username,
          email,
          password_hash: bindings[4] as string,
          created_at: "2026-08-27 10:00:00",
        });
        return { success: true };
      }),
      all: vi.fn(async () => {
        const value = bindings[0];
        const column = sql.match(/WHERE (id|email|username) = \?1/)?.[1];
        const results = rows.filter((row) => {
          if (!column) return false;
          const rowValue = row[column as keyof UserRow];
          return (
            typeof rowValue === "string" &&
            typeof value === "string" &&
            rowValue.toLowerCase() === value.toLowerCase()
          );
        });
        return { results };
      }),
    };
    return statement;
  });

  return { db: { prepare }, prepare, rows };
}

describe("user service", () => {
  let fake: ReturnType<typeof createFakeDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    fake = createFakeDb();
    getCloudflareContextMock.mockResolvedValue({
      env: { DB: fake.db },
    });
  });

  it("creates a user and never exposes the password hash publicly", async () => {
    const result = await createUser({
      firstName: "Jane",
      lastName: "Doe",
      username: "janedoe",
      email: "jane@example.com",
      passwordHash: "pbkdf2$hash",
    });

    expect(result).toEqual({
      ok: true,
      user: {
        id: "user-1",
        firstName: "Jane",
        lastName: "Doe",
        username: "janedoe",
        email: "jane@example.com",
        createdAt: "2026-08-27 10:00:00",
      },
    });
    expect(JSON.stringify(result)).not.toContain("passwordHash");
    expect(getCloudflareContextMock).toHaveBeenCalledWith({ async: true });
  });

  it("retrieves internal records by id, email, and username", async () => {
    await createUser({
      firstName: "Jane",
      lastName: "Doe",
      username: "janedoe",
      email: "jane@example.com",
      passwordHash: "pbkdf2$hash",
    });

    await expect(getUserById("user-1")).resolves.toMatchObject({
      id: "user-1",
      passwordHash: "pbkdf2$hash",
    });
    await expect(getUserByEmail("JANE@EXAMPLE.COM")).resolves.toMatchObject({
      id: "user-1",
    });
    await expect(getUserByUsername("JANEDOE")).resolves.toMatchObject({
      id: "user-1",
    });
  });

  it("returns typed duplicate results for unique constraint violations", async () => {
    const input = {
      firstName: "Jane",
      lastName: "Doe",
      username: "janedoe",
      email: "jane@example.com",
      passwordHash: "pbkdf2$hash",
    };
    await createUser(input);

    await expect(
      createUser({ ...input, email: "other@example.com" }),
    ).resolves.toEqual({ ok: false, duplicate: "username" });
    await expect(
      createUser({ ...input, username: "other-user" }),
    ).resolves.toEqual({ ok: false, duplicate: "email" });
  });

  it("uses numbered placeholders in every query", async () => {
    await createUser({
      firstName: "Jane",
      lastName: "Doe",
      username: "janedoe",
      email: "jane@example.com",
      passwordHash: "pbkdf2$hash",
    });
    await getUserById("user-1");

    for (const [sql] of fake.prepare.mock.calls) {
      expect(sql).toContain("?1");
      expect(sql).not.toMatch(/(?<!\?)\?(?!\d)/);
    }
  });

  it("only recognizes constraint errors for known unique columns", () => {
    expect(
      parseUniqueViolation(
        new Error("UNIQUE constraint failed: users.username"),
      ),
    ).toBe("username");
    expect(
      parseUniqueViolation(new Error("UNIQUE constraint failed: users.email")),
    ).toBe("email");
    expect(parseUniqueViolation(new Error("database unavailable"))).toBeNull();
  });
});
