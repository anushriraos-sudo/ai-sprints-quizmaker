/**
 * MCQ persistence for Quiz Maker.
 *
 * Server-only. Never import this from a file marked `'use client'`.
 * All D1 access for mcqs, mcq_choices, and mcq_attempts lives here.
 */

import { getDb } from "@/lib/db";
import type {
  Mcq,
  McqAttempt,
  McqAttemptRow,
  McqChoice,
  McqChoiceRow,
  McqRow,
  McqSummary,
} from "@/lib/types/mcq";
import type { CreateMcqInput, UpdateMcqInput } from "@/lib/validations/mcq";

const MCQ_COLUMNS =
  "id, name, question, created_by_user_id, created_at, updated_at";
const CHOICE_COLUMNS =
  "id, mcq_id, choice_text, is_correct, created_at, updated_at";

export type UpdateMcqResult =
  | { ok: true; mcq: Mcq }
  | { ok: false; reason: "not_found" | "invalid_choice" };

export type DeleteMcqResult =
  | { ok: true }
  | { ok: false; reason: "not_found" };

export type CreateMcqAttemptResult =
  | { ok: true; attempt: McqAttempt }
  | { ok: false; reason: "not_found" | "invalid_choice" };

function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function rowToMcqChoice(row: McqChoiceRow): McqChoice {
  return {
    id: row.id,
    choiceText: row.choice_text,
    isCorrect: row.is_correct === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMcqSummary(row: McqRow): McqSummary {
  return {
    id: row.id,
    name: row.name,
    question: row.question,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMcq(row: McqRow, choiceRows: McqChoiceRow[]): Mcq {
  return {
    ...rowToMcqSummary(row),
    choices: choiceRows.map(rowToMcqChoice),
  };
}

async function selectMcqRow(mcqId: string): Promise<McqRow | null> {
  const db = await getDb();
  const { results } = await db
    .prepare(`SELECT ${MCQ_COLUMNS} FROM mcqs WHERE id = ?1`)
    .bind(mcqId)
    .all<McqRow>();
  return results[0] ?? null;
}

async function selectChoiceRows(mcqId: string): Promise<McqChoiceRow[]> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT ${CHOICE_COLUMNS}
       FROM mcq_choices
       WHERE mcq_id = ?1
       ORDER BY created_at ASC`,
    )
    .bind(mcqId)
    .all<McqChoiceRow>();
  return results;
}

async function loadMcq(mcqId: string): Promise<Mcq | null> {
  const row = await selectMcqRow(mcqId);
  if (!row) {
    return null;
  }

  const choiceRows = await selectChoiceRows(mcqId);
  return rowToMcq(row, choiceRows);
}

export async function listMcqs(): Promise<McqSummary[]> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT ${MCQ_COLUMNS}
       FROM mcqs
       ORDER BY updated_at DESC`,
    )
    .all<McqRow>();

  return results.map(rowToMcqSummary);
}

export async function getMcqById(mcqId: string): Promise<Mcq | null> {
  return loadMcq(mcqId);
}

export async function createMcq(
  creatorUserId: string,
  input: CreateMcqInput,
): Promise<Mcq> {
  const db = await getDb();
  const mcqId = generateId();
  const statements = [
    db
      .prepare(
        `INSERT INTO mcqs (id, name, question, created_by_user_id)
         VALUES (?1, ?2, ?3, ?4)`,
      )
      .bind(mcqId, input.name, input.question, creatorUserId),
    ...input.choices.map((choice) =>
      db
        .prepare(
          `INSERT INTO mcq_choices (id, mcq_id, choice_text, is_correct)
           VALUES (?1, ?2, ?3, ?4)`,
        )
        .bind(
          generateId(),
          mcqId,
          choice.choiceText,
          choice.isCorrect ? 1 : 0,
        ),
    ),
  ];

  await db.batch(statements);

  const mcq = await loadMcq(mcqId);
  if (!mcq) {
    throw new Error("MCQ insert succeeded but subsequent lookup failed");
  }

  return mcq;
}

export async function updateMcq(
  mcqId: string,
  input: UpdateMcqInput,
): Promise<UpdateMcqResult> {
  const existing = await loadMcq(mcqId);
  if (!existing) {
    return { ok: false, reason: "not_found" };
  }

  const existingChoiceIds = new Set(existing.choices.map((choice) => choice.id));
  const retainedIds = new Set<string>();

  for (const choice of input.choices) {
    if (choice.id) {
      if (!existingChoiceIds.has(choice.id)) {
        return { ok: false, reason: "invalid_choice" };
      }
      retainedIds.add(choice.id);
    }
  }

  const db = await getDb();
  const statements = [
    db
      .prepare(`UPDATE mcq_choices SET is_correct = 0 WHERE mcq_id = ?1`)
      .bind(mcqId),
  ];

  for (const choice of input.choices) {
    if (choice.id) {
      statements.push(
        db
          .prepare(
            `UPDATE mcq_choices
             SET choice_text = ?1, is_correct = ?2, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?3 AND mcq_id = ?4`,
          )
          .bind(
            choice.choiceText,
            choice.isCorrect ? 1 : 0,
            choice.id,
            mcqId,
          ),
      );
      continue;
    }

    statements.push(
      db
        .prepare(
          `INSERT INTO mcq_choices (id, mcq_id, choice_text, is_correct)
           VALUES (?1, ?2, ?3, ?4)`,
        )
        .bind(
          generateId(),
          mcqId,
          choice.choiceText,
          choice.isCorrect ? 1 : 0,
        ),
    );
  }

  for (const existingChoice of existing.choices) {
    if (!retainedIds.has(existingChoice.id)) {
      statements.push(
        db
          .prepare(`DELETE FROM mcq_choices WHERE id = ?1 AND mcq_id = ?2`)
          .bind(existingChoice.id, mcqId),
      );
    }
  }

  statements.push(
    db
      .prepare(
        `UPDATE mcqs
         SET name = ?1, question = ?2, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?3`,
      )
      .bind(input.name, input.question, mcqId),
  );

  await db.batch(statements);

  const mcq = await loadMcq(mcqId);
  if (!mcq) {
    throw new Error("MCQ update succeeded but subsequent lookup failed");
  }

  return { ok: true, mcq };
}

export async function deleteMcq(mcqId: string): Promise<DeleteMcqResult> {
  const existing = await selectMcqRow(mcqId);
  if (!existing) {
    return { ok: false, reason: "not_found" };
  }

  const db = await getDb();
  const result = await db
    .prepare(`DELETE FROM mcqs WHERE id = ?1`)
    .bind(mcqId)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    return { ok: false, reason: "not_found" };
  }

  return { ok: true };
}

export async function createMcqAttempt(
  mcqId: string,
  userId: string,
  selectedChoiceId: string,
): Promise<CreateMcqAttemptResult> {
  const mcq = await selectMcqRow(mcqId);
  if (!mcq) {
    return { ok: false, reason: "not_found" };
  }

  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT ${CHOICE_COLUMNS}
       FROM mcq_choices
       WHERE id = ?1 AND mcq_id = ?2`,
    )
    .bind(selectedChoiceId, mcqId)
    .all<McqChoiceRow>();

  const selectedChoice = results[0];
  if (!selectedChoice) {
    return { ok: false, reason: "invalid_choice" };
  }

  const attemptId = generateId();
  await db
    .prepare(
      `INSERT INTO mcq_attempts (id, mcq_id, user_id, selected_choice_id, is_correct)
       VALUES (?1, ?2, ?3, ?4, ?5)`,
    )
    .bind(
      attemptId,
      mcqId,
      userId,
      selectedChoiceId,
      selectedChoice.is_correct,
    )
    .run();

  const { results: attemptRows } = await db
    .prepare(
      `SELECT id, mcq_id, user_id, selected_choice_id, is_correct, created_at
       FROM mcq_attempts
       WHERE id = ?1`,
    )
    .bind(attemptId)
    .all<McqAttemptRow>();

  const attemptRow = attemptRows[0];
  if (!attemptRow) {
    throw new Error("Attempt insert succeeded but subsequent lookup failed");
  }

  return {
    ok: true,
    attempt: {
      id: attemptRow.id,
      mcqId: attemptRow.mcq_id,
      userId: attemptRow.user_id,
      selectedChoiceId: attemptRow.selected_choice_id,
      isCorrect: attemptRow.is_correct === 1,
      createdAt: attemptRow.created_at,
    },
  };
}
