---
id: TASK-10
title: Drop dead server/db.ts helpers obsoleted by getAccountSnapshot
status: To Do
assignee: []
created_date: '2026-06-18 03:51'
labels:
  - tech-debt
  - server
dependencies: []
documentation:
  - plans/007-drop-dead-db-helpers.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implementation plan: plans/007-drop-dead-db-helpers.md. Remove the five zero-caller exports from server/db.ts (createTransaction, deleteTransaction, getLastTransaction, getCurrentBalance, getConsecutiveLosses), rewrite the two characterization tests against getAccountSnapshot, and prune the stale vi.mock fixture entries. Follow the plan file step-by-step.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 server/db.ts no longer exports createTransaction, deleteTransaction, getLastTransaction, getCurrentBalance, getConsecutiveLosses
- [ ] #2 grep finds no bare references to getCurrentBalance / getConsecutiveLosses anywhere under server/
- [ ] #3 The two lifecycle.test.ts characterization tests (open-trade exclusion) are rewritten against getAccountSnapshot with identical assertions
- [ ] #4 Mock fixture entries for the deleted helpers are removed from transaction.test.ts, transaction.lifecycle.test.ts, and sqlite.integration.test.ts
- [ ] #5 npm run check exits 0 and npm test -- --run reports 104 passed
- [ ] #6 plans/README.md row for plan 007 set to DONE
<!-- AC:END -->
