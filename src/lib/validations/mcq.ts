import { z } from "zod";

const mcqIdSchema = z
  .string()
  .regex(
    /^[a-f0-9]{32}$/,
    "Choice id must be a 32-character lowercase hex string",
  );

const choiceTextField = z
  .string()
  .trim()
  .min(1, "Choice text is required")
  .max(500, "Choice text must be at most 500 characters");

const createChoiceSchema = z.object({
  choiceText: choiceTextField,
  isCorrect: z.boolean(),
});

const updateChoiceSchema = z.object({
  id: mcqIdSchema.optional(),
  choiceText: choiceTextField,
  isCorrect: z.boolean(),
});

const mcqChoicesField = z
  .array(createChoiceSchema)
  .min(2, "At least 2 choices are required")
  .max(6, "At most 6 choices are allowed");

const updateMcqChoicesField = z
  .array(updateChoiceSchema)
  .min(2, "At least 2 choices are required")
  .max(6, "At most 6 choices are allowed");

function exactlyOneCorrectRefinement(
  data: { choices: { isCorrect: boolean }[] },
  ctx: z.RefinementCtx,
) {
  const correctCount = data.choices.filter((choice) => choice.isCorrect).length;
  if (correctCount !== 1) {
    ctx.addIssue({
      code: "custom",
      message: "Exactly one choice must be marked as correct",
      path: ["choices"],
    });
  }
}

const mcqBodyFields = {
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must be at most 100 characters"),
  question: z
    .string()
    .trim()
    .min(1, "Question is required")
    .max(2000, "Question must be at most 2000 characters"),
};

export const createMcqSchema = z
  .object({
    ...mcqBodyFields,
    choices: mcqChoicesField,
  })
  .superRefine(exactlyOneCorrectRefinement);

export const updateMcqSchema = z
  .object({
    ...mcqBodyFields,
    choices: updateMcqChoicesField,
  })
  .superRefine(exactlyOneCorrectRefinement);

export const createMcqAttemptSchema = z.object({
  selectedChoiceId: z
    .string({ error: "Selected choice is required" })
    .min(1, "Selected choice is required")
    .regex(
      /^[a-f0-9]{32}$/,
      "Selected choice id must be a 32-character lowercase hex string",
    ),
});

export type CreateMcqInput = z.infer<typeof createMcqSchema>;
export type UpdateMcqInput = z.infer<typeof updateMcqSchema>;
export type CreateMcqAttemptInput = z.infer<typeof createMcqAttemptSchema>;

/** Map Zod issues to stable dotted field paths for MCQ API responses. */
export function mcqFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".");
    const messages = fieldErrors[key] ?? [];
    messages.push(issue.message);
    fieldErrors[key] = messages;
  }

  return fieldErrors;
}
