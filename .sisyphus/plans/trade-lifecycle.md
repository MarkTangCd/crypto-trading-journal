# Trade Lifecycle Refactoring: Open → Close → Review

## TL;DR

> **Quick Summary**: Refactor single-stage transaction creation into a 3-stage lifecycle (Open → Close → Review). Add `status` column, make outcome fields nullable, split the creation form, add a Close Trade modal, and gate review behind closed status.
>
> **Deliverables**:
>
> - Database schema migration: `status` column + nullable outcome fields + data backfill
> - Backend: new `transaction.close` procedure, status-aware guards on create/update/list
> - Frontend: simplified Open form, CloseTradeModal, status-aware detail/list pages
> - Full TDD coverage for lifecycle transitions, stat exclusions, and edit restrictions
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Schema → DB stat functions → tRPC procedures → Frontend UI

---

## Context

### Original Request

用户希望将交易创建流程从当前的"一次性填写所有信息"改为 3 阶段生命周期：

1. **Open (开单)** — 只填写入场信息
2. **Close (平仓)** — 后续通过 Modal 填写交易结果
3. **Review (复盘)** — 仅在交易关闭后才允许复盘

### Interview Summary

**Key Discussions**:

- Close Trade UI: **Modal 弹窗**（从列表或详情页触发）
- endTime: **仅在 Close 时填写**，开单时不需要
- Open 交易: **允许编辑**入场信息，Closed/Reviewed 锁定
- Open 交易统计: **完全排除**，不参与余额、胜率、连亏等计算
- 测试策略: **TDD** (RED-GREEN-REFACTOR)

**Research Findings**:

- 当前 `transactions` 表所有 outcome 字段都是 NOT NULL（`drizzle/schema.ts:106-165`）
- `transaction.create` 要求一次提交所有字段（`server/routers.ts:183-256`）
- `transaction.update` 仅允许修改 review 字段（`server/routers.ts:291-306`）
- 统计函数 `getCurrentBalance`, `getConsecutiveLosses`, `getStatistics` 未过滤状态（`server/db.ts:697-849`）
- 前端 `NewTransaction.tsx` 是 521 行的单体表单
- `isReviewed` 整数标志已存在，可被 `status` 替代

### Metis Review

**Identified Gaps** (addressed):

- 需要定义字段级可变性矩阵（已定义，见下方）
- 需要服务端强制状态转换规则，不能仅依赖 UI（已纳入计划）
- 需要处理遗留数据中 reviewFeedback 存在但 isReviewed=0 的边缘情况（保守映射为 "closed"）
- 需要明确 accountBalance/consecutiveLosses 的排序规则（按 endTime 排序）
- 需要防范作用域蔓延：不引入价格字段、仓位跟踪、或仪表盘重设计

---

## Work Objectives

### Core Objective

引入交易生命周期状态机（open → closed → reviewed），将创建、平仓、复盘解耦为独立的操作阶段。

### Concrete Deliverables

- `drizzle/schema.ts`: 新增 `status` 列，outcome 列改为 nullable
- `shared/const.ts`: 新增 `TRADE_STATUSES` 常量和状态转换规则
- `server/db.ts`: 所有统计函数过滤 open 状态交易
- `server/routers.ts`: 新增 `transaction.close`，修改 `create`/`update`/`list`
- `client/src/pages/NewTransaction.tsx`: 精简为仅 Open 阶段字段
- `client/src/components/CloseTradeModal.tsx`: 新增关闭交易弹窗
- `client/src/pages/TransactionDetail.tsx`: 按状态条件渲染
- `client/src/pages/Transactions.tsx`: 新增状态徽章和筛选
- `server/transaction.lifecycle.test.ts`: 完整的生命周期 TDD 测试

### Definition of Done

- [ ] `npm run check` — 零类型错误
- [ ] `npm run build` — 构建成功
- [ ] `npm run test` — 所有测试通过（包括新增的生命周期测试）
- [ ] 可创建 Open 交易（不需要 outcome 字段）
- [ ] 可通过 Modal 关闭交易（填写 outcome）
- [ ] 只有 Closed 交易可以进行 Review
- [ ] Open 交易不影响任何统计数据
- [ ] 所有现有数据正确迁移到新 status 字段

### Must Have

- 服务端强制状态转换规则（不仅仅是 UI 限制）
- Open → Closed → Reviewed 严格单向转换
- 字段级可变性矩阵强制执行
- Open 交易完全排除出统计
- 现有数据无损迁移
- TDD 覆盖所有生命周期路径

### Must NOT Have (Guardrails)

- 不引入 entry_price / exit_price 字段
- 不重设计 Dashboard 布局
- 不引入通用状态机抽象/库
- 不引入新的 Modal 框架（复用现有 shadcn Dialog）
- 不添加仓位跟踪 / 实时盈亏
- 不重构 `components/ui/*` 基础组件
- 不引入乐观锁 / 版本号 / 事件溯源
- 不引入新的前端测试框架

---

## Lifecycle Rules (Authoritative Reference)

### Status Transitions

```
open ──→ closed ──→ reviewed
  │
  └── (deletable)  (deletable)  (deletable)
```

- `open → closed`: 通过 `transaction.close` 过程
- `closed → reviewed`: 通过 `transaction.update` 提交 review
- 不允许反向转换（closed → open, reviewed → closed）
- 不允许跳过（open → reviewed）
- 所有状态均可删除

### Field Mutability Matrix

```
                        open    closed   reviewed
─────────────────────────────────────────────────
tradingPair             EDIT    LOCKED   LOCKED
direction               EDIT    LOCKED   LOCKED
timeFrame               EDIT    LOCKED   LOCKED
startTime               EDIT    LOCKED   LOCKED
tradingLogic            EDIT    LOCKED   LOCKED
tradingSystemId         EDIT    LOCKED   LOCKED
selectedElementIds      EDIT    LOCKED   LOCKED
tvUrl                   EDIT    LOCKED   LOCKED
confidenceLevel         AUTO    LOCKED   LOCKED
─────────────────────────────────────────────────
endTime                 —       SET      LOCKED
outcome                 —       SET      LOCKED
riskRewardRatio         —       SET      LOCKED
returnAmount            —       SET      LOCKED
accountBalance          —       AUTO     LOCKED
consecutiveLosses       —       AUTO     LOCKED
─────────────────────────────────────────────────
reviewFeedback          —       EDIT     EDIT
reviewChartUrl          —       EDIT     EDIT
status                  —       AUTO     AUTO
─────────────────────────────────────────────────
```

- EDIT = 用户可修改
- SET = 用户在此阶段首次设置
- AUTO = 系统自动计算
- LOCKED = 不可修改
- — = 此阶段不存在/不可操作

### Calculation Rules

- `accountBalance` 和 `consecutiveLosses` 在 **Close 时计算**（不在 Open 时）
- 排序规则：按 `endTime` 排序（用于余额和连亏计算）
- Open 交易不参与任何 `getCurrentBalance`, `getConsecutiveLosses`, `getStatistics` 计算

### Review Requirements

- `reviewFeedback` 必须非空才能标记为 reviewed
- `reviewChartUrl` 可选
- Closed 和 Reviewed 状态均可编辑 review 字段（修改后 reviewed 不变）

### Migration Rules

- `isReviewed = 1` → `status = "reviewed"`
- `isReviewed = 0`（含有 reviewFeedback 的） → `status = "closed"`（保守处理）
- `isReviewed = 0`（无 reviewFeedback） → `status = "closed"`
- 迁移后 `isReviewed` 列可移除

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: TDD (RED → GREEN → REFACTOR)
- **Framework**: Vitest (`npm run test`)
- **Each backend task**: Write failing tests FIRST, then implement to pass

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend**: Use Bash (Vitest) — run tests, assert pass/fail counts
- **Frontend/UI**: Use Playwright (playwright skill) — navigate, interact, assert DOM, screenshot
- **API**: Use Bash (curl or Vitest) — send requests, assert status + response fields

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — schema + types + tests scaffold):
├── Task 1: Schema migration + drizzle push [quick]
├── Task 2: Shared constants + type updates [quick]
└── Task 3: Data migration backfill [quick]

