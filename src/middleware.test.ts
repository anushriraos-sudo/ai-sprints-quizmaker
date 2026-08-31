import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSessionUserId: vi.fn(),
}));

vi.mock("@/lib/services/session-service", () => ({
  getSessionUserId: mocks.getSessionUserId,
}));

import { middleware } from "@/middleware";

function requestFor(path: string, cookie?: string) {
  const headers = cookie ? { cookie } : undefined;
  return new NextRequest(`http://localhost${path}`, { headers });
}

describe("auth middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUserId.mockResolvedValue(null);
  });

  it("redirects unauthenticated users away from /mcq", async () => {
    const response = await middleware(requestFor("/mcq"));

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe("http://localhost/login");
    expect(mocks.getSessionUserId).not.toHaveBeenCalled();
  });

  it("allows authenticated users to reach /mcq", async () => {
    mocks.getSessionUserId.mockResolvedValue("user-1");

    const response = await middleware(
      requestFor("/mcq", "session=valid-token"),
    );

    expect(response?.status).toBe(200);
    expect(mocks.getSessionUserId).toHaveBeenCalledWith("valid-token");
  });

  it("redirects authenticated users away from /login and /register", async () => {
    mocks.getSessionUserId.mockResolvedValue("user-1");

    const loginResponse = await middleware(
      requestFor("/login", "session=valid-token"),
    );
    const registerResponse = await middleware(
      requestFor("/register", "session=valid-token"),
    );

    expect(loginResponse?.headers.get("location")).toBe(
      "http://localhost/mcq",
    );
    expect(registerResponse?.headers.get("location")).toBe(
      "http://localhost/mcq",
    );
  });

  it("leaves public routes alone", async () => {
    const response = await middleware(requestFor("/"));

    expect(response?.status).toBe(200);
    expect(mocks.getSessionUserId).not.toHaveBeenCalled();
  });
});
