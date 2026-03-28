## Task 1: SQLite Database Path Resolver

### Completed

- Created `server/_core/databasePath.ts` with `resolveDatabasePath()` function
- Updated `server/_core/env.ts` to use the resolver for `databaseUrl`
- Added Node engine guard `>=22.5.0` to `package.json` for `node:sqlite` availability

### Implementation Details

- Default path: `./data/crypto-trading-journal.sqlite` when DATABASE_URL is blank
- Preserves `:memory:` for in-memory databases (isolated cases)
- Allows `.tmp/*.sqlite` for test files
- Rejects paths under `dist/`, `build/`, `out/`, `.next/`, `.nuxt/`, `.output/`
- Returns clear error messages for forbidden paths

### Verification

- `npm run check` passes (TypeScript compiles)
- Default path resolution works correctly
- Memory path (`:memory:`) is preserved
- `dist/` paths are rejected with explicit error message

### Key Patterns

- Pure function design for testability
- Uses `node:path` for cross-platform path normalization
- Case-insensitive forbidden segment matching
- Maintains DATABASE_URL as the single env variable (no rename)

## Task 2: Fixed-Point Decimal Helper (Scale 2)

### Completed

- Added `server/_core/fixedPoint.ts` with `normalize`, `compare`, and `add`
- Added `server/_core/fixedPoint.test.ts` with coverage for canonicalization, rounding, comparison, addition, malformed input, and large-value arithmetic

### Implementation Details

- Locked scale at 2 decimals and normalized outputs to canonical `X.YY` string format
- Uses integer-string arithmetic internally (not floating-point and not SQLite REAL)
- Input validation accepts signed decimal-like strings and throws on malformed formats
- Rounding is handled at parse time to 2 decimals (half-up behavior on the 3rd decimal digit)
- Handles negative values and negative-zero normalization (`-0.00` becomes `0.00`)

### Verification

- `npx vitest run server/_core/fixedPoint.test.ts` passes (6/6 tests)
- `npm run check` passes
- `npm run build` passes in current environment (with existing non-blocking warnings)

## Task 3: Drizzle Schema + Config Migration to SQLite

### Completed

- Replaced MySQL schema builders in `drizzle/schema.ts` with SQLite builders from `drizzle-orm/sqlite-core`
- Converted enum-like columns (`role`, `direction`, `outcome`) to typed `text(...)` columns
- Converted financial decimal-like fields (`initialBalance`, `accountBalance`, `riskRewardRatio`, `returnAmount`) to `text(...)`
- Kept ID columns as auto-incrementing SQLite integer primary keys
- Replaced MySQL `bigint(..., { mode: "number" })` timestamps for trade times with SQLite `integer(..., { mode: "number" })`
- Migrated `createdAt`, `updatedAt`, `lastSignedIn` to Date-backed SQLite integer timestamps (`mode: "timestamp_ms"`) with `unixepoch() * 1000` defaults
- Updated `drizzle.config.ts` dialect from `"mysql"` to `"sqlite"`

### Verification

- `grep -nE 'mysqlTable|mysqlEnum|decimal\(|bigint\(|onUpdateNow\(' drizzle/schema.ts` returns no matches
- `grep -n 'dialect: "sqlite"' drizzle.config.ts` returns one active match
- `npm run check` currently fails due remaining MySQL-driver-specific typing/usages outside this task scope (notably `server/db.ts` still on `drizzle-orm/mysql2` + MySQL-only APIs like `onDuplicateKeyUpdate`/`insertId`), which produces cross-file type incompatibilities once schema is SQLite

## Task 4: SQLite Connection Lifecycle and Integration Test Harness

### Completed

- Migrated `server/db.ts` from MySQL driver (`drizzle-orm/mysql2`) to SQLite using `node:sqlite` via `drizzle-orm/sqlite-proxy`
- Created `server/sqlite.integration.test.ts` with setup/teardown helpers for temp database testing
- Added `closeDb()` helper function for graceful connection cleanup in tests

### Implementation Details

- Used `drizzle-orm/sqlite-proxy` driver since `drizzle-orm/node-sqlite` doesn't exist in drizzle-orm 0.44.5
- Created a proxy callback that wraps `DatabaseSync` from `node:sqlite` to interface with drizzle-orm
- Added automatic parent directory creation for file-backed databases (skipped for `:memory:`)
- Replaced MySQL-specific APIs:
  - `onDuplicateKeyUpdate` → `onConflictDoUpdate` with `target: users.openId`
  - `result[0].insertId` → `.returning()` for getting inserted row IDs
- Updated type from `BetterSQLite3Database` to `SqliteRemoteDatabase` for sqlite-proxy driver
- Added Vitest configuration to support `node:sqlite`:
  - Set `poolOptions.forks.execArgv` to `["--experimental-sqlite"]`
  - Configured `ssr.external` to include `node:sqlite`
  - Added custom Vite plugin to handle `node:sqlite` resolution

### Key Challenges

