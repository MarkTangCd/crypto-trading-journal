# MySQL to SQLite Storage Migration

## TL;DR

> **Summary**: Replace the repo's MySQL-specific Drizzle schema, config, and DB-layer behavior with a local single-instance SQLite implementation using `node:sqlite`, while keeping current API contracts stable and starting a fresh SQLite migration baseline.
> **Deliverables**:
>
> - SQLite-ready Drizzle schema and config
> - SQLite DB connection and query/write semantics in `server/db.ts`
> - Fixed-point helper strategy for decimal-like values
> - Fresh SQLite migration lineage
> - Real SQLite integration coverage plus full regression verification
>   **Effort**: Medium
>   **Parallel**: YES - 3 waves
>   **Critical Path**: 1 → 2/3 → 4/5/6 → 7/8

## Context

### Original Request

Change the current project's storage from MySQL to SQLite and outline the modification plan.

### Interview Summary

- Migration mode: fresh start; no MySQL data backfill is required.
- Runtime target: local single-instance SQLite deployment.
- Test strategy: tests-after, with explicit SQLite integration coverage added because current Vitest coverage mocks `./db`.
- Planning defaults locked from repo facts: keep `DATABASE_URL` as the env contract, use built-in `node:sqlite`, keep public API payload shapes stable, and do not add new foreign-key enforcement during this migration.

### Metis Review (gaps addressed)

- Locked file-path/env defaults to avoid runtime ambiguity.
- Added guardrails for decimal sorting/aggregation, `updatedAt` behavior, and MySQL migration reset.
- Converted open-ended SQLite choices into explicit defaults: `node:sqlite`, fixed-scale normalized text for decimal-like fields, and a fresh SQLite baseline migration.
- Expanded verification beyond mocked unit tests to require real-SQLite integration scenarios.

## Work Objectives

### Core Objective

Migrate persistence from MySQL to SQLite without changing user-facing API shapes, while preserving current domain behavior for IDs, timestamps, boolean-like flags, and decimal-like trading values.

### Deliverables

- `drizzle/schema.ts` rewritten from MySQL builders to SQLite builders with explicit type decisions.
- `drizzle.config.ts` and runtime env contract aligned to SQLite file paths.
- `server/db.ts` migrated off MySQL driver/upsert/insert-id assumptions.
- Shared fixed-point helper for decimal-like storage/query logic.
- MySQL migration files replaced with a fresh SQLite baseline.
- SQLite integration test harness covering real database behavior.

### Definition of Done (verifiable conditions with commands)

- `DATABASE_URL="$(pwd)/.tmp/ctj-plan-verify.sqlite" npm run db:push` exits `0` and produces a usable SQLite schema.
- `DATABASE_URL="$(pwd)/.tmp/ctj-plan-verify.sqlite" npx vitest run server/sqlite.integration.test.ts` exits `0`.
- `npm run check` exits `0`.
- `npm run test` exits `0`.
- `grep -R "mysql2\|mysql-core\|dialect: \"mysql\"\|onDuplicateKeyUpdate\|insertId" package.json drizzle.config.ts drizzle server` returns no active implementation matches.

### Must Have

- Use built-in `node:sqlite` with a process-wide singleton connection.
- Keep `DATABASE_URL` as the only required DB env variable; interpret it as a SQLite path.
- Standard runtime DB path: `./data/crypto-trading-journal.sqlite`; integration-test DB path: `.tmp/*.sqlite`.
- Keep money/ratio API values as normalized strings with scale `2`.
- Keep `isActive` and `isReviewed` as `0/1` integer flags.
- Replace MySQL `onUpdateNow()` semantics with explicit DB-layer `updatedAt` writes.
- Generate a fresh SQLite migration baseline instead of manually converting existing MySQL SQL files.

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)

- Must NOT preserve MySQL data in this migration.
- Must NOT add dual MySQL/SQLite support.
- Must NOT use SQLite `REAL` for `initialBalance`, `accountBalance`, `returnAmount`, or `riskRewardRatio`.
- Must NOT move the runtime DB file under `dist/` or any build-output directory.
- Must NOT introduce new foreign keys, REST endpoints, or public API shape changes.
- Must NOT rely on lexicographic sorting of decimal-like strings.

