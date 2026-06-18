# Plan 009: Drop the dead `users.initialBalance` column and related helpers

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 8f09a1d..HEAD -- drizzle/ server/db.ts server/transaction.test.ts server/transaction.lifecycle.test.ts server/account.test.ts server/sqlite.integration.test.ts`
> On a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (schema change requires a migration)
- **Depends on**: none — independent of plan 007 (which removes different
  helpers).
- **Category**: tech-debt / migration
- **Planned at**: commit `8f09a1d`, 2026-06-18

## Why this matters

The `users` table still carries an `initialBalance text DEFAULT '0'` column
from the pre-multi-account era. Per-account balances now live on
`accounts.initialBalance`, and **no production code reads or writes
`users.initialBalance`**.

Three concrete payoffs:

1. Removes a "two sources of truth for starting balance" trap. The next
   contributor who reads `users.initialBalance` will assume it matters; it
   doesn't, and the value persisted there is stale for every existing user.
2. Lets two zero-caller server helpers go: `updateUserInitialBalance`
   (the only writer) and `getUserById` (the only reader, and only from
   tests).
3. Cleans up four test files that mock these helpers with fabricated
   balance numbers, hiding what the code actually does.

## Current state

### Schema (`drizzle/schema.ts:13-35`)

```ts
export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    openId: text("openId").notNull().unique(),
    name: text("name"),
    email: text("email"),
    loginMethod: text("loginMethod"),
    role: text("role").$type<"user" | "admin">().default("user").notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" })
      .default(sql`(unixepoch() * 1000)`)
      .notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
      .default(sql`(unixepoch() * 1000)`)
      .notNull(),
    lastSignedIn: integer("lastSignedIn", { mode: "timestamp_ms" })
      .default(sql`(unixepoch() * 1000)`)
      .notNull(),
    /** Initial account balance set by user */
    initialBalance: text("initialBalance").default("0"),  // <-- DROP
  },
  table => [check("users_role_check", sql`${table.role} in ('user', 'admin')`)]
);
```

### Helpers in `server/db.ts`

- Lines 405-416: `updateUserInitialBalance(userId, initialBalance)` — zero
  production callers. Test mocks reference it as a fixture entry.
- Lines 418-428: `getUserById(userId)` — zero production callers. Tests
  mock it to return a fake `{ id, initialBalance }`.

### Routers

`server/routers.ts` never reads `user.initialBalance` (verify via grep
during Step 2). The anonymous-user flow in
`server/_core/context.ts:11-21` reads only `getOrCreateAnonymousUser()`,
which uses `upsertUser` + `getUserByOpenId`. Both of those stay.

### Tests that reference the dead column / helpers

- `server/transaction.test.ts:8` —
  `getUserById: vi.fn().mockResolvedValue({ id: 1, initialBalance: "10000" })`.
- `server/transaction.test.ts:89` —
  `updateUserInitialBalance: vi.fn().mockResolvedValue(undefined)`.
- `server/account.test.ts:8` — same `getUserById` mock fixture.
- `server/transaction.lifecycle.test.ts:61-62` — both mocks.
- `server/transaction.lifecycle.test.ts:202` — `getUserById` mock.
- `server/transaction.lifecycle.test.ts:266` — `getUserById` mock.
- `server/sqlite.integration.test.ts:485` — imports `updateUserInitialBalance`
  in a fork-worker template literal.
- `server/sqlite.integration.test.ts:503` — calls `updateUserInitialBalance(user.id, "1000.10")`.
- `server/sqlite.integration.test.ts:564, 607` — same import + call in
  another fork-worker block.

None of the assertions in these tests inspect the result of those calls in
a way that depends on the value being persisted on the `users` row — they
were probing the (then-canonical) per-user balance, which is now per-account.
The calls and mock entries can be deleted; the tests still pass because
their meaningful assertions are about `accounts.initialBalance` flowing
through `getAccountSnapshot` / `getStatistics`.

### SQLite migration shape

The project's migration file convention (see existing `drizzle/*.sql` and
`_journal.json`):

- One numbered SQL file per migration, named
  `00NN_<adjective>_<noun>.sql`.
- Statements separated by `--> statement-breakpoint`.
- `_journal.json` updated with a new `entries[]` row containing the same
  `tag` as the filename (minus `.sql`).
- `meta/00NN_snapshot.json` written by `drizzle-kit generate`.

SQLite ≥ 3.35 supports `ALTER TABLE … DROP COLUMN` directly, and Node 22
ships SQLite ≥ 3.45. The migration is therefore a one-liner; you do not
need to rebuild the `users` table.

### Repo conventions

- Migration filenames historically use the `<adjective>_<noun>` pattern
  (e.g. `0006_split_thesis_context.sql`). For this plan, use
  `0007_drop_users_initial_balance.sql`.
- The exact body wording inside the SQL file is fine to author by hand
  rather than running `drizzle-kit generate`. The auto-tool tends to
  rebuild the whole table for ALTER operations; the hand-written form is
  cleaner here. See "Step 4" for the exact body.

## Commands you will need

| Purpose      | Command                                            | Expected           |
| ------------ | -------------------------------------------------- | ------------------ |
| Typecheck    | `npm run check`                                    | exit 0             |
| Tests        | `npm test -- --run`                                | 104 passed         |
| Format       | `npm run format`                                   | exit 0             |
| Migrations   | (do NOT run `npm run db:push` against the user's   | n/a — migration    |
|              | live DB; see Step 6.)                              | applies on startup |

## Scope

**In scope**:

- `drizzle/schema.ts` — remove the `initialBalance` field.
- `drizzle/0007_drop_users_initial_balance.sql` — new file (one ALTER).
- `drizzle/meta/_journal.json` — add the new entry.
- `drizzle/meta/0007_snapshot.json` — new file.
- `server/db.ts` — delete `updateUserInitialBalance` and `getUserById`.
- `server/transaction.test.ts` — remove the two mock fixture lines.
- `server/account.test.ts` — remove the `getUserById` mock line.
- `server/transaction.lifecycle.test.ts` — remove all the listed mock
  entries.
- `server/sqlite.integration.test.ts` — remove the
  `updateUserInitialBalance` import and call sites; if a test case loses
  all meaningful assertions, delete the case entirely (better than letting
  it become a no-op).

**Out of scope**:

- Plan 007 helpers (`createTransaction`, `deleteTransaction`,
  `getLastTransaction`, `getCurrentBalance`, `getConsecutiveLosses`).
- Any other column on `users` (`role`, `email`, `lastSignedIn`, etc.).
- `accounts` schema — unchanged.
- `client/` code. No client surface reads `users.initialBalance`.

## Git workflow

- Branch: `advisor/009-drop-users-initial-balance`.
- Suggested commit split:
  1. `chore: drop unused users.initialBalance column`
  2. `chore: drop server db helpers for users.initialBalance`

## Steps

### Step 1: baseline

```bash
git status
git rev-parse HEAD
npm run check
npm test -- --run     # 104 passed
```

### Step 2: confirm zero production callers (gate)

```bash
grep -rn 'initialBalance' --include='*.ts' --include='*.tsx' client server shared drizzle \
  | grep -v 'accounts\.initialBalance' \
  | grep -v 'account\.initialBalance' \
  | grep -v 'data/initialBalance' \
  | grep -v '\.test\.ts'
# Expected: matches only in
#   drizzle/schema.ts:32 (the field we're about to delete)
#   server/db.ts:405-416 updateUserInitialBalance
#   drizzle/0000_*.sql / 0001_*.sql (historic migration text — leave alone)
# If a *.tsx / *.ts under client or a non-test server file appears,
# STOP and report.
```

Also confirm no caller reads via `getUserById`:

```bash
grep -rn '\bgetUserById\b' --include='*.ts' --include='*.tsx' client server shared
# Expected: only matches inside server/db.ts (definition) and *.test.ts mock
# fixtures. No router or context callsite.
```

### Step 3: edit `drizzle/schema.ts`

Open `drizzle/schema.ts` and delete this two-line block (lines 31-32 at
planned SHA):

```ts
    /** Initial account balance set by user */
    initialBalance: text("initialBalance").default("0"),
