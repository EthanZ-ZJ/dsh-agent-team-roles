# dsh-agent-team-roles

面向 DeepSeek Harness 官方 Agent Teams 运行时的**角色预设 + 自更新角色记忆**插件。

这是一个**伴生插件**：`@deepseek-ai/dsh-experimental-agent-team` 继续负责 roster、成员间消息、共享任务板和成员生命周期；本插件补上官方运行时没有的部分——可复用的角色定义、按角色召唤、以及成员运行中持续更新的“学到规则”层。

## 功能

- **设置里管理角色预设**：每个角色有 id、职责、standing prompt、可选模型路由与推理强度、工具策略、私有技能。
- **按角色召唤**：Lead 调用 `spawn_team_member({ role, prompt })`，而不是官方的临时召唤工具。角色提示词、模型路由、工具策略、技能与已学规则会在成员首轮请求前装进它的 Agent 作用域。
- **自更新角色提示词**：成员或 Lead 通过 `remember_role_rule` / `record_role_feedback` 记录长期要求。规则写入插件的 volatile Config；成员的提示词段在每次组装时重新读取，因此**下一步**就生效，同时持久化给后续实例。
- **规则审阅**：设置页列出已学规则的状态、方向、证据次数和来源，可编辑、提升、停用或删除。
- **`general` 兜底角色**：默认自带且可编辑，处理没有专门角色匹配的任务；移除官方临时出口后仍保留派活能力。
- **移除临时出口**：官方 `spawn_teammate` 被 tool guard 拦截，Lead 被明确要求使用带角色的 `spawn_team_member`。

## 环境要求

- DeepSeek Harness `>=0.2.2-rc.1 <0.3.0`。
- 已启用 Agent Teams profile bundle（`@deepseek-ai/dsh-experimental-agent-team-profile`），它提供本插件组合使用的 Team 服务与工具。
- 具备 Settings 与所需 Client 服务的 Web 或 Desktop profile。

本插件不 fork、不修改官方包，也不依赖 `dsh-agent-team-presets`。

## 安装

从本仓库安装：

```sh
dsh plugin --profile desktop add /absolute/path/to/dsh-agent-team-roles
```

或在 GUI 中 **插件 → 添加插件**，填入本目录绝对路径后安装。bundle patch 会注册一行 `agent-team-roles`。

安装后打开 **设置 → Agent 团队角色**，默认已有 `general` 角色。

## 配置角色

| 字段 | 含义 |
|---|---|
| 角色 ID | 稳定身份，也是默认 teammate 目标；小写 kebab-case，`lead` 保留。 |
| 显示名称 | 给 Lead 与设置页看的名字。 |
| 职责描述 | 一行职责，供 Lead 选人。 |
| 角色提示词 | 成员的 standing persona。 |
| 提供方 / 模型 / 推理强度 | 可选成员路由；提供方和模型都留空则继承当前会话路由。 |
| 工具策略 | `all` 或自定义白名单。自定义策略也会拒绝未列出的作用域 Team 工具。 |
| 私有技能 | 角色技能目录中的技能名；留空表示整个目录全部暴露。 |
| 强调色 | roster 中的角色颜色。 |

Lead 的提示词里会看到当前角色目录，并应使用：

```text
spawn_team_member({ role: "reviewer", prompt: "审查这次改动并报告问题。" })
```

角色已被使用时，目标会自动加数字后缀（`reviewer-2`），后缀会映射回同一个角色。

## 从输入区拉取成员

输入区左侧现在有 **拉取成员** 控件。打开后直接选择角色：

1. 可选填初始任务；留空则用“等待 Lead 分配任务”的默认提示词召唤。
2. 点角色右侧的 **拉取**。
3. 按钮通过现有的 `commands` Remote 执行 `/team-spawn <role> [task]`，**不经过模型回合**；roster 由官方 Team 投影自动更新。

同一个命令也可以从 `/` 菜单或直接输入：

```text
/team-spawn se 分析当前仓库的插件边界，给出实现方案
```

如果 Team 已达到成员上限，错误会直接显示在拉取面板里。

## 面向 Agent 的工具

