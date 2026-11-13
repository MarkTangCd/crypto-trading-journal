---
id: TASK-95
title: tRPC setup namespace
status: Done
assignee:
  - '@myself'
created_date: '2026-11-13 14:28'
updated_date: '2026-11-13 15:24'
labels:
  - ready-for-agent
dependencies:
  - TASK-93
references:
  - backlog/docs/doc-8 - Trade-journal-spec.md
ordinal: 95000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-8, section tRPC surface → namespace setup. All publicProcedure; NOT_FOUND / CONFLICT / BAD_REQUEST per the spec's common-errors rule.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 setup.list, get, create, update, delete as the spec; name trimmed 1..SETUP_NAME_MAX; triggers trimmed 1..ENTRY_TRIGGER_MAX, case-insensitive duplicates → BAD_REQUEST; description RichTextDoc | null
- [x] #2 Name taken case-insensitively (create, or update to another setup's name) → CONFLICT; delete with usageCount > 0 → CONFLICT; update returns updatedAt
- [x] #3 server/setup.test.ts via createCaller with vi.mock('./db') covers every error row
- [x] #4 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. server/routers.ts: import listSetups, getSetup, getSetupRow, findSetupByName, createSetup, updateSetup, deleteSetup and SETUP_NAME_MAX / ENTRY_TRIGGER_MAX; schemas setupName (trim, 1..60), entryTrigger (trim, 1..80), triggers array refined for case-insensitive duplicates (zod -> BAD_REQUEST); notFound() accepts 'Setup'.
2. setup namespace after plan: list; get (NOT_FOUND); create (findSetupByName hit -> CONFLICT, returns { id }); update (getSetupRow -> NOT_FOUND, name held by another id -> CONFLICT, returns { updatedAt }); delete (getSetup -> NOT_FOUND, usageCount > 0 -> CONFLICT).
3. server/setup.test.ts: createCaller + vi.mock('./db'); every NOT_FOUND / CONFLICT / BAD_REQUEST row, trimming, renaming own setup's case is allowed, description null.
4. format changed files, check, full test.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Adds the setup tRPC namespace for the Trade journal.

- server/routers.ts: setup.list / get / create / update / delete, all publicProcedure. Schemas setupName (trim, 1..SETUP_NAME_MAX) and setupTriggers (each trimmed 1..ENTRY_TRIGGER_MAX, case-insensitive duplicates refused) give BAD_REQUEST through zod; description is RichTextDoc | null. requireFreeSetupName() pre-checks findSetupByName: CONFLICT on create, and on update when another setup holds the name (a setup may change the case of its own name). update checks getSetupRow first (NOT_FOUND) and returns { updatedAt }; delete answers NOT_FOUND, or CONFLICT while usageCount > 0.
- server/setup.test.ts: 23 createCaller cases with vi.mock('./db') covering every NOT_FOUND / CONFLICT / BAD_REQUEST row, trimming and the length boundaries.

Not handled: two concurrent creates/renames to the same name can both pass the pre-check; the loser hits the unique index and surfaces as a 500 (the spec asks for race mapping only on journal.create).

Verified: npm run check and the full suite (545 tests) pass.
<!-- SECTION:FINAL_SUMMARY:END -->
