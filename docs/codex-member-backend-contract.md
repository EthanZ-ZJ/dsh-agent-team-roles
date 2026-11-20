# Codex 成员后端契约 v3.1（勘误版 · 实施依据）

> **本文件为实施依据（single source of truth）。** DEV/TSE/CR 以本文件为准；调研证据见文末附录 A。
> 版本：v3.1（2026-11-20，勘误版）。v3 的 D1/D2/D4/D5/D7 全部有效；v3.1 按 runner `5655982` 的实现事实对齐勘误，不改安全边界。
> 范围：`dsh-agent-team-roles` 插件，仅 host 侧 + 设置页字段；**不改 `app.asar`、不 fork 平台包**。
> 结论：`backend:'codex'` 采用 **影子/代理成员**（名册实体 = 原生 local 中继成员，执行体 = 本机 `codex exec`）。
> v3 关键边界：**Codex 成员及其内部命令不受闸门（gates）与 `denyCommands` 约束**——这是用户明确选择的安全边界；不再转译命令策略、不生成 `.rules`、不写用户级 rules。
> v3.1 关键勘误：resume 沙箱只沿线程、不注入；删除后端枚举式沙箱覆盖与 `.cmd`；实现名对齐 `detectCodexBinary`/`buildExecArgv`/`buildResumeArgv`/`parseJsonl`/`runTask`；runner 14 内部码固定映射到工具层 9 码；登录预检/探测缓存归接线层；`-o` 由 runner 生成/清理；`--ignore-user-config` 为 runner 内部固定 true；auto 在 `provider-unreachable`/fast 超时且 `!sawEffectiveTurn` 时回落一次；错误码 9、文案键 39。

---

## 0. 不可变约束（平台事实，设计前提）

1. `agent-team` 创建成员时**恒传 `childId`**；外部后端（`startExternal`）一次性、不可 `send_message` 寻址、名册恒 `inactive`，且**没有** attach/adopt 接口。成员本体不能是 `codex.exe`。
2. 名册状态来自活 `Agent`（`ctx.agents.get`），不是 Codex 进程状态。
3. 平台没有 Codex CLI 适配层；`app.asar` 里的 `codex` 是模型 provider，不是 CLI。
4. **runner 用 `node:child_process` 自管 child（最终形态，不切回 `ctx.subprocess`）**；必须过滤 env：**不裸传 `process.env`**，剔除 `*_TOKEN`/`*_KEY`/`*_SECRET` 等敏感变量，只透传 `PATH`/`CODEX_HOME`/`HOME`/`USERPROFILE`/`TEMP`/`TMP` 等必要项。
5. `ctx.subprocess` 与 `ctx.llm` 均属于**可选能力**：codex runner/成员不依赖它们，缺失不影响 codex 路径；若接线层其它功能需要而缺失，必须显式报错（不得静默降级/崩溃）。
5. Codex 内部 shell **不经过 DSH 工具管线**；因此 DSH gates/denyCommands 无法观察或拦截其内部命令（见 D7）。

**因此**：v3 只允许影子成员；任何“成员本体就是 codex.exe”的实现都超出契约。

---

## 1. 决策记录（Lead 裁决）

### D1 — 影子成员：采纳

- 名册/消息/快照/`spawnTeammate` 调用契约复用现有代码；
- 名册实体是原生 local 成员；执行体是 `codex exec`；
- UI/文档如实写“执行后端：Codex CLI；名册实体是中继成员”。

### D2 — 沙箱默认：完全放开（按用户明确选择）

- 全局 `codexSandbox` 默认 **`danger-full-access`**（含联网、装依赖、改任意文件）；
- 允许**每角色覆盖** `codexSandbox`（`workspace-write` / `read-only` / `danger-full-access`），优先级见 §3.5；
- 设置页字段旁常驻说明：**“完全放开 = 可能自主联网/装包/改任意文件”**；
- 折叠后仍可见档位摘要（标题行）；风险句在总开关关闭时灰显但**不可隐藏**；
- arch 推荐的 `workspace-write` 作为“事后收紧推荐值”写进文档/UI hint，但默认值按 D2 不改。

### D4 — Transport：auto / fast / default

- 125s 的根因是 WebSocket 4 次重连超时（约 110s）后回落 HTTPS，不是模型慢；
- 新增 `codexTransport: 'auto' | 'fast' | 'default'`，默认 **`auto`**；
- `fast` 注入自定义 provider（`supports_websockets=false`，端点 `https://chatgpt.com/backend-api/codex`）；
- `auto`：先 fast；**当 fast 失败为 `provider-unreachable` 或 fast 超时，且 `!sawEffectiveTurn` 时**回落 default 一次；其它错误或已进入有效回合不回落；回落耗时计入总超时；
- `auto`/`fast` 默认 fast 尝试 **90s**；回落 `default` 默认 **180s**；
- `error` 事件中的 `Reconnecting...` **不算失败**，不触发回落；
- fast 路径不可用（端点变更/401 等不可重试错误）→ 交工具层 `CODEX_EXIT_NONZERO` 的 `reason:'provider-unreachable'`（提示改用 `default`）；不反复重试；`auto` 仅在 `!sawEffectiveTurn` 且上述错误/超时下回落一次；
- 实测：简单答复 14.4s、带 shell 18.1s、resume 16.0s（fast）。

### D5 — 本机 `workspace-write` 不可用：保留档位但 UI 标注

- 沙箱默认仍 `danger-full-access`（D2）；
- `workspace-write`/`read-only` 保留；
- **本机实测 `workspace-write` provisioning 失败**（elevated 沙箱不可用），所有 shell 返回 `rejected: blocked by policy`；`danger-full-access` 正常。这是**本机环境限制，不是插件 bug**；
- UI 必须在该档旁标注：“本机沙箱不可用时该档会拒绝所有命令”；
- resume 不能改沙箱（见 §5.2）；档位变化时轮换新线程。

### D7 — 外部 Agent 豁免（用户明确选择的安全边界）

- `executor:'codex'` 的成员**不参与 gate 评估**：包括 `deny.tool:['codex_exec']` 之类的规则也**不生效**；
- 不受角色 `denyCommands` 约束；**不再转译/生成 execpolicy、不写 `.rules`、不写用户级 rules**；
- Codex 内部命令天然不经过 DSH 工具管线，因此也不受 gates/denyCommands 约束；
- 这是用户明确选择的安全边界；README 与设置页各留一句可读说明（不是警告弹窗）：
  **“Codex 成员及其内部命令不受闸门与命令拒绝策略约束”**；
- `codexBadge` 成为用户唯一可辨识信号；`codexBadgeHint`（徽章 tooltip）必须表达“**外部 Agent·不受闸门约束**”；tooltip 不得暗示 running。
- 若需要强制限制，**只能依靠 Codex 自身的 sandbox 级别**（`danger-full-access` / `workspace-write` / `read-only`），**不要指望 DSH 闸门**；
- **D3/D6 撤销**：v1 的 `denyCommands` 转译、v2 的 prefix 近似方案均不再实施；相关键与验收项删除。

### 副作用说明（README 必写）

- **安全边界**：Codex 成员及其内部命令不受 DSH gates / `denyCommands` 约束；只有沙箱档位提供隔离。
- **凭据可读**：Codex 子进程可读 `~/.codex/auth.json`；完全放开档位下提示注入可能外泄凭据。
- **性能**：fast 路径约 14–18s；`default` 回落可能回到约 125s。成员不适合高频小任务。
- **唯一信号**：`codexBadge`（Codex 驱动（外部 Agent））+ `codexBadgeHint` tooltip（外部 Agent·不受闸门约束）是用户辨识代理执行体的主要方式。

---

## 2. 术语与架构

