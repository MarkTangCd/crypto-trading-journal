# Plan 008: Delete the dead `HttpError` family and `manusTypes.ts`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 8f09a1d..HEAD -- shared/_core/errors.ts server/_core/types/`
> On a mismatch with the "Current state" excerpts below, treat it as a STOP
> condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `8f09a1d`, 2026-06-18

## Why this matters

Two stand-alone modules export types/errors that nothing in the codebase
imports.

1. `shared/_core/errors.ts` exports `HttpError` and four constructors
   (`BadRequestError`, `UnauthorizedError`, `ForbiddenError`,
   `NotFoundError`). All app code throws `TRPCError` (tRPC's canonical
   error) or `TradeMathError` (domain-specific). Grep confirms no file
   imports `HttpError` or any of the helpers.

2. `server/_core/types/manusTypes.ts` defines protobuf-style auth message
   types (`AuthorizeRequest`, `ExchangeTokenResponse`, `GetUserInfoResponse`,
   …). The journal is single-tenant anonymous (see `CLAUDE.md`
   "Authentication"); no auth flow exists, no file imports any of these
   types. The header comment claims they were "auto-generated from
   protobuf definitions" on 2025-09-24 — the corresponding code path was
   already removed.

Deleting both files cleans up dead public API surface and removes the
"someone added an `HttpError` import — should I migrate the codebase?"
trap.

## Current state

### `shared/_core/errors.ts` (20 lines, full contents)

```ts
/**
 * Base HTTP error class with status code.
 * Throw this from route handlers to send specific HTTP errors.
 */
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

// Convenience constructors
export const BadRequestError = (msg: string) => new HttpError(400, msg);
export const UnauthorizedError = (msg: string) => new HttpError(401, msg);
export const ForbiddenError = (msg: string) => new HttpError(403, msg);
export const NotFoundError = (msg: string) => new HttpError(404, msg);
```

### `server/_core/types/manusTypes.ts` (70 lines)

Contains seven `export interface` declarations (`AuthorizeRequest`,
`AuthorizeResponse`, `ExchangeTokenRequest`, `ExchangeTokenResponse`,
`GetUserInfoRequest`, `GetUserInfoResponse`, `CanAccessRequest`,
`CanAccessResponse`, `GetUserInfoWithJwtRequest`,
`GetUserInfoWithJwtResponse`). It is the only file in
`server/_core/types/`; delete the directory after deleting the file so
the empty folder doesn't survive.

### Confirm zero importers (run before editing)

```bash
grep -rn 'HttpError\|BadRequestError\|UnauthorizedError\|ForbiddenError\|NotFoundError' \
  --include='*.ts' --include='*.tsx' \
  client server shared
# Expected: only matches inside `shared/_core/errors.ts` itself.

grep -rn 'manusTypes\|AuthorizeRequest\|ExchangeTokenRequest\|GetUserInfoResponse\|CanAccessRequest\|GetUserInfoWithJwtRequest' \
  --include='*.ts' --include='*.tsx' \
  client server shared
# Expected: only matches inside `server/_core/types/manusTypes.ts` itself.
```

If either command surfaces a non-self file, STOP — the assumption that
the modules are dead has drifted, and this plan must be re-scoped.

### Repo conventions

- The shared layer uses no default exports. (Both deletions are removals
  — no replacement export.)
- `CLAUDE.md` (project section "Error Handling") says: "In tRPC middleware
  and procedures, use `TRPCError` where appropriate. For shared HTTP-style
  errors, use `HttpError` …". After this plan lands, the second sentence
  is stale. Update `CLAUDE.md` accordingly (see Step 4).

## Commands you will need

| Purpose   | Command             | Expected   |
| --------- | ------------------- | ---------- |
| Typecheck | `npm run check`     | exit 0     |
| Tests     | `npm test -- --run` | 104 passed |
| Format    | `npm run format`    | exit 0     |

## Scope

**In scope**:

- Delete `shared/_core/errors.ts`.
- Delete `server/_core/types/manusTypes.ts` and remove the now-empty
  `server/_core/types/` directory.
- Edit `CLAUDE.md` to remove the "use `HttpError` …" sentence (one line
  edit).

**Out of scope**:

- Any `TRPCError` usage. The cleanup is purely about dead exports.
- `shared/_core/` siblings (if any). Touch only the one file.
- Any other markdown / docs file.

