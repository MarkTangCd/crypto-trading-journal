---
id: TASK-82
title: 'Plan detail: scenarios section'
status: Done
assignee:
  - '@myself'
created_date: '2026-11-10 06:51'
updated_date: '2026-11-10 12:11'
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
- [x] #1 PlanScenarios.tsx renders under the scenarios header, lettered a, b, c… in id order
- [x] #2 Each scenario: name edited inline (trimmed, 1..SCENARIO_NAME_MAX), long/short and SCENARIO_TIME_FRAMES as one-click segmented controls saved on change, immediate delete with no confirmation, and its content in PlanEditor autosaving through plan.updateScenario
- [x] #3 Add-scenario form at the end of the list: name + side + timeframe, plan.addScenario, content starts empty
- [x] #4 Structured writes invalidate plan.get and plan.list via trpc.useUtils(); failures toast.error; no success toasts; long/short in ink; timeframes keep uppercase H/D
- [x] #5 Verified on the dev server against a temp copy of the DB on :3100 (see the dev-server UI verification memory), compared with variant A on branch prototype/plans-ui (client/src/components/plans-prototype/VariantA.tsx); read DESIGN.md and PRODUCT.md first
- [x] #6 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. client/src/components/plans/PlanScenarios.tsx: owns the whole scenarios <section> (SectionHeader 'scenarios · n', list, add form) so PlanDetail.tsx gains one JSX element + import. Props: planId, scenarios (PlanScenario[]), editable (= plan open), onSaved (feeds the 'saved hh:mm' mark).
2. Each scenario row (grid like variant A): letter a, b, c… by id order; name input with draft state, commit on blur/Enter, trimmed, maxLength SCENARIO_NAME_MAX, empty/unchanged reverts; local Segmented (radiogroup) for long/short and SCENARIO_TIME_FRAMES saving on click; 'del' deletes immediately; PlanEditor content autosaving via plan.updateScenario (empty doc -> null, no plan.get invalidation, NOT_FOUND after a delete is not toasted).
3. Add form at the end (open only): name + side (default long) + timeframe (default 1H), 'add scenario →' -> plan.addScenario, name clears on success.
4. Structured writes (name/side/timeframe/add/delete) invalidate plan.get + plan.list and set saved mark; failures toast.error; no success toasts. Ink only; timeframes rendered as-is (1H/4H/12H/1D).
5. Closed plan: no inputs, no add form, no delete, editors read-only; zero scenarios -> 'no scenarios were written.'; outcomes not shown (TASK-84).
6. Verify on :3100 with temp DB copy against variant A; format, check, test.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Plan detail scenarios section.

- New client/src/components/plans/PlanScenarios.tsx owns the whole section (header 'scenarios · n', list, add form); PlanDetail.tsx adds one <PlanScenarios planId scenarios editable onSaved /> element + import.
- Rows lettered a, b, c… in id order (variant A grid). Name: draft input, commit on blur/Enter, trimmed, maxLength SCENARIO_NAME_MAX, empty/unchanged reverts. Side and SCENARIO_TIME_FRAMES as a local Segmented radiogroup (ink, uppercase H/D kept), saved on click. 'del' deletes immediately. Content is a PlanEditor autosaving via plan.updateScenario (empty doc -> null, no plan.get invalidation; a NOT_FOUND from the unmount flush after a delete is not toasted).
- Add form (open plans only): name + side (default long) + timeframe (default 1H) -> plan.addScenario; name clears on success, content starts null.
- Structured writes invalidate plan.get and plan.list and set the 'saved hh:mm' mark; failures toast.error; no success toasts.
- Closed plan: no name inputs, add form or delete, disabled segmented controls, read-only editors; zero scenarios shows 'no scenarios were written.'. Outcomes left to TASK-84.

Verified on :3100 with a temp DB copy (Playwright): add three scenarios, side/timeframe changes, trimmed rename, empty-name revert, content autosave, delete b -> letters a, b after reload, plan.list scenarioCount 2, closed plan read-only, closed zero-scenario message, no console errors. npm run check and npm run test (499) pass.
<!-- SECTION:FINAL_SUMMARY:END -->
