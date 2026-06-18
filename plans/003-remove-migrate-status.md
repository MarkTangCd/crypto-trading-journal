# Plan 003: Remove dead `migrateTransactionStatus` migration code

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 153587a..HEAD -- server/db.ts server/transaction.lifecycle.test.ts scripts/migrate-transaction-status.ts drizzle/schema.ts`
> If any of these files changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. Pay special attention to
> `drizzle/schema.ts` — if the `isReviewed` column was re-added, this plan
> is invalid; stop and report.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `153587a`, 2026-06-18

## Why this matters

`migrateTransactionStatus` was the one-shot migration that backfilled the
`status` text column from the legacy boolean `isReviewed` flag during the
"status enum" refactor. The `isReviewed` column itself is **no longer
present** in `drizzle/schema.ts` — confirm by grepping the schema and the
generated SQL under `drizzle/migrations/`:

```
grep -n "isReviewed" drizzle/schema.ts drizzle/*.sql
```

The schema file should return zero matches; the migration `.sql` files may
contain it in early-schema definitions, which is fine.

The migration function still exists in `server/db.ts` and the script
`scripts/migrate-transaction-status.ts` still tries to call it. Anyone who
runs the script against a current database will hit a SQLite
`no such column: isReviewed` error. The test suite hides this because the
test scenario manually creates a fake `transactions` table with the
`isReviewed` column before importing the function (see
`server/transaction.lifecycle.test.ts` line ~290 onward) — i.e. the function
is only tested against a synthetic legacy schema that no live database has.

This is dead code that is also broken. Delete it.

## Current state

Files touched by this plan:

- `server/db.ts` — contains the `migrateTransactionStatus` function and a
  top-of-file import-only reference (none, only the definition).
- `scripts/migrate-transaction-status.ts` — the only production caller; a
  thin wrapper that exits non-zero on failure.
- `server/transaction.lifecycle.test.ts` — contains a `runScenario` helper
  and one `describe("migrateTransactionStatus", …)` block exercising the
  function against a synthetic schema.

Excerpts at the planned-at commit:

```ts
// server/db.ts:614-631
export async function migrateTransactionStatus(): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const reviewedRows = await db
    .update(transactions)
    .set({ status: "reviewed" })
    .where(eq(sql<number>`isReviewed`, 1))
    .returning({ id: transactions.id });

  const closedRows = await db
    .update(transactions)
    .set({ status: "closed" })
    .where(eq(sql<number>`isReviewed`, 0))
    .returning({ id: transactions.id });

  return reviewedRows.length + closedRows.length;
}
```

```ts
// scripts/migrate-transaction-status.ts:1-17 — the entire file
import { migrateTransactionStatus } from "../server/db";

async function main() {
  console.log("Starting transaction status migration...");

  try {
    const migratedCount = await migrateTransactionStatus();
    console.log(`Migration complete. ${migratedCount} transactions updated.`);
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

main();
```

```ts
// server/transaction.lifecycle.test.ts:517 — start of the dead test block
describe("migrateTransactionStatus", () => {
  beforeEach(() => { … });
  afterEach(() => { … });
  it("marks reviewed transactions as reviewed", () => { … });
  it("marks reviewed flag off as closed when feedback exists", () => { … });
  it("marks reviewed flag off as closed without feedback", () => { … });
});
```

Also: a private helper `runScenario` defined earlier in
`server/transaction.lifecycle.test.ts` (around line 280–345) is only used by
this `describe` block — confirm with:

```
grep -n "runScenario" server/transaction.lifecycle.test.ts
```

If `runScenario` has only the references inside the dead `describe`, delete
the helper too. If it's referenced elsewhere, leave it.

Repo conventions:

- TypeScript `strict: true`; no `any`. Removing a function is type-safe by
  construction; just verify with `npm run check`.
- The test file uses `vi.mock` and `appRouter.createCaller` patterns; do not
  alter unrelated tests.

## Commands you will need

| Purpose   | Command                                               | Expected on success                                              |
| --------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| Install   | `npm install`                                         | exit 0                                                           |
| Typecheck | `npm run check`                                       | exit 0                                                           |
| Tests     | `npm run test`                                        | all pass, fewer than before by exactly the 3 deleted `it` blocks |
| One file  | `npx vitest run server/transaction.lifecycle.test.ts` | all pass                                                         |
| Format    | `npm run format`                                      | exit 0                                                           |

## Scope

**In scope**:

- Delete: `scripts/migrate-transaction-status.ts`
- Edit: `server/db.ts` (remove the `migrateTransactionStatus` function)
- Edit: `server/transaction.lifecycle.test.ts` (remove the dead
  `describe("migrateTransactionStatus", …)` block and the `runScenario`
  helper if it's no longer used)

If the `scripts/` directory is empty after the delete, **leave the empty
directory in place** — it is not in `.gitignore` and other future scripts
may live there.

**Out of scope**:

- `drizzle/migrations/*.sql` history (the `isReviewed` column shows up in
  early migrations — that's correct, those reflect the past state of the
  schema and must stay accurate).
- Other helpers in `server/transaction.lifecycle.test.ts` such as
  `runStatsScenario` — those are unrelated and exercised by other `describe`
  blocks.

## Git workflow

- Branch: `advisor/003-remove-migrate-status`.
- One commit. Suggested message:
  `chore: remove dead migrateTransactionStatus and its caller`.

## Steps

### Step 1: Confirm the `isReviewed` column really is gone

```
grep -n "isReviewed" drizzle/schema.ts
```

Expected: zero matches. If any match, STOP — the schema is in an
intermediate state and this plan needs re-evaluation.

```
grep -rn "isReviewed" server/ scripts/ shared/ client/src/
```

Expected: matches **only** in `server/db.ts` (the function body) and
`server/transaction.lifecycle.test.ts` (the dead scenarios). If anywhere
else references `isReviewed`, STOP and report.

### Step 2: Delete the script file

```
git rm scripts/migrate-transaction-status.ts
```

### Step 3: Remove `migrateTransactionStatus` from `server/db.ts`

Open `server/db.ts`. Delete exactly the function block at lines 614–631
(`export async function migrateTransactionStatus() …` through its closing
`}`). Keep the surrounding `getLastTransaction`, `getAccountSnapshot`,
`getStatistics`, and `assertClosedTradesHaveEndTime` functions untouched.

After deletion, confirm:

```
grep -n "migrateTransactionStatus" server/db.ts
```

Expected: zero matches.

**Verify**: `npm run check` → exits 0. The compiler will tell you if
anything else still imports the function (nothing should, per the audit, but
this is the safety net).

### Step 4: Remove the dead describe block and `runScenario` helper

In `server/transaction.lifecycle.test.ts`:

1. Find `describe("migrateTransactionStatus", …)` (around line 517). Delete
   it through its closing `});`.
2. Find the `runScenario` helper (around lines 280–345). If your grep in
   Step 1 confirmed it's only used by the deleted `describe` block, delete
   the helper too — including its TypeScript type for the `result` it
   returns (`migrated`, `rows`, etc.).
3. Look for any imports the test file used **only** for these blocks
   (`execFileSync`, `JSON.stringify` of the dynamic script, etc.). Remove
   unused imports — `npm run check` will flag them.

After deletion, run:

```
grep -n "migrateTransactionStatus\|runScenario" server/transaction.lifecycle.test.ts
```

Expected: zero matches.

### Step 5: Run the full test suite

```
npm run test
```

**Verify**:

- Exit 0.
- The number of passing tests is exactly 3 lower than before (the three
  deleted `it` blocks under `migrateTransactionStatus`). Other suites
  unaffected.

### Step 6: Format

```
npm run format
```

## Test plan

No new tests. The plan deletes both code and the tests that exercised it —
that's the entire point.

If you find yourself tempted to keep one "documentation" test (e.g. asserting
the migration is no longer available), don't. Deleted code does not need a
gravestone.

## Done criteria

ALL must hold:

- [ ] `scripts/migrate-transaction-status.ts` does not exist.
- [ ] `grep -n "migrateTransactionStatus" server/ scripts/` returns zero
      matches.
- [ ] `grep -n "isReviewed" server/ scripts/ client/src/` returns zero
      matches.
- [ ] `npm run check` exits 0.
- [ ] `npm run test` exits 0; the test count is exactly 3 lower than at the
      start of this plan.
- [ ] Only the in-scope files changed (`git status` shows: deleted
      `scripts/migrate-transaction-status.ts`, modified `server/db.ts`,
      modified `server/transaction.lifecycle.test.ts`).
- [ ] `plans/README.md` status row updated to DONE.

## STOP conditions

Stop and report back (do not improvise) if:

- `drizzle/schema.ts` contains `isReviewed` (the column got re-added; the
  function might be load-bearing after all).
- `grep -rn "migrateTransactionStatus"` returns matches outside the
  in-scope files (some other entry point you didn't know about).
- The number of tests drops by something other than 3 — investigate which
  other tests broke. The expected dead `describe` has exactly three `it`
  blocks at the planned-at commit; if your tree has more/fewer, the
  expectation arithmetic shifts.
- `npm run check` errors with anything other than "unused import" warnings
  you can fix in step 4.

## Maintenance notes

- Future "one-shot data migration" code should live under a dated
  `scripts/migrations/2026-06-18-<slug>.ts` and be deleted along with its
  caller once it has been run in every environment. The pattern of letting
  a one-shot live forever in `server/db.ts` (next to live query helpers) is
  what created this debt — don't repeat it.