| 术语 | 含义 |
|---|---|
| 中继成员 | 原生 DSH local 成员，standard preset；只负责转给 `codex_exec` 并回报 |
| 影子成员 | 中继成员在名册中的实体；真实执行体是 Codex 进程 |
| Codex 线程 | `codex exec` 的 `thread_id`；续跑用 `codex exec resume <thread_id>` |
| 执行轮 | 中继成员的一次 `codex_exec` 调用 = 一次 Codex 进程 |
| 外部 Agent 豁免 | D7：codex executor 不参与 gates/denyCommands |

```
Lead ──spawn_team_member(role:'dev', backend:'codex')
        └─ ctx.agentTeams.spawnTeammate(provider:'spawn', context:'fresh')  ← 原生 local 成员
              └─ 中继 Agent（standard preset；工具 = codex_exec + 协作工具）
                    └─ codex_exec
                          └─ node:child_process.spawn(codex.exe, exec/resume args, cwd)
                                └─ JSONL → text + command_execution 摘要
```

---

## 3. 配置契约

### 3.1 全局 Config 字段（`src/plugin.js`）

| 字段 | 类型 | 默认 | 约束 | 说明 |
|---|---|---|---|---|
| `codexBackend` | boolean | **`false`** | — | 总开关。`false` 时 spawn `backend:'codex'` 与已存在的 codex 成员下一次 `codex_exec` 均返回 `CODEX_DENIED_BY_CONFIG`（reason `disabled`）；字段仍可编辑（灰显） |
| `codexBinary` | string | **`''`** | `''` 或**绝对路径**；≤1024 字符 | 空 = 自动探测（§3.3）；非空 = 必须存在、大小 >0、可执行，否则 `CODEX_CLI_NOT_FOUND` 且**终态不回退** |
| `codexModel` | string | **`''`** | `''` 或 ≤200 字符 | 空 = 不传 `-m`；非空 = `-m <model>`。resume 时建议 pin 一致模型，避免 recorded/resuming 警告 |
| `codexSandbox` | string enum | **`danger-full-access`** | `read-only` / `workspace-write` / `danger-full-access` | 全局档位；D2/D5。非法值 → `CODEX_DENIED_BY_CONFIG`（reason `invalid-sandbox`） |
| `codexTransport` | string enum | **`auto`** | `auto` / `fast` / `default` | D4。`auto` = fast 失败回落 default；`fast` = 只 fast；`default` = 不注入 fast provider |
| `codexTimeoutMs` | number | **`0`** | `0` 或整数 `30000..1800000` | **`0` = 使用 transport 预算**（auto 270s = fast 90 + fallback 180；fast 90s；default 180s）；**正数 = 用户总预算**（覆盖默认总预算；fast/fallback 仍受剩余预算约束） |
| `codexExtraArgs` | string[] | **`[]`** | ≤20 项、每项 ≤200 字符；见 §3.4 | 逃生口；不得覆盖受控参数 |

所有字段 `volatile()`；设置页可编辑；写入前按完整 Config 校验。

> `codexTransport` 不新增 i18n 键：设置页若展示，选项直接显示技术值 `auto / fast / default`，说明由 `codexSectionHint` 覆盖（§9.2 计数据此保持 39）。

### 3.2 每角色字段（`RoleSchema` / `src/config.js`）

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `codexSandbox` | string | **`''`**（继承全局） | 角色级覆盖；仅接受三个枚举值；空 = 继承。设置页下拉：`codexSandboxOptionInherit` / `ReadOnly` / `Workspace` / `Full` 中文名，不暴露枚举原文 |

`normalizeRole` 增加该字段（trim、空 → ''）；`validateRole` 校验枚举；角色 `tools`/`toolMode`/`provider`/`model`/`skills`/`denyCommands` 对 codex 后端**不生效**（§4.3、D7），但保留字段以兼容原生后端。

### 3.3 `codexBinary` 自动探测（5 级，固定顺序）

空 `codexBinary` 时按以下顺序解析；**配置路径失败为终态，不回退**；其余每级失败进入下一级；全部失败 → `CODEX_CLI_NOT_FOUND`，detail 列出已尝试路径。

1. **配置路径（终态）**：`codexBinary` 非空 → 必须是绝对路径、≤1024 字符，校验存在、**文件大小 >0**、可执行（Windows 文件；POSIX `X_OK`）；Windows 若扩展名是 `.cmd`/`.bat` → `CODEX_DENIED_BY_CONFIG`（v3.1 只接受 `codex.exe`，不包装 cmd.exe）。任一失败即返回 `CODEX_CLI_NOT_FOUND`/配置错误，**不继续探测**。
2. **环境变量**：`CODEX_CLI_PATH`（进程环境；同样校验存在/大小/可执行）。
3. **WindowsApps 版本化目录**（仅 Windows）：
   - 枚举 `C:\Program Files\WindowsApps\OpenAI.Codex_*_x64__2p2nqsd0c76g0\app\resources\codex.exe`；
   - 对 `OpenAI.Codex_<version>_...` 的 `<version>` 做数值段比较，**降序取第一个存在且大小 >0 的 `codex.exe`**；
   - **跳过 0 字节 alias**：同目录的 `codex-*.exe` 是 0 字节别名，**不得使用**；
   - 目录不可读时回退 `Get-AppxPackage -Name OpenAI.Codex` 取 `InstallLocation`；仍失败进入下一级；
   - 禁止硬编码版本号。
4. **PATH / 常见安装位置**：`where.exe codex` / `which codex`；同时检查 `codex.exe`（Windows）与 `~/.local/bin/codex`（POSIX）；解析结果同样要求大小 >0；**不要只用 `Get-Command codex`**（会命中不可用 alias）。
   - **不探测 `.cmd`**：Node `spawn` 在 `shell:false` 下无法直接执行 `.cmd`；Windows 只接受 `codex.exe`。npm 安装用户需在 `codexBinary` 手动配置真实的 `codex.exe` 绝对路径；v3.1 不包装 `cmd.exe /c`。
5. **失败**：`CODEX_CLI_NOT_FOUND`。

> 探测实现名：`detectCodexBinary(options)`（纯函数/无状态，依赖注入 fs/env/平台）；**60s 缓存属于接线层**，runner 不缓存。设置页“检测”强制刷新。

### 3.4 `codexExtraArgs` 受控参数（禁止列表写死）

**受控参数禁止列表（封闭，逐项匹配）**：

```
-s, --sandbox, --full-auto, -a, --ask-for-approval,
-C, --cd, --add-dir,
-c, --json, -o, -m,
exec, resume, --help, --,
任何不以 "-" 开头的 token
```

以下任一出现即 `CODEX_DENIED_BY_CONFIG`（reason `forbidden-arg`，detail 指出违规参数），**不启动进程**。该列表是封闭集合；runner 的 `validateExtraArgs` 按此实现。

- `--` 由 runner 作为 prompt 分隔符自动生成，**用户 `codexExtraArgs` 中出现 `--` 仍拒绝**（§5.2）。
- 需要值的 flag 必须写成 `--flag=value`，不拆成两个 token。
- 允许示例：`['--color=never']`（若该版本支持）；其余未列入列表的参数是否可用由 runner 白名单/实测决定，不得覆盖上述受控项。

### 3.5 沙箱优先级与本机限制（D5）

```
role.codexSandbox（非空）
  > Config.codexSandbox
  > 默认 danger-full-access
```

