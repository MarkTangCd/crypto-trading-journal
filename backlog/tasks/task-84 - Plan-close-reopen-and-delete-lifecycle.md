---
id: TASK-84
title: 'Plan close, reopen and delete lifecycle'
status: To Do
assignee: []
created_date: '2026-11-10 06:51'
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
- [ ] #1 Footer while open: 'close plan →' (filled ink) and 'delete plan'; a closed plan shows 'reopen plan' and 'delete plan'
- [ ] #2 Close opens an inline section replacing the footer: one triggered / invalidated toggle per scenario, pre-filled from stored outcomes after a reopen, a 'k of n verdicts' counter, 'close plan' disabled until complete, and 'cancel'; a zero-scenario plan closes directly with verdicts []
- [ ] #3 A closed plan is fully read-only: editors not editable, symbol, segmented controls, inline name edits, add-scenario form, composer and deletes unavailable; each scenario shows its outcome glyph and word next to its name, in ink, never win/loss hues
- [ ] #4 'reopen plan' calls plan.reopen and restores editing; outcomes are hidden again while open
- [ ] #5 'delete plan' opens a confirmation dialog naming the scenario and observation counts, then calls plan.delete and navigates to /plans
- [ ] #6 Writes invalidate plan.get and plan.list; failures toast.error; no success toasts
- [ ] #7 Verified on the dev server against a temp copy of the DB on :3100 (see the dev-server UI verification memory), compared with variant A on branch prototype/plans-ui (client/src/components/plans-prototype/VariantA.tsx); read DESIGN.md and PRODUCT.md first; full lifecycle exercised: create, add scenarios and an observation, close with verdicts, reopen (verdicts pre-filled), add a scenario, re-close, delete
- [ ] #8 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
