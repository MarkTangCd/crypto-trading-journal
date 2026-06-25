---
id: TASK-26
title: 默认 provider 选择 + per-conversation provider 覆盖（Phase 3 · UX）
status: To Do
assignee: []
created_date: "2026-06-25 04:02"
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

- [ ] #1 #1 新增 `settings.getDefaultProvider` / `setDefaultProvider` tRPC procedures，读写 `agent_settings.defaultProvider`，id 校验入 registry
- [ ] #2 #2 `reviewAgent.open` 输入加可选 `providerId`：传入则优先（需 hasKey），未传则用 `agent_settings.defaultProvider`；已有 conversation 时 providerId 锁定就 conversation 本身
- [ ] #3 #3 `streamUserMessage` 改为从 conversation 读 providerId，不再使用 settings.defaultProvider（保证历史会话不漂移）
- [ ] #4 #4 Settings 页增 “默认 provider” 区域：仅列出 hasKey provider；选中后调 `setDefaultProvider`；未配置任何 key 时显示友好提示
- [ ] #5 #5 AgentDrawer header 增一行 provider 控件：未开会话时下拉可选（默认 defaultProvider）；已有会话只读显示“provider · X（本笔会话已锁定）”
- [ ] #6 #6 `reviewAgent.open` 走 providerId 未配置 key 时报 `TRPCError(BAD_REQUEST, ”未配置 {provider} api key“)`；客户端 toast 出中文提示
- [ ] #7 #7 烟测：填入两家 provider key、设 default = A；开 trade-1 默认 A，手动切到 B 开 trade-2。两者后续发送都走各自 provider，刷新后 providerId 仍锁
- [ ] #8 #8 `npm run check` + `npm run format` 通过；现有测试全绿；为 `reviewAgent.open` 的 providerId 趋势加 1–2 个单测
<!-- AC:END -->
