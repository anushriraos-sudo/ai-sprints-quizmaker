import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUserFromRequest: vi.fn(),
  listMcqs: vi.fn(),
  getMcqById: vi.fn(),
  createMcq: vi.fn(),
  updateMcq: vi.fn(),
  deleteMcq: vi.fn(),
  createMcqAttempt: vi.fn(),
}));

vi.mock("@/lib/api/mcq-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/mcq-auth")>();
  return {
    ...actual,
    getAuthenticatedUserFromRequest: mocks.getAuthenticatedUserFromRequest,
  };
});

vi.mock("@/lib/services/mcq-service", () => ({
  listMcqs: mocks.listMcqs,
  getMcqById: mocks.getMcqById,
  createMcq: mocks.createMcq,
  updateMcq: mocks.updateMcq,
  deleteMcq: mocks.deleteMcq,
  createMcqAttempt: mocks.createMcqAttempt,
}));

import { GET as listGet, POST as listPost } from "@/app/api/mcqs/route";
import {
  DELETE as deleteMcqRoute,
  GET as detailGet,
  PUT as updateMcqRoute,
} from "@/app/api/mcqs/[id]/route";
import { POST as attemptPost } from "@/app/api/mcqs/[id]/attempts/route";

const authenticatedUser = {
  id: "user-1",
  firstName: "Jane",
  lastName: "Doe",
  username: "janedoe",
  email: "jane@example.com",
  createdAt: "2026-08-27 10:00:00",
};

const otherUser = {
  ...authenticatedUser,
  id: "user-2",
  username: "otheruser",
  email: "other@example.com",
};

const mcqId = "11111111111111111111111111111111";
const choiceId = "33333333333333333333333333333333";

const sampleMcq = {
  id: mcqId,
  name: "Fractions basics",
  question: "Which fraction is equal to one half?",
  createdByUserId: "creator-1",
  createdAt: "2026-08-31 10:00:00",
  updatedAt: "2026-08-31 10:00:00",
  choices: [
    {
      id: choiceId,
      choiceText: "2/4",
      isCorrect: true,
      createdAt: "2026-08-31 10:00:00",
      updatedAt: "2026-08-31 10:00:00",
    },
    {
      id: "44444444444444444444444444444444",
      choiceText: "1/3",
      isCorrect: false,
      createdAt: "2026-08-31 10:00:00",
      updatedAt: "2026-08-31 10:00:00",
    },
  ],
};

const sampleSummary = {
  id: mcqId,
  name: sampleMcq.name,
  question: sampleMcq.question,
  createdByUserId: sampleMcq.createdByUserId,
  createdAt: sampleMcq.createdAt,
  updatedAt: sampleMcq.updatedAt,
};

const sampleAttempt = {
  id: "77777777777777777777777777777777",
  mcqId,
  userId: otherUser.id,
  selectedChoiceId: choiceId,
  isCorrect: true,
  createdAt: "2026-08-31 10:00:00",
};

function authedRequest(path: string, init: RequestInit = {}) {
  return new Request(`http://localhost${path}`, {
    ...init,
    headers: {
      cookie: "session=session-token",
      ...(init.headers ?? {}),
    },
  });
}

