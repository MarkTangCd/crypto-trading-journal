---
id: TASK-68
title: >-
  Drop transactions table, initialBalance, transaction namespace and dead server
  code
status: To Do
assignee: []
created_date: '2026-11-04 12:43'
updated_date: '2026-11-04 12:45'
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
- [ ] #1 drizzle/schema.ts: transactions table removed; accounts.initialBalance removed; accounts.apiKey and apiSecret NOT NULL; conversations.transactionId removed and the check becomes exactly-one-of(preTradeId, tradeId); migration generated with db:push, committed, applies to a copy of drizzle/dev.db keeping goals, pre_trades, conversations and messages
- [ ] #2 server/routers.ts: transaction namespace removed; runTradeMath wrapper removed if nothing else uses it
- [ ] #3 server/db.ts: every transaction-only function removed (getTransactionById, getTransactionsByUserId, updateTransaction, closeOpenTransaction, getAccountSnapshot, getStatistics, assertClosedTradesHaveEndTime, getUniqueTradingPairs, createTransactionWithElements, deleteTransactionWithElements, deleteAccountWithTransactions, getConversationByTransaction); server/_core/tradeMath.ts keeps only functions still referenced
- [ ] #4 shared/types.ts no longer exports Transaction / InsertTransaction; server/transaction.test.ts and server/transaction.lifecycle.test.ts deleted; other tests updated
- [ ] #5 rg -n 'transaction' server shared drizzle/schema.ts returns only runInSqliteTransaction and SQL transaction wording
- [ ] #6 devbox run -- npm run check, npm run test and npm run format pass
<!-- AC:END -->
