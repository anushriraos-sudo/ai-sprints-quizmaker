Date created: 2026-08-24   
Date last modified: 2026-08-26

# User Registration & Authentication (Phase 1) - Technical PRD

## Overview/Problem

Quiz Maker will eventually let multiple teachers collaborate on a shared bank of multiple-choice questions. Before any collaboration or MCQ work can exist, the application needs to know who its users are.

This phase builds that foundation: a `users` table, a user service, REST auth endpoints (`POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`), registration and login flows, a Quiz Maker landing page at `/`, and a placeholder page that will later become the MCQ authoring experience.

**Important limitation:** This phase does not keep a user logged in across requests or page reloads. There are no sessions, cookies, or tokens. "Login" means proving credentials at that moment and redirecting to `/mcq` — not establishing an ongoing authenticated session.

---



## Hypothesis

We believe that a simple register-and-login flow with secure password hashing will give teachers a working account foundation for future MCQ and collaboration features, without the complexity of session management in the first sprint.

---



## Scope



### In Scope

- D1 database provisioning and a `users` table with migration
- User service in `src/lib/services/` with create and read (by id / email / username)
- Password hashing with Web Crypto PBKDF2 (Workers-compatible, no native modules)
- REST API route handlers under `src/app/api/auth/` for register, login, and logout
- Registration flow: form → `POST /api/auth/register` → hashed password stored → client redirect to `/mcq`
- Login flow: form → `POST /api/auth/login` → password verification → client redirect to `/mcq`
- Logout via `POST /api/auth/logout` as a redirect stub (no session to invalidate)
- Placeholder `/mcq` route with static content
- Server-side Zod validation and user-facing error handling
- Quiz Maker landing page at `/` with links to `/register` and `/login`
- Auth forms and MCQ placeholder on dedicated routes: `/register`, `/login`, `/mcq`



### Out of Scope

- Social login / OAuth
- Sessions, cookies, tokens, JWTs, access or refresh tokens, or "remember me"
- Route protection / auth middleware
- Password reset, email verification, rate limiting, or account lockout
- Roles or permissions
- Account update and delete (neither service methods nor UI)
- Any MCQ / test-bank data model or collaboration features
- Deployment to Cloudflare (manual deploy when ready; not automated in this phase)



### Cut

- **bcrypt / argon2 npm packages** — native bindings do not run on Cloudflare Workers; use Web Crypto PBKDF2 instead
- **Server Actions for auth** — the brief requires literal REST endpoints (`POST /api/auth/register`, etc.); forms call these via `fetch` from client components rather than `useActionState`
- **Personalized** `/mcq` **page** — would require passing identity across the redirect or inventing ad-hoc session state, which is explicitly out of scope
- `updated_at` **column** — no update path exists in this phase, and SQLite will not maintain it without a trigger. Add it alongside the first update feature
- **Confirm password field** — not in original requirements; cheap UX add if requested later

---



## Technical Requirements



### Database Schema

D1 is provisioned as `ai-sprints-quizmaker-db`, bound as `DB` in `wrangler.jsonc` (see Phase 0). Create the migration with `npx wrangler d1 migrations create ai-sprints-quizmaker-db create_users_table`. Applied locally and on remote D1.

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Design notes:**

- The column is `password_hash`, never `password`. **A plain-text password is never written to the database, to logs, or to any response.**
- SQLite backs each `UNIQUE` constraint with an implicit index, so no separate `CREATE UNIQUE INDEX` is needed. Adding one would create a duplicate index. Verified in Phase 1: the table has exactly three auto-indexes, one for the TEXT primary key and one per `UNIQUE` column.
- SQLite compares `TEXT` case-sensitively by default. Without `COLLATE NOCASE` the database accepts `TestUser` alongside `testuser` — confirmed by direct test in Phase 1. The collation makes each implicit `UNIQUE` index case-insensitive, so the database itself rejects case-variant duplicates.
- The application **still** lowercases `email` and `username` before every write, so stored rows stay canonical. The collation is the backstop for any code path that forgets; canonicalization is not delegated to it.
- `COLLATE NOCASE` folds ASCII `A-Z` only. Username validation restricts input to ASCII, and the application-side `toLowerCase()` is Unicode-aware, so the pair covers non-ASCII email addresses.
- All queries use prepared statements with numbered placeholders (`?1`, `?2`), per `.cursor/rules/d1.mdc`. No string concatenation of user input.
- Read results via `all()` and take `results[0]`. The project rule warns that `first()` behaves inconsistently between local and remote D1.
- A `UNIQUE` violation surfaces as an error whose message names the offending column, for example `UNIQUE constraint failed: users.username: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_UNIQUE)`. Phase 3 matches on `users.username` / `users.email` to map the violation to the right field error rather than a 500.



### API Endpoints

Implemented as **REST route handlers** under `src/app/api/auth/`. Business logic lives in `src/lib/api/auth-handlers.ts`; each route file parses the request, calls the handler, and returns `NextResponse.json(...)`.

All endpoints accept and return `application/json`. Shared error shape:

```typescript
export type AuthErrorResponse = {
  formError?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
};

export type AuthSuccessResponse = {
  user: PublicUser;
};

export type LogoutResponse = {
  redirectTo: "/login";
};
```



#### POST /api/auth/register

**Request body:**

```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "username": "janedoe",
  "email": "jane@school.edu",
  "password": "securepass123"
}
```

**Validation:** Zod schema `registerSchema` (see Validation Rules). Runs before any database or hashing work.

**Behavior:**

1. Parse JSON body; trim names, lowercase email and username
2. Check username and email availability
3. Hash the password
4. Insert via `userService.createUser`
5. Return the created `PublicUser` (no `password_hash`)

