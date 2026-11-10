---
id: TASK-79
title: tRPC plan namespace
status: Done
assignee:
  - '@myself'
created_date: '2026-11-10 06:50'
updated_date: '2026-11-10 09:53'
labels:
  - ready-for-agent
dependencies:
  - TASK-77
references:
  - backlog/docs/doc-6 - Trading-plan-spec.md
ordinal: 79000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-6, section tRPC surface. Flat namespace plan in server/routers.ts, all publicProcedure, reads and writes through the TASK-77 db functions. Open/closed guards live here. update, updateScenario and updateObservation return updatedAt because every autosaving editor sets the saved hh:mm indicator from the mutation result.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 plan.list, get, symbolSuggestions, create, update, addScenario, updateScenario, deleteScenario, addObservation, updateObservation, deleteObservation, close, reopen and delete exist with the spec's inputs; outcome is not an input of updateScenario; create returns { id }
- [x] #2 Symbol input is trimmed, uppercased and checked with TRADING_PAIR_RE, else BAD_REQUEST; scenario name trimmed 1..SCENARIO_NAME_MAX; side and primaryTimeFrame are enums of SCENARIO_SIDES / SCENARIO_TIME_FRAMES; rich text is richTextDocSchema (nullable for marketContext and scenario content)
- [x] #3 Unknown or foreign plan or child id → NOT_FOUND; every write to a closed plan except reopen and delete → CONFLICT; close on a closed plan and reopen on an open plan → CONFLICT
- [x] #4 close requires verdict scenario ids to equal the plan's scenario ids exactly (missing, extra or duplicate → BAD_REQUEST); a plan with zero scenarios closes with verdicts []
- [x] #5 addObservation and updateObservation reject isEmptyDoc content with BAD_REQUEST
- [x] #6 server/plan.test.ts uses appRouter.createCaller with vi.mock("./db") (goal.test.ts pattern) and covers every rule above
- [x] #7 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. server/routers.ts: import Plans db functions, SCENARIO_* constants, richTextDocSchema/isEmptyDoc.
2. Add helpers next to requireOwnedGoal: planSymbol schema (trim, uppercase, TRADING_PAIR_RE), requirePlan (NOT_FOUND), requireOpenPlan (NOT_FOUND / CONFLICT when closed).
3. Add plan router: list, get, symbolSuggestions, create -> { id }, update -> { updatedAt }, addScenario, updateScenario -> { updatedAt }, deleteScenario, addObservation, updateObservation -> { updatedAt }, deleteObservation, close, reopen, delete. Missing child (db returns undefined/false) -> NOT_FOUND; empty observation doc -> BAD_REQUEST; close checks verdict ids equal scenario ids exactly.
4. server/plan.test.ts with vi.mock("./db") covering symbol normalisation, NOT_FOUND, CONFLICT on every closed write, close verdict validation, close/reopen state conflicts, isEmptyDoc rejection.
5. format, check, test.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Add the plan tRPC namespace in server/routers.ts.

- 14 publicProcedures (list, get, symbolSuggestions, create, update, add/update/deleteScenario, add/update/deleteObservation, close, reopen, delete) over the TASK-77 db functions.
- Helpers: planSymbol (trim, uppercase, TRADING_PAIR_RE), scenarioName (trimmed 1..SCENARIO_NAME_MAX), observationContent (richTextDocSchema refined by !isEmptyDoc), requirePlan (NOT_FOUND), requireOpenPlan (CONFLICT when closed), notFound.
- create returns { id }; update, updateScenario and updateObservation return { updatedAt }; add* return the new row; delete*, close and reopen return { success: true }.
- close checks verdict ids equal the plan's scenario ids exactly (missing, extra, duplicate, foreign -> BAD_REQUEST); zero scenarios close with []. reopen on an open plan -> CONFLICT; delete allowed open or closed.
- Guard and write are not atomic (router-level guards per spec; single-user local app).

Tests: server/plan.test.ts (53 cases, vi.mock("./db") + createCaller). npm run check and full npm run test (499) pass.
<!-- SECTION:FINAL_SUMMARY:END -->
