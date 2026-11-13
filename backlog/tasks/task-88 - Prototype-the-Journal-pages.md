---
id: TASK-88
title: Prototype the Journal pages
status: To Do
assignee: []
created_date: '2026-11-13 12:47'
labels:
  - 'wayfinder:prototype'
dependencies: []
references:
  - backlog/docs/doc-7 - Trade-journal-map.md
ordinal: 88000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

How should the Journal look and behave, inside DESIGN.md (watchmaker's notebook, paper-pale, mono-forward, no cards, no shadows, lowercase labels)? Build a throwaway prototype through /impeccable (read PRODUCT.md and DESIGN.md first) on a prototype/journal-ui branch, with fake data, and iterate with the trader until one variant is chosen. Pages and pieces to decide:

- `/journal` list: one row per entry with date (earliest linked trade openTime, UTC+8), symbol, side(s), setup names, trade count, net realized PnL, unreviewed/reviewed state; newest first; the creation entry point; a small 'setups' link in the header. How loud the unreviewed state is.
- The trade picker used to create an entry: current account's trades (open and closed) not already in another entry, newest first, symbol search, same-symbol constraint after the first tick, create on at least one tick, then jump to `/journal/:id`.
- `/journal/:id` entry page: symbol as hero like the plan page; the recording section (setups multi-select with inline '+ new setup', entry reason rich text, market context rich text, before screenshots slot, planned entry / stop / take profit inputs with planned R:R shown, emotion select, invalidation rich text); the linked trades strip (add/remove while unreviewed); the review section shown but locked with 'waiting for N open trade(s) to close' until every linked trade is closed, then the static Chinese prompt block (the seven questions and the closing line, verbatim from the map Notes), after screenshots slot, mistakes, rules followed or broken, management decisions, notes for next time, actual R; 'mark reviewed' at the foot with reopen and delete like PlanFooter.
- `/journal/setups`: list of setups with name, triggers, usage count; inline create and edit (name, rich text description, trigger chips); delete blocked when in use.
- The trade detail page: a link to its entry, or a 'new journal entry' shortcut preselecting that trade.

Resolve with the chosen variant and the decisions it forced; link the branch.
<!-- SECTION:DESCRIPTION:END -->
