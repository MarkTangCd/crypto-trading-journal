---
id: TASK-50
title: Break the Exchange sync spec into implementation tasks
status: Done
assignee:
  - '@myself'
created_date: '2026-11-04 06:47'
updated_date: '2026-11-04 12:46'
labels:
  - 'wayfinder:task'
dependencies:
  - TASK-49
references:
  - backlog/docs/doc-3 - Exchange-sync-map.md
ordinal: 50000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Nothing left to decide: turn the spec into ordered, independently verifiable Backlog tasks with acceptance criteria and --depends-on edges, each sized for one agent session.

Expected clusters: drop transactions / add trades and account credential columns; thin Binance client + ExchangeAdapter; reconstruction module (from the prototype); sync procedure + cursor; tRPC trade/account namespaces; Accounts UI; Transactions/Detail/Dashboard rewrite; review-agent contextBuilder and getRecentTrades skill re-based on trades; tests. Label them ready-for-agent or ready-for-human.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read doc-4 spec, decision-2, prototype branches, current server/client layout
2. Slice into ~17 tasks ordered additive-first (fixed-point, adapter, Binance client x2, reconstruct, schema, db, sync, account procedures, trade procedures, Accounts/Trades/Detail/Dashboard UI, review agent) then two removal tasks (manual-entry UI, drop transactions + dead server code)
3. Every task keeps npm run check and npm run test green on its own; label ready-for-agent; --ref doc-4
4. Create tasks, wire --depends-on in a second pass, record the list in the final summary and on the map
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Seventeen implementation tasks created from doc-4, task-52 to task-68, all labelled ready-for-agent and referencing the spec. Ordered additive-first so every task keeps npm run check and npm run test green on its own:

Foundations (parallel): task-52 fixed-point arithmetic; task-53 ExchangeAdapter + ExchangeError + error codes + fake adapter; task-57 additive schema (fills, trades, account sync columns, conversations.tradeId; transactions untouched, apiKey/apiSecret nullable until the final task).
Server: task-54 Binance HTTP core + verifyKey + fetchBalance (commits the probe/wizard scripts); task-55 Binance data endpoints + fee conversion; task-56 pure reconstruction module with the eight prototype scenarios; task-58 DB functions (fills, trade upsert merge rules, hand-edit rules, sync state writes, derived stats, cascade); task-59 runSync/autoSync; task-60 account procedures (create verifies key, replaceKey, sync, autoSync, delete cascade; minimal Accounts form edit to keep tsc green); task-61 trade.list/get/update; task-62 review agent on trades.
UI: task-63 Accounts dossier (creates SyncLine, Chinese reason map, useSyncAccount); task-64 Trades page replaces /transactions; task-65 Trade detail instrument; task-66 Dashboard ledger as a vertical slice that also re-bases stats.get.
Removal: task-67 manual-entry UI + Playwright smoke re-based to never-synced states; task-68 drop transactions, initialBalance, transaction namespace, dead db/tradeMath code, tighten NOT NULL.

Dependencies wired with --depends-on; critical path 53 → 54 → 55 → 59 → 60 → 63 → 64 → 65 → 67 → 68. No new map fog; the existing fog items are pointed at from the tasks that touch them (task-55 live-position facts, task-62 review context, task-67 e2e strategy).
<!-- SECTION:FINAL_SUMMARY:END -->
