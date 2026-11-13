---
id: TASK-100
title: Setups multi-select on the journal entry
status: Done
assignee:
  - '@myself'
created_date: '2026-11-13 14:29'
updated_date: '2026-11-13 16:01'
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
- [x] #1 client/src/components/ui/popover.tsx added as the shadcn popover over @radix-ui/react-popover (version range in the style of the other radix packages)
- [x] #2 Multi-select beside the emotion select: checkbox list of setups by name, saves via journal.setSetups on change; inline '+ new setup' creates via setup.create then links it; errors inline/toast
- [x] #3 Verified on the :3100 temp-DB dev server against prototype variant B (branch prototype/journal-ui, VariantB.tsx); explicit empty/loading states; failures toast.error, no success toasts
- [x] #4 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. npm install @radix-ui/react-popover@1.1.15 (same release as the installed dialog 1.1.15, saved as ^1.1.15); add components/ui/popover.tsx as stock shadcn (data-slot, cn), without shadow-md like the repo's dropdown-menu.
2. JournalEntry.tsx: SetupSelect beside emotion (setups left, emotion right, as variant B). Trigger is an underline field showing the linked setup names or —; plain text when reviewed.
3. Popover: setup.list loading line / empty line, checkbox list by name; toggling calls journal.setSetups with the new id set (disabled while pending), invalidating journal.get, journal.list and setup.list, and sets the saved mark.
4. '+ new setup' input: trim + length check inline, setup.create; CONFLICT -> inline 'name taken', BAD_REQUEST -> inline length text, else toast; on success setSetups with the new id appended. Footer: 'manage setups' link and 'done'.
5. Verify on :3100 temp DB with Playwright; format changed files, check, test.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Adds the setups multi-select to the journal entry's left page.

- @radix-ui/react-popover ^1.1.15 (locked at 1.1.15, the same release as the installed dialog) and components/ui/popover.tsx as the stock shadcn popover without shadow-md, like the repo's dropdown-menu.
- SetupSelect beside emotion (setups left as in variant B): an underline trigger showing the linked names or —, plain text when reviewed. The popover lists setups by name as checkboxes (loading and empty lines), toggles save via journal.setSetups and stay pending until journal.get, journal.list and setup.list refetch, so the next toggle starts from the saved set; the saved mark takes the client time since setSetups returns no updatedAt.
- '+ new setup ⏎' checks length inline, creates via setup.create, then links it; CONFLICT -> 'name taken', BAD_REQUEST -> length text inline, other failures toast. Footer: manage setups link and done.

Verified on a :3100 temp-DB dev server with Playwright: empty state, three inline creates linked, duplicate name inline error, unlink by checkbox, server setups / usage counts / list setupNames match, done closes, lg and 400px, reviewed renders text. npm run check and npm run test (608) pass.
<!-- SECTION:FINAL_SUMMARY:END -->
