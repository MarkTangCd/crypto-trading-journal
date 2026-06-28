---
id: TASK-16
title: Add conversations / messages / agent_settings tables for review agent
status: Done
assignee:
  - "@myself"
created_date: "2026-06-24 14:19"
updated_date: "2026-06-24 14:30"
labels:
  - ai-agent
  - phase-1
  - db
milestone: m-0
dependencies: []
documentation:
  - .lavish/trade-review-ai-agent-plan.html
  - CLAUDE.md
modified_files:
  - drizzle/schema.ts
  - drizzle/0008_nice_retro_girl.sql
  - drizzle/meta/_journal.json
  - drizzle/meta/0008_snapshot.json
  - server/db.ts
  - server/reviewAgent.db.test.ts
priority: high
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

## Why

Phase 1 of the Trade Review AI Agent needs persistence for per-trade conversations, the message stream (incl. future tool calls), and a single-tenant settings row holding the deepseek API key. Everything downstream (server router, drawer UI) depends on this schema.

## Context

- Plan: `.lavish/trade-review-ai-agent-plan.html`
- Source of truth: `drizzle/schema.ts`
- DB layer rules: `CLAUDE.md` §Database Rules — reads/writes live in `server/db.ts`, user-scoped queries keep filtering by `userId`, SQLite only, transactions via `runInSqliteTransaction`.
- Conversation scope decision: **per-trade** (one row in `conversations` per `transactionId`).
- Encrypted-at-rest for API keys is handled in a sibling task (Settings). This task only adds the column; encryption format = ciphertext blob stored as text.

## Schema shape (proposed)

`conversations` — one per trade

- `id` int pk
- `userId` int (anonymous user)
- `transactionId` int (FK semantics, no enforced FK to match repo style)
- `providerId` text (e.g. "deepseek")
- `model` text (e.g. "deepseek-chat")
- `createdAt` / `updatedAt` ms timestamps

`messages` — full transcript incl. tool calls

- `id` int pk
- `conversationId` int
- `role` text check in `('system','user','assistant','tool')`
- `content` text (JSON blob: { type, text? , toolCallId?, name?, arguments?, result? })
- `createdAt` ms timestamp

`agent_settings` — single-tenant

- `userId` int pk
- `defaultProvider` text default `'deepseek'`
- `providerConfigs` text json (encrypted blob keyed by provider id; format defined in Settings task)
- `enabledSkillIds` text json default `'[]'`
- `updatedAt` ms timestamp

## Out of scope

- Encryption format (sibling Settings task owns it; this task just stores text)
- tRPC router (next task)
- UI
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 drizzle/schema.ts adds conversations, messages, agent_settings tables with the columns above and SQLite check constraint on messages.role
- [x] #2 Indexes added on messages(conversationId, createdAt) and conversations(userId, transactionId)
- [x] #3 server/db.ts exposes typed helpers: getOrCreateConversation, appendMessage, listMessages, getAgentSettings, upsertAgentSettings
- [x] #4 All db helpers filter by userId and use existing runInSqliteTransaction where multi-statement
- [x] #5 npm run db:push applies the migration cleanly on a fresh local SQLite file
- [x] #6 npm run check passes; server/db.test.ts (new) covers happy path for the helpers
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

## Implementation plan

1. **Read current state**
   - drizzle/schema.ts (existing patterns for users, accounts, transactions tables)
   - server/db.ts (existing helpers + runInSqliteTransaction shape)
   - server/\_core/context.ts (anonymous user lookup)
   - tsconfig paths for shared types

2. **Schema additions in drizzle/schema.ts**
   - `conversations` — id pk autoinc, userId, transactionId, providerId, model, createdAt/updatedAt ms timestamps. Indexes: `userId+transactionId+createdAt`.
   - `messages` — id pk autoinc, conversationId, role text with `check role in ('system','user','assistant','tool')`, content text (JSON blob), createdAt ms. Index: `conversationId+createdAt`.
   - `agent_settings` — userId pk (NOT autoinc; one row per user), defaultProvider text default `'deepseek'`, providerConfigs text default `'{}'`, enabledSkillIds text default `'[]'`, updatedAt ms. (providerConfigs holds ciphertext JSON in plain text column — encryption owned by sibling Settings task.)
   - Drizzle inferred types re-exported via `shared/types.ts` if pattern matches existing.

3. **server/db.ts helpers (pure exported functions)**
   - `getOrCreateConversation({ userId, transactionId, providerId, model })` — wraps a single `runInSqliteTransaction`: SELECT existing then INSERT if missing; always filters by userId+transactionId.
   - `appendMessage({ conversationId, role, content })` — INSERT into messages; bumps conversation.updatedAt in same transaction.
   - `listMessages({ conversationId, userId })` — JOIN through conversations to enforce userId scope; ORDER BY createdAt ASC.
   - `getAgentSettings(userId)` — returns row or undefined.
   - `upsertAgentSettings(userId, patch)` — INSERT OR REPLACE / ON CONFLICT semantics.

4. **Migration**
   - Run `npm run db:push` to generate + apply the drizzle migration locally; check the generated file lands under `drizzle/` and is human-readable.

5. **Test (server/db.test.ts new section or new file)**
   - Round-trip getOrCreateConversation idempotence
   - appendMessage + listMessages ordering
   - getAgentSettings undefined → upsert → re-read

6. **Verify**
   - `npm run check` (type-strict)
   - `npm run test` (vitest)
   - `npm run format`

## Notes

- No FK enforcement at SQLite level (matches repo style — userId/transactionId stored as plain ints).
- Out of scope per task: no encryption code, no tRPC router, no UI.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

## Summary

Added the persistence layer for the Trade Review AI Agent: three new tables (`conversations`, `messages`, `agent_settings`) in `drizzle/schema.ts`, five typed helpers in `server/db.ts`, and an integration test that exercises the happy path end-to-end against a real SQLite file.

## What changed

- **`drizzle/schema.ts`** — three new tables with check constraints + indexes:
  - `conversations` (one per `userId × transactionId`) with `conversations_user_transaction_idx`
  - `messages` (transcript incl. tool calls) with `messages_role_check` and `messages_conversation_created_idx`
  - `agent_settings` (single-tenant, userId pk; holds encrypted `providerConfigs` blob whose encryption is owned by the Settings sibling task)
- **`drizzle/0008_nice_retro_girl.sql`** — generated migration; applied cleanly via `npm run db:push`.
- **`server/db.ts`** — five helpers, all `userId`-scoped:
  - `getOrCreateConversation` — idempotent per `(userId, transactionId)`, wrapped in `runInSqliteTransaction`.
  - `appendMessage` — inserts + bumps `conversations.updatedAt` in one transaction.
  - `listMessages` — JOIN guard on `conversations.userId` so a stranger userId returns nothing even with a known conversationId.
  - `getAgentSettings` / `upsertAgentSettings` — single-row upsert, defaults `defaultProvider="deepseek"` and `enabledSkillIds=[]`; patches merge (untouched fields are preserved).
- **`server/reviewAgent.db.test.ts`** — subprocess-style integration test (matching `sqlite.integration.test.ts` pattern) that exercises all 5 helpers in a single fresh-DB run, including the userId scope guard.

## Verification

- `npm run db:push` — migration generated + applied
- `npm run check` — clean
- `npm run test` — 105/105 passing (the new test runs in ~300ms)
- `npm run format` — applied

## Out of scope (per task boundary)

- API key encryption (owned by TASK-18: Settings + secrets module)
- tRPC router (TASK-17)
- UI (TASK-19)
<!-- SECTION:FINAL_SUMMARY:END -->