1. **drizzle-orm/node-sqlite doesn't exist**: The package only exports `better-sqlite3`, `bun-sqlite`, `durable-sqlite`, `expo-sqlite`, `op-sqlite`, and `sqlite-proxy` subpaths. Used `sqlite-proxy` with a custom callback as a workaround.

2. **Vitest/Vite module resolution for `node:sqlite`**: Vite doesn't recognize `node:sqlite` as a built-in module and tries to resolve it as a file. Required custom plugin configuration and externalization settings.

3. **Type casting for SQL parameters**: `node:sqlite`'s `SQLInputValue` type doesn't include `boolean`, requiring explicit casting from drizzle's `unknown[]` params.

### Integration Test Pattern

The integration test uses `execSync` to spawn child processes with the `--experimental-sqlite` flag, avoiding Vitest's module resolution issues while still testing the actual database connection flow.

### Verification

- `npm run check` passes (TypeScript compiles)
- `DATABASE_URL="$(pwd)/.tmp/task4.sqlite" node --experimental-sqlite --import tsx test-task4.ts` exits 0
- `npx vitest run server/sqlite.integration.test.ts` passes

## Task 5: SQLite-safe write paths and atomic multi-step mutations

### Completed

- Replaced MySQL-specific write assumptions in `server/db.ts` and router transaction flows in `server/routers.ts`
- Added transaction-scoped helper `runInSqliteTransaction(...)` and composite helpers:
  - `createTransactionWithElements(...)`
  - `deleteTransactionWithElements(...)`
- Updated router transaction create/delete mutations to use the composite helpers instead of split DB calls
- Added explicit `updatedAt: new Date()` writes on mutable update paths touched in this task

### Implementation Details

- `upsertUser()` now uses `onConflictDoUpdate({ target: users.openId, set: ... })` with explicit `updatedAt`
- Multi-step trading-system/element mutations are now wrapped in explicit SQLite transactions to prevent partial writes
- For sqlite-proxy reliability in this repo, transaction helper inserts use `last_insert_rowid()` when they need inserted IDs for follow-up writes
- Added SQLite integration tests for:
  - `upserts user on openId conflict`
  - `creates and deletes transaction elements atomically`

### Verification

- `npm run check` passes
- `DATABASE_URL="$(pwd)/.tmp/task5.sqlite" npx vitest run server/sqlite.integration.test.ts -t "upserts user on openId conflict"` passes
- `DATABASE_URL="$(pwd)/.tmp/task5.sqlite" npx vitest run server/sqlite.integration.test.ts -t "creates and deletes transaction elements atomically"` passes
- `grep -nE 'onDuplicateKeyUpdate|insertId' server/db.ts` returns no matches

## Task 6: Decimal semantics + explicit timestamp behavior on reads/stats

### Completed

- Reworked transaction sorting in `getTransactionsByUserId()` so `sortBy: "returnAmount"` uses application-side numeric sort via fixed-point `compare()`
- Replaced DB-side numeric aggregation/`parseFloat` arithmetic in `getCurrentBalance()`, `getStatistics()`, and `getSystemStatistics()` with fixed-point helper operations
- Updated router transaction-create balance math to use fixed-point `add()`
- Confirmed mutable update paths continue writing explicit `updatedAt: new Date()`

### Implementation Details

- Added decimal utility glue in `server/db.ts` to convert normalized fixed-point strings to integer cents and back for exact sums/averages
- Removed DB `SUM(returnAmount)` usage (unsafe when decimals are persisted as text)
- Kept DB-side ordering for non-decimal sortable fields (`createdAt`, `startTime`, `endTime`) and only switched `returnAmount` to in-memory sorting
- Added integration coverage in `server/sqlite.integration.test.ts` for:
  - numeric returnAmount sorting
  - exact balance/stat calculations from text decimals
  - explicit `updatedAt` refresh on mutable writes

### Key Migration Gotcha

- For `drizzle-orm/sqlite-proxy` + `node:sqlite`, result rows must be returned as value arrays (`Object.values(row)`) in the proxy callback; returning row objects can produce `undefined` fields after Drizzle mapping.

### Verification

- `npm run check` passes
- `DATABASE_URL="$(pwd)/.tmp/task6.sqlite" npx vitest run server/sqlite.integration.test.ts -t "sorts returnAmount numerically"` passes
- `DATABASE_URL="$(pwd)/.tmp/task6.sqlite" npx vitest run server/sqlite.integration.test.ts -t "computes current balance and stats exactly from text decimals"` passes
- `DATABASE_URL="$(pwd)/.tmp/task6.sqlite" npx vitest run server/sqlite.integration.test.ts -t "updates updatedAt on mutable writes"` passes

## Task 7: Reset Drizzle Migration Lineage to SQLite Baseline

### Completed

- Deleted the old MySQL migration SQL files and their `drizzle/meta/*` snapshots from the working tree
- Reset `drizzle/meta/_journal.json` to SQLite dialect so Drizzle Kit could regenerate from the rewritten schema
- Regenerated a fresh SQLite baseline migration: `drizzle/0000_glamorous_christian_walker.sql`
- Added a focused Vitest case that proves a clean bootstrap creates the expected core tables in a fresh SQLite file

### Implementation Details

