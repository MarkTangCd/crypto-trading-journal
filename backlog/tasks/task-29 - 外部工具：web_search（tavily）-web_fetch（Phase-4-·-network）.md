---
id: TASK-29
title: 外部工具：web_search（tavily）+ web_fetch（Phase 4 · network）
status: In Progress
assignee:
  - '@myself'
created_date: '2026-06-25 12:50'
updated_date: '2026-06-26 08:42'
labels:
  - ai-agent
  - phase-4
  - server
  - ui
milestone: m-0
dependencies:
  - TASK-27
documentation:
  - .lavish/trade-review-ai-agent-plan.html
modified_files:
  - server/agents/secrets.ts
  - server/agents/tools/webSearch.ts
  - server/agents/tools/webSearch.test.ts
  - server/agents/tools/webFetch.ts
  - server/agents/tools/webFetch.test.ts
  - server/agents/tools/index.ts
  - server/routers.ts
  - client/src/components/settings/ToolKeysSection.tsx
  - client/src/pages/Settings.tsx
  - package.json
  - package-lock.json
priority: medium
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Why

让 agent 自己上网查 funding rate 新闻、链上数据帖子、宏观叙事。这是 Phase 4 把 review-agent 从"读你给的字段"升级到"主动调研"的转折点。tavily 作为默认搜索后端（已决议），后端可替换的设计留口给未来切 serper/brave。

## Context

- `server/agents/tools/webSearch.ts`：参数 `{ query, topK?: number (default 5, max 10) }`。POST https://api.tavily.com/search，返回压缩 `[{ title, url, snippet }]`。
- `server/agents/tools/webFetch.ts`：参数 `{ url }`。fetch + 30s timeout + 200KB cap（用 ReadableStream + 累计字节数）→ readability 抽正文 → turndown 转 markdown → 截断到 ~6k chars 返。
- Settings 增 `webSearch` "provider"（**不放进 provider registry** —— 它不是 ChatProvider；新建独立配置项）：
  - 复用 `agentSettings.providerConfigs` 加密 blob，约定 key `tavily.apiKey`；或扩 `secrets.ts` 加 `getToolApiKey(userId, "tavily")` 包装。
  - Settings 页加一行 "tavily search · api key" 输入（沿用 ProviderRow 风格但简化）。
- 启用条件：tavily 缺 key 时 `web_search` 注册照常存在，但 `run` 直接返 `{ ok: false, error: "未配置 tavily api key" }`，护栏正常回退。`web_fetch` 不需要 key。
- 工具调用气泡 UI 已在 TASK-28 落地，本任务复用，不重做。

## Out of scope

- 多搜索后端 hot-swap 选择器（v0 只 tavily；后端可热替换的接口预留 `WebSearchBackend = { id, search() }` 即可，不上 UI）。
- web_fetch 缓存层（v0 每次都拉；命中相同 url 时浪费一次 token 没事）。
- PDF / 图片处理（v0 只处理 html，非 html 返 ok=false）。
- 域名白名单/黑名单（v0 不限制，靠模型自律）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 server/agents/tools/webSearch.ts 实现：Zod 参数校验、调 tavily search、返回 top-K 压缩结果
- [x] #2 server/agents/tools/webFetch.ts 实现：30s timeout、200KB cap、non-html 返 ok=false、readability + markdown 裁到7k chars
- [x] #3 tavily api key 存储走加密层，不入 ChatProvider registry；Settings 页增一条 'tavily search · api key' 输入，都是 Bench Notebook 风格
- [x] #4 tavily 缺 key 时 web_search.run 友好返 ok=false（不抛），guard rails 正常退出；web_fetch 无需 key
- [x] #5 两个工具注册进 toolRegistry；agent 可在同一会话内连着调两者（search 然后 fetch 顶部 url）
- [ ] #6 烟测：在 BTCUSDT trade-1 问 'btc 近期 funding 事件背景'，agent 会依次调 web_search → web_fetch → 引用原文
- [x] #7 为两个工具各加 1-2 个单测：parameters 校验、happy path mocked、超时 / 超额路径
- [x] #8 npm run check + npm run format + npm run test 全绿
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Plan

