import { NextResponse } from "next/server";

import {
  applySessionCookie,
  clearSessionCookie,
} from "@/lib/auth/session-cookie";
import type { AuthHandlerSuccess } from "@/lib/types/auth-api";

export function jsonWithSession(result: AuthHandlerSuccess, status: number) {
  const response = NextResponse.json({ user: result.user }, { status });
  applySessionCookie(
    response.headers,
    result.session.token,
    result.session.maxAgeSeconds,
  );
  return response;
}

export function jsonWithClearedSession<T>(body: T, status = 200) {
  const response = NextResponse.json(body, { status });
  clearSessionCookie(response.headers);
  return response;
}
