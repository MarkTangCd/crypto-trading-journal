# Multi-Account Support

## TL;DR

> **Quick Summary**: Add multi-account support so users can create multiple trading accounts (with name, notes, initial balance), switch between them in the sidebar, and see account-specific data on Dashboard/Transactions/NewTrade. Trading Systems and Elements remain shared across all accounts.
>
> **Deliverables**:
>
> - New `accounts` database table with `accountId` FK on `transactions`
> - Account CRUD tRPC router with ownership validation
> - Lazy migration: auto-create default account for existing/new users
> - Account-scoped transaction queries, stats, balance calculations
> - React AccountContext with localStorage persistence + fallback logic
> - Sidebar account switcher dropdown
> - `/accounts` management page (create/edit/delete with confirmation)
> - Updated Dashboard, Transactions, NewTransaction pages (account-scoped)
> - Settings page: initialBalance section removed
> - Server tests for account CRUD, isolation, and migration
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 6 waves
> **Critical Path**: Task 1 → Task 4 → Task 6 → Task 10 → Task 14

---

## Context

### Original Request

User wants multi-account support in the crypto trading journal. Currently only a single implicit account exists per user (initialBalance on the users table). Users should be able to create multiple accounts with nickname, notes, and initial balance; switch between them easily; and see account-specific data on Dashboard, Transactions, and New Trade pages. Trading Systems and Elements should remain shared across all accounts.

### Interview Summary

**Key Discussions**:

- Migration: Auto-create a "默认账户" for existing users, inheriting current initialBalance, all existing transactions linked to it
- Account deletion: Cascade delete (transactions deleted with account) with confirmation dialog
- Settings page: Remove initialBalance setting (moves to account management)
- activeTradingSystemId: Stays per-user (Trading Systems are shared across accounts)
- Account switcher: Sidebar top dropdown (Slack-style workspace switching)
- Account management: New sidebar nav item → dedicated /accounts page
- Test strategy: Tests after implementation (Vitest infrastructure exists)

**Research Findings**:

- Database: 6 tables, `users.initialBalance` is text default "0", balance calculated dynamically from `initialBalance + sum(returnAmounts)`
- Backend: 26 tRPC procedures, 24 user-scoped via `ctx.user.id`, all DB functions take `userId` param
- Frontend: Sidebar-based DashboardLayout (no top header), Settings page manages initialBalance
- Existing patterns: ThemeContext for React context, localStorage persistence for sidebar width
- Test files: `transaction.test.ts`, `auth.logout.test.ts`, `tradingSystem.test.ts` using `appRouter.createCaller(ctx)`

### Metis Review

**Identified Gaps** (addressed):

- Active account source of truth → Client-side localStorage, server validates ownership on every request
- Fallback when stored accountId is stale/deleted → Fall back to first account by `createdAt`
- New users after feature launch → Lazy migration: create default account on first visit if none exist
- Last account deletion → Blocked with error, user must always have ≥1 account
- Active account deletion → Auto-select first remaining account by `createdAt`
- Both userId and accountId on transactions → Keep both; accountId for scoping, userId for ownership validation
- Cache isolation on account switch → Invalidate all account-scoped TanStack Query keys on switch
- Input validation → name required (non-empty, trimmed), initialBalance defaults to "0", notes optional
- Account name uniqueness → Not enforced (allow duplicate names)
- Switcher ordering → By `createdAt` asc for deterministic UI
- Dirty form on account switch → Form resets (standard behavior, not special-cased)
- Initial balance editing with existing trades → Same retroactive behavior as current (dynamic calculation)

---

## Work Objectives

### Core Objective

Enable multi-account support where each user can have multiple trading accounts, each with independent transactions, balance tracking, and statistics, while sharing Trading Systems and Elements across all accounts.

### Concrete Deliverables

- `drizzle/schema.ts`: New `accounts` table, `accountId` column on `transactions`
- `shared/types.ts`: Exported Account type
- `server/db.ts`: Account CRUD functions + account-scoped transaction/stats functions
- `server/routers.ts`: New `account` router, updated `transaction`/`stats`/`user` routers
- `server/_core/context.ts`: Lazy default-account creation logic
- `client/src/contexts/AccountContext.tsx`: Selected account state with localStorage persistence
- `client/src/components/AccountSwitcher.tsx`: Sidebar dropdown component
- `client/src/pages/Accounts.tsx`: Account management page
- `client/src/components/DashboardLayout.tsx`: Sidebar updates (switcher + nav item)
- `client/src/pages/Dashboard.tsx`: Account-scoped stats queries
- `client/src/pages/Transactions.tsx`: Account-scoped transaction list
- `client/src/pages/NewTransaction.tsx`: Account-scoped form defaults + create
- `client/src/pages/Settings.tsx`: Remove initialBalance section
- `server/account.test.ts`: Account CRUD + migration tests
- `server/accountScope.test.ts`: Isolation + auth tests

### Definition of Done

- [ ] `npm run check` passes with zero type errors
- [ ] `npm run build` completes successfully
- [ ] `npm run test` passes with all existing + new tests green
- [ ] Creating a new account and switching to it shows isolated data
- [ ] Existing users see their data in a default account without manual action

### Must Have

- Accounts table with name, notes, initialBalance per account
- Account CRUD with ownership validation (user can only access own accounts)
- Lazy default account creation for existing AND new users
- Account switcher in sidebar with persistent selection
- Account-scoped: transactions, stats, balance, consecutive losses, form defaults
- User-scoped (shared): Trading Systems, Elements, activeTradingSystemId
- Cascade delete: deleting account removes its transactions
- Block deleting last remaining account
- Confirmation dialog before account deletion
- Query invalidation on account switch (no stale data leakage)
- Fallback to first account when stored selection is invalid

### Must NOT Have (Guardrails)

- Do NOT make Trading Systems or Elements account-scoped
- Do NOT move activeTradingSystemId from user to account
- Do NOT add server-persisted active account selection (keep client-side localStorage)
- Do NOT add transfers between accounts
- Do NOT add account sharing/collaboration
- Do NOT add all-accounts aggregate dashboard
- Do NOT add account colors, avatars, or custom ordering
- Do NOT add soft-delete/archive/restore for accounts
- Do NOT rework money/value types (keep text-based decimal strings)
- Do NOT introduce Playwright or new E2E framework
- Do NOT refactor unrelated DB/router code while touching account-scoped procedures
- Do NOT add extra REST endpoints (keep tRPC as sole API boundary)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest configured, server test files exist)
- **Automated tests**: Tests-after (write implementation first, then add tests)
- **Framework**: Vitest (existing)
- **Test pattern**: Follow `appRouter.createCaller(ctx)` pattern from existing tests

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend/API**: Use Bash (`npm run check`, `npm run build`, `npx vitest run ...`)
- **Frontend/UI**: Use Playwright skill — Navigate, interact, assert DOM, screenshot
- **State/Context**: Verify via Playwright browser interaction + localStorage inspection

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — schema must land first):
└── Task 1: Database schema + shared types [quick]

Wave 2 (Backend Core — 4 parallel tasks):
├── Task 2: Account CRUD DB functions + tRPC router [unspecified-high]
├── Task 3: Default account lazy migration logic [quick]
├── Task 4: Transaction DB + tRPC account-scoping [deep]
└── Task 5: Stats/FormDefaults account-scoping + user router cleanup [unspecified-high]

Wave 3 (Frontend Core — 4 parallel tasks):
├── Task 6: AccountContext + useAccount hook [quick]
├── Task 7: Account Switcher dropdown component [visual-engineering]
├── Task 8: Accounts Management page [visual-engineering]
└── Task 9: DashboardLayout updates (switcher + nav) [quick]

Wave 4 (Page Integration — 4 parallel tasks):
├── Task 10: Dashboard page account-scoping [quick]
├── Task 11: Transactions page account-scoping [quick]
├── Task 12: NewTransaction page account-scoping [quick]
└── Task 13: Settings page cleanup [quick]

