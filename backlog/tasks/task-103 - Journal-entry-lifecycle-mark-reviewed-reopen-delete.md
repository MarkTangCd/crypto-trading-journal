---
id: TASK-103
title: 'Journal entry lifecycle: mark reviewed, reopen, delete'
status: To Do
assignee: []
created_date: '2026-11-13 14:30'
labels:
  - ready-for-agent
dependencies:
  - TASK-102
references:
  - backlog/docs/doc-8 - Trade-journal-spec.md
ordinal: 103000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-8, Locked decisions 3 and 6 and the footer under Pages → /journal/:id.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Footer across both pages: 'mark reviewed →' filled ink, disabled with 'after every linked trade closes' while trades are open
- [ ] #2 Reviewed entry: every field, slot, setups and linked trades read-only (editors setEditable false); footer shows 'reviewed <day hh:mm> · reopen'; reopen restores editing with all content kept
- [ ] #3 'delete entry' at the right behind a confirmation dialog, then back to /journal; the trades show again in the picker
- [ ] #4 Verified on the :3100 temp-DB dev server against prototype variant B (branch prototype/journal-ui, VariantB.tsx); explicit empty/loading states; failures toast.error, no success toasts
- [ ] #5 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
