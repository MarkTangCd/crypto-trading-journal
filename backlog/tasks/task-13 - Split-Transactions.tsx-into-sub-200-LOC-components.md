---
id: TASK-13
title: Split Transactions.tsx into sub-200 LOC components
status: Done
assignee:
  - "@myself"
created_date: "2026-06-18 03:51"
updated_date: "2026-06-18 08:02"
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

- [x] #1 client/src/pages/Transactions.tsx ≤ 200 LOC
- [x] #2 client/src/components/transactions/TransactionsFilters.tsx and TransactionsTable.tsx each ≤ 200 LOC; DeleteTradeDialog.tsx ≤ 80 LOC
- [x] #3 Every exported function in the new files ≤ 100 LOC
- [x] #4 npm run check, npm test -- --run (104 passed), npm run test:e2e, npm run build all exit 0
- [ ] #5 git status shows changes only in the in-scope files plus plans/README.md
- [x] #6 plans/README.md row for plan 010 set to DONE
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Created TransactionsFilters, DeleteTradeDialog, and draft TransactionsTable. TransactionsTable exceeds 200 LOC with row inline; using plan escape hatch to extract TransactionRow.tsx. Reverted unintended Prettier formatting on backlog/plan files; will format only in-scope files going forward.

All verification commands passed: check, test (104), test:e2e, build. LOC budgets met. Note: created TransactionRow.tsx as a fourth component file because the row rendering could not fit within TransactionsTable.tsx's 200 LOC ceiling; this follows plan 010's escape hatch for extracting a row helper/file.

<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Split client/src/pages/Transactions.tsx (599 → 186 LOC) into client/src/components/transactions/{TransactionsFilters,TransactionsTable,TransactionRow,DeleteTradeDialog}.tsx. Preserved all aria-labels, roles, and button texts relied on by e2e/smoke.spec.ts. All verification commands pass: npm run check, npm test -- --run (104 passed), npm run test:e2e, npm run build. Updated plans/README.md row 010 to DONE.

<!-- SECTION:FINAL_SUMMARY:END -->