- **sandbox 必填**：runner 收到缺失/空 sandbox → `CODEX_DENIED_BY_CONFIG`（reason `invalid-sandbox`）；默认值由**配置层**解析（global 默认 `danger-full-access`），**runner 不硬编码默认值**。
- 新建线程显式 `--sandbox <mode>`；**resume 不支持 `-s`/`--sandbox`/`-a`**，续跑**一律沿用线程创建时的沙箱**，不得尝试注入或覆盖；若调用方请求的 sandbox 与线程记录不一致 → 记录 warning 并继续 resume（**不 fail、不轮换**）。新建/轮换后的新线程才使用当前请求档位。
- 不得通过 `-c` 覆盖沙箱（沙箱只看 `--sandbox`/线程记录；不写后端枚举键）。
- **本机限制（必须 UI 标注）**：本机 `workspace-write` provisioning 失败，所有 shell 返回 `rejected: blocked by policy`；`read-only` 同理可能失败；`danger-full-access` 正常。该档会拒绝所有命令属于**主机环境限制，不是插件 bug**。
- UI：折叠标题行仍显示当前档位摘要；`codexSandboxDanger`/`codexRiskNote` 在总开关关闭时灰显但不可隐藏。

---

## 4. 成员形态

### 4.1 `spawn_team_member` 参数

现有参数：`role`、`prompt`、`name`、`description`、`context`。新增：

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `backend` | enum | 省略 = `'native'` | `'native' \| 'codex'`；`native` = 现有行为（`context` 决定 fresh/fork/provider）；`codex` 必须显式指定 |

矩阵：

| backend | context:fresh | context:fork |
|---|---|---|
| `native`/省略 | 现状 | 现状 |
| `codex` | ✅ 支持 | ❌ `CODEX_UNSUPPORTED_CONTEXT` |

**复用规则**：`existingRoleMember` 必须同时匹配 `roleId` 与快照 `executor`；`backend:'codex'` 只复用 `executor==='codex'`，native 只复用 `executor==='native'`（旧记录缺省 native）。不匹配时创建新成员（`freeTarget` 后缀）。

`spawnTeamMember` 返回的 `member` 追加：`executor:'codex'`、`sandbox`、`threadId:''`。`/team-spawn` UI 命令 v3 不支持 backend 参数。

### 4.2 错误形态

统一 9 码（§9）；错误以 `Error` 抛出，文本 `[CODE] message`，可带 `reason`/`detail`（脱敏、≤4 KiB）。spawn 阶段可返回：

| 码 | spawn 触发 |
|---|---|
| `CODEX_DENIED_BY_CONFIG` | `codexBackend=false`（reason `disabled`）；角色 `codexSandbox` 非法；`codexExtraArgs` 违规；cwd 非法；transport 配置非法 |
| `CODEX_CLI_NOT_FOUND` | §3.3 五级探测全失败 |
| `CODEX_UNSUPPORTED_CONTEXT` | `backend:'codex'` + `context:'fork'` |

执行阶段的 `NOT_LOGGED_IN`/`TIMEOUT`/`EXIT_NONZERO`/`OUTPUT_UNPARSEABLE`/`BUSY`/`RESUME_FAILED`/`DENIED_BY_CONFIG` 见 §5.9。

### 4.3 成员工具面（结论，D7 更新）

**固定 allowlist，忽略角色 `toolMode`/`tools`：**

| 保留 | 说明 |
|---|---|
| `codex_exec` | 插件注册；执行体入口 |
| `send_message` | 向 Lead/成员汇报 |
| `team_task_create` / `team_task_get` / `team_task_list` / `team_task_update` | 任务板协作 |

**不保留**：`report_gate_event`（D7：codex 成员不参与 gate 评估，也不产生钥匙）、`skill`、`read`、`glob`、`grep`、`write`、`edit`、`pwsh`、`bash`、`spawn_team_member`、`spawn_teammate`、`create/update/delete_team_role`、`remember_role_rule`、`list_my_rules`、`list_team_roles`、`list_role_rules`、`forget_role_rule`、`ask_user_question`。

理由：

- 中继成员只做“转发 + 回报”；fs/shell 工具会与 Codex 重复执行并制造第二套审计。
- D7：codex 成员不参与 gates，`report_gate_event` 无意义且可能让外部成员产生钥匙；移除。
- `skill` 不保留：v3 不把角色私有技能注入 Codex；角色 `skills` 对 codex 后端不生效（README 说明）。
- 角色 `denyCommands` 对 codex 不生效（D7），无需 DSH 侧 guard。

实现：`installMember` 读快照 `executor`；codex 分支注册 `codex_exec`，注册 **codex 专用 tool guard**：仅允许上表，其余拒绝；跳过角色 tools/denyCommands guard。**gate 评估层也要按 executor 跳过**（§6.1）。

### 4.4 成员 persona（中继人格）

`memberPersona` 在 `executor==='codex'` 时追加：

```text
你由 Codex CLI 驱动：名册中的你是中继成员，真正执行体是本机 codex exec。
每轮你必须：
1. 把 Lead/用户本轮新到的任务原文按到达顺序拼好放进 codex_exec.task；不要改写细节、不要重放旧任务、不要臆造结果。
2. 只使用 codex_exec、send_message、team_task_*；不要直接读写文件或运行 shell。
3. 把 codex_exec 返回的 text 与 command_execution 摘要回报给 Lead；失败时原样报告 [CODEX_*] 错误码与可执行建议。
4. 线程由插件自动 resume；不要向用户索要 thread_id。
5. 不伪造“已完成”；没有 codex_exec 成功结果就不得声称完成。
6. 不受 DSH 闸门/命令拒绝策略约束；不要声称受其保护。
```

角色原 persona/rules 继续由 `memberPersona` 注入；codex prompt 头部再带角色 id/name/description（§5.4）。

### 4.5 快照与恢复

`MemberSnapshots.record` 扩展：

```jsonc
{
  "version": 1,
  "rootSessionId": "…", "name": "dev-1", "roleId": "dev",
  "executor": "codex",                 // 缺省 = native（旧记录兼容）
  "codex": { "cwd": "<absolute workspace>", "sandbox": "danger-full-access", "transport": "auto" },
  "frozen": { /* role snapshot; denyCommands 不生效 */ }
}
```

- spawn 前写入，失败删除（沿用 `src/spawn.js:125-131,167-169`）。
- **成员快照（含冷恢复/复用）必须持久化 `executor` 与 codex thread 状态**；D7 的 gate 跳过依赖 `executor`，快照缺失/写失败会导致豁免失效（按 native 处理）。新记录必须写；旧记录无 `executor` → native（不会误豁免）。
- 冷恢复：`installMember` 从快照恢复 codex 工具面/persona；线程记录从 §5.6 恢复。

---

## 5. Codex 执行与续跑契约

### 5.1 `codex_exec` 工具

**入参**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `task` | string | 是 | 本轮新到任务原文（中继模型不得改写/重放旧任务） |
| `resume` | boolean | 否 | 省略 = 自动：有 thread 则 resume，无则新建；`true` = 强制 resume（无 thread → `CODEX_RESUME_FAILED` reason `resume-not-found`）；`false` = 强制新建线程（旧线程保留为历史） |

每次调用重新校验：`codexBackend`、transport、沙箱、cwd、extraArgs；任一不合法 → `CODEX_DENIED_BY_CONFIG`。

**返回**（模型侧，≤4 KiB 脱敏；不返回 token）：

```jsonc
{
  "ok": true,
  "text": "…",                         // 最后一条 agent_message
  "threadId": "01a1f4e2-…",
  "activities": [
    { "type": "command_execution", "command": "npm test", "exitCode": 0, "outputPreview": "…" }
  ],
  "ms": 14400                          // 本轮总耗时（含回落）
}
```

- 字段就是上表 5 个；不再返回 `resumed`/`transport`/`fallbackUsed`/`exitCode`/`durationMs`/`warning`（内部可按需记录，但不进模型结果）。
- **除 `text` 与 `activities` 外不返回完整 stdout/events**；`outputPreview` 4 KiB + 脱敏（§8）。
- 失败抛 `Error`，文本 `[CODE]` + 可执行建议；不返回完整进程输出。

