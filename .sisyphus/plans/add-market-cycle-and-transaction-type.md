# Add Market Cycle & Transaction Type to Transactions

## TL;DR

> **Quick Summary**: Add two new required Select fields — Market Cycle (7 options) and Transaction Type (2 options) — to the New Trade creation form, and display + filter them in the Transactions list page.
>
> **Deliverables**:
>
> - Two new DB columns (`marketCycle`, `transactionType`) on the `transactions` table
> - Shared constants + types for both enums
> - Updated tRPC `create` input requiring both fields
> - Updated tRPC `list` supporting filtering by both fields
> - Two new `<Select>` fields in the New Trade form
> - Two new table columns + two filter dropdowns in the Transactions list
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 → Task 2 → Tasks 3+4 (parallel) → Final Verification

---

## Context

### Original Request

User wants to add two new Select properties when creating a trade:

- **Market Cycle (市场周期)**: Trading Range, Upward Tight Channel, Downward Tight Channel, Upward Channel, Downward Channel, Upward Trend, Downward Trend
- **Transaction Type (交易类型)**: Trend, Reversal

Both required on creation. Also display + filter in Transactions list.

### Interview Summary

**Key Discussions**:

- Both fields **required** when creating a new trade
- Transactions list needs both **display columns** and **filter dropdowns**

**Research Findings**:

- Existing Select pattern: shadcn/ui `Select` with `SelectTrigger/SelectValue/SelectContent/SelectItem`
- Existing constant pattern: `const TRADE_STATUSES = ["open", "closed", "reviewed"] as const` in `shared/const.ts`
- Existing filter pattern: `"all"` option maps to `undefined` in query params
- DB uses `text()` columns for enum-like fields with CHECK constraints
- Existing form validation: manual required-field check before `mutate()` call
- `FIELD_MUTABILITY` in `shared/const.ts` tracks editable fields per status — **not modified** in this task

### Metis Review

**Identified Gaps** (addressed):

- Stored enum values vs display labels → **Resolved**: Store display values directly (e.g. `"Trading Range"`) matching `TIME_FRAMES` pattern, no slug mapping needed
- Legacy null rows in list → **Resolved**: Show `—` for null, include under `"all"` filter, no "Unspecified" filter
- Create-only vs editable → **Resolved**: Create-only in this task; no edit/update flow changes
- UI language → **Resolved**: English labels matching existing app language
- DB engine validation → **Resolved**: Schema uses `sqliteTable`, migration via `npm run db:push`
- `FIELD_MUTABILITY` → **Resolved**: Not modified — out of scope unless edit flows are requested

---

## Work Objectives

### Core Objective

Add Market Cycle and Transaction Type as required Select fields on the New Trade form, and display + filter them in the Transactions list page.

### Concrete Deliverables

- `shared/const.ts` — `MARKET_CYCLES` and `TRANSACTION_TYPES` constant arrays + types
- `drizzle/schema.ts` — Two nullable `text()` columns with CHECK constraints
- `server/routers.ts` — Updated `transaction.create` input + `transaction.list` filters
- `server/db.ts` — Updated insert call + list filter conditions
- `client/src/pages/NewTransaction.tsx` — Two new required Select components
- `client/src/pages/Transactions.tsx` — Two new table columns + two filter dropdowns

### Definition of Done

- [ ] `npm run check` exits 0
- [ ] `npm run test` exits 0 (all existing + new tests pass)
- [ ] New trade creation requires both fields (form validation + Zod)
- [ ] Transactions list shows both columns with correct values
- [ ] Both filter dropdowns work independently and in combination

### Must Have

- Both fields required on create (Zod `z.enum()` + form validation)
- DB columns nullable (backwards compat for existing records)
- Shared constants as single source of truth
- Filter dropdowns with "All" default matching existing pattern
- Legacy null rows display `—` and appear under "All" filter
- CHECK constraints on new DB columns (matching existing `status`/`direction`/`outcome` pattern)

### Must NOT Have (Guardrails)

