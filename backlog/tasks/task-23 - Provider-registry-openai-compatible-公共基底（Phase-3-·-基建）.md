---
id: TASK-23
title: Provider registry + openai-compatible 公共基底（Phase 3 · 基建）
status: Done
assignee:
  - "@myself"
created_date: "2026-06-25 03:59"
updated_date: "2026-06-25 07:38"
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
modified_files:
  - server/agents/providers/registry.ts
  - server/agents/providers/openaiCompatible.ts
  - server/agents/providers/openaiCompatible.test.ts
  - server/agents/providers/deepseek.ts
  - server/agents/reviewAgent.ts
  - server/agents/secrets.ts
  - server/routers.ts
  - server/reviewAgent.router.test.ts
  - server/reviewAgent.stream.test.ts
  - server/streamRoute.integration.test.ts
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

- [x] #1 #1 `server/agents/providers/registry.ts` 暴露 `getProvider(id)` / `listProviders()` 与 metadata（id, label, defaultBaseUrl, defaultModel, envApiKey, envBaseUrl）；deepseek 注册其中
- [x] #2 #2 `server/agents/providers/openaiCompatible.ts` 抽出当前 deepseek SSE 实现；deepseekProvider 改写为基底的薄包装，外观行为与现有完全一致（错误文案、defaultModel、SSE 行为）
- [x] #3 #3 `server/agents/reviewAgent.ts` 不再 import 具体 provider；`resolveProvider` 通过 registry + `agent_settings.defaultProvider` 选 provider；找不到时降级 deepseek 并 console.warn
- [x] #4 #4 `server/routers.ts` 的 `SUPPORTED_PROVIDER_IDS` 与 `providerIdSchema` 从 registry 派生；`server/agents/secrets.ts` 的 ENV_KEY / ENV_BASE_URL map 同样从 registry 派生
- [x] #5 #5 新增 `openaiCompatible.test.ts`：覆盖 body 形态、AUTH/401 与 RATE_LIMIT/429 映射、空响应错误、AbortError 静默化
- [x] #6 #6 现有 137 个测试全绿；reviewAgent 路由与 streamRoute 集成测试无需改动（行为不变）
- [x] #7 #7 `npm run check` + `npm run format` 通过；client 侧未触碰
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

## 实施计划

### 1. 新增 `server/agents/providers/registry.ts`

- 定义 `ProviderMetadata { id, label, defaultBaseUrl, defaultModel, envApiKey, envBaseUrl }`
- 静态注册表 `Map<string, { metadata, provider }>`，目前只放 deepseek
- 暴露 `getProvider(id)` / `listProviders()`

### 2. 新增 `server/agents/providers/openaiCompatible.ts`

- 从 `deepseek.ts` 抽出 `buildBody / composeSignal / openStream / iterateStream / mapHttpStatus`
- 工厂函数 `createOpenAICompatibleProvider({ id, defaultBaseUrl, defaultModel, errorBrand })`
- 所有 "deepseek" 字面量替换为 `errorBrand` 模板，保持现有中文文案结构

### 3. `deepseek.ts` 改为薄包装

- 只剩一行 `export const deepseekProvider = createOpenAICompatibleProvider({...})`，保留 id/defaultModel 与现状完全一致

### 4. `server/agents/reviewAgent.ts`

- 去掉对 `deepseekProvider` 的直接 import
- `resolveProvider` 读 `agent_settings.defaultProvider`（通过 `getAgentSettings`），到 registry 取；找不到时 `console.warn` 并降级 `getProvider("deepseek")`
- 其余对话流程不动

### 5. `server/routers.ts`

- `SUPPORTED_PROVIDER_IDS = listProviders().map(p => p.id)`，cast 成 zod 需要的 `[string, ...string[]]` 元组
- `providerIdSchema` 由其派生

### 6. `server/agents/secrets.ts`

- `ENV_KEY_BY_PROVIDER` / `ENV_BASE_URL_BY_PROVIDER` 由 registry metadata 派生（`Object.fromEntries`）

### 7. 新增 `server/agents/providers/openaiCompatible.test.ts`

覆盖：

