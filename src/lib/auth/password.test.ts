import { describe, expect, it } from "vitest";

import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  verifyPassword,
} from "@/lib/auth/password";

describe("password hashing", () => {
  it("verifies the correct password and rejects a wrong password", async () => {
    const stored = await hashPassword("correct horse battery staple");

    await expect(
      verifyPassword("correct horse battery staple", stored),
    ).resolves.toBe(true);
    await expect(verifyPassword("wrong password", stored)).resolves.toBe(false);
  });

  it("uses a fresh salt for every hash", async () => {
    const first = await hashPassword("same password");
    const second = await hashPassword("same password");

    expect(first).not.toBe(second);
    await expect(verifyPassword("same password", first)).resolves.toBe(true);
    await expect(verifyPassword("same password", second)).resolves.toBe(true);
  });

  it.each([
    "",
    "plain-text",
    "pbkdf2$20000$missing-hash",
    "unknown$20000$c2FsdA==$aGFzaA==",
    "pbkdf2$0$c2FsdA==$aGFzaA==",
    "pbkdf2$1000001$c2FsdA==$aGFzaA==",
    "pbkdf2$not-a-number$c2FsdA==$aGFzaA==",
  ])("fails closed for malformed hash %j", async (stored) => {
    await expect(verifyPassword("password", stored)).resolves.toBe(false);
  });

  it("never accepts a password against the dummy hash", async () => {
    await expect(
      verifyPassword("any submitted password", DUMMY_PASSWORD_HASH),
    ).resolves.toBe(false);
  });
});
