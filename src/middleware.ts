import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getCurrentUserIdFromToken } from "@/lib/auth/get-current-user";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

const protectedPaths = ["/mcq"];
const authPaths = ["/login", "/register"];

function isProtectedPath(pathname: string): boolean {
  return protectedPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (isProtectedPath(pathname)) {
    if (!token) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const userId = await getCurrentUserIdFromToken(token);
    if (!userId) {
      const response = NextResponse.redirect(new URL("/login", request.url));
      response.cookies.delete(SESSION_COOKIE_NAME);
      return response;
    }
  }

  if (authPaths.includes(pathname) && token) {
    const userId = await getCurrentUserIdFromToken(token);
    if (userId) {
      return NextResponse.redirect(new URL("/mcq", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/mcq/:path*", "/login", "/register"],
};