### 5.2 新建与续跑 argv

实现名：**`buildExecArgv`**（新建）/ **`buildResumeArgv`**（续跑），均为纯函数。

**通用（两条路径都必须）**：

- `--json`
- `--skip-git-repo-check`
- `--ignore-user-config`（**runner 内部固定 true，不暴露为用户配置项**；否则本机 MCP/plugin 会让 exec 卡 >3 分钟）
- `[-m <codexModel>]`（非空时）
- `[-o <runner-generated temp file>]`（**runner 生成/清理**；读前校验 mtime ≥ 本轮启动时间；旧文件不得复用）
- `<codexExtraArgs...>`（通过 §3.4 校验）
- **固定以 `-- <prompt>` 结尾**（`--` 由 runner 生成，不受 forbidden-arg 约束；prompt 在 `--` 之后）；`stdin:'ignore'`

**transport=fast/auto 的 fast 尝试额外注入**：

```
-c model_provider="openai-http"
-c model_providers.openai-http={ name = "OpenAI HTTP", base_url = "https://chatgpt.com/backend-api/codex", wire_api = "responses", supports_websockets = false }
```

（字段名以 spike 配置为首日实测校准；必须 `supports_websockets=false` 与上述 endpoint。）

**新建（no thread）额外**：

```
--sandbox <mode>
-C <cwd>                         # 新建唯一允许的 cwd 表达
-- <prompt>                      # 固定分隔符，由 runner 生成
```

**续跑（threadId）额外**：

```
codex exec resume <threadId> --json --skip-git-repo-check --ignore-user-config [-m <model>] [-o ...] -- <prompt>
```

- **resume 不支持 `--cd`/`-s`/`--sandbox`/`-a`**：续跑 argv **绝不出现** `--cd`/`-C`/`--sandbox`/`-a`；cwd 只靠 `node:child_process.spawn` 的 `cwd`，必须等于线程记录 `cwd`。
- **resume 一律沿用线程创建时的沙箱**；若调用方请求的 sandbox 与线程记录不一致 → 记录 warning 并继续 resume（**不 fail、不轮换、不注入**）；新建/轮换后的新线程才使用当前档位。
- **不得通过 `-c` 覆盖沙箱**（沙箱只看 `--sandbox`/线程记录，不用后端枚举键）。
- resume 会带入历史 token（实测 16.2k→46.9k）；用 §5.6 轮换限制。
- 必须 pin provider（fast 注入）与模型（`-m` 非空时）；否则可能出现 recorded/resuming 警告，视为 warning 不失败。
- 若某版本 `exec resume` 不接受 `-o`，只用 JSONL 末条 `agent_message`；不得因此失败。
- 环境：runner 用 `node:child_process` 自管 child，**过滤 env**（不裸传 `process.env`；剔除 `*_TOKEN`/`*_KEY`/`*_SECRET`，只透传必要项）；保留用户 `CODEX_HOME`/`~/.codex` 登录态。
- **kill（统一路径）**：超时/取消/stopTeammates 都必须终止**进程树**（Windows `taskkill /T /F`，POSIX 进程组），3s 宽限后强制 kill；**无僵尸、无残留会话锁**；多成员同时运行互不干扰（各自 cwd/线程/进程）。

### 5.3 cwd 规则

- spawn 时解析 Lead Agent 的 session cwd（`caller.session?.header?.cwd`；缺失回退 `process.cwd()`），要求绝对路径、存在、是目录；否则 `CODEX_DENIED_BY_CONFIG`。
- 快照/线程记录保存 cwd；新建 argv 用 `-C`；续跑用子进程 cwd。
- 续跑前校验记录 cwd 仍存在；不一致/不存在 → `CODEX_RESUME_FAILED`（reason `cwd-invalid`/`resume-not-found`）→ 回落新线程一次；新线程 cwd 仍无效 → `CODEX_DENIED_BY_CONFIG`。
- `codexExtraArgs` 不得改 cwd。

### 5.4 prompt 组装（内部/接线层辅助，非导出）

`buildCodexPrompt({ role, member, cwd, task, resumed, rotationSummary })`：

```text
[agent-team-roles:codex]
member: <name>  role: <roleId> (<name>)
workspace: <cwd>   thread: <new|resume>   transport: <fast|default|auto>
<role.description>
<role.persona 前 2000 字符>
<learned rules 摘要，前 1000 字符>
<rotationSummary：仅轮换时>
--- 任务（原文） ---
<task>
```

- `task` 是 `codex_exec.task` 原文；中继模型不得改写。
- 头部 ≤4 KiB；不注入 `denyCommands`（D7 不生效）。
- 轮换时 `rotationSummary` = 最近 3 条 `text`（各 ≤800 字符）+ “新线程接续”。

### 5.5 JSONL 解析 → 最终答复 + 活动摘要

`parseJsonl(stdout)` 容错半行/非 JSON 行：

| 事件/条目 | 映射 |
|---|---|
| `thread.started {thread_id}` | 记录 threadId |
| `turn.started` | 忽略 |
| `error {message}` | 计入 errors；`Reconnecting...` 只计 `reconnectEvents`，**不算失败** |
| `turn.failed {error.message}` | 失败；`auth-required` → `CODEX_NOT_LOGGED_IN`（detail reason）；其余 → `CODEX_EXIT_NONZERO` reason `turn-failed`，`model-unsupported` 写入 reason |
| `item.completed` 且 `item.type==='agent_message'` | **最后一条**非空文本 = `text` |
| `item.completed` 且 `item.type==='reasoning'` | 忽略文本 |
| `item.completed` 且 `item.type==='command_execution'` | activities：`{type:'command_execution', command, exitCode, outputPreview}`（命令/输出做脱敏+4 KiB 截断） |
| `item.completed` 其它类型（`file_change`/`mcp_tool_call`/`web_search`/`todo_list`） | 只记 type+status（路径相对 workspace；不记 query/原始输出） |
| `turn.completed` | 标记完成；`usage` 不记录 token |
| 非 JSON/半行 | `malformedLines++`；不因单行失败 |

- `activities` 中路径**一律相对 cwd**；无法相对化时用 `<abs>`（不得泄漏用户名/绝对路径）。
- `command_execution.outputPreview` ≤4 KiB 且脱敏；**除 `text`/`activities` 外不返回完整 stdout/events**。
- 本轮不落盘审计（§8 后续项）；内部只保留摘要，不存 `aggregated_output` 全文。

判定：

- exit 0 且有 `text` → 成功；无 threadId 可成功但 warning。
- exit 0 无 agent_message：若 `-o` 文件非空用它；否则 `CODEX_OUTPUT_UNPARSEABLE` reason `no-final-message`。
- exit 2 → `CODEX_EXIT_NONZERO` reason `cli-usage`。
- exit 非 0 且非 2 → `CODEX_EXIT_NONZERO` reason `turn-failed` 或 `exit`（见 §5.9）。
- kill/超时 → `CODEX_TIMEOUT`。
- 空 `thread_id` 不阻断本轮，但下轮新建。

### 5.6 线程记录与轮换

新增 `src/codex-store.js`，`stateDir()/codex-threads.json`（原子写）：

```jsonc
{
  "version": 1,
  "threads": [{
    "rootSessionId": "…", "name": "dev-1", "roleId": "dev",
    "threadId": "…", "cwd": "<absolute>", "sandbox": "danger-full-access",
    "transport": "auto", "turns": 3, "createdAt": 0, "updatedAt": 0,
    "lastAnswers": ["…", "…", "…"], "rotatedFrom": ""
  }]
}
```

