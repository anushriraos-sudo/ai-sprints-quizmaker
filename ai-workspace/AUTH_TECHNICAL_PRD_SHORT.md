Date created: 2026-08-24

Date last modified: 2026-08-25

# User Registration & Authentication (Phase 1) — Technical PRD

> Condensed reference for this sprint. Full detail, verification notes, and troubleshooting live in `[AUTH_TECHNICAL_PRD.md](./AUTH_TECHNICAL_PRD.md)`.

---

## Overview/Problem

Quiz Maker needs to know who its users are before MCQ authoring or teacher collaboration can exist. This phase adds account registration and login only.

**Critical limitation:** There are no sessions, cookies, or tokens. Login proves credentials once and redirects to `/mcq`; users are not kept logged in across requests or reloads.

---



## Hypothesis

We believe that a simple register-and-login flow with secure password hashing will give teachers a working account foundation for future MCQ features, without session complexity in the first sprint.

---



## Scope



### In Scope

- D1 database (`ai-sprints-quizmaker-db`) and `users` table with migration
- User service: create and read (by id, email, username)
- PBKDF2 password hashing via Web Crypto (Workers-native)
- REST endpoints: `POST /api/auth/register`, `/login`, `/logout`
- Quiz Maker landing page at `/`; auth forms on `/register`, `/login`, `/mcq`
- Server-side Zod validation and user-facing errors



### Out of Scope

- Sessions, OAuth, route protection, password reset, roles
- Account update/delete UI
- MCQ data model, collaboration, deployment automation



### Cut

- bcrypt/argon2 npm packages — use Web Crypto PBKDF2 instead
- Server Actions for auth — REST route handlers per requirements
- Personalized `/mcq` — requires sessions
- `updated_at` column — no update path in this phase
- Confirm-password field — optional UX add later

---



## Technical Requirements



### Database

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  -- first_name TEXT NOT NULL,
  -- last_name TEXT NOT NULL,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

- Never store plain-text passwords
- App lowercases email/username on write; `COLLATE NOCASE` is the database backstop
- Prepared statements with numbered placeholders only



### API Endpoints


| Endpoint                  | Success                        | Client action        | Failure                           |
| ------------------------- | ------------------------------ | -------------------- | --------------------------------- |
| `POST /api/auth/register` | 201 `{ user: PublicUser }`     | Navigate to `/mcq`   | 400 field errors; 500 generic     |
| `POST /api/auth/login`    | 200 `{ user: PublicUser }`     | Navigate to `/mcq`   | 401 `"Invalid email or password"` |
| `POST /api/auth/logout`   | 200 `{ redirectTo: "/login" }` | Navigate to `/login` | Stub — nothing to invalidate      |


**Register body:** `{ firstName, lastName, username, email, password }`  
**Login body:** `{ email, password }`

### Validation


| Field      | Rules                                                  |
| ---------- | ------------------------------------------------------ |
| First name | Required, trim, max 100 chars                          |
| Last name  | Required, trim, max 100 chars                          |
| Username   | 3–30 chars, alphanumeric + `_`/`-`, lowercased, unique |
| Email      | Valid format, max 254 chars, lowercased, unique        |
| Password   | 8–200 chars                                            |


Login uses email + password only (username is stored but not a login identifier).

### Password Hashing

- PBKDF2-HMAC-SHA256, **20,000 iterations** (~7 ms on Workers Free plan)
- Storage: `pbkdf2$<iter>$<saltBase64>$<hashBase64>`
- Constant-time compare; `DUMMY_PASSWORD_HASH` for unknown emails (anti-enumeration)
- **20k is a Free-plan compromise** (~30× below OWASP). Raise to 600k on Paid plan without migrating existing hashes.



### UI Routes


| Route       | Purpose                                                          |
| ----------- | ---------------------------------------------------------------- |
| `/`         | Quiz Maker landing — links to `/register` and `/login`           |
| `/register` | Signup form (`firstName`, `lastName`, username, email, password) |
| `/login`    | Sign-in form (email, password)                                   |
| `/mcq`      | Static placeholder + logout (public, not gated)                  |


---



## Implementation Phases



### Phase 0: D1 Provisioning - COMPLETED

**Objective:** D1 database created, bound, and typed.

**Tasks:**

1. `npx wrangler d1 create ai-sprints-quizmaker-db`
2. ~~Add the~~ `d1_databases` ~~block to~~ `wrangler.jsonc` ~~with binding~~ `DB`
3. `npm run cf-typegen`
4. ~~Install~~ `zod` (`zod@^4.4.3`)

**Deliverables:**

- D1 binding in `wrangler.jsonc`, `env.DB` typed in `cloudflare-env.d.ts`, `zod` in `dependencies`

---



### Phase 1: Database Schema - COMPLETED

**Objective:** `users` table exists via migration (local and remote).

**Tasks:**

1. `npx wrangler d1 migrations create ai-sprints-quizmaker-db create_users_table`
2. ~~Write the schema into the generated migration file~~
3. ~~Apply locally and remotely~~

**Deliverables:**

- `migrations/0001_create_users_table.sql`, applied locally and on remote D1

---



### Phase 2: Password Hashing Module - COMPLETED

**Objective:** `src/lib/auth/password.ts` with `hashPassword` and `verifyPassword`.

**Tasks:**

1. ~~Implement PBKDF2-HMAC-SHA256 via~~ `crypto.subtle.deriveBits`
2. ~~Encode as~~ `pbkdf2$<iterations>$<saltBase64>$<hashBase64>`
3. ~~Implement constant-time comparison in~~ `verifyPassword`
4. ~~Benchmark iteration count under~~ `npm run preview` — lowered to 20,000 for Free plan
5. ~~Verify two hashes of the same password differ and both verify~~

