---
id: TASK-80
title: 'Plans list page, nav item and routes'
status: To Do
assignee: []
created_date: '2026-11-10 06:50'
updated_date: '2026-11-10 06:51'
labels:
  - ready-for-agent
dependencies:
  - TASK-79
references:
  - backlog/docs/doc-6 - Trading-plan-spec.md
ordinal: 80000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-6, section UI → Nav and /plans; layout reference is variant A on branch prototype/plans-ui. The detail route is registered here as a React.lazy placeholder that TASK-81 replaces.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 DashboardLayout gets the English nav item Plans at /plans between Goals and Trades, active on /plans/:id too
- [ ] #2 App.tsx routes /plans → client/src/pages/Plans.tsx and /plans/:id → a React.lazy client/src/pages/PlanDetail.tsx (placeholder in this task) inside Suspense with a loading block
- [ ] #3 Plans.tsx: title; one symbol input uppercased as typed with a datalist from plan.symbolSuggestions and 'open plan →', which calls plan.create and navigates to /plans/:id; a rejected symbol surfaces toast.error
- [ ] #4 Section 'open · n': one line per open plan, newest first — open-for duration, symbol, scenario and observation counts; each line links to its detail page
- [ ] #5 Closed plans grouped by UTC+8 close day via shared/time.ts, one line each — close hh:mm, symbol, outcome glyphs (● triggered, ○ invalidated) in ink, 'n triggered · m invalidated' or '—' for zero scenarios
- [ ] #6 Explicit empty state when there are no plans; loading block while plan.list loads
- [ ] #7 Verified on the dev server against a temp copy of the DB on :3100 (see the dev-server UI verification memory), compared with variant A on branch prototype/plans-ui (client/src/components/plans-prototype/VariantA.tsx); read DESIGN.md and PRODUCT.md first
- [ ] #8 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
