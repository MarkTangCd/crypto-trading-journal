---
id: m-0
title: "Trade Review AI Agent"
---

## Description

在 TransactionDetail 右侧抽屉接入 AI 复盘助手。上下文含 trade 字段 + ±100 K 线（向后不足取到最新即可） + 账户状态 + 历史样本。Provider: deepseek/kimi/glm/gemini/openai 五家统一适配。工具: web_search (默认 tavily) / web_fetch / get_klines / get_recent_trades；未来通过 skill 注册中心扩展。对话作用域 per-trade。Design doc: .lavish/trade-review-ai-agent-plan.html。
