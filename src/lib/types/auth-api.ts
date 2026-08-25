import type { PublicUser } from "@/lib/types/user";

export type AuthErrorResponse = {
  formError?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
};

export type AuthSuccessResponse = {
  user: PublicUser;
};

export type LogoutResponse = {
  redirectTo: "/login";
};
