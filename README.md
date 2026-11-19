# dsh-agent-team-roles

面向 DeepSeek Harness 官方 Agent Teams 运行时的**通用团队引擎 + 领域模板包**。

这是一个**伴生插件**：`@deepseek-ai/dsh-experimental-agent-team` 继续负责成员名册（roster）、成员间消息、共享任务板和成员生命周期；本插件补上官方运行时没有的部分——可复用的角色定义、按角色召唤、命令级命令策略（denyCommands），以及成员运行中持续更新的“已学规则”层。

**引擎与领域分离**：插件本体（`src/`）只包含对任何领域都成立的机制——召唤与复用、握手协议、工具守卫、并发调度纪律、规则学习；具体流程（谁检视谁、谁先谁后、禁止什么命令）全部是数据，来自内置的 `software-dev` 模板包或你自己编写的模板。不应用任何模板、`leadPlaybook` 为空时，插件退化为纯通用调度引擎，完全可用。

## 功能

- **设置里管理角色预设**：每个角色有 id、职责、常驻提示词（standing prompt）、可选模型路由与推理强度、工具策略、私有技能。
- **按角色召唤**：Lead 调用 `spawn_team_member({ role, prompt })`，而不是官方的临时召唤工具。角色提示词、模型路由、工具策略、技能与已学规则会在成员首轮请求前装进它的 Agent 作用域。
- **自更新角色提示词**：成员或 Lead 通过 `remember_role_rule` / `record_role_feedback` 记录长期要求。持久规则写入插件的 volatile Config；成员的提示词段在每次组装时重新读取，因此**下一步**就生效，同时持久化给后续实例。`session` 规则只存在内存中。
- **规则审阅**：设置页列出已学规则的状态、证据次数和来源，可修改状态与内容、停用或删除；方向（polarity）只能在新增规则时选择。
- **`general` 兜底角色**：默认自带且可编辑，处理没有专门角色匹配的任务；移除官方临时出口后仍保留派活能力。
- **移除临时出口**：官方 `spawn_teammate` 被工具守卫（tool guard）拦截，Lead 被明确要求使用带角色的 `spawn_team_member`。
- **Team Lead 预设**：插件自带一个 `team-lead` Agent 预设（调度型 Leader），并在左侧主导航提供 **Agent 团队角色** 入口。手动拉取成员只在 Team Lead 预设的会话中开放。

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
| 职责描述 | 一行职责，供 Lead 选人；最长 200 字符。 |
| 角色提示词 | 成员的常驻人设（persona）；最长 12000 字符。 |
| 提供方 / 模型 / 推理强度 | 可选成员路由；提供方和模型必须同时填写或同时留空，都留空则继承当前会话路由。 |
| 工具策略 | `all` 或自定义白名单。自定义策略也会拒绝未列出的作用域 Team 工具。 |
| 私有技能 | 角色技能目录中的技能名；留空表示整个目录全部暴露。 |
| 强调色 | 成员名册（roster）中的角色颜色。 |

Lead 的提示词里会看到当前角色目录，并应使用：

```text
spawn_team_member({ role: "reviewer", prompt: "审查这次改动并报告问题。" })
```

如果该角色已有**未失败**（`status` 不是 `failed`）的成员，命令会复用该成员，不会重复创建。只有该角色没有未失败成员时才新建；名字已被占用时会加数字后缀（`reviewer-2`），后缀会映射回同一个角色。

### 高级配置

`freshProvider` / `forkProvider` 决定 fresh / fork 成员使用的子 Agent 后端（默认分别为 `spawn` / `fork`）。这两项不在设置页中，只能在插件配置（profile 配置）里修改。

### 内置角色目录

bundle patch 预置以下角色（均可编辑或删除）：

| 角色 | id | 工具策略 | 职责 |
|---|---|---|---|
| General | `general` | 全部工具 | 未匹配专门角色的通用任务。 |
| 产品经理 | `pm` | 只读 + 汇报 | 需求分析、用户场景、体验取舍；产出需求文档文本，不定义技术方案。 |
| SE | `se` | 只读 + 文档写入 | 架构/契约负责人：维护 `docs/architecture.md`、接口契约与 ADR；可写 docs/ 与接口/类型定义文件，无 shell。 |
| DEV | `dev` | 读写 + 终端 | 按 SE 契约实现；动手前先读契约，完成后报告改动与检查结果。 |
| TSE | `tse` | 读写 + pwsh | 设计并执行测试、报缺陷；只写 `tests/` 目录，不改生产代码。 |
| CR | `cr` | 只读 + 汇报 | 代码检视人：对照契约逐项核对 diff，产出缺陷报告；fresh 召唤、不改任何文件。 |

