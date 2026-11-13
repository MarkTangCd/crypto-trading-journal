---
id: TASK-96
title: tRPC journal namespace
status: To Do
assignee: []
created_date: '2026-11-13 14:28'
labels:
  - ready-for-agent
dependencies:
  - TASK-93
references:
  - backlog/docs/doc-8 - Trade-journal-spec.md
ordinal: 96000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-8, section tRPC surface → namespace journal (14 procedures). All publicProcedure; any write to a reviewed entry except reopen and delete → CONFLICT; state conflicts CONFLICT, input problems BAD_REQUEST.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 journal.list, get, pickableTrades, forTrade, create, update, setSetups, addTrade, removeTrade, addSlotImage, removeSlotImage, markReviewed, reopen, delete with the inputs and errors in the spec table
- [ ] #2 Planned prices: trim, empty → null, else DECIMAL_PATTERN and > 0 or BAD_REQUEST; review-field writes, after-slot writes and markReviewed while openTradeCount > 0 → CONFLICT
- [ ] #3 create: foreign/unknown trade NOT_FOUND, mixed symbol or account BAD_REQUEST, already linked (incl. unique-index race) CONFLICT; removeTrade of the last trade BAD_REQUEST; addSlotImage at SLOT_IMAGE_MAX BAD_REQUEST
- [ ] #4 server/journal.test.ts via createCaller with vi.mock('./db') covers every CONFLICT / BAD_REQUEST / NOT_FOUND row
- [ ] #5 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
