---
id: TASK-12
title: Drop dead users.initialBalance column and related db helpers
status: To Do
assignee: []
created_date: '2026-06-18 03:51'
labels:
  - tech-debt
  - migration
  - server
dependencies: []
documentation:
  - plans/009-drop-users-initial-balance-column.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implementation plan: plans/009-drop-users-initial-balance-column.md. Remove users.initialBalance from drizzle/schema.ts, add the 0007 ALTER TABLE DROP COLUMN migration with journal + snapshot updates, delete updateUserInitialBalance and getUserById from server/db.ts, and clean up the four test files that mock these dead helpers. Follow the plan file step-by-step.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 drizzle/schema.ts no longer declares initialBalance on the users table
- [ ] #2 drizzle/0007_drop_users_initial_balance.sql exists with the ALTER TABLE DROP COLUMN statement; drizzle/meta/_journal.json adds the matching entry; drizzle/meta/0007_snapshot.json omits the initialBalance column
- [ ] #3 server/db.ts no longer exports updateUserInitialBalance or getUserById; grep finds zero references in client/server/shared
- [ ] #4 Test mock fixtures for these helpers are removed from transaction.test.ts, account.test.ts, transaction.lifecycle.test.ts, and sqlite.integration.test.ts (deleting test cases only when they lose all meaning, ≤3 deletions)
- [ ] #5 npm run check, npm test -- --run (N ≥ 101 passed), npm run test:e2e all exit 0
- [ ] #6 Step-9 smoke test (boot server + curl account.list) succeeds against a real DB after the migration applies
- [ ] #7 plans/README.md row for plan 009 set to DONE
<!-- AC:END -->
