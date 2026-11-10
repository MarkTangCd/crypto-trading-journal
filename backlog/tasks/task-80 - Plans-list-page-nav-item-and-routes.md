---
id: TASK-80
title: 'Plans list page, nav item and routes'
status: Done
assignee:
  - '@myself'
created_date: '2026-11-10 06:50'
updated_date: '2026-11-10 10:26'
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
- [x] #1 DashboardLayout gets the English nav item Plans at /plans between Goals and Trades, active on /plans/:id too
- [x] #2 App.tsx routes /plans → client/src/pages/Plans.tsx and /plans/:id → a React.lazy client/src/pages/PlanDetail.tsx (placeholder in this task) inside Suspense with a loading block
- [x] #3 Plans.tsx: title; one symbol input uppercased as typed with a datalist from plan.symbolSuggestions and 'open plan →', which calls plan.create and navigates to /plans/:id; a rejected symbol surfaces toast.error
- [x] #4 Section 'open · n': one line per open plan, newest first — open-for duration, symbol, scenario and observation counts; each line links to its detail page
- [x] #5 Closed plans grouped by UTC+8 close day via shared/time.ts, one line each — close hh:mm, symbol, outcome glyphs (● triggered, ○ invalidated) in ink, 'n triggered · m invalidated' or '—' for zero scenarios
- [x] #6 Explicit empty state when there are no plans; loading block while plan.list loads
- [x] #7 Verified on the dev server against a temp copy of the DB on :3100 (see the dev-server UI verification memory), compared with variant A on branch prototype/plans-ui (client/src/components/plans-prototype/VariantA.tsx); read DESIGN.md and PRODUCT.md first
- [x] #8 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. DashboardLayout: add Plans (NotebookPen icon, /plans) between Goals and Trades; existing longest-prefix matching keeps it active on /plans/:id.
2. App.tsx: route /plans -> pages/Plans.tsx; /plans/:id -> React.lazy pages/PlanDetail.tsx inside Suspense with the centered Loader2 loading block.
3. PlanDetail.tsx placeholder: '← plans' link and the plan id; TASK-81 replaces it.
4. Plans.tsx (variant A ledger, Goals.tsx page pattern): title + label; symbol input uppercased as typed with datalist from plan.symbolSuggestions; 'open plan →' calls plan.create, navigates to /plans/:id; BAD_REQUEST -> toast.error('invalid symbol'), other errors -> toast.error(message).
5. 'open · n' section: rows link to detail — fmtDuration(createdAt, now), symbol, scenario/observation counts. Closed sections grouped by fmtDate(closedAt) (UTC+8): hh:mm, symbol, glyphs (● / ○ / · for no verdict) in ink, 'n triggered · m invalidated' or '—'. Order comes from listPlans.
6. Empty state when no plans; Loader2 block while loading.
7. Verify on :3100 with temp DB copy + seeded plans, screenshot, compare with variant A; format, check, test.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Add the Plans list page, nav item and routes.

- DashboardLayout: Plans (NotebookPen, /plans) between Goals and Trades; the existing longest-prefix match keeps it active on /plans/:id.
- App.tsx: /plans -> pages/Plans.tsx; /plans/:id -> React.lazy pages/PlanDetail.tsx inside Suspense with the centered Loader2 block. PlanDetail.tsx is a placeholder ('← plans' + plan id) for TASK-81.
- Plans.tsx (variant A ledger): symbol input uppercased as typed with datalist from plan.symbolSuggestions; 'open plan →' creates and navigates; BAD_REQUEST toasts 'invalid symbol' (zod message is raw JSON), other errors their message. 'open · n' rows: open-for duration, symbol, pluralised counts. Closed rows grouped by UTC+8 close day (fmtDate): hh:mm, symbol, ink glyphs (● / ○ / · no verdict, aria-hidden), tally or '—'. Order comes from listPlans. Explicit empty state; loading block.

Verified on :3100 against a temp DB copy with seeded open / closed / zero-scenario / cross-day plans: layout matches variant A, invalid symbol toasts, valid symbol navigates to /plans/:id with Plans still active, empty state renders. npm run check and npm run test (499) pass.
<!-- SECTION:FINAL_SUMMARY:END -->
