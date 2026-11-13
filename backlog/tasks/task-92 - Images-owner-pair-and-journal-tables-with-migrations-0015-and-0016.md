---
id: TASK-92
title: Images owner pair and journal tables with migrations 0015 and 0016
status: To Do
assignee: []
created_date: '2026-11-13 14:27'
labels:
  - ready-for-agent
dependencies:
  - TASK-91
references:
  - backlog/docs/doc-8 - Trade-journal-spec.md
ordinal: 92000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-8, sections Data model and Migrations; research branch research/journal-image-owner sections 2.1 and 3 (touch points with file:line). The upload route's public API stays POST /api/images?planId= in this task (stored as ownerKind 'plan'); the API change ships with the client in a later task so Plans uploads never break.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 drizzle/schema.ts: images.planId replaced by ownerKind (check images_owner_kind_check over IMAGE_OWNER_KINDS) and ownerId; unique index images_owner_sha_unique (ownerKind, ownerId, sha256); doc comment reworded for three owner kinds
- [ ] #2 Migration 0015_images_polymorphic_owner generated with drizzle-kit (answer create column), only the rebuild INSERT … SELECT hand-edited to select 'plan', "planId"; snapshot untouched; journal when greater than 0014
- [ ] #3 journal_entries, journal_entry_trades, setups, journal_entry_setups added exactly as the spec (columns, defaults, checks, indexes incl. journal_entry_trades_trade_unique and the (userId, lower(name)) expression index); migration 0016 generated, no hand edits
- [ ] #4 server/db.ts: findImageBySha(userId, ownerKind, ownerId, sha256), insertImage with the owner pair, deletePlan deletes images by ('plan', planId); imageRoutes.ts passes ownerKind 'plan' internally with the ?planId= API unchanged
- [ ] #5 server/plan.db.test.ts and server/_core/imageRoutes.test.ts updated for the owner pair; a cross-kind dedupe case (same bytes, different owner → new row) added
- [ ] #6 drizzle-kit check passes; the app starts against a copy of the real database with all images still served (no [Database] Failed to connect)
- [ ] #7 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
