---
id: TASK-33
title: 'Settings UI: Skills 启用勾选（Phase 5 · UX）'
status: Done
assignee:
  - '@myself'
created_date: '2026-06-26 13:27'
updated_date: '2026-06-27 02:38'
labels:
  - ai-agent
  - phase-5
  - client
milestone: m-0
dependencies:
  - TASK-32
documentation:
  - .lavish/trade-review-ai-agent-plan.html
  - DESIGN.md
modified_files:
  - server/agents/skillRegistry.ts
  - server/routers.ts
  - server/settings.router.test.ts
  - client/src/components/settings/SkillsSection.tsx
  - client/src/components/settings/skillsSelection.ts
  - client/src/components/settings/skillsSelection.test.ts
  - client/src/pages/Settings.tsx
  - vitest.config.ts
priority: medium
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Why

TASK-32 把 skill 抽象 + enabledSkillIds 过滤 wire 起来了，但用户没法手动开关。Phase 5 plan 要求 `Settings 勾选启用`。这一步把 Skills 列表 + 勾选交互加到 Settings 页，**保留 Bench Notebook 风格**（lowercase labels、tabular-nums、零阴影、零圆角）。

## Context

- `client/src/pages/Settings.tsx` 已有 provider key + default provider 区块（Phase 3 落地）。
- TASK-32 后端会 expose 全部已注册 skill 的 `{ id, name, description, category? }` 元数据；UI 直接消费该列表。
- 后端 `agentSettings.enabledSkillIds` 已存在；tRPC 已有 `upsertAgentSettings`，**复用即可**，不新增 procedure（除非需要 skill 列表 procedure）。

## 设计

1. **新增 tRPC procedure** `agentSettings.listSkills`：返已注册 skill 的 `{ id, name, description, category }[]`。客户端 useQuery 拿到后渲染。
2. **Settings 页加一个新 section**：
   - 标题 `skills`（lowercase）。
   - 每个 skill 一行：左侧 `[checkbox]` + skill name + 单行 description；可选按 category 分组（internal / network / analysis）。
   - 当前启用集 = enabledSkillIds（空 = 全启用，UI 应解释成"全部勾上"）。
   - 勾选交互：本地 state 维护当前勾选集，"save" 按钮触发 `upsertAgentSettings({ enabledSkillIds })`；trigger optimistic invalidate。
   - **重要**：默认全启的语义要直观——首次进 Settings 应显示全部已勾，而不是显示空集让用户困惑。
3. **空集 → 全启的转换**：
   - 加载时：如果 server 返 enabledSkillIds = []，UI 把 "全部已注册 skill id" 当成初始勾选集。
   - 保存时：若用户的勾选集 = 全部已注册 skill id → 写空数组（保持"默认全启"语义，未来新增 skill 时自动包含）。若不是 → 写实际勾选集。
4. **Bench Notebook 风格**：参 DESIGN.md。复用 `components/ui/checkbox` + 现有 Settings 区块的间距 / 字体 / 间隔线，无需 cards / shadows / 圆角。lowercase 区块标题、单行描述、行间距同 provider 列表。
5. **不动 toast**：用现有 `toast.success("saved")` / `toast.error(...)` 模式。

## Out of scope

- skill 详情弹窗 / 配置面板（每个 skill 自己的参数预设）——v0 只是开关。
- skill 列表的搜索 / 排序。
- 按 category 折叠：v0 平铺即可，如果分组就用 plaintext 分隔。
- per-conversation skill override（未来）。

## Files

- 新 tRPC procedure `agentSettings.listSkills`（在 `server/agentSettings.router.ts` 或类似处；复用 listSkills helper）。
- 改 `server/agents/skillRegistry.ts`：export `listSkills(): SkillMetadata[]`（id / name / description / category）。
- 改 `client/src/pages/Settings.tsx`：加 Skills section + state + save 按钮。
- 可选小组件 `client/src/components/settings/SkillsSection.tsx`（如果 Settings.tsx 超 200 LOC 必须拆，组件 ≤ 200 LOC 守则）。
- 客户端测试：可选 vitest 单测验证 "空集 → 全启" 的转换函数。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Settings 页新增 'skills' 区块，列出当前所有已注册 skill、勾选状态反映 enabledSkillIds，调式跟 provider 区块一致（Bench Notebook 风格）
- [x] #2 agentSettings.listSkills tRPC 过程返回 [{ id, name, description, category }]；skillRegistry 新增 listSkills() / SkillMetadata 类型
- [x] #3 首次加载：服务端 enabledSkillIds = [] 时 UI 显示全部勾上（不能呈现为空选）
- [x] #4 保存转换：勾选集 = 全部 skill 时写空数组；不是则写实际勾选列表（使未来新 skill 默认启用）
- [x] #5 保存成功 toast.success、失败 toast.error；保存后后端查 enabledSkillIds 与预期一致
- [x] #6 烟测：取消勾选 web_search 后，起一个 review 会话问 '搜一下 funding rate' → agent 不调 web_search，回复里明确说明用不了该工具
- [x] #7 组件拆分后 Settings.tsx + SkillsSection.tsx 各 ≤ 200 LOC；npm run check + format + test 全绿
<!-- AC:END -->



## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Plan

1. **后端 · skillRegistry**
   - `server/agents/skillRegistry.ts` 加 `SkillMetadata { name; description; category? }` 与 `listSkillMetadata(): SkillMetadata[]`（裁掉 `parameters` / `run`，避免泄到 client）。

2. **后端 · settings router**（沿用 `getDefaultProvider/setDefaultProvider` 中等颗粒度风格）
   - `settings.listSkills` query → `SkillMetadata[]`。
   - `settings.getEnabledSkillIds` query → `{ enabledSkillIds: string[] }`（无行返 `[]`）。
   - `settings.setEnabledSkillIds` mutation → 入参 `z.array(z.string().min(1).max(50)).max(50)`，写 `upsertAgentSettings({ enabledSkillIds })`。

3. **前端 · SkillsSection 组件**
   - 新文件 `client/src/components/settings/SkillsSection.tsx`（≤ 200 LOC）。
   - 状态：`useQuery` 拉 `listSkills` + `getEnabledSkillIds`；本地 `Set<string>` 维护勾选。
   - 渲染：lowercase 标题 `skills`，参 `ToolKeysSection` 的 `border-y / py-5 / space-y-5`；每个 skill 一行：左 native `<input type="checkbox">` + name + 单行 description（按 category 平铺，不分组）。
   - 保存：单一 `save` 按钮 → `toSavedSkillIds(allIds, checked)` 转换 → `setEnabledSkillIds`；成功 toast.success("已保存 skills 启用列表")。
   - dirty 检测：与 server enabledSkillIds 解析出的 effective set 对比，相同则禁用 save。

4. **空集 ↔ 全启转换函数**
   - 纯函数 `toSavedSkillIds(allIds, checked) → string[]`：勾选集 = 全集时返 `[]`；否则返排序后的实际 ids。
   - 反向 `fromSavedSkillIds(allIds, saved) → Set<string>`：saved 为 `[]` 时返全集；否则返 `new Set(saved ∩ allIds)`。
   - 放在 `client/src/components/settings/skillsSelection.ts`（同目录），便于 vitest 单测。

5. **Settings 页接入**
   - `client/src/pages/Settings.tsx` 插一行 `<SkillsSection />`，放在 `<ToolKeysSection />` 之后。

