---
id: TASK-22
title: >-
  AgentDrawer consumes the SSE stream and renders progressive text (Phase 2 ·
  UI)
status: To Do
assignee: []
created_date: '2026-06-24 23:59'
labels:
  - ai-agent
  - phase-2
  - ui
  - streaming
milestone: m-0
dependencies:
  - TASK-19
  - TASK-21
documentation:
  - .lavish/trade-review-ai-agent-plan.html
  - client/src/components/review-agent/AgentDrawer.tsx
priority: high
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Why

With the SSE endpoint live, the drawer can swap its `reviewAgent.send` mutation for a fetch-based stream consumer. The user sees the agent's reply appear token by token, with a stop button that actually severs the upstream call.

## Context

- Endpoint: `POST /api/review-agent/stream` (delivered by TASK-21). Body shape mirrors `reviewAgent.send`.
- Event shapes: `{ type: "delta", text }` / `{ type: "done", messageId }` / `{ type: "error", message }`.
- The composer flow:
  - User hits ⌘+Enter or click 发送.
  - Optimistically append the user message + a placeholder streaming assistant message to local state so the user sees their own text immediately.
  - Open a `fetch(...)` with `signal: abortController.signal`, set `headers: { Accept: "text/event-stream" }`, body = JSON.
  - Read the response body via `getReader()` + `TextDecoderStream`, split on `\n\n`, parse each `data: {...}` line.
  - On `delta`: append to the placeholder message's text.
  - On `done`: invalidate `reviewAgent.list` (server already persisted), drop the placeholder, render the canonical thread.
  - On `error`: drop the placeholder + show `toast.error(message)`.
- New UI affordance: while streaming, the 发送 button switches to a 停止 button that calls `abortController.abort()` — server hands disconnect to its own AbortController per TASK-21.
- The non-streaming `reviewAgent.send` mutation is no longer called from the drawer but stays in the router as a fallback / debugging surface — don't remove it.
- Component count discipline: keep `AgentDrawer.tsx` under 200 LOC. Extract the SSE reader into a dedicated hook `useReviewStream({ conversationId, onDelta, onDone, onError })` under `client/src/components/review-agent/useReviewStream.ts`.

## Out of scope

- Streaming the initial seed turn (`reviewAgent.open` stays non-streaming; the seed reply lands all at once)
- Server-Sent Events polyfill for browsers — modern browsers handle it natively; we only support what the rest of the app supports
- Tool call rendering (Phase 4)
- Markdown rendering inside assistant messages (still plain whitespace-pre-wrap for now)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 AgentDrawer composer triggers the SSE endpoint instead of reviewAgent.send.useMutation when sending a user turn; placeholder assistant message renders deltas as they arrive
- [ ] #2 After the done event, the placeholder is dropped and the canonical thread (from the invalidated reviewAgent.list query) takes over — no duplicate messages
- [ ] #3 During streaming the 发送 button becomes a 停止 button; clicking it aborts the in-flight fetch and (per TASK-21) tears down the upstream call
- [ ] #4 On error event, the placeholder is removed and the Chinese error message surfaces via toast.error; the user turn stays in the thread (server persisted it before streaming)
- [ ] #5 useReviewStream hook lives in client/src/components/review-agent/useReviewStream.ts, AgentDrawer.tsx stays under 200 LOC, AgentMessageList.tsx unchanged
- [ ] #6 Manual smoke (with valid DEEPSEEK_API_KEY): opening a closed trade, sending '帮我总结一下' shows visible token-by-token streaming; clicking 停止 mid-stream halts text growth and the partial reply does NOT appear in the persisted thread after refresh
- [ ] #7 npm run check + npm run format pass; no new server tests required (TASK-21 owns the server-side coverage)
<!-- AC:END -->
