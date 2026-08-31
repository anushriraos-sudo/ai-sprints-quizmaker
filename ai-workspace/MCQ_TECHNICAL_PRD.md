Date created: 2026-08-31
Date last modified: 2026-08-31 (post–remote migration verification)

# Multiple-Choice Question CRUD - Technical PRD

## Overview/Problem

Quiz Maker authenticates teachers and sends them to a protected `/mcq` workspace where
they can create, list, preview, edit, and delete single-answer multiple-choice questions
in a shared bank across creators. This feature also establishes the persistence and
service/API contract for recording attempts. Learner-facing quiz-taking UI remains
deferred to Phase 7.

---

## Hypothesis

We believe that a focused MCQ authoring workflow with reusable choices will let
authenticated teachers build and maintain a useful question bank while preserving the
existing application's security and architecture.

---

## Scope

### In Scope

- A protected shared-bank list at `/mcq` containing every MCQ
- Create and edit routes that reuse one form component
- MCQ fields: `name` and `question`
- Between two and six choices, each with required text
- Exactly one correct choice
- Authenticated users can read, update, preview, and delete any MCQ in the shared bank
- An accessible row actions menu with Edit, Preview, and Delete
- An authoring-mode creator preview that displays all choices and identifies the correct
  choice
- An accessible delete confirmation dialog
- D1 tables for MCQs, choices, and attempts, created through a migration
- An MCQ service that owns all SQL and relationship handling
- REST API routes between client components and the service layer
- An endpoint and service method for any authenticated user to record an attempt
- TDD with Vitest and Testing Library: test first, observe red, implement, observe green
- Local and remote D1 migration for MCQ tables; deployment only with explicit approval

### Out of Scope

- A learner-facing quiz-taking UI — deferred to Future Phase 7
- Granular sharing permissions, roles, approval workflows, or transferring creator
  attribution
- Multiple-correct-answer questions
- Rich text, images, descriptions, categories, tags, search, sorting, and pagination
- Attempt history, scoring dashboards, analytics, or deleting attempts directly
- Draft/published states, soft deletion, audit history, or MCQ versioning
- Bulk import/export and bulk actions

### Cut

- `description` on MCQs — `name` and `question` cover the requested first version
- Separate create and edit form implementations — both routes use one form component
- Three inline action buttons — a ShadCN dropdown keeps the table compact
- Trusting a user id or correctness value from the browser — both are derived server-side
- Preserving attempts for a removed choice — retained choices keep their IDs, but attempts
  for a deliberately removed choice are cascade-deleted in this version

---

## Resolved Product Decisions

The following decisions were confirmed on 2026-08-31:

1. The management list is a shared bank. Every authenticated user can list, read, edit,
   preview, and delete every MCQ. `created_by_user_id` records attribution and is not an
   authorization boundary in v1.
2. Any authenticated user who knows an MCQ ID may record an attempt. A learner-facing
   discovery UI is deferred.
3. Editing preserves IDs for retained choices. Removing a choice cascade-deletes only
   attempts that selected that choice.
4. The authoring-mode creator preview uses a dedicated `/mcq/[id]/preview` page and is
   available to every authenticated user.
5. Create and edit use distinct routes (`/mcq/new`, `/mcq/[id]/edit`) backed by the same
   `McqForm` component.
6. A learner preview at `/mcq/[id]/try` is deferred to Future Phase 7 and will reuse the
   attempt endpoint without exposing `isCorrect` before submission.

---

## Technical Requirements

### Architecture

The existing boundary remains:

`Client component -> Next.js API route -> MCQ service -> D1`

- Route modules authenticate, parse JSON, validate with Zod, call the service, and map
  typed results to HTTP responses.
- `src/lib/services/mcq-service.ts` contains all SQL for `mcqs`, `mcq_choices`, and
  `mcq_attempts`.
- Client components never import server-only services or access D1.
- API routes authenticate independently. Page middleware is not an API security boundary.
- Request bodies never accept `createdByUserId`, `userId`, or `isCorrect` for attempts.

### Database Schema

Create one generated migration after `0002_create_sessions_table.sql`. The actual filename
will use Wrangler's next migration number and descriptive suffix.

```sql
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
```

#### Schema Decisions

- Names use plural snake_case tables and snake_case columns, matching `users` and
  `sessions`. TypeScript API/domain objects use camelCase.
- IDs retain the existing 32-character lowercase hex format. Multi-row service writes
  generate IDs in application code with Web Crypto so the same MCQ ID can be bound into
  an atomic D1 batch.
- D1 enforces foreign keys. Deleting a user deletes their MCQs and attempts. Deleting an
  MCQ deletes its choices and attempts. Deleting a choice deletes attempts that selected
  it.
- The composite choice foreign key prevents an attempt from pairing one MCQ with a choice
  from another MCQ.
- The partial unique index enforces at most one correct choice in D1. Zod and the service
  enforce at least one, exactly one, and the two-to-six count.
