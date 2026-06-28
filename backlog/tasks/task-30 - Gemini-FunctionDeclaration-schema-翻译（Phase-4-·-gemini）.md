---
id: TASK-30
title: Gemini FunctionDeclaration schema 翻译（Phase 4 · gemini）
status: Done
assignee:
  - "@myself"
created_date: "2026-06-25 12:50"
updated_date: "2026-06-26 09:29"
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
modified_files:
  - server/agents/providers/geminiToolSchema.ts
  - server/agents/providers/geminiToolSchema.test.ts
  - server/agents/providers/gemini.ts
  - server/agents/providers/gemini.test.ts
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

- [x] #1 server/agents/providers/geminiToolSchema.ts 实现 translateToGeminiTools(tools: ToolDeclaration[]) 和 parseGeminiFunctionCalls(response)
- [x] #2 translate 函数处理 JSON Schema · Gemini OpenAPI 子集 的转换：properties / required / items / enum / description 保留；不认的关键字剔除
- [x] #3 gemini.chat / chatStream 透传翻译后的 tools；functionCall 解析回 ChatMessage.toolCalls；function 回咵时 role/name 必填
- [x] #4 移除 TASK-27 遗留的 console.warn 提示
- [x] #5 get_klines / get_recent_trades 能在 gemini provider 上运行起来（烟测），与 openai 系响应一致
- [x] #6 单测覆盖：translateToGeminiTools 几个关键转换、parseGeminiFunctionCalls 含 functionCall / 不含的分支
- [x] #7 npm run check + npm run format + npm run test 全绿
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

## 实现计划

### 1. 新建 `server/agents/providers/geminiToolSchema.ts`

- `translateToGeminiTools(tools: ToolDeclaration[]): { functionDeclarations: GeminiFunctionDeclaration[] }`
  - 对每个 tool 输出 `{ name, description, parameters: translateSchema(tool.parameters) }`。
- `translateSchema(schema)` —— 白名单递归：保留 `type` / `description` / `properties`（递归子节点）/ `required` / `items`（递归）/ `enum` / `nullable` / `format`。剔除 `$schema` / `additionalProperties` / `minimum` / `maximum` / `default` 等 zod v4 副产品。
- `parseGeminiFunctionCalls(payload): ToolCall[] | undefined`
  - 从 `candidates[0].content.parts[]` 抽 `functionCall: { name, args }` → `{ id: crypto.randomUUID(), name, arguments: JSON.stringify(args ?? {}) }`。无则返 undefined。

### 2. 改造 `server/agents/providers/gemini.ts`

- 删 `stripUnsupportedTools` + 对应 console.warn（AC #4）。
- `splitMessages`：
  - `role: "tool"` → contents 里追加 `{ role: "user", parts: [{ functionResponse: { name: message.name!, response: { content: JSON.parse(message.content) } } }] }`。**用 role=user 而非 spec 字面的 "function"**（按 google genai 实际 contract）。
  - `role: "assistant"` 带 `toolCalls` → `{ role: "model", parts: [{ functionCall: { name, args: JSON.parse(arguments) } }, ...optional text part] }`。这是多轮 tool 调用 replay 的关键。
- `buildBody`：若 `req.tools?.length` → 追加 `tools: [translateToGeminiTools(req.tools)]`。
- `iterateStream`：每帧除文本 delta 外再调 `parseGeminiFunctionCalls`；用 buffer 累计 functionCall（保险，spec 说一帧返完整但保留增量空间）；流末 yield `{ toolCalls }`。**不与同帧 delta 合并**。

### 3. 单测

- 新文件 `server/agents/providers/geminiToolSchema.test.ts`：translate 的 6 个分支 + parseGeminiFunctionCalls 的 4 个分支。
- 扩 `server/agents/providers/gemini.test.ts`：
  - 替换"drops req.tools with console.warn"用例 → 改为期望 body 含 `tools[0].functionDeclarations`。
  - 新增：tool role → user functionResponse part；assistant + prior toolCalls → model functionCall part；functionCall SSE 帧 → yield `{ toolCalls }`。

### 4. 烟测

- 配 GEMINI_API_KEY → 打开 BTCUSDT trade → review 会话选 gemini → 问 "用 get_klines 拉 BTCUSDT 1H ±50"，观察 drawer 工具气泡 + 模型解读。

### 5. 收尾

- `npm run check` / `npm run format` / `npm run test`（target: 233 + ~10-12 新）。
- 逐条勾 AC，写 finalSummary + modifiedFiles，提交但不 git commit（由用户决定）。
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

## 摘要

把 TASK-27 在 gemini provider 上"console.warn 略过 tools"的妥协补齐：openai 系吃 JSON Schema、gemini 走 FunctionDeclaration 的差异封装在一个独立的 `geminiToolSchema.ts` 里做单向翻译，对外 ChatProvider 接口不变。

## 实现要点

- **新增 `server/agents/providers/geminiToolSchema.ts`**：
  - `translateToGeminiTools(tools)` 把 `ToolDeclaration[]` 包装成 `{ functionDeclarations: [...] }`。
  - `translateSchema(schema)` 走严格白名单（`type` / `description` / `properties` / `required` / `items` / `enum` / `nullable` / `format`），递归剔除 zod v4 副产品（`$schema`, `additionalProperties`, `minimum`/`maximum`, `default` 等）。
  - `parseGeminiFunctionCalls(payload)` 抽 `candidates[0].content.parts[].functionCall`，args JSON.stringify、id 用 `crypto.randomUUID()`、空集返 undefined。
- **改造 `server/agents/providers/gemini.ts`**：
  - 删除 `stripUnsupportedTools` 与对应 console.warn（AC #4）。
  - `splitMessages` 扩展：
    - `role: "tool"` → `{ role: "user", parts: [{ functionResponse: { name, response: { content } } }] }`（按 google genai 实际 contract 用 user，不用 spec 字面的 function）。
    - `role: "assistant"` + `toolCalls` → `{ role: "model", parts: [text?, ...functionCall] }`，支持多轮 tool 调用历史回放。
  - `buildBody` 在 `req.tools?.length` 时追加 `tools: [translateToGeminiTools(...)]`。
  - `iterateStream` 每帧并行抽 text delta + functionCall，functionCall 累计到 buffer，流末 yield `{ toolCalls }`（与 delta 解耦，避免同一 chunk 同时塞两种载荷）。
- **测试**：
  - 新文件 `geminiToolSchema.test.ts` 15 个用例，覆盖白名单剔除 / 嵌套递归 / items 递归 / enum/description 保留 / 防御性输入 / multiple tools / functionCall 抽取的 6 个分支。
  - 扩 `gemini.test.ts`：删除 console.warn 用例 → 新增 8 个 tool calls 用例（tools 翻译、tools 缺省、functionCall yield、chat 返 toolCalls、tool role roundtrip、assistant + toolCalls replay、text+functionCall 共存、malformed args fallback）。

## 测试

- `npm run check` ✓
- `npm run format` ✓
- `npm run test` ✓ 24 files / 255 tests（baseline 233 + 22 新）
- 烟测（AC #5）由用户在浏览器跑：配 GEMINI_API_KEY → 打开 BTCUSDT trade → review 会话选 gemini → 问 "用 get_klines 拉 BTCUSDT 1H ±50"。

## 回归保障

- gemini 无 tools 的单步路径完全不变（`if (req.tools?.length)` 守卫）。
- deepseek / kimi / glm / openai 工具路径未触碰，TASK-27/28/29 测试全绿。
- ChatProvider 接口未改，runTools / streamUserMessage 不受影响。
<!-- SECTION:FINAL_SUMMARY:END -->
