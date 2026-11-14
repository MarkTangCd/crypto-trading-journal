---
id: TASK-101
title: Image slot and before screenshots
status: Done
assignee:
  - '@myself'
created_date: '2026-11-13 14:29'
updated_date: '2026-11-14 01:12'
labels:
  - ready-for-agent
dependencies:
  - TASK-99
references:
  - backlog/docs/doc-8 - Trade-journal-spec.md
ordinal: 101000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-8, Locked decision 10 and Client → Shared pieces (ImageSlot); research branch research/journal-image-slot sections 2 and 3.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 client/src/components/journal/ImageSlot.tsx: native button with onPaste, hidden file input (accept IMAGE_MIME_TYPES, multiple), onDragOver/onDrop on the wrapper, no window listener; pending blob: previews; client pre-check of SLOT_IMAGE_MAX and size; remove per image
- [x] #2 Before screenshots on the left page use it with uploadImage then journal.addSlotImage / removeSlotImage, invalidating journal.get; several images pasted at once all land in order
- [x] #3 Verified on the :3100 temp-DB dev server against prototype variant B (branch prototype/journal-ui, VariantB.tsx); explicit empty/loading states; failures toast.error, no success toasts
- [x] #4 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. client/src/components/journal/ImageSlot.tsx (new). Props: imageIds, owner, editable, onAdd(imageId) => Promise<unknown>, onRemove(imageId) => Promise<unknown>, emptyText.
   - Wrapper: onDragOver (preventDefault, ink hairline while dragging files), onDragLeave, onDrop -> addFiles. No window listener.
   - Native <button type=button>: onPaste reads clipboardData.files (text pastes untouched), click opens a hidden <input type=file accept=IMAGE_MIME_TYPES multiple>. Label 'paste, drop or click to choose'.
   - addFiles: imageUploadError per file -> toast.error + skip; pre-check SLOT_IMAGE_MAX against imageIds + pending, overflow -> toast.error and drop the extras; blob: previews pushed to local pending state (opacity 0.4); then sequentially per file uploadImage -> await onAdd(id) (skipped if id already in the slot), so several files land in paste order; finally revoke the URL and drop the pending item. Failures: toast.error('image upload failed: ...'). No success toast.
   - Gallery <ul>: thumbnails h-28 with 1px border, each a link to /api/images/:id (new tab); hover/focus 'remove' x button per image while editable.
   - Read-only: no button/handlers; empty -> 'no screenshots.'
2. JournalEntry.tsx: small ScreenshotSlot wrapper (entry, slot, editable, onSaved) wiring journal.addSlotImage / removeSlotImage via mutateAsync, invalidating journal.get and calling onSaved; failures toast.error. Before page: Block 'before screenshots' after the rich fields. Task-102 reuses the wrapper with slot 'after'.
3. Verify on the :3100 temp-DB dev server with Playwright: synthetic multi-file paste (order), file input, drop, remove, over-cap toast, reviewed read-only/empty state; compare with VariantB.
4. format changed files, npm run check, npm run test.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Adds the screenshot slot and the before screenshots on the journal entry page.

- client/src/components/journal/ImageSlot.tsx (new): native button with onPaste (file pastes only), hidden multiple file input (accept IMAGE_MIME_TYPES), onDragOver/onDrop on the wrapper with an ink hairline while dragging files; no window listener. Files pass imageUploadError and a SLOT_IMAGE_MAX pre-check (extras dropped with a toast), show blob: previews at 0.4 opacity, then upload and onAdd one at a time so a multi-file paste lands in order; ids already in the slot are not re-added. Thumbnails open the full image in a new tab and have a per-image remove button. Read-only: no controls, empty -> 'no screenshots.'. Failures toast.error; no success toasts.
- client/src/pages/JournalEntry.tsx: ScreenshotSlot wrapper wiring journal.addSlotImage / removeSlotImage (invalidate journal.get, update the saved mark); 'before screenshots' block at the end of the before page. Task-102 reuses it with slot 'after'.

Verified on the :3100 temp-DB dev server with Playwright: 3-file paste -> ids [1,2,3] in paste order, file input + drop append in order, duplicate paste no-op, over-cap paste keeps 10 and toasts, non-image toasts, remove updates server and gallery, reviewed entry shows the read-only empty state, 400px layout stacks. npm run check and npm run test (608) pass.

Deviation from the prototype: no zoom overlay; thumbnails link to /api/images/:id in a new tab.
<!-- SECTION:FINAL_SUMMARY:END -->