Wave 2 (Backend Logic — TDD, MAX PARALLEL):
├── Task 4: TDD: DB stat functions exclude open trades (depends: 1, 2) [deep]
├── Task 5: TDD: transaction.create → open-only (depends: 1, 2) [deep]
├── Task 6: TDD: transaction.close new procedure (depends: 1, 2) [deep]
├── Task 7: TDD: transaction.update status-aware + review gate (depends: 1, 2) [deep]
└── Task 8: TDD: transaction.list + getFormDefaults status-aware (depends: 1, 2) [unspecified-high]

Wave 3 (Frontend — after backend stable, MAX PARALLEL):
├── Task 9: Simplify NewTransaction form (depends: 5) [visual-engineering]
├── Task 10: CloseTradeModal component (depends: 6) [visual-engineering]
├── Task 11: TransactionDetail status-aware rendering (depends: 6, 7) [visual-engineering]
└── Task 12: Transactions list status badges + filters (depends: 8) [visual-engineering]

Wave FINAL (Verification — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks           | Wave |
| ---- | ---------- | ---------------- | ---- |
| 1    | —          | 3, 4, 5, 6, 7, 8 | 1    |
| 2    | —          | 4, 5, 6, 7, 8    | 1    |
| 3    | 1          | —                | 1    |
| 4    | 1, 2       | —                | 2    |
| 5    | 1, 2       | 9                | 2    |
| 6    | 1, 2       | 10, 11           | 2    |
| 7    | 1, 2       | 11               | 2    |
| 8    | 1, 2       | 12               | 2    |
| 9    | 5          | —                | 3    |
| 10   | 6          | —                | 3    |
| 11   | 6, 7       | —                | 3    |
| 12   | 8          | —                | 3    |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 → `quick`, T2 → `quick`, T3 → `quick`
- **Wave 2**: 5 tasks — T4 → `deep`, T5 → `deep`, T6 → `deep`, T7 → `deep`, T8 → `unspecified-high`
- **Wave 3**: 4 tasks — T9-T12 → `visual-engineering`
- **Wave FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Schema Migration: Add `status` Column + Nullable Outcome Fields

  **What to do**:
  - RED: Write a small test that imports the schema and asserts the `status` column exists with the correct type/CHECK constraint. This test will fail initially.
  - GREEN: In `drizzle/schema.ts`, add `status` column to `transactions` table:
    ```
    status: text("status").notNull().default("open").$check("status", sql`status IN ('open', 'closed', 'reviewed')`)
    ```
  - Make the following columns nullable (remove `.notNull()`): `endTime`, `outcome`, `riskRewardRatio`, `returnAmount`, `accountBalance`, `consecutiveLosses`
  - Remove the `isReviewed` column (replaced by `status === "reviewed"`)
  - Run `npm run db:push` to apply migration
  - REFACTOR: Verify `npm run check` passes with the new schema types

  **Must NOT do**:
  - Do not add entry_price / exit_price columns
  - Do not change any column that isn't listed above
  - Do not modify the `transaction_elements` junction table

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file schema change + drizzle push
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No UI work in this task

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 3, 4, 5, 6, 7, 8
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `drizzle/schema.ts:106-165` — Current `transactions` table definition. All column definitions live here. The `isReviewed` column at line 144-145 needs removal. Outcome columns (outcome, returnAmount, riskRewardRatio, endTime, accountBalance, consecutiveLosses) all currently have `.notNull()` which must be removed.
  - `drizzle/schema.ts:23-36` — `users` table for reference on how CHECK constraints and defaults are defined in this codebase.

  **API/Type References**:
  - `shared/types.ts` — Re-exports `Transaction` and `InsertTransaction` from drizzle schema. These types will auto-update when schema changes but downstream consumers must be checked.

  **External References**:
  - Drizzle ORM docs: column modifiers (`.notNull()`, `.default()`, `.$check()`)

  **WHY Each Reference Matters**:
  - `schema.ts:106-165`: This is the ONLY file to modify. The executor must understand the exact current column definitions to know which `.notNull()` calls to remove.
  - `shared/types.ts`: Confirms types auto-derive from schema — no manual type updates needed.

  **Acceptance Criteria**:

  **If TDD:**
  - [ ] Schema compiles: `npm run check` passes
  - [ ] Migration applies: `npm run db:push` succeeds
  - [ ] `status` column exists with CHECK constraint for 'open'|'closed'|'reviewed'
  - [ ] `status` defaults to 'open'
  - [ ] `endTime`, `outcome`, `riskRewardRatio`, `returnAmount`, `accountBalance`, `consecutiveLosses` are nullable in TypeScript types
  - [ ] `isReviewed` column removed

  **QA Scenarios:**

  ```
  Scenario: Schema types reflect nullable outcome fields
    Tool: Bash (npm run check)
    Preconditions: Schema changes applied in drizzle/schema.ts
    Steps:
      1. Run `npm run check`
      2. Grep output for errors related to transaction fields
    Expected Result: Zero type errors. Exit code 0.
    Failure Indicators: Type errors mentioning outcome, returnAmount, etc. as non-nullable
    Evidence: .sisyphus/evidence/task-1-schema-typecheck.txt

  Scenario: Drizzle migration applies cleanly
    Tool: Bash (npm run db:push)
    Preconditions: Schema changes in drizzle/schema.ts
    Steps:
      1. Run `npm run db:push`
      2. Check exit code
    Expected Result: Migration applies with exit code 0. New column `status` visible in output.
    Failure Indicators: SQL errors, migration conflicts, non-zero exit code
    Evidence: .sisyphus/evidence/task-1-db-push.txt
  ```

  **Commit**: YES (group 1)
  - Message: `feat(schema): add trade lifecycle status and nullable outcome fields`
  - Files: `drizzle/schema.ts`
  - Pre-commit: `npm run check`

- [x] 2. Shared Constants + Type Updates for Lifecycle

  **What to do**:
  - Add trade status constants to `shared/const.ts`:
    ```typescript
    export const TRADE_STATUSES = ["open", "closed", "reviewed"] as const;
    export type TradeStatus = (typeof TRADE_STATUSES)[number];
    ```
  - Add allowed transitions map:
    ```typescript
    export const ALLOWED_TRANSITIONS: Record<TradeStatus, TradeStatus | null> =
      {
        open: "closed",
        closed: "reviewed",
        reviewed: null,
      };
    ```
  - Add field mutability rules as a constant (which fields are editable in each status)
  - Update `shared/types.ts` if needed to export new types

  **Must NOT do**:
  - Do not create a generic state machine library
  - Do not add runtime validation here (that's for the server)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small constant/type definitions in shared files
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 4, 5, 6, 7, 8
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `shared/const.ts` — Existing shared constants file. Follow the naming pattern of existing constants like `TIME_FRAMES`, `COOKIE_NAME`, `UNAUTHED_ERR_MSG`. Use UPPER_SNAKE_CASE for constant names.

  **API/Type References**:
  - `shared/types.ts` — Currently re-exports Transaction, InsertTransaction, TransactionElement from drizzle/schema. May need to also export TradeStatus.

  **WHY Each Reference Matters**:
  - `shared/const.ts`: The executor must match existing naming conventions and export patterns.
  - `shared/types.ts`: Confirms where to add new type exports for cross-boundary usage.

  **Acceptance Criteria**:
  - [ ] `TRADE_STATUSES` exported from `shared/const.ts`
  - [ ] `TradeStatus` type exported and usable in both client and server
  - [ ] `ALLOWED_TRANSITIONS` map correctly encodes open→closed→reviewed→null
  - [ ] `npm run check` passes

  **QA Scenarios:**

  ```
  Scenario: Shared constants are importable from both client and server
    Tool: Bash (npm run check)
    Preconditions: Constants added to shared/const.ts
    Steps:
      1. Run `npm run check`
      2. Verify no import errors
    Expected Result: Zero errors. TradeStatus type resolves correctly.
    Failure Indicators: Module resolution errors, type not found
    Evidence: .sisyphus/evidence/task-2-typecheck.txt
  ```

  **Commit**: YES (group 1)
  - Message: `feat(shared): add trade lifecycle status constants and types`
  - Files: `shared/const.ts`, `shared/types.ts`
  - Pre-commit: `npm run check`

- [x] 3. Data Migration: Backfill Existing Transactions

  **What to do**:
  - RED: Write a test that creates sample transactions (with isReviewed=1 and isReviewed=0) and asserts the migration function correctly maps them to status values.
  - GREEN: Create a migration function in `server/db.ts`:
    - All rows where old `isReviewed = 1` → `status = "reviewed"`
    - All remaining rows → `status = "closed"`
    - Ensure `endTime`, `outcome`, `returnAmount`, etc. remain populated for migrated rows
  - Add a one-time migration call or script that can be invoked
  - REFACTOR: Verify migrated data integrity

  **Must NOT do**:
  - Do not delete or modify existing transaction data beyond adding status
  - Do not break transaction_elements junction table links
  - Do not recompute accountBalance or consecutiveLosses for existing rows

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple SQL UPDATE statements for data backfill
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 1)
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: None
  - **Blocked By**: Task 1 (schema must exist first)

  **References**:

  **Pattern References**:
  - `server/db.ts:571-580` — `createTransaction` function showing how DB writes are done with Drizzle. Follow the same `getDb()` + `db.update()` pattern.
  - `server/db.ts:658-672` — `updateTransaction` function for UPDATE pattern reference.

  **API/Type References**:
  - `drizzle/schema.ts:106-165` — Transaction table definition (post-Task 1 changes) with new `status` column.

  **Test References**:
  - `server/transaction.test.ts` — Existing test patterns showing `vi.mock` and `appRouter.createCaller(ctx)` usage.

  **WHY Each Reference Matters**:
  - `db.ts:571-580`: Shows the Drizzle ORM write pattern the migration must follow.
  - `transaction.test.ts`: The executor needs to follow the existing mock/caller pattern for the new migration test.

  **Acceptance Criteria**:
  - [ ] Migration test passes: rows with review → "reviewed", others → "closed"
  - [ ] No rows left with `status = "open"` after migration (all existing trades were completed)
  - [ ] Transaction elements remain linked
  - [ ] `npm run test` passes

  **QA Scenarios:**

  ```
  Scenario: Migration correctly backfills status for reviewed transactions
    Tool: Bash (npx vitest run)
    Preconditions: Test creates sample rows with old isReviewed values
    Steps:
      1. Create test transaction with isReviewed=1 and reviewFeedback="good trade"
      2. Run migration function
      3. Assert status === "reviewed"
    Expected Result: status is "reviewed" for previously-reviewed transactions
    Failure Indicators: status is null, "closed", or unchanged
    Evidence: .sisyphus/evidence/task-3-migration-reviewed.txt

  Scenario: Migration maps non-reviewed rows to closed
    Tool: Bash (npx vitest run)
    Preconditions: Test creates sample rows with isReviewed=0
    Steps:
      1. Create test transaction with isReviewed=0 (with and without reviewFeedback)
      2. Run migration function
      3. Assert status === "closed" for both cases
    Expected Result: Both rows have status "closed" (conservative mapping)
    Failure Indicators: status is "open" or "reviewed"
    Evidence: .sisyphus/evidence/task-3-migration-closed.txt
  ```

  **Commit**: YES (group 2)
  - Message: `feat(migration): backfill existing transactions with lifecycle status`
  - Files: `server/db.ts`
  - Pre-commit: `npm run test && npm run check`

- [ ] 4. TDD: DB Stat Functions Exclude Open Trades

  **What to do**:
  - RED: Write tests in `server/transaction.lifecycle.test.ts` that:
    - Create an open trade and a closed trade
    - Assert `getCurrentBalance()` only counts the closed trade's returnAmount
    - Assert `getConsecutiveLosses()` ignores open trades
    - Assert `getStatistics()` excludes open trades from win/loss/breakeven counts
    - Assert `getSystemStatistics()` excludes open trades
  - GREEN: Modify DB functions in `server/db.ts`:
    - `getCurrentBalance()` (lines 721-738): Add WHERE filter `status != 'open'` (or `outcome IS NOT NULL`)
    - `getConsecutiveLosses()` (lines 697-719): Add WHERE filter for closed/reviewed only
    - `getStatistics()` (lines 740-849): Add WHERE filter for closed/reviewed only
    - `getSystemStatistics()` (lines 851-903): Add WHERE filter for closed/reviewed only
  - REFACTOR: Extract common status filter as a reusable Drizzle condition

  **Must NOT do**:
  - Do not change how balance/streaks are calculated — only filter inputs
  - Do not recompute historical values
  - Do not modify `getTransactionsByUserId` here (that's Task 8)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Multiple interrelated DB functions need careful modification with test-first approach
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7, 8)
  - **Blocks**: None
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `server/db.ts:721-738` — `getCurrentBalance()`: Sums `returnAmount` for all user transactions. Must add status filter. Uses `sql<string>` for aggregation.
  - `server/db.ts:697-719` — `getConsecutiveLosses()`: Iterates transactions in DESC order. Must filter open trades out.
  - `server/db.ts:740-849` — `getStatistics()`: Large aggregation function. Must add status filter to all sub-queries.
  - `server/db.ts:851-903` — `getSystemStatistics()`: Per-system aggregation. Must filter consistently.

  **Test References**:
  - `server/transaction.test.ts` — Existing test patterns. Follow `vi.mock("./db")` pattern for mocking DB functions. Use `appRouter.createCaller(ctx)` for integration tests.

  **WHY Each Reference Matters**:
  - Each DB function listed is a SEPARATE modification point — executor must update ALL four.
  - `transaction.test.ts`: Shows how to mock DB layer and set up test contexts in this project.

  **Acceptance Criteria**:
  - [ ] Test file created: `server/transaction.lifecycle.test.ts`
  - [ ] Tests for balance exclusion: `npx vitest run server/transaction.lifecycle.test.ts` → PASS
  - [ ] Tests for streak exclusion: PASS
  - [ ] Tests for statistics exclusion: PASS
  - [ ] `npm run test` → all tests pass (existing + new)

  **QA Scenarios:**

  ```
  Scenario: getCurrentBalance excludes open trades
    Tool: Bash (npx vitest run server/transaction.lifecycle.test.ts)
    Preconditions: Test creates 1 open trade (returnAmount: "100") and 1 closed trade (returnAmount: "200")
    Steps:
      1. Call getCurrentBalance(userId, initialBalance)
      2. Assert result equals initialBalance + 200 (not + 300)
    Expected Result: Balance only includes closed trade's return
    Failure Indicators: Balance includes 300 (open trade counted)
    Evidence: .sisyphus/evidence/task-4-balance-exclusion.txt

  Scenario: getConsecutiveLosses ignores open trades
    Tool: Bash (npx vitest run server/transaction.lifecycle.test.ts)
    Preconditions: Create closed loss, open loss, closed win (in that order by endTime)
    Steps:
      1. Call getConsecutiveLosses(userId)
      2. Assert result is 0 (last closed trade was a win)
    Expected Result: Streak calculation skips open trades entirely
    Failure Indicators: Returns 1 (counting the open loss)
    Evidence: .sisyphus/evidence/task-4-streak-exclusion.txt
  ```

  **Commit**: YES (group 3)
  - Message: `fix(stats): exclude open trades from balance, streaks, and statistics`
  - Files: `server/db.ts`, `server/transaction.lifecycle.test.ts`
  - Pre-commit: `npm run test`

- [ ] 5. TDD: transaction.create as Open-Only Creation

  **What to do**:
  - RED: Write tests that:
    - Assert `transaction.create` succeeds with ONLY open-stage fields (tradingPair, direction, timeFrame, startTime, tradingLogic, tvUrl, tradingSystemId, selectedElementIds)
    - Assert returned transaction has `status = "open"` and `outcome = null`, `returnAmount = null`, etc.
    - Assert `transaction.create` does NOT accept outcome/close fields
    - Assert `accountBalance` and `consecutiveLosses` are NOT set at creation
  - GREEN: Modify `transaction.create` in `server/routers.ts` (lines 183-256):
    - Simplify Zod input schema: remove `outcome`, `returnAmount`, `riskRewardRatio`, `endTime`
    - Set `status = "open"` on the created row
    - Remove balance/streak calculation from creation (move to close)
    - Keep `confidenceLevel` calculation (from selected elements)
    - Keep `tradingPair` uppercase normalization
  - REFACTOR: Clean up any dead code from the old create flow

  **Must NOT do**:
  - Do not keep outcome fields as optional in create — REMOVE them entirely from create input
  - Do not calculate accountBalance or consecutiveLosses at open time
  - Do not change getFormDefaults (that's Task 8)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core business logic change with TDD and careful Zod schema modification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6, 7, 8)
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `server/routers.ts:183-256` — Current `transaction.create` procedure. Lines 185-200 are the Zod input schema to simplify. Lines 202-230 are the business logic (balance calc, streak calc) to remove from create. Lines 232-256 are the DB call + response.
  - `server/db.ts:966-992` — `createTransactionWithElements()`: Transactional insert. Will need to accept nullable outcome fields.
  - `server/db.ts:1011-1032` — `calculateConfidenceLevel()`: Still needed at open time.

  **Test References**:
  - `server/transaction.test.ts:1-50` — Existing create test setup with mocks. New tests should follow similar structure but in the lifecycle test file.

  **WHY Each Reference Matters**:
  - `routers.ts:183-256`: This is the PRIMARY code to modify. Executor needs the full context of current create logic to safely strip outcome-related parts.
  - `db.ts:966-992`: The transactional insert must now handle null outcome fields.

  **Acceptance Criteria**:
  - [ ] Create succeeds with only open-stage fields
  - [ ] Created transaction has `status = "open"`, `outcome = null`, `endTime = null`
  - [ ] Zod rejects outcome/returnAmount/riskRewardRatio in create input
  - [ ] `npm run test` passes

  **QA Scenarios:**

  ```
  Scenario: Open trade creation succeeds without outcome fields
    Tool: Bash (npx vitest run server/transaction.lifecycle.test.ts)
    Preconditions: User exists with initialBalance set
    Steps:
      1. Call transaction.create with {tradingPair: "BTCUSDT", direction: "long", timeFrame: "4H", startTime: 1711800000000, tradingLogic: "Breakout pattern"}
      2. Assert response has status === "open"
      3. Assert response has outcome === null, returnAmount === null, endTime === null
    Expected Result: Transaction created with open status and null outcome fields
    Failure Indicators: Zod validation error, missing status field, non-null outcome fields
    Evidence: .sisyphus/evidence/task-5-open-creation.txt

  Scenario: Create rejects outcome fields in input
    Tool: Bash (npx vitest run server/transaction.lifecycle.test.ts)
    Preconditions: None
    Steps:
      1. Call transaction.create with outcome: "win", returnAmount: "100" included
      2. Assert Zod validation error is thrown
    Expected Result: TRPCError with input validation failure
    Failure Indicators: Transaction created with outcome fields
    Evidence: .sisyphus/evidence/task-5-create-rejects-outcome.txt
  ```

  **Commit**: YES (group 4)
  - Message: `feat(api): refactor transaction.create to open-only lifecycle`
  - Files: `server/routers.ts`, `server/transaction.lifecycle.test.ts`
  - Pre-commit: `npm run test && npm run check`

- [ ] 6. TDD: New transaction.close Procedure

  **What to do**:
  - RED: Write tests that:
    - Assert `transaction.close` succeeds for an open trade with required close fields
    - Assert `transaction.close` calculates `accountBalance` and `consecutiveLosses` at close time
    - Assert `transaction.close` fails for a closed trade (TRPCError)
    - Assert `transaction.close` fails for a reviewed trade (TRPCError)
    - Assert `transaction.close` validates endTime > startTime
  - GREEN: Add `transaction.close` procedure in `server/routers.ts`:
    - Zod input: `{ id, endTime, outcome, riskRewardRatio, returnAmount }`
    - Fetch transaction, verify `status === "open"`
    - Calculate `accountBalance` using `getCurrentBalance()` + returnAmount
    - Calculate `consecutiveLosses` using `getConsecutiveLosses()`
    - Update transaction: set close fields + `status = "closed"`
    - Return updated transaction
  - REFACTOR: Extract transition guard as reusable helper

  **Must NOT do**:
  - Do not allow closing already-closed or reviewed trades
  - Do not skip endTime > startTime validation
  - Do not calculate confidenceLevel here (already set at open time)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: New procedure with business logic, transition guards, and TDD
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 7, 8)
  - **Blocks**: Tasks 10, 11
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `server/routers.ts:183-256` — Current `transaction.create`: The balance and streak calculation logic at lines 202-230 needs to be MOVED here (not duplicated — remove from create, add to close).
  - `server/routers.ts:291-306` — Current `transaction.update`: Pattern for how updates are done (fetch → validate → update).
  - `server/db.ts:658-672` — `updateTransaction()`: Existing update function to reuse for setting close fields.

  **API/Type References**:
  - `shared/const.ts` — (from Task 2) `ALLOWED_TRANSITIONS` map for transition validation.
  - `server/_core/trpc.ts` — `protectedProcedure` for authenticated access.

  **WHY Each Reference Matters**:
  - `routers.ts:183-256`: The balance/streak logic currently in create MUST be moved here. This is a code relocation, not new logic.
  - `routers.ts:291-306`: Shows the update pattern (fetch by id + userId, then update).
  - `ALLOWED_TRANSITIONS`: Used for server-side transition guard validation.

  **Acceptance Criteria**:
  - [ ] `transaction.close` exists as a new tRPC procedure
  - [ ] Close succeeds for open trades with all required fields
  - [ ] `accountBalance` and `consecutiveLosses` calculated correctly at close time
  - [ ] Close fails with TRPCError for closed/reviewed trades
  - [ ] Close validates endTime > startTime
  - [ ] `npm run test` passes

  **QA Scenarios:**

  ```
  Scenario: Close open trade succeeds and calculates derived fields
    Tool: Bash (npx vitest run server/transaction.lifecycle.test.ts)
    Preconditions: Open trade exists, user has initialBalance of "1000"
    Steps:
      1. Call transaction.close with {id: openTradeId, endTime: startTime + 3600000, outcome: "win", riskRewardRatio: "2.5", returnAmount: "150"}
      2. Assert response.status === "closed"
      3. Assert response.accountBalance === "1150" (1000 + 150)
      4. Assert response.consecutiveLosses === 0
    Expected Result: Trade closed with correct derived values
    Failure Indicators: Status still "open", balance not calculated, missing fields
    Evidence: .sisyphus/evidence/task-6-close-success.txt

  Scenario: Close fails for already-closed trade
    Tool: Bash (npx vitest run server/transaction.lifecycle.test.ts)
    Preconditions: Closed trade exists
    Steps:
      1. Call transaction.close with the closed trade's id
      2. Assert TRPCError is thrown with code BAD_REQUEST or FORBIDDEN
    Expected Result: Error with message indicating trade is not open
    Failure Indicators: Trade silently re-closed, no error thrown
    Evidence: .sisyphus/evidence/task-6-close-already-closed.txt
  ```

  **Commit**: YES (group 4)
  - Message: `feat(api): add transaction.close procedure with lifecycle guards`
  - Files: `server/routers.ts`, `server/db.ts`, `server/transaction.lifecycle.test.ts`
  - Pre-commit: `npm run test && npm run check`

- [ ] 7. TDD: transaction.update Status-Aware + Review Gate

  **What to do**:
  - RED: Write tests that:
    - Assert open trade entry fields CAN be updated (tradingPair, direction, etc.)
    - Assert open trade elements CAN be updated (selectedElementIds → recalc confidenceLevel)
    - Assert closed/reviewed trade entry fields CANNOT be updated (TRPCError)
    - Assert review fields (reviewFeedback, reviewChartUrl) CAN be updated on closed trades
    - Assert saving review with non-empty reviewFeedback on closed trade sets `status = "reviewed"`
    - Assert review CANNOT be submitted on open trades
    - Assert review fields can still be edited on reviewed trades (status stays "reviewed")
  - GREEN: Refactor `transaction.update` in `server/routers.ts` (lines 291-306):
    - Expand Zod input to include entry fields and selectedElementIds (conditionally)
    - Fetch current transaction, check status
    - If `status === "open"`: allow entry field updates + element updates
    - If `status === "closed"`: allow ONLY review fields. If reviewFeedback provided, set `status = "reviewed"`
    - If `status === "reviewed"`: allow ONLY review field edits (status stays "reviewed")
    - Reject locked field updates with TRPCError
  - REFACTOR: Use the mutability matrix from shared constants

  **Must NOT do**:
  - Do not allow changing status directly via update (only close and review transitions)
  - Do not allow outcome field edits after close
  - Do not allow entry field edits after close

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex conditional logic with field-level guards and TDD
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 6, 8)
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `server/routers.ts:291-306` — Current `transaction.update`: Only accepts reviewFeedback, reviewChartUrl, isReviewed. Must be expanded with status-based field gating.
  - `server/db.ts:658-672` — `updateTransaction()`: Existing update function. May need parameter expansion.
  - `server/db.ts:919-964` — Element functions (`addElementsToTransaction`, `removeElementsFromTransaction`, `getTransactionElements`): Needed for updating selectedElementIds on open trades.
  - `server/db.ts:1011-1032` — `calculateConfidenceLevel()`: For recalculating when elements change on open trade.

  **API/Type References**:
  - `shared/const.ts` — Field mutability matrix (from Task 2) for validation rules.
  - `server/_core/trpc.ts` — TRPCError for rejection responses.

  **WHY Each Reference Matters**:
  - `routers.ts:291-306`: The exact code to expand. Currently trivial — will become the most complex procedure.
  - Element functions: Open trade edits may change selectedElementIds, requiring element re-linking and confidence recalculation.

  **Acceptance Criteria**:
  - [ ] Open trades: entry fields editable, elements updatable, confidence recalculated
  - [ ] Closed trades: entry/outcome locked, review fields editable, review saves transition to "reviewed"
  - [ ] Reviewed trades: review fields still editable, everything else locked
  - [ ] Open trades: review submission rejected with TRPCError
  - [ ] `npm run test` passes

  **QA Scenarios:**

  ```
  Scenario: Open trade allows entry field editing
    Tool: Bash (npx vitest run server/transaction.lifecycle.test.ts)
    Preconditions: Open trade exists with tradingPair "BTCUSDT"
    Steps:
      1. Call transaction.update with {id: tradeId, tradingPair: "ETHUSDT"}
      2. Fetch updated trade
      3. Assert tradingPair === "ETHUSDT"
    Expected Result: Entry field updated successfully
    Failure Indicators: TRPCError thrown, field unchanged
    Evidence: .sisyphus/evidence/task-7-open-edit.txt

  Scenario: Closed trade rejects entry field changes
    Tool: Bash (npx vitest run server/transaction.lifecycle.test.ts)
    Preconditions: Closed trade exists
    Steps:
      1. Call transaction.update with {id: closedTradeId, tradingPair: "ETHUSDT"}
      2. Assert TRPCError is thrown
    Expected Result: Error indicating field is locked in closed status
    Failure Indicators: Field silently updated
    Evidence: .sisyphus/evidence/task-7-closed-reject-edit.txt

  Scenario: Review on closed trade transitions to reviewed
    Tool: Bash (npx vitest run server/transaction.lifecycle.test.ts)
    Preconditions: Closed trade exists
    Steps:
      1. Call transaction.update with {id: closedTradeId, reviewFeedback: "Good entry timing, should have held longer"}
      2. Fetch updated trade
      3. Assert status === "reviewed" and reviewFeedback matches
    Expected Result: Status transitions to "reviewed" with review saved
    Failure Indicators: Status stays "closed", review not saved
    Evidence: .sisyphus/evidence/task-7-review-transition.txt

  Scenario: Review on open trade is rejected
    Tool: Bash (npx vitest run server/transaction.lifecycle.test.ts)
    Preconditions: Open trade exists
    Steps:
      1. Call transaction.update with {id: openTradeId, reviewFeedback: "Some review"}
      2. Assert TRPCError is thrown
    Expected Result: Error indicating review not allowed on open trades
    Failure Indicators: Review saved on open trade
    Evidence: .sisyphus/evidence/task-7-review-open-rejected.txt
  ```

  **Commit**: YES (group 4)
  - Message: `feat(api): status-aware transaction.update with field-level guards`
  - Files: `server/routers.ts`, `server/db.ts`, `server/transaction.lifecycle.test.ts`
  - Pre-commit: `npm run test && npm run check`

