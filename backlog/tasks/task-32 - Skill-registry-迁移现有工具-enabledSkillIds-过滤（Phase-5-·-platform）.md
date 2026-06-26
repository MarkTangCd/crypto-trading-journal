---
id: TASK-32
title: Skill registry + 迁移现有工具 + enabledSkillIds 过滤（Phase 5 · platform）
status: In Progress
assignee:
  - "@myself"
created_date: "2026-06-26 13:26"
updated_date: "2026-06-26 13:48"
labels:
  - ai-agent
  - phase-5
  - server
milestone: m-0
dependencies: []
documentation:
  - .lavish/trade-review-ai-agent-plan.html
priority: high
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

## Why

Phase 5 plan：`SkillRegistry boot-time 扫描 server/agents/skills/*；Settings 勾选启用；先迁移现有内部工具到 skill 形态；为后续 analyze_market_structure 等留口`。本任务是 Phase 5 的 platform 单切片：把抽象层 + 迁移 + 过滤一并落地，**不**含 Settings UI（留给 TASK-33）。

## Context

- 现状：4 个工具（get_klines / get_recent_trades / web_search / web_fetch）都直接 `register({ name, description, parameters, run })` 进 `server/agents/toolRegistry.ts` 的全局 `REGISTRY`，逐个 import 触发 boot-time 注册。
- `agentSettings.enabledSkillIds: string[]` 列已在 schema (`drizzle/schema.ts:272`)，db `upsertAgentSettings` 支持 patch，但 **没有任何代码读它做过滤**。
- `runTools` 通过 `listToolDeclarations()` 拿全部已注册工具，无过滤。

## 设计

1. **Skill = Tool + 元数据**：
   - 现有 `Tool { name, description, parameters, run }` 作为 Skill 的最小接口；新增 skill 必填 `id`（与 name 同义、稳定 string）、可选 `category: "internal" | "network" | "analysis"` 用于 UI 分组。
   - 不引入新 base class——skill 就是 plain object，与现有 tool 形态兼容。
2. **目录结构**：
   - 新建 `server/agents/skills/`。
   - 4 个现有 tool 文件按 1:1 迁移到 `server/agents/skills/{getKlines,getRecentTrades,webSearch,webFetch}.ts`。原 `server/agents/tools/` 目录最终为空（或留 `searchBackends/` 子目录）。每个 skill module export 一个 named const + boot-time `register()`。
   - **重要**：原 `server/agents/tools/searchBackends/` 仍是 webSearch skill 的内部细节，留在原地（或随 webSearch 搬到 skills/searchBackends/），任选一致。
3. **Registry**：
   - 把 `toolRegistry.ts` 改名为 `skillRegistry.ts`（或保留 toolRegistry + 加一层 skill alias，二选一，倾向 rename + 留 alias `registerTool = registerSkill`）。
   - `listEnabledSkillDeclarations(enabledSkillIds: string[]): ToolDeclaration[]`：当 `enabledSkillIds` 为空数组 → 返全部已注册 skill（**默认全启用**语义，零行为变更）；非空 → 仅返 id 在列表中的 skill。
4. **runTools 改造**：
   - 新增 `enabledSkillIds?: string[]` 参数透到 `runTools`。
   - 上游（`server/reviewAgent.ts`）从 agentSettings 读 `enabledSkillIds` 并透到 `runTools`。
5. **boot-time 扫描**：
   - v0 直接静态 import 4 个 skill 文件 + index.ts barrel（与现状一致）。**不**实现动态文件系统扫描（避免 esbuild bundle 问题；plan 的 "boot-time 扫描" 在 single-tenant 局部 import 等价）。

## Out of scope

- Settings UI（TASK-33）。
- 任何 future skill 的实现（TASK-34/35/36/37）。
- 动态文件系统扫描 / hot reload。
- skill versioning / migration.

## Files

