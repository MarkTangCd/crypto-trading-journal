---
id: TASK-92
title: Images owner pair and journal tables with migrations 0015 and 0016
status: Done
assignee:
  - '@myself'
created_date: '2026-11-13 14:27'
updated_date: '2026-11-13 14:40'
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
- [x] #1 drizzle/schema.ts: images.planId replaced by ownerKind (check images_owner_kind_check over IMAGE_OWNER_KINDS) and ownerId; unique index images_owner_sha_unique (ownerKind, ownerId, sha256); doc comment reworded for three owner kinds
- [x] #2 Migration 0015_images_polymorphic_owner generated with drizzle-kit (answer create column), only the rebuild INSERT … SELECT hand-edited to select 'plan', "planId"; snapshot untouched; journal when greater than 0014
- [x] #3 journal_entries, journal_entry_trades, setups, journal_entry_setups added exactly as the spec (columns, defaults, checks, indexes incl. journal_entry_trades_trade_unique and the (userId, lower(name)) expression index); migration 0016 generated, no hand edits
- [x] #4 server/db.ts: findImageBySha(userId, ownerKind, ownerId, sha256), insertImage with the owner pair, deletePlan deletes images by ('plan', planId); imageRoutes.ts passes ownerKind 'plan' internally with the ?planId= API unchanged
- [x] #5 server/plan.db.test.ts and server/_core/imageRoutes.test.ts updated for the owner pair; a cross-kind dedupe case (same bytes, different owner → new row) added
- [x] #6 drizzle-kit check passes; the app starts against a copy of the real database with all images still served (no [Database] Failed to connect)
- [x] #7 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. schema.ts images: planId -> ownerKind ($type<ImageOwnerKind>, check images_owner_kind_check with literal list matching IMAGE_OWNER_KINDS) + ownerId; unique images_owner_sha_unique (ownerKind, ownerId, sha256); reword doc comment.
2. drizzle-kit generate --name images_polymorphic_owner driven by expect (prompt needs a TTY), answer create column twice; hand-edit only the INSERT ... SELECT to 'plan', "planId"; keep snapshot and generated when.
3. schema.ts: journal_entries, journal_entry_trades, setups, journal_entry_setups per doc-8 Data model; drizzle-kit generate (0016), no hand edits; inspect the lower(name) expression index SQL.
4. server/db.ts: findImageBySha(userId, ownerKind, ownerId, sha256), insertImage comment, deletePlan deletes by ('plan', planId). imageRoutes.ts passes ownerKind 'plan' with ?planId= unchanged.
5. Tests: plan.db.test.ts + imageRoutes.test.ts owner pair; cross-kind dedupe case in plan.db.test.ts (same bytes, other ownerKind -> new row).
6. Verify: drizzle-kit check, npm run check, npm run test, start app on :3100 against .tmp copy of data/crypto-trading-journal.sqlite, GET every image id 200, no Failed to connect; clean up.
7. Prettier on changed files only; check ACs, final summary, Done (no commit).
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Images get a polymorphic owner and the four Trade journal tables land, with migrations 0015 and 0016.

- drizzle/schema.ts: images.planId -> ownerKind ($type<ImageOwnerKind>, check images_owner_kind_check) + ownerId; unique images_owner_sha_unique (ownerKind, ownerId, sha256); doc comment covers three owner kinds. New journal_entries, journal_entry_trades, setups, journal_entry_setups per doc-8 (emotion check, '[]' JSON array defaults, journal_entry_trades_trade_unique, setups_user_name_unique on (userId, lower(name))).
- 0015_images_polymorphic_owner: drizzle-kit generate driven by expect (create column x2); only the rebuild INSERT ... SELECT hand-edited to 'plan', "planId". 0016_thick_red_wolf generated with no hand edits (expression index emitted as lower("name")). Snapshots and journal as generated.
- server/db.ts: findImageBySha(userId, ownerKind, ownerId, sha256); deletePlan deletes images by ('plan', planId). imageRoutes.ts passes ownerKind 'plan'; POST /api/images?planId= unchanged.
- Tests: plan.db.test.ts and imageRoutes.test.ts use the owner pair; plan.db.test.ts adds owner-kind scoping and cross-kind dedupe (same bytes, journal_entry owner -> new row).

Verification: drizzle-kit check fine, re-generate is a no-op; npm run check; npm run test (44 files, 503 tests). App started on :3100 against a backup of the real DB (which has no images, so two plan images were seeded at 0014 first): no [Database] Failed to connect, 17 migrations applied, both images migrated to ('plan', 1) and served 200 with matching sha256 ETags, ?planId= upload deduped, sqlite_sequence kept, integrity_check ok.
<!-- SECTION:FINAL_SUMMARY:END -->
