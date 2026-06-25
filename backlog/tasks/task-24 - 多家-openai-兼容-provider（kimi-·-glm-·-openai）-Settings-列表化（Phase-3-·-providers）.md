---
id: TASK-24
title: 多家 openai 兼容 provider（kimi · glm · openai）+ Settings 列表化（Phase 3 · providers）
status: To Do
assignee: []
created_date: '2026-06-25 04:00'
labels:
  - ai-agent
  - phase-3
  - server
  - ui
  - providers
milestone: m-0
dependencies:
  - TASK-23
documentation:
  - .lavish/trade-review-ai-agent-plan.html
priority: high
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Why

Plan 的 provider 表格里 4 家是 openai 兼容（含 deepseek）：kimi · moonshot，glm · 智谱，openai。基底已在 TASK-23 抽出，本任务把三家挂上 registry，并让 Settings 页根据 registry 列表自动渲染，所有 provider 一字排开。

## Context

- Provider metadata：
  - **kimi · moonshot** — id `kimi`，label `kimi · moonshot`，base `https://api.moonshot.cn/v1`，model `moonshot-v1-128k`，env `MOONSHOT_API_KEY` / `MOONSHOT_BASE_URL`
  - **glm · 智谱** — id `glm`，label `glm · 智谱`，base `https://open.bigmodel.cn/api/paas/v4`，model `glm-4.5`，env `GLM_API_KEY` / `GLM_BASE_URL`
  - **openai** — id `openai`，label `openai`，base `https://api.openai.com/v1`，model `gpt-5`（也可 `gpt-4o`），env `OPENAI_API_KEY` / `OPENAI_BASE_URL`
- 三家全部用 TASK-23 的 `createOpenAICompatibleProvider`，只换 metadata；错误文案里把 `deepseek` 字样替换成对应品牌（基底已支持 `errorBrand`）
- 新增 `server/agents/providers/openaiKimi.ts` / `openaiGlm.ts` / `openai.ts`（或直接在 registry 里 inline，看实现取舍）
- 三家逐一在 registry 注册；`SUPPORTED_PROVIDER_IDS` 自动扩展（依赖 TASK-23 的派生）
- 新增 tRPC `settings.listProviders`：返回 `[{ id, label, defaultBaseUrl, defaultModel, hasKey, configuredBaseUrl }]`；客户端用它替换硬编码的 `PROVIDER_OPTIONS`
- 改造 `client/src/components/settings/AgentProviderSection.tsx`：
  - 不再 hard-code 单 provider；从 `trpc.settings.listProviders.useQuery()` 拉清单
  - 仍是一个 section，但内部为每个 provider 渲染一组 [key 输入 + baseUrl 输入 + 保存按钮]
  - 状态徽章：每个 provider 独立 `已配置 / 未配置`
  - 保存交互保持每 provider 独立（避免互相清空 draft）
- 不引入"默认 provider 选择" UI（TASK-26 接手）
- AgentDrawer 仍按 `defaultProvider`（agent_settings.defaultProvider，默认 deepseek）开会话；本任务不动 drawer

## Out of scope

- Gemini 适配器（TASK-25 独立做）
- 默认 provider 选择 UI 与 per-conversation 覆盖（TASK-26）
- 错误降级 / fallback 跳转
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 #1 registry 中注册 kimi / glm / openai 三家，均走 `createOpenAICompatibleProvider` 基底，品牌错误文案独立
- [ ] #2 #2 三家 metadata（defaultBaseUrl / defaultModel / envApiKey / envBaseUrl）与 plan 表格一致，`SUPPORTED_PROVIDER_IDS` 自动含三个新 id
- [ ] #3 #3 新增 `settings.listProviders` tRPC procedure，返回所有 provider 的 metadata + hasKey + configuredBaseUrl；plaintext key 从不回传
- [ ] #4 #4 `AgentProviderSection.tsx` 从 `listProviders` 拉清单渲染，为每家 provider 独立渲染 [api key + base url + 状态徽章 + 保存 按钮]；单家保存不影响其他
- [ ] #5 #5 验证烟测：Settings 页上填入 kimi/glm/openai 其中任一家 key 后，能在 reviewAgent.open 时通过临时切 default【允许手动改 `agent_settings.defaultProvider` 评测】走通对话（stream + done 事件出现）
- [ ] #6 #6 新增轻量单测：kimi/glm/openai 适配器的 baseUrl 混入正确、model 默认值正确；Settings router 的 `listProviders` 不回传明文 key
- [ ] #7 #7 `npm run check` + `npm run format` 通过；现有测试全绿
<!-- AC:END -->
