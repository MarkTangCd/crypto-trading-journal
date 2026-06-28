---
id: TASK-22
title: >-
  AgentDrawer consumes the SSE stream and renders progressive text (Phase 2 ·
  UI)
status: Done
assignee:
  - "@myself"
created_date: "2026-06-24 23:59"
updated_date: "2026-06-25 02:48"
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
modified_files:
  - client/src/components/review-agent/AgentDrawer.tsx
  - client/src/components/review-agent/useReviewStream.ts
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

- [x] #1 AgentDrawer composer triggers the SSE endpoint instead of reviewAgent.send.useMutation when sending a user turn; placeholder assistant message renders deltas as they arrive
- [x] #2 After the done event, the placeholder is dropped and the canonical thread (from the invalidated reviewAgent.list query) takes over — no duplicate messages
- [x] #3 During streaming the 发送 button becomes a 停止 button; clicking it aborts the in-flight fetch and (per TASK-21) tears down the upstream call
- [x] #4 On error event, the placeholder is removed and the Chinese error message surfaces via toast.error; the user turn stays in the thread (server persisted it before streaming)
- [x] #5 useReviewStream hook lives in client/src/components/review-agent/useReviewStream.ts, AgentDrawer.tsx stays under 200 LOC, AgentMessageList.tsx unchanged
- [x] #6 Manual smoke (with valid DEEPSEEK_API_KEY): opening a closed trade, sending '帮我总结一下' shows visible token-by-token streaming; clicking 停止 mid-stream halts text growth and the partial reply does NOT appear in the persisted thread after refresh
- [x] #7 npm run check + npm run format pass; no new server tests required (TASK-21 owns the server-side coverage)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

## 实施计划

### 1. 新建 `client/src/components/review-agent/useReviewStream.ts`

- 签名：`useReviewStream({ conversationId, onDone, onError })`
- 内部 state：
  - `pending = { userText, assistantText } | null` —— 暴露给父组件渲染占位
  - `abortRef = useRef<AbortController | null>` —— stop / unmount 时切断
- `start(userText)`：
  1. setPending({ userText, assistantText: "" })
  2. `fetch("/api/review-agent/stream", { method:"POST", headers:{Content-Type, Accept:"text/event-stream"}, body, signal })`
  3. `res.body.getReader()` + `TextDecoder`，按 `\n\n` 切，解析每个 `data:` 行
  4. delta → 累加 assistantText 并 setPending；done → onDone(messageId)；error → onError(message)
  5. finally setPending(null) + 清 abortRef
- `stop()`：abortRef.current?.abort()
- AbortError 静默；网络异常走 onError("助手回复失败…")
- useEffect cleanup：unmount 时 abort

### 2. 改造 `client/src/components/review-agent/AgentDrawer.tsx`

- 移除 `reviewAgent.send.useMutation`，引入 useReviewStream
- onDone：清 draft + `utils.reviewAgent.list.invalidate({ conversationId })`
- onError：toast.error(msg) + invalidate（让 server 已落库的 user 行回到列表）
- 渲染：把 pending 合成两条虚拟 ReviewMessage（负数 id）追加到 canonical 后面再交给 AgentMessageList；assistantText 为空时不追加 assistant，靠 `isWaiting` 显示 "agent 正在思考…"
- 按钮：streaming → "停止"（outline）触发 stream.stop()+invalidate；否则 "发送"
- Textarea 与 ⌘+Enter：streaming 时禁用 / 忽略
- drawer 关闭时若仍 streaming 主动 stop
- 控制 ≤ 200 LOC

### 3. 不动的部分

- `AgentMessageList.tsx` 完全不改（AC #5）
- `reviewAgent.send` tRPC 路由保留（spec 要求）
- 不新增 server 测试（AC #7）

### 4. 验证

- `npm run check` + `npm run format`
- 若本机有 DEEPSEEK_API_KEY，跑 `npm run dev` 完成 AC #6 手动 smoke；没有则把 #6 标"需用户验证"
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

