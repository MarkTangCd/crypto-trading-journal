---
id: TASK-12
title: Drop dead users.initialBalance column and related db helpers
status: Done
assignee:
  - "@myself"
created_date: "2026-06-18 03:51"
updated_date: "2026-06-18 07:43"
labels:
  - tech-debt
  - migration
  - server
dependencies: []
documentation:
  - plans/009-drop-users-initial-balance-column.md
priority: medium
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Implementation plan: plans/009-drop-users-initial-balance-column.md. Remove users.initialBalance from drizzle/schema.ts, add the 0007 ALTER TABLE DROP COLUMN migration with journal + snapshot updates, delete updateUserInitialBalance and getUserById from server/db.ts, and clean up the four test files that mock these dead helpers. Follow the plan file step-by-step.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 drizzle/schema.ts no longer declares initialBalance on the users table
- [x] #2 drizzle/0007_drop_users_initial_balance.sql exists with the ALTER TABLE DROP COLUMN statement; drizzle/meta/\_journal.json adds the matching entry; drizzle/meta/0007_snapshot.json omits the initialBalance column
- [x] #3 server/db.ts no longer exports updateUserInitialBalance or getUserById; grep finds zero references in client/server/shared
- [x] #4 Test mock fixtures for these helpers are removed from transaction.test.ts, account.test.ts, transaction.lifecycle.test.ts, and sqlite.integration.test.ts (deleting test cases only when they lose all meaning, ≤3 deletions)
- [x] #5 npm run check, npm test -- --run (N ≥ 101 passed), npm run test:e2e all exit 0
- [x] #6 Step-9 smoke test (boot server + curl account.list) succeeds against a real DB after the migration applies
- [x] #7 plans/README.md row for plan 009 set to DONE
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Dropped the dead users.initialBalance column and related helpers. Removed the column from drizzle/schema.ts, added migration 0007 (ALTER TABLE users DROP COLUMN initialBalance) with journal + snapshot updates, deleted updateUserInitialBalance and getUserById from server/db.ts, and cleaned up mock fixtures/call sites in transaction.test.ts, account.test.ts, transaction.lifecycle.test.ts, and sqlite.integration.test.ts. Verified with npm run check (0), npm test -- --run (104 passed), npm run test:e2e (1 passed), and a real-DB smoke test where account.list returned OK after the migration applied. Updated plans/README.md row 009 to DONE.

<!-- SECTION:FINAL_SUMMARY:END -->
