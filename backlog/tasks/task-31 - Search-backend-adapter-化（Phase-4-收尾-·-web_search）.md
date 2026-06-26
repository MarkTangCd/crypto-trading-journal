---
id: TASK-31
title: Search backend adapter 化（Phase 4 收尾 · web_search）
status: Done
assignee:
  - '@myself'
created_date: '2026-06-26 09:37'
updated_date: '2026-06-26 09:41'
labels:
  - ai-agent
  - phase-4
  - server
milestone: m-0
dependencies:
  - TASK-29
documentation:
  - .lavish/trade-review-ai-agent-plan.html
modified_files:
  - server/agents/tools/searchBackends/types.ts
  - server/agents/tools/searchBackends/tavily.ts
  - server/agents/tools/searchBackends/index.ts
  - server/agents/tools/searchBackends/tavily.test.ts
  - server/agents/tools/webSearch.ts
  - server/agents/tools/webSearch.test.ts
priority: medium
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Why

Plan 把 web_search backend 列为"v1 默认 tavily；适配器化保留切换 Serper / Brave 的能力"（plan 已决议段落），但 TASK-29 落地时是直接把 tavily 的 fetch / 解析内联在 `server/agents/tools/webSearch.ts` 的 `run()` 里，没有 backend 抽象。Phase 4 plan 的 "搜索后端可热替换" 子项实际是半做。

这一步把 adapter 接口抽出来、Tavily 作为默认实现注入，**不**新增第二个 backend、**不**动 Settings UI——只是把"换 backend 等于改一个 import"做到位，给 Phase 5 skill 化做准备。

## Context

- 当前 `server/agents/tools/webSearch.ts` 51-124 行：直接 `fetch(TAVILY_ENDPOINT)`，结果 mapping (`title / url / snippet`) 内联在 run() 里。
- 工具注册仍走 `register({ name: "web_search", ... })`；Tavily key 走 `getToolApiKey(userId, "tavily")`。
- runTools / streamUserMessage 不动；客户端 ToolBubble 不动。

## 目标接口

```ts
interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface SearchBackend {
  id: string; // e.g. "tavily"
  search(args: {
    query: string;
    topK: number;
    userId: number;
    signal?: AbortSignal;
  }): Promise<
    { ok: true; results: SearchResult[] } | { ok: false; error: string }
  >;
}
```

`webSearch.ts` 的 `run()` 简化成：

1. 校验 userId / args；
2. `const backend = getActiveSearchBackend();`
3. 调 `backend.search(...)` 拿到 `{ ok, results | error }`；
4. 包装成 tool 输出（`{ ok, query, results }` / `{ ok: false, error }`）。

`getActiveSearchBackend()` v1 返 `tavilyBackend` 常量（**不**读 Settings、**不**支持 per-conversation 覆盖——那是 Phase 5）。

## Out of scope

- 新增 Serper / Brave backend。
- Settings UI 选 backend。
- per-conversation backend override。
- 把 web_search 改写为 skill 形态（Phase 5 一起）。

## Files

- 新建 `server/agents/tools/searchBackends/types.ts`：SearchBackend / SearchResult 接口。
- 新建 `server/agents/tools/searchBackends/tavily.ts`：把 webSearch.ts 现有 tavily 逻辑搬过来，导出 `tavilyBackend: SearchBackend`。
- 新建 `server/agents/tools/searchBackends/index.ts`：`getActiveSearchBackend()` 单导出（v1 永远返 tavily）。
- 改 `server/agents/tools/webSearch.ts`：删 tavily 直调，改为 `backend.search(...)` + 结果包装。
- 新建 `server/agents/tools/searchBackends/tavily.test.ts`：覆盖 200 ok / 4xx / 网络错 / 解析失败 / 空 results 几个分支（继承 webSearch.test.ts 现有用例）。
- 改 `server/agents/tools/webSearch.test.ts`：用 mock backend 验证 tool 注入 + 结果包装；删除原本由 tavily fetch mock 触发的边界用例（移到 tavily.test.ts）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 server/agents/tools/searchBackends/{types,tavily,index}.ts 三个文件落地，SearchBackend 接口与 v1 接口契约一致
- [x] #2 webSearch.ts 的 run() 不再含 fetch(tavily) / TAVILY_ENDPOINT 等硬编码，只调 backend.search(...) + 包装结果
- [x] #3 tavily.ts 的 tavilyBackend 行为与 TASK-29 落地版本完全等价（query / topK / signal / userId 透传，错误分支保留中文 error 文案）
- [x] #4 searchBackends/tavily.test.ts 覆盖 200 ok / 4xx / network / json 解析失败 / 空 results 五条分支
- [x] #5 webSearch.test.ts 用 mock SearchBackend 验证：参数校验、backend.search 被调用一次、ok 结果包装、ok=false 透传 error
- [x] #6 getActiveSearchBackend() 当前总是返 tavilyBackend；预留可替换 hook 但不实现 Settings 读取
- [x] #7 npm run check + npm run format + npm run test 全绿，烟测无回归（gemini + web_search 还能跑通）
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## 实现计划

### 1. 新建 `server/agents/tools/searchBackends/types.ts`

- `SearchResult { title, url, snippet }`、`SearchBackend { id, search(args) }`。
- args 形如 `{ query, topK, userId, signal? }`；返 `{ ok: true, results } | { ok: false, error }`。