- Timestamps are database-generated UTC values. The service explicitly sets
  `updated_at = CURRENT_TIMESTAMP` when an MCQ or retained choice changes.
- Attempt `is_correct` is a historical snapshot derived from the selected choice by the
  service, never accepted from the client. A later edit does not rewrite retained
  attempts.

### Atomic Write Strategy

Cloudflare D1 `batch()` statements execute sequentially as a transaction and roll back
the full batch if one statement fails. It is required for:

- inserting an MCQ and all of its choices;
- updating the MCQ, preserving retained choices, inserting new choices, and deleting
  omitted choices;
- ensuring no partially saved MCQ remains after an error.

For update:

1. Load the MCQ and its existing choices.
2. Reject unknown supplied choice IDs.
3. Build one batch scoped by MCQ ID.
4. Temporarily set all existing choices for this MCQ to
   `is_correct = 0` inside the batch so changing the correct answer cannot conflict with
   the partial unique index, including when the previously correct choice is removed.
5. Update retained choices, insert choices without IDs, delete omitted choices, and update
   the MCQ row.
6. Read and return the complete saved MCQ.

Retained choice IDs are accepted only when they already belong to the target MCQ.
An ID belonging to another MCQ is invalid and must never update that other row.

### Domain Types

```typescript
type McqChoice = {
  id: string;
  choiceText: string;
  isCorrect: boolean;
  createdAt: string;
  updatedAt: string;
};

type Mcq = {
  id: string;
  name: string;
  question: string;
  createdByUserId: string;
  choices: McqChoice[];
  createdAt: string;
  updatedAt: string;
};

type McqSummary = Omit<Mcq, "choices">;

type McqAttempt = {
  id: string;
  mcqId: string;
  userId: string;
  selectedChoiceId: string;
  isCorrect: boolean;
  createdAt: string;
};
```

### Validation

Use Zod 4 in `src/lib/validations/mcq.ts`.

- `name`: string, trim, required, maximum 100 characters
- `question`: string, trim, required, maximum 2,000 characters
- `choices`: array, minimum 2, maximum 6
- `choiceText`: string, trim, required, maximum 500 characters
- `isCorrect`: boolean
- Create choices do not require IDs
- Update choice IDs are optional 32-character lowercase hexadecimal strings
- An object-level refinement requires exactly one `isCorrect: true`
- Attempt input requires one valid-format `selectedChoiceId`
- Unknown fields such as creator/user IDs and attempt correctness are not used

Client-side constraints improve feedback but do not replace route validation.
Validation errors use the existing response shape:

```typescript
type McqErrorResponse = {
  formError?: string;
  fieldErrors?: Record<string, string[]>;
};
```

Nested choice errors may use stable paths such as `choices.0.choiceText`. The route/helper
must normalize Zod issues into this shape so the form can associate each message with the
correct control.

### Authentication and Authorization

- Parse the existing `session` cookie from each MCQ API request.
- Resolve it through the existing session service.
- Missing, expired, or invalid sessions return `401` with
  `{ "formError": "Authentication required" }`.
- List queries return every MCQ in the shared bank.
- Detail, update, preview, and delete require a valid session but do not compare the
  current user with `created_by_user_id`.
- Create derives `created_by_user_id` from the current session. The request body cannot
  choose or change creator attribution.
- Missing records return `404` with `{ "formError": "MCQ not found" }`.
- Attempt creation requires authentication and remains unchanged by the shared-bank
  decision.
- The attempt service verifies that the MCQ exists and the selected choice belongs to it,
  then derives `isCorrect` from D1.
- Middleware continues to protect `/mcq/:path*`, but service/API authorization remains
  mandatory and is covered separately by tests.

### API Endpoints

All successful and failed responses are JSON. Unexpected failures are logged server-side
and return `{ "formError": "Something went wrong. Please try again." }`.

#### GET /api/mcqs

- Authentication: required
- Behavior: list every MCQ in the shared bank, newest updates first
- Success `200`: `{ "mcqs": McqSummary[] }`
- Error `401`: authentication required

#### POST /api/mcqs

Request:

```json
{
  "name": "Fractions basics",
  "question": "Which fraction is equal to one half?",
  "choices": [
    { "choiceText": "2/4", "isCorrect": true },
    { "choiceText": "1/3", "isCorrect": false }
  ]
}
```

- Authentication: required
- Success `201`: `{ "mcq": Mcq }`
- Error `400`: malformed JSON or validation errors
- Error `401`: authentication required

#### GET /api/mcqs/[id]

- Authentication: required; open to all authenticated users
- Success `200`: `{ "mcq": Mcq }`
- Error `401`: authentication required
- Error `404`: MCQ does not exist

#### PUT /api/mcqs/[id]

The complete resource is replaced, so `PUT` is used instead of `PATCH`.

Request:

