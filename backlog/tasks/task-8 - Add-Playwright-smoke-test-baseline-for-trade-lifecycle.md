---
id: TASK-8
title: Add Playwright smoke-test baseline for trade lifecycle
status: To Do
assignee: []
created_date: '2026-06-18 01:24'
labels:
  - testing
  - e2e
dependencies: []
documentation:
  - plans/005-playwright-smoke-baseline.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implementation plan: plans/005-playwright-smoke-baseline.md. Wire the already-configured Playwright into an npm script and write one idempotent smoke spec covering create-account, log-open-trade, close-trade, see-win. Follow the plan file step-by-step.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 e2e/smoke.spec.ts exists and uses accessible-name selectors (getByRole/getByLabel), not brittle CSS chains
- [ ] #2 package.json adds "test:e2e": "playwright test" to scripts
- [ ] #3 CLAUDE.md Commands section lists npm run test:e2e with a one-line note about the one-time playwright install chromium
- [ ] #4 .gitignore ignores playwright-report/ and test-results/
- [ ] #5 The spec is idempotent: two consecutive runs against the same DB both pass (uses a per-run unique id)
- [ ] #6 npm run test:e2e exits 0 against a running npm run dev; npm run check and npm run test unaffected
<!-- AC:END -->
