---
id: TASK-5
title: Tighten Express JSON body limit to 1mb
status: To Do
assignee: []
created_date: '2026-06-18 01:24'
labels:
  - security
  - server
dependencies: []
documentation:
  - plans/002-tighten-body-limit.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implementation plan: plans/002-tighten-body-limit.md. Drop the 50mb body-parser cap to 1mb (and fix the stale "for file uploads" comment) so the local tRPC surface has a bounded DoS amplifier. Follow the plan file step-by-step.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 server/_core/index.ts express.json and express.urlencoded both use limit "1mb" (or smaller)
- [ ] #2 No "50mb" literal remains in server/_core/index.ts
- [ ] #3 The misleading "for file uploads" comment is removed or rewritten
- [ ] #4 Manual smoke: a long reviewFeedback save does not hit 413
- [ ] #5 npm run check and npm run test both exit 0
<!-- AC:END -->