function jsonRequest(
  path: string,
  body: unknown,
  init: RequestInit & { authed?: boolean } = {},
) {
  const { authed = true, ...requestInit } = init;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(requestInit.headers as Record<string, string> | undefined),
  };
  if (authed) {
    headers.cookie = "session=session-token";
  }

  return new Request(`http://localhost${path}`, {
    method: "POST",
    ...requestInit,
    headers,
    body: JSON.stringify(body),
  });
}

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("mcq route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUserFromRequest.mockResolvedValue(authenticatedUser);
    mocks.listMcqs.mockResolvedValue([sampleSummary]);
    mocks.getMcqById.mockResolvedValue(sampleMcq);
    mocks.createMcq.mockResolvedValue(sampleMcq);
    mocks.updateMcq.mockResolvedValue({ ok: true, mcq: sampleMcq });
    mocks.deleteMcq.mockResolvedValue({ ok: true });
    mocks.createMcqAttempt.mockResolvedValue({ ok: true, attempt: sampleAttempt });
  });

  it("returns 401 for unauthenticated collection requests", async () => {
    mocks.getAuthenticatedUserFromRequest.mockResolvedValue(null);

    const listResponse = await listGet(new Request("http://localhost/api/mcqs"));
    const createResponse = await listPost(
      jsonRequest(
        "/api/mcqs",
        {
          name: "Fractions",
          question: "Half?",
          choices: [
            { choiceText: "2/4", isCorrect: true },
            { choiceText: "1/3", isCorrect: false },
          ],
        },
        { authed: false },
      ),
    );

    expect(listResponse.status).toBe(401);
    expect(createResponse.status).toBe(401);
    await expect(listResponse.json()).resolves.toEqual({
      formError: "Authentication required",
    });
    expect(mocks.listMcqs).not.toHaveBeenCalled();
    expect(mocks.createMcq).not.toHaveBeenCalled();
  });

  it("lists MCQs for authenticated users", async () => {
    const response = await listGet(authedRequest("/api/mcqs"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ mcqs: [sampleSummary] });
    expect(mocks.listMcqs).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for malformed create JSON and validation failures", async () => {
    const malformed = await listPost(
      new Request("http://localhost/api/mcqs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: "session=session-token",
        },
        body: "{broken",
      }),
    );
    const invalid = await listPost(
      jsonRequest("/api/mcqs", {
        name: "",
        question: "",
        choices: [{ choiceText: "Only one", isCorrect: true }],
      }),
    );

    expect(malformed.status).toBe(400);
    expect(invalid.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({
      formError: "Invalid request body",
    });
    expect(await invalid.json()).toMatchObject({
      fieldErrors: expect.objectContaining({
        name: expect.any(Array),
        question: expect.any(Array),
        choices: expect.any(Array),
      }),
    });
    expect(mocks.createMcq).not.toHaveBeenCalled();
  });

  it("creates an MCQ using the authenticated user as creator", async () => {
    const response = await listPost(
      jsonRequest("/api/mcqs", {
        name: " Fractions basics ",
        question: " Which fraction is equal to one half? ",
        choices: [
          { choiceText: " 2/4 ", isCorrect: true },
          { choiceText: " 1/3 ", isCorrect: false },
        ],
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.createMcq).toHaveBeenCalledWith(authenticatedUser.id, {
      name: "Fractions basics",
      question: "Which fraction is equal to one half?",
      choices: [
        { choiceText: "2/4", isCorrect: true },
        { choiceText: "1/3", isCorrect: false },
      ],
    });
    await expect(response.json()).resolves.toEqual({ mcq: sampleMcq });
  });

  it("returns 401, 404, and 200 for authenticated detail requests", async () => {
    mocks.getAuthenticatedUserFromRequest.mockResolvedValueOnce(null);
    const unauthorized = await detailGet(
      new Request(`http://localhost/api/mcqs/${mcqId}`),
      routeContext(mcqId),
    );

    mocks.getMcqById.mockResolvedValueOnce(null);
    const missing = await detailGet(
      authedRequest(`/api/mcqs/${mcqId}`),
      routeContext(mcqId),
    );

    const success = await detailGet(
      authedRequest(`/api/mcqs/${mcqId}`),
      routeContext(mcqId),
    );

    expect(unauthorized.status).toBe(401);
    expect(missing.status).toBe(404);
    expect(success.status).toBe(200);
    await expect(missing.json()).resolves.toEqual({
      formError: "MCQ not found",
    });
    await expect(success.json()).resolves.toEqual({ mcq: sampleMcq });
  });

  it("updates an MCQ for any authenticated user and maps service failures", async () => {
    mocks.getAuthenticatedUserFromRequest.mockResolvedValue(otherUser);

    const success = await updateMcqRoute(
      jsonRequest(
        `/api/mcqs/${mcqId}`,
        {
          name: "Updated",
          question: "Updated question",
          choices: [
            { id: choiceId, choiceText: "2/4", isCorrect: true },
            { choiceText: "3/4", isCorrect: false },
          ],
        },
        { method: "PUT" },
      ),
      routeContext(mcqId),
    );

    mocks.updateMcq.mockResolvedValueOnce({ ok: false, reason: "not_found" });
    const missing = await updateMcqRoute(
      jsonRequest(
        `/api/mcqs/${mcqId}`,
        {
          name: "Updated",
          question: "Updated question",
          choices: [
            { id: choiceId, choiceText: "2/4", isCorrect: true },
            { choiceText: "3/4", isCorrect: false },
          ],
        },
        { method: "PUT" },
      ),
      routeContext(mcqId),
    );

    mocks.updateMcq.mockResolvedValueOnce({ ok: false, reason: "invalid_choice" });
    const invalidChoice = await updateMcqRoute(
      jsonRequest(
        `/api/mcqs/${mcqId}`,
        {
          name: "Updated",
          question: "Updated question",
          choices: [
            { id: choiceId, choiceText: "2/4", isCorrect: true },
            { choiceText: "3/4", isCorrect: false },
          ],
        },
        { method: "PUT" },
      ),
      routeContext(mcqId),
    );

    expect(success.status).toBe(200);
    expect(mocks.updateMcq).toHaveBeenCalledWith(mcqId, {
      name: "Updated",
      question: "Updated question",
      choices: [
        { id: choiceId, choiceText: "2/4", isCorrect: true },
        { choiceText: "3/4", isCorrect: false },
      ],
    });
    expect(missing.status).toBe(404);
    expect(invalidChoice.status).toBe(400);
    await expect(invalidChoice.json()).resolves.toEqual({
      formError: "One or more choices are invalid",
    });
  });

  it("deletes an MCQ and returns not found when missing", async () => {
    const success = await deleteMcqRoute(
      authedRequest(`/api/mcqs/${mcqId}`, { method: "DELETE" }),
      routeContext(mcqId),
    );

    mocks.deleteMcq.mockResolvedValueOnce({ ok: false, reason: "not_found" });
    const missing = await deleteMcqRoute(
      authedRequest(`/api/mcqs/${mcqId}`, { method: "DELETE" }),
      routeContext(mcqId),
    );

    expect(success.status).toBe(200);
    await expect(success.json()).resolves.toEqual({ deleted: true });
    expect(missing.status).toBe(404);
  });

  it("creates attempts for authenticated users and maps service failures", async () => {
    mocks.getAuthenticatedUserFromRequest.mockResolvedValue(otherUser);

    const success = await attemptPost(
      jsonRequest(`/api/mcqs/${mcqId}/attempts`, {
        selectedChoiceId: choiceId,
      }),
      routeContext(mcqId),
    );

    mocks.createMcqAttempt.mockResolvedValueOnce({ ok: false, reason: "not_found" });
    const missing = await attemptPost(
      jsonRequest(`/api/mcqs/${mcqId}/attempts`, {
        selectedChoiceId: choiceId,
      }),
      routeContext(mcqId),
    );

    mocks.createMcqAttempt.mockResolvedValueOnce({
      ok: false,
      reason: "invalid_choice",
    });
    const invalidChoice = await attemptPost(
      jsonRequest(`/api/mcqs/${mcqId}/attempts`, {
        selectedChoiceId: choiceId,
      }),
      routeContext(mcqId),
    );

    expect(success.status).toBe(201);
    expect(mocks.createMcqAttempt).toHaveBeenCalledWith(
      mcqId,
      otherUser.id,
      choiceId,
    );
    await expect(success.json()).resolves.toEqual({ attempt: sampleAttempt });
    expect(missing.status).toBe(404);
    expect(invalidChoice.status).toBe(400);
    await expect(invalidChoice.json()).resolves.toEqual({
      formError: "Selected choice is invalid for this MCQ",
    });
  });

  it("returns 400 for malformed attempt JSON", async () => {
    const response = await attemptPost(
      new Request(`http://localhost/api/mcqs/${mcqId}/attempts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: "session=session-token",
        },
        body: "{broken",
      }),
      routeContext(mcqId),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      formError: "Invalid request body",
    });
    expect(mocks.createMcqAttempt).not.toHaveBeenCalled();
  });
});