**Response:**


| Status                    | Body                                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 201 Created               | `{ "user": PublicUser }` — client navigates to `/mcq`                                                                  |
| 400 Bad Request           | `{ "fieldErrors": { "email": ["Enter a valid email address"] } }`                                                      |
| 400 Bad Request           | `{ "fieldErrors": { "email": ["That email is already registered"] } }`                                                 |
| 400 Bad Request           | `{ "fieldErrors": { "username": ["That username is taken"] } }`                                                        |
| 500 Internal Server Error | `{ "formError": "Something went wrong. Please try again." }` — log the cause server-side, never the submitted password |




#### POST /api/auth/login

**Request body:**

```json
{
  "email": "jane@school.edu",
  "password": "securepass123"
}
```

**Validation:** Zod schema `loginSchema`. Presence and type only — never apply registration strength rules to login, which would leak password policy and reject legacy values.

**Behavior:**

1. Parse JSON body; lowercase email
2. Look up the user by email
3. Verify the supplied password against the stored `password_hash`
4. Return `PublicUser` on success

**Response:**


| Status                    | Body                                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 200 OK                    | `{ "user": PublicUser }` — client navigates to `/mcq`                                                                                                         |
| 400 Bad Request           | `{ "fieldErrors": { "email": ["Email is required"] } }`                                                                                                       |
| 401 Unauthorized          | `{ "formError": "Invalid email or password" }` — identical message and comparable timing for unknown email and wrong password, to prevent account enumeration |
| 500 Internal Server Error | `{ "formError": "Something went wrong. Please try again." }`                                                                                                  |




#### POST /api/auth/logout

**Request body:** none (empty body or `{}`).

**Behavior:** There is no session, cookie, or token to invalidate in this phase, so the handler performs no server-side state change. It exists to establish the endpoint so Phase 2 can add real invalidation behind the same path.

**Response:**


| Status | Body                                                        |
| ------ | ----------------------------------------------------------- |
| 200 OK | `{ "redirectTo": "/login" }` — client navigates to `/login` |




### Password Hashing and Verification

Implemented in `src/lib/auth/password.ts` using the Web Crypto API, which is available natively on the Workers runtime. No new dependency.

**Plain-text passwords must never be stored.** The only value persisted is a derived hash. Plain text exists solely as a local variable for the duration of a single hash or verify call.


| Parameter   | Value                                                          |
| ----------- | -------------------------------------------------------------- |
| Algorithm   | PBKDF2-HMAC-SHA256                                             |
| Iterations  | **20,000** — constrained by the Workers Free plan, see below   |
| Salt        | 16 random bytes from `crypto.getRandomValues`, unique per user |
| Derived key | 32 bytes                                                       |


**The iteration count is a documented compromise, not a recommendation.** OWASP specifies 600,000 iterations for PBKDF2-HMAC-SHA256. This project targets the Workers **Free plan**, which allows 10 ms of CPU per invocation, and 600,000 iterations costs ~207 ms on the Workers runtime — 20× the entire budget. 20,000 iterations costs ~7 ms, which fits. The stored password hashes are therefore roughly 30× weaker than current guidance, and that gap is a property of the hosting plan rather than of the code. Moving to the Workers Paid plan (default 30 s CPU) would allow raising the count to 600,000 immediately; because every hash records the iteration count it was created with, existing rows keep verifying and can be upgraded on next login.

**Storage format** — a single self-describing string, so the iteration count can be raised later without breaking existing rows:

```
pbkdf2$<iterations>$<saltBase64>$<hashBase64>
```

`hashPassword(plain)` generates a fresh salt, derives the key via `crypto.subtle.deriveBits`, and returns the encoded string.

`verifyPassword(plain, stored)` parses the stored string for its iteration count and salt, re-derives a key from the supplied password using those same parameters, and compares the result to the stored key using a **constant-time** comparison. A byte-by-byte early-return comparison (including `===` on the encoded strings) leaks information through timing and must not be used. It fails closed, returning `false` for any malformed or unrecognized stored value rather than throwing.

The constant-time comparison prefers `crypto.subtle.timingSafeEqual`, a Workers extension, and falls back to a branchless loop on Node. The fallback is required, not defensive: Node does not implement `timingSafeEqual` on `crypto.subtle`, so `npm run dev` would throw on every login without it. Confirmed by direct test in Phase 2.

The module also exports `DUMMY_PASSWORD_HASH`, a syntactically valid hash that no password matches. Login verifies against it when the email is unknown, so that path pays the same PBKDF2 cost as a wrong-password attempt and does not reveal which accounts exist through response timing.

`verifyPassword` refuses any stored value claiming more than 1,000,000 iterations. Stored hashes come from our own database rather than user input, but a corrupted or tampered row could otherwise make one login request exhaust the Worker's CPU budget.

### Security Considerations


| Area                   | Requirement                                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Password storage       | Hash only. Never plain text in D1, logs, error messages, or JSON responses                                                                                                                                                     |
| Password comparison    | Constant-time; never a short-circuiting equality check                                                                                                                                                                         |
| Salt                   | Cryptographically random and unique per user; never a shared or static salt                                                                                                                                                    |
| Account enumeration    | Login returns one generic message for unknown email and wrong password alike                                                                                                                                                   |
| SQL injection          | Prepared statements with bound numbered placeholders only                                                                                                                                                                      |
| Server/client boundary | `password.ts`, `user-service.ts`, and `auth-handlers.ts` are server-only. Never import them into a `'use client'` file. Route handlers and handler modules are the boundary; client components call endpoints via `fetch` only |
| Data exposure          | Only `PublicUser` crosses back to the client. `password_hash` never leaves the service layer                                                                                                                                   |
| Logging                | Never log request bodies or any field named `password` for auth flows                                                                                                                                                          |
| Secrets                | Phase 1 introduces none. If one is added later, place it in `.dev.vars`, add an empty placeholder to `.dev.vars.example`, and use `wrangler secret put` in production                                                          |
| Transport              | HTTPS is terminated by Cloudflare in production; no application-level work needed                                                                                                                                              |


