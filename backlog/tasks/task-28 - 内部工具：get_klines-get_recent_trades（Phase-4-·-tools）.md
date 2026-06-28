---
id: TASK-28
title: 内部工具：get_klines + get_recent_trades（Phase 4 · tools）
status: Done
assignee:
  - "@myself"
created_date: "2026-06-25 12:49"
updated_date: "2026-06-26 08:08"
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
modified_files:
  - server/agents/tools/getKlines.ts
  - server/agents/tools/getKlines.test.ts
  - server/agents/tools/getRecentTrades.ts
  - server/agents/tools/getRecentTrades.test.ts
  - server/agents/tools/index.ts
  - server/agents/reviewAgent.ts
  - client/src/components/review-agent/useReviewStream.ts
  - client/src/components/review-agent/ToolBubble.tsx
  - client/src/components/review-agent/AgentMessageList.tsx
  - client/src/components/review-agent/AgentDrawer.tsx
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

- [x] #1 server/agents/tools/getKlines.ts 实现 + Zod parameters 校验；复用 fetchCandleWindowAround；返回缩短精度 OHLCV
- [x] #2 server/agents/tools/getRecentTrades.ts 实现；复用 getTransactionsByUserId；ctx.userId scoping 必须生效，limit 套上限 20
- [x] #3 两个工具在 server/agents/tools/index.ts boot-time 注册进 toolRegistry；listTools() 返回包含两者的描述
- [x] #4 AgentMessageList 渲染 assistant.toolCalls 为 'tool · {name} · {args 摘要}' 单行；role='tool' 渲染 '↳ ok · {summary}' 或 '↳ failed · {error}'；品牌一致
- [x] #5 useReviewStream 解析 tool_call / tool_result 事件，推进 pending toolBubbles state，drawer 拼接到消息流中
- [ ] #6 烟测：agent 主动调 get_klines（1h ±50 around entryTime）并引用结果、主动调 get_recent_trades({pair, direction}) 读同向历史；两者皆在 drawer 出现气泡
- [x] #7 为两个工具各加 1-2 个单测：parameters 校验、happy path、ctx 跨用户隔离
- [x] #8 npm run check + npm run format + npm run test 全绿
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

## 实施顺序（TDD 优先）

### 服务端

1. **server/agents/tools/getKlines.ts**（新）
   - zod params：`tradingPair`(string)、`timeFrame`(enum 匹配 coinank INTERVAL_MAP 的 9 个值)、`anchorMs`(int 毫秒，description 强调单位)、`halfSize`(int 1-200, default 50)
   - 入口 `.toUpperCase()` 一次
   - 复用 `fetchCandleWindowAround`；OHLC 截到 4 位小数、volume 截到 2 位控 token
   - 返回 `{ tradingPair, timeFrame, entryIndex, before, after, candles[] }`
2. **server/agents/tools/getKlines.test.ts**：mock fetchCandleWindowAround → happy path（pair uppercase normalize + 默认 halfSize=50）+ zod 校验失败
3. **server/agents/tools/getRecentTrades.ts**（新）
   - zod params：`tradingPair?`、`direction?: long/short`、`outcome?: win/loss/breakeven`、`limit`(int 1-20, default 10)
   - **`ctx.userId` 必传**，缺则 throw
   - `tradingPair.toUpperCase()` 一次
   - 复用 `getTransactionsByUserId(ctx.userId, {...})`，`sortBy:"startTime"`+`sortOrder:"desc"`，`.slice(0, limit)`
   - 返回压缩字段：`{ id, tradingPair, direction, outcome, status, riskRewardRatio, returnAmount, startTime, endTime, context }`
4. **server/agents/tools/getRecentTrades.test.ts**：mock db → happy path + limit 上限 + 缺 ctx.userId 抛错（跨用户隔离用例）
5. **server/agents/tools/index.ts**（新）：`import "./getKlines"; import "./getRecentTrades";` 触发 boot-time register
6. **server/agents/reviewAgent.ts**：顶部 `import "./tools";`；扩 `ReviewMessage` 增 `toolCalls?: ToolCall[]` / `toolCallId?: string | null`；`toReviewMessage` 安全 parse `message.toolCalls` JSON、透传 `toolCallId`；不存 `name`（schema 没列；UI 用 toolCallId 关联）