检视流程：diff 完成后由 Lead **并行派发 CR（静态检视）与 TSE（动态测试）**，两者独立执行、互不等待；缺陷由 Lead 派回 DEV 修复，修复后重新走 CR + TSE。

## 从输入区拉取成员

输入区左侧的 **拉取成员** 控件**只在 Team Lead 预设的会话中显示**；其他预设会话会隐藏该控件，`/team-spawn` 命令也会被拒绝。打开后直接选择角色：

1. 可选填初始任务；留空则走**纯握手**：成员只回复 `READY`，不分析、不提问、不调用工具、不写报告。Lead 通过成员名册知道成员已就位即可。
2. 成员的 `READY` 结算通知不会投递给 Lead（握手创建使用调用方（caller）投递），不会把 Lead 唤醒去做无用的验证；如果同时有真实用户消息，仍会正常处理。
3. 点角色右侧的 **拉取**。如果该角色已经有未失败成员，命令会复用它而不是重复创建；填了任务就发给该成员，握手拉取则不发消息。
4. 按钮通过现有的 `commands` Remote 执行 `/team-spawn <role> [task]`，**不经过模型回合**；成员名册由官方 Team 投影自动更新。

Lead 的系统提示里还有一段动态的 **Active team members**：每个已拉取成员的名字、角色、一句职能和状态，每一步重新生成。因此 Lead 不用被唤醒、也不用额外调用 `list_agents` 就能知道谁已存在、能做什么，并被明确要求把任务交给他们而不是重复创建。

同一个命令也可以从 `/` 菜单或直接输入：

```text
/team-spawn se 分析当前仓库的插件边界，给出实现方案
```

如果 Team 已达到成员上限或命令失败，错误会直接显示在拉取面板里。

## Team Lead 预设

插件 bundle 自带一个 `team-lead` Agent 预设，安装后出现在新建会话的预设列表中：

- **定位**：调度型 Leader——拆分任务、派发给成员、传递结果；不亲自实现、不亲自验证。
- **调度规则**：先并发派发所有独立任务，派完即结束回合，不阻塞等待；只有在下一步确实依赖某个成员结果时才 `wait_agent`，且超时不超过 30 秒。
- **兜底工具**：预设包含文件读写（`tool-fs`）、搜索（`tool-fs-search`）与终端（Windows 为 `tool-pwsh`）。默认仍以派发为主；只有成员明确报告权限不足阻塞任务、或用户要求 Leader 直接处理时，才用这些工具做最小必要的排查或落盘。
- **注入边界**：角色目录、成员描述等团队信息只注入 Team Lead 预设的会话；其他预设会话是干净的普通工作会话，没有团队调度内容，也不能拉取成员。

左侧主导航中的 **Agent 团队角色** 入口打开同一个角色管理页（角色编辑 + 历史记忆），无需进入设置。

## 团队模板包

模板 = 角色目录 + Lead 编排 playbook + 私有技能，作为纯数据分发，可携带任意领域流程。

### 目录结构

```text
$DSH_HOME/agent-team-roles/templates/<模板 id>/
  template.json          # 模板描述（必需）
  skills/<角色 id>/       # 可选：该模板角色的私有技能
    <技能名>/SKILL.md
```

### template.json schema

```json
{
  "id": "software-dev",              // 必需；小写字母开头的 kebab-case，≤64 字符
  "name": "Software Development Team", // 必填
  "description": "……",               // 可选
  "leadPlaybook": "……",              // 可选；应用后追加到 Lead 提示词
  "roles": [ /* 同设置页角色结构，可含 denyCommands */ ],
  "gates": [ /* 同设置页闸门结构；应用时合并，同 id 覆盖，总条数 ≤50 */ ]
}
```

`roles` 复用角色的 `normalizeRole`/`validateRole` 校验：任一角色非法即整个模板无效，发现的坏模板会被跳过（不报错、不影响其它模板）。

### 内置模板

插件激活时把包内 `templates/software-dev/` **播种**到状态目录（只创建缺失目录，永不覆盖用户改动）。因此内置模板后续更新（例如新增 gates）不会自动写入已有状态目录；需要删除 `<stateDir>/templates/<id>/` 后重载插件重新播种。`software-dev` 是软件开发部模板：PM/SE/DEV/TSE/CR 五角色 + 并行检视 playbook + 两条提交前闸门；DEV 与 TSE 带 `denyCommands` 禁止 `git push`。

