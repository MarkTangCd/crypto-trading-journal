---
id: task-3
title: Show planned risk reward in Transactions list
status: To Do
assignee: []
created_date: "2026-06-17"
updated_date: "2026-06-17"
labels: ["frontend", "transactions"]
dependencies: []
priority: medium
---

## Description

Update the Transactions page list so the `r/r` field displays the planned
risk-reward ratio captured when the trade was created. Closing a trade should
not recalculate or replace this display value with the actual profit/loss ratio.

## Acceptance Criteria

- [ ] The Transactions list `r/r` value comes from the trade's planned
      risk-reward ratio.
- [ ] Closing a trade does not change the `r/r` display to an actual realized
      profit/loss ratio.
- [ ] Existing close-trade behavior still records realized close data and P&L
      where applicable.
- [ ] Focused verification covers a closed trade whose displayed `r/r` remains
      the originally planned value.