### 客户端

7. **client/src/components/review-agent/useReviewStream.ts**
   - 扩 `StreamPending` 增 `toolBubbles: { id, name, argsSummary, status: "running"|"ok"|"failed", summary? }[]`
   - StreamEvent union 增 `tool_call` / `tool_result`
   - `tool_call` → append bubble (status=running)；`tool_result` → 同 id 改 status + summary
   - 初始 `toolBubbles: []`
8. **client/src/components/review-agent/ToolBubble.tsx**（新, ≤ 60 LOC）
   - 导出 `ToolCallLine` (props: name, argsSummary, status?) 和 `ToolResultLine` (props: ok, summary)
   - 单行；lowercase、text-xs、text-muted-foreground、tabular-nums、无圆角无阴影
9. **client/src/components/review-agent/AgentMessageList.tsx**
   - 镜像扩 `ReviewMessage`
   - assistant 行有 `toolCalls` → 渲染每条 `ToolCallLine`（args 截 200 字符）+ 可选 text
   - role="tool" 行 → JSON top-level `error` key 唯一 → failed；否则 ok → `ToolResultLine`（content 截 200）
   - 改 props：`pending: StreamPending | null`；在 canonical 之后渲染 pending user + bubbles + assistantText（替代 AgentDrawer 的 withPending）
10. **client/src/components/review-agent/AgentDrawer.tsx**
    - 删除 `withPending`，直接 `<AgentMessageList messages={canonical} pending={stream.pending} isWaiting={isWaiting} />`

### 收尾

11. `npm run format` → `npm run check` → `npm run test`（目标 207 + 5～7 新增）
12. 浏览器烟测（AC #6）：deepseek key + 开 trade + 问 get_klines 1h ±50 around entryTime + 问 get_recent_trades({pair, direction})
13. AC #1-#8 逐条勾、写 final summary、状态翻 Done；**不主动 git commit**，diff summary 给用户审

## 关键风险点

- get_recent_trades 必须 `ctx.userId` scoping（单测专门盖）
- anchorMs 是毫秒（schema description 强调）
- tradingPair uppercase normalize
- 工具不要 try/catch 吞错（runTools 已包装）
- K 线截位 + halfSize 默认 50 控 token
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

## Summary

Phase 4 第一刀真实工具落地：`get_klines` / `get_recent_trades` 接进 TASK-27 的 toolRegistry，并把 SSE 的 `tool_call` / `tool_result` 事件接进 AgentDrawer 显示气泡。第一次端到端能在浏览器里看到 agent 主动调工具。

## 改动文件

### Server

- `server/agents/tools/getKlines.ts`（新）：zod 校验 `tradingPair / timeFrame / anchorMs (毫秒) / halfSize (1-200, default 50)`；入口 `.toUpperCase()`；复用 `fetchCandleWindowAround`；OHLC 截到 4 位小数、volume 截到 2 位控 token。
- `server/agents/tools/getRecentTrades.ts`（新）：zod 校验 `tradingPair? / direction? / outcome? / limit (1-20, default 10)`；**强制 ctx.userId**（缺则 throw，是跨用户隔离的唯一护栏）；按 `startTime desc` 拉，返压缩字段集。
- `server/agents/tools/index.ts`（新）：boot-time barrel，side-effect import 触发两者 register。
- `server/agents/reviewAgent.ts`：
  - 顶部 `import "./tools"` 触发 boot-time 注册。
  - `ReviewMessage` 扩 `toolCalls?: ToolCall[]` / `toolCallId?: string`，`toReviewMessage` 安全 parse 存储的 toolCalls JSON。
  - **关键修复**：`toChatHistory` 现在会从 stored 行恢复 `toolCalls` / `toolCallId` / `name`（按 toolCallId 反查同列表里 prior assistant.toolCalls.id → name）。否则用户发第二轮时，DB 历史的 tool message 失去关联，openai-compatible body 会被上游 reject。

### Client

