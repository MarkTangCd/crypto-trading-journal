---
id: TASK-69
title: compare_with_my_baseline skill reads trades
status: Done
assignee:
  - '@myself'
created_date: '2026-11-05 12:18'
updated_date: '2026-11-05 13:39'
labels:
  - ready-for-agent
dependencies:
  - TASK-62
references:
  - backlog/docs/doc-4 - Exchange-sync-spec.md
ordinal: 69000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After task-62 the review context's 交易ID is a trade id, but server/agents/skills/compareWithMyBaseline.ts still looks it up in transactions (getTransactionById / getTransactionsByUserId), so the skill returns 找不到交易 for every synced trade. Rebase it on trades (exchange facts only; r:r and planned fields no longer exist), spec doc-4 section Review agent.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Skill takes tradeId and loads the target via getTradeById scoped to ctx.userId
- [x] #2 Baseline sample comes from listTrades (exchange facts only); metrics that depended on removed manual fields are dropped or re-derived from exchange facts
- [x] #3 compareWithMyBaseline.test.ts updated to trades fixtures; devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Params: transactionId -> tradeId (same '交易ID' description). Load target via getTradeById(tradeId, ctx.userId); not found -> 找不到交易.
2. Metric: r:r is gone (no planned SL on most synced trades). Rank by net return % = realizedPnlUsd / positionSizeUsdt x 100 (always present on exchange facts). Outcome from realizedPnlUsd sign (win/loss/breakeven, spec derived values). Hold hours = closeTime - openTime.
3. Target must be closed (open -> ok=false, no comparable result yet).
4. Sample: listTrades(target.accountId, ctx.userId, 'closed') (newest openTime first), skip self and openTimeApprox (seeded, hold time unknown) trades; same-pair filters symbol, same-direction filters side; windowSize cap; MIN_SAMPLE 5 unchanged.
5. Rename SampleSummary R fields to return-% fields (medianReturnPct/p25ReturnPct/p75ReturnPct) in _helpers/baseline.ts + its test; interpretation text uses 净收益率 instead of r:r; description updated.
6. Rewrite compareWithMyBaseline.test.ts on Trade fixtures; check + test.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Rebases compare_with_my_baseline on synced trades (spec doc-4, Review agent).

- Param transactionId -> tradeId; target loaded via getTradeById scoped to ctx.userId; open trades return ok=false.
- r:r is gone with the manual fields, so the ranked metric is net return % = realizedPnlUsd / positionSizeUsdt x 100; outcome from realizedPnlUsd sign; hold = closeTime - openTime.
- Sample from listTrades(target.accountId, userId, 'closed'); same-pair / same-direction filter symbol / side in memory; seeded (openTimeApprox) trades are skipped since their hold time is unknown, and an approximate target gets holdHours/holdRank null.
- _helpers/baseline SampleSummary R fields renamed to *ReturnPct; interpretation copy says 净收益率.
- Tests rewritten on Trade fixtures. npm run check and npm run test (488) pass.
<!-- SECTION:FINAL_SUMMARY:END -->
