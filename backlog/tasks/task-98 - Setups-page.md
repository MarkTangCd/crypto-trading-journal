---
id: TASK-98
title: Setups page
status: To Do
assignee: []
created_date: '2026-11-13 14:29'
labels:
  - ready-for-agent
dependencies:
  - TASK-94
  - TASK-95
  - TASK-97
references:
  - backlog/docs/doc-8 - Trade-journal-spec.md
ordinal: 98000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-8, Locked decision 11 and Pages → /journal/setups.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 /journal/setups master-detail: inline create (enter, errors inline) and the list with usage counts; selected setup with name (save on blur, uniqueness/length errors inline), 'used by n entries', trigger chips (enter to add, × to remove), RichTextEditor description with owner { kind: 'setup', id }
- [ ] #2 'delete setup' disabled with 'used by n entries; untag them first' while in use, else deletes behind a confirmation
- [ ] #3 Verified on the :3100 temp-DB dev server against prototype variant B (branch prototype/journal-ui, VariantB.tsx); explicit empty/loading states; failures toast.error, no success toasts
- [ ] #4 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
