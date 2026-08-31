import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  McqAttemptRow,
  McqChoiceRow,
  McqRow,
} from "@/lib/types/mcq";
import type { CreateMcqInput, UpdateMcqInput } from "@/lib/validations/mcq";

const { getCloudflareContextMock } = vi.hoisted(() => ({
  getCloudflareContextMock: vi.fn(),
}));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: getCloudflareContextMock,
}));

const CREATOR_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CREATOR_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const MCQ_ONE = "11111111111111111111111111111111";
const MCQ_TWO = "22222222222222222222222222222222";
const CHOICE_ONE = "33333333333333333333333333333333";
const CHOICE_TWO = "44444444444444444444444444444444";
const CHOICE_THREE = "55555555555555555555555555555555";
const CHOICE_FOREIGN = "66666666666666666666666666666666";
const ATTEMPT_ONE = "77777777777777777777777777777777";

const TIMESTAMP = "2026-08-31 10:00:00";
const UPDATED_TIMESTAMP = "2026-08-31 11:00:00";

let idCounter = 0;

function nextGeneratedId(prefix: string): string {
  idCounter += 1;
  return `${prefix}${String(idCounter).padStart(32 - prefix.length, "0")}`;
}

function validCreateInput(): CreateMcqInput {
  return {
    name: "Fractions basics",
    question: "Which fraction is equal to one half?",
    choices: [
      { choiceText: "2/4", isCorrect: true },
      { choiceText: "1/3", isCorrect: false },
    ],
  };
}

function cloneRows<T>(rows: T[]): T[] {
  return rows.map((row) => ({ ...row }));
}

