---
id: TASK-21
title: >-
  Streaming chat: ChatProvider.chatStream + Deepseek SSE + Express SSE endpoint
  (Phase 2 · server)
status: Done
assignee:
  - "@myself"
created_date: "2026-06-24 23:59"
updated_date: "2026-06-25 01:42"
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
modified_files:
  - server/agents/providers/types.ts
  - server/agents/providers/sseParser.ts
  - server/agents/providers/sseParser.test.ts
  - server/agents/providers/deepseek.ts
  - server/agents/reviewAgent.ts
  - server/_core/reviewAgentSseRoute.ts
  - server/_core/index.ts
  - server/reviewAgent.stream.test.ts
  - server/streamRoute.integration.test.ts
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

- [x] #1 ChatProvider interface adds chatStream(req, opts): AsyncIterable<{ delta: string }>; existing chat() implementation reduces to a thin drain-and-concat of chatStream
- [x] #2 Deepseek adapter parses openai-compatible SSE: handles partial-line chunks, : ping keepalives, [DONE] terminator, and non-2xx responses mapped to typed ProviderError without leaking upstream payload
- [x] #3 Orchestrator's streamUserMessage persists the user turn BEFORE streaming so a mid-stream disconnect still preserves it; on successful stream end persists the assistant turn and emits a final {done, messageId}; on error persists nothing for the assistant turn
- [x] #4 Express route POST /api/review-agent/stream is mounted in server/\_core/index.ts, validates input with the same zod shape as reviewAgent.send, resolves the anonymous user via createContext, emits SSE events (delta / done / error)
- [x] #5 Client disconnect (req close) triggers AbortController on the upstream fetch
- [x] #6 Vitest covers: SSE parser unit tests (split lines, keepalives, malformed chunks), orchestrator streamUserMessage happy path + mid-stream provider error, Express route via supertest-style integration that asserts at least one delta event is emitted
- [x] #7 npm run check + npm run test + npm run format pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

## Implementation Plan

### 1. Provider interface (`server/agents/providers/types.ts`)

- Add `chatStream(req, options): AsyncIterable<{ delta: string }>` to `ChatProvider`. Must throw `ProviderError` exactly like `chat()` on upstream failures (before or during streaming).

### 2. Deepseek adapter (`server/agents/providers/deepseek.ts`)

- Extract a private `parseSseFrames(buffer: string): { events: string[]; remainder: string }` that splits on `\n\n`, drops `: ping` comments and `data: [DONE]`.
- Implement `chatStream` with `stream: true` body, walks `response.body` reader, decodes via `TextDecoder`, parses each `data: {...}` JSON for `choices[0].delta.content` and yields `{delta}` per non-empty content. Non-2xx maps to typed `ProviderError` via the existing `mapHttpStatus`.
- Refactor `chat()` to drain `chatStream()` and concat — single source of truth.
- Pipes through an optional `AbortSignal` (from options) to `fetch` so the Express handler can cancel mid-stream.

### 3. Orchestrator (`server/agents/reviewAgent.ts`)

- Add `streamUserMessage({ userId, conversationId, userText, signal })`:
  - Validates ownership via existing `loadThread` (empty → throw same `ProviderError("AUTH", ...)` shape as `sendUserMessage`).
  - `appendMessage` the user turn **before** opening the stream (survives mid-stream disconnect).
  - Builds full chat history (existing + new user turn), calls `provider.chatStream(req, {apiKey, baseUrl, signal})`.
  - Yields `{type:"delta", text}` per delta to caller while accumulating into `assembled`.
  - On stream-end success: appends assistant turn with `assembled`, yields `{type:"done", messageId}`.
  - On provider error: yields `{type:"error", message}` and returns — does NOT append assistant turn.

### 4. Express route (`server/_core/index.ts`)

