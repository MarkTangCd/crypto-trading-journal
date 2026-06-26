---
id: TASK-26
title: 默认 provider 选择 + per-conversation provider 覆盖（Phase 3 · UX）
status: Done
assignee:
  - "@myself"
created_date: "2026-06-25 04:02"
updated_date: "2026-06-25 08:50"
labels:
  - ai-agent
  - phase-3
  - ui
  - server
milestone: m-0
dependencies:
  - TASK-24
  - TASK-25
documentation:
  - .lavish/trade-review-ai-agent-plan.html
modified_files:
  - client/src/components/review-agent/AgentDrawer.tsx
  - client/src/components/settings/AgentProviderSection.tsx
  - client/src/components/settings/DefaultProviderSection.tsx
  - server/agents/reviewAgent.ts
  - server/db.ts
  - server/reviewAgent.router.test.ts
  - server/reviewAgent.stream.test.ts
  - server/routers.ts
  - server/settings.router.test.ts
  - server/streamRoute.integration.test.ts
priority: high
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

## Why

Plan 的 Phase 3 收口：用户可在 Settings 选默认 provider，并在打开某笔 trade 的 drawer 时临时切到别家做对比。`agent_settings.defaultProvider` 字段早已落库，`conversations.providerId` 列也已就绪——本任务把它们暴露给用户。

## Context

- 服务端：
  - 新增 `settings.getDefaultProvider` / `settings.setDefaultProvider` tRPC procedures（写 `agent_settings.defaultProvider`，校验 id ∈ registry）
  - `reviewAgent.open` 输入加可选 `providerId`：
    - 传入则用它（校验 id ∈ registry 且 key 已配）
    - 不传则用 `agent_settings.defaultProvider`（沿用现状）
    - 已有 conversation：跳过 providerId 校验，直接复用 conversation.providerId（per-trade 一旦定下不变，避免历史消息 model 漂移）
  - `openConversation` 写入 `conversations.providerId` 时用上述决议
- 客户端：
  - Settings 增"默认 provider"单选区，仅列出 `hasKey === true` 的 provider；保存即 `setDefaultProvider`
  - AgentDrawer 顶部 header 加一条 provider 行：
    - 已开过会话：仅展示 `conversation.providerId`（read-only），文案如 "provider · kimi（本笔会话已锁定）"
    - 未开会话：渲染一个下拉/分段控件，默认指向 `agent_settings.defaultProvider`，可临时切换；点击"开始对话"才落库
  - `reviewAgent.open` 调用按上述传入 providerId
  - `AgentMessageList` 不动；`useReviewStream` 不动（streaming endpoint 仍按 conversationId 路由，server 端自动用 conversation.providerId）
- `streamUserMessage` 现在需要从 conversation 读 providerId，而非从 settings.defaultProvider 取（保证已有 conversation 走自己的 provider）
- 错误：
  - `reviewAgent.open` 校验 providerId 未配 key → `TRPCError("BAD_REQUEST", "未配置 {provider} api key")`
  - `setDefaultProvider` 选择未配 key 的 provider → 允许（用户也许马上要填 key），但 UI 友好提示

## Out of scope

- 自动跨 provider fallback（明确不做）
- 跨会话的"全局对话"概念
- 模型选择（每 provider 暂用 defaultModel）
- Settings 模型微调入口（Phase 4/5 再说）
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 #1 新增 `settings.getDefaultProvider` / `setDefaultProvider` tRPC procedures，读写 `agent_settings.defaultProvider`，id 校验入 registry
- [x] #2 #2 `reviewAgent.open` 输入加可选 `providerId`：传入则优先（需 hasKey），未传则用 `agent_settings.defaultProvider`；已有 conversation 时 providerId 锁定就 conversation 本身
- [x] #3 #3 `streamUserMessage` 改为从 conversation 读 providerId，不再使用 settings.defaultProvider（保证历史会话不漂移）
- [x] #4 #4 Settings 页增 “默认 provider” 区域：仅列出 hasKey provider；选中后调 `setDefaultProvider`；未配置任何 key 时显示友好提示
- [x] #5 #5 AgentDrawer header 增一行 provider 控件：未开会话时下拉可选（默认 defaultProvider）；已有会话只读显示“provider · X（本笔会话已锁定）”
- [x] #6 #6 `reviewAgent.open` 走 providerId 未配置 key 时报 `TRPCError(BAD_REQUEST, ”未配置 {provider} api key“)`；客户端 toast 出中文提示
- [ ] #7 #7 烟测：填入两家 provider key、设 default = A；开 trade-1 默认 A，手动切到 B 开 trade-2。两者后续发送都走各自 provider，刷新后 providerId 仍锁
- [x] #8 #8 `npm run check` + `npm run format` 通过；现有测试全绿；为 `reviewAgent.open` 的 providerId 趋势加 1–2 个单测
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. server/db.ts: 新增 getConversationById(id, userId) 和 getConversationByTransaction(userId, transactionId)（userId 内含守卫；查询不创建）。
2. server/agents/reviewAgent.ts:
   - 把 resolveProvider 拆成 resolveProviderById(userId, providerId) 和 resolveDefaultProvider(userId)，缺 key 抛 ProviderError("AUTH", ...)。
   - openConversation 加可选 providerId 参数；决策：已存在 conversation → 用 conversation.providerId（锁定）；否则 explicit > settings.default。
   - sendUserMessage / streamUserMessage 先 getConversationById 读 providerId，再 resolveProviderById（替换原来的 resolveProvider(userId)）。
