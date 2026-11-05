---
id: TASK-45
title: Balance snapshot and balance-curve source after initialBalance retires
status: Done
assignee:
  - "@myself"
created_date: "2026-11-04 06:46"
updated_date: "2026-11-04 08:22"
labels:
  - "wayfinder:grilling"
dependencies: []
references:
  - backlog/docs/doc-3 - Exchange-sync-map.md
ordinal: 45000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

## Question

Account balance now comes from the exchange wallet at sync time (decided). Where does that snapshot live, and how is the Dashboard balance curve computed once initialBalance is gone?

Options to grill: (a) a single balanceUsdt + balanceSyncedAt on accounts, curve derived as current balance minus cumulative later trade PnL; (b) an account_balance_snapshots table appended on every sync, curve drawn from snapshots; (c) both. Also decide what the Dashboard shows while an account has never synced.

<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Decisions (all recommendations accepted by the trader, 2026-11-04):

1. Storage: two columns on accounts — balanceUsdt (wallet balance, /fapi/v3/balance USDT row 'balance') and unrealizedPnlUsdt ('crossUnPnl' from the same call). No snapshot table in v1; if a curve is ever wanted, add one then and let history start from that point.
2. Balance curve: ruled OUT OF SCOPE for v1. Dashboard keeps a single hero balance numeral (the number is the design); deposits/withdrawals would also pollute a curve.
3. Hero shows wallet balance. When open trades exist, a secondary line shows unrealized PnL; layout is left to the UI prototype ticket.
4. The old 'since $initialBalance' delta becomes Σ realizedPnlUsd over all synced closed trades, labelled realized · synced. Absolute value only, no percentage (no clean base).
5. One timestamp: accounts.lastSyncedAt. Balance and trades are written together at the end of a successful sync, in the same transaction; a failed sync writes neither.
6. Never synced: hero shows —, label 'never synced', a 'sync now' button replaces the 'log a trade' empty state, performance section not rendered. Synced before but failed now: show the stale balance, lastSyncedAt and the one-line error (already decided on the map).
7. All other currentBalance consumers (position size calculator default, AI review context) read accounts.balanceUsdt; no live exchange call, staleness is signalled only by lastSyncedAt on the Dashboard.
<!-- SECTION:FINAL_SUMMARY:END -->
