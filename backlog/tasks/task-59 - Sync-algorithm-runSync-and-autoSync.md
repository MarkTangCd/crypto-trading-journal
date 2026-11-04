---
id: TASK-59
title: 'Sync algorithm: runSync and autoSync'
status: To Do
assignee: []
created_date: '2026-11-04 12:43'
updated_date: '2026-11-04 12:44'
labels:
  - ready-for-agent
dependencies:
  - TASK-55
  - TASK-56
  - TASK-58
references:
  - backlog/docs/doc-4 - Exchange-sync-spec.md
ordinal: 59000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-4 section Sync algorithm, steps 0 to 11, plus Auto-sync and the error taxonomy. Glue between the adapter, the reconstruction module and the DB functions; no new arithmetic here.

Atomic per run: everything is fetched before anything is written, and one runInSqliteTransaction writes fills, trades and the account snapshot together. Tested only through the fake adapter from the adapter task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 server/exchange/sync.ts exports runSync(accountId, userId, { reason }) and autoSync(userId); the adapter is injectable (default createBinanceAdapter) so tests pass a fake
- [ ] #2 Lock: in-process Set<accountId>; a concurrent call throws TRPCError CONFLICT without writing lastSyncAttemptAt
- [ ] #3 Order: write attempt → verifyKey (failure persists the code and stops) → window (backfill when backfillStart is null: now − 30 d; incremental: income from incomeCursorAt − 1 h, per-symbol fills from stored max time − 1 h) → discoverSymbols ∪ open-trade symbols → fetchFills per symbol → fetchPositions (backfill: refetch a symbol to now when its position updateTime > windowEnd) → fetchConditionalOrders per non-zero position → fetchBalance → dedupe against stored (symbol, fillId) → seeds (backfill only) → reconstruct → one transaction writing fills, trades, backfillStart (first time), incomeCursorAt, balance, lastSyncedAt, cleared error
- [ ] #4 Any throw after the attempt write leaves fills/trades/snapshot untouched, persists lastSyncErrorCode (+ lastSyncRetryAt for rate_limited), logs [Sync] <accountId> <code> <detail>, and rethrows TRPCError with the code as message; reconstruction errors map to unknown
- [ ] #5 autoSync runs runSync independently for each account that is stale (lastSyncedAt null or older than 5 min) and whose lastSyncErrorCode is null, exchange_unavailable, network, or rate_limited with lastSyncRetryAt in the past; returns per-account { accountId, ok, code? }
- [ ] #6 server/exchange/sync.test.ts covers backfill, incremental (cursor overlap, open-symbol refetch), seeds persisted as source=seed, each of the eight error codes persisted, rollback on a throw during write, CONFLICT on concurrent call, and autoSync eligibility
- [ ] #7 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