**Known accepted gap:** `/mcq` is publicly reachable because route protection requires sessions, which are out of scope. This is acceptable only while the page holds no real data. Closing it is the first task of the next sprint.

### Validation Rules

Defined as Zod schemas in `src/lib/validations/auth.ts` and applied server-side. Any client-side checking is a UX convenience only and is never the enforcement point.


| Field      | Rules                                                                   |
| ---------- | ----------------------------------------------------------------------- |
| First name | Required, non-empty after trim, max 100 chars                           |
| Last name  | Required, non-empty after trim, max 100 chars                           |
| Username   | Required, 3–30 chars, alphanumeric plus `_` and `-`, lowercased, unique |
| Email      | Required, valid format, max 254 chars, lowercased, unique               |
| Password   | Required, min 8 chars, max 200 chars                                    |


The password maximum matters: PBKDF2 cost scales with input, so an unbounded password field is a denial-of-service vector against the Workers CPU limit.

### Edge Cases


| Scenario                                              | Expected behavior                                                                                                                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Email differing only in case from an existing account | Rejected as duplicate — the app lowercases before the uniqueness check, and `COLLATE NOCASE` enforces it at the database level regardless. Verified in Phase 1                             |
| Username differing only in case                       | Rejected as duplicate — same normalization and the same collation backstop. Verified in Phase 1                                                                                            |
| Whitespace-only first or last name                    | Rejected; trim runs before the non-empty check                                                                                                                                             |
| Email or username with surrounding whitespace         | Trimmed before validation, so it succeeds rather than storing a padded value                                                                                                               |
| Both email and username already taken                 | Both field errors returned together; the form shows each on its own input                                                                                                                  |
| Two concurrent registrations for the same username    | The availability check is not atomic with the insert. The `UNIQUE` constraint is the real guard — catch the constraint violation and surface it as the duplicate field error, not as a 500 |
| Login for an email that does not exist                | Generic "Invalid email or password"; still perform a hash verification against a dummy value so the response time matches the wrong-password path                                          |
| Stored hash is malformed or from an unknown algorithm | Verification fails closed and returns the generic login error; log the malformed row id for investigation                                                                                  |
| Direct navigation to `/mcq`                           | Page renders. Not access-controlled in this phase, by design                                                                                                                               |
| Form submitted twice rapidly                          | Submit button disabled while `fetch` is in flight; the `UNIQUE` constraint backstops duplicate inserts                                                                                     |
| Malformed JSON body                                   | Route handler returns 400 with `{ "formError": "Invalid request body" }`                                                                                                                   |




### User Interface Requirements

Built with the shadcn/ui primitives already present in `src/components/ui/`: `field` (which exports `FieldSet`, `FieldGroup`, `Field`, `FieldLabel`, `FieldDescription`, and `FieldError`), `input`, `button`, and `card`. No new components need to be installed. Base UI has no `Form` component; `field` is the form primitive. Styling uses theme tokens from `src/app/globals.css` — no hard-coded colors.

#### Register (`/register`)

- Fields: full name, username, email, password
- Client component submits via `fetch("POST", "/api/auth/register", { body: JSON })`
- Field-level errors rendered through `FieldError` from the 400 response body
- Submit disabled while the request is in flight
- Link to `/login` for existing users
- On 201: client navigates to `/mcq` (e.g. `router.push("/mcq")`)



#### Login (`/login`)

- Fields: email, password
- Submits via `fetch("POST", "/api/auth/login", { body: JSON })`
- Failure shows one form-level message from the 401/400 response body, not field-specific ones for auth failure
- Link to `/register` for new users
- On 200: client navigates to `/mcq`



#### MCQ Placeholder (`/mcq`)

- Static Server Component; no data fetching or personalization
- States that MCQ features are coming in a future sprint
- Logout control calls `POST /api/auth/logout` then navigates to `/login`
- Not access-controlled — anyone can visit directly (accepted for this phase)



#### Root page (`/`)

- Quiz Maker landing page in `src/app/page.tsx` — title, brief description, and buttons linking to `/register` and `/login`
- Uses the same shadcn/ui `Card` and `Button` primitives as the auth pages
- Does not include registration/login forms inline; those live on their own routes



### Project Structure

**Files to create:**

```
migrations/
  0001_create_users_table.sql          Users table (generated by wrangler, then edited)

src/lib/
  db.ts                                getDb() wrapping getCloudflareContext
  auth/password.ts                     hashPassword, verifyPassword
  validations/auth.ts                  registerSchema, loginSchema
  services/user-service.ts             All D1 user queries
  api/auth-handlers.ts                 registerUser, loginUser, logoutUser logic
  types/user.ts                        PublicUser, UserRecord, UserRow
  types/auth-api.ts                    AuthErrorResponse, AuthSuccessResponse, LogoutResponse

src/app/api/auth/
  register/route.ts                    POST /api/auth/register
  login/route.ts                       POST /api/auth/login
  logout/route.ts                      POST /api/auth/logout

src/components/
  signup-form.tsx                    'use client' registration form
  login-form.tsx                     'use client' login form
  logout-control.tsx                 'use client' logout button for /mcq

src/app/
  page.tsx                           Quiz Maker landing page
  register/page.tsx                  Renders SignupForm
  login/page.tsx                     Renders LoginForm
  mcq/page.tsx                       Static placeholder
```

