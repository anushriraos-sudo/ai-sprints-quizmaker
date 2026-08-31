-- Migration number: 0003 	 2026-08-31T09:10:00.000Z
--
-- Multiple-choice questions, choices, and attempts for the shared MCQ bank.
-- mcqs.created_by_user_id records creator attribution; v1 does not use it for
-- authorization. Deleting a user, MCQ, or choice cascades dependent rows.

CREATE TABLE mcqs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  question TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_mcqs_creator_updated
  ON mcqs(created_by_user_id, updated_at DESC);

CREATE TABLE mcq_choices (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  mcq_id TEXT NOT NULL,
  choice_text TEXT NOT NULL,
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mcq_id) REFERENCES mcqs(id) ON DELETE CASCADE,
  UNIQUE (mcq_id, id)
);

CREATE UNIQUE INDEX idx_mcq_choices_one_correct
  ON mcq_choices(mcq_id)
  WHERE is_correct = 1;

CREATE TABLE mcq_attempts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  mcq_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  selected_choice_id TEXT NOT NULL,
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mcq_id) REFERENCES mcqs(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (mcq_id, selected_choice_id)
    REFERENCES mcq_choices(mcq_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_mcq_attempts_mcq_id
  ON mcq_attempts(mcq_id);

CREATE INDEX idx_mcq_attempts_user_created
  ON mcq_attempts(user_id, created_at DESC);