- **No edit/update support** — these fields are create-only in this task
- **No `FIELD_MUTABILITY` changes** — skip unless edit flows are requested
- **No backfill scripts** — existing rows stay null
- **No analytics/dashboard/export changes** — list display only
- **No sorting by new columns** — display and filter only
- **No localization/i18n** — English labels only
- **No new abstraction layers** — reuse existing patterns exactly
- **No TransactionDetail page changes** — only NewTransaction + Transactions list

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest configured)
- **Automated tests**: YES (Tests-after — add server tests for new create/filter behavior)
- **Framework**: Vitest (`npx vitest run`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend**: Use Bash — `npx vitest run` for server tests, `npm run check` for typecheck
- **Frontend/UI**: Use Playwright (playwright skill) — Navigate, interact, assert DOM, screenshot

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — start immediately):
└── Task 1: Schema columns + shared constants [quick]

Wave 2 (Backend — after Wave 1):
└── Task 2: tRPC router + DB layer + server tests [unspecified-high]

Wave 3 (Frontend — after Wave 2, MAX PARALLEL):
├── Task 3: New Trade form — 2 Select fields [quick]
└── Task 4: Transactions list — 2 columns + 2 filters [quick]

Wave FINAL (After ALL tasks — parallel reviews):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| 1    | —          | 2      | 1    |
| 2    | 1          | 3, 4   | 2    |
| 3    | 2          | F1-F4  | 3    |
| 4    | 2          | F1-F4  | 3    |

### Agent Dispatch Summary

- **Wave 1**: 1 task — T1 → `quick`
- **Wave 2**: 1 task — T2 → `unspecified-high`
- **Wave 3**: 2 tasks — T3 → `quick`, T4 → `quick`
- **Wave FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Add shared constants + DB schema columns

  **What to do**:
  - Add `MARKET_CYCLES` constant array to `shared/const.ts`:
    ```typescript
    export const MARKET_CYCLES = [
      "Trading Range",
      "Upward Tight Channel",
      "Downward Tight Channel",
      "Upward Channel",
      "Downward Channel",
      "Upward Trend",
      "Downward Trend",
    ] as const;
    export type MarketCycle = (typeof MARKET_CYCLES)[number];
    ```
  - Add `TRANSACTION_TYPES` constant array to `shared/const.ts`:
    ```typescript
    export const TRANSACTION_TYPES = ["Trend", "Reversal"] as const;
    export type TransactionType = (typeof TRANSACTION_TYPES)[number];
    ```
  - Add two nullable `text()` columns to `transactions` table in `drizzle/schema.ts`:
    ```typescript
    marketCycle: text("marketCycle"),
    transactionType: text("transactionType"),
    ```
  - Add CHECK constraints matching existing pattern (see `status`/`direction`/`outcome` checks at lines 162-175):
    ```sql
    CHECK (marketCycle IS NULL OR marketCycle IN ('Trading Range', 'Upward Tight Channel', 'Downward Tight Channel', 'Upward Channel', 'Downward Channel', 'Upward Trend', 'Downward Trend'))
    CHECK (transactionType IS NULL OR transactionType IN ('Trend', 'Reversal'))
    ```
  - Run `npm run db:push` to apply the schema migration
  - Run `npm run check` to verify no type errors

  **Must NOT do**:
  - Do NOT modify `FIELD_MUTABILITY`
  - Do NOT add backfill logic for existing rows
  - Do NOT make columns NOT NULL (must be nullable for backwards compat)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small, surgical changes to 2 files + migration command
  - **Skills**: []
    - No special skills needed for schema + constant changes

  **Parallelization**:
  - **Can Run In Parallel**: NO (foundation task)
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Task 2
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `shared/const.ts:1-5` — Existing `TRADE_STATUSES` constant + type pattern. Follow this exact `as const` + inferred type export pattern.
  - `drizzle/schema.ts:112-176` — Full transactions table definition. New columns go after `tvUrl` (line ~153), before `reviewFeedback`. Follow existing `text()` column pattern.
  - `drizzle/schema.ts:162-175` — Existing CHECK constraints for `status`, `direction`, `outcome`. Follow this exact pattern for the two new columns (allow NULL OR one of the valid values).

  **API/Type References**:
  - `drizzle/schema.ts:178-179` — `Transaction` and `InsertTransaction` types auto-inferred from schema. Adding columns automatically updates these types — no manual type changes needed.
  - `shared/types.ts:1-3` — Re-exports from schema. No changes needed here — types flow through automatically.

  **WHY Each Reference Matters**:
  - `shared/const.ts:1-5`: Copy the `as const` + `type X = (typeof Y)[number]` pattern exactly to get type-safe enum arrays
  - `drizzle/schema.ts:112-176`: Must place columns in the correct position within the table definition
  - `drizzle/schema.ts:162-175`: CHECK constraints ensure DB-level validation even if API is bypassed

  **Acceptance Criteria**:
  - [ ] `npm run check` exits 0
  - [ ] `npm run db:push` completes without errors
  - [ ] `MARKET_CYCLES` exported from `shared/const.ts` with 7 values
  - [ ] `TRANSACTION_TYPES` exported from `shared/const.ts` with 2 values
  - [ ] `MarketCycle` type exported from `shared/const.ts`
  - [ ] `TransactionType` type exported from `shared/const.ts`
  - [ ] `marketCycle` and `transactionType` columns exist in schema as nullable `text()`

  **QA Scenarios**:

  ```
  Scenario: TypeScript compilation passes with new types
    Tool: Bash
    Preconditions: Task 1 changes applied
    Steps:
      1. Run `npm run check`
      2. Verify exit code is 0
    Expected Result: Clean compilation, no type errors
    Failure Indicators: Non-zero exit code, any error output mentioning marketCycle or transactionType
    Evidence: .sisyphus/evidence/task-1-typecheck.txt

  Scenario: DB migration applies successfully
    Tool: Bash
    Preconditions: Schema columns added
    Steps:
      1. Run `npm run db:push`
      2. Verify exit code is 0
    Expected Result: Migration applies, new columns created in DB
    Failure Indicators: Non-zero exit code, SQL error in output
    Evidence: .sisyphus/evidence/task-1-db-push.txt
  ```

  **Commit**: YES
  - Message: `feat(schema): add marketCycle and transactionType to transactions`
  - Files: `drizzle/schema.ts`, `shared/const.ts`
  - Pre-commit: `npm run check`

