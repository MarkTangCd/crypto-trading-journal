---
id: TASK-4
title: Bind HTTP server to loopback only
status: Done
assignee:
  - "@agent"
created_date: "2026-06-18 01:23"
updated_date: "2026-06-18 01:29"
labels:
  - security
  - server
dependencies: []
documentation:
  - plans/001-bind-loopback.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Implementation plan: plans/001-bind-loopback.md. Bind the Express HTTP listener (and its port probe) to 127.0.0.1 so the anonymous tRPC surface is unreachable from the LAN. Follow the plan file step-by-step.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 server/\_core/index.ts main server.listen call binds to "127.0.0.1"
- [x] #2 server/\_core/index.ts isPortAvailable probe binds to "127.0.0.1"
- [x] #3 Manual smoke: curl loopback returns 200, curl LAN IP refuses connection (or N/A on no-LAN host)
- [x] #4 npm run check and npm run test both exit 0
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Bound Express HTTP listener and port-availability probe to 127.0.0.1 in server/\_core/index.ts. This prevents the anonymous tRPC surface from being reachable from the LAN. Smoke-tested: loopback returns HTTP 403 (connection succeeds), LAN IP returns connection failure. npm run check and npm run test both pass.

<!-- SECTION:FINAL_SUMMARY:END -->
