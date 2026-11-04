---
id: TASK-67
title: Remove manual-entry UI and re-base the Playwright smoke
status: To Do
assignee: []
created_date: '2026-11-04 12:43'
updated_date: '2026-11-04 12:45'
labels:
  - ready-for-agent
dependencies:
  - TASK-64
  - TASK-65
  - TASK-66
references:
  - backlog/docs/doc-4 - Exchange-sync-spec.md
ordinal: 67000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-2: manual entry is removed entirely. Client-side half of the removal; the server namespace is dropped in the next task so this one compiles on its own.

e2e: the current smoke (create account, log open trade, close it) exercises the removed flow. Replace it with a no-network smoke that links nothing and checks the never-synced states; a fuller dev/e2e strategy (recorded fixtures vs demo testnet) is still map fog.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Deleted: client/src/pages/NewTransaction.tsx, Transactions.tsx, TransactionDetail.tsx, components/new-transaction/, components/close-trade/, components/transactions/, and their routes and nav items
- [ ] #2 PreTrade page no longer offers convert to transaction; PositionSizeCalculator default balance reads the selected account's balanceUsdt (— when null) instead of transaction.getFormDefaults
- [ ] #3 No client file references trpc.transaction, transactionId, initialBalance or /transactions
- [ ] #4 e2e/smoke.spec.ts renders Dashboard, Trades and Accounts in the never-synced state without network and asserts the nothing synced yet / never synced copy; devbox run -- npm run test:e2e passes
- [ ] #5 devbox run -- npm run check passes
<!-- AC:END -->
