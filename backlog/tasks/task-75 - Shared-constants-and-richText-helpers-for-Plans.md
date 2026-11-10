---
id: TASK-75
title: Shared constants and richText helpers for Plans
status: To Do
assignee: []
created_date: '2026-11-10 06:49'
labels:
  - ready-for-agent
dependencies: []
references:
  - backlog/docs/doc-6 - Trading-plan-spec.md
ordinal: 75000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-6, section Shared constants and helpers. Additive: the new constants have no consumers yet except the moved TRADING_PAIR_RE. shared/richText.ts must not import Tiptap so drizzle/schema.ts and the server stay free of editor packages.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 shared/const.ts exports SCENARIO_TIME_FRAMES (15m 30m 1H 4H 12H 1D) with ScenarioTimeFrame, SCENARIO_SIDES, SCENARIO_OUTCOMES, SCENARIO_NAME_MAX = 80, TRADING_PAIR_RE, IMAGE_MIME_TYPES and MAX_IMAGE_BYTES = 10 MiB exactly as the spec; the shared TIME_FRAMES is unchanged
- [ ] #2 server/routers.ts drops its local TRADING_PAIR_RE and imports the shared one (market.getCandles and preTrade create); behaviour unchanged; the copy in client/src/components/pre-trade/PreTradeSetup.tsx is left alone
- [ ] #3 shared/richText.ts exports RichTextNode, RichTextDoc, richTextDocSchema (zod: root type literal "doc", optional content array, nested nodes not validated) and isEmptyDoc (true unless at least one text node with non-whitespace text or one image node)
- [ ] #4 shared/richText.test.ts covers isEmptyDoc (no content, empty paragraph, whitespace-only text, image only, text nested in a list) and richTextDocSchema rejecting a non-doc root
- [ ] #5 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
