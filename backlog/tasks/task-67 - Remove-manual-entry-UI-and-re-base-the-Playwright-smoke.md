---
id: TASK-67
title: Remove manual-entry UI and re-base the Playwright smoke
status: Done
assignee:
  - '@myself'
created_date: '2026-11-04 12:43'
updated_date: '2026-11-05 13:27'
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
- [x] #1 Deleted: client/src/pages/NewTransaction.tsx, Transactions.tsx, TransactionDetail.tsx, components/new-transaction/, components/close-trade/, components/transactions/, and their routes and nav items
- [x] #2 PreTrade page no longer offers convert to transaction; PositionSizeCalculator default balance reads the selected account's balanceUsdt (— when null) instead of transaction.getFormDefaults
- [x] #3 No client file references trpc.transaction, transactionId, initialBalance or /transactions
- [x] #4 e2e/smoke.spec.ts renders Dashboard, Trades and Accounts in the never-synced state without network and asserts the nothing synced yet / never synced copy; devbox run -- npm run test:e2e passes
- [x] #5 devbox run -- npm run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Delete NewTransaction/Transactions/TransactionDetail pages and components/new-transaction, close-trade, transactions; drop /transactions routes (nav already has no Transactions item).
2. After deletion, find client modules (lib/hooks) only the deleted code used and remove them; fix stale comments naming the deleted pages.
3. PreTrade: remove the 'convert to transaction' link and convertQuery.
4. PositionSizeCalculator: default capital from selectedAccount.balanceUsdt (show — when null) instead of trpc.transaction.getFormDefaults.
5. e2e: playwright webServer runs a dedicated dev server on :3100 against .tmp/e2e.sqlite, seeded by e2e/seed.ts with one account (apiKey null, lastSyncedAt null) so autoSync never runs and no network is touched. smoke.spec.ts visits /, /trades, /accounts and asserts never synced / nothing synced yet copy.
6. format, check, test, test:e2e; grep AC3.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removes the manual-entry client (decision-2) and re-bases the e2e smoke.

- Deleted NewTransaction / Transactions / TransactionDetail pages, components/new-transaction, close-trade, transactions and the /transactions/* routes; also dropped modules only they used (lib/closePreview, hooks/useDebouncedKlines, components/CandlestickChart).
- PreTrade: removed the convert-to-transaction link.
- PositionSizeCalculator: capital defaults to selectedAccount.balanceUsdt; placeholder — when null. No more trpc.transaction.getFormDefaults.
- e2e: playwright webServer starts a dedicated server on :3100 against a fresh .tmp/e2e.sqlite seeded by e2e/seed.ts (one account, apiKey null, never synced -> ineligible for auto-sync, no network). Smoke asserts never synced on Dashboard/Accounts and nothing synced yet on Trades. Uses a port check instead of url because HTTP_PROXY made Playwright's url probe report the port as used.

Checks: npm run check, npm run test (485 passed), npm run test:e2e (1 passed). lightweight-charts dependency may now be unused (CandlestickChart was its consumer); left in package.json.
<!-- SECTION:FINAL_SUMMARY:END -->
