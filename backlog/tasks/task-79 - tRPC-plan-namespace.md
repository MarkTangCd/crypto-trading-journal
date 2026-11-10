---
id: TASK-79
title: tRPC plan namespace
status: To Do
assignee: []
created_date: '2026-11-10 06:50'
updated_date: '2026-11-10 06:51'
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
- [ ] #1 plan.list, get, symbolSuggestions, create, update, addScenario, updateScenario, deleteScenario, addObservation, updateObservation, deleteObservation, close, reopen and delete exist with the spec's inputs; outcome is not an input of updateScenario; create returns { id }
- [ ] #2 Symbol input is trimmed, uppercased and checked with TRADING_PAIR_RE, else BAD_REQUEST; scenario name trimmed 1..SCENARIO_NAME_MAX; side and primaryTimeFrame are enums of SCENARIO_SIDES / SCENARIO_TIME_FRAMES; rich text is richTextDocSchema (nullable for marketContext and scenario content)
- [ ] #3 Unknown or foreign plan or child id → NOT_FOUND; every write to a closed plan except reopen and delete → CONFLICT; close on a closed plan and reopen on an open plan → CONFLICT
- [ ] #4 close requires verdict scenario ids to equal the plan's scenario ids exactly (missing, extra or duplicate → BAD_REQUEST); a plan with zero scenarios closes with verdicts []
- [ ] #5 addObservation and updateObservation reject isEmptyDoc content with BAD_REQUEST
- [ ] #6 server/plan.test.ts uses appRouter.createCaller with vi.mock("./db") (goal.test.ts pattern) and covers every rule above
- [ ] #7 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