- [ ] 8. TDD: transaction.list + getFormDefaults Status-Aware

  **What to do**:
  - RED: Write tests that:
    - Assert `transaction.list` supports `status` filter ("open" | "closed" | "reviewed")
    - Assert `transaction.list` returns status field in response
    - Assert `transaction.list` handles null endTime sorting gracefully (open trades have null endTime)
    - Assert `getFormDefaults` excludes open trades from currentBalance and consecutiveLosses
  - GREEN:
    - Modify `transaction.list` Zod input (routers.ts:270-288): Add `status` filter option
    - Modify `getTransactionsByUserId` in db.ts (lines 595-656): Add status filter, handle null endTime sort
    - Modify `transaction.getFormDefaults` (routers.ts:317-339): Use status-aware balance/streak functions
    - Remove `isReviewed` filter from list (replaced by status)
  - REFACTOR: Clean up any remaining isReviewed references in list/defaults

  **Must NOT do**:
  - Do not change the list response shape beyond adding `status` field
  - Do not add pagination (out of scope)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple backend endpoints to update with filter logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 6, 7)
  - **Blocks**: Task 12
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `server/routers.ts:270-288` — Current `transaction.list` with filter Zod schema. Add `status` as enum filter, remove `isReviewed` boolean filter.
  - `server/db.ts:595-656` — `getTransactionsByUserId()`: WHERE clauses for filtering. Add status condition. Handle sortBy "endTime" with null endTime (NULLS LAST for open trades).
  - `server/routers.ts:317-339` — `getFormDefaults`: Calls getCurrentBalance and getConsecutiveLosses — these are already updated in Task 4, but verify they're called correctly.

  **WHY Each Reference Matters**:
  - `routers.ts:270-288`: Exact Zod schema to modify for status filter input.
  - `db.ts:595-656`: SQL query with existing filter pattern — add status filter alongside existing outcome/direction filters.
  - `routers.ts:317-339`: Must verify compatibility with Task 4 changes.

  **Acceptance Criteria**:
  - [ ] `transaction.list` accepts `status` filter
  - [ ] Status field included in list response
  - [ ] Null endTime handled in sort (NULLS LAST)
  - [ ] `getFormDefaults` returns correct balance/streaks (excluding open trades)
  - [ ] `isReviewed` filter removed
  - [ ] `npm run test` passes

  **QA Scenarios:**

  ```
  Scenario: List filters by status correctly
    Tool: Bash (npx vitest run server/transaction.lifecycle.test.ts)
    Preconditions: 1 open trade, 1 closed trade, 1 reviewed trade exist
    Steps:
      1. Call transaction.list with {status: "open"}
      2. Assert result contains exactly 1 transaction with status "open"
      3. Call transaction.list with {status: "closed"}
      4. Assert result contains exactly 1 transaction
    Expected Result: Correct filtering by status
    Failure Indicators: Wrong count, missing status field, filter ignored
    Evidence: .sisyphus/evidence/task-8-list-filter.txt

  Scenario: Sort by endTime handles nulls gracefully
    Tool: Bash (npx vitest run server/transaction.lifecycle.test.ts)
    Preconditions: Mix of open (null endTime) and closed trades
    Steps:
      1. Call transaction.list with {sortBy: "endTime", sortOrder: "desc"}
      2. Assert open trades (null endTime) appear last
    Expected Result: NULLS LAST ordering — closed/reviewed first, open last
    Failure Indicators: SQL error, open trades first, or crash on null sort
    Evidence: .sisyphus/evidence/task-8-sort-nulls.txt
  ```

  **Commit**: YES (group 4)
  - Message: `feat(api): status-aware transaction list and form defaults`
  - Files: `server/routers.ts`, `server/db.ts`, `server/transaction.lifecycle.test.ts`
  - Pre-commit: `npm run test && npm run check`