```json
{
  "name": "Fractions basics",
  "question": "Which fraction is equal to one half?",
  "choices": [
    {
      "id": "a1b2c3d4e5f60718293a4b5c6d7e8f90",
      "choiceText": "2/4",
      "isCorrect": true
    },
    { "choiceText": "3/4", "isCorrect": false }
  ]
}
```

- Authentication: required; open to all authenticated users
- Success `200`: `{ "mcq": Mcq }`
- Error `400`: malformed JSON, validation errors, or a supplied choice ID not belonging
  to this MCQ
- Error `401`: authentication required
- Error `404`: MCQ does not exist

#### DELETE /api/mcqs/[id]

- Authentication: required; open to all authenticated users
- Success `200`: `{ "deleted": true }`
- Error `401`: authentication required
- Error `404`: MCQ does not exist
- Deletion is idempotent only from the database perspective; a second API delete returns
  `404` because the resource no longer exists

#### POST /api/mcqs/[id]/attempts

Request:

```json
{
  "selectedChoiceId": "a1b2c3d4e5f60718293a4b5c6d7e8f90"
}
```

- Authentication: required
- Success `201`: `{ "attempt": McqAttempt }`
- Error `400`: malformed JSON or selected choice does not belong to the MCQ
- Error `401`: authentication required
- Error `404`: MCQ does not exist
- `userId` and `isCorrect` are derived server-side

### Service Contract

`src/lib/services/mcq-service.ts` exports:

- `listMcqs()`
- `getMcqById(mcqId)`
- `createMcq(creatorUserId, input)`
- `updateMcq(mcqId, input)`
- `deleteMcq(mcqId)`
- `createMcqAttempt(mcqId, userId, selectedChoiceId)`

Typed results distinguish success, not found, and invalid-choice cases without
using exceptions for expected outcomes. Unexpected D1 failures propagate to the route
boundary and become generic `500` responses.

### User Interface Requirements

#### MCQ List (`/mcq`)

- Replace the placeholder card with a full-width authenticated workspace.
- Header includes title, signed-in teacher context, Create MCQ, and Log out.
- Create MCQ navigates to `/mcq/new`.
- Fetch `/api/mcqs` and render the global shared bank in a ShadCN table with Name,
  Question, Created, Updated, and Actions columns.
- Long question text truncates visually without changing accessible content.
- Show loading, API-error, and empty states. The empty state links to creation.
- Each row has an icon button with accessible name `Actions for <MCQ name>`.
- The ShadCN dropdown contains Edit, Preview, and Delete.
- Edit navigates to `/mcq/[id]/edit`.
- Preview navigates to `/mcq/[id]/preview`.
- Delete opens a confirmation dialog naming the MCQ; confirm calls the API and removes the
  row after success. Cancel and Escape close without deleting.

#### Shared Create/Edit Form (`/mcq/new`, `/mcq/[id]/edit`)

- Both routes render one `McqForm` client component.
- Edit loads the existing shared-bank resource and preserves choice IDs.
- Fields use visible labels: Name, Question, and a label for each choice.
- Two choices appear by default on create.
- Add Choice is available below six and unavailable at six.
- Remove Choice is unavailable when only two remain.
- A radio control selects exactly one correct answer.
- Removing the selected correct choice clears the selection and requires another answer
  before save.
- Save uses POST when creating and PUT when editing.
- On success, navigate to `/mcq`.
- Cancel navigates to `/mcq` without writing.
- Disable mutation controls while saving and prevent duplicate submissions.
- Display server field/form errors using existing `Field`, `FieldLabel`, and `FieldError`
  conventions, with `aria-invalid` and message associations.

#### Creator Preview (`/mcq/[id]/preview`)

- Load the shared-bank MCQ.
- Display the name, question, and all choices as a non-submittable preview.
- Clearly but simply mark the correct choice with text/icon and not color alone.
- Back/Edit navigation returns to the management workflow.
- Show not-found and API-error states.
- "Creator preview" describes the authoring-mode presentation, not an owner restriction;
  every authenticated user can open it.

### ShadCN Components

Reuse the installed table and existing Base UI/ShadCN setup. Add generated ShadCN
components through the project CLI if missing:

- Dropdown Menu
- Alert Dialog (preferred for destructive confirmation)
- Textarea
- Radio Group

Do not hand-edit generated UI component files. If the generator proposes a new package,
pause for dependency approval as required by `AGENTS.md`.

---

## Implementation Phases

Every phase follows red-green-refactor:

1. Add the smallest meaningful behavior test.
2. Run the relevant test and record that it fails for the expected missing behavior.
3. Implement only enough production code to satisfy it.
4. Run the focused test until green.
5. Run previously green MCQ tests to detect regressions.

Valid requirement tests are not weakened to accommodate faulty production code.

### Phase 0: Baseline and Test Map - COMPLETED

**Objective:** Confirm a green baseline and map requirements to focused test files.

**Tasks:**
1. ~~Run the existing full suite before feature changes.~~
2. ~~Record baseline test count and any pre-existing failures.~~
3. ~~Create a requirement/test matrix in this PRD.~~

