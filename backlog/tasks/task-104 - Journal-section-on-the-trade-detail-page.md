---
id: TASK-104
title: Journal section on the trade detail page
status: To Do
assignee: []
created_date: '2026-11-13 14:30'
labels:
  - ready-for-agent
dependencies:
  - TASK-96
  - TASK-97
references:
  - backlog/docs/doc-8 - Trade-journal-spec.md
ordinal: 104000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-8, Locked decision 1 (trade side) and Pages → Trade detail. The trade list gets no new column.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 client/src/pages/TradeDetail.tsx ends with a 'journal' section from journal.forTrade: one row linking to the entry (date, setups, trade count, state)
- [ ] #2 Unlinked trade: 'this trade is not in a journal entry.' with 'new journal entry →' to /journal?new=1&pick=<id>, which opens the picker with that trade ticked
- [ ] #3 Verified on the :3100 temp-DB dev server against prototype variant B (branch prototype/journal-ui, VariantB.tsx); explicit empty/loading states; failures toast.error, no success toasts
- [ ] #4 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
