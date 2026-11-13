---
id: TASK-99
title: Journal entry page and before page
status: Done
assignee:
  - '@myself'
created_date: '2026-11-13 14:29'
updated_date: '2026-11-13 15:47'
labels:
  - ready-for-agent
dependencies:
  - TASK-94
  - TASK-97
references:
  - backlog/docs/doc-8 - Trade-journal-spec.md
ordinal: 99000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-8, Locked decisions 7, 8, 9 and Pages → /journal/:id (shell and left page). Setups multi-select and screenshots come in later tasks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Shell: '← journal', quiet 'saved hh:mm', title line symbol with 'date · side(s) · n trades · state'; two pages split by a 1px mist rule at lg, stacked when narrow
- [x] #2 Left page 'before · planned r:r': planned R:R hero via previewPlannedRiskReward with the earliest trade's side, hint line (formula, invalid reason, or 'enter entry, stop and target'); planned entry / stop loss / take profit inputs saved on blur
- [x] #3 Emotion select (lowercase, FOMO for fomo, clearable); entry reason, market context, invalidation as RichTextEditor with owner { kind: 'journal_entry', id }, autosave ~1 s without invalidating journal.get
- [x] #4 Verified on the :3100 temp-DB dev server against prototype variant B (branch prototype/journal-ui, VariantB.tsx); explicit empty/loading states; failures toast.error, no success toasts
- [x] #5 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. JournalEntry.tsx: journal.get (retry false); spinner while loading; 'journal entry not found' / 'failed to load journal entry' with ← journal.
2. Shell: ← journal + quiet 'saved hh:mm' (savedAt from the last save, else entry.updatedAt); h1 symbol; 'date · side(s) · n trades · state' via fmtDayTime and the list's state words; grid lg:grid-cols-2, left page lg:pr-12 lg:border-r, right page holds only the 'after · actual r' label (task-102 fills it).
3. Left page: planned R:R hero from local price drafts via previewPlannedRiskReward(trades[0].side, ...), fmtRatio, hint line per spec; three price inputs (text, inputMode decimal) save on blur when changed (trim, empty -> null), invalidate journal.get; BAD_REQUEST -> toast.error.
4. Emotion native select (— clears, lowercase, fomo -> FOMO), saves on change, invalidates journal.get.
5. Entry reason / market context / invalidation: RichTextEditor owner { kind: 'journal_entry', id }, separate autosave mutation that only sets savedAt (no invalidation); empty doc -> null.
6. Reviewed entry: inputs disabled, editors read-only (server rejects writes anyway).
7. Verify on :3100 temp-DB dev server with Playwright screenshots (lg + narrow, empty / filled / invalid hint, reload persistence); format changed files, check, test.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaces the /journal/:id placeholder with the entry shell and the left page.

- Shell: ← journal, quiet 'saved hh:mm' (last save this session, else entry.updatedAt), symbol title with 'date · side(s) · n trades · state'; two pages split by a 1px rule at lg, stacked when narrow. The right page holds only its 'after · actual r' label until task-102.
- Left page: planned R:R hero recomputed from local price drafts via previewPlannedRiskReward with the earliest trade's side, plus a hint line (formula, invalid reason, or 'enter entry, stop and target'); planned entry / stop loss / take profit save on blur when changed (trimmed, empty -> null) and invalidate journal.get.
- Emotion select (— clears, lowercase, FOMO) saves on change; entry reason, market context and invalidation use RichTextEditor with owner journal_entry and a separate autosave mutation that only sets the saved mark.
- Reviewed entries render read-only. Loading spinner, not-found / failed-to-load states; failures toast.error, no success toasts.

Verified on a :3100 temp-DB dev server with Playwright: long 64000/63000/66000 -> 2.00, short 3400/3500/3200 -> 2.00, invalid hint, BAD_REQUEST toast for 'abc', values persist across reload, lg and 400px layouts, reviewed state disabled, not-found page. npm run check and npm run test (608) pass.
<!-- SECTION:FINAL_SUMMARY:END -->
