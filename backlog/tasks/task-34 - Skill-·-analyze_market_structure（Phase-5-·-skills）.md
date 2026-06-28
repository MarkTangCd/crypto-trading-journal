---
id: TASK-34
title: Skill · analyze_market_structure（Phase 5 · skills）
status: Done
assignee:
  - '@myself'
created_date: '2026-06-26 13:28'
updated_date: '2026-06-28 01:42'
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
  - server/agents/skills/_helpers/marketStructure.ts
  - server/agents/skills/_helpers/marketStructure.test.ts
  - server/agents/skills/analyzeMarketStructure.ts
  - server/agents/skills/analyzeMarketStructure.test.ts
  - server/agents/skills/index.ts
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
- [x] #1 server/agents/skills/analyzeMarketStructure.ts 落地，注册 id = 'analyze_market_structure'，category = 'analysis'
- [x] #2 参数 zod schema 覆盖 symbol / interval / lookback / anchorMs；interval enum 与 get_klines 一致；lookback 30–500
- [x] #3 调内部 helper 从 K 线提 swing、输出 recentTrend、supportZones、resistanceZones 三部分，格式与 Why 段描述一致
- [x] #4 swing detection 用 N=2 fractal；测试覆盖清晰上升片段 / 下降片段 / 震荡片段三个场景
- [x] #5 S/R 聚类：价格距离 ≤ 0.3% 视同一带，top-5；测试该逻辑
- [x] #6 \_helpers/marketStructure.ts 抽出纯数值函数（fractal / clusterPrices / classifyTrend），各自单测
- [x] #7 K 线不足 30 根 → 返 ok=false；权限/get_klines 出错 → 透传 ok=false 中文 error
- [x] #8 npm run check + format + test 全绿；烟测：启用后试 BTCUSDT 1h 是否返出可判读的 swings + S/R
<!-- AC:END -->



## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Summary

Adds `analyze_market_structure` skill (Phase 5) — pure-algorithm structural analysis over a CoinAnk candle window so the review agent can speak in structured terms (HH/HL, S/R zones) instead of vague phrases.

## Implementation

- **`_helpers/marketStructure.ts`** — 4 pure functions, each unit-tested:
  - `computeATR(candles, period=14)` — SMA-based ATR; returns 0 when insufficient.
  - `detectFractals(candles, n=2)` — strict-inequality fractal swings.
  - `clusterPrices(prices, thresholdPct=0.003)` — single-pass agglomerative clustering by relative distance; sorted by hits desc.
  - `classifyTrend(swings, recentCandles, atr, atrMult=0.5)` — range floor (spread < 0.5 × ATR) then HH+HL / LH+LL pattern check.
- **`analyzeMarketStructure.ts`** — zod schema (tradingPair, timeFrame ∈ TIME_FRAMES, lookback 30–500 default 150, anchorMs optional → `Date.now()`); calls `fetchCandleWindowAround` with `halfSize = ceil(lookback/2)`; fetch error → ok=false 中文 error；candles < 30 → ok=false 中文 error；otherwise trims to `lookback`, runs helpers, splits S/R by `< lastClose` vs `> lastClose`, top-5 per side, swings capped to 20.
- **Tests** — 11 helper cases + 8 skill cases (registration, ok=false fallbacks, synthetic uptrend / downtrend / range, enum + lookback guards).

## Verification

- `npm run check` ✓
- `npm run format` ✓ (backlog/*.md reverted per CLAUDE.md guardrail)
- `npm run test` ✓ 304/304 (baseline 285 + 19 new)
- AC #8 浏览器烟测：由用户在 review 会话中以 BTCUSDT 1H 验收。

## Notes

- Skill 注册后自动出现在 Settings → Skills 列表（依赖 TASK-33 已落地的 `listSkills` query）。
- 不引入新 fetch 路径；复用 `fetchCandleWindowAround`（已 30s timeout + retry-once，TASK-38）。
<!-- SECTION:FINAL_SUMMARY:END -->
