---
id: TASK-8
title: Add Playwright smoke-test baseline for trade lifecycle
status: Done
assignee:
  - "@opencode"
created_date: "2026-06-18 01:24"
updated_date: "2026-06-18 07:43"
labels:
  - testing
  - e2e
dependencies: []
documentation:
  - plans/005-playwright-smoke-baseline.md
priority: medium
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Implementation plan: plans/005-playwright-smoke-baseline.md. Wire the already-configured Playwright into an npm script and write one idempotent smoke spec covering create-account, log-open-trade, close-trade, see-win. Follow the plan file step-by-step.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 e2e/smoke.spec.ts exists and uses accessible-name selectors (getByRole/getByLabel), not brittle CSS chains
- [x] #2 package.json adds "test:e2e": "playwright test" to scripts
- [x] #3 CLAUDE.md Commands section lists npm run test:e2e with a one-line note about the one-time playwright install chromium
- [x] #4 .gitignore ignores playwright-report/ and test-results/
- [x] #5 The spec is idempotent: two consecutive runs against the same DB both pass (uses a per-run unique id)
- [x] #6 npm run test:e2e exits 0 against a running npm run dev; npm run check and npm run test unaffected
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Added Playwright smoke-test baseline covering the full trade lifecycle: create account → log open trade → close trade → verify win outcome.

Changes:

- Created e2e/smoke.spec.ts with one idempotent spec using accessible-name selectors (getByRole/getByLabel) throughout.
- Added "test:e2e": "playwright test" to package.json scripts.
- Updated CLAUDE.md Commands section with npm run test:e2e and one-time Chromium install note.
- Updated .gitignore to ignore playwright-report/ and test-results/.
- Verified idempotency: two consecutive runs against the same DB both pass.
- Verified npm run check, npm run test, and npm run test:e2e all exit 0.
<!-- SECTION:FINAL_SUMMARY:END -->