- [ ] 9. Simplify NewTransaction Form (Open-Only Fields)

  **What to do**:
  - Remove all outcome/close-stage fields from the form:
    - Remove `outcome` select
    - Remove `riskRewardRatio` input
    - Remove `returnAmount` input
    - Remove `endTime` datetime input
  - Remove the "Trade Outcome" section entirely from the form JSX
  - Update form state: remove outcome-related fields from initial state
  - Update submission handler:
    - Remove outcome fields from the mutation call
    - Stop calculating preview balance/streak changes (these don't happen at open time)
  - Update the sidebar "Account Summary":
    - Remove "New Balance" and "New Losing Streak" previews (calculated at close time)
    - Keep "Current Balance" and "Current Losing Streak" as read-only info
    - Keep "Confidence Level" from selected elements
  - Update form validation: only require open-stage fields
  - Update success redirect: navigate to `/transactions` (or `/transactions/:id` for the new trade)
  - Update page title/heading to reflect "Open Trade" instead of "New Transaction"

  **Must NOT do**:
  - Do not restructure the form component beyond removing outcome sections
  - Do not change the Trading Elements selection logic
  - Do not change the TradingView URL field (stays at open time)
  - Do not introduce a multi-step form wizard

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI form changes with visual layout impact
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 10, 11, 12)
  - **Blocks**: None
  - **Blocked By**: Task 5

  **References**:

  **Pattern References**:
  - `client/src/pages/NewTransaction.tsx:53-64` — Current form state definition. Remove `outcome`, `riskRewardRatio`, `returnAmount`, `endTime` fields.
  - `client/src/pages/NewTransaction.tsx:282-362` — "Trade Details" section JSX. Keep all fields in this section (tradingPair, timeFrame, startTime, direction, tradingLogic).
  - `client/src/pages/NewTransaction.tsx:364-427` — "Trade Outcome" section JSX. REMOVE this entire section.
  - `client/src/pages/NewTransaction.tsx:431-516` — Sidebar "Account Summary". Remove balance/streak preview calculations; keep confidence level and current balance display.
  - `client/src/pages/NewTransaction.tsx:85-116` — Form submission handler. Simplify to only pass open-stage fields to `trpc.transaction.create`.

  **API/Type References**:
  - `server/routers.ts:183-200` — (post-Task 5) New Zod input schema for transaction.create — only open-stage fields accepted.

  **WHY Each Reference Matters**:
  - Lines 364-427: The executor must identify and remove the ENTIRE "Trade Outcome" section. Line numbers pinpoint the exact removal boundaries.
  - Lines 431-516: Sidebar needs surgical edits — remove some calculations while keeping others.
  - Lines 85-116: Submission handler must match the new simplified API contract.

  **Acceptance Criteria**:
  - [ ] "Trade Outcome" section removed from form
  - [ ] endTime field removed from form
  - [ ] Balance/streak preview removed from sidebar
  - [ ] Form submits successfully with only open-stage fields
  - [ ] Confidence level and trading elements still functional
  - [ ] `npm run check` passes (no type errors)
  - [ ] `npm run build` succeeds

  **QA Scenarios:**

  ```
  Scenario: Open trade form shows only entry fields
    Tool: Playwright (playwright skill)
    Preconditions: User logged in, navigate to /transactions/new
    Steps:
      1. Navigate to /transactions/new
      2. Assert visible: input[name="tradingPair"] or equivalent selector
      3. Assert visible: select for timeFrame
      4. Assert visible: input for startTime
      5. Assert visible: select for direction
      6. Assert visible: textarea for tradingLogic
      7. Assert NOT visible: select for outcome
      8. Assert NOT visible: input for returnAmount
      9. Assert NOT visible: input for riskRewardRatio
      10. Assert NOT visible: input for endTime
    Expected Result: Only open-stage fields visible, no outcome section
    Failure Indicators: Outcome fields still present
    Evidence: .sisyphus/evidence/task-9-open-form.png

  Scenario: Open trade submission creates open-status trade
    Tool: Playwright (playwright skill)
    Preconditions: User logged in with active trading system
    Steps:
      1. Navigate to /transactions/new
      2. Fill tradingPair with "BTCUSDT"
      3. Select timeFrame "4H"
      4. Fill startTime with current datetime
      5. Select direction "long"
      6. Fill tradingLogic with "Breakout above resistance"
      7. Click submit button
      8. Assert redirect to /transactions
      9. Assert success toast appears
    Expected Result: Trade created, redirected to list, success notification
    Failure Indicators: Validation error, no redirect, error toast
    Evidence: .sisyphus/evidence/task-9-open-submit.png
  ```

  **Commit**: YES (group 5)
  - Message: `feat(ui): simplify open trade creation form`
  - Files: `client/src/pages/NewTransaction.tsx`
  - Pre-commit: `npm run check`