- [x] 3. Add Market Cycle + Transaction Type Selects to New Trade form

  **What to do**:
  - In `client/src/pages/NewTransaction.tsx`:
    - Import `MARKET_CYCLES` and `TRANSACTION_TYPES` from `@shared/const`
    - Add to `formData` state (line ~57): `marketCycle: ""` and `transactionType: ""`
    - Add required field validation in `handleSubmit` (line ~90): check both fields are non-empty, show toast error if missing
    - Add `marketCycle` and `transactionType` to the `createMutation.mutate()` call (line ~106)
    - Add two Select components to the form, placed after the Direction select (line ~361):
      - **Market Cycle Select**: Label "Market Cycle", placeholder "Select market cycle", options from `MARKET_CYCLES.map()`
      - **Transaction Type Select**: Label "Transaction Type", placeholder "Select transaction type", options from `TRANSACTION_TYPES.map()`
    - Follow the exact same Select pattern as Direction (lines 344-361) and Time Frame (lines 314-328)
    - Use same form grid layout: each Select in a `space-y-2` wrapper with `Label` above it

  **Must NOT do**:
  - Do NOT change existing form fields or their behavior
  - Do NOT modify the form layout structure beyond adding the 2 new fields
  - Do NOT add edit capabilities

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, following an established Select component pattern exactly
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 4)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `client/src/pages/NewTransaction.tsx:57-66` — Existing `formData` state object. Add `marketCycle: ""` and `transactionType: ""` here.
  - `client/src/pages/NewTransaction.tsx:314-328` — Time Frame Select component. Copy this exact pattern for both new Selects (Label + Select + SelectTrigger + SelectValue + SelectContent + SelectItem map).
  - `client/src/pages/NewTransaction.tsx:344-361` — Direction Select component with styled options. Reference for Select structure.
  - `client/src/pages/NewTransaction.tsx:90-105` — Form validation block. Add required checks: `if (!formData.marketCycle) { toast.error("Please select a market cycle"); return; }` and same for transactionType.
  - `client/src/pages/NewTransaction.tsx:106-114` — Mutation call. Add `marketCycle: formData.marketCycle` and `transactionType: formData.transactionType` to the object.

  **API/Type References**:
  - `shared/const.ts` — `MARKET_CYCLES` and `TRANSACTION_TYPES` arrays to import for Select options

  **WHY Each Reference Matters**:
  - `NewTransaction.tsx:314-328`: THE template to copy for new Selects — same Label+Select structure, same `updateField` handler
  - `NewTransaction.tsx:90-105`: Validation must happen BEFORE the mutation call; follow existing toast.error pattern
  - `NewTransaction.tsx:106-114`: Must add both fields to the mutate payload or tRPC will reject

  **Acceptance Criteria**:
  - [ ] `npm run check` exits 0
  - [ ] Market Cycle Select renders with 7 options
  - [ ] Transaction Type Select renders with 2 options
  - [ ] Form submit blocked with toast error if Market Cycle not selected
  - [ ] Form submit blocked with toast error if Transaction Type not selected
  - [ ] Successful create sends both fields in mutation payload

  **QA Scenarios**:

  ```
  Scenario: Happy path — create trade with new fields
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, user logged in, has active trading system
    Steps:
      1. Navigate to `/transactions/new`
      2. Fill tradingPair with "BTCUSDT"
      3. Select timeFrame "1H"
      4. Set startTime to current date/time
      5. Select direction "Long"
      6. Select marketCycle "Trading Range"
      7. Select transactionType "Trend"
      8. Fill tradingLogic with "Test trade with new fields"
      9. Click submit button
      10. Assert success toast "Transaction recorded successfully" appears
      11. Assert navigation to `/transactions`
    Expected Result: Trade created successfully, redirected to transactions list
    Failure Indicators: Error toast, no redirect, form stays on page
    Evidence: .sisyphus/evidence/task-3-create-happy-path.png

  Scenario: Validation error — missing market cycle
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, user logged in
    Steps:
      1. Navigate to `/transactions/new`
      2. Fill all required fields EXCEPT marketCycle
      3. Select transactionType "Trend"
      4. Click submit button
      5. Assert error toast appears mentioning market cycle
      6. Assert form stays on `/transactions/new` (no redirect)
    Expected Result: Toast error, form not submitted
    Failure Indicators: Trade created despite missing field, redirect happens
    Evidence: .sisyphus/evidence/task-3-validation-error.png
  ```

  **Commit**: YES
  - Message: `feat(ui): add market cycle and transaction type selects to new trade form`
  - Files: `client/src/pages/NewTransaction.tsx`
  - Pre-commit: `npm run check`

