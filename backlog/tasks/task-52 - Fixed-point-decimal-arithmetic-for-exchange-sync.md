---
id: TASK-52
title: Fixed-point decimal arithmetic for exchange sync
status: Done
assignee:
  - "@myself"
created_date: "2026-11-04 12:42"
updated_date: "2026-11-04 13:06"
labels:
  - ready-for-agent
dependencies: []
references:
  - backlog/docs/doc-4 - Exchange-sync-spec.md
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Spec doc-4 locked decision 12: prices, quantities and money are fixed-point decimal strings, never Number. server/\_core/fixedPoint.ts has normalize/compare/add; reconstruction (seeds, weighted averages, pro-rata fees, PnL identity) also needs subtraction, multiplication, division, abs, min, sign tests. server/db.ts keeps a private addDecimalStrings wrapper that the spec says moves to the shared module.

Pure module, no DB, no network. Round half-up to the requested scale on division; other operations are exact.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 div rounds half-up to scale decimals; sub/mul are exact; results are normalized (no trailing zeros, no -0)
- [x] #2 devbox run -- npm run check and npm run test pass
- [x] #3 server/\_core/decimal.ts exports add, sub, mul, div(a, b, scale), compare, abs, min, negate, isZero, isNegative and normalize; all take and return decimal strings; exact arbitrary scale on BigInt (fixedPoint.ts stays the 2-dp money helper for the manual-entry stats that task-68 deletes)
- [x] #4 server/\_core/decimal.test.ts covers each function including negative, zero, mixed-scale, large-magnitude and half-up tie inputs; malformed input and division by zero throw
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

Finding: server/\_core/fixedPoint.ts is locked to SCALE = 2 (money cents). normalize/compare/add round every input to cents first; tests assert compare('1.234','1.23') === 0 and add(['1.005','1.005']) === '2.02'. Prices (8 dp) and quantities (3+ dp) cannot go through it, so the exact family cannot share add/compare under those names without breaking the money semantics db.ts getStatistics relies on (ZERO_DECIMAL '0.00', decimalToCents).

Plan (option A, recommended):

1. New module server/\_core/decimal.ts: exact arbitrary-scale decimal strings on BigInt. Internal representation { units: bigint, scale: number }; parse validates with the same DECIMAL_INPUT_PATTERN, align scales before add/sub/compare, mul adds scales, div(a, b, scale) rounds half-up (away from zero on ties), every result formatted with trailing zeros stripped and no -0.
2. Exports: add(values), sub(a, b), mul(a, b), div(a, b, scale), compare(a, b), abs, min, negate, isZero, isNegative. Division by zero throws.
3. server/\_core/decimal.test.ts: each function with negative, zero, mixed-scale, large-magnitude and half-up tie cases; malformed input throws.
4. fixedPoint.ts and db.ts untouched: they serve the manual-entry stats path that task-68 deletes; AC 3 (move addDecimalStrings) is dropped and AC 1 re-pointed at decimal.ts.
5. devbox run -- npm run format, check, test.

Option B (not recommended): extend fixedPoint.ts and make add/compare exact; breaks the existing 2-dp tests and changes the formatting of every stats string in db.ts for code that is being deleted anyway.

<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Added server/\_core/decimal.ts: exact arbitrary-scale decimal-string arithmetic on BigInt (add, sub, mul, div with half-up rounding to a given scale, compare, abs, min, negate, isZero, isNegative, normalize). Results carry no trailing zeros and no signed zero; malformed input and division by zero throw.

Deviation from the original ticket: server/\_core/fixedPoint.ts turned out to be locked to 2 decimal places (money cents), with tests asserting compare('1.234','1.23') === 0, so it cannot host price/quantity arithmetic. Agreed with the trader to leave fixedPoint.ts and the db.ts addDecimalStrings wrapper untouched; both serve the manual-entry stats path that task-68 deletes. Acceptance criteria were re-pointed at decimal.ts.

Later tasks (reconstruction, Binance fee conversion, DB stats) import from server/\_core/decimal.ts. 14 new tests; full suite 394 passing; npm run check clean.

<!-- SECTION:FINAL_SUMMARY:END -->