3. server/routers.ts:
   - settings.getDefaultProvider (query) / setDefaultProvider (mutation)，写 agent_settings.defaultProvider，无 hasKey 校验。
   - reviewAgent.getActive({ transactionId }) (query) — 查询不创建，便于客户端在打开 drawer 时判断是否已有 conversation。
   - reviewAgent.open 输入加可选 providerId（providerIdSchema.optional()），透传给 openConversation。
4. client/src/components/settings/DefaultProviderSection.tsx (新)：用 listProviders 过滤 hasKey === true，单选 + 保存；零 hasKey 显示提示。
5. client/src/pages/Settings.tsx：挂载新区段，沿用 Bench Notebook 风格（lowercase / radius 0 / 无 shadow）。
6. client/src/components/review-agent/AgentDrawer.tsx：
   - 用 listProviders + getDefaultProvider + getActive 替代单点 getProviderConfig。
   - 未开会话 → 渲染 provider 下拉 + "开始对话" 按钮；点击后 mutate reviewAgent.open({transactionId, providerId})。
   - 已开会话 → 锁定 provider，header 显示 "provider · X（本笔会话已锁定）"。
   - 流式发送链路不变。
7. 测试：
   - reviewAgent.router.test.ts: explicit providerId 成功路径、缺 key 报 BAD_REQUEST、已有 conversation 时 override 被忽略。
   - reviewAgent.stream.test.ts: stream 走 conversation.providerId 而非 settings.default。
   - settings.router.test.ts: setDefaultProvider 成功 + 未知 id 拒绝。
8. npm run format / npm run check / npm run test 全绿，目标 180 + N 新。
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

## 默认 provider 选择 + per-conversation provider 覆盖

把 Phase 3 已落地但用户够不到的两条线（`agent_settings.defaultProvider` / `conversations.providerId`）暴露成可用 UX。

### Server

- `server/db.ts` 新增 `getConversationById(id, userId)` / `getConversationByTransaction(userId, transactionId)`：userId 内含守卫的查询型 helper。
- `server/agents/reviewAgent.ts`：
  - 把原 `resolveProvider(userId)` 拆成 `resolveProviderById(userId, providerId)` 和 `resolveDefaultProvider(userId)`，前者校验 registry + key，缺则抛 `ProviderError("AUTH", "未配置 {id} 的 api key…")`，由 `runAgent` 映射到 `TRPCError("BAD_REQUEST")`。
  - `openConversation` 加可选 `providerId`，决策树：已有 conversation → 用 `conversation.providerId`（per-trade 锁定）；否则 explicit > settings.default。
  - 新导出 `getActiveConversation`，纯查询不创建。
  - `sendUserMessage` / `streamUserMessage` 改成先 `getConversationById` 取 `conversation.providerId`，再 `resolveProviderById` —— 历史会话从此不会因为默认 provider 切换而漂移。
- `server/routers.ts`：
  - `settings.getDefaultProvider`（query）/ `setDefaultProvider`（mutation）— 后者无 hasKey 校验（用户可能马上去填 key）。
  - `reviewAgent.getActive`（query）— 让客户端在打开 drawer 时判断是否已有 conversation 而不触发创建。
  - `reviewAgent.open` 输入加可选 `providerId: providerIdSchema.optional()`，透传给 orchestrator。

### Client

- 新增 `DefaultProviderSection`：只列 `hasKey === true` 的 provider 单选；零 hasKey 时显示提示文案；保存调 `setDefaultProvider` 并 invalidate 缓存。挂在 `AgentProviderSection` 顶部。
- `AgentDrawer` 重写为四态：
  - bootstrapping：单 spinner。
  - 零 hasKey：跳转 Settings 提示。
  - 未开会话：header 渲染 `ProviderPicker` 分段控件，默认指向 `getDefaultProvider`；主体显示"开始对话"按钮，点击后 mutate `reviewAgent.open({transactionId, providerId})`。
  - 已开会话：header 显示 `provider · {label}（本笔会话已锁定）`，主体是 `AgentMessageList`，输入区不变。
  - SSE 流式通道完全不动，server 端会自动用 `conversation.providerId`。

### Tests

- `reviewAgent.router.test.ts`: 加 3 个新用例（explicit kimi 成功、缺 kimi key → BAD_REQUEST 含 "kimi"、已有 conversation 时 override 被忽略锁仍走 deepseek）。
- `reviewAgent.stream.test.ts`: 加 1 个用例（conversation.providerId === kimi 时 stream 走 kimi，即使 settings.default 是 deepseek）。
- `settings.router.test.ts`: 加 4 个用例（getDefaultProvider 读已存 / 缺 row fallback、setDefaultProvider 透传、未知 id 拒绝）。
- `streamRoute.integration.test.ts`: db mock 补 `getConversationById`，旧用例继续绿。
- 188 测试全绿（180 → 188，+8 新）；`npm run check` / `npm run format` 通过。

### Out of scope（沿用 task description）

不实现跨 provider fallback、跨会话"全局对话"、模型微调入口。AC #7 烟测留待用户手动验证（已配两家 key、设默认 = A、开 trade-1 默认 A、新 trade-2 切到 B、各发一条、刷新看锁是否仍在）。

<!-- SECTION:FINAL_SUMMARY:END -->
