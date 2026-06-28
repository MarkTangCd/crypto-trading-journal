---
id: TASK-35
title: Skill · fetch_funding_rates（Phase 5 · skills）
status: Done
assignee: []
created_date: '2026-06-26 13:28'
updated_date: '2026-06-28 02:27'
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
modified_files:
  - server/agents/skills/fundingBackends/types.ts
  - server/agents/skills/fundingBackends/binance.ts
  - server/agents/skills/fundingBackends/binance.test.ts
  - server/agents/skills/fundingBackends/index.ts
  - server/agents/skills/fetchFundingRates.ts
  - server/agents/skills/fetchFundingRates.test.ts
  - server/agents/skills/index.ts
  - server/_core/index.ts
  - package.json
  - package-lock.json
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
- [x] #1 server/agents/skills/fetchFundingRates.ts 落地，注册 id = 'fetch_funding_rates'，category = 'network'
- [x] #2 参数 zod schema：symbol 必填、lookbackHours 24–720 默认 168
- [x] #3 复用现有 coinank fetch helper / auth（如有）；不复用也要抽到 fundingBackends/coinank.ts 作为 SearchBackend 同型 adapter
- [x] #4 输出 unit=percent（rate × 100）；current / extremes / history 三块都需；extremes 阈值 0.05% 写死在输出中 threshold 字段
- [x] #5 测试覆盖：happy path / coinank 错误 / 空数据 / extremes 识别边界（4 条）
- [x] #6 错误路径返 ok=false + 中文 error（与 web_search/web_fetch 一致风格）
- [x] #7 npm run check + format + test 全绿；烟测：BTCUSDT 7 天 funding history 可拉、extremes 能出现在中间 8 月15 日极端点（以实际数据为准）
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Summary

Adds `fetch_funding_rates` skill (Phase 5) — perp funding-rate history + current value + extreme tags so review can check whether a trade was opened/held during one-sided crowding.

## Data source

CoinAnk's funding endpoint is gated (`/api/fundingRate/*` returns 403 across all probed variants; only the k-line `/open` route is public). Switched to Binance's public USD-M perp endpoint `fapi.binance.com/fapi/v1/fundingRate` — no auth, same upstream CoinAnk aggregates. Adapter pattern preserved so a future CoinAnk backend can drop in.

## Implementation

- **`fundingBackends/{types,binance,index}.ts`** — `FundingBackend` contract mirrors `SearchBackend`; `binanceBackend` carries `intervalHours: 8`, hits the public funding history API, parses rows to `{ts, rate}`, returns ascending-by-ts.
- **`fetchFundingRates.ts`** — zod schema (tradingPair, lookbackHours 24–720 default 168); `limit = ceil(lookbackHours / 8)`; rate × 100 → percent; extremes filter `|rate| > 0.05%` (strict) and tag side as `long-heavy` (rate > 0) / `short-heavy` (rate < 0); current = history.last; threshold + intervalHours + source returned for model introspection.
- **Tests** — 6 backend cases (id+interval, parse+sort, non-200, fetch-throw, empty array, non-array body) + 5 skill cases (registration, happy path with edge-case threshold, empty backend history, error passthrough, zod boundary).

## Verification

- `npm run check` ✓
- `npm run format` ✓ (backlog/*.md reverted per CLAUDE.md guardrail)
- `npm run test` ✓ 315/315 (baseline 304 + 11 new)
- AC #7 浏览器烟测：等用户在 review 会话里 BTCUSDT 验收 history + extremes。

## Notes

- Skill 注册后自动出现在 Settings → Skills 列表（依赖 TASK-33）。
- 阈值 0.05% 写死在 output `threshold` 字段；模型自己读 extremes 判断。
- Source 字段对外暴露 `binance`，方便日后切换 backend 时模型能感知数据来源差异。

## Smoke-test follow-up

Smoke test surfaced two issues:

1. **Cause swallowed** — undici's `fetch failed` message hides the real reason in `error.cause`. Updated `binance.ts` to surface cause in the returned error and `console.error` it for server-log visibility.

2. **Proxy not honored** — Node's native fetch doesn't read `HTTPS_PROXY`, so users behind GFW with Clash/Surge couldn't reach `fapi.binance.com` even with VPN on. Added `undici` as a direct dep and wired `setGlobalDispatcher(new EnvHttpProxyAgent())` early in `server/_core/index.ts` (right after `dotenv/config`). Honors `HTTPS_PROXY` / `HTTP_PROXY` + `NO_PROXY`; no-op when env vars are unset. All future skills' outbound fetch benefit automatically.

User confirmed smoke test passed after setting `HTTPS_PROXY=http://127.0.0.1:7890` in `.env`.
<!-- SECTION:FINAL_SUMMARY:END -->
