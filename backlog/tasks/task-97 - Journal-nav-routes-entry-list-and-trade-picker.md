---
id: TASK-97
title: 'Journal nav, routes, entry list and trade picker'
status: To Do
assignee: []
created_date: '2026-11-13 14:28'
labels:
  - ready-for-agent
dependencies:
  - TASK-96
references:
  - backlog/docs/doc-8 - Trade-journal-spec.md
ordinal: 97000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-8, sections Locked decisions 1, 7, 12 and Pages → /journal and Picker. Read DESIGN.md and PRODUCT.md first. The entry and setups pages are lazy placeholders here.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Sidebar order Goals → Plans → Trades → Journal → Pre-Trade; routes /journal, /journal/setups, /journal/:id in App.tsx (setups before :id), the last two React.lazy placeholders
- [ ] #2 /journal: title, 'n entries · m to review', header 'setups' and 'new entry →'; column table date (UTC+8) · symbol (· account when not selected) · side(s) 'short / long' · setups ('—') · trades · net pnl · state ('● to review' / '● n open' / muted 'reviewed'); rows link; tabular numerals
- [ ] #3 Picker replaces the table in place ('new entry →', ?new=1, ?pick=<tradeId> preselects): symbol search, checkbox column, opened · symbol · status · position · pnl; other symbols dim after the first tick with the one-line explanation; 'create entry with n trade(s) →' disabled with 'tick at least one trade'; cancel; create jumps to /journal/:id
- [ ] #4 Verified on the :3100 temp-DB dev server against prototype variant B (branch prototype/journal-ui, VariantB.tsx); explicit empty/loading states; failures toast.error, no success toasts
- [ ] #5 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
