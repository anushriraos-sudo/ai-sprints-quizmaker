import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCloudflareContextMock: vi.fn(),
  hashSessionToken: vi.fn(),
  generateSessionToken: vi.fn(),
}));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: mocks.getCloudflareContextMock,
}));

vi.mock("@/lib/auth/session-token", () => ({
  generateSessionToken: mocks.generateSessionToken,
  hashSessionToken: mocks.hashSessionToken,
}));

type SessionRow = {
  id: string;
  token_hash: string;
  user_id: string;
  expires_at: string;
  created_at: string;
};

function createFakeDb(initialRows: SessionRow[] = []) {
  const rows = [...initialRows];

  const prepare = vi.fn((sql: string) => {
    let bindings: unknown[] = [];
    const statement = {
      bind: vi.fn((...values: unknown[]) => {
        bindings = values;
        return statement;
      }),
      run: vi.fn(async () => {
        if (sql.includes("INSERT INTO sessions")) {
          rows.push({
            id: `session-${rows.length + 1}`,
            token_hash: bindings[0] as string,
            user_id: bindings[1] as string,
            expires_at: bindings[2] as string,
            created_at: "2026-08-31 10:00:00",
          });
          return { success: true };
        }

        if (sql.includes("DELETE FROM sessions")) {
          const tokenHash = bindings[0] as string;
          const index = rows.findIndex((row) => row.token_hash === tokenHash);
          if (index >= 0) {
            rows.splice(index, 1);
          }
          return { success: true };
        }

        throw new Error(`Unexpected run query: ${sql}`);
      }),
      all: vi.fn(async () => {
        if (sql.includes("SELECT user_id FROM sessions")) {
          const tokenHash = bindings[0] as string;
          const now = bindings[1] as string;
          const results = rows.filter(
            (row) => row.token_hash === tokenHash && row.expires_at > now,
          );
          return { results };
        }

        throw new Error(`Unexpected all query: ${sql}`);
      }),
    };
    return statement;
  });

  return { db: { prepare }, rows };
}

import {
  createSession,
  deleteSession,
  getSessionUserId,
} from "@/lib/services/session-service";

describe("session service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateSessionToken.mockResolvedValue({
      token: "raw-token",
      tokenHash: "hashed-token",
    });
    mocks.hashSessionToken.mockImplementation(async (token: string) => {
      if (token === "raw-token") return "hashed-token";
      if (token === "expired-token") return "hash-expired";
      return "missing-hash";
    });
  });

  it("creates a session with a short lifetime by default", async () => {
    const fake = createFakeDb();
    mocks.getCloudflareContextMock.mockResolvedValue({ env: { DB: fake.db } });

    const session = await createSession("user-1", false);

    expect(session.token).toBe("raw-token");
    expect(session.expiresAt).toBeTruthy();
    expect(fake.rows).toHaveLength(1);
    expect(fake.rows[0]?.user_id).toBe("user-1");
    expect(fake.rows[0]?.token_hash).toBe("hashed-token");
  });

  it("creates a longer session when rememberMe is true", async () => {
    const fake = createFakeDb();
    mocks.getCloudflareContextMock.mockResolvedValue({ env: { DB: fake.db } });

    const short = await createSession("user-1", false);
    fake.rows.length = 0;
    const long = await createSession("user-2", true);

    expect(new Date(long.expiresAt).getTime()).toBeGreaterThan(
      new Date(short.expiresAt).getTime(),
    );
  });

  it("returns a user id for a valid token and null for missing or expired sessions", async () => {
    const fake = createFakeDb([
      {
        id: "session-1",
        token_hash: "hashed-token",
        user_id: "user-1",
        expires_at: "2099-01-01T00:00:00.000Z",
        created_at: "2026-08-31 10:00:00",
      },
      {
        id: "session-2",
        token_hash: "hash-expired",
        user_id: "user-2",
        expires_at: "2020-01-01T00:00:00.000Z",
        created_at: "2026-08-31 10:00:00",
      },
    ]);
    mocks.getCloudflareContextMock.mockResolvedValue({ env: { DB: fake.db } });

    await expect(getSessionUserId("raw-token")).resolves.toBe("user-1");
    await expect(getSessionUserId("expired-token")).resolves.toBeNull();
    await expect(getSessionUserId("missing-token")).resolves.toBeNull();
  });

  it("deletes a session by token", async () => {
    const fake = createFakeDb([
      {
        id: "session-1",
        token_hash: "hashed-token",
        user_id: "user-1",
        expires_at: "2099-01-01T00:00:00.000Z",
        created_at: "2026-08-31 10:00:00",
      },
    ]);
    mocks.getCloudflareContextMock.mockResolvedValue({ env: { DB: fake.db } });

    await deleteSession("raw-token");
    expect(fake.rows).toHaveLength(0);
  });
});
