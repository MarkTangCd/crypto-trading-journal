---
id: TASK-75
title: Shared constants and richText helpers for Plans
status: Done
assignee:
  - '@myself'
created_date: '2026-11-10 06:49'
updated_date: '2026-11-10 07:34'
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
- [x] #1 shared/const.ts exports SCENARIO_TIME_FRAMES (15m 30m 1H 4H 12H 1D) with ScenarioTimeFrame, SCENARIO_SIDES, SCENARIO_OUTCOMES, SCENARIO_NAME_MAX = 80, TRADING_PAIR_RE, IMAGE_MIME_TYPES and MAX_IMAGE_BYTES = 10 MiB exactly as the spec; the shared TIME_FRAMES is unchanged
- [x] #2 server/routers.ts drops its local TRADING_PAIR_RE and imports the shared one (market.getCandles and preTrade create); behaviour unchanged; the copy in client/src/components/pre-trade/PreTradeSetup.tsx is left alone
- [x] #3 shared/richText.ts exports RichTextNode, RichTextDoc, richTextDocSchema (zod: root type literal "doc", optional content array, nested nodes not validated) and isEmptyDoc (true unless at least one text node with non-whitespace text or one image node)
- [x] #4 shared/richText.test.ts covers isEmptyDoc (no content, empty paragraph, whitespace-only text, image only, text nested in a list) and richTextDocSchema rejecting a non-doc root
- [x] #5 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. shared/const.ts: append SCENARIO_TIME_FRAMES + ScenarioTimeFrame, SCENARIO_SIDES, SCENARIO_OUTCOMES, SCENARIO_NAME_MAX, TRADING_PAIR_RE, IMAGE_MIME_TYPES, MAX_IMAGE_BYTES verbatim from doc-6
2. server/routers.ts: delete local TRADING_PAIR_RE, add it to the existing @shared/const import
3. shared/richText.ts: RichTextNode (recursive), RichTextDoc, richTextDocSchema (z.object root type literal doc, content optional array of z.custom<RichTextNode> plain objects, typed z.ZodType<RichTextDoc>), isEmptyDoc (recursive walk: non-whitespace text or image node)
4. shared/richText.test.ts: isEmptyDoc cases + schema rejecting non-doc root
5. format, check, test
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shared constants and rich-text helpers for Plans (spec doc-6).

- shared/const.ts: SCENARIO_TIME_FRAMES + ScenarioTimeFrame, SCENARIO_SIDES, SCENARIO_OUTCOMES, SCENARIO_NAME_MAX, TRADING_PAIR_RE, IMAGE_MIME_TYPES, MAX_IMAGE_BYTES verbatim from the spec; TIME_FRAMES untouched.
- server/routers.ts: local TRADING_PAIR_RE removed, imported from @shared/const (getCandles and preTrade create unchanged); PreTradeSetup.tsx copy left alone.
- shared/richText.ts: RichTextNode, RichTextDoc, richTextDocSchema typed z.ZodType<RichTextDoc> (root literal doc, optional content of plain-object nodes via z.custom, deeper nodes unvalidated), isEmptyDoc (recursive: non-whitespace text or an image node). No Tiptap import.
- shared/richText.test.ts: 10 tests (empty / empty paragraph / whitespace / image only / nested list / plain text; schema accepts doc, rejects non-doc root, null, non-array and non-object nodes).
- Refinement vs spec: top-level nodes must be plain objects (z.custom) instead of fully unvalidated, so the inferred type is RichTextDoc without casts.
- check passes; full suite 421 tests pass.
<!-- SECTION:FINAL_SUMMARY:END -->