- Before the Vite/static mount, register `POST /api/review-agent/stream`:
  - zod body parse: `{conversationId: positiveInt, userText: trimmed 1-4000}` (same shape as `reviewAgent.send`).
  - `createContext({req, res})` to reuse anonymous-user resolution.
  - Set headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`. Flush headers immediately.
  - Wire an `AbortController`; `req.on("close")` → `controller.abort()`.
  - For each event from `streamUserMessage`, write `data: ${JSON.stringify(event)}\n\n`.
  - On `ProviderError` thrown synchronously (before the loop), emit a single `error` event then end.
  - On non-stream errors (zod failure, etc.) respond 400 JSON, no SSE.

### 5. Tests

- **`server/agents/providers/deepseek.sse.test.ts`** (new): unit tests for `parseSseFrames` — multi-chunk split, `: ping` skip, `[DONE]` terminator, malformed JSON tolerated.
- **`server/reviewAgent.stream.test.ts`** (new): orchestrator-level tests via `vi.mock("./agents/providers/deepseek")` (`chatStream` returns an async generator). Happy path asserts persisted user turn → deltas → persisted assistant turn → `done` event. Mid-stream error case asserts user turn persisted, NO assistant append, `error` event yielded.
- **`server/streamRoute.integration.test.ts`** (new): boots the route on an ephemeral port via `http.createServer(app)`, fetches with `ReadableStream`, asserts at least one `delta` event arrives. Uses `vi.mock` to stub provider so we don't hit network.

### 6. Verify

`npm run check`, `npm run test`, `npm run format`.

### Out of scope (won't touch)

- Client-side consumption (TASK-22).
- Streaming `open` seed (Phase 2 stays minimal).
- Multi-provider streaming (Phase 3).
- Tool-call delta handling (Phase 4).
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

## Summary

Server-side streaming for the review agent: `ChatProvider.chatStream` is now the single source of truth for upstream calls, the Deepseek adapter speaks openai-compatible SSE, and a dedicated `POST /api/review-agent/stream` endpoint (next to tRPC, because `httpBatchLink` can't carry SSE) emits `delta` / `done` / `error` events to the browser. Client wiring is intentionally left for TASK-22.

## Changes

- **`server/agents/providers/types.ts`** — `ChatProvider` gains `chatStream(req, opts): AsyncIterable<{delta}>`. New `ProviderCallOptions` carries `apiKey`, `baseUrl`, and an optional `signal: AbortSignal` so callers can cancel mid-stream.

- **`server/agents/providers/sseParser.ts` (new) + `.test.ts`** — `parseSseFrames(buf)` splits openai-compatible SSE frames on `\n\n`, drops `: ping` comments, joins multi-`data:` lines, surfaces `[DONE]` as `result.done`, returns trailing bytes as `remainder` for the next chunk. 6 unit tests cover partial chunks, ping skip, `[DONE]`, multi-line, and `\r\n` line endings.

- **`server/agents/providers/deepseek.ts`** — rewritten around `chatStream`. Sends `stream: true`, walks `response.body` via `getReader()` + `TextDecoder`, parses each JSON frame for `choices[0].delta.content`, yields non-empty deltas. `chat()` is now a thin drain-and-concat of `chatStream` — single upstream path. Non-2xx still routes through the existing `mapHttpStatus` → typed `ProviderError`. New `composeSignal` uses `AbortSignal.any([timeout, external])` so the per-request timeout and the caller's abort both cancel the upstream fetch.

- **`server/agents/reviewAgent.ts`** — added `streamUserMessage({userId, conversationId, userText, signal})` as an `AsyncGenerator<StreamEvent>`. Persists the **user turn first** (survives a mid-stream disconnect), drives `chatStream`, accumulates content, yields `{type:"delta", text}` per delta. On success: persists assistant turn and yields `{type:"done", messageId}`. On error: yields `{type:"error", message}` and persists nothing for the assistant turn. Empty stream also surfaces as an error event (rather than silently saving an empty turn).

- **`server/_core/reviewAgentSseRoute.ts` (new)** — Express handler:
  - zod-validates body (`{conversationId, userText}` mirrors `reviewAgent.send`).
  - Resolves the anonymous user via `createContext` (shares ctx with tRPC).
  - Sets SSE headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`) and flushes them immediately so the client sees deltas as they arrive.
  - `AbortController` wired to `req.on("close")` so a client disconnect cancels the upstream fetch — no wasted tokens.
  - Errors thrown before the first yield (ownership / auth) emit one `error` event then close; mid-stream errors are already events emitted by the generator.

- **`server/_core/index.ts`** — mounts `mountReviewAgentSseRoute()` at `/api/review-agent`, right after the tRPC middleware and before the Vite / static mount.

## Tests

- `server/agents/providers/sseParser.test.ts` (6 tests).
- `server/reviewAgent.stream.test.ts` (4 tests): persistence ordering + delta order + done; mid-stream provider error (user persisted, assistant skipped, error event); empty conversation rejection; empty-stream error event.
- `server/streamRoute.integration.test.ts` (2 tests): boots the Express app on an ephemeral port, fetches the SSE endpoint, asserts at least one `delta` event + a terminating `done` event arrive; 400 on zod validation failure.

## Verification

- `npm run check` clean.
- `npm run test` → **137 passed** (was 125 → +12: 6 SSE parser + 4 orchestrator + 2 integration).
- `npm run format` applied (small whitespace tweaks in the new files).

## All ACs honored

#1 ✓ — `chatStream` added; `chat()` now `for await (chunk of this.chatStream)` + concat.
#2 ✓ — `parseSseFrames` handles partial chunks, `: ping`, `[DONE]`, malformed JSON is skipped; non-2xx → `mapHttpStatus` → typed `ProviderError`, upstream payload only in `console.warn`.
#3 ✓ — user turn persisted before stream; assistant turn persisted on success with returned `messageId`; on error nothing extra is persisted, single `{type:"error"}` event yielded.
#4 ✓ — `POST /api/review-agent/stream` mounted in `_core/index.ts`; zod body matches `reviewAgent.send`; `createContext` resolves anonymous user; emits SSE events in spec'd shape.
#5 ✓ — `req.on("close")` → `controller.abort()`; signal threaded all the way down to the upstream `fetch` via `AbortSignal.any`.
#6 ✓ — 12 new tests across the three concerns.
#7 ✓ — `npm run check`, `npm run test`, `npm run format` all pass.

## Next

TASK-22 (client-side: `useChatStream` hook + drawer UI wiring) is the obvious follow-up; nothing on the server side blocks it.

<!-- SECTION:FINAL_SUMMARY:END -->
