---
id: task-2
title: Update New Trade form for context and trade items
status: Done
assignee:
  - '@codex'
created_date: '2026-06-17'
updated_date: '2026-06-18 07:43'
labels:
  - frontend
  - trade-entry
dependencies:
  - task-1
modified_files:
  - client/src/pages/NewTransaction.tsx
priority: high
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Replace the current New Trade thesis input with two controls:

- A `context` textarea where the user writes the market background.
- A `tradeItems` tag input where pressing Enter converts the current text into
a tag. Multiple tags are supported and submitted as a string array.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 The New Trade page no longer shows the old single thesis field.
- [x] #2 The context field is a textarea and submits its value as `context`.
- [x] #3 The trade item input creates a tag when the user presses Enter.
- [x] #4 The user can add multiple trade item tags before submitting.
- [x] #5 Empty or whitespace-only tag entries are ignored.
- [x] #6 Submitted trade data includes `tradeItems` as a string array.
- [x] #7 The form preserves the existing New Trade validation and submission
    behavior outside this field split.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Replace the New Trade form trade item textarea state with an array-backed tag input.
2. Add Enter-key handling that trims input, ignores empty entries, appends valid tags, and clears the draft input.
3. Render added trade item tags in the existing notebook style while preserving the context textarea.
4. Submit tradeItems directly as a string array and keep the existing validation/submission flow.
5. Run formatting and TypeScript checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Implemented the New Trade trade item tag input locally in NewTransaction. Verification: npx prettier --write client/src/pages/NewTransaction.tsx; npm run check; headless Chrome smoke test confirmed context textarea, no old tradeItems textarea, Enter-generated tags, and ignored whitespace entry.

<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Updated the New Trade form so context remains a textarea and trade items are collected through an Enter-driven tag input backed by a string array. The submit payload now sends formData.tradeItems directly, preserving the existing validation and create mutation flow while removing the old newline-splitting tradeItemsText textarea.

<!-- SECTION:FINAL_SUMMARY:END -->