Wave 5 (Tests — 2 parallel tasks):
├── Task 14: Account CRUD + migration server tests [unspecified-high]
└── Task 15: Account isolation + authorization server tests [unspecified-high]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 4 → Task 6 → Task 10 → Task 14 → F1-F4 → user okay
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 4 (Waves 2, 3, 4)
```

### Dependency Matrix

| Task  | Depends On | Blocks               |
| ----- | ---------- | -------------------- |
| 1     | —          | 2, 3, 4, 5           |
| 2     | 1          | 6, 7, 8, 9           |
| 3     | 1          | 6                    |
| 4     | 1          | 6, 10, 11, 12        |
| 5     | 1          | 6, 10, 13            |
| 6     | 2, 3, 4, 5 | 7, 9, 10, 11, 12, 13 |
| 7     | 2, 6       | 9                    |
| 8     | 2, 6       | —                    |
| 9     | 6, 7       | —                    |
| 10    | 4, 5, 6    | —                    |
| 11    | 4, 6       | —                    |
| 12    | 4, 6       | —                    |
| 13    | 5, 6       | —                    |
| 14    | 2, 3, 4, 5 | —                    |
| 15    | 2, 4, 5    | —                    |
| F1-F4 | ALL        | user okay            |

### Agent Dispatch Summary

- **Wave 1**: **1** — T1 → `quick`
- **Wave 2**: **4** — T2 → `unspecified-high`, T3 → `quick`, T4 → `deep`, T5 → `unspecified-high`
- **Wave 3**: **4** — T6 → `quick`, T7 → `visual-engineering`, T8 → `visual-engineering`, T9 → `quick`
- **Wave 4**: **4** — T10-T13 → `quick`
- **Wave 5**: **2** — T14-T15 → `unspecified-high`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. Database Schema Changes + Shared Type Exports

  **What to do**:
  - Add a new `accounts` table to `drizzle/schema.ts`:
    - `id` (serial PK)
    - `userId` (integer FK to users, NOT NULL)
    - `name` (varchar, NOT NULL) — the account nickname
    - `notes` (text, nullable) — optional description/memo
    - `initialBalance` (text, NOT NULL, default "0") — starting balance for this account
    - `createdAt` (timestamp, default now)
    - `updatedAt` (timestamp, default now, on update)
  - Add `accountId` column to `transactions` table:
    - integer FK referencing `accounts.id`, **nullable initially** (to allow migration)
    - Add index on `accountId` for query performance
  - Follow existing schema patterns: use `mysqlTable`, `relations()`, match naming conventions (`snake_case` table names, `camelCase` column names in Drizzle)
  - Export `Account`, `InsertAccount` types via `$inferSelect` / `$inferInsert`
  - Update `shared/types.ts` to re-export Account types from schema
  - Run `npm run db:push` to apply schema changes

  **Must NOT do**:
  - Do NOT add `accountId` to `trading_elements` or `trading_systems` tables
  - Do NOT remove `userId` from `transactions` table (keep both)
  - Do NOT change `initialBalance` type from text to decimal
  - Do NOT modify any existing column types or constraints

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file schema addition with straightforward column additions, no complex logic
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: Not needed for implementation, only for commit

  **Parallelization**:
  - **Can Run In Parallel**: NO (foundation task)
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Tasks 2, 3, 4, 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `drizzle/schema.ts:1-150` — Existing table definitions using `mysqlTable`, `relations()`, column helpers (`int`, `varchar`, `text`, `timestamp`, `serial`). Follow exactly the same pattern for the new `accounts` table.
  - `drizzle/schema.ts` lines defining `transactions` table — This is where `accountId` column needs to be added, following the same FK pattern used for `userId` and `tradingSystemId`.

  **API/Type References** (contracts to implement against):
  - `shared/types.ts` — Currently exports types via `export type { ... } from "../drizzle/schema"`. Add `Account` and `InsertAccount` to the export list.

  **External References**:
  - Drizzle ORM MySQL docs for `mysqlTable`, `relations()`, and `$inferSelect`/`$inferInsert`

  **WHY Each Reference Matters**:
  - Schema patterns must be followed exactly so Drizzle's type inference, relation mapping, and `db:push` work correctly
  - The existing FK patterns (e.g., `tradingSystemId` on transactions) show exactly how to add `accountId`

  **Acceptance Criteria**:
  - [ ] `npm run check` passes with zero type errors
  - [ ] `npm run db:push` applies schema changes without error
  - [ ] `Account` and `InsertAccount` types are importable from `@shared/types`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Schema types compile correctly
    Tool: Bash
    Preconditions: Schema changes applied to drizzle/schema.ts
    Steps:
      1. Run `npm run check`
      2. Verify exit code is 0
    Expected Result: Zero type errors, exit code 0
    Failure Indicators: Type errors mentioning accounts, accountId, or missing exports
    Evidence: .sisyphus/evidence/task-1-schema-typecheck.txt

  Scenario: Database schema applies successfully
    Tool: Bash
    Preconditions: MySQL database running and accessible
    Steps:
      1. Run `npm run db:push`
      2. Verify exit code is 0
    Expected Result: Schema changes applied, accounts table created, accountId column added to transactions
    Failure Indicators: Migration errors, FK constraint failures
    Evidence: .sisyphus/evidence/task-1-db-push.txt

  Scenario: Shared types export Account correctly
    Tool: Bash
    Preconditions: shared/types.ts updated with Account exports
    Steps:
      1. Run `npx tsc --noEmit` to verify type resolution
      2. Grep shared/types.ts for 'Account' export
    Expected Result: Account and InsertAccount types are exported and resolve correctly
    Failure Indicators: Missing export, type resolution errors
    Evidence: .sisyphus/evidence/task-1-types-export.txt
  ```

  **Commit**: YES (group with Wave 1)
  - Message: `feat(db): add accounts table and accountId to transactions`
  - Files: `drizzle/schema.ts`, `shared/types.ts`
  - Pre-commit: `npm run check`

