---
id: TASK-57
title: 'Schema: fills and trades tables, linked-account columns, conversations.tradeId'
status: Done
assignee:
  - '@myself'
created_date: '2026-11-04 12:42'
updated_date: '2026-11-05 00:09'
labels:
  - ready-for-agent
dependencies: []
references:
  - backlog/docs/doc-4 - Exchange-sync-spec.md
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-4 section Data model. Additive step: new tables and columns only, so the existing transactions path keeps compiling until the removal tasks. transactions, accounts.initialBalance and conversations.transactionId are untouched here; apiKey/apiSecret are nullable in this step and tightened to NOT NULL by the removal task.

Current DB holds 0 transactions; existing account rows survive this migration (they are re-linked with a key later).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 drizzle/schema.ts defines fills (all spec columns, check constraints on source/positionSide/side, unique (accountId, symbol, fillId), indexes (accountId, symbol, time) and (accountId, time))
- [x] #2 drizzle/schema.ts defines trades (all spec columns, checks on side/status, unique (accountId, tradeKey), indexes (accountId, status), (accountId, openTime), (accountId, closeTime, id))
- [x] #3 accounts gains exchange (not null, default binance, check in ('binance')), apiKey, apiSecret, keyVerifiedAt, balanceUsdt, unrealizedPnlUsdt, backfillStart, incomeCursorAt, lastSyncedAt, lastSyncAttemptAt, lastSyncErrorCode, lastSyncRetryAt, all nullable except exchange
- [x] #4 conversations gains tradeId (nullable, indexed); the exactly-one-of check now spans transactionId, preTradeId, tradeId
- [x] #5 drizzle/relations.ts and shared/types.ts export Fill, InsertFill, Trade, InsertTrade; Account type includes the new columns
- [x] #6 Migration generated with devbox run -- npm run db:push is committed and applies cleanly to a copy of drizzle/dev.db
- [x] #7 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. drizzle/schema.ts: add fills + trades tables (spec columns, checks, unique, indexes) with Fill/InsertFill/Trade/InsertTrade types
2. accounts: add exchange (not null default 'binance', check) + 11 nullable columns; initialBalance untouched
3. conversations: add tradeId + (userId, tradeId) index; XOR check -> exactly-one-of over transactionId/preTradeId/tradeId
4. Run drizzle-kit generate only (db:push would also migrate the real data/ DB; server migrates on startup anyway)
5. Verify migration applies to copies of drizzle/dev.db and data/crypto-trading-journal.sqlite (account row survives, exchange='binance')
6. format, check, test
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Additive schema step for exchange sync (doc-4 Data model).

- drizzle/schema.ts: new fills and trades tables (checks, unique indexes, query indexes) with Fill/InsertFill/Trade/InsertTrade types; accounts gains exchange (not null, default binance, check) plus 11 nullable sync/key columns; conversations gains tradeId + (userId, tradeId) index and the attachment check is now exactly-one-of transactionId/preTradeId/tradeId.
- Migration drizzle/0012_left_starfox.sql generated with drizzle-kit generate; table-rebuild INSERT...SELECT hand-patched (as in 0010) to select NULL / 'binance' for columns the old tables lack.
- Types reach shared/types.ts via its existing export type * from schema; drizzle/relations.ts is empty and needed no change.
- Test fixtures with hand-written accounts DDL updated for the new columns; the legacy migrate fixture now includes the accounts table that migration 0001 creates.

Verification: migration applied via drizzle-kit migrate and via server getDb() on copies of data/crypto-trading-journal.sqlite (existing account kept, exchange=binance, checks enforced). drizzle/dev.db copy fails at migration 0001 on main as well (stale pre-0001 DB, unrelated). npm run check and npm run test (457) pass.

Deviation: did not run npm run db:push, because its migrate step targets the real data/ DB; the server applies the migration on startup.
<!-- SECTION:FINAL_SUMMARY:END -->