- 新建 `server/agents/skills/{getKlines,getRecentTrades,webSearch,webFetch}.ts`（搬自 tools/）。
- 新建 `server/agents/skills/index.ts`（barrel + 触发所有 register）。
- 改 `server/agents/toolRegistry.ts` → `skillRegistry.ts`，加 `listEnabledSkillDeclarations`、`getSkill`、保留 `getTool` 等老 API 作 alias 兼容现有 import。
- 改 `server/agents/runTools.ts`：接 enabledSkillIds 透传。
- 改 `server/reviewAgent.ts`：读 enabledSkillIds 透到 runTools。
- 删 `server/agents/tools/{getKlines,getRecentTrades,webSearch,webFetch}.ts` + 其测试搬到 `skills/`。
- 改 skill 内部 import 路径（secrets / klines helpers 等相对路径要跟着调）。
- 新建 `server/agents/skillRegistry.test.ts`（如已有 toolRegistry.test.ts 则 rename + 扩 `listEnabledSkillDeclarations` 用例）。

## 烟测

- 老路径：默认 `enabledSkillIds=[]`，agent 调 get_klines / web_search 与 TASK-31 落地后完全等价。
- 新过滤：模拟 `enabledSkillIds=["get_klines"]`，agent 只能调 get_klines；问 "搜一下 BTC funding rate" 应得到 "无相关工具可用" 之类的 fallback。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 server/agents/skills/ 下 4 个 skill 文件落地（迁自 tools/），原 tools/{getKlines,getRecentTrades,webSearch,webFetch}.ts 删除，其他引用处跟随更新
- [ ] #2 skillRegistry 提供 register / getSkill / listSkills / listEnabledSkillDeclarations(enabledSkillIds) 公开 API，保留 register / getTool / listTools / listToolDeclarations 作为兼容 alias
- [ ] #3 listEnabledSkillDeclarations: 空数组 → 返全部 skill；非空 → 仅返 id 在列表中的 skill；未知 id 静默忽略（不报错）
- [ ] #4 runTools 接受 enabledSkillIds? 参数并送进 listEnabledSkillDeclarations；不传 = 默认全启用（零行为变更）
- [ ] #5 reviewAgent.ts 从 agentSettings 读 enabledSkillIds 透传到 runTools，未配置 = 默认全启
- [ ] #6 所有 skill module export 叠加一个 named const（如 getKlinesSkill）供 TASK-33 UI 受例枚使用，同时保留 side-effect register()
- [ ] #7 skillRegistry 新增单测覆盖 listEnabledSkillDeclarations 三条分支，4 个 skill 原有测试跟随迁移后全绿
- [ ] #8 npm run check + npm run format + npm run test 全绿；烟测：默认路径与 TASK-31 完全等价，手动缩到只启一个 skill 时 agent 只能调该 skill
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

## 设计要点

1. **Skill = Tool + 元数据**：在 `skillRegistry.ts` 里定义 `Skill` 接口，继承 `Tool { name, description, parameters, run }`，新增**必填** `id: string`（语义上与 name 同义，作为 UI 稳定枚举键）+ 可选 `category: "internal" | "network" | "analysis"`。`register()` 内部断言 `skill.id === skill.name`，REGISTRY 仍按 `name` 索引（不引第二把钥匙）。
2. **空集 = 全启用**：`listEnabledSkillDeclarations(ids)`：`ids.length === 0` 返全部；非空数组用 `Set.has(skill.id)` 过滤；未知 id 自然落空（不抛错）。
3. **runTools 防御一层**：除了在声明环节过滤，`executeToolCall` 里也比对 `enabledSkillIds` —— 万一某个 provider 把没声明的 tool 名硬塞回来（spec 不该发生但便宜），返 `ok=false { error: "skill not enabled" }`。
4. **默认全启零行为变更**：`enabledSkillIds` 未传 / 传 `[]` / agentSettings 无行 = 等价 TASK-31 落地行为。

## 文件改动

### 新增

