-- Migration number: 0001 	 2026-08-24T12:18:27.942Z

-- Teachers who can sign in.
--
-- COLLATE NOCASE makes the implicit UNIQUE indexes case-insensitive, so the
-- database rejects TestUser alongside testuser rather than relying on the
-- application to lowercase every write and lookup. The application still
-- lowercases before storing, so rows stay canonical; the collation is the
-- backstop for any path that forgets.
--
-- Caveat: SQLite's NOCASE folds ASCII A-Z only. Usernames are restricted to
-- ASCII by validation, and the application-side lowercase is Unicode-aware,
-- so the two together cover non-ASCII email addresses.
--
-- Each UNIQUE constraint is backed by an implicit index, so no explicit
-- CREATE UNIQUE INDEX is needed.
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