- body 形态：model / messages / stream:true（temperature 可选）
- 401/403 → ProviderError("AUTH")，brand 文案
- 429 → ProviderError("RATE_LIMIT")
- 其它非 2xx → ProviderError("UPSTREAM")
- 空 body → ProviderError("INVALID_RESPONSE")
- AbortError 抛出 → ProviderError("NETWORK", "请求已被中断。")
- 流式 delta 顺序正确 + `[DONE]` 终结

### 8. 校验

- `npm run check`、`npm run format`、`npm run test` 全绿（137 + N 新）
- 不动任何已存在的测试文件，保证 `reviewAgent.router.test.ts` / `reviewAgent.stream.test.ts` / `streamRoute.integration.test.ts` 仍用 `vi.mock("./agents/providers/deepseek", …)` 通过 —— deepseek.ts 的导出名 `deepseekProvider` 不改

### 9. 收尾

- Backlog AC 全勾、final summary、Done
- 提交时只包含 task-23 .md + 代码，**不带** task-24/25/26 .md

待你确认后开干。

<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

## Provider registry + openai-compatible 公共基底（Phase 3 基建）

把 Phase 2 写死的 deepseek 路径换成可扩展的注册中心，并抽出 openai-compatible SSE 公共基底，为 Phase 3 接 kimi / glm / openai / gemini 铺路。零行为变化 —— deepseek 体验保持等价。

### 关键改动

- 新增 `server/agents/providers/openaiCompatible.ts`（217 LOC）：工厂 `createOpenAICompatibleProvider({ id, defaultBaseUrl, defaultModel, errorBrand })`，把 body builder / composeSignal / openStream / iterateStream / mapHttpStatus 一并下放到基底。所有 "deepseek" 字面量改用 `errorBrand` 模板。
- 新增 `server/agents/providers/registry.ts`（55 LOC）：`ProviderMetadata { id, label, defaultBaseUrl, defaultModel, envApiKey, envBaseUrl }` + `getProvider(id)` / `listProviders()`；deepseek 注册为唯一条目，TASK-24/25 将通过同一入口接其它 provider。
- `server/agents/providers/deepseek.ts` 从 209 行缩到 9 行 —— 只剩一个 `createOpenAICompatibleProvider({...})` 调用，导出名 `deepseekProvider` 不变。
- `server/agents/reviewAgent.ts` `resolveProvider` 不再 import `deepseekProvider`，改为：读 `agent_settings.defaultProvider`（`getAgentSettings`）→ registry 查找 → 未命中 `console.warn` 并降级到 `getProvider("deepseek")`。
- `server/routers.ts` 的 `SUPPORTED_PROVIDER_IDS` 与 `providerIdSchema` 由 `listProviders().map(p => p.id)` 派生；z.enum 元组 cast 处理已加注释。
- `server/agents/secrets.ts` 的 `ENV_KEY_BY_PROVIDER` / `ENV_BASE_URL_BY_PROVIDER` 改由 registry metadata 派生（`Object.fromEntries`）。
- 新增 `server/agents/providers/openaiCompatible.test.ts`（13 用例）：body shape、401/403→AUTH、429→RATE_LIMIT、其它非 2xx→UPSTREAM、空响应→INVALID_RESPONSE、AbortError→NETWORK、delta 顺序 + `[DONE]` 终结、baseUrl 尾斜杠规整、temperature 选传等。
- 三个旧测试（`reviewAgent.router.test.ts` / `reviewAgent.stream.test.ts` / `streamRoute.integration.test.ts`）在 `vi.mock("./db", …)` 里各补一行 `getAgentSettings: vi.fn().mockResolvedValue(undefined)` —— 仅 mock entry 补全，断言全部不变。

### 校验

- `npm run check` ✅
- `npm run format` ✅（只对新 test 自动重排，无业务文件改动）
- `npm run test` ✅ **150 / 150 全绿**（137 baseline + 13 新增基底单测）
- 集成测试 `streamRoute.integration.test.ts` / `reviewAgent.router.test.ts` 行为完全保持

### 后续

- TASK-24（kimi / glm / openai 接入）和 TASK-25（Gemini SSE）现已解锁，且彼此独立可并行。
- TASK-26（默认 provider 选择 + per-conversation override）依旧依赖 24+25。
- Out of scope 维持：未引入新 provider，未动 Settings UI，未做 fallback。
<!-- SECTION:FINAL_SUMMARY:END -->
