---
id: TASK-6
title: Remove dead migrateTransactionStatus migration code
status: To Do
assignee: []
created_date: "2026-06-18 01:24"
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

- [ ] #1 scripts/migrate-transaction-status.ts is deleted
- [ ] #2 server/db.ts no longer exports or defines migrateTransactionStatus
- [ ] #3 server/transaction.lifecycle.test.ts no longer contains the migrateTransactionStatus describe block or its runScenario helper
- [ ] #4 grep finds no "isReviewed" references in server/, scripts/, client/src/
- [ ] #5 npm run check exits 0 and npm run test exits 0 with exactly 3 fewer tests than before
<!-- AC:END -->