- [x] 4. Display + filter Market Cycle and Transaction Type in Transactions list

  **What to do**:
  - In `client/src/pages/Transactions.tsx`:
    - Import `MARKET_CYCLES` and `TRANSACTION_TYPES` from `@shared/const`
    - **Add filter state** (after existing filters, line ~83):
      ```typescript
      const [marketCycleFilter, setMarketCycleFilter] = useState<
        string | undefined
      >(undefined);
      const [transactionTypeFilter, setTransactionTypeFilter] = useState<
        string | undefined
      >(undefined);
      ```
    - **Add filters to query** (line ~92): pass `marketCycle: marketCycleFilter` and `transactionType: transactionTypeFilter` to `trpc.transaction.list.useQuery()`
    - **Add filter dropdowns** in the filter bar (after existing filters, line ~170-248):
      - Market Cycle filter: Select with "All market cycles" default + options from `MARKET_CYCLES`
      - Transaction Type filter: Select with "All types" default + options from `TRANSACTION_TYPES`
      - Follow exact same pattern as existing Status/Direction/Outcome filters
    - **Add table columns** (in the table header + body, line ~263-299):
      - "Cycle" column after "Time Frame" column — displays `t.marketCycle || "—"`
      - "Type" column after "Cycle" column — displays `t.transactionType || "—"`
    - Legacy null values display as `—` (em dash)

  **Must NOT do**:
  - Do NOT add sorting by new columns
  - Do NOT change existing column order or widths
  - Do NOT modify any existing filter behavior

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, following established filter + table column patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 3)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `client/src/pages/Transactions.tsx:77-83` — Existing filter state declarations. Add `marketCycleFilter` and `transactionTypeFilter` following the same `useState` pattern.
  - `client/src/pages/Transactions.tsx:92-103` — Existing list query with filter params. Add `marketCycle` and `transactionType` to the query object.
  - `client/src/pages/Transactions.tsx:173-188` — Status filter Select component. THE template to copy for both new filter dropdowns. Note the `"all"` → `undefined` mapping pattern.
  - `client/src/pages/Transactions.tsx:190-210` — Direction filter Select. Another example of the same filter pattern.
  - `client/src/pages/Transactions.tsx:263-275` — Table header row. Add "Cycle" and "Type" headers after "Time Frame".
  - `client/src/pages/Transactions.tsx:277-299` — Table body row cells. Add cells rendering `t.marketCycle || "—"` and `t.transactionType || "—"` in matching positions.

  **WHY Each Reference Matters**:
  - `Transactions.tsx:173-188`: Exact pattern to copy — `"all"` default value, `onValueChange` with `undefined` mapping, `SelectItem` for each option
  - `Transactions.tsx:263-275`: Must add headers in correct position to keep table columns aligned
  - `Transactions.tsx:277-299`: Must add cells in same order as headers; use `|| "—"` for null safety

  **Acceptance Criteria**:
  - [ ] `npm run check` exits 0
  - [ ] "Cycle" and "Type" columns visible in Transactions table
  - [ ] Newly created trades show correct Market Cycle and Transaction Type values
  - [ ] Legacy trades (null values) show `—` in both columns
  - [ ] Market Cycle filter dropdown shows "All market cycles" + 7 options
  - [ ] Transaction Type filter dropdown shows "All types" + 2 options
  - [ ] Selecting a filter value updates the list to show only matching rows
  - [ ] Selecting "All" resets to show all rows
  - [ ] Both new filters work in combination with existing filters

  **QA Scenarios**:

  ```
  Scenario: New columns display correctly
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, user logged in, at least one trade created with new fields + one legacy trade without
    Steps:
      1. Navigate to `/transactions`
      2. Assert table header contains "Cycle" column
      3. Assert table header contains "Type" column
      4. Find the row for the newly created trade
      5. Assert Cycle cell text is "Trading Range" (or whichever was set)
      6. Assert Type cell text is "Trend" (or whichever was set)
      7. Find a legacy trade row
      8. Assert Cycle cell text is "—"
      9. Assert Type cell text is "—"
    Expected Result: Both columns visible with correct values; nulls show as dashes
    Failure Indicators: Missing columns, wrong values, crash on null data
    Evidence: .sisyphus/evidence/task-4-columns-display.png

  Scenario: Market Cycle filter works
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, trades exist with different market cycles
    Steps:
      1. Navigate to `/transactions`
      2. Note total number of rows visible
      3. Open Market Cycle filter dropdown
      4. Select "Trading Range"
      5. Assert table shows only rows where Cycle = "Trading Range"
      6. Assert rows with other market cycles or null are hidden
      7. Open Market Cycle filter dropdown again
      8. Select "All market cycles"
      9. Assert all rows are visible again (including legacy null rows)
    Expected Result: Filter correctly shows/hides rows; "All" resets
    Failure Indicators: Wrong rows shown, legacy rows disappear, filter doesn't reset
    Evidence: .sisyphus/evidence/task-4-filter-market-cycle.png

  Scenario: Combined filters work
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, trades exist
    Steps:
      1. Navigate to `/transactions`
      2. Select Market Cycle filter "Trading Range"
      3. Select Transaction Type filter "Trend"
      4. Assert only rows matching BOTH filters are shown
      5. Select Direction filter "Long" (existing filter)
      6. Assert list further narrows to rows matching all 3 criteria
    Expected Result: All filters combine correctly (AND logic)
    Failure Indicators: Filters don't stack, results incorrect
    Evidence: .sisyphus/evidence/task-4-combined-filters.png
  ```

  **Commit**: YES
  - Message: `feat(ui): display and filter market cycle and transaction type in transactions list`
  - Files: `client/src/pages/Transactions.tsx`
  - Pre-commit: `npm run check`