- `server/agents/skillRegistry.ts` ← 由 `toolRegistry.ts` 升级而来（rename + 扩 API）。导出 `Skill`, `register`, `unregisterForTest`, `getSkill`, `listSkills`, `listEnabledSkillDeclarations`, `runSkill` + alias `getTool=getSkill / listTools=listSkills / listToolDeclarations=()=>listEnabledSkillDeclarations([]) / runTool=runSkill / registerSkill=register`。
- `server/agents/skills/{getKlines,getRecentTrades,webSearch,webFetch}.ts` ← 1:1 搬迁自 `tools/`；改 import 到 `../skillRegistry`；每个文件新增 `export const xxxSkill: Skill = {...}` 并以同一对象传给 `register()`（id=name，category 按 internal/network 填）。
- `server/agents/skills/searchBackends/{index,tavily,types}.ts` ← 整目录搬过来（webSearch 的实现细节），相对路径 `../../secrets` 仍然有效。
- `server/agents/skills/index.ts` ← barrel：`import "./getKlines"; import "./getRecentTrades"; import "./webSearch"; import "./webFetch";`
- `server/agents/skillRegistry.test.ts` ← 由 `toolRegistry.test.ts` 升级；保留原 6 条用例（仍走 `__noop`），新增 3 条 `listEnabledSkillDeclarations` 分支（空 / 选中 / 未知 id 静默忽略）+ 1 条 `register()` 拒绝 `id !== name` 的用例。

### 搬迁的测试（路径 + import 调整）

- `server/agents/skills/{getKlines,getRecentTrades,webSearch,webFetch}.test.ts` ← 自 `tools/` 搬来；`../toolRegistry` → `../skillRegistry`；`./xxx` 相对 import 不变。
- `server/agents/skills/searchBackends/tavily.test.ts` ← 跟 tavily 一起搬；`../../secrets` 仍生效。

### 修改

- `server/agents/runTools.ts`：`RunToolsParams` 加 `enabledSkillIds?: string[]`；`runOneChatStep` 内 `listToolDeclarations()` → `listEnabledSkillDeclarations(params.enabledSkillIds ?? [])`；`executeToolCall` 接 `enabledSkillIds`，非空且未命中 → ok=false。
- `server/agents/reviewAgent.ts`：`import "./tools"` → `import "./skills"`；`streamUserMessage` 在 runTools 调用前读 `await getAgentSettings(userId)`，把 `.enabledSkillIds ?? []` 透传。
- `server/agents/runTools.test.ts`：`./toolRegistry` import 路径切到 `./skillRegistry`；测试 fixture 加 `id` 字段满足新 Skill 形态；新增 1 条 `runTools` 接 `enabledSkillIds` 时只暴露指定 skill 的用例。

### 删除

- `server/agents/toolRegistry.ts`、`toolRegistry.test.ts`
- `server/agents/tools/`（整目录，含 `searchBackends/`）

## 流程

1. 红：先把 `skillRegistry.test.ts` 写好（含 3 条 listEnabledSkillDeclarations 分支），run 失败。
2. 绿：建 `skillRegistry.ts`，老 toolRegistry 测试转跑通。
3. 搬 4 个 skill + searchBackends，更新 import；删旧。
4. runTools 接 `enabledSkillIds` + 单测；reviewAgent 透传。
5. `npm run check / format / test` 全绿（target 265 + 3-4）。
6. 浏览器烟测：先默认路径验回归；再 SQL 改 enabledSkillIds 验过滤。

## 不在本任务

Settings UI（TASK-33）、新 skill 实现（TASK-34/35/36/37）、动态文件扫描 / hot reload、skill 版本化。

## 设计微调（用户审批后）

- **Skill 接口不单独加 id 字段**，复用 `name` 当 id。`skillRegistry.ts` 顶部 doc comment 写明「skill id = skill.name」。AC #3 的「id」一律解读为 skill.name。`Skill` = `Tool` + 可选 `category`。

- **`executeToolCall` 做二次防御**：接 `enabledSkillIds`，非空且不命中 → `ok=false { error: "skill not enabled" }`。

- TASK-33 UI 之后用 `skill.name` + `skill.category` 枚举。
<!-- SECTION:PLAN:END -->
