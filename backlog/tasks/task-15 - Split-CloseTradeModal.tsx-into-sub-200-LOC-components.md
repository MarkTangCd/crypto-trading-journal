---
id: TASK-15
title: Split CloseTradeModal.tsx into sub-200 LOC components
status: Done
assignee: []
created_date: '2026-06-18 03:51'
updated_date: '2026-06-18 08:27'
labels:
  - tech-debt
  - refactor
  - frontend
dependencies: []
documentation:
  - plans/012-split-close-trade-modal.md
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implementation plan: plans/012-split-close-trade-modal.md. Slim client/src/components/CloseTradeModal.tsx (419 LOC) by extracting the preview math into client/src/lib/closePreview.ts and splitting the modal into TradePlanReadout + CloseInputs + ComputedReadout + NewBalanceHero presentational children under client/src/components/close-trade/, while keeping the public prop shape (open, onOpenChange, trade) byte-identical for both callers. Follow the plan file step-by-step.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Old client/src/components/CloseTradeModal.tsx is deleted; client/src/components/close-trade/CloseTradeModal.tsx exists and is ≤ 200 LOC
- [x] #2 Every other file under client/src/components/close-trade/ ≤ 200 LOC; client/src/lib/closePreview.ts ≤ 100 LOC
- [x] #3 No stale '@/components/CloseTradeModal' import path survives anywhere under client/src
- [x] #4 Transactions.tsx and TransactionDetail.tsx import the modal from the new path
- [x] #5 npm run check, npm test -- --run (104 passed), npm run test:e2e, npm run build all exit 0
- [x] #6 plans/README.md row for plan 012 set to DONE
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Extracted close-preview math into client/src/lib/closePreview.ts (48 LOC). Moved CloseTradeModal.tsx to client/src/components/close-trade/ and split it into presentational children: TradePlanReadout, CloseInputs, ComputedReadout, NewBalanceHero, TradeContextStrip, LegacyWarning. Modal slimmed to 122 LOC via useCloseTradeForm hook. Updated import paths in Transactions.tsx and TransactionDetail.tsx. Verified: tsc, 104 unit tests, Playwright smoke, and build all pass. plans/README.md plan 012 marked DONE.
<!-- SECTION:FINAL_SUMMARY:END -->
