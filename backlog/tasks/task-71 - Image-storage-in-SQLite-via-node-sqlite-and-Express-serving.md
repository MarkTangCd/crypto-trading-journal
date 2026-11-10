---
id: TASK-71
title: 'Image storage in SQLite via node:sqlite and Express serving'
status: Done
assignee: []
created_date: '2026-11-10 03:09'
updated_date: '2026-11-10 03:24'
labels:
  - 'wayfinder:research'
dependencies: []
references:
  - backlog/docs/doc-5 - Trading-plan-map.md
ordinal: 71000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

How should pasted screenshots be stored as BLOBs in the project's SQLite database and served back to the browser?

Settled on the Trading plan map (doc-5): images live in an images table (not on disk, not base64 in the document), owned by a planId and cascade-deleted with the plan; png/jpeg/webp/gif only, 10 MB per image, sha256 dedupe within a plan; written via POST /api/images and read via GET /api/images/:id as Express routes (tRPC does not carry binary); the existing express.json limit stays at 1 mb.

Resolve against primary docs and a local spike: (1) whether drizzle-orm sqlite-proxy over node:sqlite DatabaseSync (see server/db.ts) round-trips blob columns as Uint8Array on insert and select, and what the drizzle-kit migration emits for a blob column; (2) the Express route shape: express.raw with a 10 mb limit scoped to the image route, mime detection from magic bytes vs Content-Type, sha256 dedupe, response Content-Type, ETag and immutable Cache-Control, 404 path; (3) memory behaviour for a 10 MB blob with node:sqlite (whole-buffer vs incremental blob I/O) and whether streaming matters at this size; (4) how the route should be registered next to the tRPC middleware in server/_core/index.ts and served in both dev (Vite) and prod. Capture findings on branch research/plan-image-storage.
<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Blob round-trip: yes — drizzle blob('bytes',{mode:'buffer'}) over the sqlite-proxy callback on node:sqlite DatabaseSync (Node 22.22.3) round-trips Buffer/Uint8Array in → Buffer out via .all(); drizzle-kit emits `bytes` blob NOT NULL. Gotcha: the db.ts callback returns a nested array for method 'get', so drizzle .get() is broken (unused today) — keep using .all()/limit(1). Route shape: Router mounted at /api/images before setupVite/serveStatic; POST /api/images?planId=N with express.raw({ type: [png,jpeg,webp,gif], limit: 10 MiB }) on that handler only (json limit untouched; 413 via error handler); MIME decided by WHATWG magic bytes, Content-Type only gates; sha256 lookup on (planId, sha256) + unique index; user via createContext, plan ownership via a separate plans WHERE id AND userId query (no joins through the Object.values proxy), 409 on closed plans, userId stored and filtered on GET. Cache headers: Content-Type from stored mime, strong ETag "<sha256>", Cache-Control: private, max-age=31536000, immutable, X-Content-Type-Options: nosniff; res.send(Buffer) gives Content-Length and 304 on If-None-Match (verified; note Node fetch adds cache-control: no-cache). sendStatus(404) for unknown/foreign ids. Memory: whole-buffer, no incremental blob API in node:sqlite; 10 MB GET peaks ~2x (driver Uint8Array + drizzle Buffer copy) for ~3 ms — streaming not needed. Critical: do NOT use a DB-level ON DELETE CASCADE FK — PRAGMA foreign_keys=OFF is a no-op inside the BEGIN IMMEDIATE that ensureDatabaseSchema wraps around migrations, so a future drizzle-kit rebuild of plans would delete all images (reproduced); cascade in app code inside runInSqliteTransaction. Findings: docs/research/plan-image-storage.md on branch research/plan-image-storage.
<!-- SECTION:FINAL_SUMMARY:END -->
