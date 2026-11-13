---
id: TASK-94
title: Image route owner kinds and shared RichTextEditor
status: Done
assignee:
  - '@myself'
created_date: '2026-11-13 14:28'
updated_date: '2026-11-13 15:21'
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
- [x] #1 POST /api/images?ownerKind=&ownerId=: 400 on bad ownerKind/ownerId; per-kind dispatch plan → getPlanRow 404/409 closedAt, journal_entry → getJournalEntryRow 404/409 reviewedAt, setup → getSetupRow 404; GET unchanged
- [x] #2 client/src/lib/images.ts exports uploadImage(file, owner) → { id, url } and imageUploadError(file), extracted from PlanEditor
- [x] #3 PlanEditor moves to client/src/components/RichTextEditor.tsx with prop owner: { kind: ImageOwnerKind; id: number }; every Plans call site passes { kind: 'plan', id }; Plans behaviour unchanged
- [x] #4 server/_core/imageRoutes.test.ts adds 400 bad ownerKind and 404/409 cases per kind
- [x] #5 Pasting an image into a plan still uploads and renders on the :3100 temp-DB dev server
- [x] #6 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. imageRoutes.ts: parse ownerKind (z.enum IMAGE_OWNER_KINDS) + ownerId (idSchema), 400 on either; switch per kind: plan -> getPlanRow 404/409 closedAt, journal_entry -> getJournalEntryRow 404/409 reviewedAt, setup -> getSetupRow 404; findImageBySha/insertImage with the parsed owner pair; doc comment.
2. imageRoutes.test.ts: upload(owner, ...) builds ?ownerKind=&ownerId=; store.entries/store.setups + getJournalEntryRow/getSetupRow mocks; 400 bad ownerKind (missing, unknown, wrong case); 404 unknown/foreign + 409 per kind; cross-kind dedupe (same bytes, another owner -> new row).
3. client/src/lib/images.ts: ImageOwner type ({ kind: ImageOwnerKind; id }), imageUploadError(file) (mime + size, per research journal-image-slot s1), uploadImage(file, owner) -> { id, url }.
4. git mv PlanEditor.tsx -> components/RichTextEditor.tsx, export RichTextEditor, prop owner; use lib/images; update PlanDetail, PlanScenarios, PlanObservations editor call sites to owner={{ kind: 'plan', id }}.
5. format changed files, check, test; verify paste upload on :3100 temp-DB dev server via playwright.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Image uploads now name their owner, and the plan editor became a shared RichTextEditor.

- server/_core/imageRoutes.ts: POST /api/images?ownerKind=&ownerId= parses ownerKind (z.enum IMAGE_OWNER_KINDS) and ownerId, 400 on either; ownerRejection() dispatches plan -> getPlanRow 404/409 closedAt, journal_entry -> getJournalEntryRow 404/409 reviewedAt, setup -> getSetupRow 404. Dedupe and insert use the parsed owner pair. GET unchanged.
- server/_core/imageRoutes.test.ts: owner-aware upload helper, entry/setup mocks; new cases for journal_entry/setup uploads, cross-kind dedupe (new row), 400 bad/missing ownerKind (incl. legacy ?planId=), 404 unknown/foreign per kind, 409 reviewed entry.
- client/src/lib/images.ts: ImageOwner, imageUploadError(file) (mime + 10 mb guard), uploadImage(file, owner) -> { id, url }.
- PlanEditor moved to client/src/components/RichTextEditor.tsx with prop owner; PlanDetail, PlanScenarios, PlanObservations pass { kind: 'plan', id }. index.css comment renamed; .plan-editor class kept.

Verified: check, full test (522 passing), and on a :3100 temp-DB dev server a pasted PNG posts to ?ownerKind=plan&ownerId=1, stores as (plan, 1) and renders after reload.
<!-- SECTION:FINAL_SUMMARY:END -->
