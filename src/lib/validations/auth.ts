import { z } from "zod";

const nameField = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(100, `${label} must be at most 100 characters`);

const usernameField = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase())
  .pipe(
    z
      .string()
      .min(3, "Username must be at least 3 characters")
      .max(30, "Username must be at most 30 characters")
      .regex(
        /^[a-z0-9_-]+$/,
        "Username may only contain letters, numbers, underscores, and hyphens",
      ),
  );

const emailField = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase())
  .pipe(
    z
      .email({ error: "Enter a valid email address" })
      .max(254, "Email must be at most 254 characters"),
  );

export const registerSchema = z.object({
  fullName: nameField("Full name").max(
    201,
    "Full name must be at most 201 characters",
  ),
  username: usernameField,
  email: emailField,
  password: z
    .string()
    .min(1, "Password is required")
    .min(8, "Password must be at least 8 characters")
    .max(200, "Password must be at most 200 characters"),
});

/** Split a full name for storage in first_name / last_name columns. */
export function parseFullName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const trimmed = fullName.trim();
  const spaceIndex = trimmed.indexOf(" ");

  if (spaceIndex === -1) {
    return { firstName: trimmed, lastName: "" };
  }

  return {
    firstName: trimmed.slice(0, spaceIndex),
    lastName: trimmed.slice(spaceIndex + 1).trim(),
  };
}

export const loginSchema = z.object({
  email: z
    .string({ error: "Email is required" })
    .trim()
    .transform((value) => value.toLowerCase())
    .pipe(z.string().min(1, "Email is required")),
  password: z
    .string({ error: "Password is required" })
    .min(1, "Password is required"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
