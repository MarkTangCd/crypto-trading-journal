---
id: TASK-62
title: >-
  Review agent on trades: conversations by tradeId, contextBuilder and
  getRecentTrades
status: Done
assignee:
  - '@myself'
created_date: '2026-11-04 12:43'
updated_date: '2026-11-05 12:21'
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
- [x] #1 server/db.ts: getConversationByTrade(userId, tradeId) and getOrCreateConversation keyed by tradeId; conversations.transactionId is no longer written anywhere
- [x] #2 reviewAgent.getActive / open / send / list take tradeId; server/agents/reviewAgent.ts and server/\_core/reviewAgentSseRoute.ts load the trade and reject a missing one with NOT_FOUND
- [x] #3 server/agents/contextBuilder.ts renders the trade from exchange facts only (no timeFrame, tradingLogic, context, tradeItems, marketCycle, planned fields, review text); same-direction recent trades come from listTrades; kline block anchored at openTime with one documented default interval
- [x] #4 server/agents/skills/getRecentTrades.ts reads listTrades and returns the same exchange facts; its skill description no longer mentions manual fields
- [x] #5 client/src/components/review-agent/\* use tradeId; TransactionDetail compiles by passing its route id
- [x] #6 contextBuilder.test.ts, getRecentTrades.test.ts, reviewAgent.db.test.ts, reviewAgent.router.test.ts, reviewAgent.stream.test.ts updated to trades fixtures
- [x] #7 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. db.ts: getConversationByTransaction -> getConversationByTrade(userId, tradeId); getOrCreateConversation keyed by tradeId (writes tradeId, never transactionId).
2. reviewAgent.ts: getActiveConversation / openConversation take tradeId / trade: Trade.
3. routers.ts reviewAgent: getActive/open take tradeId, load via getTradeById -> NOT_FOUND. send/list/SSE stay keyed by conversationId (ownership already enforced) - pending user decision.
4. contextBuilder.ts: render trade exchange facts only (symbol, side, open/close UTC+8 + openTimeApprox note, status, entry/exit/SL/TP, quantity, positionSizeUsdt, feeUsd, realizedPnlUsd); drop timeFrame/logic/tradeItems/outcome/planned/review sections; account state = balanceUsdt + getTradeStats.losingStreak; recent same symbol+side from listTrades (limit 5); kline anchored at openTime with KLINE_INTERVAL = 1H.
5. getRecentTrades skill: listTrades across the user's accounts, merged openTime desc; filters symbol/side/status; returns exchange facts + UTC+8 texts; description updated.
6. Client: AgentDrawer/AgentDrawerToggle tradeId; TransactionDetail passes its route id.
7. Update contextBuilder/getRecentTrades/reviewAgent.db/router/stream tests to trades fixtures.
8. prettier on touched files, check, test.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Review agent now reads trades (spec doc-4, Review agent).

- db.ts: getConversationByTrade(userId, tradeId); getOrCreateConversation keyed by and writing tradeId only (transactionId never written).
- reviewAgent.ts / routers.ts: reviewAgent.getActive and open take tradeId, load via getTradeById, missing -> NOT_FOUND (was FORBIDDEN). Per decision with the trader, send / list / SSE stream stay keyed by conversationId (ownership already enforced; trades only disappear with their conversations via account cascade), so reviewAgentSseRoute.ts is unchanged.
- contextBuilder.ts: exchange facts only (id, symbol, side, open/close UTC+8 with '（近似）' when openTimeApprox, status, net PnL, entry/exit, SL/TP, quantity, size, fees). Manual sections (timeFrame, logic, tradeItems, outcome, planned/r:r, review notes) dropped; system prompt unchanged. Account state = balanceUsdt ('未知' when null) + getTradeStats.losingStreak. Recent same symbol+side trades from listTrades, newest openTime first, max 5.
- Kline: anchored at openTime, fixed default interval KLINE_INTERVAL = '1H', ±100 candles (fog item: revisit interval choice).
- getRecentTrades skill: listTrades over all the user's accounts merged by openTime desc; filters symbol/side/status (outcome filter dropped); returns exchange facts + UTC+8 texts; description rewritten.
- Client: AgentDrawer / AgentDrawerToggle take tradeId; TransactionDetail passes its route id.
- Tests updated to trades fixtures (contextBuilder, getRecentTrades, reviewAgent db/router/stream) incl. new getActive cases.
- npm run check and npm run test (484 tests) pass.

Follow-up: task-69 rebases compare_with_my_baseline on trades (it still reads transactions).
<!-- SECTION:FINAL_SUMMARY:END -->
