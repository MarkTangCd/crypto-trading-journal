---
id: TASK-64
title: Trades page replaces Transactions
status: To Do
assignee: []
created_date: "2026-11-04 12:43"
updated_date: "2026-11-04 12:45"
labels:
  - ready-for-agent
dependencies:
  - TASK-63
  - TASK-61
references:
  - backlog/docs/doc-4 - Exchange-sync-spec.md
ordinal: 64000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Spec doc-4 section UI → Trades, from task-47 (reference: TradesA/TradeLine in the prototype on branch prototype/exchange-sync-ui). Read DESIGN.md and PRODUCT.md first. Route /trades replaces /transactions in App.tsx and the nav; the old Transactions page and /transactions/:id detail stay until their own removal/replacement tasks.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 client/src/pages/Trades.tsx at /trades: open trades first with stop / target inline, then closed trades grouped by day (UTC+8 via shared/time.ts) with a per-day PnL subtotal; one line per trade: symbol side qty @ entry → exit, PnL right-aligned in win/loss hue; openTimeApprox shown only as ~ before the time
- [ ] #2 Each line links to /trades/:id; the page calls account.autoSync on mount and shows SyncLine for the selected account with a manual sync button
- [ ] #3 Never-synced state reads nothing synced yet with the sync button; synced-but-empty state reads no trades in the last 30 days
- [ ] #4 App.tsx routes /trades; DashboardLayout nav item reads trades and points at /trades; /transactions route removed; New Trade nav item removed
- [ ] #5 devbox run -- npm run check passes and the page is exercised in the dev server with synced, never-synced and failed states
<!-- AC:END -->