- `turns >= 12` 或 `lastAnswers` 总字符 >6000 → 轮换新线程；旧 id 记 `rotatedFrom`。
- `CODEX_RESUME_FAILED` → 清空 threadId，**同一轮新建一次**；仍失败报错。
- **沙箱不一致**：resume 一律沿用线程记录的沙箱；若当前请求档位不同，记录 warning 并继续 resume（不轮换、不注入）；新建/轮换后的新线程才使用当前档位。
- **快照与线程记录必须成对持久化**：冷恢复/复用时从快照读 `executor`、从 `codex-threads.json` 读 thread 状态；缺任一则不得启用 D7 豁免（按 native 处理）。
- `stopTeammates`/成员删除不删线程记录（冷恢复需要）；90 天未更新可 prune（可选，不阻塞）。
- 不记录 token；`lastAnswers` 只存摘要。

### 5.7 超时、取消、单飞、重试

- **总预算**：`0` = transport 预算（auto 270s = fast 90 + fallback 180；fast 90s；default 180s）；正数 = 用户总预算，覆盖默认总预算，fast/fallback 仍受剩余预算约束。
- **`sawEffectiveTurn`**：一旦解析到 `turn.started`（或任何属于有效回合的 item）即置 true；已进入有效回合说明可能已有副作用，**不得重跑**。
- **transport 语义（固定）**：
  - `auto`：fast 优先；fast 失败为 **`provider-unreachable` 或 fast 超时**，且 **`!sawEffectiveTurn`** → 回落 default **一次**；回落耗时计入总预算；`Reconnecting...` 不算失败、不触发回落。其它错误或 `sawEffectiveTurn=true` 不回落。
  - `fast`：只走 fast，**不回落**；`provider-unreachable`/超时交工具层（`CODEX_EXIT_NONZERO` reason `provider-unreachable` 或 `CODEX_TIMEOUT`）。
  - `default`：只走慢路径，不尝试 fast、不回落。
- **超时/取消**：到期或 `exec.signal` 中止 → terminate 进程树（3s 宽限后强杀）→ 内部 `timeout`/`cancelled` → 工具层 `CODEX_TIMEOUT`；若已见 threadId，记录用于续跑。不得留僵尸/会话锁。
- **单飞**：同一成员同时只允许一个 Codex 进程；第二次立即工具层 `CODEX_BUSY`（不排队）；锁在 finally 释放。
- **重试**：Codex 自身处理 Reconnecting；父侧不叠加重试；唯一自动回落是 auto 的 `provider-unreachable`/fast 超时（且 `!sawEffectiveTurn`）→ default 一次与 resume 失败→新建一次。非零/超时/无 final 不自动重跑模型。
- **登录（接线层职责）**：`codex login status` 由**接线层**在成员首轮前执行一次并按 binary 缓存（5 分钟）；runner 不做登录预检。未登录交工具层 `CODEX_NOT_LOGGED_IN`。

### 5.8 进程调用形状（`node:child_process`，不依赖 `ctx.subprocess`）

```js
import { spawn } from 'node:child_process'
const child = spawn(binary, args, {
  cwd,                                  // 新建/续跑都用记录的 cwd
  stdio: ['ignore', 'pipe', 'pipe'],    // stdin 关闭
  env: sanitizedEnv,                    // 过滤 env；不裸传 process.env
  windowsHide: true,
})
// stdout 流式 JSONL；stderr 只保留末 4 KiB（脱敏）
// 终止：Windows taskkill /T /F <pid>；POSIX 以 detached 进程组启动并 kill(-pid)
```

- **env 过滤**：只透传 `PATH`/`CODEX_HOME`/`HOME`/`USERPROFILE`/`TEMP`/`TMP` 等必要项；剔除 `*_TOKEN`/`*_KEY`/`*_SECRET`。
- **可选能力**：`ctx.subprocess`/`ctx.llm` 缺失不影响 codex runner（本模块不依赖）；若接线层其它功能需要它们，必须显式报错，不得静默崩溃。
- **终止统一路径**：超时、取消、stopTeammates 都走同一 `terminateTree()`；3s 宽限后强杀，等待 `close`，无僵尸/会话锁。
- **最终形态**：`node:child_process` 自管 child 为最终形态，不再切回 `ctx.subprocess`。

### 5.9 错误映射（runner 14 码 → 工具层 9 码，固定表）

**runner 内部 14 码 → 工具层 9 码**（不得在工具层暴露内部码）：

| # | runner 内部码 | 工具层 code | 工具层 reason | 说明 |
|---|---|---|---|---|
| 1 | `timeout` | `CODEX_TIMEOUT` | `timeout` | 超预算 |
| 2 | `cancelled` | `CODEX_TIMEOUT` | `cancelled` | signal/stopTeammates |
| 3 | `resume-not-found` | `CODEX_RESUME_FAILED` | `resume-not-found` | `no rollout found`/坏 thread |
| 4 | `no-final-message` | `CODEX_OUTPUT_UNPARSEABLE` | `no-final-message` | exit0 无 agent_message |
| 5 | `invalid-jsonl` | `CODEX_OUTPUT_UNPARSEABLE` | `invalid-jsonl` | 全行不可解析 |
| 6 | `auth-required` | `CODEX_NOT_LOGGED_IN` | `auth-required`（detail） | 登录失效 |
| 7 | `model-unsupported` | `CODEX_EXIT_NONZERO` | `model-unsupported` | 模型不支持 |
| 8 | `provider-unreachable` | `CODEX_EXIT_NONZERO` | `provider-unreachable` | fast 端点/401 等 |
| 9 | `spawn-failed` | `CODEX_EXIT_NONZERO` | `spawn-failed` | 进程起不来 |
| 10 | `spawn-epipe` | `CODEX_EXIT_NONZERO` | `spawn-epipe` | 写 stdin/管道失败 |
| 11 | `turn-failed` | `CODEX_EXIT_NONZERO` | `turn-failed` | `turn.failed` |
| 12 | `cli-usage` | `CODEX_EXIT_NONZERO` | `cli-usage` | exit 2/用法错误 |
| 13 | `config-invalid` | `CODEX_DENIED_BY_CONFIG` | `config-invalid` | 配置非法 |
| 14 | `sandbox-denied` | `CODEX_DENIED_BY_CONFIG` | `sandbox-denied` | 沙箱拒绝全部命令 |

**工具层 9 码（权威）**：

| code | reason 取值 | 触发 |
|---|---|---|
| `CODEX_CLI_NOT_FOUND` | — | 探测失败/0 字节 alias |
| `CODEX_NOT_LOGGED_IN` | `auth-required`（detail） | auth-required |
| `CODEX_TIMEOUT` | `timeout` / `cancelled` | 超时/取消 |
| `CODEX_EXIT_NONZERO` | `turn-failed` / `cli-usage` / `model-unsupported` / `provider-unreachable` / `spawn-failed` / `spawn-epipe` | 非零/回合失败/模型/端点/起进程 |
| `CODEX_OUTPUT_UNPARSEABLE` | `no-final-message` / `invalid-jsonl` | 输出无法解析 |
| `CODEX_BUSY` | — | 同成员单飞 |
| `CODEX_RESUME_FAILED` | `resume-not-found` / `cwd-invalid` | resume 失败 |
| `CODEX_UNSUPPORTED_CONTEXT` | — | codex+fork |
| `CODEX_DENIED_BY_CONFIG` | `disabled` / `invalid-sandbox` / `invalid-cwd` / `forbidden-arg` / `config-invalid` / `sandbox-denied` | 开关/沙箱/cwd/参数 |

- 错误码 9 个固定；**工具层不得输出上表之外的码**；内部 14 码只作为内部 detail（本轮不落盘审计）。
- `auth-required` 写入 `CODEX_NOT_LOGGED_IN` 的 detail reason；`model-unsupported` 写入 `CODEX_EXIT_NONZERO` 的 reason。
- 不新增第 10 个码：`provider-unreachable`/`cli-usage` 归 `CODEX_EXIT_NONZERO`，文案键数不变（39）。

