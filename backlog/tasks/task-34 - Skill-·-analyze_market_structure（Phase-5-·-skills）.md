---
id: TASK-34
title: Skill · analyze_market_structure（Phase 5 · skills）
status: To Do
assignee: []
created_date: "2026-06-26 13:28"
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
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

## Why

Plan "Skill 扩展机制" 段 `analyze_market_structure`：`输入一段 K 线，输出 swing high/low、趋势段、支撑阻力，让 agent 用结构化语言代替"我觉得是个突破"`。这是 Phase 5 已决议的 4 个 future skill 之一，纯算法不联外网。

## Context

- 复用 `get_klines` skill（已 TASK-28 上线）拿 K 线数据——agent 自己先拉 K 线再调本 skill，或本 skill 内部调 get_klines helper 拿数据。**倾向后者**：让模型一步出结构，少 round-trip。
- 输出对模型友好的紧凑结构（swing 列表、最近趋势段方向、S/R 候选价位），便于在 review 里用结构化语言而不是模糊形容。

## 设计

### 参数

```ts
z.object({
  symbol: z.string(),
  interval: z.enum(["5m", "15m", "1h", "4h", "1d"]),
  lookback: z.number().int().min(30).max(500).default(150),
  // optional: anchor in case of historical replay
  anchorMs: z.number().int().optional(),
});
```

### 算法（v0 简洁版）

1. **swing detection**：fractal 法（每根 K 与前后 N 根比较；N=2 给中等灵敏度）。
2. **trend segments**：连接 swing high/low，比较斜率方向判断 up / down / range。range 阈值：N 根内最高最低差 < 0.5 × ATR(14)。
3. **S/R 候选**：把最近 20 个 swing 价位聚类（k-means 或简单价格距离阈值，merge within 0.3% 视为同一带），输出 top-K（K=5）按出现次数排序。
4. **形态注释**：只标"最近一段 = up/down/range"，不预测；不要"突破"/"反弹"等结论性词汇。

### 输出

```ts
{
  ok: true,
  symbol, interval, lookbackUsed,
  recentTrend: "up" | "down" | "range",
  swings: [{ ts, price, kind: "high"|"low" }, ...],   // 限 20 个
  supportZones: [{ price, hits }, ...],               // 限 5 个
  resistanceZones: [{ price, hits }, ...]
}
```

### 类别

`category: "analysis"`（与 internal/network 区分，后续 UI 分组用）。

## Out of scope

- 多周期联动 / HTF confirm。
- 通道、扇形、谐波等复杂形态。
- 与 fetch_funding_rates 联动判趋势——分别独立。

## Files

- 新 `server/agents/skills/analyzeMarketStructure.ts` + 单测 `analyzeMarketStructure.test.ts`。
- 算法 helper 可放 `server/agents/skills/_helpers/marketStructure.ts`（fractal / cluster）以便单测剥离。
- `server/agents/skills/index.ts` 加 import 触发 register。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 server/agents/skills/analyzeMarketStructure.ts 落地，注册 id = 'analyze_market_structure'，category = 'analysis'
- [ ] #2 参数 zod schema 覆盖 symbol / interval / lookback / anchorMs；interval enum 与 get_klines 一致；lookback 30–500
- [ ] #3 调内部 helper 从 K 线提 swing、输出 recentTrend、supportZones、resistanceZones 三部分，格式与 Why 段描述一致
- [ ] #4 swing detection 用 N=2 fractal；测试覆盖清晰上升片段 / 下降片段 / 震荡片段三个场景
- [ ] #5 S/R 聚类：价格距离 ≤ 0.3% 视同一带，top-5；测试该逻辑
- [ ] #6 \_helpers/marketStructure.ts 抽出纯数值函数（fractal / clusterPrices / classifyTrend），各自单测
- [ ] #7 K 线不足 30 根 → 返 ok=false；权限/get_klines 出错 → 透传 ok=false 中文 error
- [ ] #8 npm run check + format + test 全绿；烟测：启用后试 BTCUSDT 1h 是否返出可判读的 swings + S/R
<!-- AC:END -->