- [ ] 10. CloseTradeModal Component

  **What to do**:
  - Create `client/src/components/CloseTradeModal.tsx`:
    - Use shadcn `Dialog` / `DialogContent` / `DialogHeader` / `DialogFooter` pattern
    - Props: `{ open: boolean, onOpenChange: (open: boolean) => void, trade: Transaction }`
    - Display trade summary at top (pair, direction, timeFrame, startTime)
    - Form fields:
      - `endTime` (datetime-local, required, must be after trade.startTime)
      - `outcome` (select: win/loss/breakeven, required)
      - `riskRewardRatio` (number, required)
      - `returnAmount` (number, required, negative for loss)
    - Show preview: new balance = currentBalance + returnAmount
    - Submit calls `trpc.transaction.close.useMutation()`
    - On success: invalidate queries, close modal, show success toast
    - On error: show error toast, keep modal open
  - Add "Close Trade" button trigger in `Transactions.tsx` list (action column) for open trades
  - Add "Close Trade" button trigger in `TransactionDetail.tsx` header for open trades

  **Must NOT do**:
  - Do not use a different modal/dialog library (use shadcn Dialog)
  - Do not add this modal as a separate page/route
  - Do not allow closing the modal to clear form state (preserve partially filled data)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: New UI component with dialog, form, and integration into existing pages
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 11, 12)
  - **Blocks**: None
  - **Blocked By**: Task 6

  **References**:

  **Pattern References**:
  - `client/src/components/ui/dialog.tsx` — Existing shadcn Dialog component. Use `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` from this file.
  - `client/src/pages/NewTransaction.tsx:364-427` — Current "Trade Outcome" section. Reuse the same field structure (outcome select, R:R input, returnAmount input) in the modal. Copy the field layout, not the component structure.
  - `client/src/pages/NewTransaction.tsx:85-116` — Form submission pattern with tRPC mutation + toast + invalidation. Follow the same toast/invalidation pattern.
  - `client/src/pages/Transactions.tsx:265-300` — Action column in the transactions table. Add "Close Trade" button here for open trades (alongside existing view/delete actions).
  - `client/src/pages/TransactionDetail.tsx:148-160` — Header area of detail page. Add "Close Trade" button here for open trades.

  **API/Type References**:
  - `server/routers.ts` — (post-Task 6) `transaction.close` procedure input schema: `{ id, endTime, outcome, riskRewardRatio, returnAmount }`

  **External References**:
  - shadcn/ui Dialog docs: Standard Dialog + form composition pattern

  **WHY Each Reference Matters**:
  - `dialog.tsx`: Must use the EXISTING dialog primitives, not introduce a new modal system.
  - `NewTransaction.tsx:364-427`: The outcome form fields from here are being MOVED to the modal. Visual consistency matters.
  - `Transactions.tsx:265-300`: The exact action column where the close button must be added.

  **Acceptance Criteria**:
  - [ ] `CloseTradeModal.tsx` created using shadcn Dialog
  - [ ] Modal shows trade summary + close fields (endTime, outcome, R:R, returnAmount)
  - [ ] Modal validates endTime > startTime
  - [ ] Submit calls `transaction.close` mutation
  - [ ] "Close Trade" button visible in list for open trades only
  - [ ] "Close Trade" button visible in detail page header for open trades only
  - [ ] `npm run check` passes
  - [ ] `npm run build` succeeds

  **QA Scenarios:**

  ```
  Scenario: Close Trade modal opens from transaction list
    Tool: Playwright (playwright skill)
    Preconditions: At least 1 open trade exists. User logged in.
    Steps:
      1. Navigate to /transactions
      2. Find the row with the open trade
      3. Click the "Close Trade" button/icon in the actions column
      4. Assert modal is visible with title containing "Close" or similar
      5. Assert endTime, outcome, riskRewardRatio, returnAmount fields are present
      6. Assert trade summary (pair, direction) is displayed
    Expected Result: Modal opens with correct trade context and all close fields
    Failure Indicators: Modal doesn't open, wrong trade data, missing fields
    Evidence: .sisyphus/evidence/task-10-modal-open.png

  Scenario: Close Trade modal submits and updates trade status
    Tool: Playwright (playwright skill)
    Preconditions: Open trade exists, modal opened
    Steps:
      1. Fill endTime with a datetime after the trade's startTime
      2. Select outcome "win"
      3. Fill riskRewardRatio with "2.5"
      4. Fill returnAmount with "150"
      5. Click submit/confirm button
      6. Assert modal closes
      7. Assert success toast appears
      8. Assert trade status in list shows "Closed" (not "Open")
    Expected Result: Trade closed successfully, list updated
    Failure Indicators: Modal stays open, error toast, status unchanged
    Evidence: .sisyphus/evidence/task-10-modal-submit.png

  Scenario: Close Trade button hidden for non-open trades
    Tool: Playwright (playwright skill)
    Preconditions: 1 closed trade and 1 reviewed trade exist
    Steps:
      1. Navigate to /transactions
      2. Assert "Close Trade" button is NOT visible for closed trade row
      3. Assert "Close Trade" button is NOT visible for reviewed trade row
    Expected Result: Close action only available for open trades
    Failure Indicators: Close button visible for closed/reviewed trades
    Evidence: .sisyphus/evidence/task-10-button-visibility.png
  ```

  **Commit**: YES (group 5)
  - Message: `feat(ui): add CloseTradeModal with list and detail integration`
  - Files: `client/src/components/CloseTradeModal.tsx`, `client/src/pages/Transactions.tsx`, `client/src/pages/TransactionDetail.tsx`
  - Pre-commit: `npm run check`

