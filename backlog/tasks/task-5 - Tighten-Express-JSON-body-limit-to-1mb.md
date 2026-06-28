---
id: TASK-5
title: Tighten Express JSON body limit to 1mb
status: Done
assignee: []
created_date: "2026-06-18 01:24"
updated_date: "2026-06-18 07:43"
labels:
  - security
  - server
dependencies: []
documentation:
  - plans/002-tighten-body-limit.md
priority: high
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Implementation plan: plans/002-tighten-body-limit.md. Drop the 50mb body-parser cap to 1mb (and fix the stale "for file uploads" comment) so the local tRPC surface has a bounded DoS amplifier. Follow the plan file step-by-step.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 server/\_core/index.ts express.json and express.urlencoded both use limit "1mb" (or smaller)
- [x] #2 No "50mb" literal remains in server/\_core/index.ts
- [x] #3 The misleading "for file uploads" comment is removed or rewritten
- [x] #4 Manual smoke: a long reviewFeedback save does not hit 413
- [x] #5 npm run check and npm run test both exit 0
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Tightened Express JSON and urlencoded body limits from 50mb to 1mb in server/\_core/index.ts. Removed the misleading 'for file uploads' comment and replaced it with an accurate note about tRPC payload sizes. Manual smoke test verified that a 560KB reviewFeedback text saves successfully without triggering 413. npm run check and npm run test both pass.

<!-- SECTION:FINAL_SUMMARY:END -->
