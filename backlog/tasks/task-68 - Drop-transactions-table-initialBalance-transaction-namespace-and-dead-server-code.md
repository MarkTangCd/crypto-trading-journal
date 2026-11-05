---
id: TASK-68
title: >-
  Drop transactions table, initialBalance, transaction namespace and dead server
  code
status: Done
assignee:
  - '@myself'
created_date: '2026-11-04 12:43'
updated_date: '2026-11-05 13:48'
labels:
  - ready-for-agent
dependencies:
  - TASK-67
references:
  - backlog/docs/doc-4 - Exchange-sync-spec.md
ordinal: 68000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-2 and spec doc-4 section Dropped. Server-side half of the removal; final migration tightens the schema to the spec.

Current DB holds 0 transactions, so no data migration.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 drizzle/schema.ts: transactions table removed; accounts.initialBalance removed; accounts.apiKey and apiSecret NOT NULL; conversations.transactionId removed and the check becomes exactly-one-of(preTradeId, tradeId); migration generated with db:push, committed, applies to a copy of drizzle/dev.db keeping goals, pre_trades, conversations and messages
- [x] #2 server/routers.ts: transaction namespace removed; runTradeMath wrapper removed if nothing else uses it
- [x] #3 server/db.ts: every transaction-only function removed (getTransactionById, getTransactionsByUserId, updateTransaction, closeOpenTransaction, getAccountSnapshot, getStatistics, assertClosedTradesHaveEndTime, getUniqueTradingPairs, createTransactionWithElements, deleteTransactionWithElements, deleteAccountWithTransactions, getConversationByTransaction); server/\_core/tradeMath.ts keeps only functions still referenced
- [x] #4 shared/types.ts no longer exports Transaction / InsertTransaction; server/transaction.test.ts and server/transaction.lifecycle.test.ts deleted; other tests updated
- [x] #5 rg -n 'transaction' server shared drizzle/schema.ts returns only runInSqliteTransaction and SQL transaction wording
- [x] #6 devbox run -- npm run check, npm run test and npm run format pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Schema: drop transactions table + types, accounts.initialBalance, conversations.transactionId + its index; apiKey/apiSecret NOT NULL; check -> exactly one of (preTradeId, tradeId). Run drizzle-kit generate only (not db:push: its migrate step would hit data/ directly; the server migrates on startup anyway). Hand-prepend DELETE of keyless accounts to the generated SQL.
2. Verify migration on a copy of data/crypto-trading-journal.sqlite with sample goals/pre_trades/conversations/messages rows: they survive, keyless account gone, schema matches.
3. routers.ts: drop transaction namespace, requireOwnedTransaction, runTradeMath and tradeMath imports; remove remaining initialBalance uses.
4. db.ts: remove listed transaction-only functions plus helpers they alone used (decimal helpers, ensureLegacyTransactionContextColumns, transactionId params in conversation fns); index.ts drops the assertClosedTradesHaveEndTime startup check. Dead apiKey === null branches (autoSync eligibility, toPublicAccount) simplified.
5. tradeMath.ts: nothing references it after step 3 -> delete it and its test; fix client plannedRiskReward.ts comment.
6. shared: drop Transaction/InsertTransaction, TRANSACTION_TYPES, MARKET_CYCLES, ALLOWED_TRANSITIONS, TRADE_STATUSES if unused.
7. Tests: delete transaction.test.ts, transaction.lifecycle.test.ts; update sqlite.integration, settings.router, streamRoute, reviewAgent.db and account fixtures needing keys.
8. e2e: seed writes encrypted fake keys; smoke fulfills account.autoSync with [] via page.route so the never-synced account stays offline.
9. CLAUDE.md: update stale lines (main tables, calculated fields, tradeMath error handling).
10. rg check, format, check, test, test:e2e.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Paused 2026-11-05: compareWithMyBaseline still uses transaction reads, so task-69 goes first. Decided: migration deletes keyless accounts (apiKey/apiSecret NULL) before the NOT NULL copy; drizzle/dev.db is a pre-migration legacy DB (no \_\_drizzle_migrations, never migrated), so verify against a copy of data/crypto-trading-journal.sqlite instead.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Server-side half of decision-2: manual entry is gone from schema, API and db layer.

- Schema: transactions table, accounts.initialBalance and conversations.transactionId (+ index) dropped; apiKey/apiSecret NOT NULL; conversations check is exactly one of (preTradeId, tradeId). Migration 0013 generated with drizzle-kit generate (not db:push, whose migrate step would hit data/ directly; the server migrates on startup) and hand-prefixed with a DELETE of keyless accounts.
- Migration verified by a new sqlite.integration test that rebuilds the 0012 schema from the journal, seeds goals / pre_trades / conversations / messages plus a keyless and a keyed account, migrates, and asserts rows kept, keyless account gone, new constraints in force (confirmed it fails without the DELETE). drizzle/dev.db is a pre-migration legacy DB the server never migrates, so it was not used.
- routers.ts: transaction namespace, requireOwnedTransaction and runTradeMath removed.
- db.ts: all transaction-only functions, decimal helpers and the legacy transactions column repair removed; index.ts drops the startup invariant check; dead apiKey === null branches removed (autoSync eligibility, toPublicAccount; PublicAccount.apiKeyTail is now string).
- tradeMath.ts and fixedPoint.ts had no remaining users and were deleted with their tests; shared/const drops TRADE_STATUSES, MARKET_CYCLES, TRANSACTION_TYPES, ALLOWED_TRANSITIONS, FIELD_MUTABILITY.
- Client: AccountContext invalidated trpc.transaction.list (missed in task-67), now trade.list; stale tradeMath comments fixed.
- Tests: transaction*.test.ts deleted; fixtures updated for keyed accounts and tradeId conversations.
- e2e: seed writes encrypted dummy keys; smoke stubs account.autoSync via page.route (verified lastSyncAttemptAt stays null).
- CLAUDE.md: tables, derived values, error handling and example test path updated.

rg 'transaction' leaves SQL-transaction wording, the on-chain 'estimated-transaction-volume-usd' metric, and the migration test asserting the table is gone. check, test (411), test:e2e pass.
<!-- SECTION:FINAL_SUMMARY:END -->
