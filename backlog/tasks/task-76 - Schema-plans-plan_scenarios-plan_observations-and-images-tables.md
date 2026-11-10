---
id: TASK-76
title: 'Schema: plans, plan_scenarios, plan_observations and images tables'
status: Done
assignee:
  - '@myself'
created_date: '2026-11-10 06:49'
updated_date: '2026-11-10 07:42'
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
- [x] #1 drizzle/schema.ts adds plans, plan_scenarios, plan_observations and images with the spec's columns, check constraints (side, primaryTimeFrame, outcome nullable, images.mime) and indexes plans_user_closed_idx, plan_scenarios_plan_idx, plan_observations_plan_created_idx, images_plan_sha_unique (unique) and images_user_idx
- [x] #2 No foreign keys; rich-text columns are text json $type<RichTextDoc>() (plans.marketContext and plan_scenarios.content nullable, plan_observations.content not null); images.bytes is blob mode buffer; plan_scenarios has no position column; images has no updatedAt
- [x] #3 Exactly one drizzle-kit generated migration (npm run db:push) that only creates the new tables and indexes and applies cleanly to a copy of the current dev DB
- [x] #4 Inferred select/insert types exported next to the tables (Plan/InsertPlan, PlanScenario/InsertPlanScenario, PlanObservation/InsertPlanObservation, Image/InsertImage) and reachable through shared/types.ts
- [x] #5 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. drizzle/schema.ts: import blob; import type RichTextDoc from ../shared/richText; add plans, plan_scenarios, plan_observations, images after goals with doc comments, literal-SQL check constraints (trades style) and the spec's indexes; export Plan/InsertPlan, PlanScenario/InsertPlanScenario, PlanObservation/InsertPlanObservation, Image/InsertImage (shared/types.ts already re-exports schema types)
2. Run only drizzle-kit generate (not db:push, whose migrate step writes the live data/ DB; the server applies migrations on startup); confirm 0014 only creates tables + indexes
3. Verify on a scratchpad copy of data/crypto-trading-journal.sqlite: run the app migrator via getDb with DATABASE_URL pointing at the copy, inspect sqlite_master
4. format, check, test
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Four Plans tables in drizzle/schema.ts (spec doc-6 Data model, decision-3).

- plans, plan_scenarios, plan_observations, images with the spec's columns; check constraints plan_scenarios_side_check / _time_frame_check / _outcome_check and images_mime_check as literal SQL (trades style); indexes plans_user_closed_idx, plan_scenarios_plan_idx, plan_observations_plan_created_idx, images_plan_sha_unique (unique), images_user_idx. No FKs, no position, images has no updatedAt.
- Rich-text columns text json $type<RichTextDoc>() via import type from ../shared/richText; images.bytes blob mode buffer.
- Types Plan/InsertPlan, PlanScenario/InsertPlanScenario, PlanObservation/InsertPlanObservation, Image/InsertImage; shared/types.ts already re-exports schema types.
- Migration drizzle/0014_luxuriant_phil_sheldon.sql: only CREATE TABLE / CREATE INDEX.
- Deviation: ran drizzle-kit generate only, not npm run db:push, whose migrate step would write the live data/ DB; the server applies migrations on startup.
- Verified on a scratch copy of data/crypto-trading-journal.sqlite through getDb(): 15 migrations recorded, existing row counts unchanged, all four check constraints and the (planId, sha256) unique index reject bad rows. Live DB untouched.
- check passes; full suite 421 tests pass.
<!-- SECTION:FINAL_SUMMARY:END -->
