---
id: TASK-29
title: 外部工具：web_search（tavily）+ web_fetch（Phase 4 · network）
status: To Do
assignee: []
created_date: "2026-06-25 12:50"
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

- [ ] #1 server/agents/tools/webSearch.ts 实现：Zod 参数校验、调 tavily search、返回 top-K 压缩结果
- [ ] #2 server/agents/tools/webFetch.ts 实现：30s timeout、200KB cap、non-html 返 ok=false、readability + markdown 裁到7k chars
- [ ] #3 tavily api key 存储走加密层，不入 ChatProvider registry；Settings 页增一条 'tavily search · api key' 输入，都是 Bench Notebook 风格
- [ ] #4 tavily 缺 key 时 web_search.run 友好返 ok=false（不抛），guard rails 正常退出；web_fetch 无需 key
- [ ] #5 两个工具注册进 toolRegistry；agent 可在同一会话内连着调两者（search 然后 fetch 顶部 url）
- [ ] #6 烟测：在 BTCUSDT trade-1 问 'btc 近期 funding 事件背景'，agent 会依次调 web_search → web_fetch → 引用原文
- [ ] #7 为两个工具各加 1-2 个单测：parameters 校验、happy path mocked、超时 / 超额路径
- [ ] #8 npm run check + npm run format + npm run test 全绿
<!-- AC:END -->
