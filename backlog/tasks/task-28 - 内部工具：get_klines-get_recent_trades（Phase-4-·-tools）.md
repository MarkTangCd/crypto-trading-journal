---
id: TASK-28
title: 内部工具：get_klines + get_recent_trades（Phase 4 · tools）
status: To Do
assignee: []
created_date: "2026-06-25 12:49"
labels:
  - ai-agent
  - phase-4
  - server
  - ui
milestone: m-0
dependencies:
  - TASK-27
documentation:
  - .lavish/trade-review-ai-agent-plan.html
priority: high
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

## Why

Phase 4 第一批用户可见的能力 —— 两个零外网依赖的内部工具，让 agent 能自己缩放 K 线视野、按 pair/direction 复盘历史交易。配合本任务也把"工具调用气泡"接进 AgentDrawer，UX 闭环。

## Context

- `server/agents/tools/getKlines.ts`（新建）：参数 `{ pair, timeFrame, anchor: number, before, after }`，复用 `server/_core/coinank.ts:fetchCandleWindowAround`。返回 OHLCV 数组（已缩短精度），用于 token 预算。`run` 内通过 ZodSchema 校验 → 失败返 `{ ok: false, error }`，护栏由 TASK-27 已处理。
- `server/agents/tools/getRecentTrades.ts`（新建）：参数 `{ pair?, direction?, outcome?, limit?: number (max 20) }`。复用 `getTransactionsByUserId`，**必须 ctx.userId scoping**。返回压缩字段集（id、tradingPair、direction、outcome、riskRewardRatio、startTime、endTime、context）。
- `server/agents/tools/index.ts`（新建）：register-style 注册两者进 TASK-27 的 toolRegistry。
- `client/src/components/review-agent/AgentMessageList.tsx`：扩 message type — assistant 含 `toolCalls` 时渲染 "tool · {name} · {args 摘要}" 灰底单行；role="tool" 渲染单行 "↳ ok · {summary}" 或 "↳ failed · {error}"。沿 Bench Notebook（lowercase, tabular-nums, border-border, 无 shadow）。
- `useReviewStream` 扩 SSE 解析：新事件 `tool_call` / `tool_result` 推进一个 `toolBubbles` state；drawer 把它和 canonical messages 拼接显示。

## Out of scope

- web_search / web_fetch（拆 TASK-29）
- gemini schema 翻译（拆 TASK-30）
- 工具结果的"展开/折叠"详情面板（v0 只显示一行摘要，够用）
- Settings 增"启用/禁用 tool"开关（Phase 5 skill 时一起做）
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 server/agents/tools/getKlines.ts 实现 + Zod parameters 校验；复用 fetchCandleWindowAround；返回缩短精度 OHLCV
- [ ] #2 server/agents/tools/getRecentTrades.ts 实现；复用 getTransactionsByUserId；ctx.userId scoping 必须生效，limit 套上限 20
- [ ] #3 两个工具在 server/agents/tools/index.ts boot-time 注册进 toolRegistry；listTools() 返回包含两者的描述
- [ ] #4 AgentMessageList 渲染 assistant.toolCalls 为 'tool · {name} · {args 摘要}' 单行；role='tool' 渲染 '↳ ok · {summary}' 或 '↳ failed · {error}'；品牌一致
- [ ] #5 useReviewStream 解析 tool_call / tool_result 事件，推进 pending toolBubbles state，drawer 拼接到消息流中
- [ ] #6 烟测：agent 主动调 get_klines（1h ±50 around entryTime）并引用结果、主动调 get_recent_trades({pair, direction}) 读同向历史；两者皆在 drawer 出现气泡
- [ ] #7 为两个工具各加 1-2 个单测：parameters 校验、happy path、ctx 跨用户隔离
- [ ] #8 npm run check + npm run format + npm run test 全绿
<!-- AC:END -->
