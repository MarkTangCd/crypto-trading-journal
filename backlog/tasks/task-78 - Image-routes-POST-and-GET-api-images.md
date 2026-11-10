---
id: TASK-78
title: 'Image routes: POST and GET /api/images'
status: Done
assignee:
  - '@myself'
created_date: '2026-11-10 06:49'
updated_date: '2026-11-10 08:38'
labels:
  - ready-for-agent
dependencies:
  - TASK-77
references:
  - backlog/docs/doc-6 - Trading-plan-spec.md
ordinal: 78000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-6, section Image routes; decision-3; findings in research/plan-image-storage. server/_core/imageRoutes.ts exports a Router factory mountImageRoutes(), mounted app.use("/api/images", mountImageRoutes()) in server/_core/index.ts next to the SSE routers, before setupVite / serveStatic. User comes from createContext exactly as reviewAgentSseRoute.ts does.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 POST /api/images?planId=N uses express.raw({ type: IMAGE_MIME_TYPES, limit: MAX_IMAGE_BYTES, inflate: false }) on this handler only; express.json stays 1 mb
- [x] #2 POST answers 400 for a bad planId, 404 for an unknown or foreign plan, 409 for a closed plan, 415 when the Content-Type is not allowed or the magic bytes match none of png/jpeg/webp/gif; the stored mime is the sniffed type
- [x] #3 POST hashes with sha256: an existing (planId, sha256) answers 200 { id }, otherwise insert and 201 { id }; a unique-index race is caught and re-selected; over-limit bodies answer 413 JSON { error } from a router error handler
- [x] #4 GET /api/images/:id answers 404 for non-integer, unknown or foreign ids; a hit sends Content-Type <mime>, ETag "<sha256>", Cache-Control private, max-age=31536000, immutable and X-Content-Type-Options nosniff, and 304 on a matching If-None-Match; a trailing 404 handler keeps /api/images off the SPA catch-all
- [x] #5 server/_core/imageRoutes.test.ts runs Express on an ephemeral port and sends requests with node:http (not fetch) covering 201, dedupe 200 with the same id, 400, 404, 409, 413, both 415 cases, the sniffed mime, GET headers, GET 404 and 304
- [x] #6 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. server/_core/imageRoutes.ts: mountImageRoutes() Router factory (reviewAgentSseRoute style)
   - POST / with express.raw({ type: IMAGE_MIME_TYPES, limit: MAX_IMAGE_BYTES, inflate: false }) on the handler only: planId zod coerce -> 400; createContext user; getPlanRow -> 404, closedAt -> 409; !Buffer.isBuffer(body) -> 415; local sniffImageMime (WHATWG png/jpeg/gif/webp patterns) -> 415; sha256; findImageBySha hit -> 200 { id }; insertImage -> 201 { id }; insert throw -> re-select, hit -> 200 else rethrow
   - GET /:id: zod coerce id else 404; getImage(user, id) else 404; Content-Type, strong ETag, Cache-Control private immutable, nosniff; res.send(bytes) (Express answers 304)
   - Router error handler: entity.too.large -> 413 { error }; other body-parser 4xx -> status { error }; else [Images] log + 500 { error }; trailing router.use -> sendStatus(404)
   - POST error bodies are JSON { error } throughout so the editor can toast them
2. server/_core/index.ts: app.use("/api/images", mountImageRoutes()) after the SSE routers, before setupVite/serveStatic
3. server/_core/imageRoutes.test.ts: vi.mock("../db") with an in-memory image/plan store; Express app with express.json 1mb + the router + a trailing '*' SPA stand-in on an ephemeral port; requests via node:http. Cases: 201, dedupe 200 same id, 400, 404 foreign/unknown, 409 closed, 413 (MAX+1, and MAX exactly accepted), 415 content-type, 415 magic bytes, stored mime is sniffed (png sent as image/jpeg), webp/gif/jpeg sniff, race re-select, GET headers + bytes, GET 404 (abc, unknown, foreign), 304 on If-None-Match, /api/images/ prefix 404 not SPA
4. format, check, test
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Image routes for plans (spec doc-6 Image routes, decision-3).

- server/_core/imageRoutes.ts: mountImageRoutes() Router factory, mounted app.use("/api/images", ...) in server/_core/index.ts after the SSE routers, before setupVite/serveStatic. User via createContext like the SSE routes.
- POST /?planId=N: express.raw({ type: IMAGE_MIME_TYPES, limit: MAX_IMAGE_BYTES, inflate: false }) on this handler only; 400 bad planId, 404 unknown/foreign plan, 409 closed, 415 disallowed Content-Type or unknown magic bytes (local WHATWG sniff table: png, jpeg, gif87a/89a, webp RIFF....WEBPVP); stored mime is the sniffed one; sha256 dedupe 200 { id } else 201 { id }; insert failure re-selects (unique-index race) else rethrows.
- GET /:id: 404 for non-integer/unknown/foreign; Content-Type, strong ETag "<sha256>", Cache-Control private, max-age=31536000, immutable, X-Content-Type-Options nosniff; Express answers 304.
- Router error handler: body-parser 4xx (413 entity.too.large) as JSON { error: <type> }, else [Images] log + 500 JSON; trailing sendStatus(404) keeps the prefix off the SPA catch-all.
- Beyond the spec: every POST error answers JSON { error } (not only 413) for the editor's toasts; handlers wrap in try/catch -> next(error) because Express 4.22 does not forward rejected async handlers.
- server/_core/imageRoutes.test.ts: 19 tests over node:http with an in-memory db mock (201, dedupe, race re-select, sniffed mime for all four types, five bad planIds, 404, 409, two 415 Content-Types, 415 magic bytes, MAX accepted / MAX+1 413 JSON, GET headers + bytes, 304, GET 404s, prefix 404, JSON 1 mb limit intact).
- Smoke on a real temp SQLite with the real db functions: 3 MB png upload 201, re-upload 200 same id, GET bytes equal, 304, closed plan 409, 404 after deletePlan.
- check passes; full suite 446 tests pass.
<!-- SECTION:FINAL_SUMMARY:END -->