---

## 6. 消息、名册与豁免

### 6.1 `send_message` 与 gate 豁免

- `send_message` → 原生 inbox；中继下一轮把**本轮新到**消息按序拼接进 `codex_exec.task`（多条不丢、不重放旧消息）。
- codex 运行中收到消息：平台排队；v3 不做中途注入/ststdin；下一轮 resume。
- **D7 实现要求**：gate 评估入口（`tools/pre-execute` 的 `evaluateGates` 调用）在 `executor==='codex'` 时**直接跳过**；不得因为 `deny.tool:['codex_exec']` 拦该成员；也不注册 `report_gate_event`（不产生钥匙）。
- 角色 `denyCommands` 对 codex 后端**不生效**；不注册 DSH shell 工具；不生成 `.rules`/prefix。
- 单测/集成断言：假 ctx 计数，codex 成员调用 `codex_exec` 时 gate 评估次数为 0。

### 6.2 idle/busy 与名册

- 名册 `running/inactive` **只反映中继 Agent 状态**：`codex_exec` 等待期间 running；回合结束 inactive。
- v3 只做**静态执行体徽章** `codexBadge`（取快照 `executor==='codex'`，文案“Codex 驱动（外部 Agent）”），**不表示 running**；不伪造 Codex 进程状态。徽章 tooltip 用 `codexBadgeHint`，表达“**外部 Agent·不受闸门约束**”。
- 成员忙碌一律由回合状态 + `codexErrBusy` 表达；回合内提示 `codexMemberBusy`（“等待 Codex 返回（约 2 分钟；fast 约 15s）”）是提示文案，不是实时状态。
- `stopTeammates` 终止中继 Agent；Codex 进程随 `exec.signal` 终止，无孤儿。

### 6.3 会话历史

- DSH 历史由中继 Agent session 保存；Codex 历史由 `thread_id` + `resume` 保持；插件只存 threadId/cwd/sandbox/turns/最近答复摘要。
- resume 会重放历史 token（实测 16.2k→46.9k）；用 §5.6 的 12 轮/6000 字符轮换限制。
- 不复制完整 Codex transcript 到 DSH；DSH 只保留工具结果摘要。

---

## 7. 外部 Agent 豁免（D7）

- **D7 是设计选择，不是风险**：用户明确要求“codex 等外部子 Agent 不用做任何闸门限制”。
- codex executor 不参与 gate 评估（包括 `codex_exec` 自身作为 deny.tool）；不受 `denyCommands`；内部命令不经过 DSH 工具管线，天然不受 gates。
- 不再实现 D3/D6：策略预览 2 键已删除，相关验收移除；不写 `.codex/rules`/用户级 rules；不生成 prefix_rule。
- 用户可读说明（README + 设置页角色编辑器 denyCommands 旁一行小字）：
  **“Codex 成员及其内部命令不受闸门与命令拒绝策略约束”**（`codexDenyExemptNote`）。
- 徽章 `codexBadge` 是唯一可辨识信号；tooltip 使用 `codexBadgeHint`（“外部 Agent·不受闸门约束”）。
- 如需强制限制，**只能靠 Codex 自身 sandbox 档位**，不要指望 DSH gates。文档必须这样写。

---

## 8. 审计与脱敏（审计为后续项，本轮不做）

### 8.1 审计文件（后续项，本轮不落盘）

> **v3.1 本轮不写 `codex-audit.jsonl`**；以下字段仅作为后续审计项设计。本轮只保证 `codex_exec` 工具结果脱敏。

`stateDir()/codex-audit.jsonl`，每轮一行（后续项）：

```jsonc
{
  "kind": "codex.turn",
  "at": 0,
  "rootSessionId": "…", "member": "dev-1", "role": "dev",
  "threadId": "…", "resumed": true,
  "cwdRel": ".", "model": "…", "sandbox": "danger-full-access",
  "transport": "auto", "fallbackUsed": false,
  "taskChars": 1234, "taskHash": "a1b2c3d4e5f6",
  "exitCode": 0, "durationMs": 14400,
  "finalChars": 45, "finalHash": "…",
  "activities": [{ "type": "command_execution", "command": "npm test", "exitCode": 0 }],
  "reconnectEvents": 0,
  "code": "", "reason": "", "detail": "",
  "exempt": true
}
```

**禁止记录**：token、完整 task、完整 stdout/stderr、`auth.json` 值、`OPENAI_API_KEY`/JWT、reasoning 文本、绝对用户主目录路径（cwd 存相对 workspace）。command_execution 只记命令摘要+退出码，不记 `aggregated_output` 全文。

- **路径统一**：activities/审计中的路径一律**相对 cwd**；无法相对化时写 `<abs>`；不得泄漏用户名/绝对家目录。
- `outputPreview` 只进工具结果，不进审计。

### 8.2 脱敏（内部辅助，非导出）

内部辅助函数（不作为公共导出）：

- 清除 `OPENAI_API_KEY`、tokens、JWT、`sk-...`、`Bearer ...`；
- 绝对路径替换为相对 workspace/`<abs>`；
- 丢弃 reasoning；
- 诊断/`outputPreview` 截断 4096 字节（UTF-8 边界）；
- `codex_exec` 的模型可见 `text`/`outputPreview` 也过同一脱敏。

### 8.3 日志失败（后续项）

审计写失败只 warn，不影响 `codex_exec`；不得因审计失败重跑。

---

## 9. 错误码与 i18n 键

### 9.1 九个错误码（权威，reason 不新增码）

| # | code | 用户文案 key | 说明 |
|---|---|---|---|
| 1 | `CODEX_CLI_NOT_FOUND` | `codexErrCliNotFound` | 探测失败/0 字节 alias |
| 2 | `CODEX_NOT_LOGGED_IN` | `codexErrNotLoggedIn` | auth-required；需人工 `codex login` |
| 3 | `CODEX_TIMEOUT` | `codexErrTimeout` | timeout/cancelled/kill |
| 4 | `CODEX_EXIT_NONZERO` | `codexErrExitNonzero` | turn-failed/model-unsupported/provider-unreachable/spawn-failed/spawn-epipe/cli-usage |
| 5 | `CODEX_OUTPUT_UNPARSEABLE` | `codexErrUnparseable` | no-final-message/invalid-jsonl |
| 6 | `CODEX_BUSY` | `codexErrBusy` | 同成员单飞 |
| 7 | `CODEX_RESUME_FAILED` | `codexErrResumeFailed` | resume-not-found/cwd-invalid |
| 8 | `CODEX_UNSUPPORTED_CONTEXT` | `codexErrUnsupportedContext` | codex+fork |
| 9 | `CODEX_DENIED_BY_CONFIG` | `codexErrDeniedByConfig` | disabled/invalid-sandbox/invalid-cwd/forbidden-arg/config-invalid/sandbox-denied |

- **错误码 9 个、文案键 39 个，二者独立计数**。
- `DENIED_BY_CONFIG` 只保留开关/路径/沙箱/参数/配置错误；不包含命令策略转译语义（D3/D6 已撤销）。
- 错误码封闭；新增必须改本表。

### 9.2 i18n 键规划（**39 − 2 + 2 = 39 键**，全部新增）

> 位置：`client.js` 内嵌 `zh`/`en` 字典；`locale/*.json` 仅包元数据。
> 算式：v1 的 39 键 − 删除 2 个策略预览键 + 新增 `codexDenyExemptNote`、`codexBadgeHint` 2 键 = **39 键**（净变化 0）。
> 不新增 `codexSandboxInheritHint`；角色下拉“留空即继承”由 `codexSandboxRoleHint` 覆盖。若 PM 后补该键，按 40 键更新并回写（以最终文件为准）。
> `codexTransport` 不新增键；设置页如展示，选项直接显示 `auto / fast / default`，说明由 `codexSectionHint` 覆盖。

