---
id: TASK-64
title: Trades page replaces Transactions
status: Done
assignee:
  - '@myself'
created_date: '2026-11-04 12:43'
updated_date: '2026-11-05 12:38'
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
- [x] #1 client/src/pages/Trades.tsx at /trades: open trades first with stop / target inline, then closed trades grouped by day (UTC+8 via shared/time.ts) with a per-day PnL subtotal; one line per trade: symbol side qty @ entry → exit, PnL right-aligned in win/loss hue; openTimeApprox shown only as ~ before the time
- [x] #2 Each line links to /trades/:id; the page calls account.autoSync on mount and shows SyncLine for the selected account with a manual sync button
- [x] #3 Never-synced state reads nothing synced yet with the sync button; synced-but-empty state reads no trades in the last 30 days
- [x] #4 App.tsx routes /trades; DashboardLayout nav item reads trades and points at /trades; /transactions route removed; New Trade nav item removed
- [x] #5 devbox run -- npm run check passes and the page is exercised in the dev server with synced, never-synced and failed states
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. client/src/pages/Trades.tsx (prototype TradesB/TradeLine): useAccount selected account; trade.list({accountId}); account.autoSync once on mount, invalidate account/trade/stats on settle; header 'trades' + SyncLine (useSyncAccount).
2. Open section: lines with stop/target inline; time = openTime, prefixed ~ when openTimeApprox. Closed: sorted by closeTime desc, grouped by fmtDate(closeTime) (UTC+8), per-day PnL subtotal; time = closeTime.
3. Line = wouter Link to /trades/:id: time | symbol side qty @ entry → exit | PnL right-aligned win/loss hue.
4. States: loading spinner; no account -> link-an-account pointer; never synced -> 'nothing synced yet' + sync button; synced but empty -> 'no trades in the last 30 days'; failed -> SyncLine failure + whatever trades exist.
5. App.tsx: add /trades, remove /transactions list route (keep /transactions/new, /transactions/:id). DashboardLayout: Transactions -> Trades at /trades, drop New Trade + unused icons.
6. format, check, exercise in dev server with synced / never-synced / failed states.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Add client/src/pages/Trades.tsx at /trades (prototype TradesB/TradeLine): open trades first with stop/target inline, closed trades sorted by closeTime and grouped by UTC+8 close day with a per-day PnL subtotal; each line links to /trades/:id with PnL right-aligned in win/loss hue. Open lines show 'mon d hh:mm' (open trades are not day-grouped) with a ~ prefix when openTimeApprox; closed lines show close hh:mm.

Page fires account.autoSync on mount (invalidates account/trade/stats), shows SyncLine with manual sync via useSyncAccount. States: no account -> link pointer; never synced -> 'nothing synced yet.' + sync now; synced but empty -> 'no trades in the last 30 days.'; failed -> SyncLine failure, trades still listed.

App.tsx routes /trades and drops the /transactions list route (/transactions/new and /transactions/:id stay for task-65/67). Nav: Transactions -> Trades at /trades, New Trade removed.

Verified: npm run check passes; exercised in a dev server on a temp DB copy with synced, never-synced, synced-empty and failed states (screenshots), autoSync POST on mount, links /trades/:id. /trades/:id 404s until task-65.
<!-- SECTION:FINAL_SUMMARY:END -->
