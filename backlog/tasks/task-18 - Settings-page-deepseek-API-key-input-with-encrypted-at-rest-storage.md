---
id: TASK-18
title: "Settings page: deepseek API key input with encrypted-at-rest storage"
status: Done
assignee: []
created_date: "2026-06-24 14:19"
updated_date: "2026-06-24 14:41"
labels:
  - ai-agent
  - phase-1
  - settings
  - security
milestone: m-0
dependencies:
  - TASK-16
documentation:
  - .lavish/trade-review-ai-agent-plan.html
modified_files:
  - server/agents/secrets.ts
  - server/agents/reviewAgent.ts
  - server/routers.ts
  - server/agents/secrets.test.ts
  - server/settings.router.test.ts
  - server/reviewAgent.router.test.ts
  - client/src/components/settings/AgentProviderSection.tsx
  - client/src/pages/Settings.tsx
  - .gitignore
priority: high
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

## Why

The user needs to paste their deepseek API key once and have it persisted securely. v1 only handles deepseek; the storage shape leaves room for kimi/glm/gemini/openai in Phase 3.

## Context

- Decision: AES-GCM via `node:crypto`, with a local master key file (mode 0600) auto-generated on first start; path goes in `.gitignore`.
- Single-tenant anonymous user (`CLAUDE.md` §Authentication) — no per-user key separation.
- Provider table key: `deepseek`. Future-proof JSON shape:
  ```json
  { "deepseek": { "apiKey": "<enc>", "baseUrl": "https://api.deepseek.com" } }
  ```
- The encryption helper is shared infra and should live at `server/agents/secrets.ts`.

## Shape

- `server/agents/secrets.ts` — `encrypt(plaintext)` / `decrypt(ciphertext)`, loads/creates master key at `<repo>/.local/agent-master.key`.
- `server/db.ts` extends `getAgentSettings` / `upsertAgentSettings` to decrypt/encrypt the providerConfigs blob transparently.
- `server/routers.ts` — extend the existing `settings.*` router (or add a nested `settings.agent` if cleaner) with `getProviderConfig` (returns boolean `hasKey` + baseUrl, NEVER the plaintext key) + `setProviderConfig({ providerId, apiKey, baseUrl })`.
- `client/src/pages/Settings.tsx` — new "AI 复盘助手" section: provider dropdown (deepseek only for now, but render as dropdown to make Phase 3 trivial), API key masked input, optional base URL, save button, "已配置 / 未配置" status badge.
- `.gitignore` adds `.local/`.

## Out of scope

- Other providers (Phase 3 task will reuse the same infra)
- Selecting default provider (only one option in v1)
- Master key rotation / multi-machine sync
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 server/agents/secrets.ts implements AES-GCM encrypt/decrypt with auto-generated 32-byte master key at .local/agent-master.key (mode 0600)
- [x] #2 API key plaintext never leaves the server: getProviderConfig returns hasKey boolean + baseUrl only
- [x] #3 Settings page shows AI 复盘助手 section with provider dropdown, masked API key input, base URL input, save button, configured/unconfigured status
- [x] #4 Saving a key persists ciphertext in agent_settings.providerConfigs and survives a server restart
- [x] #5 .gitignore contains .local/ entry
- [x] #6 Vitest covers secrets round-trip and the tRPC procedure does not echo back plaintext
- [x] #7 npm run check + npm run test pass; npm run format applied
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

## Summary

Wired up encrypted-at-rest deepseek API key storage end-to-end: AES-256-GCM in `server/agents/secrets.ts` with an auto-generated 32-byte master key at `.local/agent-master.key` (mode 0600, gitignored), a `settings.{getProviderConfig,setProviderConfig}` tRPC pair that never echoes plaintext, and an "AI 复盘助手" section on the Settings page with provider dropdown, masked key input, optional base URL, and configured/missing status.

## What changed

- **`server/agents/secrets.ts`** — replaced the env-only shim with the real thing: AES-256-GCM via `node:crypto`, 12-byte IVs, `${ivB64}:${tagB64}:${ctB64}` token format. `loadMasterKey()` lazily reads or auto-generates `.local/agent-master.key` and chmods 0600. New exports: `encrypt` / `decrypt` / `getProviderConfig` / `setProviderConfig`. `getProviderApiKey` / `getProviderBaseUrl` now take `(userId, providerId)` and prefer the encrypted store, falling back to `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` env vars for dev.
- **`server/agents/reviewAgent.ts`** — `resolveProvider` is now async and userId-aware, matching the new secrets signature.
- **`server/routers.ts`** — added `settings` nested router with `getProviderConfig` (returns `{ providerId, hasKey, baseUrl }`, never the key) and `setProviderConfig` (zod-validates providerId via an enum + trims base URL + normalises empty string to null).
- **`server/agents/secrets.test.ts`** — subprocess-style integration test: encrypt/decrypt round-trip, save→re-read via setProviderConfig, asserts the persisted `agent_settings.providerConfigs` does **not** contain the plaintext, asserts the patch path keeps existing key when only base URL changes, asserts the master key file exists after first use.
- **`server/settings.router.test.ts`** — 5 router tests: hasKey false when empty, hasKey true + base URL but no plaintext in the response (asserted by `JSON.stringify(result).not.toContain("sk-…")`), saves forward to secrets layer with `ctx.user.id`, empty base URL normalised to null, unknown providerId rejected via zod enum.
- **`server/reviewAgent.router.test.ts`** — updated mock signatures to match the new async secrets API.
- **`client/src/components/settings/AgentProviderSection.tsx`** — new component (sub-200 LOC) — provider dropdown (deepseek only for now, dropdown structure makes Phase 3 trivial), masked password input for api key, optional base URL, configured/missing status badge with win/loss color, full Chinese copy.
- **`client/src/pages/Settings.tsx`** — drops in the new section between the accounts row and the about footer.
- **`.gitignore`** — adds `.local/` so the master key never gets committed.

## Verification

- `npm run check` — clean
- `npm run test` — 120/120 passing (7 new tests, 0 regressions)
- `npm run format` — applied

## Out of scope (per task boundary)

- Other providers (Phase 3 — the storage shape and UI dropdown are already future-proof)
- Master key rotation / multi-machine sync
- AgentDrawer UI (TASK-19)
<!-- SECTION:FINAL_SUMMARY:END -->