| # | key | 用途 |
|---|---|---|
| 1 | `codexSectionTitle` | 「成员后端 / Codex CLI」区块标题 |
| 2 | `codexSectionHint` | 区块说明（影子成员/transport/时延/风险摘要） |
| 3 | `codexRiskNote` | “Codex 成员不参与闸门评估，内部命令天然不过 DSH 工具管线；它还可能读到本机 Codex 登录凭据；每轮约 2 分钟。” |
| 4 | `codexEnabled` | 开关 label |
| 5 | `codexEnabledHint` | 关闭时 backend:'codex' 被拒 |
| 6 | `codexBinary` | 路径 label |
| 7 | `codexBinaryHint` | 空 = 自动探测；5 级顺序摘要 |
| 8 | `codexBinaryDetect` | 「检测」按钮 |
| 9 | `codexDetectOk` | 检测成功（路径/版本） |
| 10 | `codexDetectFail` | 检测失败（尝试路径） |
| 11 | `codexModel` | 模型 label |
| 12 | `codexModelHint` | 空 = 用 Codex 配置；resume 建议 pin |
| 13 | `codexSandbox` | 全局沙箱 label |
| 14 | `codexSandboxHint` | 档位说明 + 本机 workspace-write 限制 |
| 15 | `codexSandboxDanger` | **完全放开 = 可能自主联网/装包/改任意文件**（D2 必显） |
| 16 | `codexSandboxRole` | 角色级沙箱 label |
| 17 | `codexSandboxRoleHint` | 继承全局 / 覆盖说明 |
| 18 | `codexTimeout` | 超时 label |
| 19 | `codexTimeoutHint` | 0=transport 预算（auto 270s/fast 90s/default 180s）；正数=用户总预算 |
| 20 | `codexExtraArgs` | 额外参数 label |
| 21 | `codexExtraArgsHint` | 受控参数不可覆盖 |
| 22 | `codexExtraArgsDenied` | 违规参数错误 |
| 23 | `codexErrCliNotFound` | 错误码 1 |
| 24 | `codexErrNotLoggedIn` | 错误码 2 |
| 25 | `codexErrTimeout` | 错误码 3 |
| 26 | `codexErrExitNonzero` | 错误码 4 |
| 27 | `codexErrUnparseable` | 错误码 5 |
| 28 | `codexErrBusy` | 错误码 6 |
| 29 | `codexErrResumeFailed` | 错误码 7 |
| 30 | `codexErrUnsupportedContext` | 错误码 8 |
| 31 | `codexErrDeniedByConfig` | 错误码 9（disabled/沙箱/cwd/参数/配置） |
| 32 | `codexBadge` | 静态徽章：**Codex 驱动（外部 Agent）** / **Codex-backed (external agent)**；不表示 running |
| 33 | `codexMemberBusy` | 回合内提示“等待 Codex 返回（约 2 分钟；fast 约 15s）”（不是实时状态） |
| 34 | `codexSandboxOptionReadOnly` | 下拉：只读 |
| 35 | `codexSandboxOptionWorkspace` | 下拉：可写工作区（本机可能不可用） |
| 36 | `codexSandboxOptionFull` | 下拉：完全放开 |
| 37 | `codexSandboxOptionInherit` | 下拉：继承全局（留空） |
| 38 | `codexDenyExemptNote` | 角色编辑器 `denyCommands` 下方静态小字：**Codex 成员及其内部命令不受闸门与命令拒绝策略约束** |
| 39 | `codexBadgeHint` | 徽章 tooltip：**外部 Agent·不受闸门约束**（不暗示 running） |

- 键名扁平 camelCase；中英成对；TSE 反向断言“无未登记键”，当前断言 **39**。
- **删除的键**：2 个策略预览键（D3/D6 撤销）不得再登记；`codexSandboxInheritHint` 不新增。
- 错误码到用户 key 的映射表为权威；client 只按 code/reason 查表，不解析英文 message。

---

## 10. 测试与验收

### 10.1 可测导出清单（与 `codex-cli` 实际导出一致）

| # | 导出 | 用例要点 |
|---|---|---|
| 1 | `detectCodexBinary(options)` | 5 级顺序；配置路径失败**终态不回退**；WindowsApps 版本降序；**跳过 0 字节 `codex-*.exe` alias**；不探测 `.cmd`；全失败 `CODEX_CLI_NOT_FOUND` |
| 2 | `buildExecArgv` | `--ignore-user-config` 内部固定；`--sandbox` 必填；`-C`；fast provider `-c`；`-o` 为 runner 生成路径；**以 `-- <prompt>` 结尾** |
| 3 | `buildResumeArgv` | **不含 `-C/--cd`、`--sandbox`、`-a`**；cwd 由 spawn 传入；不注入 sandbox；`-- <prompt>` 结尾 |
| 4 | `parseJsonl(stdout)` | 最后一条 `agent_message` 胜出；`command_execution` → `{type,command,exitCode,outputPreview}`；`-o` 兜底；`turn.failed`；半行/坏行；无 final → `no-final-message` |
| 5 | `runTask` | 综合：spawn/流式/超时/进程树 kill/env 过滤/`-o` mtime 校验；不依赖 `ctx.subprocess` |
| 6 | `planAttempts` | auto 先 fast；**`provider-unreachable` 或 fast 超时且 `!sawEffectiveTurn`** → fallback default 一次；`sawEffectiveTurn=true` 不回落；预算 90/180/270 |
| 7 | `validateExtraArgs` | 固定禁止列表逐项命中 → `CODEX_DENIED_BY_CONFIG`（forbidden-arg），不启动进程；`--` 仅 runner 生成 |
| 8 | `classifyFailure` | 14 个内部码逐项分类（timeout/cancelled/resume-not-found/no-final-message/invalid-jsonl/auth-required/model-unsupported/provider-unreachable/spawn-failed/spawn-epipe/turn-failed/cli-usage/config-invalid/sandbox-denied） |
| 9 | `INTERNAL_TO_CONTRACT` | 14→9 固定表；工具层不得输出表外码；`model-unsupported`/`auth-required` 写入 detail reason |

> 不再引用 `resolveCodexBinary`/`parseCodexJsonl`/`selectTransport`/`resolveSandbox`/`redactCodexRecord` 作为实现名：前两者用实际导出名；transport 由 `planAttempts`；sandbox 解析在接线层；脱敏为内部辅助（非导出）。

### 10.2 七步 E2E（Windows）

1. **配置/探测**：设置页 Codex 区块（默认 danger-full-access + 风险）；检测命中 WindowsApps `codex.exe`，跳过 0 字节 alias 与 `.cmd`；接线层 `codex login status` 已登录。
2. **spawn/徽章**：`spawn_team_member({role:'dev', backend:'codex', name:'cx-1'})` → 名册出现；静态 `codexBadge` + tooltip“外部 Agent·不受闸门约束”；工具面只有 `codex_exec`+协作，无 `report_gate_event`。
3. **首轮 + D7 豁免**：配置一个 `deny.tool:['codex_exec']` 的 gate 与角色 `denyCommands`；cx-1 仍能调用 `codex_exec` 并在 workspace 写 `tmp/probe.txt`；假 ctx 计数 gate 评估次数 = 0；返回 threadId/text；名册仅回合内 running。
4. **resume/cwd/沙箱**：第二条消息 → argv 含 `resume <threadId>`，**不含 `--cd`/`-C`/`--sandbox`/`-a`**；子进程 cwd 正确；threadId 不变；把请求沙箱改成与线程不同 → 记录 warning、继续 resume、argv 仍无沙箱、不轮换。
5. **transport/降级**：auto 下 fast 14–18s；强制 fast `provider-unreachable` 或 fast 超时且 `!sawEffectiveTurn` → 回落 default 一次且计入总预算；fast 模式不回落并提示改用 default；已进入有效回合（`sawEffectiveTurn=true`）不得回落重跑；`Reconnecting...` 不触发回落。
6. **负例/超时**：`backend:'codex'+fork` → UNSUPPORTED_CONTEXT；binary 不存在 → CLI_NOT_FOUND；临时无登录态 → NOT_LOGGED_IN（接线层）；30s 超时 → TIMEOUT 且无僵尸/会话锁；`stopTeammates` 杀进程。
7. **沙箱/轮换/键数**：`workspace-write` 在本机所有 shell `rejected: blocked by policy`（UI 已标注，不是 bug）；`danger-full-access` 正常；第 13 轮轮换新 thread；**本轮不落盘审计**；键数 39。