## Verification Strategy

> ZERO HUMAN INTERVENTION — all verification is agent-executed.

- Test decision: tests-after, plus a required real-SQLite integration suite for migration-risk behaviors.
- Framework: Vitest (`vitest.config.ts:15-18`) with Node environment.
- QA policy: Every task includes concrete happy-path and failure/edge-case checks.
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy

### Parallel Execution Waves

> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: runtime/env contract, SQLite schema rewrite, decimal helper contract
Wave 2: SQLite connection lifecycle, write-path migration, numeric query/timestamp semantics
Wave 3: fresh migration baseline, SQLite integration suite

### Dependency Matrix (full, all tasks)

- 1 blocks 3, 4, 7, 8
- 2 blocks 5, 6, 8
- 3 blocks 4, 5, 6, 7, 8
- 4 blocks 5, 6, 7, 8
- 5 blocks 7, 8
- 6 blocks 7, 8
- 7 blocks 8
- 8 blocks Final Verification Wave

### Agent Dispatch Summary (wave → task count → categories)

- Wave 1 → 3 tasks → `unspecified-high`, `deep`
- Wave 2 → 3 tasks → `unspecified-high`, `deep`
- Wave 3 → 2 tasks → `quick`, `deep`

## TODOs

> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Lock the SQLite runtime/env/path contract

  **What to do**: Keep `DATABASE_URL` as the DB env var, but redefine it as a SQLite path contract. Add a small runtime path resolver (recommended file: `server/_core/databasePath.ts`) that returns `process.cwd()/data/crypto-trading-journal.sqlite` when `DATABASE_URL` is blank, preserves `:memory:` for isolated cases, allows `.tmp/*.sqlite` for tests, and rejects any path under `dist/` or another build-output directory. Add a Node runtime guard in `package.json` for the `node:sqlite` baseline used by this plan. Do **not** remove `mysql2` yet; cleanup belongs in Task 8.
  **Must NOT do**: Do not rename `DATABASE_URL`; do not point the default DB into `dist/`; do not add dual-path logic for MySQL fallback.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: touches runtime contract, env handling, and package metadata across multiple files.
  - Skills: none — Reason: no special skill is required beyond careful repo-local changes.
  - Omitted: [`git-master`] — Reason: this task is implementation planning, not git history work.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 3, 4, 7, 8 | Blocked By: none

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `server/_core/env.ts:1-10` — current env surface already exposes `databaseUrl` from `DATABASE_URL`.
  - Pattern: `drizzle.config.ts:3-15` — current Drizzle commands already rely on `DATABASE_URL`; preserve that contract.
  - Pattern: `package.json:6-14,81-104` — scripts exist, but no Node engine guard is defined yet.
  - Pattern: `.gitignore:104-107` — SQLite files are already ignored by extension; a `data/*.sqlite` default path is safe.
  - External: `https://orm.drizzle.team/docs/connect-node-sqlite` — `node:sqlite` runtime expectations and connection guidance.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `npx tsx --eval "import { resolveDatabasePath } from './server/_core/databasePath.ts'; const p = resolveDatabasePath(''); if (!p.endsWith('/data/crypto-trading-journal.sqlite')) throw new Error(p);"` exits `0`.
  - [ ] `npx tsx --eval "import { resolveDatabasePath } from './server/_core/databasePath.ts'; if (resolveDatabasePath(':memory:') !== ':memory:') throw new Error('bad-memory-path');"` exits `0`.
  - [ ] `npm run check` exits `0`.

  **QA Scenarios** (MANDATORY — task incomplete without these):

  ```
  Scenario: Default runtime path resolves correctly
    Tool: Bash
    Steps: Run `npx tsx --eval "import { resolveDatabasePath } from './server/_core/databasePath.ts'; process.stdout.write(resolveDatabasePath(''));"`
    Expected: Output ends with `/data/crypto-trading-journal.sqlite`
    Evidence: .sisyphus/evidence/task-1-runtime-path.txt

  Scenario: Forbidden build-output path is rejected
    Tool: Bash
    Steps: Run `npx tsx --eval "import { resolveDatabasePath } from './server/_core/databasePath.ts'; resolveDatabasePath('dist/blocked.sqlite');"`
    Expected: Command exits non-zero with an error mentioning `dist`
    Evidence: .sisyphus/evidence/task-1-runtime-path-error.txt
  ```

  **Commit**: YES | Message: `chore(runtime): lock sqlite env and path contract` | Files: `package.json`, `server/_core/env.ts`, `server/_core/databasePath.ts`