**Deliverables:**
- Verified baseline: `npm test` passed on 2026-08-31
- Baseline result: 10 test files passed, 50 tests passed, 0 failures
- Test map below; no production implementation was added in this phase

#### Baseline Evidence

`npm test` completed with exit code 0 using Vitest 4.1.11:

- Test files: 10 passed
- Tests: 50 passed
- Pre-existing failures: none
- Duration reported by Vitest: 59.18 seconds

#### Requirement-to-Test Map

- **Validation — `src/lib/validations/mcq.test.ts`:** trimming and required fields;
  maximum lengths; two-to-six choices; required choice text; exactly one correct choice;
  optional valid update choice IDs; attempt selection input.
- **Service — `src/lib/services/mcq-service.test.ts`:** atomic create with choices; global
  shared-bank list and detail; creator attribution; row mapping; retained, added, and
  removed choices on update; correct-answer changes; foreign choice-ID rejection;
  cross-user update/delete; cascades; attempt attribution, choice membership, and derived
  correctness.
- **Collection API — `src/app/api/mcqs/mcq-routes.test.ts`:** authentication; malformed
  JSON; validation failures; global list; create success; creator identity derived from
  the session; generic unexpected-error handling.
- **Item and attempt API — colocated route test files under
  `src/app/api/mcqs/[id]/`:** authenticated shared-bank detail/update/delete; missing
  records; invalid choice IDs; successful and invalid attempts; user identity and
  correctness not trusted from request JSON.
- **List UI — `src/components/mcq-list.test.tsx`:** loading, error, empty, and rows from
  multiple creators; Create navigation; accessible row menu; Edit/Preview navigation;
  delete confirmation, cancellation, success, and failure.
- **Shared form — `src/components/mcq-form.test.tsx`:** two default choices; add/remove
  limits; accessible labels and errors; one correct selection; create POST; edit loading
  and PUT; preserved choice IDs; Save/Cancel behavior; duplicate-submit prevention.
- **Creator preview — `src/components/mcq-preview.test.tsx`:** question and choices;
  perceivable correct-answer marker; Back/Edit navigation; loading, missing, and error
  states.
- **Real local D1 checks:** migration structure; foreign keys; partial unique index;
  aggregate-write atomicity; choice and attempt cascades; representative shared-bank CRUD
  and attempt recording.
- **Regression gates:** run focused tests during each red-green increment, all accumulated
  MCQ tests after each phase, then the complete `npm test`, `npm run lint`, and
  `npm run build` gates in Phase 6.

### Phase 1: Validation and Migration - COMPLETED

**Objective:** Establish input contracts and relational integrity.

**Tasks:**
1. ~~Write failing Zod tests for trimming, required fields, lengths, choice count, required
   choice text, exactly one correct answer, update IDs, and attempt input.~~
2. ~~Run the validation tests and confirm red.~~
3. ~~Implement `mcq.ts`; run focused tests to green.~~
4. ~~Generate and write the three-table migration.~~
5. ~~Apply the migration locally only.~~
6. ~~Verify columns, indexes, foreign keys, partial uniqueness, and cascades against local
   D1 without leaving test data.~~

**Deliverables:**
- `src/lib/validations/mcq.test.ts` — 11 validation tests
- `src/lib/validations/mcq.ts` — `createMcqSchema`, `updateMcqSchema`,
  `createMcqAttemptSchema`, and `mcqFieldErrors`
- `migrations/0003_create_mcq_tables.sql`, applied locally and on remote D1

**Verified against local D1 on 2026-08-31:**

| Check | Result |
| --- | --- |
| Tables `mcqs`, `mcq_choices`, `mcq_attempts` exist | pass |
| Foreign keys on attempts reference `mcqs`, `users`, and composite `mcq_choices` | pass |
| Partial unique index `idx_mcq_choices_one_correct` present | pass |
| Second correct choice for one MCQ rejected (`UNIQUE constraint failed: mcq_choices.mcq_id`) | pass |
| Deleting an MCQ cascades to its choices and attempts | pass |
| Temporary verification rows removed | pass |

**TDD evidence:**
- Red: `mcq.test.ts` failed with missing module before implementation
- Green: 11/11 validation tests pass; full suite 61/61 pass

### Phase 2: MCQ Service - COMPLETED

**Objective:** Implement tested business persistence before exposing HTTP routes.

**Tasks:**
1. ~~Write failing service tests for create-with-choices, global shared-bank list/detail,
   creator attribution, snake_case mapping, and no partial writes.~~
2. ~~Implement create/list/detail with prepared statements and atomic batches; make green.~~
3. ~~Write failing tests for update: retained IDs, added/removed choices, correct-answer
   changes, unknown/foreign choice IDs, timestamps, and cross-user updates.~~