**Files to update:**


| File                 | Change                                                         |
| -------------------- | -------------------------------------------------------------- |
| `wrangler.jsonc`     | Add the `d1_databases` block with binding `DB`                 |
| `package.json`       | Add `zod`                                                      |
| `src/app/page.tsx`   | Quiz Maker landing page with links to `/register` and `/login` |
| `src/app/layout.tsx` | Updated `metadata.title` and `description` to "Quiz Maker"     |
| `AGENTS.md`          | Updated Project and Stack sections for D1 and Zod              |


**Generated — do not hand-edit:** `cloudflare-env.d.ts` is refreshed by `npm run cf-typegen` after the D1 binding is added.

---



## Implementation Phases



### Phase 0: D1 Provisioning - COMPLETED

**Objective:** D1 database created, bound, and typed.

**Tasks:**

1. `npx wrangler d1 create ai-sprints-quizmaker-db` — created in region APAC, `database_id` `b6972999-f867-4a46-a6d1-192fb865303a`
2. ~~Add the~~ `d1_databases` ~~block to~~ `wrangler.jsonc` ~~with binding~~ `DB` — Wrangler suggested the binding name `ai_sprints_quizmaker_db`; overridden to `DB` per `.cursor/rules/d1.mdc`
3. `npm run cf-typegen` — `cloudflare-env.d.ts` now declares `DB: D1Database`
4. ~~Install~~ `zod` — approved by the user; resolved to `zod@^4.4.3`

**Deliverables:**

- D1 binding in `wrangler.jsonc`, `env.DB` typed in `cloudflare-env.d.ts`, `zod` in `dependencies`

**Note for Phase 4:** the installed version is **Zod 4**, not 3. Top-level string formats replace the chained methods — use `z.email()` rather than `z.string().email()`, which is deprecated in v4.

### Phase 1: Database Schema - COMPLETED

**Objective:** `users` table exists locally via migration.

**Tasks:**

1. `npx wrangler d1 migrations create ai-sprints-quizmaker-db create_users_table` — Wrangler created the `migrations/` directory, which did not previously exist
2. ~~Write the schema above into the generated file~~
3. ~~Apply locally:~~ `npx wrangler d1 migrations apply ai-sprints-quizmaker-db --local` — applied with the dev server running; no file-lock conflict on Windows

**Deliverables:**

- `migrations/0001_create_users_table.sql`, applied locally and on remote D1

**Verified against the local database:**

- Table structure matches the migration exactly; three auto-indexes present, no redundant explicit index
- `id` defaults to a 32-character random hex string; `created_at` populates automatically
- Duplicate `username` and duplicate `email` are both rejected
- Case-variant duplicates (`TestUser` vs `testuser`, `TEST@EXAMPLE.COM` vs `test@example.com`) are rejected — this failed before `COLLATE NOCASE` was added and passes after
- Constraint errors name the offending column, so Phase 3 can map them to field errors
- Test rows removed; the table is empty

**Note for Phase 3:** a multi-statement `wrangler d1 execute` rolls back entirely if any statement fails, so partial writes were not observed during testing.

### Phase 2: Password Hashing Module - COMPLETED

**Objective:** `src/lib/auth/password.ts` with `hashPassword` and `verifyPassword`.

**Tasks:**

1. ~~Implement PBKDF2-HMAC-SHA256 via~~ `crypto.subtle.deriveBits`
2. ~~Encode as~~ `pbkdf2$<iterations>$<saltBase64>$<hashBase64>`
3. ~~Implement constant-time comparison in~~ `verifyPassword`
4. ~~Benchmark the iteration count under~~ `npm run preview` — **exceeds the Free plan limit; see the risk below**
5. ~~Verify that two hashes of the same password differ and that both verify~~

**Deliverables:**

- `src/lib/auth/password.ts`, exporting `hashPassword`, `verifyPassword`, and `DUMMY_PASSWORD_HASH`

**Verified in both runtimes** via a temporary diagnostic route, since a module this security-sensitive should not be accepted on inspection alone. The route was deleted afterwards.


| Check                                                   | Node (`npm run dev`) | Workers (`npm run preview`) |
| ------------------------------------------------------- | -------------------- | --------------------------- |
| Two hashes of one password differ (random salt)         | pass                 | pass                        |
| Both hashes verify against the original password        | pass                 | pass                        |
| Wrong password, wrong case, and empty password rejected | pass                 | pass                        |
| `DUMMY_PASSWORD_HASH` never verifies                    | pass                 | pass                        |
| 11 malformed stored values fail closed without throwing | pass                 | pass                        |
| Native `crypto.subtle.timingSafeEqual` present          | **no**               | **yes**                     |


The malformed cases covered: empty string, plain text, too few and too many `$` parts, unknown algorithm label, non-numeric, zero, negative, and absurd iteration counts, invalid base64, and a truncated hash.

**Runtime difference worth remembering:** `crypto.subtle.timingSafeEqual` is a Workers extension that Node does not implement. Because `npm run dev` runs on Node, calling it unconditionally would have thrown on every login in development while working in production. `constantTimeEqual` therefore prefers the native function and falls back to a branchless loop.

**Benchmark (Workers runtime, 10 samples after a warm-up):** at the original 100,000 iterations, min 32 ms / median 34 ms / max 36 ms per hash. This exceeded the Free plan's 10 ms CPU budget, so the count was lowered to **20,000** (~7 ms median). Registration and login each cost one hash. See the Risks section for the full comparison and the Argon2id evaluation.

**Re-verified on the Workers runtime after the change to 20,000 iterations:**

