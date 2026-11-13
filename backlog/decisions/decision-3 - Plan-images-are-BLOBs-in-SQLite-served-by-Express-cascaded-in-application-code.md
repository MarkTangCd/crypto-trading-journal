---
id: decision-3
title: >-
  Plan images are BLOBs in SQLite served by Express, cascaded in application
  code
date: "2026-11-10 06:37"
status: accepted
---

## Context

Trading plans (doc-5, doc-6) let the trader paste chart screenshots into the
market context, scenarios and observations. The journal is a single-user,
localhost app on SQLite via `node:sqlite`; its whole state is one database
file. Three storage options were weighed on the _Trading plan map_
(2026-11-10): files on disk referenced by path, base64 data URLs inside the
rich-text documents, and BLOB rows in SQLite.

Research (task-71, branch `research/plan-image-storage`) confirmed drizzle
`blob({ mode: "buffer" })` round-trips over the project's sqlite-proxy
callback, and that a 10 MB read costs a few milliseconds with no streaming
needed. It also found a hazard: `ensureDatabaseSchema` runs every migration
inside one `BEGIN IMMEDIATE`, where the `PRAGMA foreign_keys=OFF` that
drizzle-kit emits for table rebuilds is silently ignored. With an
`ON DELETE CASCADE` foreign key from `images.planId`, any future rebuild of
`plans` would delete every image (reproduced).

## Decision

1. Plan images are stored as BLOBs in an `images` table (`bytes`, sniffed
   `mime`, `size`, `sha256`, `planId`, `userId`), not on disk and never as
   base64 inside documents. Documents reference them as `/api/images/:id`.
2. They are written and read through Express routes
   (`POST /api/images?planId=`, `GET /api/images/:id`), not tRPC, because
   the payload is raw bytes (up to 10 MiB) that must not pass through the
   1 mb JSON body limit, and because the browser loads `<img src>` directly
   with HTTP caching (strong sha256 ETag, `immutable`).
3. `images.planId` has **no foreign key**. Deleting a plan deletes its images,
   observations and scenarios in application code inside
   `runInSqliteTransaction`, matching the schema's existing convention of
   plain integer references.

## Consequences

- One file holds the whole journal: backup, copy and restore stay a single
  `cp`, and a deleted plan cannot leave files behind.
- The database grows with screenshots; SQLite is slower than the filesystem
  for blobs above ~100 KB at high volume, which does not matter for a
  handful of screenshots per plan on one laptop.
- No referential integrity in the database: any new code path that deletes
  plans must go through `deletePlan`. Images removed from the editor are
  orphaned until their plan is deleted (tolerated in v1).
- Adding real foreign keys later first requires changing
  `ensureDatabaseSchema` to run `PRAGMA foreign_keys` outside the migration
  transaction; that is a separate effort.
- Reversal cost: moderate. Moving to disk storage means a data migration of
  every BLOB and rewriting the image routes, but no document changes, since
  documents only hold `/api/images/:id` URLs.

## Amended 2026-11-13: polymorphic owner

The Trade journal (doc-7, spec doc-8) adds two more image owners: journal
entries and setups. `images.planId` is replaced by `ownerKind`
(`plan | journal_entry | setup`, check constraint) plus `ownerId`, unique on
`(ownerKind, ownerId, sha256)`; still no foreign key. The upload route
becomes `POST /api/images?ownerKind=&ownerId=` and checks ownership and
editability per kind; `GET` is unchanged. Each owner's delete function
cascades its images by `(ownerKind, ownerId)` inside its transaction. The
migration is a drizzle-kit `__new_images` rebuild with the `SELECT` hand-edited
to `'plan', "planId"` (research `research/journal-image-owner`, task-86).
Alternatives weighed: one image table per owner, or three nullable owner
columns; both multiply code paths for no gain without foreign keys.