- [ ] 2. Account CRUD DB Functions + tRPC Router

  **What to do**:
  - Add account DB functions to `server/db.ts`:
    - `createAccount(data: InsertAccount): Promise<Account>` — Insert new account
    - `getAccountById(id: number, userId: number): Promise<Account | undefined>` — Get by ID with ownership check
    - `getAccountsByUserId(userId: number): Promise<Account[]>` — List all accounts for user, ordered by `createdAt asc`
    - `updateAccount(id: number, userId: number, data: Partial<InsertAccount>): Promise<Account | undefined>` — Update owned account
    - `deleteAccountWithTransactions(id: number, userId: number): Promise<void>` — Cascade delete: remove all transactions (and their transaction_elements) for this account, then delete account. Must verify user still has ≥1 other account before deleting, throw `HttpError` if last account.
    - `getAccountCount(userId: number): Promise<number>` — Count accounts for last-account guard
  - Add `account` tRPC router to `server/routers.ts`:
    - `account.create` — Input: `{ name: string, notes?: string, initialBalance?: string }`. Validate: name is non-empty after trim. Default initialBalance to "0". Set `userId` from `ctx.user.id`.
    - `account.list` — No input. Returns all accounts for `ctx.user.id` ordered by `createdAt asc`.
    - `account.get` — Input: `{ id: number }`. Returns account with ownership check.
    - `account.update` — Input: `{ id: number, name?: string, notes?: string, initialBalance?: string }`. Validate: if name provided, must be non-empty after trim. Ownership check via userId.
    - `account.delete` — Input: `{ id: number }`. Check account count ≥ 2 before deleting (block last account). Cascade delete transactions. Ownership check.
  - Register `account` router in `appRouter`
  - All procedures use `publicProcedure` (matching existing pattern)
  - All mutations validate ownership: `account.userId === ctx.user.id`

  **Must NOT do**:
  - Do NOT add account-related fields to Trading Systems or Elements
  - Do NOT create new middleware for account validation (keep inline like existing patterns)
  - Do NOT use `protectedProcedure` (project uses `publicProcedure` for all)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple DB functions + tRPC router with validation logic, moderate complexity
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed, this is pure backend

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4, 5)
  - **Blocks**: Tasks 6, 7, 8, 9
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `server/db.ts:1-50` — Import patterns, DB handle via `getDb()`, Drizzle query builder usage
  - `server/db.ts` functions `createTradingElement`, `getTradingElementById`, `getTradingElementsByUserId`, `updateTradingElement`, `deleteTradingElement` — Follow exact same CRUD pattern for accounts (parameter style, return types, error handling)
  - `server/db.ts` function `deleteTransactionWithElements` — Pattern for cascade deletes: remove junction records first, then parent
  - `server/routers.ts` lines defining `tradingElement` router — Follow same router structure: inline Zod validation, `publicProcedure`, `ctx.user.id` access
  - `shared/_core/errors.ts` — `HttpError` and helper constructors for error responses

  **API/Type References**:
  - `drizzle/schema.ts` `accounts` table (from Task 1) — The table definition for queries
  - `shared/types.ts` `Account`, `InsertAccount` — Types for function signatures

  **Test References**:
  - `server/transaction.test.ts` — Mocking pattern with `vi.mock` for DB functions
  - `server/tradingSystem.test.ts` — CRUD test patterns for tRPC procedures

  **WHY Each Reference Matters**:
  - DB functions must follow the exact `getDb()` → Drizzle query pattern to stay consistent
  - Router patterns (Zod input, publicProcedure, ctx.user.id) must match existing conventions
  - Cascade delete must handle transaction_elements before transactions before account

  **Acceptance Criteria**:
  - [ ] `npm run check` passes
  - [ ] Account CRUD functions exist in `server/db.ts`
  - [ ] `account` router registered in `appRouter` with all 5 procedures

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Create account via tRPC
    Tool: Bash
    Preconditions: Dev server running, schema applied
    Steps:
      1. Run `npm run check` to verify types
      2. Start dev server with `npm run dev &`
      3. Use curl to call tRPC account.create: `curl -X POST http://localhost:5000/api/trpc/account.create -H "Content-Type: application/json" -d '{"json":{"name":"Test Account","notes":"My test","initialBalance":"1000"}}'`
      4. Verify response contains created account with id, name, notes, initialBalance
    Expected Result: 200 response with account object containing all fields
    Failure Indicators: 500 error, missing fields, type errors
    Evidence: .sisyphus/evidence/task-2-create-account.txt

  Scenario: Block deletion of last remaining account
    Tool: Bash
    Preconditions: User has exactly 1 account
    Steps:
      1. Call account.list to get account ID
      2. Call account.delete with that ID
      3. Verify error response
    Expected Result: Error response indicating last account cannot be deleted
    Failure Indicators: Account deleted successfully (should fail), 500 internal error
    Evidence: .sisyphus/evidence/task-2-delete-last-account.txt

  Scenario: Validate empty account name rejected
    Tool: Bash
    Preconditions: Dev server running
    Steps:
      1. Call account.create with `{"name":"  ","initialBalance":"0"}`
      2. Verify error response (Zod validation or business logic rejection)
    Expected Result: 400-level error indicating name is required
    Failure Indicators: Account created with blank name
    Evidence: .sisyphus/evidence/task-2-empty-name-rejection.txt
  ```

  **Commit**: YES (group with Wave 2)
  - Message: `feat(api): add account CRUD router and account-scoped queries`
  - Files: `server/db.ts`, `server/routers.ts`
  - Pre-commit: `npm run check`

- [ ] 3. Default Account Lazy Migration Logic

  **What to do**:
  - Implement lazy migration that ensures every user always has at least one account:
    - In `server/_core/context.ts`, after `getOrCreateAnonymousUser()` resolves, check if user has any accounts via `getAccountsByUserId(user.id)`
    - If no accounts exist: create a default account with:
      - `name`: "默认账户" (or "Default Account")
      - `notes`: null
      - `initialBalance`: user's current `users.initialBalance` value (or "0" if null/empty)
    - Then backfill: update all `transactions` where `userId = user.id AND accountId IS NULL` to set `accountId` to the new default account's ID
    - Add a `ensureUserHasAccount(userId: number): Promise<Account>` function to `server/db.ts` that encapsulates this logic
  - This handles both:
    - **Existing users**: Their transactions get linked to the auto-created default account
    - **New users**: They get a default account on first visit
  - After migration, `users.initialBalance` becomes stale but is kept for safety (not removed from schema)

  **Must NOT do**:
  - Do NOT remove `initialBalance` from `users` table schema
  - Do NOT run a one-time migration script (use lazy migration instead)
  - Do NOT make `transactions.accountId` non-nullable yet (wait until all data is migrated)
  - Do NOT change the `getOrCreateAnonymousUser()` function itself, add logic after it

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small focused change: one DB function + one context hook-in point
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 4, 5)
  - **Blocks**: Task 6
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `server/_core/context.ts` — The `createContext` function and `getOrCreateAnonymousUser()` call. The new logic hooks in right after user is obtained. Read the full file to understand the context creation flow.
  - `server/db.ts` function `getTransactionsByUserId` — Shows how to query transactions by userId, same pattern needed for backfill query
  - `server/db.ts` function `createTradingElement` — Pattern for insert + return

  **API/Type References**:
  - `drizzle/schema.ts` `accounts` table, `transactions.accountId` — The columns being written to during migration
  - `server/db.ts` `getAccountsByUserId` (from Task 2) — Used to check if user already has accounts

  **WHY Each Reference Matters**:
  - Context.ts is where the lazy migration hooks in — must understand the existing flow to add logic without breaking it
  - The backfill update query must correctly filter `userId + accountId IS NULL` to only migrate un-migrated transactions

  **Acceptance Criteria**:
  - [ ] `npm run check` passes
  - [ ] Existing user with transactions: after first request, a default account exists with their initialBalance, and all transactions have accountId set
  - [ ] New user: after first request, one default account exists with initialBalance "0"

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Existing user gets default account on first request
    Tool: Bash
    Preconditions: Database has a user with initialBalance="1000" and 3 transactions with accountId=NULL
    Steps:
      1. Start dev server
      2. Make any authenticated request (e.g., account.list)
      3. Verify response includes exactly one account with initialBalance="1000"
      4. Query transactions to verify all have non-null accountId
    Expected Result: Default account created, all transactions linked to it
    Failure Indicators: No account created, transactions still have null accountId
    Evidence: .sisyphus/evidence/task-3-migration-existing-user.txt

  Scenario: New user gets default account automatically
    Tool: Bash
    Preconditions: Fresh database with no users
    Steps:
      1. Start dev server
      2. Make first request (triggers anonymous user creation + account creation)
      3. Call account.list
      4. Verify exactly one account with name="默认账户" and initialBalance="0"
    Expected Result: One default account exists
    Failure Indicators: Empty account list, error on first request
    Evidence: .sisyphus/evidence/task-3-migration-new-user.txt
  ```

  **Commit**: YES (group with Wave 2)
  - Message: `feat(api): add account CRUD router and account-scoped queries`
  - Files: `server/_core/context.ts`, `server/db.ts`
  - Pre-commit: `npm run check`

