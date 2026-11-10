---
id: TASK-77
title: 'DB functions for plans, scenarios, observations and images'
status: Done
assignee:
  - '@myself'
created_date: '2026-11-10 06:49'
updated_date: '2026-11-10 07:51'
labels:
  - ready-for-agent
dependencies:
  - TASK-76
references:
  - backlog/docs/doc-6 - Trading-plan-spec.md
ordinal: 77000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-6, sections Derived values and DB functions. Plain exported functions in server/db.ts, every one scoped by userId. Ownership via a separate plans WHERE id AND userId query; no joins through the sqlite-proxy callback (research/plan-image-storage §4.3); .all() / limit(1) and destructure, never drizzle .get() (§1.4). Open/closed guards stay out of the db layer (they belong to the router and the image route).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 server/db.ts exports listPlans, getPlan, createPlan, updatePlan, addScenario, updateScenario, deleteScenario, addObservation, updateObservation, deleteObservation, closePlan, reopenPlan, deletePlan, listTradeSymbols, findImageBySha, insertImage and getImage, plus a plan-row ownership lookup the router and image route share
- [x] #2 listPlans returns open plans by createdAt desc then closed plans by closedAt desc, each with scenarioCount, observationCount and outcomes in scenario id order, using three queries
- [x] #3 getPlan returns scenarios by id asc and observations by createdAt asc, or undefined for an unknown or foreign plan; child writes filter by id AND planId after the ownership check; updatedAt bumps only on the changed row; observation createdAt is never updated
- [x] #4 closePlan writes every outcome and closedAt in one runInSqliteTransaction; reopenPlan clears closedAt and keeps outcomes; deletePlan deletes images, observations, scenarios then the plan in one transaction
- [x] #5 findImageBySha and other metadata reads never select bytes; getImage(userId, imageId) returns mime, sha256 and bytes for the owner only; listTradeSymbols returns distinct trades.symbol sorted
- [x] #6 server/plan.db.test.ts on a real temp SQLite (trade.db.test.ts pattern) covers list ordering and derived counts/outcomes, atomic close, reopen keeping outcomes, delete cascade including images, user scoping, and the (planId, sha256) unique index
- [x] #7 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. server/db.ts: new '// ============ Plans ============' section after Goals; import plans, planScenarios, planObservations, images + types
2. getPlanRow(userId, planId) -> Plan | undefined (the shared ownership lookup)
3. listPlans(userId) -> PlanListItem[] (Plan + scenarioCount, observationCount, outcomes by scenario id): 3 queries (plans ordered closedAt is null desc, closedAt desc, createdAt desc, id desc; scenarios (id, planId, outcome) inArray; observation counts grouped by planId)
4. getPlan -> PlanDetail (Plan + scenarios id asc + observations createdAt asc, id asc) | undefined
5. createPlan, updatePlan (bumps updatedAt) -> Plan | undefined
6. add/update/deleteScenario and add/update/deleteObservation: getPlanRow first, then filter id AND planId; return the row (or boolean for delete), undefined/false when not found; updateScenario patch excludes outcome; observation createdAt never written by updates
7. closePlan(userId, planId, verdicts) in runInSqliteTransaction: ownership, write each outcome (+ scenario updatedAt), set closedAt/updatedAt; reopenPlan clears closedAt only; deletePlan in transaction: images, observations, scenarios, plan -> boolean
8. listTradeSymbols(userId): selectDistinct trades.symbol order asc
9. findImageBySha -> { id } | undefined, insertImage(InsertImage) -> { id } (unique violation propagates), getImage(userId, id) -> { mime, sha256, bytes } | undefined; metadata reads never select bytes
10. server/plan.db.test.ts (trade.db.test.ts runCase pattern): ordering + counts/outcomes, close atomic + reopen keeps outcomes, child writes scoped to planId, delete cascade incl images, user scoping, image dedupe unique + bytes round-trip
11. format, check, test
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Plan and image DB functions in server/db.ts (spec doc-6 Derived values / DB functions).

- New Plans section after Goals: getPlanRow (shared ownership lookup), listPlans -> PlanListItem (scenarioCount, observationCount, outcomes in scenario id order; three queries, no joins), getPlan -> PlanDetail (scenarios id asc, observations createdAt asc then id), createPlan, updatePlan, add/update/deleteScenario, add/update/deleteObservation, closePlan, reopenPlan, deletePlan, listTradeSymbols; Plan images section: findImageBySha, insertImage, getImage.
- Child writes check ownership with getPlanRow, then filter id AND planId; not found -> undefined (add/update) or false (delete). updateScenario has no outcome; updateObservation never writes createdAt.
- closePlan writes every outcome (plus scenario updatedAt) and closedAt in one runInSqliteTransaction; reopenPlan clears closedAt only; deletePlan removes images, observations, scenarios, plan in one transaction.
- Exports ScenarioOutcome, PlanListItem, PlanDetail for the router.
- Choices beyond the spec: ownership is checked in the db functions as well as (later) the router, one extra query per write; listPlans returns stored outcomes for open plans too, the client shows them only when closed; insertImage lets the unique violation propagate for the route to re-select.
- server/plan.db.test.ts: 6 integration cases on temp SQLite (list order + counts/outcomes + user scope, detail order + cross-plan/foreign child writes, atomic close with rollback on a bad verdict + reopen keeps outcomes, delete cascade incl images without touching another plan, image dedupe/owner-only/bytes round-trip, distinct trade symbols).
- check passes; full suite 427 tests pass.
<!-- SECTION:FINAL_SUMMARY:END -->
