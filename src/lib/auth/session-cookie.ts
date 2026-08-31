/**
 * HTTP cookie helpers for session persistence.
 *
 * Server-only. Never import this from a file marked `'use client'`.
 */

export const SESSION_COOKIE_NAME = "session";

export function buildSessionCookieHeader(
  token: string,
  maxAgeSeconds: number,
  secure = process.env.NODE_ENV === "production",
): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function buildClearSessionCookieHeader(
  secure = process.env.NODE_ENV === "production",
): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Max-Age=0",
  ];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function parseSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === SESSION_COOKIE_NAME) {
      const value = valueParts.join("=");
      return value.length > 0 ? value : null;
    }
  }

  return null;
}

export function applySessionCookie(
  headers: Headers,
  token: string,
  maxAgeSeconds: number,
): void {
  headers.append("Set-Cookie", buildSessionCookieHeader(token, maxAgeSeconds));
}

export function clearSessionCookie(headers: Headers): void {
  headers.append("Set-Cookie", buildClearSessionCookieHeader());
}
