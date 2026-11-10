---
id: TASK-84
title: 'Plan close, reopen and delete lifecycle'
status: Done
assignee:
  - '@myself'
created_date: '2026-11-10 06:51'
updated_date: '2026-11-10 12:29'
labels:
  - ready-for-agent
dependencies:
  - TASK-82
  - TASK-83
references:
  - backlog/docs/doc-6 - Trading-plan-spec.md
ordinal: 84000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-6, locked decisions 4 and 5 and section UI → Footer / Close / Closed plan. The close flow is an inline section, not a modal. Completes the Plans feature.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Footer while open: 'close plan →' (filled ink) and 'delete plan'; a closed plan shows 'reopen plan' and 'delete plan'
- [x] #2 Close opens an inline section replacing the footer: one triggered / invalidated toggle per scenario, pre-filled from stored outcomes after a reopen, a 'k of n verdicts' counter, 'close plan' disabled until complete, and 'cancel'; a zero-scenario plan closes directly with verdicts []
- [x] #3 A closed plan is fully read-only: editors not editable, symbol, segmented controls, inline name edits, add-scenario form, composer and deletes unavailable; each scenario shows its outcome glyph and word next to its name, in ink, never win/loss hues
- [x] #4 'reopen plan' calls plan.reopen and restores editing; outcomes are hidden again while open
- [x] #5 'delete plan' opens a confirmation dialog naming the scenario and observation counts, then calls plan.delete and navigates to /plans
- [x] #6 Writes invalidate plan.get and plan.list; failures toast.error; no success toasts
- [x] #7 Verified on the dev server against a temp copy of the DB on :3100 (see the dev-server UI verification memory), compared with variant A on branch prototype/plans-ui (client/src/components/plans-prototype/VariantA.tsx); read DESIGN.md and PRODUCT.md first; full lifecycle exercised: create, add scenarios and an observation, close with verdicts, reopen (verdicts pre-filled), add a scenario, re-close, delete
- [x] #8 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. client/src/components/plans/PlanFooter.tsx (new): footer / close panel / delete dialog. Props: plan (get output), closing, onClosingChange.
   - Open: 'close plan →' (filled ink) + 'delete plan'. Zero scenarios -> plan.close { verdicts: [] } directly; otherwise opens the close panel.
   - Close panel (inline, replaces footer, variant A): 'close the plan' + 'k of n verdicts', one row per scenario (letter · name, side · timeframe) with a local VerdictToggle (● triggered / ○ invalidated, ink), pre-filled from stored outcomes; 'close plan' disabled until complete or pending; 'cancel'.
   - Closed: 'reopen plan' (outlined ink) -> plan.reopen + 'delete plan'.
   - Delete: AlertDialog (Goals pattern) naming symbol, scenario and observation counts; confirm -> plan.delete, navigate to /plans.
2. PlanDetail.tsx: closing state; while closing, scenarios are locked (editable false, no add form) so the verdict set cannot drift; observations stay editable (variant A). Renders PlanFooter.
3. PlanScenarios.tsx: new showOutcomes prop (= plan closed); a read-only row shows '● triggered' / '○ invalidated' in ink next to the name. Hidden while open, including during closing.
4. Read-only closed plan is already in place from TASK-81..83 (static symbol, read-only editors, no inputs, add form, composer, deletes; segmented controls disabled); verify it.
5. Writes invalidate plan.get + plan.list; failures toast.error; no success toasts.
6. Verify full lifecycle on :3100 with a temp DB copy against variant A: create, add scenarios + observation, close with verdicts, reopen (pre-filled), add a scenario, re-close, delete. Prettier on changed files; check; test.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Plan close, reopen and delete lifecycle.

- New client/src/components/plans/PlanFooter.tsx: footer while open ('close plan →' filled ink + 'delete plan'), closed ('reopen plan' outlined ink + 'delete plan'). Zero-scenario plans close directly with verdicts []. Otherwise an inline close panel (variant A) replaces the footer: 'close the plan', 'k of n verdicts', one row per scenario (letter · name, side · timeframe with uppercase H/D kept via normal-case!) with a local VerdictToggle (● triggered / ○ invalidated, ink), pre-filled from stored outcomes; 'close plan' disabled until complete or pending; 'cancel'.
- Delete: AlertDialog (Goals pattern) naming symbol, scenario and observation counts; confirm -> plan.delete, navigate to /plans; plan.get is marked stale without a refetch (the page is still mounted for a tick and would log a NOT_FOUND), plan.list invalidated.
- PlanDetail.tsx: closing state; scenarios locked (editable false, no add form) while verdicts are given so the verdict set cannot drift; observations stay editable (variant A). Renders PlanFooter.
- PlanScenarios.tsx: showOutcomes prop (= closed) shows '● triggered' / '○ invalidated' in ink next to each name; hidden while open, closing included.
- close / reopen invalidate plan.get + plan.list; failures toast.error; no success toasts.

Verified on :3100 with a temp DB copy (Playwright), full lifecycle: create via /plans, add two scenarios and an observation, close panel (scenarios locked, disabled until complete, cancel restores), close with verdicts, closed plan fully read-only with outcomes, plan.list outcomes, reopen hides outcomes and restores editing, add a scenario, re-close (2 of 3 pre-filled), stored outcomes correct, delete dialog with counts -> /plans and gone from list, zero-scenario plan closes directly; no console errors. npm run check and npm run test (499) pass.
<!-- SECTION:FINAL_SUMMARY:END -->
