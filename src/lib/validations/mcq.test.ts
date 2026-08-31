import { describe, expect, it } from "vitest";

import {
  createMcqAttemptSchema,
  createMcqSchema,
  mcqFieldErrors,
  updateMcqSchema,
} from "@/lib/validations/mcq";

const validChoiceId = "a1b2c3d4e5f60718293a4b5c6d7e8f90";

function validCreatePayload() {
  return {
    name: "Fractions basics",
    question: "Which fraction is equal to one half?",
    choices: [
      { choiceText: "2/4", isCorrect: true },
      { choiceText: "1/3", isCorrect: false },
    ],
  };
}

describe("createMcqSchema", () => {
  it("trims name, question, and choice text", () => {
    const result = createMcqSchema.parse({
      name: "  Fractions basics  ",
      question: "  Which fraction is equal to one half?  ",
      choices: [
        { choiceText: "  2/4  ", isCorrect: true },
        { choiceText: "  1/3  ", isCorrect: false },
      ],
    });

    expect(result).toEqual(validCreatePayload());
  });

  it("accepts between two and six choices with exactly one correct answer", () => {
    const sixChoices = [
      { choiceText: "A", isCorrect: true },
      { choiceText: "B", isCorrect: false },
      { choiceText: "C", isCorrect: false },
      { choiceText: "D", isCorrect: false },
      { choiceText: "E", isCorrect: false },
      { choiceText: "F", isCorrect: false },
    ];

    expect(createMcqSchema.parse({ ...validCreatePayload(), choices: sixChoices }))
      .toEqual({ ...validCreatePayload(), choices: sixChoices });
  });

  it("rejects missing or blank name and question", () => {
    const missingName = createMcqSchema.safeParse({
      ...validCreatePayload(),
      name: "   ",
    });
    const missingQuestion = createMcqSchema.safeParse({
      ...validCreatePayload(),
      question: "",
    });

    expect(missingName.success).toBe(false);
    expect(missingQuestion.success).toBe(false);
    if (!missingName.success) {
      expect(missingName.error.flatten().fieldErrors.name).toEqual(["Name is required"]);
    }
    if (!missingQuestion.success) {
      expect(missingQuestion.error.flatten().fieldErrors.question).toEqual([
        "Question is required",
      ]);
    }
  });

  it("rejects name and question that exceed maximum length", () => {
    const longName = createMcqSchema.safeParse({
      ...validCreatePayload(),
      name: "n".repeat(101),
    });
    const longQuestion = createMcqSchema.safeParse({
      ...validCreatePayload(),
      question: "q".repeat(2001),
    });

    expect(longName.success).toBe(false);
    expect(longQuestion.success).toBe(false);
    if (!longName.success) {
      expect(longName.error.flatten().fieldErrors.name).toEqual([
        "Name must be at most 100 characters",
      ]);
    }
    if (!longQuestion.success) {
      expect(longQuestion.error.flatten().fieldErrors.question).toEqual([
        "Question must be at most 2000 characters",
      ]);
    }
  });

  it("rejects fewer than two choices or more than six", () => {
    const oneChoice = createMcqSchema.safeParse({
      ...validCreatePayload(),
      choices: [{ choiceText: "Only one", isCorrect: true }],
    });
    const sevenChoices = createMcqSchema.safeParse({
      ...validCreatePayload(),
      choices: Array.from({ length: 7 }, (_, index) => ({
        choiceText: `Choice ${index + 1}`,
        isCorrect: index === 0,
      })),
    });

    expect(oneChoice.success).toBe(false);
    expect(sevenChoices.success).toBe(false);
    if (!oneChoice.success) {
      expect(oneChoice.error.flatten().fieldErrors.choices).toEqual([
        "At least 2 choices are required",
      ]);
    }
    if (!sevenChoices.success) {
      expect(sevenChoices.error.flatten().fieldErrors.choices).toEqual([
        "At most 6 choices are allowed",
      ]);
    }
  });

  it("rejects blank or overlong choice text", () => {
    const blankChoice = createMcqSchema.safeParse({
      ...validCreatePayload(),
      choices: [
        { choiceText: "   ", isCorrect: true },
        { choiceText: "Valid", isCorrect: false },
      ],
    });
    const longChoice = createMcqSchema.safeParse({
      ...validCreatePayload(),
      choices: [
        { choiceText: "c".repeat(501), isCorrect: true },
        { choiceText: "Valid", isCorrect: false },
      ],
    });

    expect(blankChoice.success).toBe(false);
    expect(longChoice.success).toBe(false);
    if (!blankChoice.success) {
      expect(mcqFieldErrors(blankChoice.error)["choices.0.choiceText"]).toEqual([
        "Choice text is required",
      ]);
    }
    if (!longChoice.success) {
      expect(mcqFieldErrors(longChoice.error)["choices.0.choiceText"]).toEqual([
        "Choice text must be at most 500 characters",
      ]);
    }
  });

  it("rejects zero or multiple correct answers", () => {
    const noneCorrect = createMcqSchema.safeParse({
      ...validCreatePayload(),
      choices: [
        { choiceText: "A", isCorrect: false },
        { choiceText: "B", isCorrect: false },
      ],
    });
    const twoCorrect = createMcqSchema.safeParse({
      ...validCreatePayload(),
      choices: [
        { choiceText: "A", isCorrect: true },
        { choiceText: "B", isCorrect: true },
      ],
    });

    expect(noneCorrect.success).toBe(false);
    expect(twoCorrect.success).toBe(false);
    if (!noneCorrect.success) {
      expect(noneCorrect.error.flatten().fieldErrors.choices).toEqual([
        "Exactly one choice must be marked as correct",
      ]);
    }
    if (!twoCorrect.success) {
      expect(twoCorrect.error.flatten().fieldErrors.choices).toEqual([
        "Exactly one choice must be marked as correct",
      ]);
    }
  });
});