| 工具 | 可调用者 | 用途 |
|---|---|---|
| `spawn_team_member` | Lead | 按角色召唤成员。 |
| `list_team_roles` | Lead 与所有受管成员 | 读取角色目录。 |
| `create_team_role` | Lead 与所有受管成员 | 创建新的可复用角色。 |
| `update_team_role` | Lead | 更新角色；id 不可改。 |
| `delete_team_role` | Lead | 删除角色；`general` 受保护。 |
| `record_role_feedback` | Lead | 记录某角色的长期要求。 |
| `list_role_rules` / `forget_role_rule` | Lead | 查看或移除已学规则。 |
| `remember_role_rule` / `list_my_rules` | 受管成员 | 学习并读取自己角色的规则。 |

受管成员即使处于自定义工具策略下也能创建角色：`list_team_roles` 与 `create_team_role` 是隐式能力。成员不能更新或删除角色。新建角色在下一次 `spawn_team_member` 时可用。

## 给其他插件：`agentTeamRoles`

Host 暴露一个受信任的进程内服务：

```js
const roles = ctx.get('agentTeamRoles')
await roles.create({ id: 'reviewer', name: 'Reviewer', persona: '审查改动。' })
await roles.update('reviewer', { persona: '严格审查改动。' })
roles.list()          // 含内置 general 的合并目录
roles.get('reviewer')
await roles.remove('reviewer')
```

该服务刻意按“受信任插件 API”设计，不校验调用方 Agent 身份。Agent 侧写入应走上面的工具，由作用域区分 Lead 与成员。写入通过实时配置编辑器持久化，并会出现在设置页。

## 学到的规则

两个工具负责写入：

- `remember_role_rule`：成员记录与自己角色相关的长期要求。
- `record_role_feedback`：Lead 代用户记录某角色的长期要求。

两者都接受 scope：

| Scope | 适用 | 行为 |
|---|---|---|
| `permanent` | “以后”“总是”“永远” | 立即生效并持久化。 |
| `candidate` | 要求可能长期，但尚未确认 | 先保存；重复一次或在设置页确认后转 active。 |
| `session` | “这次”“先这样” | 仅内存生效，不持久化。 |

重复记录同一要求会增加 `evidence`。方向相反的新要求会把旧规则标为 superseded，而不是让两条矛盾指令同时留在提示词里。每个角色最多 40 条持久规则、单条 600 字符；可通过 `list_role_rules` 或设置页停用。

学到的规则**不能**改变角色的工具策略或模型路由；成员也不能修改其他角色的规则。

## 私有技能

角色技能放在：

```text
$DSH_HOME/agent-team-roles/skills/<角色 ID>/
  <技能名>/SKILL.md
  或
  <技能名>.md
```

`SKILL.md` 使用常规 frontmatter：

```markdown
---
name: change-review
description: 在报告前检查 diff 是否有回归。
whenToUse: 改动准备进入审查时。
---
审查这个 diff……
```

技能只会注册到该成员的 Agent 作用域；全局技能仍由部署自身的 skill provider 提供。角色 `skills` 列表为空时暴露整个角色目录，非空时只暴露列出的技能名。

## 已知限制

- **角色 persona 在召唤时冻结**。修改角色基础提示词不会改写已经在运行的成员；下一次召唤才会用新提示词。运行中热更新的是 learned rules 层。
- 自定义工具策略对作用域 Team 工具使用 tool guard 拒绝调用；这些工具仍可能出现在 schema 中，但调用会被拒绝。全局工具还会通过 `ctx.tools.restrict()` 从可见集合移除。
- 成员快照保存在 `$DSH_HOME/agent-team-roles/members.json`；成员结束后仍保留，供冷恢复重建配置。
- 官方 Agent Teams 仍是实验功能；本插件把兼容窗口锁定在 `0.2.2-rc.1` 线。
- 成员、Lead 与插件共享工作目录；规则和角色配置不提供文件系统隔离。

## 开发

```sh
node --test
```

测试覆盖角色归一化、规则证据/提升/冲突逻辑、提示词渲染。安装后的插件会在真实 Agent Teams profile 中验证召唤注入、规则热更新和私有技能。

## 许可证

MIT。
