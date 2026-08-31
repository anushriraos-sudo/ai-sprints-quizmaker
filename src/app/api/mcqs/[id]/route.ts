import { NextResponse } from "next/server";

import {
  genericMcqErrorResponse,
  getAuthenticatedUserFromRequest,
  invalidBodyResponse,
  MCQ_INVALID_CHOICE,
  notFoundMcqResponse,
  unauthorizedMcqResponse,
} from "@/lib/api/mcq-auth";
import {
  deleteMcq,
  getMcqById,
  updateMcq,
} from "@/lib/services/mcq-service";
import {
  mcqFieldErrors,
  updateMcqSchema,
} from "@/lib/validations/mcq";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) {
    return unauthorizedMcqResponse();
  }

  const { id } = await context.params;

  try {
    const mcq = await getMcqById(id);
    if (!mcq) {
      return notFoundMcqResponse();
    }

    return NextResponse.json({ mcq });
  } catch (error) {
    console.error("getMcqById failed", error);
    return genericMcqErrorResponse();
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) {
    return unauthorizedMcqResponse();
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (body === null) {
    return invalidBodyResponse();
  }

  const parsed = updateMcqSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { fieldErrors: mcqFieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  try {
    const result = await updateMcq(id, parsed.data);
    if (!result.ok) {
      if (result.reason === "not_found") {
        return notFoundMcqResponse();
      }

      return NextResponse.json({ formError: MCQ_INVALID_CHOICE }, { status: 400 });
    }

    return NextResponse.json({ mcq: result.mcq });
  } catch (error) {
    console.error("updateMcq failed", error);
    return genericMcqErrorResponse();
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) {
    return unauthorizedMcqResponse();
  }

  const { id } = await context.params;

  try {
    const result = await deleteMcq(id);
    if (!result.ok) {
      return notFoundMcqResponse();
    }

    return NextResponse.json({ deleted: true as const });
  } catch (error) {
    console.error("deleteMcq failed", error);
    return genericMcqErrorResponse();
  }
}