### 应用模板

Team Lead 会话中使用命令：

```text
/team-template list          # 列出发现的模板
/team-template apply software-dev
```

`apply` 做四件事：把模板 roles **upsert** 进角色目录（已有的更新、缺失的创建）；设置 `activeTemplate` 使其 playbook 生效（覆盖 `leadPlaybook` 配置）；把模板 `gates` 合并进现有闸门列表（同 id 覆盖并回报 `replaced`；只校验模板自身 gates，合并后超过 50 条或模板 gate 非法则整次拒绝、不写入；现有列表里的非法 gate 原样保留、计入上限并在成功文本里以 `warnings:` 回报）；把模板 `skills/<角色 id>/` 合并复制到 `stateDir/skills/<角色 id>/`（覆盖同名文件，不删除其它文件）。gates 校验在任何写操作之前完成。

## denyCommands：命令级策略

角色可选字段 `denyCommands` 是一个 RegExp source 数组（≤20 条，单条 ≤200 字符，必须能编译为正则）。成员以该角色运行时，调用 `bash` / `pwsh` 且 `command` 参数命中任一模式即被拒绝，错误信息包含角色 id 与命中的规则。

- **独立于工具白名单**：`toolMode: all` 与 `custom` 都生效。典型用法——DEV/TSE 有终端工具但禁止 `git push`（推送由 Lead 流程统一处理）。
- 只匹配 shell 命令参数；其它工具不受影响。
- 非 Team 成员不受该策略影响；策略数据属于角色定义，可在设置页对应的角色 JSON 中维护。

## 工序闸门（gates）

denyCommands 是**无条件**拒绝；gates 是**有状态的条件拒绝**：角色 R 执行操作 X 前，必须存在一份由角色集合 Y 最近产生、未过期且未被作废的“钥匙”事件 E，否则调用被拒。

### 三要素模型

```json
{
  "id": "review-before-commit",
  "description": "可选的人类可读说明，/team-gates 展示用",
  "deny": {
    "role": "dev",
    "tool": ["bash", "pwsh"],
    "commandPattern": "\\bgit(\\.exe)?\\s+commit\\b"
  },
  "require": {
    "event": "review-approved",
    "byRoles": ["cr"],
    "freshFor": 14400,
    "invalidateOn": { "role": "dev", "tool": ["write", "edit"] }
  }
}
```

- `deny.role` / `deny.tool`：拦谁、拦哪个工具（1–8 个）。带 `commandPattern` 时只拦匹配的 shell 命令；不带时整工具拦截（write/edit 类）。
- `require.event` + `byRoles`：钥匙事件名与可产生钥匙的角色（1–8 个）。
- `freshFor`：秒；缺省表示永久有效，直到被作废。
- `invalidateOn`：当匹配角色使用匹配工具成功后，清空该团队已记录的事件（改码即让旧批准失效）。
- 或者用 `require.commandSuccess = { role, tool, pattern }`：以“某角色成功执行了匹配命令”为钥匙，与 `event` 二选一。

### 两个事件源

1. **上报工具** `report_gate_event({ event, note? })`：任何受管成员都可调用（隐式工具，不受白名单影响）。安全性由评估器保证：事件只有在产生者角色 ∈ 该 gate 的 `byRoles` 时才算数，无关角色发的事件是废纸。
2. **命令成功**：`require.commandSuccess` 配置后，post-execute 监听器在匹配命令成功返回时自动记账。

### /team-gates 命令

Team Lead（且 Team Lead 预设会话）可用：

```text
/team-gates list                 # 每条 gate 一行：状态、deny 摘要、require 摘要
/team-gates status               # 实时钥匙状态：最新事件由谁在何时产生、是否过期/不存在
/team-gates enable <id>
/team-gates disable <id>
```

### 与 denyCommands 的关系

| 机制 | 条件 | 数据位置 |
|---|---|---|
| denyCommands | 无条件：命令匹配即拒 | 角色字段 |
| gates | 有状态：缺少合格事件才拒 | Config.gates（设置页保存或模板 apply 写入） |
| 解析请求 | 一次性的自然语言描述 | Config.gateParseRequest（volatile，解析完成即清空） |
| 解析结果 | 解析草稿，供设置页回填 | Config.gateParseResult（volatile，展示期 10 分钟） |
| 解析审计 | 精确模型输入/输出 | `$DSH_HOME/agent-team-roles/gate-parse-audit.jsonl`（>1 MiB 轮转） |