- The emitted hash declares `20000`, and `DUMMY_PASSWORD_HASH` declares the same count, so the unknown-email path costs the same as a real verification
- A hash genuinely minted at 100,000 iterations — generated independently with Node's `pbkdf2` rather than by this module — still verifies, and still rejects a wrong password. This proves the self-describing format survives a change to `ITERATIONS`, which is what makes a later upgrade to 600,000 a one-constant change with no data migration
- Real-hash and dummy-hash verification times track each other. An apparent 3 ms gap in one sample flipped direction across four repeat runs, confirming it was measurement noise rather than a timing leak

**Additions beyond the original task list:**

- `MAX_ITERATIONS = 1_000_000` guard, so a corrupted row claiming a huge cost cannot exhaust the CPU budget on a single login
- `DUMMY_PASSWORD_HASH`, which login uses when the email is unknown so the request still pays full PBKDF2 cost and does not leak account existence through timing. This supports an edge case the PRD already required but had no mechanism for

**Also fixed:** `eslint.config.mjs` did not ignore `.wrangler/`**. Running** `npm run preview` **generates bundles there, after which** `npm run lint` **reported 4,756 problems in generated code.** `.open-next/` was already ignored; `.wrangler/`** now is too.

### Phase 3: User Service - COMPLETED

**Objective:** `src/lib/services/user-service.ts` centralizing all user queries.

**Tasks:**

1. ~~Implement~~ `getDb()` ~~in~~ `src/lib/db.ts`
2. ~~Implement~~ `createUser`~~,~~ `getUserById`~~,~~ `getUserByEmail`~~,~~ `getUserByUsername`
3. ~~Map snake_case rows to camelCase types; export~~ `PublicUser` ~~(never includes~~ `password_hash`~~)~~
4. ~~Handle the~~ `UNIQUE` ~~constraint violation as a typed duplicate result, not a thrown 500~~

**Deliverables:**

- `src/lib/db.ts`, `src/lib/services/user-service.ts`, `src/lib/types/user.ts`

**Verified via a temporary diagnostic route** (deleted afterwards), since D1 access should not be accepted on inspection alone:


| Check                                                                    | Result |
| ------------------------------------------------------------------------ | ------ |
| `createUser` inserts and returns `PublicUser` without `passwordHash`     | pass   |
| `getUserById`, `getUserByEmail`, `getUserByUsername` return the same row | pass   |
| Email lookup is case-insensitive (`COLLATE NOCASE`)                      | pass   |
| Duplicate username maps to `{ ok: false, duplicate: "username" }`        | pass   |
| Case-variant duplicate email maps to `{ ok: false, duplicate: "email" }` | pass   |




### Phase 4: Validation & API Route Handlers - COMPLETED

**Objective:** REST endpoints wired to the user service with Zod validation.

**Tasks:**

1. ~~Write~~ `registerSchema` ~~and~~ `loginSchema` ~~in~~ `src/lib/validations/auth.ts`
2. ~~Implement handler functions in~~ `src/lib/api/auth-handlers.ts`
3. ~~Create route handlers at~~ `src/app/api/auth/register/route.ts`~~,~~ `login/route.ts`~~,~~ `logout/route.ts`
4. ~~Each route parses JSON, validates with Zod, calls the handler, and returns the appropriate status code~~

**Deliverables:**

- `src/lib/validations/auth.ts`, `src/lib/api/auth-handlers.ts`, `src/lib/types/auth-api.ts`
- `src/app/api/auth/register/route.ts`, `login/route.ts`, `logout/route.ts`

**Verified against the local dev server** (D1 via `initOpenNextCloudflareForDev`):


| Check                                                                               | Result |
| ----------------------------------------------------------------------------------- | ------ |
| `POST /api/auth/register` returns 201 with `PublicUser` (no `passwordHash`)         | pass   |
| Duplicate username / email each return 400 with the correct field error             | pass   |
| Both username and email taken together return both field errors                     | pass   |
| Case-variant duplicate email rejected                                               | pass   |
| Invalid email format returns `"Enter a valid email address"`                        | pass   |
| Malformed JSON returns `{ formError: "Invalid request body" }`                      | pass   |
| `POST /api/auth/login` returns 200 with `PublicUser` on valid credentials           | pass   |
| Unknown email and wrong password both return 401 with `"Invalid email or password"` | pass   |
| `POST /api/auth/logout` returns 200 with `{ redirectTo: "/login" }`                 | pass   |




### Phase 5: Frontend Pages - COMPLETED

**Objective:** `/`, `/register`, `/login`, and `/mcq` built and verified.

**Tasks:**

1. ~~Build the two forms with the existing UI primitives; submit via~~ `fetch` ~~to the auth endpoints~~
2. ~~Build the~~ `/mcq` ~~placeholder and Quiz Maker landing page at~~ `/`
3. ~~Walk the manual checklist under~~ `npm run preview` ~~against local D1~~ — deferred; pages and API verified on the local dev server with D1 via `initOpenNextCloudflareForDev`
4. ~~Run~~ `npm run lint` ~~and~~ `npm run build` — re-verified 2026-08-25, both pass (exit 0)

**Deliverables:**

- Page routes, passing lint and build

**Built from shadcn blocks**, adapted to the PRD:

- `src/components/signup-form.tsx` — full name, username, email, password; no confirm-password or OAuth
- `src/components/login-form.tsx` — email and password; no forgot-password or OAuth
- `src/components/logout-control.tsx` — client logout button for `/mcq`
- `src/app/page.tsx` — Quiz Maker landing with Create account / Sign in links
- `src/app/register/page.tsx`, `src/app/login/page.tsx`, `src/app/mcq/page.tsx`
- `src/app/layout.tsx` metadata updated to "Quiz Maker"

**Verified on the local dev server:**