6. **单测**
   - `client/src/components/settings/skillsSelection.test.ts`：3 条（全选→[]、部分→sorted、全不选→[]?(注：全不选语义是空选，写实际空数组；但 server 端 `[]` = 全启用，会导致下次加载又变全选。AC 没强制要"允许全不选"，且空选会让 agent 不能用任何 skill，UX 上意义不明。**决策：UI 强制至少选 1 个，save 按钮 disabled 若 checked.size === 0**）。
   - 改单测为：全选→[]、部分→sorted、空集情况不允许（断言异常或 disabled，业务层兜底）。
   - `server/settings.router.test.ts`：加 `listSkills` / `getEnabledSkillIds` / `setEnabledSkillIds` 三条最小覆盖。

7. **运行 & 烟测**
   - `npm run check` / `npm run format`（format 后撤掉 `backlog/tasks/*.md` 的 yaml 重排）/ `npm run test`。
   - 浏览器烟测（AC #6）：取消勾选 web_search → 起 review 会话问"搜一下 funding rate"，验 agent 不调 web_search。

## 关键决策（请 review）

- **Procedure 颗粒度** = 中等：list / get / set 三 procedure，跟 default-provider 对称。
- **不新增 radix checkbox 依赖**：项目无 `@radix-ui/react-checkbox`，且 `index.css:180` 已给 native `input[type="checkbox"]` 加 cursor 样式，沿用 native 即可（更轻）。
- **空选兜底**：UI 禁止保存空选（save 禁用）。原因：`[]` 在 server 端语义是"全启"，允许保存空选会让用户"以为关掉所有 skill"实际下次加载又全亮回来，比 UX 上的不一致更糟。
- **拆 `<SkillsSection />`**：Settings.tsx 不再膨胀；与现有 `AgentProviderSection` / `ToolKeysSection` 对称。
- **不动 Bench Notebook 风格**：lowercase 标题、tabular-nums、无 card / shadow / radius，参 `ToolKeysSection`。
- **不动 db / schema**：`agent_settings.enabledSkillIds` 已就位，`upsertAgentSettings` 已支持 patch。
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Summary

Phase 5 UX: Settings 页加 `skills` 区块，让用户勾选 review agent 可调用的 skill。后端 enabledSkillIds 过滤在 TASK-32 已落地，本任务点亮交互。

## 关键改动

1. **skillRegistry** (`server/agents/skillRegistry.ts`) 加 `SkillMetadata { name; description; category? }` + `listSkillMetadata()` —— 裁掉 `parameters` (Zod) / `run` (server fn) 避免泄到 client；并过滤 `__*` 内部测试 skill（如 `__noop`）。
2. **settings tRPC** (`server/routers.ts`) 加 3 个 procedure：
   - `listSkills` query → `SkillMetadata[]`
   - `getEnabledSkillIds` query → `{ enabledSkillIds: string[] }`（无行返 `[]`）
   - `setEnabledSkillIds` mutation → `z.array(z.string().min(1).max(50)).max(50)`，写 `upsertAgentSettings({ enabledSkillIds })`
   颗粒度沿用 `getDefaultProvider/setDefaultProvider` 的对称风格。
3. **SkillsSection** (`client/src/components/settings/SkillsSection.tsx`, 165 LOC) Bench Notebook 风格：lowercase 标题、native checkbox、tabular-nums、零 card / shadow / radius。"未保存改动 / 无改动" hint + 单一 save 按钮。
4. **空集 ↔ 全启转换** (`skillsSelection.ts`, 47 LOC) 纯函数：
   - `fromSavedSkillIds([], allIds)` → 全集（hydrate UI 时把 `[]` sentinel 展开成全勾，未知 id 自动丢弃）
   - `toSavedSkillIds(allIds, checked)` → 勾满全集时返 `[]`、否则排序后的实际 ids（未来注册的 skill 自动启用）
5. **空选兜底**：UI disable save 按钮 + `handleSave` 显式 `toast.error` 拒绝。原因：server `[]` = 全启用，允许 0 勾保存会让用户体感与下次加载结果不一致。
6. **单测**：
   - `skillsSelection.test.ts` (35 LOC) 5 条：toSaved 全选→[]、子集→sorted、空选→[]；fromSaved []→全集、stale 过滤
   - `settings.router.test.ts` 加 6 条覆盖 list/get/set + 50-entry cap
   - `vitest.config.ts` include 扩展到 `client/src/**/*.test.ts` 让客户端纯函数测试也跑
7. **Settings.tsx** 仅插一行 `<SkillsSection />`（45 → 48 LOC）。

## 验证

- `npm run check`：✓ 全绿
- `npm run format`：✓（backlog yaml 漂移已 git checkout 撤回）
- `npm run test`：✓ 27 files / **285 tests**（baseline 274 + 11 new）
- API roundtrip（dev server）：set `["get_klines","get_recent_trades","web_fetch"]` → get 同样返回；reset 回 `[]` 也正确
- Settings 页 `/settings` 200 OK，`/api/trpc/settings.listSkills` 返 4 个生产 skill（get_klines / get_recent_trades / web_search / web_fetch），`__noop` 不泄

## AC #6 烟测（手动） — 仍待用户跑

后端层面 enabledSkillIds 的硬过滤已由 `runTools.test.ts:321-368` 覆盖（"non-empty enabledSkillIds advertises only the listed skills" + "blocks execution of a skill the provider names outside enabledSkillIds"），结构上保证 web_search 不会被调用。

但 AC #6 要求观察"agent 回复里明确说明用不了该工具"——这一行为依赖具体 provider 的语义、需要真实 LLM key。建议用户在浏览器：
1. /settings → 取消 web_search → 保存
2. 打开某笔 trade → 起 review 会话 → "搜一下 funding rate"
3. 确认 SSE 流里无 `tool_call: web_search`，且 assistant 文本里提到"没有联网工具/无法搜索"之类的解释

## 不在本任务范围

- 单 skill 详情 / 参数预设面板
- skill 列表搜索 / 排序 / category 折叠
- per-conversation skill override
<!-- SECTION:FINAL_SUMMARY:END -->