### 已知限制

- **内存态**：事件不持久化，宿主重启即清空，所有闸门回到“未满足”——刻意的安全默认。
- **fail-open**：评估器内部异常时放行并记 warn 日志；只有配置合法且状态明确不满足才拒绝。
- **单事件条件**：v1 不做 AND/OR 组合、分支或编排 DSL；多条 gate 各自独立（对同一调用可能依次拒绝，理由分别说明）。
- **事件源有限**：任务板事件、消息、文件变更暂不作为事件源；只有上报工具与命令成功两种。
- **仅受管成员**：没有 Team 成员身份或角色解析失败时直接放行。
- **作废粒度**：事件不携带工具信息，`invalidateOn` 命中即清空整个团队的事件桶。
- **空配置零行为**：`gates` 为空时 pre/post-execute 监听器立即返回，不引入可感知开销。
- **解析事件兜底**：宿主以 `settings/document-updated` 事件为主路径；事件丢失时客户端在 thinking 期间每 2 秒重读一次配置作为兜底，超时 90 秒后提示重试；超时/取消会清空请求与结果并停轮询。宿主日志与审计行以 `started via event|poll`（审计字段 `source`）标注实际路径。
- **解析结果保留窗口**：`gateParseResult` 不会自动清理，会留在 profile 配置中直到下一次请求、已采用后的保存或用户点「忽略」；设置页只展示 `completedAt` 在 10 分钟内的结果，过期需重新解析。
- **旧 Host 降级**：若运行中的宿主版本没有 `gateParseRequest`/`gateParseResult` 字段，设置页会禁用「用自然语言新增」（`gateAiUnavailable`），手动新增/编辑/保存路径不受影响。
- **读侧自检**：配置里存在评估器会静默跳过的 gate（非法字段、重复 id）时，宿主在 pre/post-execute 读取侧每 id 每进程 warn 一次，但不阻断调用（fail-open）。

### 用自然语言创建闸门（设置页）

设置 → Agent 团队角色 → 引擎 → 工序闸门 →「用自然语言新增」：输入一句描述，例如
「dev 提交前必须由 cr 检视批准，dev 再改代码就失效」，点「解析」。

1. 客户端把描述写入本插件 Config 的 `gateParseRequest`（volatile），宿主收到 `settings/document-updated` 后用**部署默认模型**（`agentDefaultModel`）做一次辅助请求；没有默认模型时返回 `no-route`，可继续用手动表单。
2. 宿主把结构化结果写回 `gateParseResult` 并**原子清空请求字段**；结果只回填到设置页的本地列表，点顶部「保存」才写入 `gates`。
3. 解析结果最多 5 条、展示期 10 分钟；点「采用 / 全部采用」进入本地草稿，可再编辑；「忽略」只丢弃该条预览。

**数据与隐私**：

- 用户原文会短暂写入 profile 配置的 `gateParseRequest.text`，解析完成后立即清空；`gateParseResult` 不含原文。
- 宿主把这次辅助请求的**精确输入/输出**追加到 `$DSH_HOME/agent-team-roles/gate-parse-audit.jsonl`（本地文件，超过 1 MiB 轮转到 `gate-parse-audit.1.jsonl`），与 session 日志同一信任边界；如不需要该审计记录，可在解析后自行删除。
- 解析请求/结果都是惰性数据：不执行命令、不改角色、不写入 `gates`；角色引用必须是当前角色目录中的 id，且不允许 `lead`。

契约与边界（错误码、字段、TTL、提示词）见 [`docs/gates-nl-ui-contract.md`](docs/gates-nl-ui-contract.md)。

## 面向 Agent 的工具

| 工具 | 可调用者 | 用途 |
|---|---|---|
| `spawn_team_member` | Lead | 按角色召唤成员。 |
| `list_team_roles` | Lead 与所有受管成员 | 读取角色目录。 |
| `create_team_role` | Lead 与所有受管成员 | 创建新的可复用角色。 |
| `update_team_role` | Lead | 更新角色；id 不可改。 |
| `delete_team_role` | Lead | 删除角色；`general` 受保护。 |
| `record_role_feedback` | Lead | 记录某角色的长期要求。 |
| `list_role_rules` / `forget_role_rule` | Lead | 查看已学规则；forget 将规则退役（superseded），保留在历史中，不再进入提示词。 |
| `remember_role_rule` / `list_my_rules` | 受管成员 | 学习并读取自己角色的规则。 |

