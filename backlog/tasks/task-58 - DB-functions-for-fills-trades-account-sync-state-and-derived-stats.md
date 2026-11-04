---
id: TASK-58
title: 'DB functions for fills, trades, account sync state and derived stats'
status: To Do
assignee: []
created_date: '2026-11-04 12:42'
updated_date: '2026-11-04 12:44'
labels:
  - ready-for-agent
dependencies:
  - TASK-57
  - TASK-52
references:
  - backlog/docs/doc-4 - Exchange-sync-spec.md
ordinal: 58000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-4 sections Data model (rebuild merge rules), Derived values and tRPC surface. Plain exported functions in server/db.ts, userId-filtered, no router logic. Existing transaction functions stay until the removal task.

Trades are matched by tradeKey, never delete-and-reinsert, so conversations keep their tradeId.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 insertFills(rows) ignores duplicates on (accountId, symbol, fillId); listFillsByAccount(accountId, userId); getFillCursors(accountId) returns max fills.time per symbol
- [ ] #2 upsertTradesByTradeKey(accountId, userId, records, syncedAt) inserts new keys with every column, updates existing keys with every column except openTime and openTimeApprox, and except stopLossPrice/takeProfitPrice on rows whose stored status is closed; a stored tradeKey absent from records is logged with [Sync] and left in place
- [ ] #3 getTradeById(id, userId), listTrades(accountId, userId, status?) ordered open first then openTime desc, listOpenTradeSymbols(accountId)
- [ ] #4 updateTradeByHand(id, userId, patch) accepts stopLossPrice/takeProfitPrice only on closed trades and openTime only when openTimeApprox is true (then sets it false); anything else throws
- [ ] #5 writeSyncAttempt(accountId, at), writeSyncFailure(accountId, code, retryAt?) and writeSyncSuccess(accountId, { balanceUsdt, unrealizedPnlUsdt, backfillStart?, incomeCursorAt, at }) which also clears lastSyncErrorCode/lastSyncRetryAt and sets keyVerifiedAt; writeSyncSuccess runs on the caller's open transaction
- [ ] #6 getTradeStats(accountId, userId) returns win rate, profit factor, expectancy, current losing streak (closed trades newest-first by closeTime until the first non-loss), Σ realizedPnlUsd, Σ feeUsd, open count, open exposure Σ positionSizeUsdt, exposure ÷ balanceUsdt (null when balance null); outcome derived from realizedPnlUsd sign
- [ ] #7 deleteAccountCascade(id, userId) removes fills, trades, their conversations and messages, and the account in one runInSqliteTransaction; toPublicAccount(row) strips apiKey/apiSecret and adds apiKeyTail (last 4 of the decrypted key)
- [ ] #8 server/trade.db.test.ts covers merge rules (openTime frozen, closed SL/TP frozen, open SL/TP overwritten), hand-edit rules, stats and cascade through the real SQLite handle (see server/sqlite.integration.test.ts)
- [ ] #9 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