- [x] 2. Add a fixed-point helper for decimal-like trading values

  **What to do**: Introduce a server-side helper (recommended file: `server/_core/fixedPoint.ts`) that becomes the single approved way to normalize, compare, and add SQLite-stored decimal-like strings. Lock scale `2` for all current decimal columns: `initialBalance`, `accountBalance`, `riskRewardRatio`, and `returnAmount`. Export a small, explicit API: normalize input to a canonical two-decimal string, compare two normalized values numerically, and add a list of values without relying on SQLite `REAL` or raw `parseFloat` math.
  **Must NOT do**: Do not change public API values from strings to numbers; do not use SQLite `REAL`; do not scatter new `parseFloat(...).toFixed(2)` logic across routers or DB helpers.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: correctness-sensitive financial normalization logic affects later DB reads, writes, and stats.
  - Skills: none — Reason: repo-local arithmetic rules are more important than generic library usage.
  - Omitted: [`git-master`] — Reason: no git-specific operation is required.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 5, 6, 8 | Blocked By: none

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `drizzle/schema.ts:17-19,93-113` — all decimal-like columns currently use MySQL `decimal(..., { scale: 2 })`.
  - Pattern: `server/db.ts:497-505,539-552,608-623` — current balance/stat math depends on `parseFloat` over string decimals.
  - Pattern: `server/routers.ts:219-245` — transaction creation currently computes `newBalance` with `parseFloat(...).toFixed(2)`.
  - Test: `server/transaction.test.ts:7-58` — existing mocked tests already treat these values as strings.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `npx vitest run server/_core/fixedPoint.test.ts` exits `0`.
  - [ ] The helper test suite proves `normalize("2.5") === "2.50"`, `add(["10.05","-1.25"]) === "8.80"`, and `compare("10.05","2.10") > 0`.

  **QA Scenarios** (MANDATORY — task incomplete without these):

  ```
  Scenario: Positive and negative values normalize and sum exactly
    Tool: Bash
    Steps: Run `npx vitest run server/_core/fixedPoint.test.ts -t "normalizes and sums scaled decimals"`
    Expected: Command exits 0 and the targeted test passes for `10.05`, `-1.25`, and `2.10`
    Evidence: .sisyphus/evidence/task-2-fixed-point.txt

  Scenario: Invalid decimal input is rejected
    Tool: Bash
    Steps: Run `npx vitest run server/_core/fixedPoint.test.ts -t "rejects malformed decimal strings"`
    Expected: Command exits 0 and the targeted test confirms malformed input throws
    Evidence: .sisyphus/evidence/task-2-fixed-point-error.txt
  ```

  **Commit**: YES | Message: `feat(db): add fixed-point decimal helper` | Files: `server/_core/fixedPoint.ts`, `server/_core/fixedPoint.test.ts`

