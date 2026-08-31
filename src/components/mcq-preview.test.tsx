import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { McqPreview } from "@/components/mcq-preview";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const mcqId = "11111111111111111111111111111111";
const choiceOneId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const choiceTwoId = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const existingMcq = {
  id: mcqId,
  name: "Fractions basics",
  question: "Which fraction is equal to one half?",
  createdByUserId: "creator-a",
  createdAt: "2026-08-31 09:00:00",
  updatedAt: "2026-08-31 10:00:00",
  choices: [
    {
      id: choiceOneId,
      choiceText: "2/4",
      isCorrect: true,
      createdAt: "2026-08-31 09:00:00",
      updatedAt: "2026-08-31 09:00:00",
    },
    {
      id: choiceTwoId,
      choiceText: "1/3",
      isCorrect: false,
      createdAt: "2026-08-31 09:00:00",
      updatedAt: "2026-08-31 09:00:00",
    },
  ],
};

function detailResponse(mcq = existingMcq) {
  return new Response(JSON.stringify({ mcq }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function attemptResponse(isCorrect: boolean) {
  return new Response(
    JSON.stringify({
      attempt: {
        id: "cccccccccccccccccccccccccccccccc",
        mcqId,
        userId: "user-a",
        selectedChoiceId: isCorrect ? choiceOneId : choiceTwoId,
        isCorrect,
        createdAt: "2026-08-31 11:00:00",
      },
    }),
    {
      status: 201,
      headers: { "Content-Type": "application/json" },
    },
  );
}

describe("McqPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading state before the MCQ arrives", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );

    render(<McqPreview mcqId={mcqId} />);

    expect(screen.getByText(/loading preview/i)).toBeDefined();
  });

  it("displays the question and selectable choices without revealing the correct answer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(detailResponse()));

    render(<McqPreview mcqId={mcqId} />);

    expect(await screen.findByRole("heading", { name: "Fractions basics" })).toBeDefined();
    expect(screen.getByText("Which fraction is equal to one half?")).toBeDefined();
    expect(screen.getByRole("radio", { name: "2/4" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "1/3" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Submit answer" })).toBeDefined();
    expect(screen.queryByText("Correct answer")).toBeNull();
    expect(screen.queryByText("Correct")).toBeNull();
    expect(screen.queryByText("Incorrect")).toBeNull();
  });

  it("requires a selected choice before submitting", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(detailResponse()));

    render(<McqPreview mcqId={mcqId} />);
    await screen.findByRole("heading", { name: "Fractions basics" });

    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));

    expect(await screen.findByText("Select an answer before submitting.")).toBeDefined();
  });

  it("selects a choice when clicking anywhere on the option tab", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(detailResponse()));

    render(<McqPreview mcqId={mcqId} />);
    await screen.findByRole("heading", { name: "Fractions basics" });

    fireEvent.click(screen.getByText("1/3"));

    expect(screen.getByRole("radio", { name: "1/3" }).getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("records an attempt and shows Correct when the selected answer is right", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(detailResponse())
      .mockResolvedValueOnce(attemptResponse(true));
    vi.stubGlobal("fetch", fetchMock);

    render(<McqPreview mcqId={mcqId} />);
    await screen.findByRole("heading", { name: "Fractions basics" });

    fireEvent.click(screen.getByRole("radio", { name: "2/4" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));

    expect(await screen.findByRole("status")).toBeDefined();
    expect(screen.getByRole("status").textContent).toBe("Correct");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `/api/mcqs/${mcqId}/attempts`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ selectedChoiceId: choiceOneId }),
      }),
    );
    expect(
      (screen.getByRole("button", { name: "Submit answer" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("records an attempt and shows Incorrect when the selected answer is wrong", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(detailResponse())
      .mockResolvedValueOnce(attemptResponse(false));
    vi.stubGlobal("fetch", fetchMock);

    render(<McqPreview mcqId={mcqId} />);
    await screen.findByRole("heading", { name: "Fractions basics" });

    fireEvent.click(screen.getByRole("radio", { name: "1/3" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));

    expect(await screen.findByRole("status")).toBeDefined();
    expect(screen.getByRole("status").textContent).toBe("Incorrect");
  });

  it("navigates back to the MCQ list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(detailResponse()));

    render(<McqPreview mcqId={mcqId} />);
    await screen.findByRole("heading", { name: "Fractions basics" });

    fireEvent.click(screen.getByRole("button", { name: "Back to MCQ bank" }));
    expect(push).toHaveBeenCalledWith("/mcq");
  });

  it("navigates to edit", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(detailResponse()));

    render(<McqPreview mcqId={mcqId} />);
    await screen.findByRole("heading", { name: "Fractions basics" });

    fireEvent.click(screen.getByRole("button", { name: "Edit MCQ" }));
    expect(push).toHaveBeenCalledWith(`/mcq/${mcqId}/edit`);
  });

  it("shows a not-found state when the MCQ is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ formError: "MCQ not found" }), {
          status: 404,
        }),
      ),
    );

    render(<McqPreview mcqId={mcqId} />);

    expect(await screen.findByText("MCQ not found")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Edit MCQ" })).toBeNull();
  });

  it("shows an error state when the preview request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ formError: "Authentication required" }), {
          status: 401,
        }),
      ),
    );

    render(<McqPreview mcqId={mcqId} />);

    expect(await screen.findByText("Authentication required")).toBeDefined();
  });
});