function createFakeMcqDb(initial?: {
  mcqs?: McqRow[];
  choices?: McqChoiceRow[];
  attempts?: McqAttemptRow[];
}) {
  const mcqs = cloneRows(initial?.mcqs ?? []);
  const choices = cloneRows(initial?.choices ?? []);
  const attempts = cloneRows(initial?.attempts ?? []);
  let batchShouldFail = false;

  function snapshot() {
    return {
      mcqs: cloneRows(mcqs),
      choices: cloneRows(choices),
      attempts: cloneRows(attempts),
    };
  }

  function restore(state: ReturnType<typeof snapshot>) {
    mcqs.length = 0;
    choices.length = 0;
    attempts.length = 0;
    mcqs.push(...state.mcqs);
    choices.push(...state.choices);
    attempts.push(...state.attempts);
  }

  const prepare = vi.fn((sql: string) => {
    let bindings: unknown[] = [];
    const statement = {
      bind: vi.fn((...values: unknown[]) => {
        bindings = values;
        return statement;
      }),
      run: vi.fn(async () => {
        const normalizedSql = sql.replace(/\s+/g, " ");

        if (normalizedSql.includes("INSERT INTO mcqs")) {
          if (batchShouldFail && mcqs.length > 0) {
            throw new Error("Simulated batch failure");
          }
          mcqs.push({
            id: bindings[0] as string,
            name: bindings[1] as string,
            question: bindings[2] as string,
            created_by_user_id: bindings[3] as string,
            created_at: TIMESTAMP,
            updated_at: TIMESTAMP,
          });
          return { success: true };
        }

        if (normalizedSql.includes("INSERT INTO mcq_choices")) {
          if (batchShouldFail) {
            throw new Error("Simulated batch failure");
          }
          choices.push({
            id: bindings[0] as string,
            mcq_id: bindings[1] as string,
            choice_text: bindings[2] as string,
            is_correct: bindings[3] as number,
            created_at: TIMESTAMP,
            updated_at: TIMESTAMP,
          });
          return { success: true };
        }

        if (normalizedSql.includes("INSERT INTO mcq_attempts")) {
          attempts.push({
            id: bindings[0] as string,
            mcq_id: bindings[1] as string,
            user_id: bindings[2] as string,
            selected_choice_id: bindings[3] as string,
            is_correct: bindings[4] as number,
            created_at: TIMESTAMP,
          });
          return { success: true };
        }

        if (normalizedSql.includes("UPDATE mcq_choices SET is_correct = 0")) {
          const mcqId = bindings[0] as string;
          for (const choice of choices) {
            if (choice.mcq_id === mcqId) {
              choice.is_correct = 0;
            }
          }
          return { success: true };
        }

        if (normalizedSql.includes("UPDATE mcq_choices SET choice_text")) {
          const choiceId = bindings[2] as string;
          const mcqId = bindings[3] as string;
          const choice = choices.find(
            (row) => row.id === choiceId && row.mcq_id === mcqId,
          );
          if (!choice) {
            return { success: true, meta: { changes: 0 } };
          }
          choice.choice_text = bindings[0] as string;
          choice.is_correct = bindings[1] as number;
          choice.updated_at = UPDATED_TIMESTAMP;
          return { success: true };
        }

        if (normalizedSql.includes("UPDATE mcqs SET")) {
          const mcq = mcqs.find((row) => row.id === bindings[2]);
          if (mcq) {
            mcq.name = bindings[0] as string;
            mcq.question = bindings[1] as string;
            mcq.updated_at = UPDATED_TIMESTAMP;
          }
          return { success: true };
        }

        if (normalizedSql.includes("DELETE FROM mcq_choices")) {
          const choiceId = bindings[0] as string;
          const mcqId = bindings[1] as string;
          const index = choices.findIndex(
            (row) => row.id === choiceId && row.mcq_id === mcqId,
          );
          if (index >= 0) {
            choices.splice(index, 1);
          }
          return { success: true };
        }

        if (normalizedSql.includes("DELETE FROM mcqs")) {
          const mcqId = bindings[0] as string;
          const index = mcqs.findIndex((row) => row.id === mcqId);
          if (index >= 0) {
            mcqs.splice(index, 1);
            for (let i = choices.length - 1; i >= 0; i -= 1) {
              if (choices[i]?.mcq_id === mcqId) {
                choices.splice(i, 1);
              }
            }
            for (let i = attempts.length - 1; i >= 0; i -= 1) {
              if (attempts[i]?.mcq_id === mcqId) {
                attempts.splice(i, 1);
              }
            }
          }
          return { success: true, meta: { changes: index >= 0 ? 1 : 0 } };
        }

        throw new Error(`Unexpected run query: ${sql}`);
      }),
      all: vi.fn(async () => {
        const normalizedSql = sql.replace(/\s+/g, " ");

        if (normalizedSql.includes("FROM mcqs WHERE id = ?1")) {
          const mcqId = bindings[0] as string;
          return {
            results: mcqs.filter((row) => row.id === mcqId),
          };
        }

        if (
          normalizedSql.includes("FROM mcqs") &&
          normalizedSql.includes("ORDER BY updated_at DESC")
        ) {
          return {
            results: [...mcqs].sort((left, right) =>
              right.updated_at.localeCompare(left.updated_at),
            ),
          };
        }

        if (
          normalizedSql.includes("FROM mcq_choices") &&
          normalizedSql.includes("WHERE mcq_id = ?1") &&
          normalizedSql.includes("ORDER BY created_at ASC")
        ) {
          const mcqId = bindings[0] as string;
          return {
            results: choices
              .filter((row) => row.mcq_id === mcqId)
              .sort((left, right) => left.created_at.localeCompare(right.created_at)),
          };
        }

        if (
          normalizedSql.includes("FROM mcq_choices") &&
          normalizedSql.includes("WHERE id = ?1 AND mcq_id = ?2")
        ) {
          const choiceId = bindings[0] as string;
          const mcqId = bindings[1] as string;
          return {
            results: choices.filter(
              (row) => row.id === choiceId && row.mcq_id === mcqId,
            ),
          };
        }

        if (normalizedSql.includes("FROM mcq_attempts WHERE id = ?1")) {
          const attemptId = bindings[0] as string;
          return {
            results: attempts.filter((row) => row.id === attemptId),
          };
        }

        throw new Error(`Unexpected all query: ${sql}`);
      }),
    };

    return statement;
  });

  const batch = vi.fn(
    async (statements: Array<{ run: () => Promise<unknown> }>) => {
      const saved = snapshot();
      try {
        const results = [];
        for (const statement of statements) {
          results.push(await statement.run());
        }
        return results;
      } catch (error) {
        restore(saved);
        throw error;
      }
    },
  );

  return {
    db: { prepare, batch },
    mcqs,
    choices,
    attempts,
    setBatchShouldFail(value: boolean) {
      batchShouldFail = value;
    },
  };
}

