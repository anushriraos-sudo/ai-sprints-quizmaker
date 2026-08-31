import { NextResponse } from "next/server";

import {
  genericMcqErrorResponse,
  getAuthenticatedUserFromRequest,
  invalidBodyResponse,
  unauthorizedMcqResponse,
} from "@/lib/api/mcq-auth";
import { createMcq, listMcqs } from "@/lib/services/mcq-service";
import {
  createMcqSchema,
  mcqFieldErrors,
} from "@/lib/validations/mcq";

export async function GET(request: Request) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) {
    return unauthorizedMcqResponse();
  }

  try {
    const mcqs = await listMcqs();
    return NextResponse.json({ mcqs });
  } catch (error) {
    console.error("listMcqs failed", error);
    return genericMcqErrorResponse();
  }
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) {
    return unauthorizedMcqResponse();
  }

  const body = await request.json().catch(() => null);
  if (body === null) {
    return invalidBodyResponse();
  }

  const parsed = createMcqSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { fieldErrors: mcqFieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  try {
    const mcq = await createMcq(user.id, parsed.data);
    return NextResponse.json({ mcq }, { status: 201 });
  } catch (error) {
    console.error("createMcq failed", error);
    return genericMcqErrorResponse();
  }
}
