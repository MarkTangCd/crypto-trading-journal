---
id: TASK-72
title: Prototype the Plans pages
status: To Do
assignee: []
created_date: '2026-11-10 03:09'
labels:
  - 'wayfinder:prototype'
dependencies:
  - TASK-70
references:
  - backlog/docs/doc-5 - Trading-plan-map.md
ordinal: 72000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

How should the Plans pages look and behave inside the bench-notebook design (DESIGN.md, PRODUCT.md)? Run through /impeccable and produce 2 to 3 variants on a prototype/plans-ui branch for the trader to react to in the browser.

Screens: /plans (create by symbol only, then jump to the detail; open plans first, closed plans grouped by UTC+8 day; one line per plan with symbol, scenario count and outcomes once closed) and /plans/:id (market context editor, scenarios with name / long-short / primary timeframe 15m 30m 1H 4H 12H 1D / content, observations appended with their UTC+8 time, a quiet 'saved hh:mm' indicator, delete with confirmation, and the close panel that demands a triggered / invalidated verdict for every scenario before the plan can close; closed plans render read-only with a reopen action). Nav item 'Plans' sits between Goals and Trades.

Use the editor recommended by the rich-text research ticket; images may stay base64 in the prototype. Record which variant or mix was chosen and every UX decision it settles.
<!-- SECTION:DESCRIPTION:END -->