### Server

1. **secrets.ts** 复用 `loadProviderConfigs` / `saveProviderConfigs`，加 `getToolApiKey(userId, "tavily")` / `setToolApiKey(userId, "tavily", apiKey)` wrapper（不破坏 setProviderConfig 行为；envvar fallback `TAVILY_API_KEY`）。
2. **server/agents/tools/webSearch.ts** —— Zod `{ query: string min 1, topK: number 1-10 default 5 }`；POST tavily `/search`，30s timeout via `AbortSignal.any([ctx.signal, AbortSignal.timeout(30_000)])`；缺 key 返 `{ ok: false, error: "未配置 tavily api key" }`（不抛）；返回 `{ ok: true, results: [{ title, url, snippet (~500 chars) }] }`。
3. **server/agents/tools/webFetch.ts** —— Zod `{ url: z.string().url() }`；30s timeout、200KB cap（`for await (chunk of res.body)` + 累计字节）；non-html content-type 返 `{ ok: false, error: "non-html content: <type>" }`；html → `linkedom` parseHTML → `@mozilla/readability` 抽正文 → `turndown` 转 markdown → 截到 ~7000 chars 返 `{ ok: true, url, title, markdown }`。
4. **server/agents/tools/index.ts** 末尾追加 `import "./webSearch"; import "./webFetch";`。

### tRPC

5. **server/routers.ts** `settings` router 新增 `getToolKeyStatus`（返 `{ tavily: { hasKey } }`，绝不返 plaintext）+ `setToolKey`（input `{ tool: z.enum(["tavily"]), apiKey: z.string().trim().min(1).max(200) }`）—— 独立于 setProviderConfig，不污染 providerIdSchema。

### Frontend

6. **client/src/components/settings/ToolKeysSection.tsx**（新）—— 单行 api key 输入 + hasKey 状态指示，复用 ProviderRow 视觉 token（Bench Notebook 无圆角无阴影 lowercase tabular-nums）。
7. **client/src/pages/Settings.tsx** 挂载 `<ToolKeysSection />`。

### Tests

8. `server/agents/tools/webSearch.test.ts` —— mock `global.fetch`：happy / 缺 key / 5xx / zod 失败。
9. `server/agents/tools/webFetch.test.ts` —— mock fetch：happy html → markdown / 缺 content-type / non-html / 超 200KB cap / timeout。

### Verification

10. `npm run format` / `npm run check` / `npm run test`（target: 219 + N 新）。
11. 浏览器烟测：BTCUSDT trade，问 'btc 近期 funding 事件背景'，观察 ToolBubble 链路 + 模型引用。

### 关键护栏

- 30s per-request timeout 用 `AbortSignal.any([ctx.signal, AbortSignal.timeout(30_000)])`，不破坏 runTools 60s 预算。
- web_fetch 200KB cap 用 stream reader 累计 byteLength，**不**用 `await res.text()`。
- non-html 判定：`content-type` 含 `text/html` 或 `application/xhtml+xml` 才走 readability 路径。
- 缺 tavily key 工具 register 不变（schema 不变），run 时再 check key。
- Settings ToolKey 走独立 tRPC 路径，不破坏 `providerIdSchema` 现有 enum。
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Summary

Phase 4 第三刀落地。review-agent 多了两把外网工具：`web_search`（tavily）和 `web_fetch`（任意 HTML → markdown）。

### Backend