---

- [x] 2. Update tRPC router + DB layer + server tests

  **What to do**:
  - In `server/routers.ts` — `transaction.create` procedure (line ~184):
    - Add to Zod input schema: `marketCycle: z.enum(MARKET_CYCLES)` and `transactionType: z.enum(TRANSACTION_TYPES)` (import from `@shared/const`)
    - Pass both fields through to the `createTransactionWithElements()` call (line ~213)
  - In `server/routers.ts` — `transaction.list` procedure:
    - Add optional filter params to input: `marketCycle: z.enum(MARKET_CYCLES).optional()` and `transactionType: z.enum(TRANSACTION_TYPES).optional()`
    - Pass both filter params through to the DB query function
  - In `server/db.ts` — list/filter function:
    - Add filter conditions following existing pattern: `if (options?.marketCycle) conditions.push(eq(transactions.marketCycle, options.marketCycle));`
    - Same for `transactionType`
  - Add server tests in `server/transaction.test.ts`:
    - Test: create succeeds when both fields provided with valid values
    - Test: create rejects when `marketCycle` is missing
    - Test: create rejects when `transactionType` is missing
    - Test: list filters by `marketCycle` correctly
    - Test: list filters by `transactionType` correctly
    - Test: list with no filters still returns all rows (including legacy null rows)

  **Must NOT do**:
  - Do NOT modify transaction update/close/review procedures
  - Do NOT add sorting by new fields
  - Do NOT change any existing test expectations

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Backend changes across router + DB + tests; needs careful Zod/Drizzle integration
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (solo, depends on Wave 1)
  - **Blocks**: Tasks 3, 4
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `server/routers.ts:184-198` — Existing `transaction.create` Zod input schema. Add new fields here following the `z.enum()` pattern used for `direction`.
  - `server/routers.ts:199-233` — Create procedure body. Pass new fields into `createTransactionWithElements()` call at line ~213.
  - `server/routers.ts:235-273` — Existing `transaction.list` procedure with optional filter params. Follow `direction: z.enum(["long", "short"]).optional()` pattern.
  - `server/db.ts:575-675` — DB insert function `createTransactionWithElements()`. New fields flow through the insert object automatically.
  - `server/db.ts:1051-1088` — List query filter conditions. Add new conditions following `if (options?.direction) conditions.push(eq(...))` pattern.

  **Test References**:
  - `server/transaction.test.ts:189-248` — Existing create transaction test. Follow this mock/caller pattern to add new test cases.
  - `server/transaction.lifecycle.test.ts:994-1147` — Lifecycle test patterns. Reference for context factory + assertion patterns.

  **API/Type References**:
  - `shared/const.ts` — Import `MARKET_CYCLES` and `TRANSACTION_TYPES` for Zod enum definitions

  **WHY Each Reference Matters**:
  - `server/routers.ts:184-198`: Exact location to add Zod fields; must maintain `.strict()` on the input object
  - `server/routers.ts:199-233`: Must wire new fields into the insert object passed to `createTransactionWithElements()`
  - `server/db.ts:1051-1088`: Must follow exact filter condition pattern for consistency and null safety
  - `server/transaction.test.ts:189-248`: Must follow existing mock setup to avoid test isolation issues

  **Acceptance Criteria**:
  - [ ] `npm run check` exits 0
  - [ ] `npx vitest run server/transaction.test.ts` — all tests pass including new ones
  - [ ] Create rejects missing `marketCycle` with TRPCError
  - [ ] Create rejects missing `transactionType` with TRPCError
  - [ ] Create succeeds with valid `marketCycle` + `transactionType`
  - [ ] List filters by `marketCycle` return only matching rows
  - [ ] List filters by `transactionType` return only matching rows
  - [ ] List with no filters returns all rows including legacy null-field rows

  **QA Scenarios**:

  ```
  Scenario: Create transaction with valid new fields
    Tool: Bash (vitest)
    Preconditions: Task 1 complete, DB migrated
    Steps:
      1. Run `npx vitest run server/transaction.test.ts`
      2. Verify test "create succeeds with marketCycle and transactionType" passes
      3. Verify all existing tests still pass
    Expected Result: All tests pass, exit code 0
    Failure Indicators: Any test failure, particularly around Zod validation or DB insert
    Evidence: .sisyphus/evidence/task-2-server-tests.txt

  Scenario: Create transaction rejects missing required fields
    Tool: Bash (vitest)
    Preconditions: Task 1 complete
    Steps:
      1. Run `npx vitest run server/transaction.test.ts`
      2. Verify test "rejects create without marketCycle" passes
      3. Verify test "rejects create without transactionType" passes
    Expected Result: Both rejection tests pass — TRPCError with BAD_REQUEST
    Failure Indicators: Tests pass when they should fail, or wrong error type
    Evidence: .sisyphus/evidence/task-2-validation-tests.txt

  Scenario: List filter by new fields
    Tool: Bash (vitest)
    Preconditions: Task 2 server changes complete
    Steps:
      1. Run `npx vitest run server/transaction.test.ts`
      2. Verify list filter tests for marketCycle and transactionType pass
    Expected Result: Filtered results contain only matching rows; unfiltered results include null rows
    Failure Indicators: Null rows excluded when no filter applied, or wrong rows returned
    Evidence: .sisyphus/evidence/task-2-filter-tests.txt

  Scenario: Full typecheck passes
    Tool: Bash
    Preconditions: All Task 2 changes applied
    Steps:
      1. Run `npm run check`
    Expected Result: Exit code 0, no type errors
    Failure Indicators: Type errors related to new fields
    Evidence: .sisyphus/evidence/task-2-typecheck.txt
  ```

  **Commit**: YES
  - Message: `feat(api): require marketCycle and transactionType on create, support list filters`
  - Files: `server/routers.ts`, `server/db.ts`, `server/transaction.test.ts`
  - Pre-commit: `npm run check && npm run test`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `npm run check` + `npm run test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (create a trade with new fields → verify it appears in list with correct values → filter works). Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| #   | Message                                                                               | Files                                                             | Pre-commit                      |
| --- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------- |
| 1   | `feat(schema): add marketCycle and transactionType to transactions`                   | `drizzle/schema.ts`, `shared/const.ts`                            | `npm run check`                 |
| 2   | `feat(api): require marketCycle and transactionType on create, support list filters`  | `server/routers.ts`, `server/db.ts`, `server/transaction.test.ts` | `npm run check && npm run test` |
| 3   | `feat(ui): add market cycle and transaction type selects to new trade form`           | `client/src/pages/NewTransaction.tsx`                             | `npm run check`                 |
| 4   | `feat(ui): display and filter market cycle and transaction type in transactions list` | `client/src/pages/Transactions.tsx`                               | `npm run check`                 |

---

## Success Criteria

### Verification Commands

```bash
npm run check       # Expected: exits 0, no type errors
npm run test        # Expected: all tests pass including new ones
npm run build       # Expected: builds successfully
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All existing tests still pass
- [ ] New server tests cover create-required + list-filter behavior
- [ ] UI QA evidence captured for happy path + error path + filter path