- [ ] 4. Transaction DB Functions + tRPC Procedures Account-Scoping

  **What to do**:
  - Update ALL transaction-related DB functions in `server/db.ts` to accept and filter by `accountId`:
    - `getTransactionsByUserId(userId, options?)` → add `accountId: number` parameter, filter `WHERE accountId = ?`
    - `createTransactionWithElements(data, elementIds)` → `data` must include `accountId`
    - `getLastTransaction(userId)` → add `accountId` parameter
    - `getConsecutiveLosses(userId)` → add `accountId` parameter
    - `getCurrentBalance(userId, initialBalance)` → change to `getCurrentBalance(accountId, initialBalance)` — filter transactions by `accountId` instead of `userId`
    - `getUniqueTradingPairs(userId)` → add `accountId` parameter
    - `deleteTransactionWithElements(transactionId, userId)` → keep userId for ownership, no change needed (transaction already has accountId)
    - `getTransactionById(id, userId)` → keep as-is (ownership check by userId still valid)
    - `updateTransaction(id, userId, data)` → keep as-is
  - Update transaction tRPC procedures in `server/routers.ts`:
    - `transaction.create` — Add `accountId: z.number()` to input schema. Pass to `createTransactionWithElements`. Also verify account ownership: the account must belong to `ctx.user.id`.
    - `transaction.list` — Add `accountId: z.number()` to input. Pass to `getTransactionsByUserId`.
    - `transaction.close` — When computing balance and losses, use `getCurrentBalance(accountId, account.initialBalance)` and `getConsecutiveLosses(accountId)`. Fetch the account to get its `initialBalance`.
    - `transaction.getFormDefaults` — Add `accountId: z.number()` to input. Return balance from account's `initialBalance` + account-scoped transactions. Get `activeTradingSystem` from user (stays user-scoped).
    - `transaction.getTradingPairs` — Add `accountId: z.number()` to input.
  - In `transaction.close`: replace `getUserById` for initialBalance with `getAccountById` to get the account's initialBalance

  **Must NOT do**:
  - Do NOT change `getTransactionById`, `updateTransaction`, `deleteTransaction` to require accountId (they use transactionId + userId which is sufficient for ownership)
  - Do NOT modify `getTransactionElements`, `replaceTransactionElements`, `calculateConfidenceLevel` (these are transaction-element level, not account-scoped)
  - Do NOT remove `userId` parameter from any function that currently uses it for ownership validation
  - Do NOT change Trading System or Element procedures

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Multiple interconnected DB functions + tRPC procedures with careful parameter threading and balance calculation logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 3, 5)
  - **Blocks**: Tasks 6, 10, 11, 12
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `server/db.ts` function `getTransactionsByUserId` (full implementation) — This is the primary function being modified. Currently filters by `userId` + optional status/outcome/direction/sortBy. Must add `accountId` to the WHERE clause.
  - `server/db.ts` function `getCurrentBalance` (full implementation) — Critical: currently sums `returnAmount` from closed/reviewed transactions filtered by `userId`. Must change to filter by `accountId` instead.
  - `server/db.ts` function `getConsecutiveLosses` (full implementation) — Currently filters by `userId`. Must add `accountId` filter.
  - `server/db.ts` function `createTransactionWithElements` — Must accept `accountId` in the data object
  - `server/routers.ts` `transaction.create` procedure — Current Zod input schema and creation flow. Add `accountId` to input.
  - `server/routers.ts` `transaction.close` procedure — Complex: fetches user for initialBalance, computes balance, consecutive losses. Must fetch account instead for initialBalance.
  - `server/routers.ts` `transaction.getFormDefaults` procedure — Returns currentBalance, consecutiveLosses, initialBalance, activeSystem. Balance/losses become account-scoped, activeSystem stays user-scoped.

  **API/Type References**:
  - `drizzle/schema.ts` `transactions` table — The `accountId` column definition (from Task 1)
  - `server/db.ts` `getAccountById` (from Task 2) — Used in procedures to fetch account for initialBalance

  **WHY Each Reference Matters**:
  - `getCurrentBalance` and `getConsecutiveLosses` are the core balance logic — incorrect scoping here would cause cross-account data leakage
  - `transaction.close` is the most complex procedure — it reads user for initialBalance (must change to account), computes balance, computes losses, and updates the transaction
  - `getFormDefaults` returns a mixed result: account-scoped (balance, losses) + user-scoped (activeSystem)

  **Acceptance Criteria**:
  - [ ] `npm run check` passes
  - [ ] All transaction procedures accept `accountId` where needed
  - [ ] `getCurrentBalance` and `getConsecutiveLosses` filter by `accountId`
  - [ ] `transaction.create` stores `accountId` on new transactions
  - [ ] `transaction.close` uses account's `initialBalance` (not user's)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Transaction list returns only current account's transactions
    Tool: Bash
    Preconditions: User has 2 accounts (A, B). Account A has 3 transactions, Account B has 2.
    Steps:
      1. Call transaction.list with accountId=A
      2. Verify response has exactly 3 transactions
      3. Call transaction.list with accountId=B
      4. Verify response has exactly 2 transactions
    Expected Result: Each call returns only that account's transactions
    Failure Indicators: Mixed results, all 5 transactions returned for both calls
    Evidence: .sisyphus/evidence/task-4-transaction-isolation.txt

  Scenario: Balance calculation is account-scoped
    Tool: Bash
    Preconditions: Account A has initialBalance="1000" with one closed +$200 trade. Account B has initialBalance="5000" with no trades.
    Steps:
      1. Call transaction.getFormDefaults with accountId=A
      2. Verify currentBalance="1200"
      3. Call transaction.getFormDefaults with accountId=B
      4. Verify currentBalance="5000"
    Expected Result: Each account has its own independent balance
    Failure Indicators: Balances mixed, wrong calculations
    Evidence: .sisyphus/evidence/task-4-balance-isolation.txt

  Scenario: Create transaction stores accountId
    Tool: Bash
    Preconditions: User has Account A with id=1
    Steps:
      1. Call transaction.create with accountId=1 and valid trade data
      2. Verify response includes the created transaction
      3. Call transaction.list with accountId=1
      4. Verify new transaction appears in the list
    Expected Result: Transaction created with correct accountId
    Failure Indicators: Transaction created without accountId, or with wrong accountId
    Evidence: .sisyphus/evidence/task-4-create-with-account.txt
  ```

  **Commit**: YES (group with Wave 2)
  - Message: `feat(api): add account CRUD router and account-scoped queries`
  - Files: `server/db.ts`, `server/routers.ts`
  - Pre-commit: `npm run check`

- [ ] 5. Stats/FormDefaults Account-Scoping + User Router Cleanup

  **What to do**:
  - Update stats DB functions in `server/db.ts`:
    - `getStatistics(userId, initialBalance)` → change to `getStatistics(accountId, initialBalance)` — filter all transaction queries inside by `accountId` instead of `userId`
    - `getSystemStatistics(userId)` → change to `getSystemStatistics(accountId)` — filter by `accountId`
  - Update stats tRPC procedures in `server/routers.ts`:
    - `stats.get` — Add `accountId: z.number()` to input. Fetch account by id (with userId ownership check) to get its `initialBalance`. Pass `accountId` + `account.initialBalance` to `getStatistics`.
    - `stats.getBySystem` — Add `accountId: z.number()` to input. Pass `accountId` to `getSystemStatistics`.
  - Update user tRPC router:
    - `user.getSettings` — Remove `initialBalance` from return value (it's now per-account). Keep `activeTradingSystemId`.
    - Remove `user.setInitialBalance` procedure entirely (initialBalance is now managed via `account.update`)
  - Remove `updateUserInitialBalance` from `server/db.ts` (no longer needed)

  **Must NOT do**:
  - Do NOT change how `activeTradingSystemId` is stored or returned (stays on user)
  - Do NOT modify `tradingSystem.activate` / `tradingSystem.deactivate` (they update user, not account)
  - Do NOT remove `initialBalance` column from `users` table schema (keep for safety/rollback)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Stats functions are complex (multi-query aggregation), requires careful accountId threading
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 3, 4)
  - **Blocks**: Tasks 6, 10, 13
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `server/db.ts` function `getStatistics` (full implementation, ~100 lines) — Complex multi-query function that calculates win/loss counts, rates, streaks, profits, etc. Currently filters all inner queries by `userId`. Must change to filter by `accountId`.
  - `server/db.ts` function `getSystemStatistics` (full implementation) — Aggregates per-system stats. Currently filters by `userId`. Must change to filter by `accountId`.
  - `server/routers.ts` `stats.get` procedure — Currently calls `getUserById` for initialBalance then `getStatistics(userId, initialBalance)`. Must change to `getAccountById` for initialBalance.
  - `server/routers.ts` `stats.getBySystem` procedure — Currently passes `ctx.user.id`. Must accept + pass `accountId`.
  - `server/routers.ts` `user.getSettings` and `user.setInitialBalance` — These are being modified/removed.
  - `server/db.ts` function `updateUserInitialBalance` — Being removed.

  **API/Type References**:
  - `server/db.ts` `getAccountById` (from Task 2) — Used to fetch account's initialBalance for stats

  **WHY Each Reference Matters**:
  - `getStatistics` is the largest and most complex DB function — incorrect scoping would mix cross-account performance data
  - `getSystemStatistics` groups by trading system — since systems are shared, the stats for a system must only count transactions from the requested account
  - Removing `setInitialBalance` from user router is a breaking change for the frontend — Task 13 (Settings page) must be coordinated

  **Acceptance Criteria**:
  - [ ] `npm run check` passes
  - [ ] `stats.get` and `stats.getBySystem` accept `accountId`
  - [ ] `user.getSettings` no longer returns `initialBalance`
  - [ ] `user.setInitialBalance` procedure removed
  - [ ] `updateUserInitialBalance` DB function removed

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Stats are account-scoped
    Tool: Bash
    Preconditions: Account A has 5 closed transactions (3 wins, 2 losses). Account B has 1 closed transaction (1 win).
    Steps:
      1. Call stats.get with accountId=A
      2. Verify totalTrades=5, wins=3, losses=2
      3. Call stats.get with accountId=B
      4. Verify totalTrades=1, wins=1, losses=0
    Expected Result: Stats reflect only the requested account's data
    Failure Indicators: Stats show combined data from both accounts
    Evidence: .sisyphus/evidence/task-5-stats-isolation.txt

  Scenario: user.getSettings no longer returns initialBalance
    Tool: Bash
    Preconditions: Dev server running
    Steps:
      1. Call user.getSettings
      2. Verify response has `activeTradingSystemId` but NOT `initialBalance`
    Expected Result: Response contains only activeTradingSystemId
    Failure Indicators: initialBalance still present in response
    Evidence: .sisyphus/evidence/task-5-settings-no-balance.txt

  Scenario: user.setInitialBalance endpoint removed
    Tool: Bash
    Preconditions: Dev server running
    Steps:
      1. Attempt to call user.setInitialBalance
      2. Verify 404 or "procedure not found" error
    Expected Result: Procedure does not exist
    Failure Indicators: Procedure still accessible
    Evidence: .sisyphus/evidence/task-5-set-balance-removed.txt
  ```

  **Commit**: YES (group with Wave 2)
  - Message: `feat(api): add account CRUD router and account-scoped queries`
  - Files: `server/db.ts`, `server/routers.ts`
  - Pre-commit: `npm run check`

