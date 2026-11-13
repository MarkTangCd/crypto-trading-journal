---
id: TASK-87
title: Standalone paste-and-drop image slot reusing the upload pipeline
status: Done
assignee:
  - '@myself'
created_date: '2026-11-13 12:46'
updated_date: '2026-11-13 13:01'
labels:
  - 'wayfinder:research'
dependencies: []
references:
  - backlog/docs/doc-7 - Trade-journal-map.md
ordinal: 87000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Journal entries need two dedicated screenshot slots (before / after) that accept pasted or dropped images, show them as a small gallery and let the trader remove one. They are not rich text. Today image upload lives inside the Tiptap editor (client/src/components/plans/PlanEditor.tsx, FileHandler extension, blob: placeholder swapped for /api/images/:id after POST /api/images). Find out:

1. Which parts of that pipeline are reusable outside Tiptap (the upload fetch, mime/size guard, error toast) and which are editor-bound. Propose the smallest extraction: a plain helper such as `uploadImage(file, owner)` shared by the editor and the slot.
2. How a non-editor element should receive paste and drop: window-level paste listener while the slot is focused versus a focusable div with onPaste/onDrop; what the clipboard yields for a screenshot on macOS Chrome/Safari (image/png file item), and how to keep the editor's own paste handling from double-firing when both are on the page.
3. How the slot's images should be stored on the entry: an ordered array of image ids as JSON (`beforeImageIds`, `afterImageIds`) versus rows in a join table; recommend one for a single-user SQLite app, considering cascade delete and the orphan tolerance in decision-3.

Record findings as a Markdown file on branch research/journal-image-slot and push it. Open no PR.
<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Findings on branch research/journal-image-slot (docs/research/journal-image-slot.md).

1. Extraction: move the upload fetch, size guard and failure toast out of PlanEditor.tsx into client/src/lib/images.ts as uploadImage(file, owner) -> { id, url } (query ownerKind/ownerId) plus imageUploadError(file) for mime + size; FileHandler, insertContentAt, the src swap and the pendingUploads autosave gate stay editor-bound. Server route unchanged except the closedAt 409 guard becomes a per-owner 'still editable' check once task-86 lands.
2. Paste/drop target: a native <button> with React onPaste plus a visually hidden <input type=file multiple> for keyboard users, and onDragOver/onDrop on the slot wrapper; no window listener. ProseMirror listens only on view.dom and FileHandler stops propagation on file pastes/drops, so a slot and an editor on the same page cannot double-fire. A macOS screenshot in Chrome and Safari arrives as one image/png File in clipboardData.files.
3. Storage: two ordered JSON arrays beforeImageIds / afterImageIds on journal_entries (text json, number[], default '[]'); removing from a slot orphans the row (decision-3 tolerates it), entry delete cascades by polymorphic owner; mutate through server-side addSlotImage/removeSlotImage inside runInSqliteTransaction so parallel uploads cannot clobber the array. Rejected: a slot column on images (collides with the per-owner sha256 unique index) and a join table.
<!-- SECTION:FINAL_SUMMARY:END -->
