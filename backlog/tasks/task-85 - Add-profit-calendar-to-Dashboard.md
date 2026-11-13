---
id: TASK-85
title: Add profit calendar to Dashboard
status: To Do
assignee: []
created_date: '2026-11-13 09:00'
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
- [ ] #1 Daily PnL = sum of realizedPnlUsd of closed trades bucketed by UTC+8 closeTime day, same bucketing as the Trades page; open trades are excluded
- [ ] #2 New tRPC query stats.dailyPnl({ accountId }) returns every day with closed trades as { day: yyyy-mm-dd, pnlUsd, tradeCount }; aggregation lives in server/db.ts, sums with decimal, filters by userId
- [ ] #3 Vitest covers the aggregation: UTC+8 day boundary, multiple trades on one day, open trades ignored, empty account
- [ ] #4 Dashboard renders the calendar for the selected account between the performance and open sections; it is not rendered when the account has never synced
- [ ] #5 Month view defaults to the current UTC+8 month; prev/next controls change month without refetching; cannot navigate past the current month; earlier months without data show an empty grid
- [ ] #6 Weeks start on Monday with lowercase mon..sun headers; padding cells outside the month and future days are blank
- [ ] #7 A day with trades shows the date, signed Daily PnL in win/loss ink with tabular-nums, and a small trade count; a day without trades shows only a muted date; no background fills or color scale
- [ ] #8 Today's date is underlined in ink
- [ ] #9 Month header row shows month PnL and winning days / trading days; a month with no closed trades shows 'no closed trades this month.' instead and still renders the grid
- [ ] #10 Clicking a day with trades navigates to /trades#yyyy-mm-dd; Trades page day groups carry that id and the page scrolls to it after load; days without trades are not clickable
- [ ] #11 No week subtotal column, no in-Dashboard day drill-down, no unrealized PnL in the calendar
<!-- AC:END -->
