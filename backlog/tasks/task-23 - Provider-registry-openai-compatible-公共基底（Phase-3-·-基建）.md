---
id: TASK-23
title: Provider registry + openai-compatible 公共基底（Phase 3 · 基建）
status: To Do
assignee: []
created_date: '2026-06-25 03:59'
labels:
  - ai-agent
  - phase-3
  - server
  - refactor
milestone: m-0
dependencies:
  - TASK-21
documentation:
  - .lavish/trade-review-ai-agent-plan.html
priority: high
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Why

Phase 3 要新增 4 家 provider（kimi · glm · openai · gemini）。在加之前，把当前写死的 provider 路径换成可扩展的注册中心，并抽出 openai-compatible 基底，避免每加一家就复制一遍 deepseek adapter。

## Context

- 写死点：
  - `server/agents/reviewAgent.ts:12` 的 `DEFAULT_PROVIDER = deepseekProvider`
  - `server/routers.ts:51-52` 的 `SUPPORTED_PROVIDER_IDS = ["deepseek"]` 和 `providerIdSchema`
  - `server/agents/secrets.ts:169-175` 的 `ENV_KEY_BY_PROVIDER` / `ENV_BASE_URL_BY_PROVIDER`
  - `client/src/components/settings/AgentProviderSection.tsx:10-16` 的 `PROVIDER_OPTIONS`
- 抽象目标：
  - 新增 `server/agents/providers/registry.ts`，导出 `getProvider(id)` / `listProviders()`；包含 metadata `{ id, label, defaultBaseUrl, defaultModel, envApiKey, envBaseUrl }`
  - 新增 `server/agents/providers/openaiCompatible.ts`：把 `deepseek.ts` 的 SSE openai 兼容流程抽成 `createOpenAICompatibleProvider({ id, defaultBaseUrl, defaultModel, errorBrand })`
  - `deepseekProvider` 改写成 `createOpenAICompatibleProvider({...})` 的薄包装，保留 `id = "deepseek"` / `defaultModel = "deepseek-chat"`，行为与现状完全等价
- `reviewAgent.resolveProvider` 改为从 registry 取：根据 `agent_settings.defaultProvider`（已落库，默认 deepseek）查 registry；找不到时降级回 deepseek 并 `console.warn`
- `SUPPORTED_PROVIDER_IDS` 与 `providerIdSchema` 由 `listProviders().map(p => p.id)` 派生
- `secrets.ts` 的 env map 由 registry metadata 派生
- 不引入新 provider，不改 UI；纯重构 + 测试覆盖
- 现有 137 测试必须保持绿；新增基底单测（builder shape + error mapping）即可

## Out of scope

- 任何新 provider 实现（TASK-24 / TASK-25 接手）
- Settings UI 改动（TASK-24 接手列表化）
- per-conversation provider 覆盖（TASK-26）
- Provider fallback / 自动跳下一家
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 #1 `server/agents/providers/registry.ts` 暴露 `getProvider(id)` / `listProviders()` 与 metadata（id, label, defaultBaseUrl, defaultModel, envApiKey, envBaseUrl）；deepseek 注册其中
- [ ] #2 #2 `server/agents/providers/openaiCompatible.ts` 抽出当前 deepseek SSE 实现；deepseekProvider 改写为基底的薄包装，外观行为与现有完全一致（错误文案、defaultModel、SSE 行为）
- [ ] #3 #3 `server/agents/reviewAgent.ts` 不再 import 具体 provider；`resolveProvider` 通过 registry + `agent_settings.defaultProvider` 选 provider；找不到时降级 deepseek 并 console.warn
- [ ] #4 #4 `server/routers.ts` 的 `SUPPORTED_PROVIDER_IDS` 与 `providerIdSchema` 从 registry 派生；`server/agents/secrets.ts` 的 ENV_KEY / ENV_BASE_URL map 同样从 registry 派生
- [ ] #5 #5 新增 `openaiCompatible.test.ts`：覆盖 body 形态、AUTH/401 与 RATE_LIMIT/429 映射、空响应错误、AbortError 静默化
- [ ] #6 #6 现有 137 个测试全绿；reviewAgent 路由与 streamRoute 集成测试无需改动（行为不变）
- [ ] #7 #7 `npm run check` + `npm run format` 通过；client 侧未触碰
<!-- AC:END -->