- `client/src/components/review-agent/useReviewStream.ts`：StreamPending 扩 `toolBubbles[]`；新增 `tool_call` / `tool_result` 事件解析（推进 status: running → ok/failed）。
- `client/src/components/review-agent/ToolBubble.tsx`（新, 53 LOC）：`ToolCallLine` + `ToolResultLine`，单行；font-mono、text-xs、text-muted-foreground、tabular-nums、lowercase；failed 用 `text-destructive`（== loss 色，one-signal rule 兼容）。
- `client/src/components/review-agent/AgentMessageList.tsx`：扩 `ReviewMessage`；assistant.toolCalls → ToolCallLine（args 截 200）；role=tool → ToolResultLine（JSON top-level 仅 `error` key 判 failed，content 截 200）；新增 `pending: StreamPending | null` prop，pending user + bubbles + assistantText 在 canonical 之后渲染。
- `client/src/components/review-agent/AgentDrawer.tsx`：删 `withPending` helper，直接 `<AgentMessageList messages={canonical} pending={stream.pending} ... />`。

## 测试覆盖（219 总，207 + 12 新增）

- `server/agents/tools/getKlines.test.ts`（6）：register / uppercase pair + 默认 halfSize / 未知 timeFrame 拒绝 / anchorMs <= 0 拒绝 / 自定义 halfSize / halfSize > 200 拒绝。
- `server/agents/tools/getRecentTrades.test.ts`（6）：register / 跨用户 scoping（ctx.userId=42 + 大写 pair forward）/ limit clamp 5 of 15 / limit > 20 拒绝 / **缺 ctx.userId 抛错** / 缺省 filters 不污染 query。

## 既有路径回归校验

- `npm run check`：零错误。
- `npm run format`：仅一处测试空白整理。
- `npm run test`：219/219 全绿（207 baseline + 12 new）。重点确认 `reviewAgent.stream.test.ts` / `reviewAgent.router.test.ts` / `streamRoute.integration.test.ts` 全绿 —— `toChatHistory` 变更没有引入回归。

## 关键设计决策

1. **boot-time register via side-effect import** —— `server/agents/tools/index.ts` 是 barrel，仅做 `import "./getKlines"; import "./getRecentTrades";`。`reviewAgent.ts` 顶部 `import "./tools"` 是产线唯一触发点，所以 router / SSE handler 一旦加载，工具就已经在 registry 里。
2. **toChatHistory 反查 name** —— `messages` 表没有 `name` 列（TASK-27 schema），但 openai-compatible tool message body 期望 `name` 字段。toChatHistory 先扫一遍 rows 建 `idToName` map，再为每个 tool row 注入 `name = idToName[toolCallId]`，无需改 schema。
3. **failed 用 text-destructive 而非 text-loss** —— `text-loss` 不在 `@theme inline` 里（DESIGN.md "One-Signal Rule" 故意把 win/loss 限定在 trade 语义），但 `--destructive: var(--loss)` 在 theme 里，意义对（工具失败 == 系统故障）。
4. **pending 状态不混进 canonical 列表** —— AgentMessageList 直接接 `pending: StreamPending | null` prop，stream 中实时状态（status: running 闪烁）独立于 DB 历史；流结束后 pending 清空、canonical refetch 接管。
5. **per-tool failure 判定靠 JSON shape** —— role=tool 的 content 永远是 JSON。runTools 失败路径写 `{error: "..."}`（唯一一个 key），成功路径写工具返回值（我们的工具不会以 `{error}` 包裹）。这套 heuristic 足以在 UI 上区分 ok / failed，无需额外的 schema 列。

## Out of scope（按 task 描述）

- web_search / web_fetch：TASK-29。
- gemini FunctionDeclaration 翻译：TASK-30。
- 工具结果"展开/折叠"详情面板：v0 单行摘要够用。
- Settings 增"启用/禁用 tool" 开关：Phase 5。

## 烟测（AC #6）

未由 Claude 跑 —— 没有 deepseek api key 凭据，也没法在 headless 环境里真访问 coinank。建议你打开 `npm run dev`：

1. Settings 配 deepseek key；
2. 打开一笔 trade 的 drawer；
3. 问 "用 get_klines 拉 BTCUSDT 1H ±50 around entryTime 看看"；
4. 再问 "拿 get_recent_trades 看下我 BTCUSDT 多单历史"；
5. 验 drawer 是否冒出 `tool · get_klines · {args}` 单行 + `↳ ok · {summary}` 单行。
<!-- SECTION:FINAL_SUMMARY:END -->
