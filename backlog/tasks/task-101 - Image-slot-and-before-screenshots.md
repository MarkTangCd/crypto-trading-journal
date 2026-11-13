---
id: TASK-101
title: Image slot and before screenshots
status: To Do
assignee: []
created_date: '2026-11-13 14:29'
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
- [ ] #1 client/src/components/journal/ImageSlot.tsx: native button with onPaste, hidden file input (accept IMAGE_MIME_TYPES, multiple), onDragOver/onDrop on the wrapper, no window listener; pending blob: previews; client pre-check of SLOT_IMAGE_MAX and size; remove per image
- [ ] #2 Before screenshots on the left page use it with uploadImage then journal.addSlotImage / removeSlotImage, invalidating journal.get; several images pasted at once all land in order
- [ ] #3 Verified on the :3100 temp-DB dev server against prototype variant B (branch prototype/journal-ui, VariantB.tsx); explicit empty/loading states; failures toast.error, no success toasts
- [ ] #4 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
