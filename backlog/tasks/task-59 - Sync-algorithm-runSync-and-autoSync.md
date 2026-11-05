---
id: TASK-59
title: "Sync algorithm: runSync and autoSync"
status: Done
assignee:
  - "@myself"
created_date: "2026-11-04 12:43"
updated_date: "2026-11-05 00:33"
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

- [x] #1 server/exchange/sync.ts exports runSync(accountId, userId, { reason }) and autoSync(userId); the adapter is injectable (default createBinanceAdapter) so tests pass a fake
- [x] #2 Lock: in-process Set<accountId>; a concurrent call throws TRPCError CONFLICT without writing lastSyncAttemptAt
- [x] #3 Order: write attempt → verifyKey (failure persists the code and stops) → window (backfill when backfillStart is null: now − 30 d; incremental: income from incomeCursorAt − 1 h, per-symbol fills from stored max time − 1 h) → discoverSymbols ∪ open-trade symbols → fetchFills per symbol → fetchPositions (backfill: refetch a symbol to now when its position updateTime > windowEnd) → fetchConditionalOrders per non-zero position → fetchBalance → dedupe against stored (symbol, fillId) → seeds (backfill only) → reconstruct → one transaction writing fills, trades, backfillStart (first time), incomeCursorAt, balance, lastSyncedAt, cleared error
- [x] #4 Any throw after the attempt write leaves fills/trades/snapshot untouched, persists lastSyncErrorCode (+ lastSyncRetryAt for rate_limited), logs [Sync] <accountId> <code> <detail>, and rethrows TRPCError with the code as message; reconstruction errors map to unknown
- [x] #5 autoSync runs runSync independently for each account that is stale (lastSyncedAt null or older than 5 min) and whose lastSyncErrorCode is null, exchange_unavailable, network, or rate_limited with lastSyncRetryAt in the past; returns per-account { accountId, ok, code? }
- [x] #6 server/exchange/sync.test.ts covers backfill, incremental (cursor overlap, open-symbol refetch), seeds persisted as source=seed, each of the eight error codes persisted, rollback on a throw during write, CONFLICT on concurrent call, and autoSync eligibility
- [x] #7 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. server/exchange/sync.ts: runSync(accountId, userId, { reason, adapter? }) and autoSync(userId, { adapter? }); default adapter createBinanceAdapter() per run
2. Lock checked synchronously at entry (before any await) so a concurrent call gets CONFLICT with no attempt write; released in finally. Missing account -> NOT_FOUND, account without apiKey -> PRECONDITION_FAILED, both before the attempt write
3. Steps per spec: attempt -> verifyKey -> window -> discover ∪ open symbols -> fills -> positions (backfill refetch) -> conditional orders -> balance -> dedupe -> seeds -> reconstruct (logs printed) -> one runInSqliteTransaction(insertFills, upsertTradesByTradeKey, writeSyncSuccess)
4. Failure: code from ExchangeError else unknown; rate_limited retryAt falls back to now+60s; writeSyncFailure; [Sync] log; TRPCError message = code (needs-human -> BAD_REQUEST, transient -> SERVICE_UNAVAILABLE, unknown -> INTERNAL_SERVER_ERROR)
5. autoSync: sequential over eligible accounts (has key, stale, code eligible); per-account { accountId, ok, code? }
6. server/exchange/sync.test.ts via subprocess + fake adapter; rollback test uses a temporary SQLite trigger that aborts the account snapshot update inside the write transaction
7. format touched files, check, test
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

New server/exchange/sync.ts gluing the adapter, reconstruct and the task-58 DB functions.

- runSync(accountId, userId, { reason, adapter? }): in-process lock checked before any await (CONFLICT, no attempt write); NOT_FOUND / PRECONDITION_FAILED (no API key) also before the attempt; then attempt -> verifyKey -> window (backfill now-30d; incremental income from incomeCursorAt-1h, fills from per-symbol max time-1h) -> discovered ∪ open-trade symbols -> fills -> positions (backfill refetch to now when updateTime > window end) -> conditional orders per non-zero position -> balance -> dedupe by (symbol, fillId) -> seeds (backfill) -> reconstruct (logs printed) -> one runInSqliteTransaction writing fills, trades and the snapshot.
- Failures after the attempt: code from ExchangeError else unknown; rate_limited retryAt falls back to now+60s; writeSyncFailure, [Sync] <id> <code> log, TRPCError with message = code (needs-human BAD_REQUEST, transient SERVICE_UNAVAILABLE, unknown INTERNAL_SERVER_ERROR).
- autoSync(userId, { adapter? }): sequential runSync over accounts with a key, stale (>5 min or never), and error null / exchange_unavailable / network / rate_limited past retryAt; returns { accountId, ok, code? }.
- server/exchange/sync.test.ts (6 cases, real SQLite via subprocess + fake adapter): backfill with seed + position refetch, incremental cursor overlap + open-symbol refetch + SL update, all eight codes, rollback via a temporary SQLite trigger, CONFLICT, autoSync eligibility and failure outcome. Mutation-checked cursor overlap, lock and refetch.

Known limitation (existing architecture): writeSyncAttempt / writeSyncFailure run outside runInSqliteTransaction on the shared connection, so if another account's write transaction is open at that instant they join it.

npm run check and npm run test (468) pass.

<!-- SECTION:FINAL_SUMMARY:END -->