```

The line above it (`lastSignedIn: integer(...).notNull()`) keeps its
trailing comma. Leave the `check` constraint and every other column
untouched.

### Step 4: create the migration file

Create `drizzle/0007_drop_users_initial_balance.sql` with this exact
content (single statement; no `BEGIN`/`COMMIT` — the runtime in
`server/db.ts:128-160` strips and re-adds the outer transaction):

```sql
ALTER TABLE `users` DROP COLUMN `initialBalance`;
```

### Step 5: update `drizzle/meta/_journal.json` and snapshot

Add a new entry to the `entries` array in `_journal.json` (keep the file
formatted to match the existing two-space indent / sorted-key style):

```json
    {
      "idx": 7,
      "version": "6",
      "when": 1781800000000,
      "tag": "0007_drop_users_initial_balance",
      "breakpoints": true
    }
```

(Use any monotonically-increasing `when` value greater than the previous
entry's `when` of `1781709780000`. The value `1781800000000` is fine; do
not use `Date.now()` because timestamps in this file are stable and
checked-in.)

For `drizzle/meta/0007_snapshot.json`, copy `0006_snapshot.json` to
`0007_snapshot.json` and remove the `initialBalance` field from the
`users` table descriptor in the new file. The change should be exactly:
delete the `"initialBalance": { ... }` key/value from the `columns`
object of the users table; leave every other table and constraint
untouched.

If editing the snapshot JSON by hand seems risky, an alternative is to
run `npx drizzle-kit generate`. That tool tends to materialise the
column drop as a table-rebuild (`__new_users` + INSERT … SELECT + RENAME)
which is functionally equivalent but noisier than the hand-written
ALTER. Prefer the hand-written form for review clarity; only fall back
to `drizzle-kit generate` if the snapshot edit becomes intractable.

### Step 6: drop the helpers from `server/db.ts`

Delete these two blocks in full:

```ts
// server/db.ts:405-416
export async function updateUserInitialBalance(
  userId: number,
  initialBalance: string
) { … }
```

```ts
// server/db.ts:418-428
export async function getUserById(userId: number) { … }
```

Leave `getUserByOpenId` (line 387) alone — it is used by
`getOrCreateAnonymousUser`.

### Step 7: clean the tests

Per the "Tests that reference the dead column / helpers" list above,
delete every mock fixture entry naming `updateUserInitialBalance` or
`getUserById`.

For `server/sqlite.integration.test.ts`, two test cases call the dead
helper inside fork-worker template literals (lines 503 and 607). Inspect
each: if the surrounding `it(...)` block's meaningful assertion is about
account-balance behaviour that survives without the call, just delete
the offending lines (and the matching import). If the entire `it(...)`
case becomes meaningless without the call, delete the case in full and
note it in the commit message.

### Step 8: full gauntlet

```bash
grep -rn 'initialBalance' server/ --include='*.ts'
# Expected: only matches inside `accounts.initialBalance` / `account.initialBalance` references.
grep -rn 'updateUserInitialBalance\|\bgetUserById\b' --include='*.ts' --include='*.tsx' client server shared
# Expected: zero matches.