受管成员即使处于自定义工具策略下也能保留一组隐式能力：`remember_role_rule`、`list_my_rules`、`list_team_roles`、`create_team_role` 与 `skill`。成员不能更新或删除角色。新建角色在下一次 `spawn_team_member` 时可用。

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

两者都接受范围（scope）：

| 范围 | 适用 | 行为 |
|---|---|---|
| `permanent` | “以后”“总是”“永远” | 立即生效并持久化。 |
| `candidate` | 要求可能长期，但尚未确认 | 先保存；重复一次、以 `permanent` 再记录一次，或在设置页确认后转为生效（active）。 |
| `session` | “这次”“先这样” | 仅内存生效，不持久化。 |

重复记录同一要求会增加证据次数（evidence）。方向相反的新要求会把旧规则标为已取代（superseded），而不是让两条矛盾指令同时留在提示词里。每个角色最多 40 条未取代的持久规则、单条 600 字符。`forget_role_rule` 与设置页中的退役都只是把规则标记为 `superseded` 保留在历史里；只有设置页“规则”标签中的手动删除才会物理删除。

已学规则**不能**改变角色的工具策略或模型路由；成员也不能修改其他角色的规则。

**角色规则只存角色的长期行为**（工作方式、边界、上报流程）。项目相关事实——品牌名、域名、数据模型、环境、版本、文件路径——不要写进角色规则或角色提示词；它们属于项目记忆库（`memory_capture`），否则会污染该角色在所有项目中的提示词。

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

技能只会注册到该成员的 Agent 作用域；全局技能仍由部署自身的 skill provider 提供。角色 `skills` 列表为空时暴露整个角色目录；非空时按技能 frontmatter 的 `name` 匹配（没有 frontmatter 时用文件名），只暴露列出的技能。

## 已知限制

- **角色人设（persona）实时生效**。成员的提示词段在每次组装时读取当前角色定义；编辑角色后，已存在的成员在下一步即生效，无需重新召唤。创建时的快照仅在角色被删除后作为回退。
- 自定义工具策略采用**工具守卫（guard）逐次拒绝**：白名单外的工具调用会失败并返回 `Tool "x" is not allowed by role "<id>"`。工具可见性交给所在 Agent 预设，因此成员（standard 预设）始终能看到 `read/glob/grep/write/edit` 等基础工具，是否可用由角色白名单决定。
- 设置页的角色编辑区提供**历史记忆**：按角色列出全部规则（生效/候选/已退役）及其时间、证据与来源；退役不删记录。
- 成员快照保存在 `$DSH_HOME/agent-team-roles/members.json`；成员结束后仍保留，供冷恢复重建配置。
- 设置页当前不校验职责描述与角色提示词的长度上限；超长内容可能保存成功，但召唤成员时会因校验失败而报错。
- 设置页的技能目录提示固定显示 `~/.dsh/agent-team-roles/...`；若自定义了 `DSH_HOME`，请以本文档中的 `$DSH_HOME` 路径为准。
- 官方 Agent Teams 仍是实验功能；本插件把兼容窗口锁定在 `0.2.2-rc.1` 线。
- **`cordis.patch.yml` 的 `config.roles` 只在全新安装时生效**。已安装 profile 的角色目录存在 volatile Config 里，patch 不会覆盖它；更新内置目录需要通过设置页修改，或卸载后重装 bundle。
- 成员、Lead 与插件共享工作目录；规则和角色配置不提供文件系统隔离。

## 开发

```sh
node --test
```

测试覆盖 8 个测试文件：`tests/config.test.js`（角色归一化与校验）、`tests/rules.test.js`（规则证据/提升/冲突/上限/退役）、`tests/prompts.test.js`（提示词渲染）、`tests/spawn.test.js`（复用/后缀/失败回滚/握手投递/standard 预设）、`tests/plugin.test.js`（握手识别/角色解析/预设门控）、`tests/store.test.js`（RoleStore 持久化）、`tests/tools.test.js`（工具 schema 与参数校验）、`tests/preset.test.js`（Team Lead 预设组装）。`src/skills.js` 以及 `RuleStore` 的 session/回退路径目前没有直接单测。插件本体已在真实 Agent Teams profile 中做过手工验证（召唤注入、规则热更新、私有技能）。

## 许可证

MIT。