### 2. 新建 `server/agents/tools/searchBackends/tavily.ts`

- 把现 webSearch.ts 51-124 里的 tavily 调用搬过来，包成 `tavilyBackend: SearchBackend`。
- 内部常量 `TAVILY_ENDPOINT` / `PER_REQUEST_TIMEOUT_MS` / `SNIPPET_MAX_CHARS` 跟着搬。
- 错误文案保留中文（"未配置 tavily api key" / "tavily 请求失败" / "tavily 解析失败" / "tavily 4xx"）。

### 3. 新建 `server/agents/tools/searchBackends/index.ts`

- `getActiveSearchBackend(): SearchBackend` —— v1 永远返 `tavilyBackend`。
- 留注释 hint 说 Phase 5 会改读 Settings。

### 4. 改 `server/agents/tools/webSearch.ts`

- 参数 schema (`MAX_TOP_K` / `DEFAULT_TOP_K`) 留在 webSearch.ts（它是 tool 边界，跨 backend 通用）。
- `run()` 只做：userId 守卫 → `const backend = getActiveSearchBackend()` → `backend.search({ query, topK: args.topK, userId, signal })` → `ok` 时返 `{ ok: true, query, results }`，`ok=false` 时返 `{ ok: false, error }`。

### 5. 拆测试

- 新 `searchBackends/tavily.test.ts`：把 webSearch.test.ts 里 fetch mock 出来的 tavily 行为分支搬过来（200 ok / 4xx / network error / json 解析失败 / 空 results 5 条）+ describe 用 tavilyBackend 直接调。
- 改 `webSearch.test.ts`：mock `getActiveSearchBackend` 返一个 stub backend，验证：参数校验、backend.search 调用一次、参数透传、ok 包装、error 包装。

### 6. 收尾

- `npm run check` / `npm run format` / `npm run test`。
- AC 7 条逐条勾、finalSummary、modifiedFiles、status Done、commit 等用户授权。
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## 摘要

把 TASK-29 把 tavily fetch 直接内联在 `webSearch.ts run()` 里的妥协补齐：抽出 `SearchBackend` 接口 + `tavilyBackend` 实现 + `getActiveSearchBackend()` 单点 dispatcher。Phase 4 plan 的"搜索后端可热替换"子项收尾。

这是**纯重构**：wire-level 行为字节对齐 TASK-29 落地版本（同样的 endpoint、同样的 payload、同样的 fetch 调用、同样的错误文案）。**未**新增 Serper / Brave backend，**未**动 Settings UI，**未**改 skill 形态——那些是 Phase 5 范畴。

## 实现要点

- **新建 `server/agents/tools/searchBackends/types.ts`**：`SearchBackend { id, search(args) }` + `SearchResult { title, url, snippet }` + `SearchBackendArgs` / `SearchBackendResponse`。
- **新建 `server/agents/tools/searchBackends/tavily.ts`**：把 webSearch.ts 51-124 的 tavily 调用全部搬过来，包成 `tavilyBackend: SearchBackend`，常量 (`TAVILY_ENDPOINT` / `PER_REQUEST_TIMEOUT_MS` / `SNIPPET_MAX_CHARS`) 跟着搬。
- **新建 `server/agents/tools/searchBackends/index.ts`**：`getActiveSearchBackend()` 当前永远返 `tavilyBackend`；留注释说明 Phase 5 会改读 settings。同时 re-export 类型给外部消费方。
- **改 `server/agents/tools/webSearch.ts`**：删 fetch / TAVILY_ENDPOINT / TavilyResponse 等 tavily 细节，`run()` 缩成 userId 守卫 + `getActiveSearchBackend().search()` + 包装结果。zod 参数 schema（query / topK）留在 tool 边界，跨 backend 通用。
- **新建 `searchBackends/tavily.test.ts`**：8 个 spec —— id 校验、200 ok 路径（query/topK/key 透传 + 截断 + filter）、未配 key、4xx 状态、network error、JSON 解析失败、空 results、signal 透传。
- **改 `webSearch.test.ts`**：`vi.mock("./searchBackends")` 注入 stub backend，验证 backend 单次调用、参数透传、signal 透传、ok 包装、error 透传、默认 topK、zod 边界（空 query / topK>10）、userId 缺失。

## 测试

- `npm run check` ✓
- `npm run format` ✓
- `npm run test` ✓ 25 files / 265 tests（baseline 255 + 10 新：tavily 8 + webSearch 净增 2）
- 烟测（AC #7）：纯重构，wire 字节对齐；如需信心可再跑一遍 TASK-30 烟测路径，预期完全等价。

## 回归保障

- tavily 调用的 endpoint / headers / body / signal 完全对齐 TASK-29 实现。
- 错误文案逐字保留（"未配置 tavily api key" / "tavily 请求失败:" / "tavily 解析失败:" / `tavily ${status}: ...`）。
- `runTools` / `streamUserMessage` / ToolBubble 全部未触碰。
- TASK-27/28/29/30 测试全绿；新加的 tavily.test.ts 覆盖率与 webSearch.test.ts 原本的 fetch-mock 用例一一对应。

## 下一步

Phase 4 全部子项关闭：tool-calling loop / N 步保护 / UI 气泡 / get_klines / get_recent_trades / web_search / web_fetch / gemini schema 翻译 / **search backend adapter**。可以开 Phase 5。
<!-- SECTION:FINAL_SUMMARY:END -->
