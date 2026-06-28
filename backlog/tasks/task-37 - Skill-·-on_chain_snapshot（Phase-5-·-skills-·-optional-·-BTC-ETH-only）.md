---
id: TASK-37
title: Skill · on_chain_snapshot（Phase 5 · skills · optional · BTC/ETH only）
status: Done
assignee:
  - '@myself'
created_date: '2026-06-26 13:30'
updated_date: '2026-06-28 03:49'
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
- [x] #1 server/agents/skills/onChainSnapshot.ts 落地，注册 id = 'on_chain_snapshot'，category = 'network'
- [x] #2 pair gate：调用前先判 symbol，非 BTC*/ETH* 直接返 ok=false 中文提示，不发 fetch
- [x] #3 参数 zod schema：symbol / lookbackHours 24–168 / metrics 枚举（active_addresses / exchange_netflow / miner_revenue）默认取前两项
- [x] #4 调 Glassnode public endpoint，api key 走 getToolApiKey(userId, 'glassnode')；未配置 → ok=false
- [x] #5 输出按 metric 分组：每个 metric 包含 current / history / deltaPct；history 按 ts 升序
- [x] #6 测试覆盖：BTC happy path / ETH happy path / 非 BTC/ETH pair / Glassnode 401 / Glassnode 429 限流（5 条）
- [x] #7 npm run check + format + test 全绿；烟测（需配 Glassnode free key）：BTCUSDT review 问 'on chain' 能出 metrics；SOLUSDT trade 上该 skill 明确拒绝
<!-- AC:END -->



## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## 落地

`on_chain_snapshot` skill 上线，category `network`，**backend = Blockchain.com Charts**（keyless / 完全免费 / BTC-only）。两轮回头：
- **首轮**：Glassnode 方案，免费 tier 可用性不确定，未烟测
- **二轮**：CoinMetrics community，烟测踩 403——免费 tier 不给 `TxTfrValAdjUSD` / `RevAllUSD`，连 `AdrActCnt` 也只返单点无 history
- **三轮（当前）**：Blockchain.com Charts，curl 实测三个 endpoint 都返完整 history，BTC-only 但语义清晰

## 关键决策

- **Backend = Blockchain.com Charts**：`https://api.blockchain.info/charts/{chart}`，每 chart 独立 endpoint，per-metric fan-out（恢复 partial-ok）。
- **BTC-only**（task spec 是 BTC/ETH，ETH 显式降级——无好免费 ETH 链上源；ETH 付费 backend 留待用户真要时再做）
- Metric 重映射：
  - `active_addresses` → `n-unique-addresses`
  - `transfer_value_usd` → `estimated-transaction-volume-usd`
  - `miner_revenue` → `miners-revenue`
- Pair gate 两段：
  - `/^BTC(?:[/_-]?USD[TC]?|PERP)?$/i` → 接受
  - `/^ETH/i` → 显式 `仅支持 BTC...ETH 链上数据需付费 backend，暂未启用` 拒绝（让 model / 用户清楚为什么）
  - 其他 → 通用拒绝
- 客户端裁剪窗口：Blockchain.com `timespan` widens to native resolution（请 3 天可能返更多），按 `point.x < sinceSec` trim 确保 history 严格落在 lookback 窗口内
- 单 metric 失败 per-metric `ok=false, reason`，不让 sibling 跟着翻车
- 429 → `Blockchain.com 限流（429）：请稍后重试。`
- earliest=0 时 deltaPct 返 null，避免除零
- 走 global fetch（undici HTTPS_PROXY 已生效）；30s timeout 复用 tavily 模式

## 与 task spec 偏离点

| spec | 实现 | 原因 |
|---|---|---|
| `metrics: ["active_addresses", "exchange_netflow", "miner_revenue"]` | `["active_addresses", "transfer_value_usd", "miner_revenue"]` | Blockchain.com Charts 无 exchange-flow chart；transfer-volume 是最接近的免费替代 |
| BTC/ETH 都支持 | **BTC-only** | 无免费 ETH 链上 backend；ETH 显式拒绝并解释 |
| `getToolApiKey(userId, 'glassnode')` | 无 key | Blockchain.com Charts 不需要 key；secrets.ts 无改动 |
| AC #4 "Glassnode endpoint" | Blockchain.com endpoint | backend 换 |
| AC #6 "Glassnode 401 / 429" | Blockchain.com 404 / 500 / 429 | backend 换 |

## 文件

- `server/agents/skills/onChainSnapshot.ts` — skill 主体（~260 LOC，Blockchain.com 版本）
- `server/agents/skills/onChainSnapshot.test.ts` — 10 个 case：注册 / SOL gate / ETH explicit reject / BTCDOM-BTCB gate / BTC happy（含 sort + deltaPct）/ 窗口裁剪（21 天点 trim 到 ≤4）/ per-metric 429 / per-metric 404+500 / 窗口外空 / zod 边界
- `server/agents/skills/index.ts` — `+import "./onChainSnapshot";`
- `server/agents/secrets.ts` — 无改动（早先加的 glassnode 已撤回）

## 检查

- `npm run check` ✓
- `npm run format` ✓（已 `git checkout -- backlog/tasks/` 撤回 YAML 抖动）
- `npm run test` ✓ 351 passed（baseline 341 + 10 新增）
- `curl` 实测 Blockchain.com 三个 endpoint 都返完整数据点（不再瞎信文档）

## 烟测建议

**无需任何 key 配置**，重启 dev 即可：

1. `npm run dev`
2. **Case A（BTC pair）**：找一笔 BTCUSDT trade → 进 Review → 启用 skill → 问「show me on chain」/「最近链上数据怎样」
   - 验：三个 metric 都该出真数 + 真 history + 真 deltaPct
3. **Case B（ETH pair）**：找一笔 ETHUSDT trade → 同样问链上
   - 验：直接拒，文案明确提到 `ETH 链上数据需付费 backend`，零网络请求
4. **Case C（其他 pair）**：SOLUSDT → 通用拒绝文案
<!-- SECTION:FINAL_SUMMARY:END -->