### 10.3 Definition of Done

- 9 错误码 + reasons 全有单测/至少一条 E2E；runner 14 码不泄漏到工具层；
- native 成员回归全绿；codex 工具 allowlist 单测；
- **D7 断言**：codex 成员调用 `codex_exec` 时 gate 评估入口计数为 0；无 `report_gate_event`；`deny.tool:['codex_exec']` 不生效；
- transport auto/fast/default 与回落/预算单测；0 字节 alias 跳过；**不探测 `.cmd`**；resume 无 `--cd`/`-s`/`--sandbox`；沙箱不一致 warning 且不注入/不轮换；
- 沙箱优先级/本机 workspace-write 失败表现；超时/取消无孤儿；单飞；
- 工具输出脱敏；键数 39 双向一致；审计文件本轮不做（后续项）；
- README 写明外部 Agent 豁免、凭据风险、沙箱限制、transport 时延、`.cmd` 不支持。

---

## 11. 实施顺序与风险

### 11.1 DEV 顺序

1. `src/config.js`：`codexSandbox` 角色字段；全局 codex 配置读取/校验（含 transport/timeout）。
2. `src/codex-cli.js`：纯函数（`detectCodexBinary`/`buildExecArgv`/`buildResumeArgv`/`parseJsonl`/错误映射/transport/沙箱/prompt/rotate/redact）；无状态。
3. `src/codex-store.js`：线程记录 + 轮换；`src/codex-runner.js`：`runTask`（transport 回落、单飞、超时、流式）。
4. `src/spawn.js`：`backend` 与快照 `executor/codex`；spawn 预检（开关/二进制/cwd/沙箱/transport）。
5. `src/plugin.js`：注册 `codex_exec`；codex 专用 tool guard；**gate 评估入口按 executor 跳过（D7）**；persona；不注入 `subprocess`（runner 自管 child）。
6. `src/prompts.js`：codex 中继段落（含“不受闸门约束，不要声称受保护”）。
7. 设置页（`client.js`）：Codex 区块、字段、检测、风险、角色 `codexSandbox` 下拉、`codexDenyExemptNote` 小字、`codexBadgeHint` tooltip、`codexTransport` 技术值选择；39 键。
8. README/文档：D7 豁免、凭据、沙箱、transport、时延、`.cmd` 不支持、resume 沙箱沿用线程并 warning。
9. 测试：§10.1 九个导出 + §10.2 七步 E2E。

### 11.2 设计选择与风险

1. **D7 是设计选择，不是风险**：Codex 成员及其内部命令不受 DSH gates/denyCommands；用户已确认。**如需强制，只能靠 Codex sandbox 档位**，不要指望 DSH 闸门。
2. **凭据**：Codex 子进程可读 `~/.codex/auth.json`；完全放开下提示注入可能外泄；UI/README 披露。
3. **本机 workspace-write 不可用**：provisioning 失败导致所有 shell 被 policy 拒绝；保留档位但 UI 标注，不是插件 bug。
4. **transport**：fast 14–18s，default 回落可能 ~125s；auto 在 `provider-unreachable` 或 fast 超时且 `!sawEffectiveTurn` 时回落一次并计入总预算；401/端点变更交 `CODEX_EXIT_NONZERO` reason `provider-unreachable`，不反复试。
5. **0 字节 alias**：WindowsApps/`codex-*.exe` 别名必须验证 size>0；`Get-Command` 不可靠；`.cmd` 不支持。
6. **resume**：不支持 `--cd`/`-s`/`-a`；cwd 靠子进程；沙箱沿用线程，不一致只 warning、不注入/不轮换；必须 pin provider/model，否则 warning。
7. **上下文增长**：resume 16.2k→46.9k；12 轮/6000 字符轮换。
8. **版本差异**：argv/JSONL/item 类型/transport 配置键可能随版本变化；首日按 `codex exec --help`/实测校准，语义不变。

### 11.3 待确认（不阻塞）

- `codex exec resume` 对 `--ignore-user-config`/`-o` 的接受度（首日实测；不接受时只影响兜底，不影响语义）。
- fast provider `-c` 的完整字段名（首日按 spike 实测校准；必须 `supports_websockets=false` + 指定 endpoint）。
- `codexTransport` 是否后续需要设置页本地化键（当前 39 键，选项显示技术值）。
- 角色级 timeout/transport 覆盖（v3 只沙箱有角色覆盖）。

---

## 附录 A：调研证据（摘要）

| 事实 | 值/结论 |
|---|---|
| Codex 路径 | `C:\Program Files\WindowsApps\OpenAI.Codex_26.1111.2228.0_x64__2p2nqsd0c76g0\app\resources\codex.exe` |
| 版本 | `codex-cli 0.169.0-alpha.11.1` |
| PATH/alias | `codex` 不在 PATH；同目录 `codex-*.exe` 是 0 字节 alias，必须跳过；`Get-Command` 不可靠 |
| 登录 | `codex login status` → `Logged in using ChatGPT`；凭据 `~/.codex/auth.json`（未读取值） |
| 125s 根因 | WebSocket 4 次重连超时（约 110s）后回落 HTTPS；非模型慢 |
| fast 实测 | 简单答复 14.4s；带 shell 18.1s；resume 16.0s（`-c model_providers.openai-http=... supports_websockets=false`，端点 `https://chatgpt.com/backend-api/codex`） |
| resume | 不支持 `--cd`/`-s`/`-a`；cwd 只能 spawn cwd；上下文 16.2k→46.9k；必须 pin provider/model |
| 必需参数 | `--ignore-user-config`（否则本机 MCP/plugin 卡 >3 分钟）、`--skip-git-repo-check`、`stdin:'ignore'`、新建 `-C` |
| 沙箱 | 本机 `workspace-write` provisioning 失败，shell 全部 `rejected: blocked by policy`；`danger-full-access` 正常 |
| 最终文本 | 最后一条 `item.completed` + `item.type==='agent_message'`；`-o` 可兜底；`command_execution` 含 command/aggregated_output/exit_code |
| 错误映射 | exit0 无 agent_message→no-final-message；`turn.failed`→turn-failed；auth-required→NOT_LOGGED_IN；model-unsupported→EXIT_NONZERO reason；`no rollout found`→resume-not-found；exit2→cli-usage→EXIT_NONZERO reason；kill→timeout |
| 平台硬约束 | agent-team 恒传 childId；external 一次性不可寻址；无 attach；名册取活 Agent |
| 插件现状 | `src/spawn.js:159` 走 `spawnTeammate`；未注入 `subprocess`；denyCommands 只作用于 bash/pwsh（`policy.js:12,36-37`） |
| D7 | Codex 成员及其内部命令不受 gates/denyCommands；`report_gate_event` 不注册；不生成 `.rules`/prefix。 |