- [ ] 11. TransactionDetail Status-Aware Rendering

  **What to do**:
  - Update `client/src/pages/TransactionDetail.tsx`:
    - Add status badge in header (Open / Closed / Reviewed) with distinct colors
    - **Open status**: Show entry fields only. Hide "Outcome" card content (or show "Pending" placeholder). Hide "Trade Review" section. Show "Close Trade" and "Edit" buttons.
    - **Closed status**: Show entry + outcome fields. Show "Trade Review" section with editable form. Show "Edit" button DISABLED. Remove old "Save Review" → transitions to "reviewed" on submit.
    - **Reviewed status**: Show all fields. Show review as read-only OR still editable (review fields remain EDIT per mutability matrix). Show "Reviewed" badge.
  - Update the review submission to call `transaction.update` with reviewFeedback (which triggers closed→reviewed transition in backend)
  - Conditionally render sections based on `trade.status`:
    - Outcome card: only show populated data when status is closed/reviewed
    - Review section: only show when status is closed/reviewed
  - Handle null fields gracefully (endTime, outcome, returnAmount may be null for open trades)

  **Must NOT do**:
  - Do not add an inline edit form for entry fields (out of scope — editing open trades can be a future modal or page)
  - Do not redesign the detail page layout
  - Do not add new sections beyond what exists

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Conditional UI rendering with status-based layouts
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 10, 12)
  - **Blocks**: None
  - **Blocked By**: Tasks 6, 7

  **References**:

  **Pattern References**:
  - `client/src/pages/TransactionDetail.tsx:140-227` — Left column with trade details and trading elements cards. No changes needed for entry fields, but outcome display must handle nulls.
  - `client/src/pages/TransactionDetail.tsx:228-287` — "Trade Review" card. Must be conditionally rendered (hidden for open trades, shown for closed/reviewed).
  - `client/src/pages/TransactionDetail.tsx:291-360` — Right column "Outcome" card. Must handle null outcome/returnAmount/etc. for open trades.
  - `client/src/pages/TransactionDetail.tsx:50-78` — Review form state and submission. Submission must trigger status transition via transaction.update.

  **API/Type References**:
  - `shared/const.ts` — `TRADE_STATUSES` for rendering badge text/color.
  - `server/routers.ts` — (post-Task 7) Updated `transaction.update` with review → status transition.

  **WHY Each Reference Matters**:
  - Lines 228-287: The review section that must be conditionally gated — this is the core change.
  - Lines 291-360: Outcome card that must gracefully handle null values for open trades.
  - Lines 50-78: Review submission logic that now triggers a status transition.

  **Acceptance Criteria**:
  - [ ] Status badge displayed in header (Open/Closed/Reviewed) with distinct colors
  - [ ] Open trades: outcome card shows placeholder, review section hidden
  - [ ] Closed trades: all sections visible, review form editable
  - [ ] Reviewed trades: all sections visible, review fields still editable
  - [ ] No runtime errors from null outcome fields on open trades
  - [ ] `npm run check` and `npm run build` pass

  **QA Scenarios:**

  ```
  Scenario: Open trade detail page hides outcome and review
    Tool: Playwright (playwright skill)
    Preconditions: Open trade exists
    Steps:
      1. Navigate to /transactions/{openTradeId}
      2. Assert status badge shows "Open" with appropriate styling
      3. Assert trade details (pair, direction, timeFrame) are visible
      4. Assert outcome section shows placeholder or "Pending" state (not actual values)
      5. Assert review section is NOT visible
      6. Assert "Close Trade" button IS visible
    Expected Result: Only entry fields shown, outcome/review hidden
    Failure Indicators: Outcome values displayed (they're null), review form visible, crash
    Evidence: .sisyphus/evidence/task-11-open-detail.png

  Scenario: Closed trade detail page shows review form
    Tool: Playwright (playwright skill)
    Preconditions: Closed trade exists with outcome data
    Steps:
      1. Navigate to /transactions/{closedTradeId}
      2. Assert status badge shows "Closed"
      3. Assert outcome section shows actual values (outcome, R:R, returnAmount)
      4. Assert review section IS visible with empty/editable form
      5. Assert "Close Trade" button is NOT visible
    Expected Result: Full details with review form available
    Failure Indicators: Review section hidden, close button still visible
    Evidence: .sisyphus/evidence/task-11-closed-detail.png

  Scenario: Review submission transitions to Reviewed status
    Tool: Playwright (playwright skill)
    Preconditions: Closed trade detail page open
    Steps:
      1. Fill reviewFeedback textarea with "Good entry, should have held longer for full target"
      2. Click "Save Review" button
      3. Assert success toast appears
      4. Assert status badge changes to "Reviewed"
    Expected Result: Status transitions, badge updates
    Failure Indicators: Status stays "Closed", error, no badge update
    Evidence: .sisyphus/evidence/task-11-review-submit.png
  ```

  **Commit**: YES (group 6)
  - Message: `feat(ui): status-aware transaction detail with conditional rendering`
  - Files: `client/src/pages/TransactionDetail.tsx`
  - Pre-commit: `npm run check`

