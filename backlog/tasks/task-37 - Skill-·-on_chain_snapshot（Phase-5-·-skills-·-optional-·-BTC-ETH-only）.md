---
id: TASK-37
title: Skill · on_chain_snapshot（Phase 5 · skills · optional · BTC/ETH only）
status: To Do
assignee: []
created_date: "2026-06-26 13:30"
labels:
  - ai-agent
  - phase-5
  - server
  - skill
  - optional
milestone: m-0
dependencies:
  - TASK-32
documentation:
  - .lavish/trade-review-ai-agent-plan.html
priority: low
ordinal: 37000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

## Why

Plan "Skill 扩展机制" 段 `on_chain_snapshot`（标 optional）：`可选 skill，调用 glassnode / nansen 公开 endpoint，仅在 pair = BTC/ETH 且时段命中时启用`。Phase 5 已决议 4 skill 全做，但 plan 自己标了 optional + 仅 BTC/ETH——本任务尊重该约束、低优先级。

## Context

- 数据源候选：Glassnode public endpoints（需 api key，免费层有限）/ CoinMetrics community API（无需 key）/ Nansen（需 key 但限制多）。**v0 推荐 Glassnode**：免费层覆盖 BTC/ETH active addresses、exchange netflow 等基础指标，刚好满足本 skill 范围。
- skill 内做 pair gate：args.symbol 不是 BTC/ETH 衍生 → 直接返 `ok: false, error: "仅支持 BTC/ETH 交易对"`，**不消耗 api 请求**。
- 与 web_search 类似走 `getToolApiKey(userId, "glassnode")` 拿 key；未配置时 ok:false。

## 设计

### 参数

```ts
z.object({
  symbol: z.string(), // 仅 BTC* / ETH* 通过
  lookbackHours: z.number().int().min(24).max(168).default(72),
  metrics: z
    .array(z.enum(["active_addresses", "exchange_netflow", "miner_revenue"]))
    .default(["active_addresses", "exchange_netflow"]),
});
```

### 输出

```ts
{
  ok: true,
  asset: "BTC" | "ETH",
  windowHours,
  metrics: {
    [metricName]: { current, history: [{ ts, value }], deltaPct },
    ...
  }
}
```

### pair gate 规则

- 提 symbol 前缀：`BTCUSDT` / `BTC/USDT` / `BTCUSDC` 等 → asset = "BTC"。
- `ETHUSDT` 等 → asset = "ETH"。
- 其他全部返 ok:false。

### 类别

`category: "network"`。

## Out of scope

- Nansen / 其他 backend（v0 锁 Glassnode）。
- Token-level metrics（SOL / ARB 等）。
- 实时 socket 订阅 / streaming。
- 把 Glassnode key 加到 default Settings UI——TASK-33 通用机制覆盖即可。

## Files

- 新 `server/agents/skills/onChainSnapshot.ts` + 单测。
- `server/agents/skills/index.ts` 加 import。
- 复用 `secrets.ts` 的 key 读取；若 Glassnode 需新增 tool key 类型，配套 `secrets.ts` 接受 "glassnode" 作为合法 key id。

## 决策待定（实施时再敲）

- 是否需要 server-side 缓存（5 min TTL）避免 free-tier rate limit。v0 可直接调，hit 限就 ok:false 让模型放弃。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 server/agents/skills/onChainSnapshot.ts 落地，注册 id = 'on_chain_snapshot'，category = 'network'
- [ ] #2 pair gate：调用前先判 symbol，非 BTC*/ETH* 直接返 ok=false 中文提示，不发 fetch
- [ ] #3 参数 zod schema：symbol / lookbackHours 24–168 / metrics 枚举（active_addresses / exchange_netflow / miner_revenue）默认取前两项
- [ ] #4 调 Glassnode public endpoint，api key 走 getToolApiKey(userId, 'glassnode')；未配置 → ok=false
- [ ] #5 输出按 metric 分组：每个 metric 包含 current / history / deltaPct；history 按 ts 升序
- [ ] #6 测试覆盖：BTC happy path / ETH happy path / 非 BTC/ETH pair / Glassnode 401 / Glassnode 429 限流（5 条）
- [ ] #7 npm run check + format + test 全绿；烟测（需配 Glassnode free key）：BTCUSDT review 问 'on chain' 能出 metrics；SOLUSDT trade 上该 skill 明确拒绝
<!-- AC:END -->
