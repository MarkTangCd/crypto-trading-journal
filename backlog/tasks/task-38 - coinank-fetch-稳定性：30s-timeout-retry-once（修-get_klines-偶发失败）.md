---
id: TASK-38
title: coinank fetch 稳定性：30s timeout + retry-once（修 get_klines 偶发失败）
status: Done
assignee:
  - '@myself'
created_date: '2026-06-26 14:24'
updated_date: '2026-06-26 14:26'
labels:
  - server
  - reliability
  - ai-agent
dependencies: []
modified_files:
  - server/_core/coinank.ts
  - server/_core/coinank.test.ts
priority: medium
ordinal: 38000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Why

TASK-32 烟测时发现 `get_klines` 调用经常返回 `Failed to reach market data provider`。诊断：

- `server/_core/coinank.ts:95` 用 Node 原生 fetch（undici 底层），默认 connect timeout 10s。
- 6 次串行 cold call 实测：5 次 OK（297-3417 ms），1 次 OK 但花 **52 823 ms**；之前 agent 跑那次 fetch 直接 10s 超时（`Connect Timeout Error attempted addresses: 139.177.246.196/197:443, timeout: 10000ms`）。
- curl 同 URL 不卡，因为 curl 默认不带 connect timeout 上限。
- 跟 TASK-32 完全无关，自 TASK-26 接入 coinank 时就埋着，但症状被 TASK-32 烟测放大。

## 设计

不引 undici 显式包（CLAUDE.md "Simplicity First"）。两点改动：

1. 用 `AbortSignal.timeout(REQUEST_TIMEOUT_MS)` 替默认 connect-only 10s，给端到端 30 s 余量覆盖 coinank 偶发慢节点。
2. 加 **retry-once**：fetch 抛错时 1 s 退避后重试一遍；两次都失败再 throw `BAD_GATEWAY`。retry 内部失败要把 `err.cause` 也 console.error 出来（当前只打 err，丢了 undici 的真实底层原因）。

## Out of scope

- 引 undici 包做 Agent 级别的 keepAlive / IPv4 / dispatcher。如果 30s + retry 不够稳再升级。
- 给 `web_fetch` / `web_search` 加同款 retry。它们已有自己的 timeout / fail-soft 路径，不要捎带改。

## 烟测

- 起 dev，跑 agent 调 get_klines，观察 dev log 里 `[CoinAnk] fetch failed (cause: ...)` —— 应该有 retry 行 + 大多数情况下第二次成功。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 fetchCandles 用 AbortSignal.timeout(30_000) 控总耗时，失败 catch 里 1 s 退避后 retry once；两次都失败才 throw TRPCError BAD_GATEWAY
- [x] #2 retry catch 把 err.cause（如有）也 console.error 出来，方便后续诊断
- [x] #3 现有 coinank 测试不变；新增 1-2 条单测覆盖『第一次抛错+第二次成功』与『两次都失败』分支
- [x] #4 npm run check + format + test 全绿；浏览器/SSE 烟测：触发 get_klines，确认 dev log 里看不到 10 000 ms timeout，最长不超过 30 000 ms
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## 改动

- `server/_core/coinank.ts`：抽出 `fetchWithRetry(url)`，给 fetch 套 `AbortSignal.timeout(REQUEST_TIMEOUT_MS = 30_000)` 替默认 connect-only 10s；第一次 catch 里 1 s 退避后 retry once，两次都失败再 throw `BAD_GATEWAY`。`console.warn`/`console.error` 把 `err.cause` 也打出来。
- `server/_core/coinank.test.ts`：新建。2 条用例：『第一次抛错+第二次返 success』走通；『两次都抛错』→ `TRPCError BAD_GATEWAY`。

## 验证

- `npm run check / format / test` 全绿 → 274 tests（+2）。
- SSE 烟测：复跑 conv 2 → get_klines 直接 `ok:true` 返 60 根 K 线（before:30 / after:30 / entryIndex:30）。dev log 无 retry 命中 —— 30 s timeout 单凭其本身就足以覆盖之前 10 s 卡死的 cold path。

## 跟 TASK-32 关系

完全独立。TASK-32 烟测顺手暴露了这个埋藏问题，本任务在 TASK-32 落地分支上接着做。建议两个一起合或者按时间序合，不要相互依赖。
<!-- SECTION:FINAL_SUMMARY:END -->