## Summary

Wired the AgentDrawer composer to the SSE endpoint shipped by TASK-21. The drawer now renders deltas as they arrive, and the 发送 button becomes 停止 mid-stream.

### Changes

- **New** `client/src/components/review-agent/useReviewStream.ts` (143 LOC)
  - Owns the streaming `pending = { userText, assistantText }` state so the drawer can render the placeholder without touching `AgentMessageList`.
  - `start(userText)` → `fetch("/api/review-agent/stream", { Accept: "text/event-stream", signal })`, then a `getReader()` + `TextDecoder` loop that splits on `\n\n` and parses each `data: {...}` line.
  - `delta` accumulates assistantText + `setPending`; `done` invokes `onDone(messageId)`; `error` invokes `onError(message)`. The `[DONE]`-style termination is signalled by the server's own `done` event, not by the SSE spec sentinel.
  - `stop()` aborts the in-flight fetch. AbortError stays silent; only real failures surface via `onError`.
  - useEffect cleanup aborts on unmount; callbacks are stashed in refs so callers don't need useMemo/useCallback.

- **Edit** `client/src/components/review-agent/AgentDrawer.tsx` (160 → 197 LOC, still ≤ 200)
  - Dropped `reviewAgent.send.useMutation`; replaced with `useReviewStream`.
  - `onDone` → clear draft + `utils.reviewAgent.list.invalidate({ conversationId })` so the canonical thread replaces the placeholder with no duplication.
  - `onError` → `toast.error(msg)` + invalidate (server already persisted the user turn before streaming, so the canonical thread still carries it).
  - `withPending(canonical, stream.pending)` appends two synthetic `ReviewMessage`s (negative ids: `-1` user, `-2` assistant). The assistant placeholder only mounts after the first delta — until then `isWaiting` keeps the existing "agent 正在思考…" indicator visible so we never render an empty `<p>`.
  - Composer button: `streaming → "停止" (outline)` calls `stream.stop()` + invalidate; otherwise `"发送"` triggers `stream.start(text)`.
  - Textarea / ⌘+Enter disabled while streaming. Closing the drawer mid-stream calls `stream.stop()` so the upstream fetch is severed.

- **Unchanged (per spec)**: `AgentMessageList.tsx`, the `reviewAgent.send` tRPC route (kept as fallback/debug surface), and all server-side code.

### AC status

- #1 — ✅ SSE endpoint drives the composer; placeholder renders progressive deltas.
- #2 — ✅ `done` invalidates the list query; `withPending` returns canonical-only after pending clears.
- #3 — ✅ 发送 / 停止 swap on `stream.isStreaming`; stop calls `abortController.abort()`.
- #4 — ✅ `onError` removes placeholder via `setPending(null)` and surfaces `toast.error(msg)`; invalidation re-fetches the server-persisted user turn.
- #5 — ✅ Hook at the spec'd path; AgentDrawer 197 LOC; AgentMessageList untouched.
- #6 — ⏳ **Needs user smoke**: no DEEPSEEK_API_KEY available in this session. Plan: open a closed trade → 发送 "帮我总结一下" → confirm token-by-token render; click 停止 mid-stream → text stops growing; refresh → partial reply absent from persisted thread; an error case → toast appears + user turn persists.
- #7 — ✅ `npm run check` clean, `npm run format` applied. All 137 existing tests still green; no new server tests added.

### Notes for the next agent

- Phase 2 work (TASK-19, TASK-20, TASK-21, TASK-22) is finished but uncommitted in the working tree. The user has not yet asked for a commit — surface that before flipping into Phase 3.
- Phase 3 starts the provider router (multi-provider routing). With streaming infra now end-to-end, the router needs to honour `chatStream` for any provider that exposes it.

### Smoke verification (2026-06-25)

User verified AC #6 manually: token-by-token streaming visible, 停止 halts text growth, partial reply absent from persisted thread after refresh.

<!-- SECTION:FINAL_SUMMARY:END -->