| Check                                                                      | Result             |
| -------------------------------------------------------------------------- | ------------------ |
| `/`, `/register`, `/login`, `/mcq` all return 200                          | pass               |
| Register form posts to `/api/auth/register` and navigates to `/mcq` on 201 | pass (Phase 4 API) |
| Login form posts to `/api/auth/login` and navigates to `/mcq` on 200       | pass (Phase 4 API) |
| Field errors from 400 responses render via `FieldError`                    | pass (Phase 4 API) |
| `npm run lint` and `npm run build`                                         | pass               |




### Phase 6 (Optional): Test Harness - COMPLETED

**Objective:** Vitest covering the password module, validation, user service, auth handlers, route handlers, and client auth forms.

The user approved the test stack on 2026-08-27. Vitest uses jsdom for client component tests and Vite's native `tsconfigPaths` resolution for the `@/` alias. `vite-tsconfig-paths` was initially approved but is not retained because current Vite provides that behavior natively.

**Tasks:**

1. ~~Install~~ `vitest`~~,~~ `@vitejs/plugin-react`~~,~~ `@testing-library/react`~~, and~~ `jsdom`~~; add~~ `vitest.config.mts`~~,~~ `test`~~, and~~ `test:watch` ~~scripts~~
2. ~~Test~~ `password.ts`~~: correct password verifies, wrong password fails, same input yields different hashes, malformed stored hash fails closed~~
3. ~~Test~~ `user-service.ts` ~~with~~ `getCloudflareContext` ~~mocked and a fake~~ `DB`
4. ~~Test auth business logic and route handlers with dependencies mocked at module boundaries~~
5. ~~Test registration, login error rendering, and logout navigation through the client forms~~

**Deliverables:**

- `vitest.config.mts` and six test files covering 33 tests
- `npm test` and `npm run test:watch`

**TDD verification:** characterization tests were written before any application behavior was changed. The existing implementation passed the initial suite, so no production-code correction was needed. The final suite has 6 passing files and 33 passing tests. `npm run lint` and `npm run build` also pass.

---



## Technical Implementation Details



### Key Files

- `wrangler.jsonc` — D1 binding configuration
- `migrations/0001_create_users_table.sql` — users table schema
- `src/lib/db.ts` — resolves `env.DB` through `getCloudflareContext()`
- `src/lib/auth/password.ts` — hash and verify
- `src/lib/services/user-service.ts` — every D1 user query
- `src/lib/validations/auth.ts` — Zod schemas
- `src/lib/api/auth-handlers.ts` — shared handler logic
- `src/app/api/auth/register/route.ts` — `POST /api/auth/register`
- `src/app/api/auth/login/route.ts` — `POST /api/auth/login`
- `src/app/api/auth/logout/route.ts` — `POST /api/auth/logout`
- `src/app/page.tsx`, `src/app/register/page.tsx`, `src/app/login/page.tsx`, `src/app/mcq/page.tsx` — routes
- `src/components/signup-form.tsx`, `login-form.tsx`, `logout-control.tsx`



### Implementation Patterns

```typescript
// src/lib/db.ts — the only place the binding is resolved
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function getDb(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  return env.DB;
}
```

```typescript
// Numbered placeholders, and all() rather than first(), per .cursor/rules/d1.mdc
const { results } = await db
  .prepare("SELECT id, first_name, last_name, username, email, password_hash FROM users WHERE email = ?1")
  .bind(email)
  .all<UserRow>();
const row = results[0];
```

```typescript
// src/app/api/auth/register/route.ts — thin route; logic in auth-handlers.ts
import { NextResponse } from "next/server";
import { registerSchema } from "@/lib/validations/auth";
import { registerUser } from "@/lib/api/auth-handlers";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const result = await registerUser(parsed.data);
  if (result.error) {
    return NextResponse.json(result.error, { status: result.status });
  }
  return NextResponse.json({ user: result.user }, { status: 201 });
}
```

```typescript
// Client form — fetch to REST endpoint, then navigate on success
const res = await fetch("/api/auth/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ firstName, lastName, username, email, password }),
});
if (res.ok) {
  router.push("/mcq");
} else {
  const data = await res.json();
  setFieldErrors(data.fieldErrors ?? {});
  setFormError(data.formError);
}
```

```typescript
// Password hashing — Web Crypto PBKDF2 (Workers-native, no dependency)
export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePbkdf2(plain, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}
```

```typescript
// PublicUser — the only shape that leaves the service layer toward the client
export type PublicUser = {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  createdAt: string;
};
```



### Important Notes

- Never log plaintext passwords, and never return `password_hash` from the service to a component
- Login uses email plus password; `username` is stored and unique but is not a login identifier in this phase
- `/mcq` is unauthenticated by design — acceptable only while it holds no real data
- Verify password hashing under `npm run preview`, not `npm run dev`. `next dev` runs on Node and will not surface the Workers CPU limit
- `initOpenNextCloudflareForDev()` runs only during `next dev` (see `next.config.ts`) — not during `next build`
- Do not apply migrations to remote D1, and do not run `npm run deploy`, without explicit user approval
- Do not create a `tailwind.config.ts`; Tailwind v4 is configured in `src/app/globals.css`

---



## Acceptance Criteria

