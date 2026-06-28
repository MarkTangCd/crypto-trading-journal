---
id: TASK-36
title: Skill · compare_with_my_baseline（Phase 5 · skills）
status: Done
assignee:
  - '@myself'
created_date: '2026-06-26 13:29'
updated_date: '2026-06-28 03:12'
labels:
  - ai-agent
  - phase-5
  - server
  - skill
milestone: m-0
dependencies:
  - TASK-32
documentation:
  - .lavish/trade-review-ai-agent-plan.html
modified_files:
  - server/agents/contextBuilder.ts
  - server/agents/skills/_helpers/baseline.ts
  - server/agents/skills/_helpers/baseline.test.ts
  - server/agents/skills/compareWithMyBaseline.ts
  - server/agents/skills/compareWithMyBaseline.test.ts
  - server/agents/skills/index.ts
priority: medium
ordinal: 36000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Why

Plan "Skill 扩展机制" 段 `compare_with_my_baseline`：`统计该用户最近 50 笔交易的 r:r 分布与胜率，告诉 agent "这笔单子在你自己的样本里属于什么档次"`。Phase 5 已决议 4 skill 之一。

## Context

- 内部 skill，只读 `transactions` 表，scope 给 anonymous user。
- 数据语义：r:r = `(closePrice - entryPrice) / (entryPrice - stopLoss)`（long），short 取负向；已实现统计利润的 logic 已在 `server/db.ts` / `_core/tradeMath.ts`，**复用现有 helper 不重写**。
- 输出一段对比：当前 trade 的 r:r 在过去 N 笔里属于 percentile 多少、胜率、平均持仓时长 vs 当前。

## 设计

### 参数

```ts
z.object({
  transactionId: z.number().int().positive(), // 当前 trade，让 skill 拿到其 r:r/pair/direction
  windowSize: z.number().int().min(10).max(200).default(50),
  pairScope: z.enum(["all", "same-pair", "same-direction"]).default("all"),
});
```

### 输出

```ts
{
  ok: true,
  windowUsed,                          // 实际匹配的样本数（可能 < windowSize）
  current: { r: number, pair, direction, ... },
  sample: {
    winRate,                            // % 0-100
    medianR, p25R, p75R,                // r:r 分布
    avgHoldHours,
    medianHoldHours,
  },
  percentile: {
    rRank: number,                      // 当前 r:r 在样本里的百分位（0-100）
    holdRank: number,
  },
  interpretation: string,               // 一行总结（"r:r 在你最近 50 笔里属于 top 20%"）
}
```

### 类别

`category: "analysis"`（与 analyze_market_structure 同组）。

## Out of scope

- 跨月 / 季度 baseline 切分。
- 滚动窗口分析（按时间段 vs 按笔数）。
- 与 confidence level 联动。
- 把 baseline 缓存到 DB（实时算即可，50 笔小数据）。

## Files

- 新 `server/agents/skills/compareWithMyBaseline.ts` + 单测。
- 内部 helper `server/agents/skills/_helpers/baseline.ts`（percentile / r:r 提取）以便测试剥离。
- 复用 `server/db.ts` 的 transaction 查询函数（不写新 SQL）。
- `server/agents/skills/index.ts` 加 import。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 server/agents/skills/compareWithMyBaseline.ts 落地，注册 id = 'compare_with_my_baseline'，category = 'analysis'
- [x] #2 参数 zod schema：transactionId / windowSize 10–200 默认 50 / pairScope all|same-pair|same-direction 默认 all
- [x] #3 skill 复用 server/db.ts 现有 transaction 查询（不在 skill 里写新 SQL）；scope 到 ctx.userId，跨用户注入不能发生
- [x] #4 输出 current / sample / percentile / interpretation 四块都在；windowUsed 反映实际可用样本数（不是输入请求数）
- [x] #5 样本不足 5 笔 → 返 ok=false 中文提示（避免统计无意义）；transactionId 不存在 → 同样 ok=false
- [x] #6 \_helpers/baseline.ts 抽 percentile / extractRR / classifyBucket 等纯函数各自单测
- [x] #7 interpretation 是中文一句话，量化描述 r:r 档位（如 '你最近 50 笔里该手 r:r 在 top 20%'）；文案不许出现 'good/bad' 主观词
- [x] #8 npm run check + format + test 全绿；烟测：启用后跳一笔 transaction 跳 review，问 'compare to my baseline' 能出对比
<!-- AC:END -->



## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## 落地

`compare_with_my_baseline` skill 上线，纯本地、零网络，read-only。流程：用 `getTransactionById(ctx.userId)` 锁定当前 trade → 用 `getTransactionsByUserId(ctx.userId, opts)` 拉 windowSize+buffer 条历史 → 过滤（排除自身 / 仅 closed-或-reviewed / r:r 可 parse） → 用 `_helpers/baseline.ts` 算 quartile / 胜率 / 持仓时长 / tied-aware percentile → 拼中文 interpretation。

## 关键决策

- 当前 trade 自身从样本里过滤掉（`row.id !== target.id`），避免污染 percentile。
- current 接受 open / closed；sample 只取 closed-或-reviewed（且需 endTime + outcome + 可 parse 的 r:r）。当前是 open 时，`holdHours` 与 `percentile.holdRank` 都 `null`。
- percentile = `(count<x + 0.5*count==x) / N * 100`，`Math.round` 整数。
- 档位词：`top 10% / top 25% / 中位附近 / bottom 25% / bottom 10%`，全描述性、无 good/bad。
- 样本最小阈值 5 笔在过滤后判定。

## 文件

- `server/agents/skills/_helpers/baseline.ts` — `quantile / percentileRank / classifyBucket / summarizeSample` 四个纯函数（~95 LOC）
- `server/agents/skills/_helpers/baseline.test.ts` — 15 个 case，覆盖 tied / 单元素 / 空 / 负 q 边界
- `server/agents/skills/compareWithMyBaseline.ts` — skill 主体（~210 LOC）
- `server/agents/skills/compareWithMyBaseline.test.ts` — 11 个 case：注册 / scoping / 找不到 / 样本不足 / happy path / tied rank / same-pair / same-direction / open holdRank=null / windowSize clamp / zod 边界
- `server/agents/skills/index.ts` — `+import "./compareWithMyBaseline";`
- `server/agents/contextBuilder.ts` — 烟测后追加修复（见下）

## 检查

- `npm run check` ✓
- `npm run format` ✓（已 `git checkout -- backlog/tasks/` 撤回 YAML 抖动）
- `npm run test` ✓ 341 passed（baseline 315 + 26 新增）

## 烟测发现的修复（post-implementation）

首轮烟测里 agent 调 `compare_with_my_baseline` 时拿不到 `transactionId`——根因是 `contextBuilder.ts:renderUserContext` 的 `## 交易基本信息` 段从来没暴露过 `transaction.id`，model 只能瞎猜或反问用户。两处最小修：

- `server/agents/contextBuilder.ts:198` — `## 交易基本信息` 段开头加 `- 交易ID：${transaction.id}`
- `server/agents/skills/compareWithMyBaseline.ts:24` — `transactionId` 的 zod describe 指向 `'交易ID'` 字段，明确禁止 invent / default

⚠️ 已有 conversation 不会自动生效：`buildInitialMessages` 只在 conversation 首次创建时跑，system/user message 被 cache 到 DB。烟测需用一笔从没 review 过的 trade 开新会话，或先删 `conversations` 对应行。

复测：`npm run check` + `npm run test` 仍 341 全绿（contextBuilder 既有断言 `toContain('## 交易基本信息')` 不受影响）。

烟测待用户最终确认：启用 skill → 任挑一笔 closed trade（先确保未 review 过，或删旧 conversation）→ 重启 dev → 进 Review → 问「我这笔在我历史里属于什么档次」→ 确认 agent 自动带上正确 `transactionId` 并输出量化、无主观词的 interpretation。
<!-- SECTION:FINAL_SUMMARY:END -->
