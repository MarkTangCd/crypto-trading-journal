---
id: TASK-36
title: Skill · compare_with_my_baseline（Phase 5 · skills）
status: To Do
assignee: []
created_date: "2026-06-26 13:29"
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

- [ ] #1 server/agents/skills/compareWithMyBaseline.ts 落地，注册 id = 'compare_with_my_baseline'，category = 'analysis'
- [ ] #2 参数 zod schema：transactionId / windowSize 10–200 默认 50 / pairScope all|same-pair|same-direction 默认 all
- [ ] #3 skill 复用 server/db.ts 现有 transaction 查询（不在 skill 里写新 SQL）；scope 到 ctx.userId，跨用户注入不能发生
- [ ] #4 输出 current / sample / percentile / interpretation 四块都在；windowUsed 反映实际可用样本数（不是输入请求数）
- [ ] #5 样本不足 5 笔 → 返 ok=false 中文提示（避免统计无意义）；transactionId 不存在 → 同样 ok=false
- [ ] #6 \_helpers/baseline.ts 抽 percentile / extractRR / classifyBucket 等纯函数各自单测
- [ ] #7 interpretation 是中文一句话，量化描述 r:r 档位（如 '你最近 50 笔里该手 r:r 在 top 20%'）；文案不许出现 'good/bad' 主观词
- [ ] #8 npm run check + format + test 全绿；烟测：启用后跳一笔 transaction 跳 review，问 'compare to my baseline' 能出对比
<!-- AC:END -->