npm run format
npm run check                      # exit 0
npm test -- --run                  # see "Test plan" for expected count
```

### Step 9: smoke-test the migration on a real DB

Because this plan rewrites a column on a live SQLite file:

```bash
# Make a backup first; the user's data lives at data/crypto-trading-journal.sqlite
cp data/crypto-trading-journal.sqlite data/crypto-trading-journal.sqlite.bak

# Boot the dev server. The migration runs on first DB access.
NODE_OPTIONS='--experimental-sqlite' NODE_ENV=development \
  npx tsx server/_core/index.ts &
SERVER_PID=$!
sleep 3
# Hit a tRPC endpoint that touches the users table (anon user lookup):
curl -sf 'http://127.0.0.1:3000/api/trpc/account.list?input=%7B%7D' >/dev/null \
  && echo "OK"
kill $SERVER_PID
```

If the curl returns OK, the migration applied cleanly. If anything throws
"no such column initialBalance" the schema edit and migration body have
drifted — STOP and restore the backup.

## Test plan

- Existing tests cover the surviving behaviour. The total Vitest count
  may drop slightly (1-3 tests) if any `sqlite.integration.test.ts`
  cases lose meaning after the helper deletions; that is acceptable
  and should be called out in the commit message ("removed N obsolete
  user-balance integration tests").
- Verification command: `npm test -- --run`. Expected count is
  104 minus however many cases you deleted; if more than 3 tests vanish,
  re-read Step 7 — you may have over-deleted.
- The end-to-end smoke spec (`e2e/smoke.spec.ts`) is unchanged and must
  still pass.

## Done criteria

ALL must hold:

- [ ] `drizzle/schema.ts` no longer contains `initialBalance` on `users`.
- [ ] `drizzle/0007_drop_users_initial_balance.sql` exists with the one-line
      ALTER statement and a final newline.
- [ ] `drizzle/meta/_journal.json` contains an entry tagged
      `0007_drop_users_initial_balance`.
- [ ] `drizzle/meta/0007_snapshot.json` exists and omits the
      `initialBalance` column from the `users` table descriptor.
- [ ] `server/db.ts` no longer defines `updateUserInitialBalance` or
      `getUserById`.
- [ ] `grep -rn 'updateUserInitialBalance\|\bgetUserById\b' --include='*.ts' --include='*.tsx' client server shared`
      returns zero matches.
- [ ] `npm run check` exits 0.
- [ ] `npm test -- --run` reports `Tests N passed (N)` for some `N ≥ 101`.
- [ ] `npm run test:e2e` passes.
- [ ] The Step-9 smoke test (boot server + curl `account.list`) returns OK.
- [ ] `git status` shows changes only in the in-scope paths plus
      `plans/README.md`.
- [ ] `plans/README.md` row for plan 009 set to DONE.

## STOP conditions

Stop and report (do not improvise) if:

- Step 2 grep finds a non-test, non-historic-migration caller of
  `users.initialBalance` or `getUserById`. The plan's premise is broken.
- `drizzle/meta/0006_snapshot.json` has a structure significantly
  different from the hand-edit instructions (e.g. the schema layout has
  rotated to a new drizzle-kit version). Stop and ask whether to fall
  back to `drizzle-kit generate`.
- The boot-time migration in Step 9 fails with
  `no such column: initialBalance` (means the production DB has already
  diverged from the snapshot) or `near "DROP": syntax error` (means the
  SQLite binary is below 3.35 — the assumption was wrong; report
  `_sqliteDb.prepare("select sqlite_version()").get()` output).
- More than 3 tests would have to be deleted from
  `server/sqlite.integration.test.ts` to make things compile. The
  intent is to delete tests that are *meaningless* without the dead
  helpers, not to gut the integration suite. Resurface and ask.

## Maintenance notes

- After this plan, a single canonical "initial balance" lives at
  `accounts.initialBalance` (text decimal, not null, default `'0'`).
  Anywhere the docs or comments still say "initial balance set by user",
  the noun phrase is per-account.
- The migration runner in `server/db.ts:128-160` strips outer
  `BEGIN`/`COMMIT` and re-runs the file inside a single transaction.
  That code is unchanged; the new SQL fits its expectations.
- The schema invariant check in `assertClosedTradesHaveEndTime`
  (`server/db.ts:838`) is unaffected — it touches `transactions`, not
  `users`.
- If someone re-introduces a per-user balance later (e.g. for "global"
  aggregation across accounts), it belongs on a **new** column with a
  clearer name (`aggregatedInitialBalance`?) so future readers don't
  confuse it with the per-account balance that has always been the
  product's source of truth.
