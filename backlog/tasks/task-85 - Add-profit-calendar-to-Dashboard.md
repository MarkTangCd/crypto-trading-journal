---
id: TASK-85
title: Add profit calendar to Dashboard
status: Done
assignee:
  - '@myself'
created_date: '2026-11-13 09:00'
updated_date: '2026-11-13 09:26'
labels: []
dependencies: []
ordinal: 85000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Give the trader a month-at-a-glance review of realized results. The Dashboard gains a Profit calendar: a month grid of Daily PnL (see GLOSSARY.md) for the selected linked account. Numbers are the design: signed figures in win/loss ink, no heatmap fills, no new panels.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Daily PnL = sum of realizedPnlUsd of closed trades bucketed by UTC+8 closeTime day, same bucketing as the Trades page; open trades are excluded
- [x] #2 New tRPC query stats.dailyPnl({ accountId }) returns every day with closed trades as { day: yyyy-mm-dd, pnlUsd, tradeCount }; aggregation lives in server/db.ts, sums with decimal, filters by userId
- [x] #3 Vitest covers the aggregation: UTC+8 day boundary, multiple trades on one day, open trades ignored, empty account
- [x] #4 Dashboard renders the calendar for the selected account between the performance and open sections; it is not rendered when the account has never synced
- [x] #5 Month view defaults to the current UTC+8 month; prev/next controls change month without refetching; cannot navigate past the current month; earlier months without data show an empty grid
- [x] #6 Weeks start on Monday with lowercase mon..sun headers; padding cells outside the month and future days are blank
- [x] #7 A day with trades shows the date, signed Daily PnL in win/loss ink with tabular-nums, and a small trade count; a day without trades shows only a muted date; no background fills or color scale
- [x] #8 Today's date is underlined in ink
- [x] #9 Month header row shows month PnL and winning days / trading days; a month with no closed trades shows 'no closed trades this month.' instead and still renders the grid
- [x] #10 Clicking a day with trades navigates to /trades#yyyy-mm-dd; Trades page day groups carry that id and the page scrolls to it after load; days without trades are not clickable
- [x] #11 No week subtotal column, no in-Dashboard day drill-down, no unrealized PnL in the calendar
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. shared/time.ts: add utc8DayKey(ts) -> 'yyyy-mm-dd' (UTC+8), with a case in shared/time.test.ts
2. server/db.ts: add getDailyPnl(accountId, userId) -> { day, pnlUsd, tradeCount }[] ascending by day; built on listTrades, closed trades only, bucketed by utc8DayKey(closeTime ?? openTime), summed with decimal
3. server/routers.ts: add stats.dailyPnl({ accountId }) behind requireOwnedAccount
4. Tests: integration cases in server/trade.db.test.ts (UTC+8 boundary, multiple trades per day, open ignored, empty account); router case in server/trade.test.ts
5. client/src/components/ProfitCalendar.tsx: month grid (mon..sun), prev/next month state, header with month PnL + winning/trading days, day cells linking to /trades#yyyy-mm-dd
6. client/src/pages/Dashboard.tsx: render ProfitCalendar between performance and open sections (inside the !neverSynced branch)
7. client/src/pages/Trades.tsx: give each day group id=utc8DayKey and scroll to location.hash once trades have loaded
8. Verify: prettier on changed files, npm run check, npm run test, then visual check on a temp-DB dev server (:3100)
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Add a Profit calendar to the Dashboard showing Daily PnL per UTC+8 close day.

- shared/time.ts: utc8DayKey(ts) -> yyyy-mm-dd, used as bucket key and URL anchor
- server/db.ts: getDailyPnl(accountId, userId) sums closed trades per day with decimal (closeTime ?? openTime, matching the Trades page fallback)
- server/routers.ts: stats.dailyPnl({ accountId })
- client/src/components/ProfitCalendar.tsx: Monday-first month grid, client-side month navigation capped at the current UTC+8 month, month PnL + days won header, day cells link to /trades#yyyy-mm-dd
- Dashboard renders it between performance and open; Trades day groups carry the day id and the page scrolls to location.hash once loaded
- Below the sm breakpoint cells show whole-dollar PnL without the trade count so seven columns fit

Tests: shared/time.test.ts, server/trade.db.test.ts (day boundary, multi-trade day, open ignored, empty, user scope), server/trade.test.ts (router). npm run check and full npm run test pass; verified visually on a seeded temp DB at desktop and 390px.
<!-- SECTION:FINAL_SUMMARY:END -->