import {
  createMcq,
  createMcqAttempt,
  deleteMcq,
  getMcqById,
  listMcqs,
  updateMcq,
} from "@/lib/services/mcq-service";

describe("mcq service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    idCounter = 0;
    vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
      const typed = array as Uint8Array;
      for (let index = 0; index < typed.length; index += 1) {
        typed[index] = (idCounter + index + 1) % 256;
      }
      idCounter += typed.length;
      return typed;
    });
  });

  it("creates an MCQ with choices atomically and records creator attribution", async () => {
    const fake = createFakeMcqDb();
    getCloudflareContextMock.mockResolvedValue({ env: { DB: fake.db } });

    const result = await createMcq(CREATOR_A, validCreateInput());

    expect(result.name).toBe("Fractions basics");
    expect(result.createdByUserId).toBe(CREATOR_A);
    expect(result.choices).toHaveLength(2);
    expect(result.choices.find((choice) => choice.isCorrect)?.choiceText).toBe(
      "2/4",
    );
    expect(fake.mcqs).toHaveLength(1);
    expect(fake.choices).toHaveLength(2);
    expect(fake.db.batch).toHaveBeenCalledTimes(1);
    expect(getCloudflareContextMock).toHaveBeenCalledWith({ async: true });
  });

  it("does not leave partial rows when a create batch fails", async () => {
    const fake = createFakeMcqDb();
    fake.setBatchShouldFail(true);
    getCloudflareContextMock.mockResolvedValue({ env: { DB: fake.db } });

    await expect(createMcq(CREATOR_A, validCreateInput())).rejects.toThrow(
      "Simulated batch failure",
    );
    expect(fake.mcqs).toHaveLength(0);
    expect(fake.choices).toHaveLength(0);
  });

  it("lists every MCQ in the shared bank ordered by newest update first", async () => {
    const fake = createFakeMcqDb({
      mcqs: [
        {
          id: MCQ_ONE,
          name: "Older",
          question: "Q1",
          created_by_user_id: CREATOR_A,
          created_at: TIMESTAMP,
          updated_at: TIMESTAMP,
        },
        {
          id: MCQ_TWO,
          name: "Newer",
          question: "Q2",
          created_by_user_id: CREATOR_B,
          created_at: TIMESTAMP,
          updated_at: UPDATED_TIMESTAMP,
        },
      ],
    });
    getCloudflareContextMock.mockResolvedValue({ env: { DB: fake.db } });

    const summaries = await listMcqs();

    expect(summaries.map((mcq) => mcq.id)).toEqual([MCQ_TWO, MCQ_ONE]);
    expect(summaries[0]?.createdByUserId).toBe(CREATOR_B);
  });

  it("returns a full MCQ with camelCase choices for any authenticated lookup", async () => {
    const fake = createFakeMcqDb({
      mcqs: [
        {
          id: MCQ_ONE,
          name: "Fractions",
          question: "Half?",
          created_by_user_id: CREATOR_A,
          created_at: TIMESTAMP,
          updated_at: TIMESTAMP,
        },
      ],
      choices: [
        {
          id: CHOICE_ONE,
          mcq_id: MCQ_ONE,
          choice_text: "2/4",
          is_correct: 1,
          created_at: TIMESTAMP,
          updated_at: TIMESTAMP,
        },
        {
          id: CHOICE_TWO,
          mcq_id: MCQ_ONE,
          choice_text: "1/3",
          is_correct: 0,
          created_at: TIMESTAMP,
          updated_at: TIMESTAMP,
        },
      ],
    });
    getCloudflareContextMock.mockResolvedValue({ env: { DB: fake.db } });

    const mcq = await getMcqById(MCQ_ONE);

    expect(mcq).toMatchObject({
      id: MCQ_ONE,
      name: "Fractions",
      question: "Half?",
      createdByUserId: CREATOR_A,
      choices: [
        {
          id: CHOICE_ONE,
          choiceText: "2/4",
          isCorrect: true,
        },
        {
          id: CHOICE_TWO,
          choiceText: "1/3",
          isCorrect: false,
        },
      ],
    });
  });

  it("returns null when an MCQ does not exist", async () => {
    const fake = createFakeMcqDb();
    getCloudflareContextMock.mockResolvedValue({ env: { DB: fake.db } });

    await expect(getMcqById("missingmcq0000000000000000000000")).resolves.toBeNull();
  });

  it("updates retained choices, adds new ones, and removes omitted choices", async () => {
    const fake = createFakeMcqDb({
      mcqs: [
        {
          id: MCQ_ONE,
          name: "Old name",
          question: "Old question",
          created_by_user_id: CREATOR_A,
          created_at: TIMESTAMP,
          updated_at: TIMESTAMP,
        },
      ],
      choices: [
        {
          id: CHOICE_ONE,
          mcq_id: MCQ_ONE,
          choice_text: "Keep me",
          is_correct: 0,
          created_at: TIMESTAMP,
          updated_at: TIMESTAMP,
        },
        {
          id: CHOICE_TWO,
          mcq_id: MCQ_ONE,
          choice_text: "Remove me",
          is_correct: 1,
          created_at: TIMESTAMP,
          updated_at: TIMESTAMP,
        },
        {
          id: CHOICE_THREE,
          mcq_id: MCQ_ONE,
          choice_text: "Also remove",
          is_correct: 0,
          created_at: TIMESTAMP,
          updated_at: TIMESTAMP,
        },
      ],
    });
    getCloudflareContextMock.mockResolvedValue({ env: { DB: fake.db } });

    const input: UpdateMcqInput = {
      name: "Updated name",
      question: "Updated question",
      choices: [
        {
          id: CHOICE_ONE,
          choiceText: "Keep me updated",
          isCorrect: true,
        },
        { choiceText: "Brand new", isCorrect: false },
      ],
    };

    const result = await updateMcq(MCQ_ONE, input);

    expect(result).toEqual({
      ok: true,
      mcq: expect.objectContaining({
        name: "Updated name",
        question: "Updated question",
        choices: [
          expect.objectContaining({
            id: CHOICE_ONE,
            choiceText: "Keep me updated",
            isCorrect: true,
          }),
          expect.objectContaining({
            choiceText: "Brand new",
            isCorrect: false,
          }),
        ],
      }),
    });
    expect(fake.choices.map((choice) => choice.id)).not.toContain(CHOICE_TWO);
    expect(fake.choices.map((choice) => choice.id)).not.toContain(CHOICE_THREE);
    expect(fake.db.batch).toHaveBeenCalled();
  });

  it("allows a different authenticated user to update another creator's MCQ", async () => {
    const fake = createFakeMcqDb({
      mcqs: [
        {
          id: MCQ_ONE,
          name: "Shared",
          question: "Question",
          created_by_user_id: CREATOR_A,
          created_at: TIMESTAMP,
          updated_at: TIMESTAMP,
        },
      ],
      choices: [
        {
          id: CHOICE_ONE,
          mcq_id: MCQ_ONE,
          choice_text: "A",
          is_correct: 1,
          created_at: TIMESTAMP,
          updated_at: TIMESTAMP,
        },
        {
          id: CHOICE_TWO,
          mcq_id: MCQ_ONE,
          choice_text: "B",
          is_correct: 0,
          created_at: TIMESTAMP,
          updated_at: TIMESTAMP,
        },
      ],
    });
    getCloudflareContextMock.mockResolvedValue({ env: { DB: fake.db } });

    const result = await updateMcq(MCQ_ONE, {
      name: "Edited by B",
      question: "Edited question",
      choices: [
        { id: CHOICE_ONE, choiceText: "A", isCorrect: false },
        { id: CHOICE_TWO, choiceText: "B", isCorrect: true },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mcq.name).toBe("Edited by B");
      expect(result.mcq.createdByUserId).toBe(CREATOR_A);
    }
  });

  it("rejects unknown or foreign choice ids during update", async () => {
    const fake = createFakeMcqDb({
      mcqs: [
        {
          id: MCQ_ONE,
          name: "One",
          question: "Q",
          created_by_user_id: CREATOR_A,
          created_at: TIMESTAMP,
          updated_at: TIMESTAMP,
        },
        {
          id: MCQ_TWO,
          name: "Two",
          question: "Q2",
          created_by_user_id: CREATOR_B,
          created_at: TIMESTAMP,
          updated_at: TIMESTAMP,
        },
      ],
      choices: [
        {
          id: CHOICE_ONE,
          mcq_id: MCQ_ONE,
          choice_text: "A",
          is_correct: 1,
          created_at: TIMESTAMP,
          updated_at: TIMESTAMP,
        },
        {
          id: CHOICE_TWO,
          mcq_id: MCQ_ONE,
          choice_text: "B",
          is_correct: 0,
          created_at: TIMESTAMP,
          updated_at: TIMESTAMP,
        },
        {
          id: CHOICE_FOREIGN,
          mcq_id: MCQ_TWO,
          choice_text: "Foreign",
          is_correct: 1,
          created_at: TIMESTAMP,
          updated_at: TIMESTAMP,
        },
      ],
    });
    getCloudflareContextMock.mockResolvedValue({ env: { DB: fake.db } });

    const foreignResult = await updateMcq(MCQ_ONE, {
      name: "One",
      question: "Q",
      choices: [
        { id: CHOICE_FOREIGN, choiceText: "Foreign", isCorrect: true },
        { id: CHOICE_TWO, choiceText: "B", isCorrect: false },
      ],
    });
    const unknownResult = await updateMcq(MCQ_ONE, {
      name: "One",
      question: "Q",
      choices: [
        {
          id: "99999999999999999999999999999999",
          choiceText: "Missing",
          isCorrect: true,
        },
        { id: CHOICE_TWO, choiceText: "B", isCorrect: false },
      ],
    });

    expect(foreignResult).toEqual({ ok: false, reason: "invalid_choice" });
    expect(unknownResult).toEqual({ ok: false, reason: "invalid_choice" });
  });

  it("returns not found when updating or deleting a missing MCQ", async () => {
    const fake = createFakeMcqDb();
    getCloudflareContextMock.mockResolvedValue({ env: { DB: fake.db } });

    await expect(
      updateMcq("missingmcq0000000000000000000000", validCreateInput()),
    ).resolves.toEqual({ ok: false, reason: "not_found" });
    await expect(
      deleteMcq("missingmcq0000000000000000000000"),
    ).resolves.toEqual({ ok: false, reason: "not_found" });
  });

  it("deletes an MCQ and cascades choices and attempts for any authenticated user", async () => {
    const fake = createFakeMcqDb({
      mcqs: [
        {
          id: MCQ_ONE,
          name: "Delete me",
          question: "Q",
          created_by_user_id: CREATOR_A,
          created_at: TIMESTAMP,
          updated_at: TIMESTAMP,
        },
      ],
      choices: [
        {
          id: CHOICE_ONE,
          mcq_id: MCQ_ONE,
          choice_text: "A",
          is_correct: 1,
          created_at: TIMESTAMP,
          updated_at: TIMESTAMP,
        },
        {
          id: CHOICE_TWO,
          mcq_id: MCQ_ONE,
          choice_text: "B",
          is_correct: 0,
          created_at: TIMESTAMP,
          updated_at: TIMESTAMP,
        },
      ],
      attempts: [
        {
          id: ATTEMPT_ONE,
          mcq_id: MCQ_ONE,
          user_id: CREATOR_B,
          selected_choice_id: CHOICE_ONE,
          is_correct: 1,
          created_at: TIMESTAMP,
        },
      ],
    });
    getCloudflareContextMock.mockResolvedValue({ env: { DB: fake.db } });

    const result = await deleteMcq(MCQ_ONE);

    expect(result).toEqual({ ok: true });
    expect(fake.mcqs).toHaveLength(0);
    expect(fake.choices).toHaveLength(0);
    expect(fake.attempts).toHaveLength(0);
  });

  it("creates an attempt for any authenticated user with derived correctness", async () => {
    const fake = createFakeMcqDb({
      mcqs: [
        {
          id: MCQ_ONE,
          name: "Attempt",
          question: "Q",
          created_by_user_id: CREATOR_A,
          created_at: TIMESTAMP,
          updated_at: TIMESTAMP,
        },
      ],
      choices: [
        {
          id: CHOICE_ONE,
          mcq_id: MCQ_ONE,
          choice_text: "Correct",
          is_correct: 1,
          created_at: TIMESTAMP,
          updated_at: TIMESTAMP,
        },
        {
          id: CHOICE_TWO,
          mcq_id: MCQ_ONE,
          choice_text: "Wrong",
          is_correct: 0,
          created_at: TIMESTAMP,
          updated_at: TIMESTAMP,
        },
      ],
    });
    getCloudflareContextMock.mockResolvedValue({ env: { DB: fake.db } });

    const correct = await createMcqAttempt(MCQ_ONE, CREATOR_B, CHOICE_ONE);
    const incorrect = await createMcqAttempt(MCQ_ONE, CREATOR_B, CHOICE_TWO);

    expect(correct).toEqual({
      ok: true,
      attempt: expect.objectContaining({
        mcqId: MCQ_ONE,
        userId: CREATOR_B,
        selectedChoiceId: CHOICE_ONE,
        isCorrect: true,
      }),
    });
    expect(incorrect).toEqual({
      ok: true,
      attempt: expect.objectContaining({
        selectedChoiceId: CHOICE_TWO,
        isCorrect: false,
      }),
    });
    expect(fake.attempts).toHaveLength(2);
  });

  it("rejects attempts for missing MCQs or invalid choice membership", async () => {
    const fake = createFakeMcqDb({
      mcqs: [
        {
          id: MCQ_ONE,
          name: "One",
          question: "Q",
          created_by_user_id: CREATOR_A,
          created_at: TIMESTAMP,
          updated_at: TIMESTAMP,
        },
        {
          id: MCQ_TWO,
          name: "Two",
          question: "Q2",
          created_by_user_id: CREATOR_B,
          created_at: TIMESTAMP,
          updated_at: TIMESTAMP,
        },
      ],
      choices: [
        {
          id: CHOICE_FOREIGN,
          mcq_id: MCQ_TWO,
          choice_text: "Foreign",
          is_correct: 1,
          created_at: TIMESTAMP,
          updated_at: TIMESTAMP,
        },
        {
          id: CHOICE_TWO,
          mcq_id: MCQ_ONE,
          choice_text: "Local",
          is_correct: 0,
          created_at: TIMESTAMP,
          updated_at: TIMESTAMP,
        },
      ],
    });
    getCloudflareContextMock.mockResolvedValue({ env: { DB: fake.db } });

    await expect(
      createMcqAttempt("missingmcq0000000000000000000000", CREATOR_B, CHOICE_TWO),
    ).resolves.toEqual({ ok: false, reason: "not_found" });
    await expect(
      createMcqAttempt(MCQ_ONE, CREATOR_B, CHOICE_FOREIGN),
    ).resolves.toEqual({ ok: false, reason: "invalid_choice" });
  });

  it("uses numbered placeholders in every parameterized query", async () => {
    const fake = createFakeMcqDb();
    getCloudflareContextMock.mockResolvedValue({ env: { DB: fake.db } });

    await createMcq(CREATOR_A, validCreateInput());
    await listMcqs();
    await getMcqById(MCQ_ONE);

    for (const [sql] of fake.db.prepare.mock.calls) {
      if (!sql.includes("?")) {
        continue;
      }

      expect(sql).toContain("?1");
      expect(sql).not.toMatch(/(?<!\?)\?(?!\d)/);
    }
  });
});
