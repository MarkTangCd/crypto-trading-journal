---
id: TASK-69
title: compare_with_my_baseline skill reads trades
status: To Do
assignee: []
created_date: '2026-11-05 12:18'
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
- [ ] #1 Skill takes tradeId and loads the target via getTradeById scoped to ctx.userId
- [ ] #2 Baseline sample comes from listTrades (exchange facts only); metrics that depended on removed manual fields are dropped or re-derived from exchange facts
- [ ] #3 compareWithMyBaseline.test.ts updated to trades fixtures; devbox run -- npm run check and npm run test pass
<!-- AC:END -->