- [x] D1 database exists, bound as `DB` in `wrangler.jsonc`; `cloudflare-env.d.ts` regenerated via `npm run cf-typegen`
- [x] Migration creates the `users` table with unique `username` and `email`; applied locally and remotely
- [x] User service centralizes all D1 access and never returns `password_hash` in a public user object
- [x] Every query uses prepared statements with bound numbered placeholders
- [x] Passwords are stored only as PBKDF2 hashes with a per-user random salt; no plain-text password appears in the database, logs, or any response
- [x] `verifyPassword` uses a constant-time comparison
- [x] Iteration count benchmarked under `npm run preview` and within the Workers CPU limit (20,000 iterations)
- [x] `POST /api/auth/register` creates a user and returns 201 with `PublicUser`; client navigates to `/mcq`
- [x] `POST /api/auth/register` with invalid input or duplicates returns 400 with field errors; no row created
- [x] Duplicate email and duplicate username are each reported on the relevant field via 400, not as a 500
- [x] Email and username differing only in case are rejected as duplicates
- [x] `POST /api/auth/login` with valid credentials returns 200 with `PublicUser`; client navigates to `/mcq`
- [x] `POST /api/auth/login` with unknown email or wrong password returns 401 with `"Invalid email or password"`, with comparable response timing
- [x] `POST /api/auth/logout` returns 200 with `{ "redirectTo": "/login" }`; documented as a stub with no session invalidation
- [x] `/mcq` shows a generic placeholder and is reachable without authentication
- [x] All route handler input is validated with a Zod schema before any database or hashing work
- [x] No server-only module is imported into a `'use client'` file
- [x] `/` shows the Quiz Maker landing page with links to `/register` and `/login`
- [x] `npm run lint` and `npm run build` pass (verified 2026-08-27)
- [x] Registration, login, rejection paths, and logout verified under `npm run preview` on the Workers runtime (2026-08-27)
- [x] (Phase 6 approved) `npm run test` passes: 6 files, 33 tests

---



## Success Metrics


| Metric                  | Target                                                          | How Measured                                |
| ----------------------- | --------------------------------------------------------------- | ------------------------------------------- |
| Registration completion | User can register and reach `/mcq`                              | Manual test under `npm run preview`         |
| Login verification      | Correct credentials redirect; wrong ones show the generic error | Manual test under `npm run preview`         |
| Password security       | No plaintext stored; hash verifies correctly                    | Inspect the local D1 row; verify round-trip |
| Hashing performance     | Register and login complete within the Workers CPU limit        | Timing under `npm run preview`              |
| Test coverage           | Password module and user service have passing tests             | `npm run test` green (if Phase 6 approved)  |


---



## Dependencies



### External Dependencies

- Cloudflare D1 — SQLite database for user storage, bound as `DB`
- Web Crypto API — PBKDF2 password hashing, built into the Workers runtime



### Internal Dependencies

- `@opennextjs/cloudflare` — `getCloudflareContext()` for binding access (already installed)
- shadcn/ui `field`, `input`, `button`, `card` — form UI (already installed)
- Next.js App Router route handlers and `NextResponse` — REST API layer (already available)
- React client components with `fetch` and `useRouter` — form submission and navigation (already available)



### New Dependencies


| Package                                                             | Purpose                        | Status                                                                                               |
| ------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `zod`                                                               | Route handler input validation | **Installed in Phase 0** at `^4.4.3`. Required by `.cursor/rules/nextjs.mdc` and `.cursor/BUGBOT.md` |
| `vitest`, `@vitejs/plugin-react`, `@testing-library/react`, `jsdom` | Automated testing              | **Installed in Phase 6**; 6 files and 33 tests pass                                                  |


No new dependency is needed for password hashing or for UI.

### Environment Variables

None introduced in this phase. `.dev.vars.example` needs no change.

---



## Risks and Mitigation



### Technical Risks

- **Risk (RESOLVED for now, with an accepted weakness):** the **Workers Free plan allows 10 ms of CPU per invocation**, which is far below what any current password-hashing guidance assumes. Measured on the Workers runtime:

  | Configuration                | Median | Fits 10 ms? |
  | ---------------------------- | ------ | ----------- |
  | PBKDF2 t=20,000 (**chosen**) | ~7 ms  | yes         |
  | PBKDF2 t=100,000 (original)  | 33 ms  | no          |
  | PBKDF2 t=600,000 (OWASP)     | 207 ms | no          |

- **Decision:** iterations lowered to 20,000. This is the strongest setting that fits the Free plan, and it is still roughly 30× below OWASP guidance. **The residual weakness is accepted and is a plan limitation, not a code defect.** Raise to 600,000 on moving to the Paid plan; the self-describing hash format makes that a one-constant change with no data migration.
- **Margin is thin.** At 20,000 iterations a hash costs ~7 ms median and up to ~9–11 ms in the worst samples observed, against a 10 ms budget that must also cover framework and route overhead. D1 queries are I/O and do not count toward CPU, so the hash dominates. The measurements come from local `workerd` on a loaded Windows machine and are probably pessimistic relative to Cloudflare's hardware, but if a deployed Worker reports CPU-limit errors, lowering to ~15,000 is the first lever.
- **Evaluated and rejected: WASM Argon2id.** Attempted empirically with `hash-wasm`, which **cannot run on Workers at all**: every call failed with `CompileError: WebAssembly.compile(): Wasm code generation disallowed by embedder`. Workers forbids compiling WebAssembly from bytes at runtime and requires `.wasm` to be imported as a static module at build time; `hash-wasm` inlines its WASM as base64 and compiles on first use. Packages such as `argon2-wasm-edge` and `cfw-argon2id` exist precisely to work around this, but they need `.wasm` import wiring through Turbopack and OpenNext. Even if that were built, the ceiling does not move: OWASP's *minimum* Argon2id profile (m=19 MiB, t=2) costs tens of milliseconds, the standard profile (m=64 MiB, t=3) costs 250–400 ms, and fitting 10 ms would mean roughly 1–2 MiB of memory — ten to twenty times below the minimum, discarding most of the memory-hardness that motivates Argon2id. `hash-wasm` was uninstalled. Argon2id is worth revisiting **only on the Paid plan**, where it can be given real parameters.
- **Risk:** No session means `/mcq` is publicly accessible
- **Mitigation:** Accepted for this phase since the page holds no data; session management is the first item of the next sprint
- **Risk:** Uniqueness check and insert are not atomic, so concurrent registrations could race
- **Mitigation:** The `UNIQUE` constraint is the authority; catch the violation and map it to the duplicate field error rather than a 500
- **Risk:** Account enumeration via specific duplicate errors at registration
- **Mitigation:** Specific field errors are kept for usability on a low-sensitivity teaching tool. Login, where it matters more, uses a single generic message. Revisit if hardening is required