- [ ] 6. AccountContext + useAccount Hook

  **What to do**:
  - Create `client/src/contexts/AccountContext.tsx`:
    - React context providing: `selectedAccount: Account | null`, `setSelectedAccountId: (id: number) => void`, `accounts: Account[]`, `isLoading: boolean`
    - Use `trpc.account.list.useQuery()` to fetch accounts
    - Persist selected account ID in `localStorage` key `"selectedAccountId"`
    - On initial load:
      1. Read `selectedAccountId` from localStorage
      2. If it matches an account from the list, use it
      3. If not (stale/deleted/missing), fall back to the first account by `createdAt` (first in the list since it's ordered by `createdAt asc`)
      4. Update localStorage with the resolved account ID
    - On account switch: update localStorage + invalidate all account-scoped TanStack Query keys:
      - `["account"]` (account queries)
      - `["transaction"]` (all transaction queries)
      - `["stats"]` (all stats queries)
    - Export `useAccount()` hook that returns the context value (throw if used outside provider)
  - Wrap the app with `AccountProvider` in `client/src/App.tsx` (inside QueryClientProvider, alongside ThemeProvider)
  - When active account is deleted (detected when account list refreshes and selected ID is gone), auto-select first remaining account

  **Must NOT do**:
  - Do NOT store account data in server session/cookie
  - Do NOT create a separate store (use React context + TanStack Query)
  - Do NOT add account ID to URL/routing (keep in context only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single context file + one line in App.tsx, follows existing ThemeContext pattern
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (blocks all frontend tasks)
  - **Parallel Group**: Wave 3 (with Tasks 7, 8, 9 — but 7, 9 depend on this)
  - **Blocks**: Tasks 7, 8, 9, 10, 11, 12, 13
  - **Blocked By**: Tasks 2, 3, 4, 5

  **References**:

  **Pattern References**:
  - `client/src/contexts/ThemeContext.tsx` — Existing React context pattern in this project. Follow same structure: createContext, Provider component, useX hook, localStorage persistence.
  - `client/src/App.tsx` — Where to add `AccountProvider`. See how `ThemeProvider` is composed.
  - `client/src/main.tsx` — tRPC + QueryClient setup. Shows how query invalidation works. The `trpc.useUtils()` pattern for cache invalidation.

  **API/Type References**:
  - `shared/types.ts` `Account` type — The shape of account objects from the API
  - `server/routers.ts` `account.list` procedure — Returns `Account[]` ordered by `createdAt asc`

  **External References**:
  - TanStack Query `useUtils().invalidate()` pattern for cache invalidation on account switch

  **WHY Each Reference Matters**:
  - ThemeContext shows the exact pattern to follow: context + provider + hook + localStorage
  - App.tsx shows where to nest the provider in the component tree
  - Query invalidation is CRITICAL: without it, switching accounts would show stale data from the previous account

  **Acceptance Criteria**:
  - [ ] `npm run check` passes
  - [ ] `npm run build` succeeds
  - [ ] `AccountProvider` wraps the app in App.tsx
  - [ ] `useAccount()` hook returns selected account and setter
  - [ ] Account selection persists across page reloads via localStorage

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Account context provides selected account
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, user has at least one account
    Steps:
      1. Navigate to http://localhost:5000
      2. Open browser console, execute: localStorage.getItem("selectedAccountId")
      3. Verify a numeric account ID is stored
    Expected Result: localStorage contains the selected account ID
    Failure Indicators: null or undefined in localStorage, app crashes
    Evidence: .sisyphus/evidence/task-6-context-persistence.png

  Scenario: Stale localStorage falls back to first account
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running
    Steps:
      1. Set localStorage "selectedAccountId" to "99999" (non-existent)
      2. Reload page
      3. Verify app loads without error
      4. Verify localStorage now contains the first account's ID
    Expected Result: App gracefully falls back to first available account
    Failure Indicators: App crash, blank screen, error toast
    Evidence: .sisyphus/evidence/task-6-stale-fallback.png
  ```

  **Commit**: YES (group with Wave 3)
  - Message: `feat(ui): add AccountContext, switcher, and accounts page`
  - Files: `client/src/contexts/AccountContext.tsx`, `client/src/App.tsx`
  - Pre-commit: `npm run check && npm run build`

- [ ] 7. Account Switcher Dropdown Component

  **What to do**:
  - Create `client/src/components/AccountSwitcher.tsx`:
    - Dropdown/popover component placed in the sidebar header area
    - Shows currently selected account name + truncated balance
    - Dropdown lists all accounts: name, current balance (fetched dynamically or from context)
    - Clicking an account calls `setSelectedAccountId(account.id)` from `useAccount()`
    - Include a "管理账户" (Manage Accounts) link at bottom of dropdown that navigates to `/accounts`
    - Use shadcn/ui components: `DropdownMenu` or `Popover` + `Command` for the switcher
    - Style to fit within sidebar header, with chevron/expand indicator
    - Show a subtle visual indicator for the currently selected account (checkmark or highlight)
  - Handle loading state: show skeleton while accounts are loading
  - Handle single account: still show dropdown but without the switching UX emphasis

  **Must NOT do**:
  - Do NOT add account avatars, colors, or icons
  - Do NOT add inline account creation in the dropdown (route to /accounts instead)
  - Do NOT show account ID to the user

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component with dropdown interaction, styling considerations for sidebar integration
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 8)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 2, 6

  **References**:

  **Pattern References**:
  - `client/src/components/DashboardLayout.tsx` — The sidebar structure. The switcher will be placed in the sidebar header section. Read to understand the `SidebarHeader`, `SidebarContent`, `SidebarFooter` structure.
  - `client/src/components/ui/dropdown-menu.tsx` — Shadcn DropdownMenu primitives (if exists)
  - `client/src/components/ui/popover.tsx` — Alternative: Shadcn Popover (if exists)
  - `client/src/components/ui/` directory — List available UI primitives to choose the best fit

  **API/Type References**:
  - `client/src/contexts/AccountContext.tsx` (from Task 6) — `useAccount()` hook providing `accounts`, `selectedAccount`, `setSelectedAccountId`

  **External References**:
  - shadcn/ui DropdownMenu docs for trigger/content/item pattern
  - Slack workspace switcher as UX reference (compact, sidebar-top placement)

  **WHY Each Reference Matters**:
  - DashboardLayout is WHERE this component gets rendered — must understand the sidebar slot structure
  - shadcn/ui primitives ensure consistent styling with the rest of the app

  **Acceptance Criteria**:
  - [ ] `npm run check` passes
  - [ ] `npm run build` succeeds
  - [ ] AccountSwitcher component renders in isolation
  - [ ] Shows current account name and dropdown trigger

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Account switcher displays and switches accounts
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, user has 2+ accounts
    Steps:
      1. Navigate to http://localhost:5000
      2. Locate the account switcher in the sidebar header area
      3. Verify current account name is displayed
      4. Click the switcher to open dropdown
      5. Verify all accounts are listed
      6. Click a different account
      7. Verify the displayed account name changes
    Expected Result: Switcher shows accounts and switching works
    Failure Indicators: Dropdown doesn't open, accounts not listed, switch doesn't update
    Evidence: .sisyphus/evidence/task-7-switcher-interaction.png

  Scenario: Manage Accounts link navigates to /accounts
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, switcher dropdown open
    Steps:
      1. Open account switcher dropdown
      2. Click "管理账户" link at bottom
      3. Verify URL changes to /accounts
    Expected Result: Navigation to accounts management page
    Failure Indicators: Link missing, wrong navigation target
    Evidence: .sisyphus/evidence/task-7-manage-link.png
  ```

  **Commit**: YES (group with Wave 3)
  - Message: `feat(ui): add AccountContext, switcher, and accounts page`
  - Files: `client/src/components/AccountSwitcher.tsx`
  - Pre-commit: `npm run check && npm run build`

- [ ] 8. Accounts Management Page

  **What to do**:
  - Create `client/src/pages/Accounts.tsx`:
    - Page listing all user accounts in a card/list layout
    - Each account card shows: name, notes (truncated), initial balance, current balance (if calculable), created date
    - **Create account**: Button opens a dialog/modal form with fields:
      - Name (required, text input)
      - Notes (optional, textarea)
      - Initial Balance (required, number input, default "0")
      - Submit calls `trpc.account.create.useMutation()`
      - On success: invalidate `account.list`, show `toast.success`, close dialog
    - **Edit account**: Click account card or edit button → dialog with pre-filled fields
      - Submit calls `trpc.account.update.useMutation()`
      - On success: invalidate `account.list`, show `toast.success`
    - **Delete account**: Delete button on each card (except if only 1 account)
      - Click opens confirmation dialog: "确认删除账户「{name}」？该账户下的所有交易记录将被一并删除，此操作不可撤销。"
      - Confirm calls `trpc.account.delete.useMutation()`
      - On success: invalidate `account.list`, show `toast.success`
      - If deleting active account: AccountContext auto-falls back to first remaining
    - Use existing UI patterns: Card, Button, Dialog, Input, Textarea, toast
    - Empty state: Shouldn't happen (user always has ≥1 account) but handle gracefully
  - Add route `/accounts` → `Accounts` in `client/src/App.tsx`

  **Must NOT do**:
  - Do NOT add drag-to-reorder accounts
  - Do NOT add account duplication/clone
  - Do NOT show transaction list inline on this page
  - Do NOT add export/import account data

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Full page UI with list, create/edit dialogs, delete confirmation — significant UI composition
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 7)
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Tasks 2, 6

  **References**:

  **Pattern References**:
  - `client/src/pages/Transactions.tsx` — Example of a list page with tRPC query, loading states, empty states, and action buttons. Follow similar layout structure.
  - `client/src/pages/NewTransaction.tsx` — Example of a form page with tRPC mutation, Zod validation, toast notifications. Follow the mutation + invalidation pattern.
  - `client/src/components/ui/dialog.tsx` — Shadcn Dialog component for create/edit/delete modals
  - `client/src/components/ui/card.tsx` — Shadcn Card for account display
  - `client/src/components/ui/input.tsx`, `button.tsx`, `textarea.tsx` — Form elements

  **API/Type References**:
  - `server/routers.ts` `account.create`, `account.list`, `account.update`, `account.delete` (from Task 2) — The tRPC procedures this page calls
  - `shared/types.ts` `Account` — Type for account objects

  **WHY Each Reference Matters**:
  - Transactions page shows how to structure a data list page with loading/empty states
  - NewTransaction shows the mutation → invalidation → toast pattern
  - Dialog/Card/Input components maintain visual consistency with existing pages

  **Acceptance Criteria**:
  - [ ] `npm run check` passes
  - [ ] `npm run build` succeeds
  - [ ] `/accounts` route renders the accounts page
  - [ ] Create, edit, and delete operations work via UI

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Create a new account
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, on /accounts page
    Steps:
      1. Navigate to http://localhost:5000/accounts
      2. Click "创建账户" (Create Account) button
      3. Fill name: "Swing Trading"
      4. Fill notes: "Long-term swing trades"
      5. Fill initial balance: "5000"
      6. Click submit/save button
      7. Verify new account appears in the list
      8. Verify success toast appears
    Expected Result: Account created and visible in list with correct data
    Failure Indicators: Form validation error, account not appearing, error toast
    Evidence: .sisyphus/evidence/task-8-create-account.png

  Scenario: Delete account with confirmation
    Tool: Playwright (playwright skill)
    Preconditions: User has 2+ accounts on /accounts page
    Steps:
      1. Click delete button on a non-active account
      2. Verify confirmation dialog appears with account name and warning text
      3. Click confirm delete
      4. Verify account removed from list
      5. Verify success toast appears
    Expected Result: Account deleted after confirmation
    Failure Indicators: No confirmation dialog, account still visible after delete
    Evidence: .sisyphus/evidence/task-8-delete-confirm.png

  Scenario: Cannot delete last remaining account
    Tool: Playwright (playwright skill)
    Preconditions: User has exactly 1 account on /accounts page
    Steps:
      1. Verify delete button is disabled or hidden for the only account
      2. If button exists, click it and verify error message
    Expected Result: Deletion prevented with clear feedback
    Failure Indicators: Account deleted, app crashes, no error feedback
    Evidence: .sisyphus/evidence/task-8-last-account-guard.png
  ```

  **Commit**: YES (group with Wave 3)
  - Message: `feat(ui): add AccountContext, switcher, and accounts page`
  - Files: `client/src/pages/Accounts.tsx`, `client/src/App.tsx`
  - Pre-commit: `npm run check && npm run build`

- [ ] 9. DashboardLayout Updates (Switcher Integration + Navigation)

  **What to do**:
  - Integrate `AccountSwitcher` component into `DashboardLayout.tsx`:
    - Place in the `SidebarHeader` section, prominently visible
    - Should be the first/top element users see in the sidebar
  - Add "Accounts" navigation item to sidebar:
    - Label: "账户管理" or "Accounts"
    - Icon: appropriate Lucide icon (e.g., `Wallet`, `CreditCard`, or `Users`)
    - Route: `/accounts`
    - Position: after "Settings" or in a logical group
  - Ensure the sidebar collapses/expands correctly with the new switcher component
  - Test mobile responsiveness of the new sidebar header

  **Must NOT do**:
  - Do NOT restructure the entire sidebar layout
  - Do NOT change existing navigation item order/styling
  - Do NOT add a separate top header bar (keep sidebar-only layout)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small integration task — import component, add to JSX, add one nav item
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (but depends on Task 7)
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Tasks 6, 7

  **References**:

  **Pattern References**:
  - `client/src/components/DashboardLayout.tsx` — Full file: understand `SidebarHeader`, `SidebarContent` (nav items), `SidebarFooter` structure. The nav items use a specific pattern with icon + label + link. Follow the exact same pattern for the new "Accounts" item.

  **API/Type References**:
  - `client/src/components/AccountSwitcher.tsx` (from Task 7) — The component to integrate

  **External References**:
  - Lucide React icons (already used in DashboardLayout for nav items)

  **WHY Each Reference Matters**:
  - DashboardLayout is the single file being modified — must understand its full structure to integrate without breaking

  **Acceptance Criteria**:
  - [ ] `npm run check` passes
  - [ ] `npm run build` succeeds
  - [ ] Account switcher visible in sidebar header
  - [ ] "Accounts" nav item visible and links to `/accounts`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Sidebar shows account switcher and accounts nav
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running
    Steps:
      1. Navigate to http://localhost:5000
      2. Verify account switcher is visible at the top of the sidebar
      3. Verify "Accounts" / "账户管理" navigation item exists in sidebar
      4. Click the Accounts nav item
      5. Verify navigation to /accounts
    Expected Result: Both switcher and nav item are present and functional
    Failure Indicators: Missing components, broken layout, nav not working
    Evidence: .sisyphus/evidence/task-9-sidebar-integration.png

  Scenario: Sidebar collapses correctly with switcher
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, viewport > 768px
    Steps:
      1. Collapse sidebar (if collapsible)
      2. Verify layout doesn't break
      3. Expand sidebar
      4. Verify switcher is fully visible again
    Expected Result: Sidebar collapse/expand works with new components
    Failure Indicators: Layout overflow, hidden content, broken styling
    Evidence: .sisyphus/evidence/task-9-sidebar-collapse.png
  ```

  **Commit**: YES (group with Wave 3)
  - Message: `feat(ui): add AccountContext, switcher, and accounts page`
  - Files: `client/src/components/DashboardLayout.tsx`
  - Pre-commit: `npm run check && npm run build`

- [ ] 10. Dashboard Page Account-Scoping

  **What to do**:
  - Update `client/src/pages/Dashboard.tsx`:
    - Import `useAccount()` from AccountContext
    - Get `selectedAccount` from the hook
    - Pass `accountId: selectedAccount.id` to `trpc.stats.get.useQuery({ accountId })`
    - Pass `accountId: selectedAccount.id` to `trpc.stats.getBySystem.useQuery({ accountId })`
    - Show loading state while account is resolving (when `selectedAccount` is null/loading)
    - When account changes, queries auto-refetch (due to accountId in query key)
    - Display account name somewhere visible on the dashboard (e.g., page title or subtitle)
  - Ensure the balance display uses account-scoped data (which it will, since stats.get now returns account-scoped balance)

  **Must NOT do**:
  - Do NOT add cross-account comparison or aggregate views
  - Do NOT change the dashboard layout structure or chart types
  - Do NOT modify how trading system stats are displayed (they're still system-level, just filtered by account)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward prop threading — add useAccount() + pass accountId to existing queries
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 11, 12, 13)
  - **Blocks**: None
  - **Blocked By**: Tasks 4, 5, 6

  **References**:

  **Pattern References**:
  - `client/src/pages/Dashboard.tsx` — Full file: read to understand current query patterns (`trpc.stats.get.useQuery()`, `trpc.stats.getBySystem.useQuery()`), loading states, and data rendering. The changes are minimal: add accountId to query inputs.

  **API/Type References**:
  - `client/src/contexts/AccountContext.tsx` (from Task 6) — `useAccount()` returns `{ selectedAccount, accounts, isLoading }`
  - `server/routers.ts` `stats.get` and `stats.getBySystem` (updated in Task 5) — Now accept `{ accountId: number }` input

  **WHY Each Reference Matters**:
  - Dashboard is the primary data display page — must correctly pass accountId to both stats queries
  - Need to handle the case where selectedAccount is null (loading state) to avoid query errors

  **Acceptance Criteria**:
  - [ ] `npm run check` passes
  - [ ] `npm run build` succeeds
  - [ ] Dashboard shows stats for selected account only
  - [ ] Switching accounts updates dashboard data

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dashboard shows account-specific stats
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, 2 accounts with different transaction data
    Steps:
      1. Navigate to http://localhost:5000
      2. Note the displayed stats (win rate, balance, profit, etc.)
      3. Switch to the other account via sidebar switcher
      4. Verify stats change to reflect the new account's data
    Expected Result: Stats update to match the selected account
    Failure Indicators: Same stats shown for both accounts, stale data after switch
    Evidence: .sisyphus/evidence/task-10-dashboard-switch.png

  Scenario: Dashboard handles empty account
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, one account with 0 transactions
    Steps:
      1. Switch to the empty account
      2. Verify dashboard shows empty/zero state gracefully
    Expected Result: Dashboard shows zero stats or empty state message, no errors
    Failure Indicators: NaN values, crash, error messages
    Evidence: .sisyphus/evidence/task-10-dashboard-empty.png
  ```

  **Commit**: YES (group with Wave 4)
  - Message: `feat(ui): update pages for account-scoped data`
  - Files: `client/src/pages/Dashboard.tsx`
  - Pre-commit: `npm run check && npm run build`

- [ ] 11. Transactions Page Account-Scoping

  **What to do**:
  - Update `client/src/pages/Transactions.tsx`:
    - Import `useAccount()` from AccountContext
    - Pass `accountId: selectedAccount.id` to `trpc.transaction.list.useQuery({ ..., accountId })`
    - Handle loading state when account is resolving
    - When account changes, transaction list auto-refetches
    - Ensure pagination/filters reset when account changes (if applicable)
    - Deletion: `trpc.transaction.delete` doesn't need accountId (uses transactionId + userId)
    - Close trade: `trpc.transaction.close` may need to pass accountId for balance recalculation — verify against Task 4 changes

  **Must NOT do**:
  - Do NOT add cross-account transaction views
  - Do NOT change the transaction table columns or sort options
  - Do NOT modify the close/review trade flow beyond passing accountId

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Add accountId to existing query call, straightforward
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 10, 12, 13)
  - **Blocks**: None
  - **Blocked By**: Tasks 4, 6

  **References**:

  **Pattern References**:
  - `client/src/pages/Transactions.tsx` — Full file: current query with filters (sortBy, sortOrder, outcome, direction, status, tradingPair). Add `accountId` to the query input object alongside these filters.

  **API/Type References**:
  - `server/routers.ts` `transaction.list` (updated in Task 4) — Now accepts `{ accountId, ...filters }` input
  - `client/src/contexts/AccountContext.tsx` (from Task 6) — `useAccount()` hook

  **WHY Each Reference Matters**:
  - Transaction list is the most filter-heavy query — accountId is another filter alongside existing ones
  - Must ensure filter state resets or stays reasonable when switching accounts

  **Acceptance Criteria**:
  - [ ] `npm run check` passes
  - [ ] `npm run build` succeeds
  - [ ] Transaction list shows only selected account's transactions
  - [ ] Switching accounts updates the transaction list

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Transaction list is account-scoped
    Tool: Playwright (playwright skill)
    Preconditions: Account A has 3 transactions, Account B has 0. Dev server running.
    Steps:
      1. Navigate to /transactions with Account A selected
      2. Verify 3 transactions displayed
      3. Switch to Account B
      4. Verify 0 transactions displayed (empty state)
    Expected Result: Each account shows its own transactions only
    Failure Indicators: Both accounts show same data, switch doesn't update
    Evidence: .sisyphus/evidence/task-11-transactions-isolation.png

  Scenario: Transaction filters work within account scope
    Tool: Playwright (playwright skill)
    Preconditions: Account A has transactions with different outcomes
    Steps:
      1. Navigate to /transactions with Account A selected
      2. Apply a filter (e.g., outcome = "Win")
      3. Verify filtered results are within Account A only
      4. Switch to Account B
      5. Verify filters show Account B's data (or empty if no matching)
    Expected Result: Filters apply within account scope
    Failure Indicators: Cross-account filtering, stale filter results
    Evidence: .sisyphus/evidence/task-11-filtered-isolation.png
  ```

  **Commit**: YES (group with Wave 4)
  - Message: `feat(ui): update pages for account-scoped data`
  - Files: `client/src/pages/Transactions.tsx`
  - Pre-commit: `npm run check && npm run build`

- [ ] 12. NewTransaction Page Account-Scoping

  **What to do**:
  - Update `client/src/pages/NewTransaction.tsx`:
    - Import `useAccount()` from AccountContext
    - Pass `accountId: selectedAccount.id` to `trpc.transaction.getFormDefaults.useQuery({ accountId })`
    - Pass `accountId: selectedAccount.id` to `trpc.transaction.create.useMutation()` call (include in mutation input)
    - The form defaults now return mixed-scope data:
      - **Account-scoped**: `currentBalance`, `consecutiveLosses`, `initialBalance` (from the selected account)
      - **User-scoped**: `activeSystem` (from the user, shared across accounts)
    - Display the selected account's current balance in the sidebar/info area
    - Handle loading state when account is resolving
  - Also update the transaction detail/edit page (`/transactions/:id`) if it exists:
    - The transaction detail page uses `trpc.transaction.get` which doesn't need accountId (uses transactionId + userId)
    - But if it shows balance or allows close, it may need account context for balance recalculation

  **Must NOT do**:
  - Do NOT add an account selector to the new trade form (use the global sidebar switcher)
  - Do NOT change the trading system or element selection flow (these are user-scoped)
  - Do NOT modify form field validation or Zod schemas beyond adding accountId

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Add accountId to query and mutation calls, straightforward
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 10, 11, 13)
  - **Blocks**: None
  - **Blocked By**: Tasks 4, 6

  **References**:

  **Pattern References**:
  - `client/src/pages/NewTransaction.tsx` — Full file: understand the form defaults query, form state management, and mutation call. Currently uses `trpc.transaction.getFormDefaults.useQuery()` (no args) — must add `{ accountId }`.
  - Also check if there's a transaction detail/edit page at `client/src/pages/TransactionDetail.tsx` or similar — may need the same treatment

  **API/Type References**:
  - `server/routers.ts` `transaction.getFormDefaults` (updated in Task 4) — Now accepts `{ accountId }`, returns account-scoped balance + user-scoped activeSystem
  - `server/routers.ts` `transaction.create` (updated in Task 4) — Now accepts `{ accountId, ...tradeData }`
  - `client/src/contexts/AccountContext.tsx` (from Task 6) — `useAccount()` hook

  **WHY Each Reference Matters**:
  - NewTransaction is where accountId enters the system for new trades — incorrect scoping here means trades get created in the wrong account
  - Form defaults (balance, losses) MUST be account-scoped while activeSystem remains user-scoped

  **Acceptance Criteria**:
  - [ ] `npm run check` passes
  - [ ] `npm run build` succeeds
  - [ ] New trade form shows selected account's balance and consecutive losses
  - [ ] Created transactions are associated with the selected account

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: New trade shows correct account balance
    Tool: Playwright (playwright skill)
    Preconditions: Account A has currentBalance="1200", Account B has currentBalance="5000"
    Steps:
      1. Select Account A in sidebar
      2. Navigate to /transactions/new
      3. Verify displayed balance is "1200" (or formatted equivalent)
      4. Switch to Account B
      5. Verify displayed balance updates to "5000"
    Expected Result: Form defaults reflect selected account's data
    Failure Indicators: Wrong balance, stale data, balance from wrong account
    Evidence: .sisyphus/evidence/task-12-form-balance.png

  Scenario: Created transaction belongs to selected account
    Tool: Playwright (playwright skill)
    Preconditions: Account A selected, on /transactions/new
    Steps:
      1. Fill out trade form with valid data
      2. Submit the trade
      3. Navigate to /transactions
      4. Verify new trade appears in Account A's list
      5. Switch to Account B
      6. Verify new trade does NOT appear in Account B's list
    Expected Result: Transaction created under correct account
    Failure Indicators: Trade appears in wrong account, or both accounts
    Evidence: .sisyphus/evidence/task-12-create-scoped.png
  ```

  **Commit**: YES (group with Wave 4)
  - Message: `feat(ui): update pages for account-scoped data`
  - Files: `client/src/pages/NewTransaction.tsx`
  - Pre-commit: `npm run check && npm run build`

- [ ] 13. Settings Page Cleanup

  **What to do**:
  - Update `client/src/pages/Settings.tsx`:
    - Remove the initialBalance input field and its associated state/mutation
    - Remove `trpc.user.setInitialBalance.useMutation()` call
    - Remove related query invalidation for `user.getSettings` (if only used for initialBalance)
    - Update `trpc.user.getSettings.useQuery()` usage — it no longer returns `initialBalance`
    - Keep any other settings that exist on the page (e.g., activeTradingSystemId-related settings)
    - Add a note/link redirecting to the Accounts page for balance management: "初始资金设置已移至账户管理" with a link to `/accounts`
  - If Settings page becomes empty or nearly empty after removal, consider:
    - Keeping the page with remaining settings + account management redirect
    - Do NOT remove the route or page entirely (keep it for future settings)

  **Must NOT do**:
  - Do NOT remove the Settings route from App.tsx
  - Do NOT remove the Settings nav item from sidebar
  - Do NOT touch activeTradingSystemId settings (if they exist on this page)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Removal task — delete code sections, straightforward
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 10, 11, 12)
  - **Blocks**: None
  - **Blocked By**: Tasks 5, 6

  **References**:

  **Pattern References**:
  - `client/src/pages/Settings.tsx` — Full file: understand what currently exists. The main content is the initialBalance form. After removal, see what's left and decide on placeholder content.

  **API/Type References**:
  - `server/routers.ts` `user.getSettings` (updated in Task 5) — No longer returns `initialBalance`, only `activeTradingSystemId`

  **WHY Each Reference Matters**:
  - Settings page is the only consumer of `user.setInitialBalance` — removing the frontend call coordinates with the backend removal in Task 5
  - Must check what remains on the page after removing initialBalance to avoid an empty/broken page

  **Acceptance Criteria**:
  - [ ] `npm run check` passes
  - [ ] `npm run build` succeeds
  - [ ] Settings page no longer shows initialBalance form
  - [ ] Settings page still renders without errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Settings page no longer manages initialBalance
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running
    Steps:
      1. Navigate to /settings
      2. Verify no initialBalance input field is visible
      3. Verify page renders without errors
      4. Look for redirect/link to accounts page for balance management
    Expected Result: No initialBalance form, page renders cleanly with redirect info
    Failure Indicators: initialBalance form still present, page crash, type errors
    Evidence: .sisyphus/evidence/task-13-settings-cleaned.png

  Scenario: Redirect link to accounts page works
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, on /settings
    Steps:
      1. Find the "账户管理" or accounts redirect link
      2. Click it
      3. Verify navigation to /accounts
    Expected Result: Link navigates to accounts management
    Failure Indicators: Link missing, wrong target
    Evidence: .sisyphus/evidence/task-13-accounts-link.png
  ```

  **Commit**: YES (group with Wave 4)
  - Message: `feat(ui): update pages for account-scoped data`
  - Files: `client/src/pages/Settings.tsx`
  - Pre-commit: `npm run check && npm run build`

