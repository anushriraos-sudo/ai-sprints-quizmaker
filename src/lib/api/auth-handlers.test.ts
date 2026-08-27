import { beforeEach, describe, expect, it, vi } from "vitest";

import { DUMMY_PASSWORD_HASH } from "@/lib/auth/password";
import type { PublicUser, UserRecord } from "@/lib/types/user";

const mocks = vi.hoisted(() => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  createUser: vi.fn(),
  getUserByEmail: vi.fn(),
  getUserByUsername: vi.fn(),
  toPublicUser: vi.fn(),
}));

vi.mock("@/lib/auth/password", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/auth/password")>();
  return {
    ...actual,
    hashPassword: mocks.hashPassword,
    verifyPassword: mocks.verifyPassword,
  };
});

vi.mock("@/lib/services/user-service", () => ({
  createUser: mocks.createUser,
  getUserByEmail: mocks.getUserByEmail,
  getUserByUsername: mocks.getUserByUsername,
  toPublicUser: mocks.toPublicUser,
}));

import {
  loginUser,
  logoutUser,
  registerUser,
} from "@/lib/api/auth-handlers";

const publicUser: PublicUser = {
  id: "user-1",
  firstName: "Jane",
  lastName: "Doe",
  username: "janedoe",
  email: "jane@example.com",
  createdAt: "2026-08-27 10:00:00",
};

const userRecord: UserRecord = {
  ...publicUser,
  passwordHash: "pbkdf2$20000$salt$hash",
};

describe("auth handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserByUsername.mockResolvedValue(null);
    mocks.getUserByEmail.mockResolvedValue(null);
    mocks.hashPassword.mockResolvedValue("pbkdf2$derived");
    mocks.createUser.mockResolvedValue({ ok: true, user: publicUser });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.toPublicUser.mockReturnValue(publicUser);
  });

  it("hashes a registration password and returns only PublicUser", async () => {
    const result = await registerUser({
      firstName: "Jane",
      lastName: "Doe",
      username: "janedoe",
      email: "jane@example.com",
      password: "secret123",
    });

    expect(mocks.hashPassword).toHaveBeenCalledWith("secret123");
    expect(mocks.createUser).toHaveBeenCalledWith({
      firstName: "Jane",
      lastName: "Doe",
      username: "janedoe",
      email: "jane@example.com",
      passwordHash: "pbkdf2$derived",
    });
    expect(result).toEqual({ user: publicUser });
    expect(JSON.stringify(result)).not.toContain("secret123");
    expect(JSON.stringify(result)).not.toContain("passwordHash");
  });

  it("reports both pre-existing registration fields without hashing", async () => {
    mocks.getUserByUsername.mockResolvedValue(userRecord);
    mocks.getUserByEmail.mockResolvedValue(userRecord);

    const result = await registerUser({
      firstName: "Jane",
      lastName: "Doe",
      username: "janedoe",
      email: "jane@example.com",
      password: "secret123",
    });

    expect(result).toEqual({
      status: 400,
      error: {
        fieldErrors: {
          username: ["That username is taken"],
          email: ["That email is already registered"],
        },
      },
    });
    expect(mocks.hashPassword).not.toHaveBeenCalled();
  });

  it("maps an insert-time duplicate caused by a concurrent registration", async () => {
    mocks.createUser.mockResolvedValue({ ok: false, duplicate: "username" });

    await expect(
      registerUser({
        firstName: "Jane",
        lastName: "Doe",
        username: "janedoe",
        email: "jane@example.com",
        password: "secret123",
      }),
    ).resolves.toEqual({
      status: 400,
      error: { fieldErrors: { username: ["That username is taken"] } },
    });
  });

  it("verifies unknown emails against the dummy hash", async () => {
    mocks.getUserByEmail.mockResolvedValue(null);
    mocks.verifyPassword.mockResolvedValue(false);

    const result = await loginUser({
      email: "missing@example.com",
      password: "submitted",
    });

    expect(mocks.verifyPassword).toHaveBeenCalledWith(
      "submitted",
      DUMMY_PASSWORD_HASH,
    );
    expect(result).toEqual({
      status: 401,
      error: { formError: "Invalid email or password" },
    });
  });

  it("returns the same error for a wrong password and a valid public user on success", async () => {
    mocks.getUserByEmail.mockResolvedValue(userRecord);
    mocks.verifyPassword.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await expect(
      loginUser({ email: userRecord.email, password: "wrong" }),
    ).resolves.toEqual({
      status: 401,
      error: { formError: "Invalid email or password" },
    });
    await expect(
      loginUser({ email: userRecord.email, password: "correct" }),
    ).resolves.toEqual({ user: publicUser });
    expect(mocks.toPublicUser).toHaveBeenCalledWith(userRecord);
  });

  it("keeps logout stateless", () => {
    expect(logoutUser()).toEqual({ redirectTo: "/login" });
  });
});
