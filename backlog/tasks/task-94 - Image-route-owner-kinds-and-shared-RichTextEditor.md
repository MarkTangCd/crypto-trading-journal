---
id: TASK-94
title: Image route owner kinds and shared RichTextEditor
status: To Do
assignee: []
created_date: '2026-11-13 14:28'
labels:
  - ready-for-agent
dependencies:
  - TASK-93
references:
  - backlog/docs/doc-8 - Trade-journal-spec.md
ordinal: 94000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-8, sections Image routes and Client → Shared pieces; research branches research/journal-image-owner section 4 and research/journal-image-slot section 1. The route API and its only client move together so Plans uploads keep working.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 POST /api/images?ownerKind=&ownerId=: 400 on bad ownerKind/ownerId; per-kind dispatch plan → getPlanRow 404/409 closedAt, journal_entry → getJournalEntryRow 404/409 reviewedAt, setup → getSetupRow 404; GET unchanged
- [ ] #2 client/src/lib/images.ts exports uploadImage(file, owner) → { id, url } and imageUploadError(file), extracted from PlanEditor
- [ ] #3 PlanEditor moves to client/src/components/RichTextEditor.tsx with prop owner: { kind: ImageOwnerKind; id: number }; every Plans call site passes { kind: 'plan', id }; Plans behaviour unchanged
- [ ] #4 server/_core/imageRoutes.test.ts adds 400 bad ownerKind and 404/409 cases per kind
- [ ] #5 Pasting an image into a plan still uploads and renders on the :3100 temp-DB dev server
- [ ] #6 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
