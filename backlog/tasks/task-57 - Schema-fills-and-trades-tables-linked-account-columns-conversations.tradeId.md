---
id: TASK-57
title: 'Schema: fills and trades tables, linked-account columns, conversations.tradeId'
status: To Do
assignee: []
created_date: '2026-11-04 12:42'
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
- [ ] #1 drizzle/schema.ts defines fills (all spec columns, check constraints on source/positionSide/side, unique (accountId, symbol, fillId), indexes (accountId, symbol, time) and (accountId, time))
- [ ] #2 drizzle/schema.ts defines trades (all spec columns, checks on side/status, unique (accountId, tradeKey), indexes (accountId, status), (accountId, openTime), (accountId, closeTime, id))
- [ ] #3 accounts gains exchange (not null, default binance, check in ('binance')), apiKey, apiSecret, keyVerifiedAt, balanceUsdt, unrealizedPnlUsdt, backfillStart, incomeCursorAt, lastSyncedAt, lastSyncAttemptAt, lastSyncErrorCode, lastSyncRetryAt, all nullable except exchange
- [ ] #4 conversations gains tradeId (nullable, indexed); the exactly-one-of check now spans transactionId, preTradeId, tradeId
- [ ] #5 drizzle/relations.ts and shared/types.ts export Fill, InsertFill, Trade, InsertTrade; Account type includes the new columns
- [ ] #6 Migration generated with devbox run -- npm run db:push is committed and applies cleanly to a copy of drizzle/dev.db
- [ ] #7 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
