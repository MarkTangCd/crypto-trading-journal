---
id: TASK-66
title: Dashboard as the ledger with stats on trades
status: To Do
assignee: []
created_date: "2026-11-04 12:43"
updated_date: "2026-11-04 12:45"
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

- [ ] #1 stats.get({ accountId }) returns getTradeStats output plus balanceUsdt / unrealizedPnlUsdt / lastSyncedAt from the account; no initialBalance input; server/stats.test.ts (or the existing stats test) updated
- [ ] #2 Dashboard: hero wallet balance with an unrealized sub-line when open trades exist; SyncLine; realized · synced trades row with fees total (absolute, no %); the existing four-stat grid (win rate, profit factor, expectancy, losing streak); one open line with count, exposure and exposure ÷ balance
- [ ] #3 Dashboard calls account.autoSync on mount; never-synced state shows hero —, never synced · sync now, and does not render the performance section
- [ ] #4 Dashboard no longer reads initialBalance or any transaction procedure; devbox run -- npm run check and npm run test pass; the page is exercised in the dev server with synced, never-synced and failed states
<!-- AC:END -->
