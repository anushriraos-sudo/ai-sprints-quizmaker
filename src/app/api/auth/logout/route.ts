import { logoutUser } from "@/lib/api/auth-handlers";
import { jsonWithClearedSession } from "@/lib/api/auth-response";
import { parseSessionCookie } from "@/lib/auth/session-cookie";

export async function POST(request: Request) {
  const token = parseSessionCookie(request.headers.get("cookie"));
  const result = await logoutUser(token);
  return jsonWithClearedSession(result, 200);
}
