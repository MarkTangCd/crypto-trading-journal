---
id: TASK-25
title: Gemini provider 适配器（google genai SSE）（Phase 3 · gemini）
status: To Do
assignee: []
created_date: '2026-06-25 04:01'
updated_date: '2026-06-25 04:03'
labels:
  - ai-agent
  - phase-3
  - server
  - providers
milestone: m-0
dependencies:
  - TASK-23
documentation:
  - .lavish/trade-review-ai-agent-plan.html
priority: medium
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Why

gemini 不是 openai-compatible，需要单独适配 google genai 协议。挂上 registry 后 Settings 列表（TASK-24 完成后）会自动出现 gemini 卡片，用户可填 key 跑通对话。

## Context

- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?key={apiKey}` 或新版 `:streamGenerateContent?alt=sse`
- 默认模型：`gemini-2.5-flash`（plan 写 `gemini-2.5-pro / flash`，flash 便宜更适合默认）
- 协议要点：
  - 请求体 `{ contents: [{ role, parts: [{ text }] }], generationConfig: { temperature } }`
  - role 映射：`assistant` → `model`；`system` 通过 `systemInstruction` 字段，不进 contents
  - tool 字段先留空（Phase 4 才用 — 留好扩展点：`tools: [{ functionDeclarations: [...] }]`）
- 流式：`alt=sse` 时按 SSE 帧返回，每帧是 GenerateContentResponse JSON；从 `candidates[0].content.parts[0].text` 取增量；用 TASK-21 的 `parseSseFrames` 即可
- 错误：
  - 401 / 403 → `ProviderError("AUTH", ...)`
  - 429 → `ProviderError("RATE_LIMIT", ...)`
  - 其他非 2xx → `ProviderError("UPSTREAM", ...)`
- 国内不可直连 — Settings 已支持 baseUrl 覆盖，文案里加一句"国内需走反代"
- 不复用 openaiCompatible 基底（schema 差异大），单独实现一个 `gemini.ts`，但仍走 `parseSseFrames` 和 `composeSignal` 等共用工具
- 注册到 registry：id `gemini`，label `gemini`，base `https://generativelanguage.googleapis.com/v1beta`，model `gemini-2.5-flash`，env `GEMINI_API_KEY` / `GEMINI_BASE_URL`
- Settings 自动呈现 gemini 卡片（依赖 TASK-24 列表化）

## Out of scope

- Tool calling（Phase 4）
- 默认 provider 选择 UI 与 per-conversation 覆盖（TASK-26）
- 自动 fallback
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 新增 `server/agents/providers/gemini.ts`：实现 `ChatProvider` 接口，请求体使用 google genai schema（contents/parts + systemInstruction），调用 `:streamGenerateContent?alt=sse`
- [ ] #2 chatStream 复用 `parseSseFrames`，从 `candidates[0].content.parts[0].text` 取 delta；chat 遵循“drain-and-concat”模式
- [ ] #3 错误映射：401/403→AUTH、429→RATE_LIMIT、其他非2xx→UPSTREAM、AbortError 静默化同 TASK-21
- [ ] #4 注册到 registry：id `gemini`、label `gemini`、base `https://generativelanguage.googleapis.com/v1beta`、model `gemini-2.5-flash`、env `GEMINI_API_KEY` / `GEMINI_BASE_URL`
- [ ] #5 Settings 页（依赖 TASK-24 列表化）自动出现 gemini 卡片，可填入 key；手工烟测（需代理 + gemini key）走通：drawer 能出 delta
- [ ] #6 新增 `gemini.test.ts`：覆盖 systemInstruction 提取、role 映射 user/assistant→user/model、delta 抽取、错误映射
- [ ] #7 `npm run check` + `npm run format` 通过；所有现有测试绿
<!-- AC:END -->
