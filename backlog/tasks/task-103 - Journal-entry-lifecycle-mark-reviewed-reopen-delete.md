---
id: TASK-103
title: 'Journal entry lifecycle: mark reviewed, reopen, delete'
status: Done
assignee:
  - '@myself'
created_date: '2026-11-13 14:30'
updated_date: '2026-11-14 02:16'
labels:
  - ready-for-agent
dependencies:
  - TASK-102
references:
  - backlog/docs/doc-8 - Trade-journal-spec.md
ordinal: 103000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-8, Locked decisions 3 and 6 and the footer under Pages → /journal/:id.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Footer across both pages: 'mark reviewed →' filled ink, disabled with 'after every linked trade closes' while trades are open
- [x] #2 Reviewed entry: every field, slot, setups and linked trades read-only (editors setEditable false); footer shows 'reviewed <day hh:mm> · reopen'; reopen restores editing with all content kept
- [x] #3 'delete entry' at the right behind a confirmation dialog, then back to /journal; the trades show again in the picker
- [x] #4 Verified on the :3100 temp-DB dev server against prototype variant B (branch prototype/journal-ui, VariantB.tsx); explicit empty/loading states; failures toast.error, no success toasts
- [x] #5 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. JournalEntry.tsx: EntryFooter below the two pages (border-t, spans both).
   - Unreviewed: 'mark reviewed →' filled ink button (journal.markReviewed), disabled with the label 'after every linked trade closes' while openTradeCount > 0.
   - Reviewed: 'reviewed <day hh:mm> · reopen' (journal.reopen).
   - Right: 'delete entry' link -> AlertDialog ('delete this journal entry?' / 'n screenshots and every written field go with it. the n trades stay and can be picked again.') -> journal.delete, navigate to /journal; get invalidated with refetchType none like PlanFooter.
   - Invalidate journal.get / list / forTrade / pickableTrades as relevant; failures toast.error; no success toasts.
2. Read-only coverage when reviewed: already driven by reviewedAt (prices, emotion, setups, editors, both slots, linked trades); verify, fix any gap.
3. RichTextEditor: flush the pending autosave on blur. Without it, typing then clicking 'mark reviewed' or 'delete entry' within the 1 s debounce sends the update after the state change -> CONFLICT/NOT_FOUND toast and lost keystrokes. Same harmless effect on Plans.
4. Verify on :3100 temp DB with Playwright against VariantB: disabled state with an open trade, type + immediately mark reviewed (text saved, no toast), read-only everywhere, reopen restores editing with content, delete -> /journal and trades back in the picker.
5. Format changed files, npm run check, npm run test.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Adds the entry lifecycle footer on /journal/:id.

- client/src/pages/JournalEntry.tsx: EntryFooter below both pages. Unreviewed: filled 'mark reviewed →' (journal.markReviewed), disabled with 'after every linked trade closes' while trades are open. Reviewed: 'reviewed <day hh:mm> · reopen' (journal.reopen). Right: 'delete entry' behind an AlertDialog ('n screenshots and every written field go with it. the n trade(s) stay(s) and can be picked again.') -> journal.delete, back to /journal; get invalidated with refetchType none as in PlanFooter, list / forTrade / pickableTrades refreshed. Failures toast.error; no success toasts.
- client/src/components/RichTextEditor.tsx: flush the pending autosave on blur, so typing then clicking 'mark reviewed' or 'delete entry' within the 1 s debounce saves first instead of failing with CONFLICT / NOT_FOUND. Plans get the same earlier save, no behaviour change.
- Read-only when reviewed was already driven by reviewedAt (prices, emotion, setups, editors, both slots, linked trades); verified, no gaps.

Verified on the :3100 temp-DB dev server with Playwright: open trade -> button disabled with hint; typing in entry reason and mistakes then clicking mark reviewed at once saves both, no toasts or tRPC errors; reviewed -> 0 editable editors, 0 enabled inputs/selects, no paste/add/unlink/remove/setups trigger; reopen -> 7 editors editable, content kept; delete -> dialog, /journal, entry gone, its trade back in the picker. npm run check and npm run test (608) pass.
<!-- SECTION:FINAL_SUMMARY:END -->