describe("updateMcqSchema", () => {
  it("accepts retained choice ids and new choices without ids", () => {
    const result = updateMcqSchema.parse({
      ...validCreatePayload(),
      choices: [
        { id: validChoiceId, choiceText: "2/4", isCorrect: true },
        { choiceText: "3/4", isCorrect: false },
      ],
    });

    expect(result.choices[0]?.id).toBe(validChoiceId);
    expect(result.choices[1]?.id).toBeUndefined();
  });

  it("rejects choice ids that are not 32-character lowercase hex strings", () => {
    const result = updateMcqSchema.safeParse({
      ...validCreatePayload(),
      choices: [
        { id: "not-a-valid-id", choiceText: "2/4", isCorrect: true },
        { choiceText: "3/4", isCorrect: false },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(mcqFieldErrors(result.error)["choices.0.id"]).toEqual([
        "Choice id must be a 32-character lowercase hex string",
      ]);
    }
  });
});

describe("createMcqAttemptSchema", () => {
  it("requires a valid selectedChoiceId format", () => {
    expect(
      createMcqAttemptSchema.parse({ selectedChoiceId: validChoiceId }),
    ).toEqual({ selectedChoiceId: validChoiceId });
  });

  it("rejects missing or malformed selectedChoiceId values", () => {
    const missing = createMcqAttemptSchema.safeParse({});
    const malformed = createMcqAttemptSchema.safeParse({
      selectedChoiceId: "bad-id",
    });

    expect(missing.success).toBe(false);
    expect(malformed.success).toBe(false);
    if (!missing.success) {
      expect(missing.error.flatten().fieldErrors.selectedChoiceId).toEqual([
        "Selected choice is required",
      ]);
    }
    if (!malformed.success) {
      expect(malformed.error.flatten().fieldErrors.selectedChoiceId).toEqual([
        "Selected choice id must be a 32-character lowercase hex string",
      ]);
    }
  });
});
