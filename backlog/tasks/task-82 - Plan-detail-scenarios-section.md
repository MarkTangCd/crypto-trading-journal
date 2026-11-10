---
id: TASK-82
title: 'Plan detail: scenarios section'
status: To Do
assignee: []
created_date: '2026-11-10 06:51'
updated_date: '2026-11-10 06:51'
labels:
  - ready-for-agent
dependencies:
  - TASK-81
references:
  - backlog/docs/doc-6 - Trading-plan-spec.md
ordinal: 82000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-6, section UI → Scenarios. Lives in client/src/components/plans/PlanScenarios.tsx so PlanDetail.tsx changes by one line and this task can run in parallel with TASK-83 (observations). Outcomes are not shown while open; the close flow is TASK-84.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 PlanScenarios.tsx renders under the scenarios header, lettered a, b, c… in id order
- [ ] #2 Each scenario: name edited inline (trimmed, 1..SCENARIO_NAME_MAX), long/short and SCENARIO_TIME_FRAMES as one-click segmented controls saved on change, immediate delete with no confirmation, and its content in PlanEditor autosaving through plan.updateScenario
- [ ] #3 Add-scenario form at the end of the list: name + side + timeframe, plan.addScenario, content starts empty
- [ ] #4 Structured writes invalidate plan.get and plan.list via trpc.useUtils(); failures toast.error; no success toasts; long/short in ink; timeframes keep uppercase H/D
- [ ] #5 Verified on the dev server against a temp copy of the DB on :3100 (see the dev-server UI verification memory), compared with variant A on branch prototype/plans-ui (client/src/components/plans-prototype/VariantA.tsx); read DESIGN.md and PRODUCT.md first
- [ ] #6 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
