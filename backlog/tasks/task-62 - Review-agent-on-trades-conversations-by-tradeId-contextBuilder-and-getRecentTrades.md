---
id: TASK-62
title: >-
  Review agent on trades: conversations by tradeId, contextBuilder and
  getRecentTrades
status: To Do
assignee: []
created_date: '2026-11-04 12:43'
updated_date: '2026-11-04 12:44'
labels:
  - ready-for-agent
dependencies:
  - TASK-61
references:
  - backlog/docs/doc-4 - Exchange-sync-spec.md
ordinal: 62000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-4 section Review agent. The per-trade AI review stays (decision-2) but reads trades: exchange facts only (symbol, side, open/close time in UTC+8, entry / exit / stop / target, quantity, size, fees, net PnL, openTimeApprox). The prompt keeps its current shape minus the removed fields; what to tell the model when there is no written thesis is still map fog, so do not design new prompt content here.

The kline block in contextBuilder currently uses transaction.timeFrame, which trades do not have: anchor at openTime with one fixed default interval and state the chosen interval in the final summary so the fog item can revisit it.

Client: AgentDrawer / AgentDrawerToggle take tradeId instead of transactionId; the existing TransactionDetail page passes its id through so it keeps compiling until the trade detail page replaces it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 server/db.ts: getConversationByTrade(userId, tradeId) and getOrCreateConversation keyed by tradeId; conversations.transactionId is no longer written anywhere
- [ ] #2 reviewAgent.getActive / open / send / list take tradeId; server/agents/reviewAgent.ts and server/_core/reviewAgentSseRoute.ts load the trade and reject a missing one with NOT_FOUND
- [ ] #3 server/agents/contextBuilder.ts renders the trade from exchange facts only (no timeFrame, tradingLogic, context, tradeItems, marketCycle, planned fields, review text); same-direction recent trades come from listTrades; kline block anchored at openTime with one documented default interval
- [ ] #4 server/agents/skills/getRecentTrades.ts reads listTrades and returns the same exchange facts; its skill description no longer mentions manual fields
- [ ] #5 client/src/components/review-agent/* use tradeId; TransactionDetail compiles by passing its route id
- [ ] #6 contextBuilder.test.ts, getRecentTrades.test.ts, reviewAgent.db.test.ts, reviewAgent.router.test.ts, reviewAgent.stream.test.ts updated to trades fixtures
- [ ] #7 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
