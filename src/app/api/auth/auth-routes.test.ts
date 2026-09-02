import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registerUser: vi.fn(),
  loginUser: vi.fn(),
  logoutUser: vi.fn(),
}));

vi.mock("@/lib/api/auth-handlers", () => mocks);

import { POST as loginPost } from "@/app/api/auth/login/route";
import { POST as logoutPost } from "@/app/api/auth/logout/route";
import { POST as registerPost } from "@/app/api/auth/register/route";

const publicUser = {
  id: "user-1",
  firstName: "Jane",
  lastName: "Doe",
  username: "janedoe",
  email: "jane@example.com",
  createdAt: "2026-08-27 10:00:00",
};

function jsonRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("auth route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.registerUser.mockResolvedValue({
      user: publicUser,
      session: {
        token: "session-token",
        expiresAt: "2099-01-01T00:00:00.000Z",
        rememberMe: false,
        maxAgeSeconds: 86400,
      },
    });
    mocks.loginUser.mockResolvedValue({
      user: publicUser,
      session: {
        token: "session-token",
        expiresAt: "2099-01-01T00:00:00.000Z",
        rememberMe: false,
        maxAgeSeconds: 86400,
      },
    });
    mocks.logoutUser.mockResolvedValue({ redirectTo: "/login" });
  });

  it("returns 400 for malformed registration JSON", async () => {
    const request = new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{broken",
    });

    const response = await registerPost(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      formError: "Invalid request body",
    });
    expect(mocks.registerUser).not.toHaveBeenCalled();
  });

  it("validates and normalizes registration before invoking business logic", async () => {
    const response = await registerPost(
      jsonRequest("/api/auth/register", {
        firstName: " Jane ",
        lastName: " Doe ",
        username: " JANE_DOE ",
        email: " JANE@EXAMPLE.COM ",
        password: "password123",
        confirmPassword: "password123",
      }),
    );

    expect(mocks.registerUser).toHaveBeenCalledWith({
      firstName: "Jane",
      lastName: "Doe",
      username: "jane_doe",
      email: "jane@example.com",
      password: "password123",
    });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ user: publicUser });
    expect(response.headers.get("set-cookie")).toContain("session=session-token");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("returns registration field errors without calling business logic", async () => {
    const response = await registerPost(
      jsonRequest("/api/auth/register", {
        firstName: "",
        lastName: "",
        username: "!",
        email: "invalid",
        password: "short",
        confirmPassword: "short",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      fieldErrors: {
        firstName: expect.any(Array),
        lastName: expect.any(Array),
        username: expect.any(Array),
        email: ["Enter a valid email address"],
        password: expect.any(Array),
      },
    });
    expect(mocks.registerUser).not.toHaveBeenCalled();
  });

  it("returns a confirm-password error when passwords do not match", async () => {
    const response = await registerPost(
      jsonRequest("/api/auth/register", {
        firstName: "Jane",
        lastName: "Doe",
        username: "janedoe",
        email: "jane@example.com",
        password: "password123",
        confirmPassword: "different123",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      fieldErrors: {
        confirmPassword: ["Passwords do not match"],
      },
    });
    expect(mocks.registerUser).not.toHaveBeenCalled();
  });

  it("passes through login failures and successful users", async () => {
    mocks.loginUser.mockResolvedValueOnce({
      status: 401,
      error: { formError: "Invalid email or password" },
    });
    const failure = await loginPost(
      jsonRequest("/api/auth/login", {
        email: "jane@example.com",
        password: "wrong",
      }),
    );

    expect(failure.status).toBe(401);
    await expect(failure.json()).resolves.toEqual({
      formError: "Invalid email or password",
    });

    const success = await loginPost(
      jsonRequest("/api/auth/login", {
        email: " JANE@EXAMPLE.COM ",
        password: "correct",
      }),
    );
    expect(mocks.loginUser).toHaveBeenLastCalledWith({
      email: "jane@example.com",
      password: "correct",
      rememberMe: false,
    });
    expect(success.status).toBe(200);
    await expect(success.json()).resolves.toEqual({ user: publicUser });
    expect(success.headers.get("set-cookie")).toContain("session=session-token");
  });

  it("clears the session cookie on logout", async () => {
    const request = new Request("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { cookie: "session=session-token" },
    });
    const response = await logoutPost(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ redirectTo: "/login" });
    expect(mocks.logoutUser).toHaveBeenCalledWith("session-token");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
