---
id: TASK-98
title: Setups page
status: Done
assignee:
  - '@myself'
created_date: '2026-11-13 14:29'
updated_date: '2026-11-13 15:42'
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
- [x] #1 /journal/setups master-detail: inline create (enter, errors inline) and the list with usage counts; selected setup with name (save on blur, uniqueness/length errors inline), 'used by n entries', trigger chips (enter to add, × to remove), RichTextEditor description with owner { kind: 'setup', id }
- [x] #2 'delete setup' disabled with 'used by n entries; untag them first' while in use, else deletes behind a confirmation
- [x] #3 Verified on the :3100 temp-DB dev server against prototype variant B (branch prototype/journal-ui, VariantB.tsx); explicit empty/loading states; failures toast.error, no success toasts
- [x] #4 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Replace the JournalSetups.tsx placeholder with the master-detail page (variant B layout): '← journal', title, subtitle; left column inline create + list with usage counts; right column editor for the selected setup (local state, defaults to the first setup).
2. Data: setup.list feeds both columns (rows carry description, triggers, usageCount); RichTextEditor keyed by setup id, content is read on mount only.
3. Create: setup.create on enter; CONFLICT -> 'name taken', BAD_REQUEST / client trim length -> '1 to 60 characters' inline; success selects the new setup, invalidates setup.list.
4. Name: save on blur (enter blurs) when changed; same inline errors under the name; invalidates setup.list and journal.list (setup names show there).
5. Triggers: chips with x, input adds on enter; client trims, checks 1..80, ignores case-insensitive duplicates; setup.update { triggers }; invalidates setup.list.
6. Description: RichTextEditor owner { kind: 'setup', id }, autosave setup.update { description } (empty doc -> null); success invalidates setup.list so reselecting shows the saved text.
7. Delete: disabled with 'used by n entries; untag them first' while in use; else AlertDialog confirmation, setup.delete, invalidate setup.list.
8. Spinner while loading, explicit empty states, toast.error on other failures, no success toasts. Verify on :3100 temp DB with Playwright; prettier on changed files; npm run check + test.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Setups page at /journal/setups (replaces the task-97 placeholder), variant B master-detail.

- Left: inline create (enter; 'name taken' on CONFLICT, '1 to 60 characters' on BAD_REQUEST or client trim check, shown inline), list sorted by the server with usage counts; selection is local state defaulting to the first setup.
- Right (keyed by setup id): name saves on blur / enter when changed, same inline errors, invalidates setup.list and journal.list (setup names show there); 'used by n entries'; trigger chips with x, enter adds (trim, 1..80, case-insensitive duplicates ignored); RichTextEditor description with owner { kind: 'setup', id }, empty doc saved as null; triggers/description saves invalidate setup.list so reselecting shows fresh data (editor reads content on mount only, so this never resets it).
- 'delete setup' disabled with 'used by n entries; untag them first' while in use, else AlertDialog confirmation then setup.delete.
- Spinner while loading, explicit empty states for the list and the detail; other failures toast.error; no success toasts.

Verified on a :3100 temp-DB dev server with Playwright: create (duplicate, blank, valid -> selected), rename conflict and valid rename, trigger add / case-insensitive duplicate / remove, description autosave survives switching setups, in-use delete disabled, confirmed delete, empty state. npm run check and npm run test (47 files, 608 tests) pass.
<!-- SECTION:FINAL_SUMMARY:END -->
