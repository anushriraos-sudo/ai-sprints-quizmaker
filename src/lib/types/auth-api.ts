import type { PublicUser } from "@/lib/types/user";
import type { SessionRecord } from "@/lib/services/session-service";

export type AuthErrorResponse = {
  formError?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
};

export type AuthSuccessResponse = {
  user: PublicUser;
};

export type AuthSessionPayload = Pick<
  SessionRecord,
  "token" | "expiresAt" | "rememberMe" | "maxAgeSeconds"
>;

export type AuthHandlerSuccess = AuthSuccessResponse & {
  session: AuthSessionPayload;
};

export type LogoutResponse = {
  redirectTo: "/login";
};
