---
id: TASK-58
title: "DB functions for fills, trades, account sync state and derived stats"
status: Done
assignee:
  - "@myself"
created_date: "2026-11-04 12:42"
updated_date: "2026-11-05 00:20"
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

- [x] #1 insertFills(rows) ignores duplicates on (accountId, symbol, fillId); listFillsByAccount(accountId, userId); getFillCursors(accountId) returns max fills.time per symbol
- [x] #2 upsertTradesByTradeKey(accountId, userId, records, syncedAt) inserts new keys with every column, updates existing keys with every column except openTime and openTimeApprox, and except stopLossPrice/takeProfitPrice on rows whose stored status is closed; a stored tradeKey absent from records is logged with [Sync] and left in place
- [x] #3 getTradeById(id, userId), listTrades(accountId, userId, status?) ordered open first then openTime desc, listOpenTradeSymbols(accountId)
- [x] #4 updateTradeByHand(id, userId, patch) accepts stopLossPrice/takeProfitPrice only on closed trades and openTime only when openTimeApprox is true (then sets it false); anything else throws
- [x] #5 writeSyncAttempt(accountId, at), writeSyncFailure(accountId, code, retryAt?) and writeSyncSuccess(accountId, { balanceUsdt, unrealizedPnlUsdt, backfillStart?, incomeCursorAt, at }) which also clears lastSyncErrorCode/lastSyncRetryAt and sets keyVerifiedAt; writeSyncSuccess runs on the caller's open transaction
- [x] #6 getTradeStats(accountId, userId) returns win rate, profit factor, expectancy, current losing streak (closed trades newest-first by closeTime until the first non-loss), Σ realizedPnlUsd, Σ feeUsd, open count, open exposure Σ positionSizeUsdt, exposure ÷ balanceUsdt (null when balance null); outcome derived from realizedPnlUsd sign
- [x] #7 deleteAccountCascade(id, userId) removes fills, trades, their conversations and messages, and the account in one runInSqliteTransaction; toPublicAccount(row) strips apiKey/apiSecret and adds apiKeyTail (last 4 of the decrypted key)
- [x] #8 server/trade.db.test.ts covers merge rules (openTime frozen, closed SL/TP frozen, open SL/TP overwritten), hand-edit rules, stats and cascade through the real SQLite handle (see server/sqlite.integration.test.ts)
- [x] #9 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. server/db.ts fills: insertFills (onConflictDoNothing), listFillsByAccount (time, id order), getFillCursors -> Map<symbol, max time>
2. trades: upsertTradesByTradeKey (load existing keys; insert new; update existing except openTime/openTimeApprox; SL/TP written only when the incoming record is open, so open->closed freezes the last value and closed rows keep hand edits; missing keys logged [Sync]); getTradeById, listTrades (open first, openTime desc, id desc), listOpenTradeSymbols (distinct exchangeSymbol)
3. updateTradeByHand + exported TradeEditError for rule violations (router maps to BAD_REQUEST); returns undefined when not found
4. writeSyncAttempt / writeSyncFailure / writeSyncSuccess: plain getDb() updates, no own transaction, so they join the caller's runInSqliteTransaction
5. getTradeStats: decimal strings via \_core/decimal (money unrounded sums, ratios scale 4, null on zero denominator); win rate/PF/expectancy/streak over closed trades; Σ realizedPnlUsd and Σ feeUsd over all trades (open rows hold realized partials)
6. deleteAccountCascade via subquery deletes in one runInSqliteTransaction; toPublicAccount(row) with apiKeyTail (null when no key) using decrypt from agents/secrets
7. server/trade.db.test.ts via subprocess runNodeEval pattern
8. format (touched files only), check, test
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

DB layer for exchange sync in server/db.ts (plain exported functions, no router changes).

- Fills: insertFills (onConflictDoNothing on accountId/symbol/fillId), listFillsByAccount (time, id), getFillCursors -> Map<symbol, max time>.
- Trades: upsertTradesByTradeKey merges by tradeKey without deleting rows; openTime/openTimeApprox written on insert only; SL/TP written only when the incoming record is open, so open->closed freezes the last live value and closed rows keep hand edits; stored keys missing from records are logged [Sync] and kept. getTradeById, listTrades (open first, openTime desc, id desc), listOpenTradeSymbols.
- updateTradeByHand enforces closed-only SL/TP and approx-only openTime (sets openTimeApprox false); violations throw the new exported TradeEditError for the router to map to BAD_REQUEST; missing trade returns undefined.
- writeSyncAttempt / writeSyncFailure / writeSyncSuccess are single UPDATEs with no own transaction, so they join the caller's runInSqliteTransaction.
- getTradeStats returns TradeStats via \_core/decimal: counts, winRate / profitFactor / exposureRatio (scale 4), expectancyUsd (scale 2), losingStreak, Σ realizedPnlUsd and Σ feeUsd over all trades (open rows hold partial realized PnL), open count and exposure; null on zero denominators.
- deleteAccountCascade deletes messages, conversations, trades, fills and the account via subqueries in one runInSqliteTransaction; toPublicAccount strips key ciphertexts and adds apiKeyTail (null without a key).

Deviation from AC #2 wording: SL/TP freeze keys off the incoming record's status, not the stored status, because reconstruct emits null SL/TP for closed records and the stored-status rule would wipe them on the closing sync.

Notes: db.ts now imports decrypt from agents/secrets (which imports db.ts); the cycle is call-time only. Sync writes do not bump updatedAt; hand edits do.

Tests: server/trade.db.test.ts (5 cases, real SQLite via subprocess) covers fills, merge rules, list order + hand-edit rules, stats + sync state, cascade + toPublicAccount; mutation-checked the SL/TP freeze. npm run check and npm run test (462) pass.

<!-- SECTION:FINAL_SUMMARY:END -->
