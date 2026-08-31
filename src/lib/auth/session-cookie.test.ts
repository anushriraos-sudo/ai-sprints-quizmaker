import { describe, expect, it } from "vitest";

import {
  SESSION_COOKIE_NAME,
  buildClearSessionCookieHeader,
  buildSessionCookieHeader,
  parseSessionCookie,
} from "@/lib/auth/session-cookie";

describe("session cookie helpers", () => {
  it("builds an HttpOnly session cookie with Max-Age", () => {
    const header = buildSessionCookieHeader("abc123", 3600, false);

    expect(header).toContain(`${SESSION_COOKIE_NAME}=abc123`);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Path=/");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Max-Age=3600");
    expect(header).not.toContain("Secure");
  });

  it("adds Secure in production", () => {
    const header = buildSessionCookieHeader("abc123", 3600, true);

    expect(header).toContain("Secure");
  });

  it("clears the session cookie", () => {
    expect(buildClearSessionCookieHeader(false)).toContain("Max-Age=0");
    expect(buildClearSessionCookieHeader(false)).toContain(
      `${SESSION_COOKIE_NAME}=`,
    );
  });

  it("parses the session token from a Cookie header", () => {
    expect(
      parseSessionCookie("theme=dark; session=token-value; other=x"),
    ).toBe("token-value");
    expect(parseSessionCookie(null)).toBeNull();
    expect(parseSessionCookie("other=x")).toBeNull();
  });
});