- `drizzle-kit generate` would not start from a missing journal file, so an empty SQLite journal had to be seeded first
- `sqlite_sequence` appears in the bootstrap verification query and must be filtered out when asserting the core application tables
- Vitest/Vite still cannot import `node:sqlite` directly in this file, so the bootstrap assertion uses the existing `runNodeEval(...)` helper

### Verification

- `rm -f ".tmp/task7.sqlite" && DATABASE_URL="$(pwd)/.tmp/task7.sqlite" npm run db:push` passes
- `DATABASE_URL="$(pwd)/.tmp/task7.sqlite" npx vitest run server/sqlite.integration.test.ts -t "bootstrap creates expected core tables"` passes
- `grep -n '"dialect": "sqlite"' drizzle/meta/_journal.json` returns one active match
- `npm run check` passes

## Task 8: Remove MySQL Residue and Final Regression

### Completed

- Removed `mysql2` from `package.json` dependencies
- Verified no MySQL residue remains in the codebase (no `mysql2`, `mysql-core`, `dialect: "mysql"`, `onDuplicateKeyUpdate`, or `insertId` usage)
- Updated `server/transaction.test.ts` mock to include `createTransactionWithElements` and `deleteTransactionWithElements` functions
- Added db module mocks to `server/auth.logout.test.ts` and `server/tradingSystem.test.ts` to resolve `node:sqlite` import issues in Vitest
- Updated `vitest.config.ts` to better handle `node:sqlite` module resolution
- All integration tests remain comprehensive, covering:
  - Bootstrap creates expected core tables
  - Conflict upserts (onDuplicateKeyUpdate equivalent)
  - Inserted IDs via returning()
  - Decimal ordering and aggregation with fixed-point math
  - updatedAt behavior on mutable writes

### Files Modified

1. `package.json` - Removed `mysql2` dependency
2. `server/transaction.test.ts` - Added missing mock functions
3. `server/auth.logout.test.ts` - Added db module mock
4. `server/tradingSystem.test.ts` - Added db module mock
5. `vitest.config.ts` - Updated external module resolution

### Verification Results

- `npm run check` - TypeScript compilation passes (exit 0)
- `npm run test` - All 39 tests pass across 5 test files
- `DATABASE_URL="$(pwd)/.tmp/task8.sqlite" npx vitest run server/sqlite.integration.test.ts` - 8 integration tests pass
- `grep -rE "mysql2|mysql-core|dialect:\s*\"mysql\"|onDuplicateKeyUpdate|insertId"` - No matches found

### Key Insight

When migrating from MySQL to SQLite with `node:sqlite`, Vitest tests that import the appRouter (which transitively imports the db module) need to mock the db module to avoid the experimental `node:sqlite` import issue. The integration tests use a different pattern (spawned child processes) which works fine, but unit tests that directly import routers need the mock.

### Acceptance Criteria Met

- [x] No MySQL dependencies remain
- [x] Full test suite passes (39 tests)
- [x] TypeScript compilation passes
- [x] No active MySQL driver/dialect imports in runtime code
- [x] Integration test coverage is comprehensive

## Scope Fidelity Check (Final)

### Summary

- Audited plan requirements against current implementation files (`server/db.ts`, `server/_core/databasePath.ts`, `drizzle/schema.ts`, `drizzle.config.ts`, migration baseline SQL, and router surface).
- Confirmed SQLite-only runtime path and connection behavior with `node:sqlite` singleton usage.
- Confirmed financial fields remain text-backed and normalized via fixed-point helper (no SQLite `REAL`).

### Evidence Highlights

- Runtime singleton + SQLite driver usage:
  - `server/db.ts` imports `DatabaseSync` from `node:sqlite` and maintains process-level `_db` / `_sqliteDb` singletons.
- `DATABASE_URL` path contract and default:
  - `server/_core/env.ts` resolves `process.env.DATABASE_URL` through `resolveDatabasePath(...)`.
  - `server/_core/databasePath.ts` defaults to `./data/crypto-trading-journal.sqlite`, preserves `:memory:`, and rejects build-output directories.
- Schema/storage constraints:
  - `drizzle/schema.ts` keeps `initialBalance`, `accountBalance`, `riskRewardRatio`, `returnAmount` as `text(...)`.
  - `isActive` and `isReviewed` are `integer(...)` with `0/1` semantics.
- Timestamp updates:
  - `server/db.ts` applies explicit `updatedAt: new Date()` on mutable update paths; no `onUpdateNow()` remains.
- Migration baseline:
  - `drizzle/meta/_journal.json` dialect is `sqlite`.
  - Single fresh baseline SQL file exists: `drizzle/0000_glamorous_christian_walker.sql`.
- Scope guardrails:
  - No active MySQL runtime imports/usages in app source (`server/`, `drizzle.config.ts`, `drizzle/schema.ts`).
  - No new foreign key clauses in generated SQLite baseline SQL.
  - Router API remains tRPC-based; no ad hoc REST endpoints introduced.

### Verification Runs

- `npm run check` passed.
- `npm run build` passed (with non-blocking Vite/Node version warnings in this environment).
