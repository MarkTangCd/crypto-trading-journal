---
id: TASK-13
title: Split Transactions.tsx into sub-200 LOC components
status: To Do
assignee: []
created_date: '2026-06-18 03:51'
labels:
  - tech-debt
  - refactor
  - frontend
dependencies: []
documentation:
  - plans/010-split-transactions-page.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implementation plan: plans/010-split-transactions-page.md. Slim client/src/pages/Transactions.tsx (599 LOC) under the 200 LOC ceiling by extracting TransactionsFilters, TransactionsTable, and DeleteTradeDialog under client/src/components/transactions/, preserving every aria-label / role / button text that the Playwright smoke spec depends on. Follow the plan file step-by-step.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 client/src/pages/Transactions.tsx ≤ 200 LOC
- [ ] #2 client/src/components/transactions/TransactionsFilters.tsx and TransactionsTable.tsx each ≤ 200 LOC; DeleteTradeDialog.tsx ≤ 80 LOC
- [ ] #3 Every exported function in the new files ≤ 100 LOC
- [ ] #4 npm run check, npm test -- --run (104 passed), npm run test:e2e, npm run build all exit 0
- [ ] #5 git status shows changes only in the in-scope files plus plans/README.md
- [ ] #6 plans/README.md row for plan 010 set to DONE
<!-- AC:END -->
