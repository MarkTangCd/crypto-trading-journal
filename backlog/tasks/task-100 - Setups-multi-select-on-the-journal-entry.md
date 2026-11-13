---
id: TASK-100
title: Setups multi-select on the journal entry
status: To Do
assignee: []
created_date: '2026-11-13 14:29'
labels:
  - ready-for-agent
dependencies:
  - TASK-95
  - TASK-99
references:
  - backlog/docs/doc-8 - Trade-journal-spec.md
ordinal: 100000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-8, Client → Shared pieces (popover) and the left page's setups multi-select.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 client/src/components/ui/popover.tsx added as the shadcn popover over @radix-ui/react-popover (version range in the style of the other radix packages)
- [ ] #2 Multi-select beside the emotion select: checkbox list of setups by name, saves via journal.setSetups on change; inline '+ new setup' creates via setup.create then links it; errors inline/toast
- [ ] #3 Verified on the :3100 temp-DB dev server against prototype variant B (branch prototype/journal-ui, VariantB.tsx); explicit empty/loading states; failures toast.error, no success toasts
- [ ] #4 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
