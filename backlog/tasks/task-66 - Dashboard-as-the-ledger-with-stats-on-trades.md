---
id: TASK-66
title: Dashboard as the ledger with stats on trades
status: Done
assignee:
  - '@myself'
created_date: '2026-11-04 12:43'
updated_date: '2026-11-05 13:15'
labels:
  - ready-for-agent
dependencies:
  - TASK-63
references:
  - backlog/docs/doc-4 - Exchange-sync-spec.md
ordinal: 66000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-4 sections Derived values and UI → Dashboard, from task-47 and task-45 (reference: DashboardA in the prototype on branch prototype/exchange-sync-ui). Read DESIGN.md and PRODUCT.md first.

Vertical slice: stats.get is re-based onto trades here (getTradeStats from the DB task) and the Dashboard consumes the new shape in the same change so the client keeps compiling. The open-goals strip stays.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 stats.get({ accountId }) returns getTradeStats output plus balanceUsdt / unrealizedPnlUsdt / lastSyncedAt from the account; no initialBalance input; server/stats.test.ts (or the existing stats test) updated
- [x] #2 Dashboard: hero wallet balance with an unrealized sub-line when open trades exist; SyncLine; realized · synced trades row with fees total (absolute, no %); the existing four-stat grid (win rate, profit factor, expectancy, losing streak); one open line with count, exposure and exposure ÷ balance
- [x] #3 Dashboard calls account.autoSync on mount; never-synced state shows hero —, never synced · sync now, and does not render the performance section
- [x] #4 Dashboard no longer reads initialBalance or any transaction procedure; devbox run -- npm run check and npm run test pass; the page is exercised in the dev server with synced, never-synced and failed states
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. server/routers.ts stats.get: requireOwnedAccount -> { ...getTradeStats(id, userId), balanceUsdt, unrealizedPnlUsdt, lastSyncedAt } from the account; drop getStatistics import (db fn stays for task-68).
2. Tests: stats router test moves to server/trade.test.ts (mock getTradeStats, assert merge + FORBIDDEN on unowned account); remove the old-shape stats test from server/transaction.test.ts.
3. Extract useAutoSync() into client/src/hooks/useSyncAccount.ts (autoSync on mount + invalidate account/trade/stats); Trades.tsx switches to it, Dashboard uses it.
4. Dashboard AccountStats (prototype DashboardA): hero wallet balance (— when never synced) + unrealized sub-line when openCount > 0; SyncLine; never synced -> nothing else. Synced: realized · synced trades row (signed Σ realizedPnlUsd · fees $x absolute); performance grid win rate / profit factor / expectancy / losing streak (current) from string decimals, hidden with a one-line note when closedCount = 0; open line count · exposure · ratio× balance when openCount > 0. No-account state points to /accounts. OpenGoals strip stays; /transactions/new CTA removed.
5. format, check, test; exercise synced / never-synced / failed in dev server on a temp DB copy.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
stats.get({ accountId }) now returns getTradeStats(accountId, userId) plus the account's balanceUsdt / unrealizedPnlUsdt / lastSyncedAt; getStatistics is no longer used by the router (db fn left for task-68). Router test moved to server/trade.test.ts (merge + FORBIDDEN on unowned account); old-shape stats test and getStatistics mock removed from server/transaction.test.ts.

Dashboard AccountStats is the ledger (prototype DashboardA): hero wallet balance (— when never synced) with a signed unrealized sub-line when open trades exist; SyncLine; realized · synced trades row (signed Σ realizedPnlUsd · fees absolute); four-stat grid from the string decimals (losing streak noted as current), replaced by a one-line note with no closed trades; open line count · exposure · ratio× balance. Never synced renders only hero + SyncLine. No-account state links to /accounts; OpenGoals strip unchanged; /transactions/new CTA gone.

New useAutoSync() in hooks/useSyncAccount.ts runs account.autoSync on mount and invalidates account/trade/stats; Dashboard and Trades both use it.

Verified: npm run check passes, npm run test 485/485; dev server on a temp DB copy exercised synced, never-synced and failed states (screenshots, autoSync POST on mount, numbers match hand calculation).
<!-- SECTION:FINAL_SUMMARY:END -->
