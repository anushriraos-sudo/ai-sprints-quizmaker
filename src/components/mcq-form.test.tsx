import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { McqForm } from "@/components/mcq-form";

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

describe("McqForm create mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts with two labeled choice fields", () => {
    render(<McqForm mode="create" />);

    expect(screen.getByLabelText("Name")).toBeDefined();
    expect(screen.getByLabelText("Question")).toBeDefined();
    expect(screen.getByLabelText("Choice 1")).toBeDefined();
    expect(screen.getByLabelText("Choice 2")).toBeDefined();
    expect(screen.getByRole("radio", { name: "Mark choice 1 as correct" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Mark choice 2 as correct" })).toBeDefined();
  });

  it("adds choices up to six and disables Add Choice at the limit", () => {
    render(<McqForm mode="create" />);

    const addButton = screen.getByRole("button", { name: "Add choice" });

    fireEvent.click(addButton);
    fireEvent.click(addButton);
    fireEvent.click(addButton);
    fireEvent.click(addButton);

    expect(screen.getByLabelText("Choice 6")).toBeDefined();
    expect(addButton).toHaveProperty("disabled", true);
  });

  it("removes choices down to two and disables Remove Choice at the limit", () => {
    render(<McqForm mode="create" />);

    fireEvent.click(screen.getByRole("button", { name: "Add choice" }));
    expect(screen.getByLabelText("Choice 3")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Remove choice 3" }));
    expect(screen.queryByLabelText("Choice 3")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Remove choice 2" }));
    expect(screen.getByRole("button", { name: "Remove choice 1" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: "Remove choice 2" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("clears the correct answer when the selected choice is removed", () => {
    render(<McqForm mode="create" />);

    fireEvent.click(screen.getByRole("button", { name: "Add choice" }));

    const firstCorrect = screen.getByRole("radio", {
      name: "Mark choice 1 as correct",
    });
    fireEvent.click(firstCorrect);
    expect(firstCorrect.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Remove choice 1" }));

    expect(
      screen.getByRole("radio", { name: "Mark choice 1 as correct" }).getAttribute(
        "aria-checked",
      ),
    ).toBe("false");
    expect(
      screen.getByRole("radio", { name: "Mark choice 2 as correct" }).getAttribute(
        "aria-checked",
      ),
    ).toBe("false");
  });

  it("creates an MCQ with POST and navigates to the list", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ mcq: existingMcq }), { status: 201 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<McqForm mode="create" />);

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Fractions basics" },
    });
    fireEvent.change(screen.getByLabelText("Question"), {
      target: { value: "Which fraction is equal to one half?" },
    });
    fireEvent.change(screen.getByLabelText("Choice 1"), {
      target: { value: "2/4" },
    });
    fireEvent.change(screen.getByLabelText("Choice 2"), {
      target: { value: "1/3" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Mark choice 1 as correct" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/mcq"));
    expect(fetchMock).toHaveBeenCalledWith("/api/mcqs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Fractions basics",
        question: "Which fraction is equal to one half?",
        choices: [
          { choiceText: "2/4", isCorrect: true },
          { choiceText: "1/3", isCorrect: false },
        ],
      }),
    });
  });

  it("shows server validation errors on the matching fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            fieldErrors: {
              name: ["Name is required"],
              "choices.0.choiceText": ["Choice text is required"],
              choices: ["Exactly one choice must be marked as correct"],
            },
          }),
          { status: 400 },
        ),
      ),
    );

    render(<McqForm mode="create" />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Name is required")).toBeDefined();
    expect(screen.getByText("Choice text is required")).toBeDefined();
    expect(screen.getByText("Exactly one choice must be marked as correct")).toBeDefined();
    expect(push).not.toHaveBeenCalled();
  });

  it("returns to the list on Cancel without saving", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<McqForm mode="create" />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(push).toHaveBeenCalledWith("/mcq");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prevents duplicate submissions while saving", async () => {
    let resolveCreate: (value: Response) => void;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<McqForm mode="create" />);

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Fractions basics" },
    });
    fireEvent.change(screen.getByLabelText("Question"), {
      target: { value: "Which fraction is equal to one half?" },
    });
    fireEvent.change(screen.getByLabelText("Choice 1"), {
      target: { value: "2/4" },
    });
    fireEvent.change(screen.getByLabelText("Choice 2"), {
      target: { value: "1/3" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Mark choice 1 as correct" }));

    const saveButton = screen.getByRole("button", { name: "Save" });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(saveButton).toHaveProperty("disabled", true);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveCreate!(
      new Response(JSON.stringify({ mcq: existingMcq }), { status: 201 }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/mcq"));
  });
});

describe("McqForm edit mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading state while the MCQ is fetched", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );

    render(<McqForm mode="edit" mcqId={mcqId} />);

    expect(screen.getByText(/loading mcq/i)).toBeDefined();
  });

  it("loads existing values and updates with PUT while preserving choice ids", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(detailResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ mcq: existingMcq }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<McqForm mode="edit" mcqId={mcqId} />);

    expect(await screen.findByDisplayValue("Fractions basics")).toBeDefined();
    expect(screen.getByDisplayValue("Which fraction is equal to one half?")).toBeDefined();
    expect(screen.getByDisplayValue("2/4")).toBeDefined();
    expect(screen.getByDisplayValue("1/3")).toBeDefined();
    expect(
      screen.getByRole("radio", { name: "Mark choice 1 as correct" }).getAttribute(
        "aria-checked",
      ),
    ).toBe("true");

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Updated fractions" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/mcq"));
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/mcqs/${mcqId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Updated fractions",
        question: "Which fraction is equal to one half?",
        choices: [
          { id: choiceOneId, choiceText: "2/4", isCorrect: true },
          { id: choiceTwoId, choiceText: "1/3", isCorrect: false },
        ],
      }),
    });
  });

  it("shows an error when the MCQ cannot be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ formError: "MCQ not found" }), {
          status: 404,
        }),
      ),
    );

    render(<McqForm mode="edit" mcqId={mcqId} />);

    expect(await screen.findByText("MCQ not found")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("shows a form-level error when update fails unexpectedly", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(detailResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ formError: "Something went wrong" }), {
          status: 500,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<McqForm mode="edit" mcqId={mcqId} />);
    await screen.findByDisplayValue("Fractions basics");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Something went wrong")).toBeDefined();
    expect(push).not.toHaveBeenCalled();
  });

  it("allows changing choices before saving", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(detailResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ mcq: existingMcq }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<McqForm mode="edit" mcqId={mcqId} />);
    await screen.findByDisplayValue("Fractions basics");

    fireEvent.click(screen.getByRole("button", { name: "Add choice" }));
    const choiceThree = screen.getByLabelText("Choice 3");
    fireEvent.change(choiceThree, { target: { value: "3/4" } });
    fireEvent.click(screen.getByRole("radio", { name: "Mark choice 3 as correct" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/mcq"));

    const lastCall = fetchMock.mock.calls.at(-1);
    expect(lastCall?.[0]).toBe(`/api/mcqs/${mcqId}`);
    const body = JSON.parse(String(lastCall?.[1]?.body));
    expect(body.choices).toHaveLength(3);
    expect(body.choices[0]).toEqual({
      id: choiceOneId,
      choiceText: "2/4",
      isCorrect: false,
    });
    expect(body.choices[2]).toEqual({
      choiceText: "3/4",
      isCorrect: true,
    });
    expect(body.choices[2].id).toBeUndefined();
  });
});