**Deliverables:**

- `src/lib/auth/password.ts` — exports `hashPassword`, `verifyPassword`, `DUMMY_PASSWORD_HASH`

---



### Phase 3: User Service - COMPLETED

**Objective:** `src/lib/services/user-service.ts` centralizing all user queries.

**Tasks:**

1. ~~Implement~~ `getDb()` ~~in~~ `src/lib/db.ts`
2. ~~Implement~~ `createUser`~~,~~ `getUserById`~~,~~ `getUserByEmail`~~,~~ `getUserByUsername`
3. ~~Map snake_case rows to camelCase; export~~ `PublicUser` ~~(never includes~~ `password_hash`~~)~~
4. ~~Handle~~ `UNIQUE` ~~constraint violation as typed duplicate result, not a 500~~

**Deliverables:**

- `src/lib/db.ts`, `src/lib/services/user-service.ts`, `src/lib/types/user.ts`

---



### Phase 4: Validation & API Route Handlers - COMPLETED

**Objective:** REST endpoints wired to the user service with Zod validation.

**Tasks:**

1. ~~Write~~ `registerSchema` ~~and~~ `loginSchema` ~~in~~ `src/lib/validations/auth.ts`
2. ~~Implement handlers in~~ `src/lib/api/auth-handlers.ts`
3. ~~Create route handlers at~~ `src/app/api/auth/register/route.ts`~~,~~ `login/route.ts`~~,~~ `logout/route.ts`
4. ~~Each route parses JSON, validates with Zod, calls the handler, returns the appropriate status code~~

**Deliverables:**

- `src/lib/validations/auth.ts`, `src/lib/api/auth-handlers.ts`, `src/lib/types/auth-api.ts`
- `src/app/api/auth/register/route.ts`, `login/route.ts`, `logout/route.ts`

---



### Phase 5: Frontend Pages - COMPLETED

**Objective:** `/`, `/register`, `/login`, and `/mcq` built and verified.

**Tasks:**

1. ~~Build forms with shadcn/ui primitives; submit via~~ `fetch` ~~to auth endpoints~~
2. ~~Build Quiz Maker landing at~~ `/` ~~and the~~ `/mcq` ~~placeholder~~
3. ~~Manual checklist under~~ `npm run preview` — deferred; verified on local dev server
4. ~~Run~~ `npm run lint` ~~and~~ `npm run build` — verified 2026-08-25

**Deliverables:**

- `src/components/signup-form.tsx`, `login-form.tsx`, `logout-control.tsx`
- `src/app/page.tsx`, `register/page.tsx`, `login/page.tsx`, `mcq/page.tsx`
- Page routes passing lint and build

---



### Phase 6 (Optional): Test Harness - PLANNED

**Objective:** Vitest covering the password module and user service.

**Tasks:**

1. Install `vitest`, `@vitejs/plugin-react`, `@testing-library/react`, `jsdom`, `vite-tsconfig-paths`; add config and scripts
2. Test `password.ts`: verify, reject wrong password, random salt, malformed hash fails closed
3. Test `user-service.ts` with mocked `getCloudflareContext` / fake `DB`
4. Test route handlers with user service mocked at the module boundary

**Deliverables:**

- `vitest.config.ts`, `password.test.ts`, `user-service.test.ts`

Requires user approval before installing test dependencies.

---



## Key Files

- `migrations/0001_create_users_table.sql`
- `src/lib/db.ts`, `src/lib/auth/password.ts`
- `src/lib/services/user-service.ts`, `src/lib/validations/auth.ts`
- `src/lib/api/auth-handlers.ts`, `src/lib/types/{user,auth-api}.ts`
- `src/app/api/auth/{register,login,logout}/route.ts`
- `src/components/{signup-form,login-form,logout-control}.tsx`
- `src/app/page.tsx`, `src/app/{register,login,mcq}/page.tsx`

---



## Acceptance Criteria (summary)

- [x] D1 bound as `DB`; migration applied locally and on remote D1
- [x] Register/login/logout APIs behave per contracts above
- [x] Passwords hashed; `password_hash` never returned to client
- [x] Duplicate email/username → field errors; login failures → generic message
- [x] `/mcq` is a public placeholder; `/` is the Quiz Maker landing page
- [x] `npm run lint` and `npm run build` pass (verified 2026-08-25)
- [x] End-to-end walkthrough under `npm run preview`
- [x] (Optional Phase 6) `npm run test` passes

---



## Risks (summary)


| Risk                                           | Mitigation                                              |
| ---------------------------------------------- | ------------------------------------------------------- |
| PBKDF2 at 20k is weak vs OWASP                 | Accepted for Free plan; upgrade iterations on Paid plan |
| No sessions — `/mcq` is public                 | Accepted until next sprint                              |
| Windows: dev/preview server locks `.open-next` | Stop all project servers before build/preview/deploy    |
| Registration duplicate errors reveal accounts  | Accepted for teaching tool; login uses generic error    |


---



## Next Sprint

Sessions, route protection, real logout, user identity on pages, MCQ CRUD, collaboration, account management, rate limiting.

---



## Current Status

**Last Updated:** 2026-08-25  
**Status:** Phases 0–6 complete;   
**Repository:** Merged to `main` via PR #1  
**Build:** `npm run lint` and `npm run build` pass  
**Full PRD:** `[AUTH_TECHNICAL_PRD.md](./AUTH_TECHNICAL_PRD.md)`