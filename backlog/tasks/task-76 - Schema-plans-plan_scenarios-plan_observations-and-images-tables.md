---
id: TASK-76
title: 'Schema: plans, plan_scenarios, plan_observations and images tables'
status: To Do
assignee: []
created_date: '2026-11-10 06:49'
labels:
  - ready-for-agent
dependencies:
  - TASK-75
references:
  - backlog/docs/doc-6 - Trading-plan-spec.md
ordinal: 76000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-6, section Data model; decision-3 (image BLOBs in SQLite, no foreign keys, cascade in app code). Same conventions as goals / trades.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 drizzle/schema.ts adds plans, plan_scenarios, plan_observations and images with the spec's columns, check constraints (side, primaryTimeFrame, outcome nullable, images.mime) and indexes plans_user_closed_idx, plan_scenarios_plan_idx, plan_observations_plan_created_idx, images_plan_sha_unique (unique) and images_user_idx
- [ ] #2 No foreign keys; rich-text columns are text json $type<RichTextDoc>() (plans.marketContext and plan_scenarios.content nullable, plan_observations.content not null); images.bytes is blob mode buffer; plan_scenarios has no position column; images has no updatedAt
- [ ] #3 Exactly one drizzle-kit generated migration (npm run db:push) that only creates the new tables and indexes and applies cleanly to a copy of the current dev DB
- [ ] #4 Inferred select/insert types exported next to the tables (Plan/InsertPlan, PlanScenario/InsertPlanScenario, PlanObservation/InsertPlanObservation, Image/InsertImage) and reachable through shared/types.ts
- [ ] #5 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
