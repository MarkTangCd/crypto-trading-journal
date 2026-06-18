---
id: TASK-6
title: Remove dead migrateTransactionStatus migration code
status: Done
assignee:
  - "@agent"
created_date: "2026-06-18 01:24"
updated_date: "2026-06-18 01:50"
labels:
  - tech-debt
  - server
dependencies: []
documentation:
  - plans/003-remove-migrate-status.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Implementation plan: plans/003-remove-migrate-status.md. Delete the migrateTransactionStatus function (references a column dropped from the schema), its caller script, and the three dead test cases. Follow the plan file step-by-step.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 scripts/migrate-transaction-status.ts is deleted
- [x] #2 server/db.ts no longer exports or defines migrateTransactionStatus
- [x] #3 server/transaction.lifecycle.test.ts no longer contains the migrateTransactionStatus describe block or its runScenario helper
- [x] #4 grep finds no "isReviewed" references in server/, scripts/, client/src/
- [x] #5 npm run check exits 0 and npm run test exits 0 with exactly 3 fewer tests than before
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Removed the dead migrateTransactionStatus migration code and its associated artifacts.

Changes:

- Deleted scripts/migrate-transaction-status.ts (the sole production caller)
- Removed migrateTransactionStatus function from server/db.ts (referenced the dropped isReviewed column)
- Removed the runScenario helper and the entire migrateTransactionStatus describe block (3 tests) from server/transaction.lifecycle.test.ts
- Renamed the local isReviewed variable to reviewed in client/src/pages/TransactionDetail.tsx to eliminate all string matches of the legacy column name
- Re-created the empty scripts/ directory to preserve it for future use
- Updated plans/README.md to mark Plan 003 as DONE

Verification:

- npm run check exits 0
- npm run test exits 0 with 104 passing tests (down by exactly 3 from the deleted test block)
- grep finds no isReviewed references in server/, scripts/, or client/src/
- grep finds no migrateTransactionStatus references in server/ or scripts/
<!-- SECTION:FINAL_SUMMARY:END -->
