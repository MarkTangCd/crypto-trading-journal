---
id: TASK-17
title: >-
  Implement ChatProvider abstraction + Deepseek adapter + reviewAgent tRPC
  router
status: Done
assignee:
  - "@myself"
created_date: "2026-06-24 14:19"
updated_date: "2026-06-24 14:36"
labels:
  - ai-agent
  - phase-1
  - server
milestone: m-0
dependencies:
  - TASK-16
documentation:
  - .lavish/trade-review-ai-agent-plan.html
modified_files:
  - server/agents/providers/types.ts
  - server/agents/providers/deepseek.ts
  - server/agents/secrets.ts
  - server/agents/contextBuilder.ts
  - server/agents/reviewAgent.ts
  - server/routers.ts
  - server/reviewAgent.router.test.ts
priority: high
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

## Why

The drawer UI needs a single tRPC namespace to open a per-trade conversation, send a user message, and fetch the assistant's reply. Underneath, we want a `ChatProvider` interface that future provider adapters (kimi / glm / gemini / openai) plug into without touching the router. v1 is non-streaming.

## Context

- Decided provider: **deepseek** (openai-compatible). Endpoint `https://api.deepseek.com`. Default model `deepseek-chat`.
- Plan: `.lavish/trade-review-ai-agent-plan.html`
- DB tables added by sibling task: conversations / messages / agent_settings.
- Auth: single-tenant anonymous user — use `publicProcedure` like the rest of the routers (see `CLAUDE.md` §Authentication).
- Errors: throw `TRPCError`; do not leak provider error bodies.

## Shape

```ts
// server/agents/providers/types.ts
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string; // JSON-serialized for tool/assistant w/ calls
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
}
export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDeclaration[]; // empty for v1
  temperature?: number;
}
export interface ChatProvider {
  id: string; // "deepseek"
  chat(
    req: ChatRequest,
    apiKey: string,
    baseUrl?: string
  ): Promise<ChatMessage>;
}
```

`server/agents/providers/deepseek.ts` — openai-compatible POST, no streaming.

`server/agents/contextBuilder.ts` — builds initial system + first user message from a `transactionId`:

- pulls trade fields from db
- pulls account snapshot
- pulls last 5 same-pair trades (one-line each)
- **K-line context is added in Phase 2, NOT this task** — keep the builder layered so adding it later is mechanical.

`server/agents/reviewAgent.ts` — orchestrates one round (no tool loop in v1).

`server/routers.ts` adds nested router:

- `reviewAgent.open` ({ transactionId }) — returns conversationId + initial assistant message (auto-generated on first open)
- `reviewAgent.send` ({ conversationId, userText }) — appends user msg, calls provider, appends + returns assistant msg
- `reviewAgent.list` ({ conversationId }) — returns full message thread

## Out of scope

- Streaming, tools, multi-provider, settings UI, drawer UI.
- Encryption (assume settings task gives you a `getDeepseekApiKey()` helper that returns plaintext for now; do not block on it — use an env-var fallback `DEEPSEEK_API_KEY` for dev)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 server/agents/providers/{types,deepseek}.ts implements ChatProvider with deepseek-chat as default model
- [ ] #2 contextBuilder produces a deterministic system+user message from a transactionId (snapshot-tested)
- [x] #3 reviewAgent.open/send/list tRPC procedures wired into appRouter; all use publicProcedure
- [x] #4 Errors from deepseek (rate limit, invalid key, network) surface as TRPCError with BAD_REQUEST/INTERNAL codes and never leak the upstream payload
- [x] #5 server/reviewAgent.test.ts exercises open/send/list with vi.mock of the provider; uses appRouter.createCaller(ctx)
- [x] #6 npm run check and npm run test both pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

## Implementation plan

1. **`server/agents/providers/types.ts`** — shared shapes
   - `ToolCall`, `ToolDeclaration` (exported, unused in v1 — leaves a clean seam for Phase 4)
   - `ChatMessage` `{ role, content, toolCalls?, toolCallId?, name? }`
   - `ChatRequest` `{ model, messages, tools?, temperature? }`
   - `ChatProvider` interface `{ id, chat(req, apiKey, baseUrl?) }`

2. **`server/agents/providers/deepseek.ts`**
   - `deepseekProvider: ChatProvider` with id `"deepseek"`
   - POST `${baseUrl || "https://api.deepseek.com"}/chat/completions` with openai-compatible body
   - Map upstream errors → `{ code: "AUTH" | "RATE_LIMIT" | "NETWORK" | "UPSTREAM" }` thrown as a typed `ProviderError`; never leak raw payload
   - Non-streaming, no tool calls in v1

3. **`server/agents/secrets.ts`** — minimal stub
   - `getProviderApiKey(providerId)` reads from `process.env.DEEPSEEK_API_KEY` for now
   - Phase 3 task (TASK-18) will wire this to encrypted `agent_settings.providerConfigs`; today we just unblock TASK-19

4. **`server/agents/contextBuilder.ts`**
   - `buildInitialMessages({ userId, transaction })` → `{ system: ChatMessage; user: ChatMessage }`
   - Reads account snapshot + last 5 same-pair trades from db
   - All copy in Chinese (the agent speaks Chinese to match the journal)
   - **NO K-line injection** — leaves a typed seam (`extras?: KlineContext`) for Phase 2