- **`server/agents/tools/webSearch.ts`** —— Zod `{ query, topK 1-10 default 5 }`，POST `https://api.tavily.com/search`，30s per-request timeout 与 ctx.signal 复合（`AbortSignal.any`），返回压缩 `[{ title, url, snippet (~500 chars) }]`。缺 key 时**不抛**，返 `{ ok: false, error: "未配置 tavily api key" }`，落入护栏正常退出。tavily 5xx / 解析失败 / 缺 userId 同样 ok:false 兜底。
- **`server/agents/tools/webFetch.ts`** —— Zod `{ url: z.string().url() }`，30s timeout、200KB cap（`ReadableStream` reader 累计字节，超 cap 立即 `reader.cancel()`），non-html content-type 返 ok:false 并 cancel body 释放连接，html 走 `linkedom parseHTML` → `@mozilla/readability` 抽正文 → `turndown` → markdown 截到 7000 chars。
- **`server/agents/tools/index.ts`** —— 末尾追加 `import "./webSearch"; import "./webFetch";` 触发 boot-time register。
- **`server/agents/secrets.ts`** —— 新增 `getToolApiKey` / `setToolApiKey` / `hasToolApiKey` wrapper + `ToolId` 类型。tool key 复用同一加密 blob，但写在独立 namespace（前缀 `tool:`），不污染 ChatProvider providerConfigs 语义；envvar fallback `TAVILY_API_KEY` 保留供 dev 使用。
- **`server/routers.ts`** —— `settings` router 新增 `getToolKeyStatus`（只返 `{ tavily: { hasKey } }`，绝不返 plaintext）+ `setToolKey`（input 强制 `z.enum(["tavily"])`，与 `providerIdSchema` 完全解耦）。

### Frontend

- **`client/src/components/settings/ToolKeysSection.tsx`**（新，~150 LOC）—— 单行 api key 输入，已配置/未配置状态指示，复用 ProviderRow 视觉 token（无圆角、无阴影、lowercase、border-border、tabular-nums）。
- **`client/src/pages/Settings.tsx`** —— 把 `<ToolKeysSection />` 挂在 `<AgentProviderSection />` 后面。

### 测试

- `webSearch.test.ts` (7 tests)：register 名 / 缺 key / topK 压缩 / 5xx / 空 query zod / topK > 10 zod / 缺 userId。
- `webFetch.test.ts` (7 tests)：register 名 / 非 URL zod / html → markdown happy / non-html ok:false / 200KB cap (stream + reader.cancel) / 4xx / AbortError。
- TASK-27/28 既有测试零回归（toolRegistry / runTools / getKlines / getRecentTrades 全绿）。
- baseline 219 → 233 (+14)。

### 关键护栏

- 30s per-request timeout **不**复合 runTools 60s 预算（用 `AbortSignal.any` 在工具内部加 per-request），runTools 60s 仍是总闸。
- 200KB cap 用 stream reader 累计字节，绝不调 `await res.text()`。
- 缺 tavily key 时工具仍 register（schema 不变），run 时才 check → 模型对工具的可见性稳定。
- Settings tool key 走独立 tRPC 路径，`providerIdSchema` 现有 enum / `setProviderConfig` / `listProviders` 全部不动；deepseek 不传 tools 时单步路径完整保留。

### 依赖

新增三个 npm 包用于 web_fetch 正文抽取（用户确认过）：

- `@mozilla/readability`
- `turndown` (+ `@types/turndown` 作 devDep)
- `linkedom`

### 命令状态

- `npm run check` ✅
- `npm run format` ✅
- `npm run test` ✅ 23 files / 233 tests 全绿

### AC 状态

- #1 webSearch.ts ✓
- #2 webFetch.ts ✓
- #3 tavily key 走加密层 + Settings UI Bench Notebook 风格 ✓
- #4 缺 key 友好 ok:false ✓
- #5 两工具进 toolRegistry ✓
- #6 浏览器烟测 **未跑**（需要真 tavily api key + dev server，留给用户实测；UI / 后端代码路径已就绪）
- #7 单测 14 个 ✓
- #8 check + format + test 全绿 ✓
<!-- SECTION:FINAL_SUMMARY:END -->