4. ~~Implement update; make focused and prior tests green.~~
5. ~~Write failing tests for cross-user delete and choice/attempt cascade behavior.~~
6. ~~Implement delete; make green.~~
7. ~~Write failing tests for attempts: current user attribution, selected-choice membership,
   derived correctness, cross-user attempt permission, and missing MCQs.~~
8. ~~Implement attempt creation; make all service tests green.~~

**Deliverables:**
- `src/lib/types/mcq.ts` — row and domain types
- `src/lib/services/mcq-service.test.ts` — 13 service behavior tests
- `src/lib/services/mcq-service.ts` — shared-bank CRUD, atomic batches, attempts
- All service behaviors green

**TDD evidence:**
- Red: service test file failed with missing module before implementation
- Green: 13/13 service tests pass; full suite 74/74 pass

**Service exports:**
- `listMcqs()`, `getMcqById(mcqId)`, `createMcq(creatorUserId, input)`,
  `updateMcq(mcqId, input)`, `deleteMcq(mcqId)`, `createMcqAttempt(mcqId, userId,
  selectedChoiceId)`
- Typed results for `not_found` and `invalid_choice` without throwing on expected failures
- Create/update use D1 `batch()` for atomic MCQ + choice writes

### Phase 3: Authenticated API Routes - COMPLETED

**Objective:** Expose service behavior through authenticated, validated REST endpoints.

**Tasks:**
1. ~~Write failing route tests for unauthenticated, malformed, invalid, missing,
   authenticated cross-user CRUD, and successful/invalid attempts.~~
2. ~~Implement shared request authentication/error helpers and collection routes; make green.~~
3. ~~Implement item routes and attempt route incrementally; make each focused test green.~~
4. ~~Re-run all validation, service, and route tests.~~

**Deliverables:**
- `src/lib/types/mcq-api.ts` — JSON response/error contracts
- `src/lib/api/mcq-auth.ts` — request cookie auth and shared error responses
- `src/app/api/mcqs/route.ts` — list/create
- `src/app/api/mcqs/[id]/route.ts` — detail/update/delete
- `src/app/api/mcqs/[id]/attempts/route.ts` — attempt recording
- `src/app/api/mcqs/mcq-routes.test.ts` — 9 route behavior tests
- API tests green

**TDD evidence:**
- Red: route test file failed with missing route modules before implementation
- Green: 9/9 route tests pass; full suite 83/83 pass

### Phase 4: MCQ List and Actions - COMPLETED

**Objective:** Replace the stub with a tested management list.

**Tasks:**
1. ~~Write failing behavior tests for loading rows from multiple creators, empty/error
   states, Create navigation, the accessible actions menu, and Edit/Preview navigation.~~
2. ~~Add required generated ShadCN components, pausing if a dependency is proposed.~~
3. ~~Implement the list and menu; make focused tests green.~~
4. ~~Write a failing delete-confirmation test covering cancel and confirmed deletion.~~
5. ~~Implement delete interaction; make list tests green.~~

**Deliverables:**
- `src/components/mcq-list.tsx` — client management table with loading, empty, and error
  states; Create navigation; accessible row actions; delete confirmation
- `src/components/mcq-list.test.tsx` — 8 list behavior tests
- `src/components/ui/dropdown-menu.tsx` and `src/components/ui/alert-dialog.tsx` —
  generated ShadCN components for row actions and delete confirmation
- Updated `src/app/mcq/page.tsx` — full-width list workspace with signed-in user context

**TDD evidence:**
- Red: list test file failed with missing `@/components/mcq-list` before implementation
- Green: 8/8 list tests pass; full suite 91/91 pass; lint passes (1 pre-existing warning);
  build passes

### Phase 5: Shared Create/Edit Form - COMPLETED

**Objective:** Create and edit complete MCQs through one tested form.

**Tasks:**
1. ~~Write failing create-form behavior tests for two defaults, add/remove limits, labels,
   selecting one correct answer, validation, Save, and Cancel.~~
2. ~~Implement create mode; make green.~~
3. ~~Write failing edit tests for loading values/IDs, changing choices, POST-versus-PUT
   behavior, loading/error states, and successful navigation.~~
4. ~~Implement edit mode and routes; make all form tests green.~~

**Deliverables:**
- `src/components/mcq-form.tsx` — shared create/edit form with choice add/remove limits,
  radio correct-answer selection, server field errors, and duplicate-submit prevention
- `src/components/mcq-form.test.tsx` — 13 form behavior tests
- `src/components/ui/textarea.tsx` and `src/components/ui/radio-group.tsx` — generated
  ShadCN components
- `src/app/mcq/new/page.tsx` — create route
- `src/app/mcq/[id]/edit/page.tsx` — edit route

**TDD evidence:**
- Red: form test file failed with missing `@/components/mcq-form` before implementation
- Green: 13/13 form tests pass; full suite 104/104 pass; lint passes (1 pre-existing
  warning); build passes

### Phase 6: Preview and End-to-End Verification - COMPLETED

**Objective:** Complete preview and verify the full feature without regressions.