- [ ] 14. Account CRUD + Migration Server Tests

  **What to do**:
  - Create `server/account.test.ts`:
    - Test account CRUD via `appRouter.createCaller(ctx)` pattern (follow existing test patterns)
    - **Create tests**:
      - Create account with valid data ("IRA", notes: "Long-term swing account", initialBalance: "2500") → verify returned object has correct fields
      - Create account with minimal data (name only) → verify initialBalance defaults to "0"
      - Create account with empty name → verify rejection
      - Create account with whitespace-only name → verify rejection
    - **List tests**:
      - List returns only current user's accounts
      - List is ordered by `createdAt asc`
      - User with no accounts (edge case) → returns empty array (pre-migration state)
    - **Update tests**:
      - Update name/notes/initialBalance → verify changes persisted
      - Update non-owned account → verify rejection
    - **Delete tests**:
      - Delete account with transactions → verify cascade (transactions deleted)
      - Delete last remaining account → verify rejection with clear error
      - Delete non-owned account → verify rejection
    - **Migration tests** (test `ensureUserHasAccount`):
      - User with `initialBalance="1000"` and 3 transactions (accountId=null) → after migration, exactly 1 default account with initialBalance="1000", all 3 transactions linked
      - User with `initialBalance="0"` and 0 transactions → after migration, 1 default account with initialBalance="0"
      - User who already has accounts → migration is a no-op (idempotent)
  - Use `vi.mock` for DB layer if following existing test patterns, OR use real DB if test infrastructure supports it (check existing tests)

  **Must NOT do**:
  - Do NOT test frontend components in this file
  - Do NOT add Playwright tests
  - Do NOT modify existing test files

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Comprehensive test suite covering CRUD, migration, edge cases, and error paths
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Task 15)
  - **Blocks**: None
  - **Blocked By**: Tasks 2, 3, 4, 5

  **References**:

  **Pattern References**:
  - `server/transaction.test.ts` — Primary test pattern reference. Shows how to use `appRouter.createCaller(ctx)`, mock DB functions with `vi.mock`, structure describe/it blocks, and assert tRPC procedure results.
  - `server/tradingSystem.test.ts` — Additional CRUD test patterns for tRPC procedures
  - `server/auth.logout.test.ts` — Context factory patterns for creating test contexts

  **API/Type References**:
  - `server/routers.ts` `account.*` procedures (from Task 2) — The procedures being tested
  - `server/db.ts` `ensureUserHasAccount` (from Task 3) — The migration function being tested

  **WHY Each Reference Matters**:
  - Existing test files define the testing conventions — must follow same patterns for consistency
  - The caller pattern (`appRouter.createCaller(ctx)`) is the standard way to test tRPC procedures in this project

  **Acceptance Criteria**:
  - [ ] `npx vitest run server/account.test.ts` passes with all tests green
  - [ ] Test file covers: create (4 cases), list (3 cases), update (2 cases), delete (3 cases), migration (3 cases)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All account tests pass
    Tool: Bash
    Preconditions: All implementation tasks (1-5) complete
    Steps:
      1. Run `npx vitest run server/account.test.ts`
      2. Verify exit code 0
      3. Verify all test cases pass (expect ~15 tests)
    Expected Result: All tests pass, zero failures
    Failure Indicators: Test failures, import errors, mock issues
    Evidence: .sisyphus/evidence/task-14-account-tests.txt

  Scenario: Overall test suite still passes
    Tool: Bash
    Preconditions: New test file created
    Steps:
      1. Run `npm run test`
      2. Verify exit code 0
      3. Verify no regressions in existing tests
    Expected Result: All existing + new tests pass
    Failure Indicators: Existing test failures, import conflicts
    Evidence: .sisyphus/evidence/task-14-full-test-suite.txt
  ```

  **Commit**: YES (group with Wave 5)
  - Message: `test(api): add account CRUD, isolation, and migration tests`
  - Files: `server/account.test.ts`
  - Pre-commit: `npm run check && npm run test`

- [ ] 15. Account Isolation + Authorization Server Tests

  **What to do**:
  - Create `server/accountScope.test.ts`:
    - **Isolation tests** (verify data doesn't leak between accounts):
      - User with accounts A and B. Create 3 transactions in A, 2 in B. `transaction.list(accountId=A)` returns exactly 3. `transaction.list(accountId=B)` returns exactly 2.
      - Same user/accounts. `stats.get(accountId=A)` reflects only A's transactions. `stats.get(accountId=B)` reflects only B's.
      - `transaction.getFormDefaults(accountId=A)` returns A's balance/losses. `getFormDefaults(accountId=B)` returns B's balance/losses.
      - `transaction.getTradingPairs(accountId=A)` returns only pairs used in A.
      - `getConsecutiveLosses` for account A does not count losses from account B.
    - **Authorization tests** (verify cross-user rejection):
      - User U1 creating account. User U2 attempting to access U1's account via `account.get(id=U1's accountId)` → rejected.
      - User U2 attempting to list transactions for U1's account via `transaction.list(accountId=U1's account)` → rejected or empty.
      - User U2 attempting to delete U1's account → rejected.
      - User U2 attempting to create transaction in U1's account → rejected.
    - **Edge case tests**:
      - Active account deleted → verify data queries gracefully handle it (no crash)
      - Stats for account with zero transactions → valid empty/zero response
      - getFormDefaults for account with zero transactions → returns initialBalance, consecutiveLosses=0

  **Must NOT do**:
  - Do NOT test frontend behavior
  - Do NOT duplicate tests from Task 14 (focus on cross-account isolation here)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-account test scenarios with complex setup (multiple users, multiple accounts, cross-assertions)
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Task 14)
  - **Blocks**: None
  - **Blocked By**: Tasks 2, 4, 5

  **References**:

  **Pattern References**:
  - `server/transaction.test.ts` — Test structure, mocking patterns, caller setup
  - `server/account.test.ts` (from Task 14) — May share helper setup functions for creating test accounts

  **API/Type References**:
  - All account-scoped procedures from Tasks 4, 5 — The procedures being tested for isolation

  **WHY Each Reference Matters**:
  - These tests are the primary safety net ensuring multi-account doesn't leak data between accounts or users

  **Acceptance Criteria**:
  - [ ] `npx vitest run server/accountScope.test.ts` passes with all tests green
  - [ ] Test file covers: isolation (5+ cases), authorization (4 cases), edge cases (3 cases)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All isolation tests pass
    Tool: Bash
    Preconditions: All implementation tasks complete
    Steps:
      1. Run `npx vitest run server/accountScope.test.ts`
      2. Verify exit code 0
      3. Verify all test cases pass (expect ~12 tests)
    Expected Result: All tests pass, zero failures
    Failure Indicators: Test failures indicating data leakage between accounts
    Evidence: .sisyphus/evidence/task-15-isolation-tests.txt

  Scenario: Full test suite including all new test files
    Tool: Bash
    Preconditions: All tasks complete
    Steps:
      1. Run `npm run test`
      2. Verify exit code 0
      3. Count total test files and cases
    Expected Result: All tests pass including new account and scope tests
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-15-final-test-suite.txt
  ```

  **Commit**: YES (group with Wave 5)
  - Message: `test(api): add account CRUD, isolation, and migration tests`
  - Files: `server/accountScope.test.ts`
  - Pre-commit: `npm run check && npm run test`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `npm run check` + `npm run build` + `npm run test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify Prettier formatting with `npm run format`.
      Output: `Build [PASS/FAIL] | Check [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
      Start dev server with `npm run dev`. Use Playwright to:
  1. Verify default account exists on first load
  2. Create a new account "Test Account" with initial balance "5000"
  3. Switch between accounts and verify data isolation
  4. Create a transaction in one account, confirm it doesn't appear in another
  5. Delete account and confirm cascade behavior
  6. Edit account name/notes/initialBalance
  7. Verify Settings page no longer shows initialBalance
  8. Verify Trading Systems/Elements are NOT account-scoped
     Save evidence to `.sisyphus/evidence/final-qa/`.
     Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Specifically verify:
  - Trading Systems and Elements have NO accountId references
  - activeTradingSystemId remains on users table, not accounts
  - No server-persisted active account
  - No extra account features (transfers, sharing, colors, etc.)
    Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| After Wave | Commit Message                                                  | Key Files                                                                                  | Pre-commit Check                 |
| ---------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------- |
| Wave 1     | `feat(db): add accounts table and accountId to transactions`    | `drizzle/schema.ts`, `shared/types.ts`                                                     | `npm run check`                  |
| Wave 2     | `feat(api): add account CRUD router and account-scoped queries` | `server/db.ts`, `server/routers.ts`, `server/_core/context.ts`                             | `npm run check`                  |
| Wave 3     | `feat(ui): add AccountContext, switcher, and accounts page`     | `client/src/contexts/`, `client/src/components/`, `client/src/pages/Accounts.tsx`          | `npm run check && npm run build` |
| Wave 4     | `feat(ui): update pages for account-scoped data`                | `client/src/pages/Dashboard.tsx`, `Transactions.tsx`, `NewTransaction.tsx`, `Settings.tsx` | `npm run check && npm run build` |
| Wave 5     | `test(api): add account CRUD, isolation, and migration tests`   | `server/account.test.ts`, `server/accountScope.test.ts`                                    | `npm run check && npm run test`  |

---

## Success Criteria

### Verification Commands

```bash
npm run check     # Expected: zero type errors
npm run build     # Expected: successful build
npm run test      # Expected: all tests pass (existing + new)
npm run format    # Expected: no formatting changes needed
```

### Final Checklist

- [ ] All "Must Have" items present and working
- [ ] All "Must NOT Have" items absent from codebase
- [ ] All existing tests still pass
- [ ] New server tests cover account CRUD, migration, isolation, auth
- [ ] Account switcher visible in sidebar, persists selection
- [ ] Dashboard/Transactions/NewTrade show account-specific data
- [ ] Trading Systems/Elements unchanged (shared across accounts)
- [ ] Settings page no longer manages initialBalance
