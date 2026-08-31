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
  firstName: nameField("First name"),
  lastName: nameField("Last name"),
  username: usernameField,
  email: emailField,
  password: z
    .string()
    .min(1, "Password is required")
    .min(8, "Password must be at least 8 characters")
    .max(200, "Password must be at most 200 characters"),
});

export const loginSchema = z.object({
  email: z
    .string({ error: "Email is required" })
    .trim()
    .transform((value) => value.toLowerCase())
    .pipe(z.string().min(1, "Email is required")),
  password: z
    .string({ error: "Password is required" })
    .min(1, "Password is required"),
  rememberMe: z
    .preprocess(
      (value) => value === true || value === "true" || value === "on",
      z.boolean(),
    )
    .optional()
    .default(false),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
