---
id: TASK-21
title: >-
  Streaming chat: ChatProvider.chatStream + Deepseek SSE + Express SSE endpoint
  (Phase 2 · server)
status: To Do
assignee: []
created_date: '2026-06-24 23:59'
labels:
  - ai-agent
  - phase-2
  - server
  - streaming
milestone: m-0
dependencies:
  - TASK-17
documentation:
  - .lavish/trade-review-ai-agent-plan.html
  - server/_core/index.ts
  - server/agents/providers/deepseek.ts
  - server/agents/reviewAgent.ts
priority: high
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Why

Non-streaming chat means the user stares at a spinner for 5–30 seconds before the first token. Streaming makes the agent feel alive and lets the user start reading (and interrupting) as soon as the first sentence lands. This task adds the server-side streaming path; TASK-22 wires the client to it.

## Context

- The project is on tRPC v11 + Express, with the client using a plain `httpBatchLink` (no WebSocket, no subscriptions). Adopting `httpSubscriptionLink` would force a client-side link refactor — out of scope. Instead: **add a dedicated Express SSE endpoint `POST /api/review-agent/stream` next to the existing tRPC middleware**, sharing the anonymous-user context via `createContext`.
- Provider interface change: `ChatProvider` gains `chatStream(req, opts): AsyncIterable<{ delta: string }>` returning incremental text deltas. The existing non-streaming `chat()` becomes a thin consumer that drains `chatStream` and concatenates — single source of truth for the upstream call.
- Deepseek's SSE format is openai-compatible: `data: {…}\n\n` lines, with `data: [DONE]` as the terminator. Parser must handle:
  - multi-line chunk boundaries (TextDecoder + line buffer)
  - keepalive comments (`: ping`)
  - tool-call deltas (just ignore in v1; treat as no-op)
  - non-2xx responses (drain to text, map to typed `ProviderError` exactly like the non-streaming path)
- Orchestrator: add `streamUserMessage({ userId, conversationId, userText })` that:
  - Validates ownership via the existing JOIN guard in `listMessages`.
  - Appends the user turn to the DB **before** streaming so it survives a mid-stream client disconnect.
  - Yields deltas to the caller.
  - **On stream end**, appends the assembled assistant turn to the DB and yields a final `{ done: true, messageId }` event.
  - On provider error mid-stream, persists nothing for the assistant turn and yields `{ error: chineseMessage }`.
- The Express handler:
  - Sets `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`.
  - Validates the JSON body with the same zod schema shape as `reviewAgent.send`.
  - Resolves the anonymous user via `getOrCreateAnonymousUser` (same as tRPC).
  - Emits each delta as `data: {"type":"delta","text":"…"}\n\n`, final event as `data: {"type":"done","messageId":…}\n\n`, errors as `data: {"type":"error","message":"…"}\n\n`.
  - On client disconnect (`req.on("close")`), aborts the upstream fetch via `AbortController` so we don't bill tokens for a thrown-away response.

## Out of scope

- Client-side consumption (TASK-22)
- Streaming the initial seed turn in `reviewAgent.open` (Phase 2 stays minimal — only the user-driven `send` is streamed; `open` continues to be non-streaming for now)
- Multi-provider streaming (Phase 3 — but keep the adapter shape ready)
- Tool-call delta handling (Phase 4)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ChatProvider interface adds chatStream(req, opts): AsyncIterable<{ delta: string }>; existing chat() implementation reduces to a thin drain-and-concat of chatStream
- [ ] #2 Deepseek adapter parses openai-compatible SSE: handles partial-line chunks, : ping keepalives, [DONE] terminator, and non-2xx responses mapped to typed ProviderError without leaking upstream payload
- [ ] #3 Orchestrator's streamUserMessage persists the user turn BEFORE streaming so a mid-stream disconnect still preserves it; on successful stream end persists the assistant turn and emits a final {done, messageId}; on error persists nothing for the assistant turn
- [ ] #4 Express route POST /api/review-agent/stream is mounted in server/_core/index.ts, validates input with the same zod shape as reviewAgent.send, resolves the anonymous user via createContext, emits SSE events (delta / done / error)
- [ ] #5 Client disconnect (req close) triggers AbortController on the upstream fetch
- [ ] #6 Vitest covers: SSE parser unit tests (split lines, keepalives, malformed chunks), orchestrator streamUserMessage happy path + mid-stream provider error, Express route via supertest-style integration that asserts at least one delta event is emitted
- [ ] #7 npm run check + npm run test + npm run format pass
<!-- AC:END -->
