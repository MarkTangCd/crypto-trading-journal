---
id: TASK-27
title: Tool-calling 循环 + 安全护栏（Phase 4 · 基建）
status: Done
assignee:
  - '@myself'
created_date: '2026-06-25 12:48'
updated_date: '2026-06-26 07:21'
labels:
  - ai-agent
  - phase-4
  - server
milestone: m-0
dependencies: []
documentation:
  - .lavish/trade-review-ai-agent-plan.html
modified_files:
  - drizzle/schema.ts
  - drizzle/0009_first_shockwave.sql
  - drizzle/meta/0009_snapshot.json
  - drizzle/meta/_journal.json
  - server/db.ts
  - server/agents/providers/types.ts
  - server/agents/providers/openaiCompatible.ts
  - server/agents/providers/openaiCompatible.test.ts
  - server/agents/providers/gemini.ts
  - server/agents/providers/gemini.test.ts
  - server/agents/toolRegistry.ts
  - server/agents/toolRegistry.test.ts
  - server/agents/runTools.ts
  - server/agents/runTools.test.ts
  - server/agents/reviewAgent.ts
priority: high
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Why

Phase 4 的地基：让 agent 在回复中触发工具、读到工具结果、再继续回答。当前 `ChatRequest.tools`、`ChatMessage.toolCalls`、`role="tool"` 都是占位 —— 这个任务把它们真正接进编排器。本任务不引入任何具体工具，只搭好"循环 + 持久化 + 护栏"。

## Context

- 现状：`server/agents/providers/types.ts` 已留 `tools`/`toolCalls`/`toolCallId`/`name` 字段；`messages.role` 已含 `"tool"`；openai-compatible 基底（`server/agents/providers/openaiCompatible.ts`）目前只透传 `messages`，工具字段被忽略。
- 新增 `server/agents/toolRegistry.ts`：导出 `Tool = { name, description, parameters: ZodSchema, run(args, ctx) }`、`listTools()`、`getTool(name)`、`runTool(name, args, ctx)`。注册在 boot-time（顶部 `register()` 调用，像 `providers/registry.ts`）。
- 新增 `server/agents/runTools.ts`：实现一轮 `chat → 若返回 toolCalls 则并发 run → 把 tool 结果加进 messages → 再 chat`，直到模型不再触发工具或达到护栏上限。
  - 护栏：单会话 max 12 步、单工具 max 5 次、整轮 60s 时间预算（用 `AbortSignal` 配合 `setTimeout`）。超出则强制让模型给 final answer（再 chat 一次，移除 `tools` 字段）+ 在最后追加一条 `role="assistant"` 文本 "工具调用达上限，已强制收尾"。
- `messages` 表：新增 `toolCalls: text("toolCalls")`（nullable JSON 字符串）；新增 `toolCallId: text("toolCallId")`（nullable，仅 `role="tool"` 用）。drizzle 迁移生成。
- `openaiCompatible.ts` 的 `chat` / `chatStream` 把 `req.tools` 透传成 `{ tools: [...], tool_choice: "auto" }`；解析 `choices[].message.tool_calls` → `ChatMessage.toolCalls`；streaming 时合并增量 tool_calls。
- `streamUserMessage` 接 `runTools` —— 流式仍按 SSE，但每步工具开始/结束追加新事件类型 `{ type: "tool_call", name, args }`、`{ type: "tool_result", name, ok, summary }`，原 `delta` / `done` / `error` 不变。客户端 Phase 4 后半再消费。
- gemini 单向 schema 翻译留给后续 task，本任务里 `geminiProvider` 暂时忽略 `req.tools`（带 console.warn）。

## Out of scope