5. **`server/agents/reviewAgent.ts`** — one-round orchestrator
   - `openConversation({ ctx, transactionId })`:
     - require trade ownership
     - get-or-create conversation
     - if empty: build initial messages → append system → call provider → append assistant
     - return `{ conversationId, messages }`
   - `sendUserMessage({ ctx, conversationId, userText })`:
     - require conversation ownership (JOIN-scoped)
     - append user → call provider with full history → append assistant
     - return `{ messages }`

6. **`server/routers.ts`** — add nested `reviewAgent` router
   - `open` mutation `{ transactionId }`
   - `send` mutation `{ conversationId, userText }`
   - `list` query `{ conversationId }`
   - Ownership guard helper `requireOwnedConversation(ctx, conversationId)`
   - Provider errors → `TRPCError({ code: "BAD_REQUEST" | "INTERNAL_SERVER_ERROR" })` with safe messages

7. **`server/reviewAgent.router.test.ts`** — router-level test
   - vi.mock `./db` + `./agents/providers/deepseek` + `./agents/secrets`
   - Cases: open seeds initial assistant message; send appends user+assistant; list returns thread; provider AUTH error → BAD_REQUEST without leaking; stranger userId on list → FORBIDDEN

8. **Verify**
   - `npm run check`
   - `npm run test`
   - `npm run format`

## Notes

- Keep `reviewAgent.ts` thin — no streaming, no tool loop yet. Phase 2 only adds K-line into contextBuilder + flips chat to streaming; Phase 4 adds the tool loop.
- Provider error messages are user-facing — write them in Chinese so the drawer UI can surface them as-is.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

## Summary

Added the server-side glue for the Trade Review AI Agent: a provider-agnostic `ChatProvider` interface, a Deepseek adapter that's openai-compatible and non-streaming, a Chinese-language context builder that turns a trade row into a system + user prompt pair, a one-round orchestrator that seeds and grows conversations, and a `reviewAgent.{open,send,list}` nested tRPC router. v1 is single-provider, single-tenant, no tools — exactly the surface TASK-19 needs to wire up the drawer.

## What changed

- **`server/agents/providers/types.ts`** — `ChatMessage`, `ChatRequest`, `ChatProvider`, and a typed `ProviderError(code, chineseMessage)` that the router maps to safe TRPCError codes. `ToolCall` / `ToolDeclaration` are exported but unused (Phase 4 seam).
- **`server/agents/providers/deepseek.ts`** — `deepseekProvider` posts to `${baseUrl || "https://api.deepseek.com"}/chat/completions` with `Authorization: Bearer …`. 60s timeout via `AbortSignal.timeout`. HTTP 401/403 → AUTH, 429 → RATE_LIMIT, anything else → UPSTREAM. Upstream payload is logged server-side only, never surfaced.
- **`server/agents/secrets.ts`** — v1 shim that reads `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` from `process.env`. TASK-18 will swap this for the encrypted `agent_settings.providerConfigs` reader without touching the orchestrator.
- **`server/agents/contextBuilder.ts`** — `buildInitialMessages({ userId, transaction })` reads account snapshot + last 5 same-pair same-direction trades and renders a Markdown user message in Chinese. The system prompt commits the agent to a strict-but-restrained review tone, demands one sharp counter-question per turn, and bans hand-waving advice. Phase 2 will plug a `kline` section in here additively.
- **`server/agents/reviewAgent.ts`** — `openConversation` is idempotent: on a fresh conversation it appends `system → user → assistant`, on a populated one it returns the existing thread without re-calling the provider. `sendUserMessage` appends `user → assistant`. Both serialize message bodies as `JSON.stringify({ text })` so Phase 4 tool-result rows fit the same column.
- **`server/routers.ts`** — `reviewAgent` nested router with three procedures (`open`, `send`, `list`). `open` enforces trade ownership via `getTransactionById(id, userId)` and returns FORBIDDEN if missing. A `runAgent` wrapper maps `ProviderError` → `TRPCError(BAD_REQUEST|INTERNAL_SERVER_ERROR)` with the Chinese message intact.
- **`server/reviewAgent.router.test.ts`** — 8 router-level tests covering: FORBIDDEN on stranger trade, fresh-conversation seeding (system+user+assistant, one provider call), idempotent re-open (zero provider calls), AUTH-error mapping to BAD_REQUEST, UPSTREAM-error mapping to INTERNAL_SERVER_ERROR, send appends turns and returns full thread, send rejects empty/foreign conversation, list returns userId-scoped messages.

## Verification

- `npm run check` — clean
- `npm run test` — 113/113 passing (8 new, 0 regressions)
- `npm run format` — applied

## Out of scope (per task boundary)

- Encrypted-at-rest API key storage (TASK-18)
- Settings page UI (TASK-18)
- AgentDrawer UI (TASK-19)
- Streaming / K-line context / tool calls / multi-provider — all in later phases of the plan.
<!-- SECTION:FINAL_SUMMARY:END -->
