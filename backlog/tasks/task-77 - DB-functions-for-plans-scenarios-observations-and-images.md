---
id: TASK-77
title: 'DB functions for plans, scenarios, observations and images'
status: To Do
assignee: []
created_date: '2026-11-10 06:49'
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
- [ ] #1 server/db.ts exports listPlans, getPlan, createPlan, updatePlan, addScenario, updateScenario, deleteScenario, addObservation, updateObservation, deleteObservation, closePlan, reopenPlan, deletePlan, listTradeSymbols, findImageBySha, insertImage and getImage, plus a plan-row ownership lookup the router and image route share
- [ ] #2 listPlans returns open plans by createdAt desc then closed plans by closedAt desc, each with scenarioCount, observationCount and outcomes in scenario id order, using three queries
- [ ] #3 getPlan returns scenarios by id asc and observations by createdAt asc, or undefined for an unknown or foreign plan; child writes filter by id AND planId after the ownership check; updatedAt bumps only on the changed row; observation createdAt is never updated
- [ ] #4 closePlan writes every outcome and closedAt in one runInSqliteTransaction; reopenPlan clears closedAt and keeps outcomes; deletePlan deletes images, observations, scenarios then the plan in one transaction
- [ ] #5 findImageBySha and other metadata reads never select bytes; getImage(userId, imageId) returns mime, sha256 and bytes for the owner only; listTradeSymbols returns distinct trades.symbol sorted
- [ ] #6 server/plan.db.test.ts on a real temp SQLite (trade.db.test.ts pattern) covers list ordering and derived counts/outcomes, atomic close, reopen keeping outcomes, delete cascade including images, user scoping, and the (planId, sha256) unique index
- [ ] #7 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
