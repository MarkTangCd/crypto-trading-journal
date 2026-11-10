---
id: TASK-83
title: 'Plan detail: observations section'
status: To Do
assignee: []
created_date: '2026-11-10 06:51'
updated_date: '2026-11-10 06:51'
labels:
  - ready-for-agent
dependencies:
  - TASK-81
references:
  - backlog/docs/doc-6 - Trading-plan-spec.md
ordinal: 83000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-6, section UI → Observations. Lives in client/src/components/plans/PlanObservations.tsx so PlanDetail.tsx changes by one line and this task can run in parallel with TASK-82 (scenarios). The server stamps the observation time.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 PlanObservations.tsx renders under the observations header, oldest first, with a UTC+8 day + time column from createdAt via shared/time.ts
- [ ] #2 Each observation's content is a PlanEditor autosaving through plan.updateObservation; delete on hover, immediate, no confirmation
- [ ] #3 Composer at the foot (PlanEditor): Cmd+Enter or 'log observation →' calls plan.addObservation; an empty doc (isEmptyDoc) is not sent; the composer clears after success
- [ ] #4 Structured writes invalidate plan.get and plan.list via trpc.useUtils(); failures toast.error; no success toasts
- [ ] #5 Verified on the dev server against a temp copy of the DB on :3100 (see the dev-server UI verification memory), compared with variant A on branch prototype/plans-ui (client/src/components/plans-prototype/VariantA.tsx); read DESIGN.md and PRODUCT.md first
- [ ] #6 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
