# Plan: Remove Trading Systems & Elements

## Goal

彻底移除 Trading Systems 和 Trading Elements 功能的所有前后端代码、数据库表和列。confidenceLevel 字段一并删除。

## Scope of removal

### Database schema (`drizzle/schema.ts`)

- Drop tables: `trading_elements`, `trading_systems`, `trading_system_elements`, `transaction_elements`
- Drop columns from `transactions`: `tradingSystemId`, `confidenceLevel`
- Drop columns from `users`: `initialBalance` 保留（按 multi-account 设计仍可能存在）；删除 `activeTradingSystemId`
- 更新 `drizzle/relations.ts`
- 生成新的 migration（drizzle-kit generate）

### Backend (`server/`)

- `server/routers.ts`:
  - 删除整个 `tradingElement` router
  - 删除整个 `tradingSystem` router
  - 删除 `user.getSettings`（如果只剩 activeTradingSystemId 则整体删除该 procedure，或留空对象——按需调整 client 使用方）
  - `transaction.create` input：移除 `tradingSystemId`、`selectedElementIds`；移除 calculateConfidenceLevel 调用
  - `transaction.update` input：移除 `tradingSystemId`、`selectedElementIds`
  - `transaction.list` input：移除 `tradingSystemId` 过滤
  - `transaction.getFormDefaults` 返回值：移除 `activeSystem`
  - 移除 `transaction.getElements` procedure
  - `stats.getBySystem` 整个删除
- `server/db.ts`：删除所有 trading element / trading system / transaction element / activeTradingSystem 相关函数，删除 `calculateConfidenceLevel`，删除 `getSystemStatistics`；从 transaction CRUD 中移除相关字段
- `server/storage.ts`：清理任何相关引用
- 测试：删除 `server/tradingSystem.test.ts`；更新 `server/transaction.test.ts`、`server/transaction.lifecycle.test.ts`、`server/account.test.ts`、`server/sqlite.integration.test.ts` 等中所有相关断言/输入

### Frontend (`client/`)

- 删除 `client/src/pages/TradingSystems.tsx`
- 删除 `client/src/pages/TradingElements.tsx`
- `client/src/App.tsx`：删除两条 Route 和 import
- `client/src/components/DashboardLayout.tsx`：删除导航链接
- `client/src/pages/NewTransaction.tsx`：删除 trading system 选择器、element 多选、confidence 显示
- `client/src/pages/TransactionDetail.tsx`：删除 trading system / elements 显示与编辑
- `client/src/pages/Transactions.tsx`：删除 tradingSystemId 过滤器和 confidence 列/筛选
- `client/src/pages/Dashboard.tsx`：删除 system stats / confidence 相关 widget
- `client/src/lib/confidence.ts`：整文件删除
- `client/src/lib/ledger.tsx`：移除相关字段
- `e2e/confidence-score.spec.ts`：删除整个文件

### Shared (`shared/`)

- `shared/types.ts`、`shared/const.ts`：移除相关类型/常量

### Docs

- `CLAUDE.md` schema 描述更新（6 表 → 3 表）
- `AGENTS.md` 移除 tradingSystem.test.ts 引用
- README / PRODUCT.md / DESIGN.md 如有提及一并删除

## Execution order

1. **后端 + schema 同步删除**（一次性完成，避免类型断裂中间态）：
   - 修改 schema.ts、relations.ts
   - 重写 db.ts、routers.ts
   - 删除/更新所有相关测试
   - 生成 migration（`npm run db:push` 会同时生成并应用）
2. **前端清理**：
   - 删除两个页面
   - 更新 App.tsx、DashboardLayout、NewTransaction、TransactionDetail、Transactions、Dashboard
   - 删除 confidence.ts、e2e 测试
3. **验证**：
   - `npm run check`（typecheck）
   - `npm run test`（vitest）
   - `npm run build`
   - 启动 dev server 简单巡检（如果可行）

## Done when

- [ ] schema 中不再出现 tradingElements / tradingSystems / tradingSystemElements / transactionElements / tradingSystemId / activeTradingSystemId / confidenceLevel
- [ ] grep "tradingSystem\|tradingElement\|TradingSystem\|TradingElement\|confidenceLevel" 在 src/server/client/shared/drizzle 下零命中（文档除外）
- [ ] App.tsx 中无 /trading-systems、/trading-elements 路由
- [ ] NewTransaction 页面无 trading system 选择
- [ ] `npm run check` 通过
- [ ] `npm run test` 通过
- [ ] 新 migration 生成并通过 `npm run db:push`
