---
id: TASK-74
title: Break the Trading plan spec into implementation tasks
status: Done
assignee:
  - '@myself'
created_date: '2026-11-10 03:09'
updated_date: '2026-11-10 06:51'
labels:
  - 'wayfinder:grilling'
dependencies:
  - TASK-73
references:
  - backlog/docs/doc-6 - Trading-plan-spec.md
ordinal: 74000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Split the locked Trading plan spec (doc-6) into ordered, ready-for-agent build tasks (additive-first: shared constants + richText helpers incl. SCENARIO_TIME_FRAMES and the TRADING_PAIR_RE move, schema + migration, db functions + db tests, image routes + tests, tRPC plan router + tests, editor component, Plans list page, Plan detail page, nav item), each referencing the spec doc, with the critical path stated. Confirm with the trader that nothing is left to decide, then close the map.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read doc-6 spec and current layout (vitest include, routers TRADING_PAIR_RE uses, nav, App routes)
2. Propose 10 additive-first slices with dependencies; grill the trader on slicing, editor placement, detail-page split, image db ownership, UI verification and map closure
3. Create tasks, wire --depends-on, record on the map
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Ten implementation tasks created from doc-6, TASK-75 to TASK-84, all labelled ready-for-agent and referencing the spec. Slicing confirmed with the trader (all six recommendations accepted). Ordered additive-first so each keeps npm run check and npm run test green on its own.

Server: TASK-75 shared constants + richText helpers (TRADING_PAIR_RE moves to shared; both routers.ts uses import it, PreTradeSetup copy untouched); TASK-76 four tables + one migration; TASK-77 db functions incl. image metadata/bytes + plan.db.test.ts; TASK-78 image routes + node:http tests; TASK-79 tRPC plan namespace + plan.test.ts (update/updateScenario/updateObservation return updatedAt for the saved indicator).
UI: TASK-80 /plans list, nav item, routes with a lazy detail placeholder; TASK-81 detail shell + PlanEditor (Tiptap 3.32.0, paste/drop upload, autosave) + market context; TASK-82 scenarios (PlanScenarios.tsx) and TASK-83 observations (PlanObservations.tsx) in parallel; TASK-84 close/reopen/delete lifecycle. Every UI task is verified on the :3100 temp-DB dev server against variant A.

Critical path 75 → 76 → 77 → 79 → 80 → 81 → 82 → 84; 78 parallels 79, 83 parallels 82. No new fog; existing fog stays for a later effort. Map complete.
<!-- SECTION:FINAL_SUMMARY:END -->
