---
id: TASK-35
title: Skill · fetch_funding_rates（Phase 5 · skills）
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
  - .lavish/coinank-kline-plan.html
priority: medium
ordinal: 35000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

## Why

Plan "Skill 扩展机制" 段 `fetch_funding_rates`：`拉 coinank funding rates，对照进出场时段，判断是否在极端 funding 时段做反向`。Phase 5 已决议 4 skill 之一。

## Context

- 项目已有 coinank K 线集成（参 `.lavish/coinank-kline-plan.html` + `server/...` 现有 helper）。优先复用同一 base URL / auth / fetch helper，**不重写 transport**。
- 若 coinank funding endpoint 与 K 线 endpoint 不同 host / 不同 auth，按 web_search 的 backend 模式抽 `fundingBackends/coinank.ts`（保留切换余地）；如果同源直接调，**不**强制 adapter 化。
- 输出对模型友好：funding rate 历史 + 当前值 + 极端时段标签（如 |rate| > 0.05% 视为极端，可调）。

## 设计

### 参数

```ts
z.object({
  symbol: z.string(),
  // 取值时段：默认拉最近 7 天 1h 颗粒度
  lookbackHours: z.number().int().min(24).max(720).default(168),
});
```

### 输出

```ts
{
  ok: true,
  symbol,
  unit: "percent",                 // rate × 100
  current: { rate, ts },
  extremes: [{ ts, rate, side: "long-heavy" | "short-heavy" }, ...],  // |rate| > 阈值
  history: [{ ts, rate }, ...],    // 按时间升序，limit 168
  threshold: 0.05                  // % 极端定义
}
```

### 极端阈值

- 默认 0.05%（约等于 BTC/ETH 永续常态的 3-5×）。
- 不参数化（v0 不做用户可调）；模型只用 extremes 数组判断是否在极端时段。

### 类别

`category: "network"`（与 web_search 同组）。

## Out of scope

- 多 symbol 同时拉取。
- predicted next funding。
- 与 trade 入场时间精确对齐的"哪根 funding 距离最近"的高级匹配——模型自己用 ts 对照。
- 在 Settings 里配 funding source（v0 写死 coinank）。

## Files

- 新 `server/agents/skills/fetchFundingRates.ts` + 单测。
- 若需 adapter：`server/agents/skills/fundingBackends/{types,coinank}.ts`，否则就内联。
- 若 coinank funding 需要 api key：复用 `secrets.ts` 的 `getToolApiKey(userId, "coinank")` 模式（若 K 线 helper 已有则共用）。
- `server/agents/skills/index.ts` 加 import。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 server/agents/skills/fetchFundingRates.ts 落地，注册 id = 'fetch_funding_rates'，category = 'network'
- [ ] #2 参数 zod schema：symbol 必填、lookbackHours 24–720 默认 168
- [ ] #3 复用现有 coinank fetch helper / auth（如有）；不复用也要抽到 fundingBackends/coinank.ts 作为 SearchBackend 同型 adapter
- [ ] #4 输出 unit=percent（rate × 100）；current / extremes / history 三块都需；extremes 阈值 0.05% 写死在输出中 threshold 字段
- [ ] #5 测试覆盖：happy path / coinank 错误 / 空数据 / extremes 识别边界（4 条）
- [ ] #6 错误路径返 ok=false + 中文 error（与 web_search/web_fetch 一致风格）
- [ ] #7 npm run check + format + test 全绿；烟测：BTCUSDT 7 天 funding history 可拉、extremes 能出现在中间 8 月15 日极端点（以实际数据为准）
<!-- AC:END -->
