import { describe, expect, it } from "vitest";

import {
  generateSessionToken,
  hashSessionToken,
} from "@/lib/auth/session-token";

describe("session token helpers", () => {
  it("generates unique tokens and matching hashes", async () => {
    const first = await generateSessionToken();
    const second = await generateSessionToken();

    expect(first.token).not.toBe(second.token);
    expect(first.tokenHash).toBe(await hashSessionToken(first.token));
    expect(second.tokenHash).toBe(await hashSessionToken(second.token));
  });

  it("hashes the same token consistently", async () => {
    const token = "sample-token-value";

    expect(await hashSessionToken(token)).toBe(await hashSessionToken(token));
  });
});
