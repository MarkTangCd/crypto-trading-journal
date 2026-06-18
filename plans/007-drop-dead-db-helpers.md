# Plan 007: Drop dead `server/db.ts` helpers and their test scaffolding

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 8f09a1d..HEAD -- server/db.ts server/transaction.test.ts server/transaction.lifecycle.test.ts server/sqlite.integration.test.ts`
> On a mismatch with the "Current state" excerpts below, treat it as a STOP
> condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (independent of plan 006)
- **Category**: tech-debt
- **Planned at**: commit `8f09a1d`, 2026-06-18

## Why this matters

Five exported helpers in `server/db.ts` have **zero production callers**.
They are leftovers from the pre-`getAccountSnapshot` era when balance and
streak were computed by two separate scans, and from the
pre-tRPC-router-cleanup era when the router file inserted/deleted rows
through generic helpers. Removing them:

- Cuts the public surface of `server/db.ts` (the file is currently
  ~1030 lines).
- Removes test fixtures that mock helpers no router calls — those mocks
  give the misleading impression that the helpers matter.
- Eliminates the "two ways to compute the balance" trap. `getCurrentBalance`
  and `getConsecutiveLosses` are thin facades over `getAccountSnapshot`;
  the real callers already use `getAccountSnapshot` directly
  (`server/routers.ts:309`, `534`).

The dead helpers are:

1. `createTransaction(data)` — `server/db.ts:432-441`. All inserts now go
   through `createTransactionWithElements` (line 887) which runs in a
   serialised SQLite transaction.
2. `deleteTransaction(id, userId)` — `server/db.ts:614-621`. Deletes now go
   through `deleteTransactionWithElements` (line 928).
3. `getLastTransaction(userId)` — `server/db.ts:623-635`. No callers.
4. `getCurrentBalance(accountId, initialBalance)` — `server/db.ts:703-709`.
   Single-line wrapper over `getAccountSnapshot`.
5. `getConsecutiveLosses(accountId)` — `server/db.ts:698-701`. Same shape.

## Current state

### `server/db.ts` — the five blocks to delete

The file currently exports them in these positions (verify before editing):

```ts
// server/db.ts:432-441
export async function createTransaction(
  data: InsertTransaction
): Promise<Transaction> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(transactions).values(data).returning();

  return result[0];
}
```

```ts
// server/db.ts:614-621
export async function deleteTransaction(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
}
```

```ts
// server/db.ts:623-635
export async function getLastTransaction(userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.createdAt))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}
```

```ts
// server/db.ts:698-701
export async function getConsecutiveLosses(accountId: number): Promise<number> {
  const snapshot = await getAccountSnapshot(accountId, ZERO_DECIMAL);
  return snapshot.consecutiveLosses;
}
```

```ts
// server/db.ts:703-709
export async function getCurrentBalance(
  accountId: number,
  initialBalance: string
): Promise<string> {
  const snapshot = await getAccountSnapshot(accountId, initialBalance);
  return snapshot.currentBalance;
}
```

Note: `getAccountSnapshot` itself (lines 651-696) is **load-bearing** and
must stay. So must `assertClosedTradesHaveEndTime`, `getStatistics`, and
every other function in the file.

### Tests that reference the dead helpers (mocks only)

These tests only mention the dead helpers inside `vi.mock("./db", () => ({…}))`
fixture objects, not in assertions:

- `server/transaction.test.ts:26-32` — `createTransaction` mock entry.
- `server/transaction.test.ts:65` — `deleteTransaction: vi.fn().mockResolvedValue(undefined)` entry.
- `server/transaction.lifecycle.test.ts:53-54` — `getConsecutiveLosses`,
  `getCurrentBalance` mock entries.
- `server/transaction.lifecycle.test.ts:202-206` — second `getCurrentBalance`,
  `getConsecutiveLosses` block.
- `server/transaction.lifecycle.test.ts:267-268` — third block, same pair.

### Tests that **call** the dead helpers (must be rewritten)

Two test cases call `getCurrentBalance` / `getConsecutiveLosses` directly
against the real DB. Both are easily rewritten to call `getAccountSnapshot`
without losing coverage:

- `server/transaction.lifecycle.test.ts:450-461`
  `it("getCurrentBalance excludes open trades", ...)` — verifies the wrapper's
  output. Rewrite to call `getAccountSnapshot` and read `.currentBalance`.
- `server/transaction.lifecycle.test.ts:475-486`
  `it("getConsecutiveLosses ignores open trades", ...)` — same shape.
  Rewrite to read `.consecutiveLosses`.
- `server/transaction.lifecycle.test.ts:300, 309-311` — a worker-script
  template literal imports `getCurrentBalance`/`getConsecutiveLosses` from
  the db module and calls them in a child fork to test cumulative balance.
  Replace those calls with `getAccountSnapshot(1, '1000.00')` and read its
  `.currentBalance` / `.consecutiveLosses`.

`sqlite.integration.test.ts` also calls `getCurrentBalance` at one site
(line 534) and imports the helper at line 487. Rewrite the same way.

### Repo conventions to honour

- Exported db helpers use `async function` + a leading
  `const db = await getDb(); if (!db) { … }` guard. Match the pattern of
  any helper you touch.
- Logging prefix `[Database]` (see `server/db.ts:92,151,212,232,276,…`).
  Do not invent new log call-sites in this plan.
- Tests use the `vi.mock("./db", () => ({ … }))` pattern documented in
  `CLAUDE.md`. Preserve indent and ordering of the surrounding fixture.

## Commands you will need

| Purpose   | Command                                               | Expected   |
| --------- | ----------------------------------------------------- | ---------- |
| Typecheck | `npm run check`                                       | exit 0     |
| Tests     | `npm test -- --run`                                   | 104 passed |
| One file  | `npx vitest run server/transaction.lifecycle.test.ts` | passes     |
| Format    | `npm run format`                                      | exit 0     |

## Scope

**In scope** (the only files you should modify):

- `server/db.ts`
- `server/transaction.test.ts`
- `server/transaction.lifecycle.test.ts`
- `server/sqlite.integration.test.ts`

**Out of scope**:

- `getUserById`, `updateUserInitialBalance`, the `users.initialBalance`
  column — owned by plan 009.
- `HttpError` and `manusTypes.ts` — owned by plan 008.
- Any router code (`server/routers.ts`). The five dead helpers are not
  referenced from routers and removing them must not require a router edit.
- Drizzle migrations. No SQL changes here.

## Git workflow

- Branch: `advisor/007-drop-dead-db-helpers`.
- One commit: `chore: drop unused db helpers obsoleted by getAccountSnapshot`.

## Steps

### Step 1: baseline

```bash
git status            # clean
git rev-parse HEAD
npm run check         # exit 0
npm test -- --run     # 104 passed
```

### Step 2: delete the five helpers from `server/db.ts`

Open `server/db.ts` and remove:

1. The `createTransaction` block (lines 432-441 at planned SHA).
2. The `deleteTransaction` block (lines 614-621).
3. The `getLastTransaction` block (lines 623-635).
4. The `getConsecutiveLosses` block (lines 698-701).
5. The `getCurrentBalance` block (lines 703-709).

Keep `getAccountSnapshot`, `getStatistics`, and every other export. Keep
imports (`desc` is still used elsewhere; `eq`, `and` are too). Run
`npm run check` to confirm no caller breaks.

**Verify**:

```bash
grep -nE '^export async function (createTransaction|deleteTransaction|getLastTransaction|getCurrentBalance|getConsecutiveLosses)\b' server/db.ts
# expected: empty
npm run check    # exit 0
```

### Step 3: rewrite the two `.lifecycle.test.ts` "characterization" tests

In `server/transaction.lifecycle.test.ts`:

- The test at line 450 currently calls `getCurrentBalance(accountId, '0')`.
  Change it to `(await getAccountSnapshot(accountId, '0')).currentBalance`
  and assert the same value. Update the import at the top of the file from
  `getCurrentBalance` to `getAccountSnapshot` (or just add
  `getAccountSnapshot` if `getCurrentBalance` is imported alongside others
  that are still used).
- The test at line 475 calls `getConsecutiveLosses(accountId)`. Change to
  `(await getAccountSnapshot(accountId, '0')).consecutiveLosses`.
- The worker-script template at line 300 contains the literal
  `const { getCurrentBalance, getConsecutiveLosses, getStatistics } = await import(${JSON.stringify(dbModuleUrl)});`.
  Replace the destructured names with `getAccountSnapshot, getStatistics`,
  and replace the subsequent `getCurrentBalance(...)` / `getConsecutiveLosses(...)`
  calls with `(await getAccountSnapshot(1, '1000.00')).currentBalance` and
  `… .consecutiveLosses` respectively.

### Step 4: prune the mock-fixture entries

In `server/transaction.test.ts`, inside the top-level
`vi.mock("./db", () => ({ … }))`:

- Delete the `createTransaction: vi.fn().mockImplementation(...)` entry
  (around line 26-32).
- Delete the `deleteTransaction: vi.fn().mockResolvedValue(undefined),`
  entry (around line 65).

In `server/transaction.lifecycle.test.ts`, every
`vi.mock("./db", () => ({ … }))` block (lines 53, 202, 267):

- Delete `getConsecutiveLosses: vi.fn().mockResolvedValue(...)`.
- Delete `getCurrentBalance: vi.fn().mockResolvedValue(...)`.

### Step 5: `sqlite.integration.test.ts`

This file imports `getCurrentBalance` (line 487) and calls it
(line 534). Replace the call with
`(await getAccountSnapshot(accountId, '1000.10')).currentBalance` and the
import with `getAccountSnapshot` (if not already imported in that block).
Remove the standalone `getCurrentBalance,` entry from the destructured
import list at line 487.

If the file imports `getCurrentBalance` at additional spots (the file is
~800 lines), run a final grep to confirm none remain.

### Step 6: full gauntlet

```bash
grep -rn 'createTransaction\|deleteTransaction\|getLastTransaction\|getCurrentBalance\|getConsecutiveLosses' server/ --include='*.ts'
# expected: only matches inside identifiers like
#   createTransactionWithElements, deleteTransactionWithElements
# NO bare `createTransaction`, `deleteTransaction`, etc.
npm run format
npm run check         # exit 0
npm test -- --run     # 104 passed
```

## Test plan

- No new tests are added. The two existing characterization tests for
  "excludes open trades" are rewritten to call `getAccountSnapshot`
  (same coverage, same assertions, just via the surviving entry point).
- Verification: `npm test -- --run` keeps `Tests 104 passed (104)`. If
  the count drops by one or two, you accidentally deleted a test instead
  of rewriting it — restore and try again.

## Done criteria

ALL must hold:

- [ ] `grep -nE '^export async function (createTransaction|deleteTransaction|getLastTransaction|getCurrentBalance|getConsecutiveLosses)\b' server/db.ts`
      returns no matches.
- [ ] `grep -rn 'getCurrentBalance\|getConsecutiveLosses' server/ --include='*.ts'`
      returns no matches (none in tests, none in db.ts).
- [ ] `grep -rn 'createTransaction\b\|deleteTransaction\b\|getLastTransaction\b' server/ --include='*.ts'`
      returns no matches as bare identifiers (only `*WithElements` survives).
- [ ] `npm run check` exits 0.
- [ ] `npm test -- --run` reports `Tests 104 passed (104)`.
- [ ] `git status` shows changes only in `server/db.ts`,
      `server/transaction.test.ts`, `server/transaction.lifecycle.test.ts`,
      `server/sqlite.integration.test.ts`, and `plans/README.md`.
- [ ] `plans/README.md` row for plan 007 set to DONE.

## STOP conditions

Stop and report if:

- `tsc` reports a "Cannot find name 'createTransaction'" (or one of the
  others) in any file outside the in-scope list. This plan asserts no such
  caller exists; if `tsc` says otherwise, surface the offending file and
  line — do not "fix" it by reintroducing the helper.
- The rewritten characterization tests fail. The snapshot helper has
  identical semantics; a failure means the rewrite mis-mapped a field
  (e.g. read `.currentBalance` where the original asserted
  `.consecutiveLosses`). Re-read both fields' types from
  `server/db.ts:637` (`AccountSnapshot` interface) before retrying.
- Drift-check shows `server/db.ts` has been edited at the
  `getCurrentBalance`/`getConsecutiveLosses` lines since `8f09a1d` — a
  concurrent refactor may already have done part of this work.

## Maintenance notes

- After this plan lands, `server/db.ts` should never again gain a
  per-metric balance helper. New balance/streak shapes go on
  `AccountSnapshot` and `getAccountSnapshot`.
- Reviewer to check: that no test ended up silently deleted (test count
  must stay 104) and that the worker-script template literal in
  `transaction.lifecycle.test.ts:300` was edited as a string, not as live
  TypeScript (it runs in a child process).
- Follow-up explicitly deferred: shrinking `server/db.ts` further by
  splitting account / transaction concerns into separate files. That is a
  larger restructure and is out of scope here.