- 任何具体工具实现（拆 task 单独做）。
- 客户端工具气泡（拆 task 单独做）。
- gemini FunctionDeclaration 翻译（拆 task 单独做）。
- 流式中"边跑工具边显示工具气泡"的客户端 UI（拆 task 单独做）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 新增 server/agents/toolRegistry.ts，导出 listTools / getTool / runTool，含一个用于测试的 noop tool 用例（boot-time 注册）
- [x] #2 新增 server/agents/runTools.ts，实现 tool-calling 循环：每步 chat → 解析 toolCalls → 并发 run → 把结果 append 成 role="tool" message → 进入下一步
- [x] #3 三类硬护栏均生效：单会话步数 ≤ 12、单工具 ≤ 5 次、整轮时间预算 ≤ 60s；触发时回退到无工具 final answer + 友好提示 message
- [x] #4 drizzle schema 给 messages 加 toolCalls / toolCallId（nullable）列，npm run db:push 通过；既有数据 migration-safe
- [x] #5 openaiCompatible.chat / chatStream 透传 req.tools，解析 tool_calls；既有非工具调用路径无回归（既有测试全绿）
- [x] #6 streamUserMessage 在工具步追加 SSE 事件 { type: "tool_call" } / { type: "tool_result" }，原 delta/done/error 行为不变
- [x] #7 geminiProvider 暂忽略 req.tools 并 console.warn，其余响应路径无回归
- [x] #8 为 runTools 加单测覆盖：单步成功、单步失败 yields tool_result.ok=false、单工具 5 次后停、12 步后回退、60s 超时回退
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## 实施顺序（逐步落地、可单测）

1. **drizzle/schema.ts** 给 `messages` 增加两列 `toolCalls`（text, nullable，存 JSON.stringify(ToolCall[])）和 `toolCallId`（text, nullable，仅 role="tool" 用）。运行 `npm run db:push` 生成 `0009_*.sql` 迁移；既有数据 migration-safe（仅 ALTER ADD COLUMN）。
2. **server/db.ts** 扩 `appendMessage` 入参：可选 `toolCalls?: string | null` / `toolCallId?: string | null`，默认 null；INSERT 把这两列也写入。
3. **server/agents/providers/types.ts** 扩 `ChatStreamChunk`：`delta` 改可选；新增可选 `toolCalls?: ToolCall[]`，仅在工具调用流的末尾出现。`ChatMessage.toolCalls` 已有，无需改动。
4. **server/agents/toolRegistry.ts** 新建：
   - `Tool = { name, description, parameters: ZodSchema, run(args, ctx?) }`；
   - 内部 `Map<string, Tool>` + `register(tool)`；
   - 导出 `getTool(name)`, `listTools(): Tool[]`, `runTool(name, rawArgs, ctx?)`（内部走 Zod parse → tool.run）；
   - `listToolDeclarations(): ToolDeclaration[]` 调 `z.toJSONSchema(tool.parameters)` 喂给 openai-compatible；
   - 顶部直接 `register({ name: "__noop", ... })` 给单测用（echo args 回去）。
5. **server/agents/providers/openaiCompatible.ts**
   - `buildBody`：当 `req.tools?.length` 时加 `tools` 和 `tool_choice: "auto"`；否则不加（既有路径无回归）。
   - `iterateStream`：维护 `Map<index, { id; name; argumentsBuffer }>`，合并 `delta.tool_calls[]`；遇到 `finish_reason: "tool_calls"` 或 SSE 流结束（buffer 非空）时 yield `{ toolCalls: [...] }`。
   - `chat()` 现状照旧（runTools 走 chatStream，不经它）；轻量加 toolCalls 透传以便未来调用方拿到。
6. **server/agents/runTools.ts** 新建（核心 ≤ 100 LOC）：
   - 入口 `runTools({ provider, apiKey, baseUrl, model, messages, signal }): AsyncGenerator<ToolEvent, { appended }>`；
   - 内部状态：`steps`、`usagePerTool: Map<string, number>`；
   - 三类硬护栏：步数 ≤ 12、单工具 ≤ 5、`AbortSignal.timeout(60_000)` 时间预算（合 caller signal）；
   - 每一步：组装本轮 tools → 调 `provider.chatStream({ ..., tools })` → 透传 delta、合并 toolCalls；
   - 无 toolCalls → 把 assistant 文本 `{ role: "assistant", content }` 推到 `appended`，return；
   - 有 toolCalls → 推 `{ role: "assistant", content, toolCalls }`，并发跑工具 → 每个工具 yield `{ type: "tool_call" }` 和 `{ type: "tool_result", ok, summary }`，结果 `{ role: "tool", content, toolCallId, name }` 推 messages + appended；
   - 单工具计数 +1 后 > 5 时，直接给该 call 推 ok=false "工具调用次数已达上限"、设 `guardReason`、`break`；
   - 12 步走完未结束、或 budget signal abort、或 caller signal 不变 → `guardReason` 触发 fallback：先 yield 一个 `{ type: "delta", text: "(已达 X 上限，将直接回答)\n" }`，然后再调 `provider.chatStream` 但**不传 tools**，把 delta 透传，最后把 final assistant 推 appended。
