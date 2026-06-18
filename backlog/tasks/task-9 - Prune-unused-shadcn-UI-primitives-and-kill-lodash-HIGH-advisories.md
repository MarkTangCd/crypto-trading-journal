---
id: TASK-9
title: Prune unused shadcn UI primitives and kill lodash HIGH advisories
status: Done
assignee: []
created_date: "2026-06-18 03:51"
updated_date: "2026-06-18 07:43"
labels:
  - tech-debt
  - security
  - frontend
dependencies: []
documentation:
  - plans/006-prune-unused-ui-primitives.md
priority: high
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Implementation plan: plans/006-prune-unused-ui-primitives.md. Delete the 40 unused shadcn primitives under client/src/components/ui/, drop the 29 dependencies whose only callers were those files, and remove the lodash advisory chain via recharts. Follow the plan file step-by-step.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 client/src/components/ui/ contains exactly 13 primitives (the survivors listed in the plan)
- [ ] #2 package.json no longer lists recharts, lodash, framer-motion, @hookform/resolvers, or any of the other 25 deps named in the plan
- [ ] #3 npm ls lodash returns no entries (lodash gone from the production tree)
- [ ] #4 npm run check, npm test -- --run (104 passed), npm run build, and npm run test:e2e all exit 0
- [ ] #5 npm audit --omit=dev reports no HIGH-severity advisories
- [ ] #6 plans/README.md row for plan 006 set to DONE
<!-- AC:END -->