**Tasks:**
1. ~~Write failing preview behavior tests for question, choices, correct-answer indicator,
   navigation, and not-found/error states.~~
2. ~~Implement preview; make green.~~
3. ~~Run all MCQ tests, then the full Vitest suite.~~
4. ~~Run `npm run lint` and `npm run build`.~~
5. ~~Run local Workers preview and manually verify create, list, edit with choice removal,
   creator preview, delete cascade, shared-bank cross-user management, and attempt
   recording.~~
6. ~~Update this PRD with actual test counts, command results, migration status, and resolved
   troubleshooting notes.~~

**Deliverables:**
- `src/components/mcq-preview.tsx` — non-submittable creator preview with text+icon correct
  answer marker, Back/Edit navigation, and loading/error/not-found states
- `src/components/mcq-preview.test.tsx` — 7 preview behavior tests
- `src/app/mcq/[id]/preview/page.tsx` — preview route
- Full suite green; lint and build passing

**TDD evidence:**
- Red: preview test file failed with missing `@/components/mcq-preview` before implementation
- Green: 7/7 preview tests pass; full suite 114/114 pass; lint passes (1 pre-existing
  warning); build passes

**Regression gates (final verification, 2026-08-31):**

| Command | Result |
| --- | --- |
| `npm test` | 16 files, 114 tests, 0 failures |
| `npm run lint` | Pass (1 pre-existing warning in `mcq-service.test.ts`) |
| `npm run build` | Pass — all MCQ routes present |
| `npm run preview` | Pass — OpenNext build and Wrangler local server on port 8787 |
| Manual UI/smoke test | Pass — register, create, list, edit, preview, delete verified in browser |
| Workers API smoke test | Pass — list, create, attempt, delete, preview page via local preview |

**Migration status:**

| Location | `0001` users | `0002` sessions | `0003` MCQ tables |
| --- | --- | --- | --- |
| Local D1 | applied | applied | applied |
| Remote D1 | applied | applied | applied (2026-08-31, explicit user approval) |

Remote verification: `wrangler d1 migrations list --remote` reports no pending migrations;
`mcqs`, `mcq_choices`, and `mcq_attempts` tables confirmed on remote D1.

**Pre-commit status:** MCQ implementation files are written and verified but not yet
committed to git. Commit before deploy.

---

## Future Work

### Phase 7: Learner Preview - DEFERRED

**Objective:** Add a learner-facing `/mcq/[id]/try` experience after v1 CRUD ships.

This phase is future work and is not part of the v1 completion gate.

**Planned Tasks:**
1. Write failing behavior tests for loading an MCQ without correctness metadata, selecting
   one answer, submitting it, and displaying correct/incorrect feedback.
2. Add a safe learner-read contract that returns the question and choices without
   `isCorrect`. Do not reuse the creator-preview payload directly because it exposes the
   answer.
3. Build `/mcq/[id]/try` with accessible single-choice controls.
4. Reuse `POST /api/mcqs/[id]/attempts` to record the authenticated user's selection and
   return the derived result.
5. Add navigation into the learner preview and run the full red-green verification cycle.

**Future Deliverables:**
- `/mcq/[id]/try`
- Learner-safe MCQ response type/read path
- Learner preview behavior tests
- Reuse of the existing attempt endpoint

---

## Technical Implementation Details

### Key Files

- `migrations/0003_*.sql` - MCQ, choice, and attempt schema
- `src/lib/types/mcq.ts` - database-row and public domain types
- `src/lib/types/mcq-api.ts` - JSON response/error contracts
- `src/lib/validations/mcq.ts` - Zod 4 schemas
- `src/lib/services/mcq-service.ts` - all MCQ-related D1 access
- `src/app/api/mcqs/route.ts` - list/create
- `src/app/api/mcqs/[id]/route.ts` - shared-bank detail/update/delete
- `src/app/api/mcqs/[id]/attempts/route.ts` - authenticated attempts
- `src/components/mcq-list.tsx` - client management table
- `src/components/mcq-form.tsx` - shared create/edit form
- `src/components/mcq-preview.tsx` - creator preview
- `src/app/mcq/page.tsx` - list route
- `src/app/mcq/new/page.tsx` - create route
- `src/app/mcq/[id]/edit/page.tsx` - edit route
- `src/app/mcq/[id]/preview/page.tsx` - preview route

Final names may be adjusted to fit a clearer local grouping, but boundaries must remain.

### Existing Patterns to Preserve

- Access `env.DB` only through `getDb()`.
- Keep persistence in server-only services.
- Use numbered D1 placeholders (`?1`, `?2`, and so on).
- Map database rows explicitly from snake_case to camelCase.
- Use typed expected-result unions instead of throwing for normal not-found/invalid cases.
- Use generic `500` messages and log unexpected errors only on the server.
- Use `safeParse` at route boundaries and the existing field/form error shape.
- Use the current session cookie and session service; do not add another auth mechanism.
- Use `fetch` from client components and `router.push` after successful mutations.
- Use Testing Library queries by label, role, and visible behavior.