### User Experience Risks

- **Risk:** Users expect to stay logged in after closing the browser
- **Mitigation:** Document clearly that sessions are out of scope; plan session handling as the immediate follow-up
- **Risk:** A logout button implies signing out of something persistent
- **Mitigation:** Treat it as a redirect stub and label it honestly in the UI
- **Risk:** The `/mcq` placeholder reads as a broken page rather than an intentional stub
- **Mitigation:** State plainly that MCQ features arrive in a future sprint

---



## Troubleshooting Guide



### `npm run build` crashes on exit after reporting success (Windows) — RESOLVED

**Problem:** The build compiled successfully but aborted on exit with
`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 94`
and exit code `-1073740791`. Observed on Node v26.3.1 on Windows before the fix.

**Cause:** `initOpenNextCloudflareForDev()` was called unconditionally in `next.config.ts`, starting workerd during `next build` and leaving open handles that failed to close cleanly on Windows.

**Solution:** Guard the call so it runs only during `next dev` (`NEXT_PHASE === PHASE_DEVELOPMENT_SERVER` or `process.argv.includes("dev")`). After this change, `npm run build` exits 0 consistently.

**Code Reference:** `next.config.ts:14-26`

### `npm run preview` fails with `EPERM ... rm '.open-next'` (Windows)

**Problem:** The OpenNext build aborts immediately while clearing its output directory:
`Error: EPERM, Permission denied: ...\.open-next`, or `.open-next\assets - The process cannot access the file because it is being used by another process`.

**Cause:** Either `npm run dev` or a previous `npm run preview` is still running.
Both can start `workerd`, which serves files from `.open-next` and keeps Windows file
handles open. A subsequent OpenNext build begins by deleting and recreating that same
directory, so Windows rejects the deletion with `EPERM`.

**Solution:** Stop every dev/preview process for this project before starting another
OpenNext build, preview, or deploy. Normally `Ctrl+C` in the terminal running the server
is sufficient. If an orphaned preview remains, terminate that preview's process tree and
retry the build. Do not delete `.open-next` while a dev/preview process is still running;
it may immediately reacquire the lock. WSL is the preferred fallback because OpenNext
does not fully support native Windows.

### `npm run lint` reports thousands of problems in generated code

**Problem:** After running `npm run preview` for the first time, `npm run lint` fails with
several thousand errors and warnings in files under `.wrangler\tmp\`.

**Cause:** `eslint.config.mjs` ignored `.open-next/`** but not `.wrangler/`**. The
directory does not exist until a preview or deploy runs, so the gap is invisible until then.

**Solution:** Fixed in Phase 2 by adding `.wrangler/`** to the `ignores` list.

**Code Reference:** `eslint.config.mjs:8-17`

---



## Next Sprint

Deliberately left for the phase that follows:

- **Session management** — the blocking prerequisite for everything below. Establish and persist authenticated state across requests
- **Route protection** — gate `/mcq` and every future MCQ route behind that session
- **Real logout** — invalidate session state rather than merely redirecting
- **Identity on the page** — show the signed-in teacher's name once identity survives a redirect
- **MCQ data model and CRUD** — the question bank this phase exists to support
- **Multi-teacher collaboration** — shared banks, ownership, and permissions
- **Account management** — update and delete user, password reset, email verification
- **Abuse protection** — rate limiting and account lockout on the login path

---



## Notes for AI Agents

When working with this PRD:

1. Start by reading Overview and Hypothesis to understand intent
2. Use Scope (In/Out/Cut) to determine boundaries — do not build out-of-scope items
3. Update phase status markers as work progresses
4. Add implementation details under "Technical Implementation Details" as code is written
5. Mark acceptance criteria as complete when features work
6. Add troubleshooting entries when bugs are found and fixed
7. Remote D1 migrations require explicit user approval per project rules; `0001` was applied to remote before deploy
8. Do not deploy unless explicitly asked
9. Ask before adding dependencies (`zod`, `vitest`, etc.)
10. Keep `AGENTS.md` current as the stack changes. Its Project and Stack sections were updated in Phase 0 to record D1 and Zod

**Open questions (decided during implementation):**

- **Login by email only** — yes; username stored but not used for login
- **Duplicate-field errors at registration** — yes; specific field errors for usability

**Still open:**

- **Add a "confirm password" field to the registration form?**
- **Phase 6 (Vitest)** — approved and completed on 2026-08-27

---



## Current Status

**Last Updated:** 2026-08-27
**Current Phase:** Phase 6 complete — auth sprint implementation and test harness done
**Status:** Phases 0–6 COMPLETED
**Repository:** Auth implementation and Phase 6 test harness merged to `main` through PR #4
**Database:** Migration `0001_create_users_table.sql` applied locally and on remote D1
**Build:** `npm test` (33 tests), `npm run lint`, `npm run build`, OpenNext build, Wrangler dry-run, and Worker startup check pass (verified 2026-08-27)
**Next Steps:** Sprint 1 acceptance criteria are complete; session-based authentication remains intentionally deferred to the next sprint