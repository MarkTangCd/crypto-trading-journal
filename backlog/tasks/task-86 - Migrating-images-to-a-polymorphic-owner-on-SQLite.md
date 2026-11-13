---
id: TASK-86
title: Migrating images to a polymorphic owner on SQLite
status: Done
assignee:
  - '@myself'
created_date: '2026-11-13 12:46'
updated_date: '2026-11-13 13:11'
labels:
  - 'wayfinder:research'
dependencies: []
references:
  - backlog/docs/doc-7 - Trade-journal-map.md
ordinal: 86000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

The `images` table (drizzle/schema.ts) is owned by `planId`. Journal entries and setups will also hold images (before/after screenshot slots, rich text in setups), so ownership must become polymorphic: `ownerKind` in ('plan', 'journal_entry', 'setup') plus `ownerId`, with the unique index on (ownerKind, ownerId, sha256). Find out, against the real toolchain in this repo:

1. What SQL `drizzle-kit generate` emits for this change on SQLite (add column + rename/drop `planId`): a column rename, or a full table rebuild (`__new_images` copy)? Does the existing data survive, and does the rebuild interact with the migration runner in `server/db.ts` `ensureDatabaseSchema` (single BEGIN IMMEDIATE, PRAGMA foreign_keys ignored; see decision-3)?
2. The cheapest safe migration shape: generated SQL, or a hand-edited migration (add nullable column, backfill `ownerKind='plan'`, then rebuild to NOT NULL). The repo has hand-written migrations already (drizzle/0007_drop_users_initial_balance.sql); check how they were produced and whether drizzle's journal/snapshot stays consistent after hand edits.
3. Every code path that reads or writes `planId` on images: server/_core/imageRoutes.ts (POST ?planId=), server/db.ts (insert, cascade on deletePlan, dedupe), client/src/components/plans/PlanEditor.tsx (upload URL), tests in server/_core/imageRoutes.test.ts. List them with file:line so the spec can size the change.

Record findings as a Markdown file on branch research/journal-image-owner and push it. Open no PR.
<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Findings on branch research/journal-image-owner (docs/research/journal-image-owner.md).

1. drizzle-kit generate always emits a full __new_images rebuild (CREATE __new_images, INSERT … SELECT, DROP, RENAME, recreate indexes), never a column add/rename, and the SELECT side is built from the NEW column list, so the generated file reads ownerKind/ownerId from the old table and fails at runtime (no such column). Through ensureDatabaseSchema the batch rolls back: data intact, but getDb() returns null and the app starts without a database. The PRAGMA foreign_keys no-op from decision-3 is irrelevant here (no FKs anywhere). The generate prompt needs a TTY.
2. Recommended: drizzle-kit generate --name images_polymorphic_owner (answer 'create' twice, keep journal + 0015 snapshot), then hand-edit one line so the SELECT reads 'plan' as ownerKind and planId as ownerId. Verified through the real runner on a DB seeded at 0014: all rows survive, ids/bytes/sqlite_sequence preserved, CHECK + unique index present, integrity_check ok; drizzle-kit check passes. Precedent: 0012_left_starfox.sql and 0007 were produced the same way. Rejected: the add-nullable/backfill/rebuild three-step (superset, no gain) and an ALTER-only variant (live DDL diverges from the snapshot).
3. Touch points: drizzle/schema.ts:386-424; shared/const.ts:51-58 (add IMAGE_OWNER_KINDS); server/db.ts:1245-1246 (deletePlan cascade), 1272-1294 (findImageBySha); server/_core/imageRoutes.ts:12, 66, 83-98, 113, 120-131 (GET unchanged); client PlanEditor.tsx:26-27, 43-55, 103 plus planId prop forwarding in PlanDetail.tsx:149,164,172, PlanScenarios.tsx:193, PlanObservations.tsx:54,133; tests imageRoutes.test.ts and plan.db.test.ts; docs doc-5, doc-6, decision-3 mention planId. Ownership check per kind on POST: plan -> 404 + closedAt 409 (as today); journal_entry -> 404 + reviewedAt 409; setup -> 404 only. findImageBySha and cascades key on (userId, ownerKind, ownerId).
<!-- SECTION:FINAL_SUMMARY:END -->