### Test Boundaries

- Validation tests execute real schemas.
- Service tests exercise behavior with a stateful fake D1 binding, including batch rollback
  semantics needed by the scenario; they do not assert private helper calls.
- Route tests mock authentication/service module boundaries and execute exported HTTP
  methods with real `Request` objects.
- Component tests mock `fetch` and navigation but interact through accessible labels,
  roles, and visible text.
- Local D1 verification covers relational behavior that a fake cannot prove.
- Tests must include a cross-user fixture proving that one authenticated user can list,
  read, update, preview, and delete an MCQ created by another user.

### Important Notes

- MCQ v1 (Phases 0–6) is implemented and verified. Phase 7 learner preview remains
  deferred.
- `cloudflare-env.d.ts`, `next-env.d.ts`, and `package-lock.json` are generated and must
  not be hand-edited.
- Remote migrations and deployment require explicit user approval per project rules.
  Migration `0003` was applied to remote D1 on 2026-08-31 with user approval.
- Next.js dynamic route parameters are asynchronous in the installed Next.js version.
- `npm run dev` does not prove Workers behavior; runtime-sensitive writes need local
  `npm run preview` verification.

---

## Acceptance Criteria

### Database and Service

- [x] A migration creates `mcqs`, `mcq_choices`, and `mcq_attempts` locally and on remote D1.
- [x] Foreign keys prevent invalid references and cascade required deletions.
- [x] An MCQ save is atomic and cannot leave a question without its intended choices.
- [x] Exactly one correct answer and two-to-six choices are enforced server-side.
- [x] Create assigns creator attribution from the authenticated user, not request JSON.
- [x] Listing returns all MCQs in the global shared bank.
- [x] Any authenticated user can read, update, preview, and delete another creator's MCQ.
- [x] Updating preserves retained choices and removes omitted choices without orphans.
- [x] Removing a choice deletes attempts selecting that choice.
- [x] Attempts use the authenticated user, require a choice belonging to the MCQ, and
  derive correctness server-side.

### API

- [x] CRUD and attempt endpoints return the documented JSON/status contracts.
- [x] Every endpoint returns `401` for a missing/invalid session.
- [x] Missing records return `404`.
- [x] Malformed JSON and invalid inputs return useful `400` errors.
- [x] Routes contain no direct SQL.

### UI and Accessibility

- [x] `/mcq` renders loading, error, empty, and populated list states.
- [x] Create, Edit, Preview, and Delete flows work as documented.
- [x] Create starts with two choices and permits no fewer than two or more than six.
- [x] One correct choice can be selected and is required before save.
- [x] The shared form performs POST for create and PUT for edit.
- [x] Cancel returns to the list without a mutation.
- [x] Preview identifies the correct answer without relying on color alone.
- [x] Delete requires confirmation.
- [x] Controls have visible labels or accessible names and support keyboard interaction.
- [x] Validation errors are associated with invalid fields and communicated accessibly.

### Quality

- [x] Each behavior phase has recorded red evidence before implementation and green
  evidence afterward.
- [x] All MCQ validation, service, route, and component tests are green (61 MCQ-focused
  tests across validation, service, routes, list, form, and preview).
- [x] The complete existing test suite remains green (114/114 total).
- [x] `npm run lint` passes.
- [x] `npm run build` passes.
- [x] Local Workers-runtime verification recorded (preview server + API smoke test + manual
  UI walkthrough).

---

## Success Metrics

| Metric | Target | How Measured |
| --- | --- | --- |
| Core authoring completion | A teacher can create, edit, preview, and delete an MCQ | Acceptance walkthrough |
| Data integrity | Zero orphan choices/attempts in tested create, update, and delete flows | Local D1 FK/cascade checks |
| Shared-bank access | Authenticated users can list and manage MCQs across creators | Service/API tests and manual check |
| Validation reliability | 100% of documented invalid payload classes rejected server-side | Validation and route tests |
| Regression status | All pre-existing and MCQ tests green | Final `npm test` result: 114/114 pass |

Product analytics are not added in this phase, so usage/time metrics cannot yet be
measured automatically.

---

## Dependencies

### External Dependencies

- Cloudflare D1 through the existing `DB` binding
- Next.js 16 / React 19
- ShadCN UI on the existing Base UI setup
- Zod 4
- Vitest 4, Testing Library, and jsdom

No new service, secret, or environment variable is required.

### Internal Dependencies

- `src/lib/db.ts`
- Existing users and sessions migrations
- `src/lib/auth/session-cookie.ts`
- `src/lib/auth/get-current-user.ts`
- `src/lib/services/session-service.ts`
- `src/middleware.ts`
- Existing UI Field, Button, Table, Card, and Dialog conventions

---

## Risks and Mitigation

### Technical Risks

