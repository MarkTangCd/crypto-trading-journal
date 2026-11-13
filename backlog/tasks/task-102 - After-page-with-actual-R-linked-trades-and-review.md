---
id: TASK-102
title: 'After page with actual R, linked trades and review'
status: To Do
assignee: []
created_date: '2026-11-13 14:30'
labels:
  - ready-for-agent
dependencies:
  - TASK-101
references:
  - backlog/docs/doc-8 - Trade-journal-spec.md
ordinal: 102000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-8, Locked decisions 4, 5, 13 and Pages → /journal/:id right page.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Right page 'after · actual r': actual R hero tinted by sign ('open' while trades are open), 'net pnl · formula' line
- [ ] #2 Linked trades: unlink on hover while unreviewed and more than one; '+ add trade' lists journal.pickableTrades for the entry's account and symbol
- [ ] #3 Review: while any trade is open a 'waiting for n open trade(s) to close' line with the review fields dimmed and locked (content kept); once all closed the static Chinese prompt block verbatim, after screenshots (ImageSlot), mistakes, rules followed or broken, management decisions, notes for next time
- [ ] #4 Verified on the :3100 temp-DB dev server against prototype variant B (branch prototype/journal-ui, VariantB.tsx); explicit empty/loading states; failures toast.error, no success toasts
- [ ] #5 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
