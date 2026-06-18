---
id: TASK-11
title: Delete unused HttpError module and manus auth types
status: To Do
assignee: []
created_date: '2026-06-18 03:51'
labels:
  - tech-debt
dependencies: []
documentation:
  - plans/008-delete-http-error-and-manus-types.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implementation plan: plans/008-delete-http-error-and-manus-types.md. Delete shared/_core/errors.ts and server/_core/types/manusTypes.ts (both have zero importers), remove the now-empty server/_core/types/ directory, and update CLAUDE.md Error Handling section to point at TRPCError + TradeMathError. Follow the plan file step-by-step.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 shared/_core/errors.ts and server/_core/types/manusTypes.ts no longer exist; server/_core/types/ directory removed
- [ ] #2 grep finds zero references to HttpError or manusTypes across client/server/shared/CLAUDE.md
- [ ] #3 CLAUDE.md Error Handling section no longer mentions HttpError and instead documents TRPCError + TradeMathError translation
- [ ] #4 npm run check exits 0 and npm test -- --run reports 104 passed
- [ ] #5 plans/README.md row for plan 008 set to DONE
<!-- AC:END -->
