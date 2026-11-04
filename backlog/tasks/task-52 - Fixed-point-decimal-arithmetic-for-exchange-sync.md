---
id: TASK-52
title: Fixed-point decimal arithmetic for exchange sync
status: To Do
assignee: []
created_date: '2026-11-04 12:42'
labels:
  - ready-for-agent
dependencies: []
references:
  - backlog/docs/doc-4 - Exchange-sync-spec.md
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-4 locked decision 12: prices, quantities and money are fixed-point decimal strings, never Number. server/_core/fixedPoint.ts has normalize/compare/add; reconstruction (seeds, weighted averages, pro-rata fees, PnL identity) also needs subtraction, multiplication, division, abs, min, sign tests. server/db.ts keeps a private addDecimalStrings wrapper that the spec says moves to the shared module.

Pure module, no DB, no network. Round half-up to the requested scale on division; other operations are exact.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 server/_core/fixedPoint.ts exports sub, mul, div(a, b, scale), abs, min, negate, isZero, isNegative alongside the existing normalize/compare/add; all take and return decimal strings
- [ ] #2 div rounds half-up to scale decimals; sub/mul are exact; results are normalized (no trailing zeros, no -0)
- [ ] #3 server/db.ts calls the shared add instead of its private addDecimalStrings wrapper; no behaviour change in getStatistics
- [ ] #4 server/_core/fixedPoint.test.ts covers each new function including negative, zero and mixed-scale inputs
- [ ] #5 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
