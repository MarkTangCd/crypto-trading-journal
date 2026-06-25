---
id: TASK-19
title: >-
  AgentDrawer on TransactionDetail: per-trade review chat (non-streaming,
  deepseek)
status: Done
assignee: []
created_date: '2026-06-24 14:20'
updated_date: '2026-06-24 14:43'
labels:
  - ai-agent
  - phase-1
  - ui
milestone: m-0
dependencies:
  - TASK-17
  - TASK-18
documentation:
  - .lavish/trade-review-ai-agent-plan.html
  - DESIGN.md
modified_files:
  - client/src/components/review-agent/AgentDrawerToggle.tsx
  - client/src/components/review-agent/AgentDrawer.tsx
  - client/src/components/review-agent/AgentMessageList.tsx
  - client/src/pages/TransactionDetail.tsx
priority: high
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Why

Bring the agent into the TransactionDetail page as a right-side drawer. v1 is non-streaming, deepseek only, no tools — the goal is to prove end-to-end: open trade → open drawer → see initial AI analysis → chat → close.

## Context

- Design system: Bench Notebook — see `DESIGN.md` and existing TransactionDetail style. No cards, no rounded corners, IBM Plex Mono, lowercase labels, hairline rules. Mock visible in `.lavish/trade-review-ai-agent-plan.html`.
- Conversation scope: per-trade (one conversation per transactionId, lazy-created on first open).
- Reads via `trpc.reviewAgent.list.useQuery`; writes via `trpc.reviewAgent.send.useMutation`; first-open via `trpc.reviewAgent.open.useMutation` (idempotent server-side).
- Invalidate `reviewAgent.list` after each `send` mutation success.
- No streaming yet — show spinner while assistant message is in flight; toast on error.
- Empty state when not configured: prompt user to set deepseek API key on Settings page (link).
- 200 LOC limit per component (`CLAUDE.md`). Split into:
  - `AgentDrawerToggle` — the open/close button
  - `AgentDrawer` — the panel shell + composer
  - `AgentMessageList` — message rendering
- All Chinese copy in the UI.

## Out of scope

- Tool call rendering (Phase 4)
- Streaming (Phase 2)
- K-line context strip / provider switcher chips (Phase 2/3)
- "Write back to Review Feedback" button (future polish)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 TransactionDetail page renders an AgentDrawerToggle that opens AgentDrawer; closing the drawer keeps conversation persisted
- [x] #2 Opening the drawer for the first time triggers reviewAgent.open, which seeds the conversation and returns the initial assistant message
- [x] #3 Sending a user message disables the composer until the assistant reply arrives and renders both messages in order
- [x] #4 If no API key is configured, the drawer shows a clear empty state with a wouter link to /settings
- [x] #5 Mutation errors surface as toast.error with a readable message; loading shows a centered spinner inline
- [x] #6 Component files each stay under 200 LOC; Tailwind utilities consistent with TransactionDetail style
- [ ] #7 Manual smoke: with a valid DEEPSEEK_API_KEY in env, opening a transaction and sending '帮我评一下' returns a coherent Chinese response
- [x] #8 npm run check + npm run format pass
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Summary

Wired the AI review drawer into TransactionDetail. Three new client components (all sub-200 LOC) split between toggle, drawer shell + composer, and message list. The drawer reads `settings.getProviderConfig` to gate its content: missing key → friendly empty state linking to Settings; configured → lazy-fire `reviewAgent.open` on first show (idempotent server-side), then `reviewAgent.list` for the thread + `reviewAgent.send` for new turns.

## What changed

- **`client/src/components/review-agent/AgentDrawerToggle.tsx`** (28 LOC) — owns the open/closed state so TransactionDetail doesn't have to thread it. Single `<Button variant="outline">打开 AI 复盘</Button>`.
- **`client/src/components/review-agent/AgentDrawer.tsx`** (160 LOC) — Sheet-based right-side drawer with header, scroll body, and composer. Guards the body on the provider-config query: spinner → empty state → message list. Auto-fires `reviewAgent.open` exactly once per session via a ref-tracked `seededRef`. Composer supports ⌘/Ctrl+Enter to send. Invalidates `reviewAgent.list` after each successful send so the thread re-renders. Errors → `toast.error` with the agent's Chinese message.
- **`client/src/components/review-agent/AgentMessageList.tsx`** (66 LOC) — hides system prompts; folds the first user turn (auto-injected trade context) into a `<details>` so it's available without dominating the view; renders user vs assistant with the project's `text-label` typography; shows a "agent 正在思考…" spinner row while a mutation is in flight.
- **`client/src/pages/TransactionDetail.tsx`** — 4-line surgical change: imports the toggle, wraps the existing breadcrumb link in a `flex justify-between` row, drops the toggle on the right side. No other refactors.

## Verification

- `npm run check` — clean (strict TS across client + server)
- `npm run test` — 120/120 passing (no regressions from earlier phases; this task adds UI, no new server tests required)
- `npm run format` — applied

## Manual smoke — NOT performed in this session

I cannot complete the AC's manual smoke (open trade → '帮我评一下' → coherent Chinese reply) here: no live `DEEPSEEK_API_KEY` is configured in this environment and I have no browser access. The code paths are exercised by the existing router tests (120/120 green) with the provider mocked, and the wiring of the `settings.*` + `reviewAgent.*` tRPC procedures was validated at the type level. Recommend: set `DEEPSEEK_API_KEY` in your shell, `npm run dev`, open any trade, click "打开 AI 复盘", and verify (1) initial reply lands in Chinese, (2) a follow-up turn appends and replies, (3) leaving the drawer and re-opening shows the same thread.

## Out of scope (per task boundary)

- Streaming UI (Phase 2)
- K-line context strip / provider switcher chips (Phase 2/3)
- "Write back to Review Feedback" button (future polish)
- Tool call rendering (Phase 4)
<!-- SECTION:FINAL_SUMMARY:END -->
