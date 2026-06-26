---
id: TASK-30
title: Gemini FunctionDeclaration schema 翻译（Phase 4 · gemini）
status: To Do
assignee: []
created_date: "2026-06-25 12:50"
labels:
  - ai-agent
  - phase-4
  - server
milestone: m-0
dependencies:
  - TASK-27
  - TASK-28
documentation:
  - .lavish/trade-review-ai-agent-plan.html
priority: medium
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

## Why

TASK-27 收尾时 gemini 是"先 console.warn 略过 tools"的妥协，让 Phase 4 主干能先跑通。这一步把 gemini 拉齐：openai 系吃 JSON Schema，gemini 走 FunctionDeclaration，差异在适配器内做一次单向翻译即可，对外保持 ChatProvider 接口不变。

## Context

- `server/agents/providers/gemini.ts`：扩 `chat` / `chatStream`，把 `req.tools` 翻译进 generateContent body 的 `tools: [{ functionDeclarations: [...] }]`。模型回的 `functionCall` 解析回 `ChatMessage.toolCalls`。
- 翻译规则：
  - `name` / `description` 直传。
  - `parameters` (JSON Schema) → Gemini 的 OpenAPI 子集 schema：移除 gemini 不认的关键字（`$schema`, `additionalProperties` 在某些情况不支持等），保留 `type` / `properties` / `required` / `items` / `enum` / `description`。
  - 工具结果回喂时 role 用 `function`，name 字段必填。
- `streamUserMessage` / `runTools` 不改 —— 它们看到的还是统一 `ChatMessage` 结构。
- 翻译函数独立成 `server/agents/providers/geminiToolSchema.ts`，单测覆盖。

## Out of scope

- multi-turn parallel function calls 的特殊处理（gemini 支持但 v0 不专门优化，模型偶尔串行即可）。
- 流式中 functionCall 增量合并（v0 假设 functionCall 一整块返；多数情况下 gemini 行为如此）。
- 把 gemini schema 翻译反过来用于 openai 系（无需）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 server/agents/providers/geminiToolSchema.ts 实现 translateToGeminiTools(tools: ToolDeclaration[]) 和 parseGeminiFunctionCalls(response)
- [ ] #2 translate 函数处理 JSON Schema · Gemini OpenAPI 子集 的转换：properties / required / items / enum / description 保留；不认的关键字剔除
- [ ] #3 gemini.chat / chatStream 透传翻译后的 tools；functionCall 解析回 ChatMessage.toolCalls；function 回咵时 role/name 必填
- [ ] #4 移除 TASK-27 遗留的 console.warn 提示
- [ ] #5 get_klines / get_recent_trades 能在 gemini provider 上运行起来（烟测），与 openai 系响应一致
- [ ] #6 单测覆盖：translateToGeminiTools 几个关键转换、parseGeminiFunctionCalls 含 functionCall / 不含的分支
- [ ] #7 npm run check + npm run format + npm run test 全绿
<!-- AC:END -->
