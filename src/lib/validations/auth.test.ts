import { describe, expect, it } from "vitest";

import { loginSchema, registerSchema } from "@/lib/validations/auth";

describe("registerSchema", () => {
  it("trims names and normalizes username and email", () => {
    const result = registerSchema.parse({
      firstName: "  Jane ",
      lastName: " Doe  ",
      username: "  Jane_Doe ",
      email: "  JANE@EXAMPLE.COM ",
      password: "password123",
    });

    expect(result).toEqual({
      firstName: "Jane",
      lastName: "Doe",
      username: "jane_doe",
      email: "jane@example.com",
      password: "password123",
    });
  });

  it("rejects missing names, invalid usernames, emails, and weak passwords", () => {
    const result = registerSchema.safeParse({
      firstName: " ",
      lastName: " ",
      username: "not valid!",
      email: "invalid",
      password: "short",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.firstName).toBeDefined();
      expect(errors.lastName).toBeDefined();
      expect(errors.username).toBeDefined();
      expect(errors.email).toEqual(["Enter a valid email address"]);
      expect(errors.password).toBeDefined();
    }
  });
});

describe("loginSchema", () => {
  it("normalizes email without applying registration password rules", () => {
    expect(
      loginSchema.parse({
        email: "  JANE@EXAMPLE.COM ",
        password: "x",
      }),
    ).toEqual({
      email: "jane@example.com",
      password: "x",
    });
  });

  it("rejects empty credentials", () => {
    const result = loginSchema.safeParse({ email: " ", password: "" });

    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.email).toEqual(["Email is required"]);
      expect(errors.password).toEqual(["Password is required"]);
    }
  });
});