7. **server/agents/reviewAgent.ts** 改 `streamUserMessage`：
   - 把现在的 `for await (chunk of provider.chatStream)` 换成 `runTools(...)`；
   - `StreamEvent` 联合扩 `{ type: "tool_call"; id; name; argsSummary }` / `{ type: "tool_result"; id; name; ok; summary }`（原 `delta`/`done`/`error` 字段序列化保持不变 — 客户端 `useReviewStream` 解析靠固定字段名，新事件 type 直接走 else 静默忽略，无回归）；
   - 持久化 `appended[]`：每条 `appendMessage` 时把 `toolCalls`（JSON.stringify）和 `toolCallId` 写入；
   - `done` 事件用最后一条 assistant 的 id（无则给最后一条 appended 的 id）；
   - 异常处理保持：早期错误抛 ProviderError，流式中错误 yield `error`。
8. **server/agents/providers/gemini.ts** 在 `chat` / `chatStream` 入口：`if (req.tools?.length) { console.warn("[gemini] tool calls not yet supported, dropping tools"); req = { ...req, tools: undefined }; }`；其余响应路径不动。
9. **测试**（AC #8 全覆盖）：
   - `server/agents/toolRegistry.test.ts`：register / get / list / runTool 校验 schema + run；
   - `server/agents/runTools.test.ts`：
     - 单步无 tool → 文本路径，appended 一条 assistant；
     - 单步成功 → tool_call + tool_result(ok=true) 事件 + appended 含 assistant+tool+assistant；
     - 工具 throw → tool_result(ok=false) summary 含错误；
     - 单工具 5 次后第 6 次进入 fallback，含 guard_notice；
     - 12 步路径进入 fallback；
     - 60s 时间预算耗尽进入 fallback（用 vi.useFakeTimers 触发 abort）；
   - `server/agents/providers/openaiCompatible.test.ts` 追加：tools 透传到请求体；流式 tool_calls 合并 + 末尾 yield。
   - `server/agents/providers/gemini.test.ts` 追加：传 tools 时仍正常返回 + 触发 console.warn。
   - 既有 `reviewAgent.stream.test.ts` / `reviewAgent.router.test.ts` / `streamRoute.integration.test.ts` 全部要绿（不传 tools 时 runTools 走单步 → 一条 assistant，行为对齐既有 SSE）。
10. `npm run format` → `npm run check` → `npm run test` → 提示用户审视改动。

## 关键约束确认

- 不引入任何真实工具（只 `__noop` 测试用）。
- 不改 SSE 路由 / 客户端 useReviewStream（只追加新 type，旧字段不动）。
- Phase 2/3 既有测试不许回归（188 + 新增）。
- gemini 这一轮 warn-and-strip，不走真翻译（TASK-30 才做）。
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Summary

Phase 4 的地基铺好了：tool-calling 循环 + 三类硬护栏 + DB 列 + openai-compatible 透传。本任务不引入任何真实工具，只搭好"循环 + 持久化 + 护栏 + 测试"。

## 改动文件

