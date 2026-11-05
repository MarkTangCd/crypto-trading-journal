---
id: TASK-40
title: "Add trading goals: /goals page, Dashboard open-goals strip, mark done"
status: Done
assignee:
  - "@myself"
created_date: "2026-11-03 01:05"
updated_date: "2026-11-03 01:11"
labels:
  - ready-for-agent
dependencies: []
references:
  - GLOSSARY.md
documentation:
  - backlog/docs/doc-2 - Goals-spec.md
ordinal: 40000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Let the trader record short free-text near-term goals, see open goals at the top of the Dashboard, and tick them off. All design decisions are locked in the Goals spec (backlog/docs/doc-2 - Goals-spec.md) and vocabulary in GLOSSARY.md; implement exactly that, do not reopen decisions.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 goals table added to drizzle/schema.ts per spec (userId, text, completedAt nullable, createdAt, updatedAt); migration generated; Goal/InsertGoal exported from shared/types.ts
- [x] #2 server/db.ts exposes createGoal, listGoalsByUserId (createdAt asc), getGoalById, updateGoal, deleteGoal as plain functions, all filtered by userId
- [x] #3 tRPC goal router with list, create, update, setDone, delete; text trimmed and limited to 1..200 chars with BAD_REQUEST on violation; NOT_FOUND on ids not owned by the user
- [x] #4 /goals page: add input, open section with mark-done / inline edit / delete, done section with reopen / delete, explicit empty state for open goals; AlertDialog confirm on delete; toasts and goal.list invalidation on every mutation
- [x] #5 Sidebar entry Goals at /goals placed between Dashboard and Transactions; route registered in App.tsx
- [x] #6 Dashboard renders a goals section above the balance hero listing all open goals with a mark-done checkbox, independent of the selected account and of stats loading; empty state is one muted line linking to /goals
- [x] #7 Visuals follow DESIGN.md: no cards or shadows, lowercase labels, hairline row borders, no colored side-stripes
- [x] #8 server/goal.test.ts covers create validation, list ordering, setDone toggling, and ownership rejection; devbox run -- npm run format, check, and test all pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. drizzle/schema.ts: add goals table + Goal/InsertGoal types; re-export in shared/types.ts; devbox run -- npm run db:push to generate migration
2. server/db.ts: createGoal, listGoalsByUserId, getGoalById, updateGoal, deleteGoal
3. server/routers.ts: goal router (list/create/update/setDone/delete) with requireOwnedGoal
4. server/goal.test.ts following account.test.ts vi.mock pattern
5. client: pages/Goals.tsx, route in App.tsx, sidebar item in DashboardLayout.tsx
6. Dashboard.tsx: goals section above balance hero
7. devbox run -- npm run format && npm run check && npm run test
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Adds user-level trading goals per Goals spec (doc-2).

Backend: goals table (drizzle/schema.ts, migration 0011) with status derived from completedAt; plain db functions createGoal / getGoalById / listGoalsByUserId (createdAt asc) / updateGoal / deleteGoal; tRPC goal router (list, create, update, setDone, delete) with trimmed 1..200 char text, BAD_REQUEST on empty, NOT_FOUND on unowned ids. server/goal.test.ts: 11 tests.

Frontend: /goals page (add input, open rows with mark-done / inline edit / del, done rows with reopen / del, AlertDialog on delete, toasts + goal.list invalidation); sidebar entry Goals between Dashboard and Transactions; Dashboard split into OpenGoals strip (above the balance hero, independent of account stats) + AccountStats.

Verified: npm run check and npm run test (380 tests) pass; all five procedures smoke-tested against the running dev server; Dashboard and /goals screenshotted via Playwright.

<!-- SECTION:FINAL_SUMMARY:END -->
