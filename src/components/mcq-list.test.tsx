import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { McqList } from "@/components/mcq-list";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const mcqOne = {
  id: "11111111111111111111111111111111",
  name: "Fractions basics",
  question: "Which fraction is equal to one half?",
  createdByUserId: "creator-a",
  createdAt: "2026-08-31 09:00:00",
  updatedAt: "2026-08-31 10:00:00",
};

const mcqTwo = {
  id: "22222222222222222222222222222222",
  name: "Algebra intro",
  question: "What is the value of x when 2x = 4?",
  createdByUserId: "creator-b",
  createdAt: "2026-08-30 09:00:00",
  updatedAt: "2026-08-30 11:00:00",
};

function listResponse(mcqs: typeof mcqOne[]) {
  return new Response(JSON.stringify({ mcqs }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("McqList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading state before MCQs arrive", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );

    render(<McqList userDisplayName="Jane Doe" />);

    expect(screen.getByText(/loading questions/i)).toBeDefined();
  });

  it("renders rows from multiple creators in the shared bank", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(listResponse([mcqOne, mcqTwo])));

    render(<McqList userDisplayName="Jane Doe" />);

    expect(await screen.findByText("Fractions basics")).toBeDefined();
    expect(screen.getByText("Algebra intro")).toBeDefined();
    expect(screen.getByText("Which fraction is equal to one half?")).toBeDefined();
  });

  it("shows an empty state that links to create", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(listResponse([])));

    render(<McqList userDisplayName="Jane Doe" />);

    expect(
      await screen.findByText(/no multiple-choice questions yet/i),
    ).toBeDefined();
    fireEvent.click(screen.getByRole("link", { name: "Create your first MCQ" }));
    expect(push).toHaveBeenCalledWith("/mcq/new");
  });

  it("shows an error state when the list request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ formError: "Authentication required" }), {
          status: 401,
        }),
      ),
    );

    render(<McqList userDisplayName="Jane Doe" />);

    expect(
      await screen.findByText("Authentication required"),
    ).toBeDefined();
  });

  it("navigates to create when Create MCQ is clicked", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(listResponse([mcqOne])));

    render(<McqList userDisplayName="Jane Doe" />);
    await screen.findByText("Fractions basics");

    fireEvent.click(screen.getByRole("button", { name: "Create MCQ" }));
    expect(push).toHaveBeenCalledWith("/mcq/new");
  });

  it("opens an accessible actions menu with edit and preview navigation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(listResponse([mcqOne])));

    render(<McqList userDisplayName="Jane Doe" />);
    await screen.findByText("Fractions basics");

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Fractions basics" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(push).toHaveBeenCalledWith(`/mcq/${mcqOne.id}/edit`);

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Fractions basics" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Preview" }));
    expect(push).toHaveBeenCalledWith(`/mcq/${mcqOne.id}/preview`);
  });

  it("requires confirmation before deleting and cancels without calling delete", async () => {
    const fetchMock = vi.fn().mockResolvedValue(listResponse([mcqOne]));
    vi.stubGlobal("fetch", fetchMock);

    render(<McqList userDisplayName="Jane Doe" />);
    await screen.findByText("Fractions basics");

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Fractions basics" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/delete "Fractions basics"/i)).toBeDefined();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("deletes an MCQ after confirmation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(listResponse([mcqOne]))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ deleted: true }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<McqList userDisplayName="Jane Doe" />);
    await screen.findByText("Fractions basics");

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Fractions basics" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.queryByText("Fractions basics")).toBeNull();
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/mcqs/${mcqOne.id}`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