- `drizzle/schema.ts` + `drizzle/0009_first_shockwave.sql`：`messages` 表新增 `toolCalls` / `toolCallId`（nullable text），ALTER ADD COLUMN，migration-safe。
- `server/db.ts`：`appendMessage` 扩可选 `toolCalls?` / `toolCallId?` 入参；既有调用方传 null 等价于不传，行为不变。
- `server/agents/providers/types.ts`：`ChatStreamChunk` 扩 `delta?` + `toolCalls?` —— 工具流末尾以单独 chunk 把合并后的完整 `ToolCall[]` 暴露给编排器。
- `server/agents/providers/openaiCompatible.ts`：`buildBody` 在 `req.tools?.length` 时透传 `tools` + `tool_choice:"auto"`；`iterateStream` 维护按 `index` 分组的 buffer，遇 `finish_reason:"tool_calls"` 或流末尾 flush；assistant 历史回放也正确还原 `tool_calls` 线序。
- `server/agents/providers/gemini.ts`：入口 warn-and-strip `req.tools`（gemini FunctionDeclaration 翻译留给 TASK-30），其余响应路径不动。
- `server/agents/toolRegistry.ts`（新）：`Tool` / `register` / `getTool` / `listTools` / `runTool` / `listToolDeclarations`（用 zod v4 的 `z.toJSONSchema`）；boot-time 注册 `__noop` 用于测试。
- `server/agents/runTools.ts`（新）：核心编排循环 —— chat→tools→loop；三类硬护栏：`MAX_STEPS=12`、`MAX_PER_TOOL=5`、`TIME_BUDGET_MS=60_000`（用 `AbortSignal.any` 复合 caller signal）；触发时 yield 一个 `（…已达上限，将直接回答）` notice delta 后切到无 tools 的 fallback chat，把最终回答流回去。
- `server/agents/reviewAgent.ts`：`StreamEvent` 联合扩 `{type:"tool_call",...}` / `{type:"tool_result",...}`（旧 `delta`/`done`/`error` 字段序列化完全不变 —— 客户端 `useReviewStream` 解析靠固定字段名，未识别 type 静默忽略，无回归）；`streamUserMessage` 把 chatStream 直调换成 `runTools` 驱动，按顺序持久化 `appended[]`，最后一条无 toolCalls 的 assistant 作为 `done.messageId`。

## 测试覆盖（207 总，188 + 19 新增）

- `toolRegistry.test.ts`（6）：register / get / list / declarations / runTool 校验 + 未知 tool。
- `runTools.test.ts`（6）：单步无工具 → 文本；单步成功 → tool_call+tool_result；工具 throw → ok=false；单工具第 6 次触发 fallback；12 步走完后触发 fallback；60s 超时（fake timers）触发 fallback。
- `openaiCompatible.test.ts`（+6）：tools 透传、tools 缺省不污染 body、流式 tool_calls 跨帧合并、stream 末尾 flush、chat() 返回 toolCalls 跳过空内容守卫、assistant tool_calls 历史回放。
- `gemini.test.ts`（+1）：传 tools 时 warn-and-strip，响应路径仍正常。

## 既有路径回归校验

- `npm run check`：零错误。
- `npm run format`：仅对部分测试文件做了空白整理，无语义差异。
- `npm run test`：207/207 全绿。重点确认：
  - `reviewAgent.stream.test.ts` 5/5：deepseek 不传 tools 时单步路径完整保留。
  - `reviewAgent.router.test.ts` 11/11：open / send / list 全绿。
  - `streamRoute.integration.test.ts` 2/2：Express SSE 端到端 delta+done 不变。
  - `openaiCompatible.test.ts` 13 旧测试无回归。
  - `gemini.test.ts` 20 旧测试无回归。

## 关键设计决策

1. **不为 Phase 4 客户端 UI 提前埋路** —— `tool_call`/`tool_result` SSE 事件直接走 `data:` 行，客户端 `useReviewStream` 当前只识别 `delta`/`done`/`error`，未识别 type 静默丢弃，所以服务端可独立先上线，TASK-28 / 后续 UI task 才开始渲染气泡。
2. **fallback notice 作为 delta 前置** —— 触发护栏时用户能立即看到 `（…已达上限，将直接回答）`，然后再流式拼接 fallback 答案，DB 持久化的 assistant content 就是 notice + 答案的拼接（与 SSE wire 一致）。
3. **per-tool 检查在调用前** —— 第 6 次 invocation 不会真正跑工具，而是合成 `{ error: "per-tool call limit reached" }` 写入 messages，保证 ≤ 5 不变量精确。
4. **AbortSignal.any 复合** —— budget timer 和 caller signal 任一 abort 就传给 provider fetch；budget abort 时被 try/catch 捕获并转入 fallback（而不是 error 事件），caller abort 直接抛。
5. **runTools 自己不存 DB**，全部 `appended[]` 由 `streamUserMessage` 统一持久化 —— 解耦编排和存储，方便未来在 router 端的 send mutation 复用相同 runTools。

## Out of scope（按 task 描述）

- 真实工具（get_klines / web_search / web_fetch）：TASK-28 / TASK-29。
- gemini FunctionDeclaration 翻译：TASK-30。
- 客户端工具气泡 UI：TASK-28 后半。
- 流式中"边跑工具边渲染气泡"的 UI 动画：拆 task 单独做。
<!-- SECTION:FINAL_SUMMARY:END -->
