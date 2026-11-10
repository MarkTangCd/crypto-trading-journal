---
id: TASK-78
title: 'Image routes: POST and GET /api/images'
status: To Do
assignee: []
created_date: '2026-11-10 06:49'
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
- [ ] #1 POST /api/images?planId=N uses express.raw({ type: IMAGE_MIME_TYPES, limit: MAX_IMAGE_BYTES, inflate: false }) on this handler only; express.json stays 1 mb
- [ ] #2 POST answers 400 for a bad planId, 404 for an unknown or foreign plan, 409 for a closed plan, 415 when the Content-Type is not allowed or the magic bytes match none of png/jpeg/webp/gif; the stored mime is the sniffed type
- [ ] #3 POST hashes with sha256: an existing (planId, sha256) answers 200 { id }, otherwise insert and 201 { id }; a unique-index race is caught and re-selected; over-limit bodies answer 413 JSON { error } from a router error handler
- [ ] #4 GET /api/images/:id answers 404 for non-integer, unknown or foreign ids; a hit sends Content-Type <mime>, ETag "<sha256>", Cache-Control private, max-age=31536000, immutable and X-Content-Type-Options nosniff, and 304 on a matching If-None-Match; a trailing 404 handler keeps /api/images off the SPA catch-all
- [ ] #5 server/_core/imageRoutes.test.ts runs Express on an ephemeral port and sends requests with node:http (not fetch) covering 201, dedupe 200 with the same id, 400, 404, 409, 413, both 415 cases, the sniffed mime, GET headers, GET 404 and 304
- [ ] #6 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
