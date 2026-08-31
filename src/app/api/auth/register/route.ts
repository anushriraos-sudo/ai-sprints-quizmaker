import { registerUser } from "@/lib/api/auth-handlers";
import { jsonWithSession } from "@/lib/api/auth-response";
import { registerSchema } from "@/lib/validations/auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json(
      { formError: "Invalid request body" },
      { status: 400 },
    );
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const result = await registerUser(parsed.data);
  if ("error" in result) {
    return NextResponse.json(result.error, { status: result.status });
  }

  return jsonWithSession(result, 201);
}