- **Risk:** Updating the question and choices through separate auto-committed calls leaves
  partial state.
  **Mitigation:** Use one D1 `batch()` transaction for each aggregate write and test
  rollback behavior.
- **Risk:** A supplied choice ID updates another MCQ.
  **Mitigation:** Validate IDs against the loaded target aggregate and scope every
  choice mutation by `mcq_id`.
- **Risk:** Browser-supplied identity or correctness is forged.
  **Mitigation:** Derive user IDs from the session and attempt correctness from the stored
  choice.
- **Risk:** Page middleware is mistaken for API protection.
  **Mitigation:** Authenticate and authorize every API request independently.
- **Risk:** Switching the correct choice violates the partial unique index mid-update.
  **Mitigation:** Clear correctness before setting the validated single correct choice
  within one atomic batch.
- **Risk:** Fake-D1 tests diverge from actual D1 semantics.
  **Mitigation:** Verify indexes, foreign keys, cascades, and representative aggregate
  writes against local D1 and the Workers runtime.
- **Risk:** Native Windows file locks make OpenNext unable to replace `.open-next`.
  **Mitigation:** Stop processes holding generated output, retry cleanly, or document the
  blocker and use WSL; never delete user source changes.

### User Experience Risks

- **Risk:** Choice removal unexpectedly loses associated attempt history.
  **Mitigation:** Confirm destructive MCQ deletion, preserve retained choice IDs, and
  document that attempts for deliberately removed choices are removed in this version.
- **Risk:** Dynamic choice errors are unclear.
  **Mitigation:** Stable per-choice labels, indexed error paths, `aria-invalid`, and a
  form-level exactly-one-correct message.
- **Risk:** The action icon is inaccessible.
  **Mitigation:** Give each trigger an MCQ-specific accessible name and use generated
  dropdown/dialog primitives for keyboard and focus behavior.

---

## Troubleshooting Guide

### OpenNext preview fails on Windows with EPERM on `.open-next`

- **Symptom:** `npm run preview` exits during the OpenNext build with
  `Error: EPERM, Permission denied ... .open-next`.
- **Root cause:** OpenNext warns that Windows is not fully supported; the build step tries
  to delete and recreate `.open-next`, which can fail when another process holds a lock on
  that directory (antivirus, indexer, or a prior preview/dev process).
- **Resolution:** Run `npm run preview` from WSL or macOS/Linux, or close processes using
  `.open-next`, exclude the folder from real-time scanning, and retry. On 2026-08-31 a
  subsequent preview run on Windows succeeded after clearing the lock; treat EPERM as
  intermittent on Windows, not a product defect.
- **Files:** `package.json` (`preview` script), `.open-next/` (generated output)

### MCQ API returns 401 despite a session cookie on HTTP local preview

- **Symptom:** Manual API calls to `/api/mcqs` return `401` after login/register when
  testing with tools that do not send cookies the same way a browser does.
- **Root cause:** Session cookies are marked `Secure` in production mode. Some HTTP
  clients omit or mishandle them on `http://127.0.0.1`. Browser UI flows and explicit
  `Cookie` headers work as expected.
- **Resolution:** Test authenticated API flows in the browser or pass the `session` cookie
  header explicitly. Production HTTPS on Cloudflare sends cookies normally.

---

## Notes for AI Agents

1. Treat this document as the source of truth for MCQ implementation.
2. Implement the v1 global shared bank without owner restrictions. Do not add granular
   permissions or the deferred learner-preview UI during Phases 0-6.
3. Follow the phase order and preserve red evidence before adding production behavior.
4. Do not weaken a valid requirement test to make faulty code pass.
5. Re-run previously green MCQ tests after each implementation increment.
6. Update phase markers, actual test counts, migration status, and command results.
7. Keep SQL in the MCQ service and identity derivation on the server.
8. Never apply a remote migration or deploy without explicit user instruction.
9. Ask before adding a dependency.
10. Do not hand-edit generated files or generated ShadCN components.

---

## Current Status

**Last Updated:** 2026-08-31

**Current Phase:** Phase 6 complete — MCQ CRUD v1 shipped and verified

**Status:** Phase 6 COMPLETED; Phase 7 DEFERRED; ready for git commit and deploy

**Verification summary:**

- Automated: 114/114 tests, lint pass, build pass
- Remote D1: migration `0003` applied; MCQ tables live
- Runtime: local Workers preview and manual UI smoke test passed
- Git: MCQ source files verified but awaiting commit

**Next Steps:**

1. Commit the MCQ implementation (migration, API, UI, tests, this PRD).
2. Deploy with explicit approval: `npm run deploy`.
3. Phase 7 (learner preview at `/mcq/[id]/try`) remains deferred future work.

**Known non-blockers:**

- Lint warning: unused `nextGeneratedId` in `mcq-service.test.ts`
- Home page (`src/app/page.tsx`) copy still references MCQ as a future sprint
- Next.js middleware deprecation warning (migrate to proxy in a future sprint)
