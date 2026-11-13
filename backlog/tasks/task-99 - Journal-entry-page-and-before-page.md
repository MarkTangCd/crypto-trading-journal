---
id: TASK-99
title: Journal entry page and before page
status: To Do
assignee: []
created_date: '2026-11-13 14:29'
labels:
  - ready-for-agent
dependencies:
  - TASK-94
  - TASK-97
references:
  - backlog/docs/doc-8 - Trade-journal-spec.md
ordinal: 99000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-8, Locked decisions 7, 8, 9 and Pages → /journal/:id (shell and left page). Setups multi-select and screenshots come in later tasks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Shell: '← journal', quiet 'saved hh:mm', title line symbol with 'date · side(s) · n trades · state'; two pages split by a 1px mist rule at lg, stacked when narrow
- [ ] #2 Left page 'before · planned r:r': planned R:R hero via previewPlannedRiskReward with the earliest trade's side, hint line (formula, invalid reason, or 'enter entry, stop and target'); planned entry / stop loss / take profit inputs saved on blur
- [ ] #3 Emotion select (lowercase, FOMO for fomo, clearable); entry reason, market context, invalidation as RichTextEditor with owner { kind: 'journal_entry', id }, autosave ~1 s without invalidating journal.get
- [ ] #4 Verified on the :3100 temp-DB dev server against prototype variant B (branch prototype/journal-ui, VariantB.tsx); explicit empty/loading states; failures toast.error, no success toasts
- [ ] #5 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