## Git workflow

- Branch: `advisor/008-delete-http-error-and-manus-types`.
- One commit: `chore: delete unused HttpError exports and manus auth types`.

## Steps

### Step 1: baseline

```bash
git status            # clean
git rev-parse HEAD
npm run check         # exit 0
npm test -- --run     # 104 passed
```

### Step 2: confirm zero importers (gate)

Run the two grep commands from "Confirm zero importers" above. **Each must
return only the file's own definition lines.** If any external match
appears, STOP and report.

### Step 3: delete the files

```bash
rm shared/_core/errors.ts
rm server/_core/types/manusTypes.ts
# server/_core/types/ is now empty:
rmdir server/_core/types
```

If `rmdir` fails because the directory is not empty (some other file
appeared since this plan was written), STOP — list contents and report
back.

If `shared/_core/` becomes empty after the deletion, do NOT remove it.
Reason: `shared/_core/` is a load-bearing path that future shared modules
will reuse; an empty directory is fine. Likewise leave `shared/types.ts`
alone — it's the canonical re-export point for Drizzle types.

### Step 4: update CLAUDE.md

Open `CLAUDE.md` and find the "Error Handling" section (search for
`## Error Handling`). Replace this paragraph

```md
- In tRPC middleware and procedures, use `TRPCError` where appropriate.
- For shared HTTP-style errors, use `HttpError` and helper constructors from
  `shared/_core/errors.ts`.
```

with

```md
- In tRPC procedures and middleware, throw `TRPCError`. Validation
  failures from `server/_core/tradeMath.ts` (`TradeMathError`) are
  translated to `TRPCError({ code: "BAD_REQUEST" })` by the
  `runTradeMath` wrapper in `server/routers.ts`.
```

Leave the surrounding bullets (about client toasts, empty catches, scoped
loggers) untouched.

### Step 5: verify

```bash
npm run format
npm run check               # exit 0
npm test -- --run           # 104 passed
grep -rn 'HttpError\|@/_core/errors\|_core/errors\|manusTypes\|server/_core/types' \
  --include='*.ts' --include='*.tsx' --include='*.md' \
  client server shared CLAUDE.md
# Expected: no matches anywhere (including in docs).
```

## Test plan

- No new tests; nothing imports the deleted symbols.
- The full Vitest suite re-runs to confirm no test had a hidden import.
- Verification: `npm test -- --run` keeps `Tests 104 passed (104)`.

## Done criteria

ALL must hold:

- [ ] `shared/_core/errors.ts` no longer exists.
- [ ] `server/_core/types/manusTypes.ts` no longer exists.
- [ ] `server/_core/types/` no longer exists.
- [ ] `grep -rn 'HttpError\|manusTypes' --include='*.ts' --include='*.tsx' --include='*.md' client server shared CLAUDE.md`
      returns zero matches.
- [ ] `npm run check` exits 0.
- [ ] `npm test -- --run` reports `Tests 104 passed (104)`.
- [ ] The `CLAUDE.md` "Error Handling" section no longer mentions `HttpError`.
- [ ] `git status` shows changes only in `shared/_core/errors.ts` (deleted),
      `server/_core/types/manusTypes.ts` (deleted), `CLAUDE.md`, and
      `plans/README.md`.
- [ ] `plans/README.md` row for plan 008 set to DONE.

## STOP conditions

Stop and report if:

- The gate grep in Step 2 finds a real importer (e.g. a new feature added
  `import { HttpError } from "@shared/_core/errors";`). The plan is
  invalidated — surface where.
- `tsc` errors after deletion. Same root cause: a transitively-included
  file imported something we just deleted.
- `server/_core/types/` contains other files. Report contents; do not
  delete unrelated siblings.

## Maintenance notes

- After this plan, reviewers should reject PRs that add
  `shared/_core/errors.ts` back. The project has converged on `TRPCError`
  at the wire boundary and `TradeMathError` at the math boundary.
- If a non-tRPC HTTP path is ever added (e.g. a webhook route), introduce
  `HttpError` again in a fresh, narrowly-scoped file at that time — do
  not re-import the dead module by name from a future agent's memory.
- `CLAUDE.md` is the project's load-bearing agent instruction file. The
  rewrite in Step 4 keeps the same number of bullets and the same line
  length envelope; preserve that on any future touch.
