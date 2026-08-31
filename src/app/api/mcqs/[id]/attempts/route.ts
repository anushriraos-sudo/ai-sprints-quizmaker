import { NextResponse } from "next/server";

import {
  genericMcqErrorResponse,
  getAuthenticatedUserFromRequest,
  invalidBodyResponse,
  MCQ_INVALID_ATTEMPT_CHOICE,
  notFoundMcqResponse,
  unauthorizedMcqResponse,
} from "@/lib/api/mcq-auth";
import { createMcqAttempt } from "@/lib/services/mcq-service";
import {
  createMcqAttemptSchema,
  mcqFieldErrors,
} from "@/lib/validations/mcq";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) {
    return unauthorizedMcqResponse();
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (body === null) {
    return invalidBodyResponse();
  }

  const parsed = createMcqAttemptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { fieldErrors: mcqFieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  try {
    const result = await createMcqAttempt(
      id,
      user.id,
      parsed.data.selectedChoiceId,
    );

    if (!result.ok) {
      if (result.reason === "not_found") {
        return notFoundMcqResponse();
      }

      return NextResponse.json(
        { formError: MCQ_INVALID_ATTEMPT_CHOICE },
        { status: 400 },
      );
    }

    return NextResponse.json({ attempt: result.attempt }, { status: 201 });
  } catch (error) {
    console.error("createMcqAttempt failed", error);
    return genericMcqErrorResponse();
  }
}
