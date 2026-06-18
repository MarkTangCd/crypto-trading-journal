---
id: TASK-11
title: Delete unused HttpError module and manus auth types
status: Done
assignee: []
created_date: '2026-06-18 03:51'
updated_date: '2026-06-18 07:43'
labels:
  - tech-debt
dependencies: []
documentation:
  - plans/008-delete-http-error-and-manus-types.md
priority: medium
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implementation plan: plans/008-delete-http-error-and-manus-types.md. Delete shared/_core/errors.ts and server/_core/types/manusTypes.ts (both have zero importers), remove the now-empty server/_core/types/ directory, and update CLAUDE.md Error Handling section to point at TRPCError + TradeMathError. Follow the plan file step-by-step.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 shared/_core/errors.ts and server/_core/types/manusTypes.ts no longer exist; server/_core/types/ directory removed
- [x] #2 grep finds zero references to HttpError or manusTypes across client/server/shared/CLAUDE.md
- [x] #3 CLAUDE.md Error Handling section no longer mentions HttpError and instead documents TRPCError + TradeMathError translation
- [x] #4 npm run check exits 0 and npm test -- --run reports 104 passed
- [x] #5 plans/README.md row for plan 008 set to DONE
<!-- AC:END -->



## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Deleted shared/_core/errors.ts (HttpError family) and server/_core/types/manusTypes.ts (dead auth types), removed empty server/_core/types/ directory, dropped stale re-export from shared/types.ts, and updated CLAUDE.md Error Handling to document TRPCError + TradeMathError translation. Verified npm run check (exit 0) and npm test -- --run (104 passed). Merged to main and deleted branch advisor/008-delete-http-error-and-manus-types.
<!-- SECTION:FINAL_SUMMARY:END -->
