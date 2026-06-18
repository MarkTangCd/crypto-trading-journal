---
id: TASK-14
title: Split NewTransaction.tsx into sub-200 LOC components
status: To Do
assignee: []
created_date: '2026-06-18 03:51'
labels:
  - tech-debt
  - refactor
  - frontend
dependencies: []
documentation:
  - plans/011-split-new-transaction-page.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implementation plan: plans/011-split-new-transaction-page.md. Slim client/src/pages/NewTransaction.tsx (550 LOC) under the 200 LOC ceiling by lifting pure helpers into client/src/lib/plannedRiskReward.ts and extracting AccountMetaStrip + InstrumentSection + PlanSection + ClassificationSection + ContextSection under client/src/components/new-transaction/, preserving every <label> / htmlFor pair the Playwright smoke spec uses. Follow the plan file step-by-step.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 client/src/pages/NewTransaction.tsx ≤ 200 LOC
- [ ] #2 Each new file under client/src/components/new-transaction/ ≤ 200 LOC
- [ ] #3 client/src/lib/plannedRiskReward.ts ≤ 80 LOC and React-free
- [ ] #4 npm run check, npm test -- --run (104 passed), npm run test:e2e, npm run build all exit 0
- [ ] #5 git status shows changes only in the in-scope files plus plans/README.md
- [ ] #6 plans/README.md row for plan 011 set to DONE
<!-- AC:END -->
