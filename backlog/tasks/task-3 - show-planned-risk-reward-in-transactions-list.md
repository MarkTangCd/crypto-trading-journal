---
id: task-3
title: Show planned risk reward in Transactions list
status: Done
assignee:
  - "@codex"
created_date: "2026-06-17"
updated_date: "2026-06-17 12:29"
labels:
  - frontend
  - transactions
dependencies: []
modified_files:
  - client/src/pages/Transactions.tsx
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Update the Transactions page list so the `r/r` field displays the planned
risk-reward ratio captured when the trade was created. Closing a trade should
not recalculate or replace this display value with the actual profit/loss ratio.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 The Transactions list `r/r` value comes from the trade's planned
      risk-reward ratio.
- [x] #2 Closing a trade does not change the `r/r` display to an actual realized
      profit/loss ratio.
- [x] #3 Existing close-trade behavior still records realized close data and P&L
      where applicable.
- [x] #4 Focused verification covers a closed trade whose displayed `r/r` remains
    the originally planned value.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Update Transactions list so the r/r column always reads plannedRiskRewardRatio.
2. Keep close-trade backend behavior unchanged so actual riskRewardRatio, returnAmount, outcome, and accountBalance are still persisted.
3. Verify with TypeScript check and relevant tests.
4. Mark acceptance criteria complete after verification.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Updated Transactions list ratio selection to read plannedRiskRewardRatio for every trade status; backend close behavior left unchanged.

Verification passed: npm run check, npm run test, and a read-only Playwright check of /transactions. Closed trade id 40 has plannedRiskRewardRatio 0.99 and actual riskRewardRatio 0.09; the list displayed plan0.99.

<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Updated the Transactions list so the r/r column always displays each trade's plannedRiskRewardRatio, including closed and reviewed trades. Close-trade backend behavior remains unchanged, so actual riskRewardRatio, returnAmount, outcome, accountBalance, and consecutiveLosses are still recorded on close. Verified with TypeScript check, full Vitest suite, and a focused local page check showing a closed trade with planned R/R 0.99 and actual R/R 0.09 rendering as plan0.99 in the list.

<!-- SECTION:FINAL_SUMMARY:END -->
