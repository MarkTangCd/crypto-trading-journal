---
id: TASK-10
title: Drop dead server/db.ts helpers obsoleted by getAccountSnapshot
status: Done
assignee:
  - "@myself"
created_date: "2026-06-18 03:51"
updated_date: "2026-06-18 07:43"
labels:
  - tech-debt
  - server
dependencies: []
documentation:
  - plans/007-drop-dead-db-helpers.md
priority: medium
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Implementation plan: plans/007-drop-dead-db-helpers.md. Remove the five zero-caller exports from server/db.ts (createTransaction, deleteTransaction, getLastTransaction, getCurrentBalance, getConsecutiveLosses), rewrite the two characterization tests against getAccountSnapshot, and prune the stale vi.mock fixture entries. Follow the plan file step-by-step.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 server/db.ts no longer exports createTransaction, deleteTransaction, getLastTransaction, getCurrentBalance, getConsecutiveLosses
- [x] #2 grep finds no bare references to getCurrentBalance / getConsecutiveLosses anywhere under server/
- [x] #3 The two lifecycle.test.ts characterization tests (open-trade exclusion) are rewritten against getAccountSnapshot with identical assertions
- [x] #4 Mock fixture entries for the deleted helpers are removed from transaction.test.ts, transaction.lifecycle.test.ts, and sqlite.integration.test.ts
- [x] #5 npm run check exits 0 and npm test -- --run reports 104 passed
- [x] #6 plans/README.md row for plan 007 set to DONE
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Dropped five unused helpers from server/db.ts (createTransaction, deleteTransaction, getLastTransaction, getCurrentBalance, getConsecutiveLosses). Rewrote the two open-trade-exclusion characterization tests in server/transaction.lifecycle.test.ts to call getAccountSnapshot directly. Pruned stale mock-fixture entries from server/transaction.test.ts, server/transaction.lifecycle.test.ts, and server/sqlite.integration.test.ts. Updated sqlite.integration.test.ts to read currentBalance from getAccountSnapshot. Verified with npm run check (exit 0) and npm test -- --run (104 passed). Updated plans/README.md plan 007 status to DONE.

<!-- SECTION:FINAL_SUMMARY:END -->