- [ ] 12. Transactions List: Status Badges + Filters

  **What to do**:
  - Update `client/src/pages/Transactions.tsx`:
    - Replace "Reviewed" column with "Status" column showing badges:
      - Open: yellow/amber badge
      - Closed: blue badge
      - Reviewed: green badge
    - Replace `isReviewed` filter with `status` filter dropdown:
      - Options: All, Open, Closed, Reviewed
    - Ensure action column shows appropriate actions per status:
      - Open: Close Trade button, View, Delete
      - Closed: View, Delete
      - Reviewed: View, Delete
    - Handle null `endTime` in table display (show "—" or "In Progress" for open trades)
    - Handle null `outcome`/`returnAmount` display (show "—" for open trades)
    - Sort integration: when sorting by endTime, open trades (null) appear last
  - Update the filter dropdown to call `transaction.list` with new `status` filter

  **Must NOT do**:
  - Do not add new columns beyond replacing Reviewed with Status
  - Do not add pagination
  - Do not redesign the table layout

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Table UI changes with conditional rendering and filter updates
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 10, 11)
  - **Blocks**: None
  - **Blocked By**: Task 8

  **References**:

  **Pattern References**:
  - `client/src/pages/Transactions.tsx:220-300` — Table body with column rendering. The "Reviewed" column at approximately line 286-291 must be replaced with Status badge. Action column at lines 265-280 needs conditional buttons.
  - `client/src/pages/Transactions.tsx:113-179` — Filter controls section. Replace `isReviewed` filter with `status` select dropdown. Follow the existing filter pattern (outcome, direction, tradingPair selects).
  - `client/src/pages/Transactions.tsx:87-110` — Filter state and query parameters. Update `isReviewed` state to `status` state, update the tRPC list call parameters.

  **API/Type References**:
  - `server/routers.ts:270-288` — (post-Task 8) Updated list input schema with `status` filter option.
  - `shared/const.ts` — `TRADE_STATUSES` for rendering filter dropdown options and badge labels.

  **WHY Each Reference Matters**:
  - Lines 220-300: Table body — the executor must locate the Reviewed column and replace it, and modify the action column.
  - Lines 113-179: Filter section — the executor must find the isReviewed filter and swap it.
  - Lines 87-110: State management — the filter state variable naming must change.

  **Acceptance Criteria**:
  - [ ] "Status" column replaces "Reviewed" column with colored badges
  - [ ] Status filter dropdown (All/Open/Closed/Reviewed) replaces isReviewed filter
  - [ ] Open trades show "—" for outcome, returnAmount, endTime columns
  - [ ] Close Trade action only visible for open trades
  - [ ] `npm run check` and `npm run build` pass

  **QA Scenarios:**

  ```
  Scenario: Status badges render correctly for all statuses
    Tool: Playwright (playwright skill)
    Preconditions: At least 1 open, 1 closed, 1 reviewed trade exist
    Steps:
      1. Navigate to /transactions
      2. Assert open trade row shows "Open" badge (amber/yellow styling)
      3. Assert closed trade row shows "Closed" badge (blue styling)
      4. Assert reviewed trade row shows "Reviewed" badge (green styling)
    Expected Result: Each status has distinct visual badge
    Failure Indicators: Wrong badge text, missing badges, inconsistent colors
    Evidence: .sisyphus/evidence/task-12-status-badges.png

  Scenario: Status filter works correctly
    Tool: Playwright (playwright skill)
    Preconditions: Mix of open/closed/reviewed trades
    Steps:
      1. Navigate to /transactions
      2. Select "Open" from status filter
      3. Assert only open trades visible
      4. Select "Closed" from status filter
      5. Assert only closed trades visible
      6. Select "All" to reset
      7. Assert all trades visible
    Expected Result: Filter correctly shows/hides trades by status
    Failure Indicators: Wrong trades shown, filter has no effect
    Evidence: .sisyphus/evidence/task-12-status-filter.png

  Scenario: Null fields display gracefully for open trades
    Tool: Playwright (playwright skill)
    Preconditions: Open trade exists in list
    Steps:
      1. Navigate to /transactions
      2. Find open trade row
      3. Assert outcome column shows "—" (not "null" or empty)
      4. Assert return column shows "—"
      5. Assert end time / duration column shows "—" or "In Progress"
    Expected Result: Null values shown as dashes or placeholder text
    Failure Indicators: "null" text, blank cell, NaN, runtime error
    Evidence: .sisyphus/evidence/task-12-null-fields.png
  ```

  **Commit**: YES (group 6)
  - Message: `feat(ui): status badges and filters for transactions list`
  - Files: `client/src/pages/Transactions.tsx`
  - Pre-commit: `npm run check && npm run build`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `npm run check` + `npm run build` + `npm run test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration: create open trade → edit it → close via modal → review on detail page → verify stats updated. Test edge cases: empty state, invalid transitions, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Order | Message                                                                 | Files                                                                          | Pre-commit                       |
| ----- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------- |
| 1     | `feat(schema): add trade lifecycle status and nullable outcome fields`  | drizzle/schema.ts, shared/                                                     | `npm run check`                  |
| 2     | `feat(migration): backfill existing transactions with lifecycle status` | server/db.ts (migration fn)                                                    | `npm run check`                  |
| 3     | `test(transaction): add lifecycle transition and stat exclusion tests`  | server/transaction.lifecycle.test.ts                                           | `npm run test`                   |
| 4     | `feat(api): implement open/close/review lifecycle procedures`           | server/routers.ts, server/db.ts                                                | `npm run test && npm run check`  |
| 5     | `feat(ui): simplify open trade form and add close modal`                | client/src/pages/NewTransaction.tsx, client/src/components/CloseTradeModal.tsx | `npm run check`                  |
| 6     | `feat(ui): status-aware transaction detail and list views`              | client/src/pages/TransactionDetail.tsx, client/src/pages/Transactions.tsx      | `npm run check && npm run build` |

---

## Success Criteria

### Verification Commands

```bash
npm run check    # Expected: 0 errors
npm run build    # Expected: success
npm run test     # Expected: all pass (including new lifecycle tests)
```

### Final Checklist

- [ ] All "Must Have" present — lifecycle enforcement, TDD coverage, stats exclusion, migration
- [ ] All "Must NOT Have" absent — no price fields, no dashboard redesign, no new frameworks
- [ ] All tests pass — existing + new lifecycle tests
- [ ] Open trade → Close via Modal → Review flow works end-to-end
- [ ] Existing transactions correctly migrated to new status field
- [ ] Dashboard statistics unaffected by open trades