- [x] 3. Rewrite Drizzle schema and config for SQLite

  **What to do**: Convert `drizzle/schema.ts` from MySQL builders to SQLite builders and align `drizzle.config.ts` to SQLite. Use `sqliteTable` and SQLite column builders. Keep IDs as auto-incrementing integer primary keys. Store `createdAt`, `updatedAt`, and `lastSignedIn` as Date-backed SQLite integer timestamps (`timestamp_ms` mode), keep `startTime` and `endTime` as integer millisecond numbers, and convert enum-like columns (`role`, `direction`, `outcome`) to typed text columns that preserve current string unions. Convert all current decimal-like fields to text columns and leave numeric semantics to Task 2's helper.
  **Must NOT do**: Do not use SQLite `real()` for financial fields; do not keep any `mysqlTable`, `mysqlEnum`, `decimal`, `bigint`, or `onUpdateNow()` usage; do not manually edit SQL migration output in this task.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: schema decisions define runtime types, query semantics, and migration output for the entire app.
  - Skills: none — Reason: the task is driven by repo schema constraints and Drizzle SQLite mapping.
  - Omitted: [`git-master`] — Reason: no git-specific workflow is needed.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 4, 5, 6, 7, 8 | Blocked By: 1

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `drizzle/schema.ts:1-146` — current MySQL schema source of truth.
  - Pattern: `drizzle.config.ts:3-15` — current MySQL dialect config using `DATABASE_URL`.
  - Pattern: `drizzle/0000_flat_doomsday.sql:1-13` — current migration demonstrates MySQL-specific enum and `ON UPDATE CURRENT_TIMESTAMP` behavior that must disappear.
  - External: `https://orm.drizzle.team/docs/sql-schema-declaration` — schema declaration guidance.
  - External: `https://orm.drizzle.team/docs/drizzle-config-file` — config guidance for SQLite dialect setup.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `npm run check` exits `0`.
  - [ ] `grep -nE 'mysqlTable|mysqlEnum|decimal\(|bigint\(|onUpdateNow\(' drizzle/schema.ts` returns no matches.
  - [ ] `grep -n 'dialect: "sqlite"' drizzle.config.ts` returns exactly one active match.

  **QA Scenarios** (MANDATORY — task incomplete without these):

  ```
  Scenario: Schema imports and config are SQLite-only
    Tool: Bash
    Steps: Run `grep -nE 'mysqlTable|mysqlEnum|decimal\(|bigint\(|onUpdateNow\(' drizzle/schema.ts && exit 1 || exit 0`; then run `grep -n 'dialect: "sqlite"' drizzle.config.ts`
    Expected: First command exits 0 with no MySQL-builder matches; second command shows the SQLite dialect line
    Evidence: .sisyphus/evidence/task-3-schema.txt

  Scenario: Decimal-like columns stay text-based, not floating-point
    Tool: Bash
    Steps: Run `grep -nE 'initialBalance|accountBalance|riskRewardRatio|returnAmount' drizzle/schema.ts`
    Expected: All four columns are declared with text-based SQLite columns; none use `real(`
    Evidence: .sisyphus/evidence/task-3-schema-error.txt
  ```

  **Commit**: YES | Message: `feat(schema): migrate drizzle schema and config to sqlite` | Files: `drizzle/schema.ts`, `drizzle.config.ts`

- [x] 4. Migrate the SQLite connection lifecycle and add a real-SQLite harness

  **What to do**: Replace the MySQL driver usage in `server/db.ts` with `drizzle-orm/node-sqlite`, using a process-wide singleton connection that reads the resolved path from Task 1. Ensure the DB parent directory exists before opening file-backed databases, skip directory creation for `:memory:`, and keep `getDb()` as the existing central entry point. Introduce a reusable SQLite integration-test harness (recommended file: `server/sqlite.integration.test.ts` plus any small setup helper) that can create and clean temp DB files under `.tmp/`.
  **Must NOT do**: Do not open a fresh connection per request; do not store the DB file in `dist/`; do not bring in `better-sqlite3` or another driver while Node 22.5+ is the locked baseline.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: combines runtime connection behavior with a reusable integration harness.
  - Skills: none — Reason: this is repo-specific DB wiring rather than external tool orchestration.
  - Omitted: [`git-master`] — Reason: no git-specific work is needed.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 5, 6, 7, 8 | Blocked By: 1, 3

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `server/db.ts:1-24` — current MySQL driver import and lazy `getDb()` entry point.
  - Pattern: `package.json:7-9` — dev/build/start commands keep the server in Node, so runtime path resolution must work outside `dist/` assumptions.
  - Pattern: `vitest.config.ts:15-18` — existing tests run under Node and can host a real SQLite harness.
  - External: `https://orm.drizzle.team/docs/connect-node-sqlite` — supported `node:sqlite` connection patterns.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `DATABASE_URL="$(pwd)/.tmp/task4.sqlite" npx tsx --eval "const { getDb } = await import('./server/db.ts'); const db = await getDb(); if (!db) throw new Error('no-db');"` exits `0`.
  - [ ] `DATABASE_URL="$(pwd)/.tmp/task4.sqlite" npx vitest run server/sqlite.integration.test.ts -t "opens a sqlite connection with a temp file"` exits `0`.

  **QA Scenarios** (MANDATORY — task incomplete without these):

  ```
  Scenario: File-backed temp SQLite connection opens successfully
    Tool: Bash
    Steps: Run `DATABASE_URL="$(pwd)/.tmp/task4.sqlite" npx vitest run server/sqlite.integration.test.ts -t "opens a sqlite connection with a temp file"`
    Expected: Command exits 0 and the test proves `getDb()` returns a usable SQLite connection
    Evidence: .sisyphus/evidence/task-4-sqlite-connection.txt

  Scenario: Forbidden build-output DB path is blocked at runtime
    Tool: Bash
    Steps: Run `DATABASE_URL="dist/blocked.sqlite" npx tsx --eval "const { getDb } = await import('./server/db.ts'); await getDb();"`
    Expected: Command exits non-zero with an error explaining that build-output DB paths are not allowed
    Evidence: .sisyphus/evidence/task-4-sqlite-connection-error.txt
  ```

  **Commit**: YES | Message: `feat(db): switch runtime connection to node-sqlite` | Files: `server/db.ts`, `server/sqlite.integration.test.ts`, `server/_core/databasePath.ts`

- [x] 5. Replace MySQL-specific write paths and make multi-step mutations atomic

  **What to do**: Convert every MySQL-specific write path in `server/db.ts` to SQLite-safe behavior. Replace `onDuplicateKeyUpdate` in `upsertUser()` with `onConflictDoUpdate({ target: users.openId, ... })` and include `updatedAt: new Date()` in the update set. Replace all `result[0].insertId` usage with SQLite-compatible `returning({ id: table.id })`. Wrap multi-step trading-system mutations inside SQLite transactions, and introduce composite transaction helpers for router flows that are currently split across calls: create transaction + add element rows, and delete transaction + remove element rows. Update `server/routers.ts` to call those composite helpers so a later failure cannot leave partial state.
  **Must NOT do**: Do not leave any `insertId` or `onDuplicateKeyUpdate` usage behind; do not keep router-level create/delete flows split across separate non-transactional DB calls; do not rely on foreign-key failures for rollback because the current schema does not enforce them.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: this task changes correctness-critical write behavior and transaction boundaries.
  - Skills: none — Reason: repo behavior matters more than generic tooling.
  - Omitted: [`git-master`] — Reason: no git workflow is required.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 8 | Blocked By: 2, 3, 4

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `server/db.ts:26-83` — `upsertUser()` currently uses MySQL `onDuplicateKeyUpdate`.
  - Pattern: `server/db.ts:127-136,186-210,364-372` — create functions currently depend on `result[0].insertId`.
  - Pattern: `server/db.ts:264-345,645-682` — multi-step update/delete flows that should be transaction-scoped.
  - Pattern: `server/routers.ts:203-255` — transaction creation currently inserts the main row and element rows in separate calls.
  - Pattern: `server/routers.ts:300-307` — transaction deletion currently removes element rows and the main row in separate calls.
  - Pattern: `drizzle/0000_flat_doomsday.sql:11-12` — `users.openId` already has the unique target needed for SQLite conflict updates.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `DATABASE_URL="$(pwd)/.tmp/task5.sqlite" npx vitest run server/sqlite.integration.test.ts -t "upserts user on openId conflict"` exits `0`.
  - [ ] `DATABASE_URL="$(pwd)/.tmp/task5.sqlite" npx vitest run server/sqlite.integration.test.ts -t "creates and deletes transaction elements atomically"` exits `0`.
  - [ ] `grep -nE 'onDuplicateKeyUpdate|insertId' server/db.ts` returns no matches.

  **QA Scenarios** (MANDATORY — task incomplete without these):

  ```
  Scenario: Upsert updates the existing user instead of creating a duplicate row
    Tool: Bash
    Steps: Run `DATABASE_URL="$(pwd)/.tmp/task5.sqlite" npx vitest run server/sqlite.integration.test.ts -t "upserts user on openId conflict"`
    Expected: Command exits 0 and the test proves one `openId` row remains after the second write
    Evidence: .sisyphus/evidence/task-5-write-paths.txt

  Scenario: Transaction create/delete flow handles edge cases without partial rows
    Tool: Bash
    Steps: Run `DATABASE_URL="$(pwd)/.tmp/task5.sqlite" npx vitest run server/sqlite.integration.test.ts -t "creates and deletes transaction elements atomically"`
    Expected: Command exits 0 and the test proves no orphaned junction rows remain after create/delete flows, including the empty-element edge case
    Evidence: .sisyphus/evidence/task-5-write-paths-error.txt
  ```

  **Commit**: YES | Message: `feat(db): replace mysql write semantics with sqlite transactions` | Files: `server/db.ts`, `server/routers.ts`, `server/sqlite.integration.test.ts`

- [x] 6. Replace numeric query semantics and timestamp update behavior on reads/stats

  **What to do**: Remove reliance on DB-side numeric behavior that no longer works once decimal-like fields are stored as text. Update `getTransactionsByUserId()` so `sortBy === "returnAmount"` performs application-side numeric ordering with the Task 2 helper; keep DB-side ordering only for non-decimal sortable columns. Update `getCurrentBalance()`, `getStatistics()`, `getSystemStatistics()`, and router-side transaction creation math to use the fixed-point helper instead of raw `parseFloat` arithmetic. Ensure every update path that changes mutable entities also writes `updatedAt: new Date()` explicitly so timestamp behavior remains correct without MySQL `onUpdateNow()`.
  **Must NOT do**: Do not use SQLite `SUM()` or `ORDER BY` directly over text-based decimal fields for money-sensitive logic; do not leave any mutable update path without an explicit `updatedAt` write.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: query correctness and timestamp semantics are the highest migration-risk areas after writes.
  - Skills: none — Reason: the challenge is domain correctness, not external API complexity.
  - Omitted: [`git-master`] — Reason: no git-specific work is required.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 8 | Blocked By: 2, 3, 4

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `server/db.ts:387-434` — current transaction list sorting is DB-driven and would sort text decimals lexicographically.
  - Pattern: `server/db.ts:491-583` — current balance/stat math uses `SUM()` and `parseFloat` over DB values.
  - Pattern: `server/db.ts:585-629` — per-system stats also aggregate decimal strings.
  - Pattern: `server/routers.ts:204-245` — transaction creation computes `newBalance` with raw floating-point math.
  - Pattern: `server/db.ts:99-123,160-168,273-345,436-444` — update paths that must set `updatedAt` explicitly.
  - Pattern: `server/_core/fixedPoint.ts` — single approved numeric helper from Task 2.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `DATABASE_URL="$(pwd)/.tmp/task6.sqlite" npx vitest run server/sqlite.integration.test.ts -t "sorts returnAmount numerically"` exits `0`.
  - [ ] `DATABASE_URL="$(pwd)/.tmp/task6.sqlite" npx vitest run server/sqlite.integration.test.ts -t "computes current balance and stats exactly from text decimals"` exits `0`.
  - [ ] `DATABASE_URL="$(pwd)/.tmp/task6.sqlite" npx vitest run server/sqlite.integration.test.ts -t "updates updatedAt on mutable writes"` exits `0`.

  **QA Scenarios** (MANDATORY — task incomplete without these):

  ```
  Scenario: Decimal-like sorting and stats stay numerically correct
    Tool: Bash
    Steps: Run `DATABASE_URL="$(pwd)/.tmp/task6.sqlite" npx vitest run server/sqlite.integration.test.ts -t "computes current balance and stats exactly from text decimals|sorts returnAmount numerically"`
    Expected: Command exits 0 and the suite proves `10.05`, `2.10`, and `-1.25` sort numerically and aggregate exactly
    Evidence: .sisyphus/evidence/task-6-query-semantics.txt

  Scenario: Timestamp updates remain monotonic without MySQL helpers
    Tool: Bash
    Steps: Run `DATABASE_URL="$(pwd)/.tmp/task6.sqlite" npx vitest run server/sqlite.integration.test.ts -t "updates updatedAt on mutable writes"`
    Expected: Command exits 0 and the test proves `createdAt` is stable while `updatedAt` increases after mutation
    Evidence: .sisyphus/evidence/task-6-query-semantics-error.txt
  ```

  **Commit**: YES | Message: `feat(db): preserve sqlite numeric and timestamp semantics` | Files: `server/db.ts`, `server/routers.ts`, `server/sqlite.integration.test.ts`

- [x] 7. Reset the Drizzle migration lineage and prove a clean SQLite bootstrap

  **What to do**: Replace the active MySQL migration history with a fresh SQLite baseline generated from the rewritten schema. Delete the current active MySQL SQL files and `drizzle/meta/*` metadata from the working tree, then regenerate a new SQLite baseline with the repo's standard `db:push` flow. Treat git history as the archive for the old MySQL lineage; do not try to maintain both dialects side-by-side. Use a temp SQLite file under `.tmp/` to prove the bootstrap works from empty state.
  **Must NOT do**: Do not hand-convert the old MySQL SQL files to SQLite; do not keep `drizzle/meta/_journal.json` showing `"dialect": "mysql"`; do not run baseline generation against the runtime `data/` DB file.

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: once schema/runtime decisions are locked, this is a focused migration-baseline regeneration task.
  - Skills: none — Reason: no external specialization is needed beyond careful command verification.
  - Omitted: [`git-master`] — Reason: commit strategy is already defined separately.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 8 | Blocked By: 1, 3, 4, 5, 6

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `drizzle.config.ts:3-15` — active Drizzle config currently drives migration generation.
  - Pattern: `drizzle/0000_flat_doomsday.sql:1-13` — current baseline is explicitly MySQL-only.
  - Pattern: `drizzle/meta/_journal.json:1-34` — current migration metadata still declares `"dialect": "mysql"`.
  - Pattern: `package.json:12-14` — `db:push` remains the repo-standard migration command.
  - External: `https://orm.drizzle.team/docs/migrations` — Drizzle migration workflow guidance.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `rm -f ".tmp/task7.sqlite" && DATABASE_URL="$(pwd)/.tmp/task7.sqlite" npm run db:push` exits `0`.
  - [ ] `DATABASE_URL="$(pwd)/.tmp/task7.sqlite" npx vitest run server/sqlite.integration.test.ts -t "bootstrap creates expected core tables"` exits `0`.
  - [ ] `grep -n '"dialect": "sqlite"' drizzle/meta/_journal.json` returns one active match.

  **QA Scenarios** (MANDATORY — task incomplete without these):

  ```
  Scenario: Empty SQLite database bootstraps from the new baseline
    Tool: Bash
    Steps: Run `rm -f ".tmp/task7.sqlite" && DATABASE_URL="$(pwd)/.tmp/task7.sqlite" npm run db:push`; then run `DATABASE_URL="$(pwd)/.tmp/task7.sqlite" npx vitest run server/sqlite.integration.test.ts -t "bootstrap creates expected core tables"`
    Expected: Both commands exit 0 and the test confirms the expected tables exist in the new SQLite file
    Evidence: .sisyphus/evidence/task-7-bootstrap.txt

  Scenario: Re-running the migration flow does not reintroduce MySQL metadata
    Tool: Bash
    Steps: Run `DATABASE_URL="$(pwd)/.tmp/task7.sqlite" npm run db:push`; then run `grep -n '"dialect": "sqlite"' drizzle/meta/_journal.json`
    Expected: The command stays green on a second run and the journal still reports SQLite, not MySQL
    Evidence: .sisyphus/evidence/task-7-bootstrap-error.txt
  ```

  **Commit**: YES | Message: `chore(migrations): reset drizzle baseline for sqlite` | Files: `drizzle/*`, `drizzle/meta/*`, `drizzle.config.ts`

- [x] 8. Remove MySQL residue, finish SQLite integration coverage, and run full regression

  **What to do**: Remove remaining MySQL-specific residue after the SQLite flow is green. This includes removing `mysql2` from `package.json`, ensuring no active MySQL driver/dialect imports remain, and expanding `server/sqlite.integration.test.ts` so it permanently covers bootstrap, conflict upserts, inserted IDs, decimal ordering/aggregation, and `updatedAt` behavior. Keep the existing mocked Vitest files as-is unless tiny type updates are required for compatibility. Finish by running the full repo regression (`npm run check`, `npm run test`) against the SQLite-only implementation.
  **Must NOT do**: Do not delete the mocked router tests wholesale; do not leave active `mysql2`, `mysql-core`, or `dialect: "mysql"` matches in the runtime codebase; do not weaken the integration suite to only happy-path coverage.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: cleanup, regression coverage, and final SQLite-only validation all converge here.
  - Skills: none — Reason: test and residue cleanup are repo-specific.
  - Omitted: [`git-master`] — Reason: final commit flow is already specified in the plan.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: Final Verification Wave | Blocked By: 1, 2, 3, 4, 5, 6, 7

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `package.json:63` — `mysql2` is the dependency that must disappear once SQLite is working.
  - Pattern: `server/db.ts:1-24` — runtime DB import surface must be SQLite-only.
  - Pattern: `drizzle/schema.ts:1-146` — schema must stay SQLite-only after cleanup.
  - Pattern: `drizzle.config.ts:8-15` — config must stay SQLite-only after cleanup.
  - Test: `server/transaction.test.ts:1-97` — mocked tests are still valuable and should remain intact.
  - Test: `vitest.config.ts:15-18` — full test command will pick up all server-side tests.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `grep -R "mysql2\|mysql-core\|dialect: \"mysql\"\|onDuplicateKeyUpdate\|insertId" package.json drizzle.config.ts drizzle server` returns no active implementation matches.
  - [ ] `npm run check` exits `0`.
  - [ ] `npm run test` exits `0`.
  - [ ] `DATABASE_URL="$(pwd)/.tmp/task8.sqlite" npx vitest run server/sqlite.integration.test.ts` exits `0`.

  **QA Scenarios** (MANDATORY — task incomplete without these):

  ```
  Scenario: Full SQLite integration suite passes end-to-end
    Tool: Bash
    Steps: Run `DATABASE_URL="$(pwd)/.tmp/task8.sqlite" npx vitest run server/sqlite.integration.test.ts`
    Expected: Command exits 0 and the suite covers bootstrap, upsert, inserted IDs, decimal ordering/aggregation, and `updatedAt`
    Evidence: .sisyphus/evidence/task-8-sqlite-regression.txt

  Scenario: MySQL residue is fully removed from active code paths
    Tool: Bash
    Steps: Run `grep -R "mysql2\|mysql-core\|dialect: \"mysql\"\|onDuplicateKeyUpdate\|insertId" package.json drizzle.config.ts drizzle server`
    Expected: Command returns no active implementation matches
    Evidence: .sisyphus/evidence/task-8-sqlite-regression-error.txt
  ```

  **Commit**: YES | Message: `chore(cleanup): remove mysql residue and verify sqlite-only flow` | Files: `package.json`, `server/db.ts`, `drizzle/schema.ts`, `drizzle.config.ts`, `server/sqlite.integration.test.ts`

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.

- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Real Manual QA — unspecified-high
- [x] F4. Scope Fidelity Check — deep

## Commit Strategy

- Use green-only commits.
- Recommended sequence:
  1. `chore(runtime): lock sqlite path and env contract`
  2. `feat(db): add fixed-point decimal helper`
  3. `feat(schema): migrate drizzle schema to sqlite`
  4. `feat(db): replace mysql-specific db behavior`
  5. `chore(migrations): reset drizzle baseline for sqlite`
  6. `test(sqlite): add integration coverage for ids timestamps and decimals`
  7. `chore(cleanup): remove mysql residue and verify sqlite-only flow`

## Success Criteria

- Active runtime, schema, and migration flow all use SQLite only.
- Existing router-facing behavior stays compatible with current tests and consumers.
- Decimal-like values remain correct for persistence, sorting, and aggregation.
- Timestamp updates remain correct without MySQL-only features.
- A fresh clone can bootstrap a SQLite DB and pass typecheck + test suites without MySQL installed.
