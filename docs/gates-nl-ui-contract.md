# 契约：自然语言创建「工序闸门」（gates）— v5

- 状态：**已通过 Lead 评审并入开发（v2 D1–D5；v3 D6–D9；v4 D10；v5 追加 D11，均见 §15）**
- v5 变更摘要：i18n 增至 **83 键**（新增整条丢弃 `gateParseDiscardResult`）；per-nonce 退避定时器与 poll 解耦；客户端 poll 改 `setTimeout` 链且事件即关；取消/超时不复活；保存成功以宿主返回值为准并重设基线；危险 gate 条件写死；模板 report-and-skip（只校验 incoming）与 apply 顺序；读侧 warn 按 gate id 去重。
- v4 变更摘要：i18n 定稿 **82 键**并清死键；D9 层 3 写实（pre/post-execute 原始 gates 每 id 每进程 warn）；新增放弃（give-up）路径；退避/重试对象明确（persist 只重写缓存）；D5 `eventSeen` 判据；保存校验分档；id fallback/形状语义边界/取消时序/生命周期等 10 项 CR 细则。
- v3 变更摘要：i18n 改扁平 `gateAi*`/`gateParse*`（点号键废弃）；`persist-failed` 仅审计；轮询/重试/退避边界；R4 三层（保存/模板/读取）；schema 边界、metadata clamp、可执行 id 规则、旧 Host mock 用例、订阅生命周期。
- v1（新任务 + Agent 解析 + `gateDraft` 回填）在以下事实核对后废弃：`settings.section` 没有 `sessionId`（`slots.d.ts:154-157`），从设置页打开会话成本高且偏离“解析后回填表单”的诉求。v2 起改为**宿主辅助 LLM 解析 + Config 请求/结果握手 + 客户端回填表单**。
- 范围：插件 `dsh-agent-team-roles`（根目录 `docs/gates-nl-ui-contract.md`）；本文件只定契约，DEV/TSE 负责 `src/`、`client.js`、`tests/`、`README.md`
- 基线：DSH desktop `0.2.2-rc.1`（build `c59d10a`），插件 `0.1.0`；GUI `http://127.0.0.1:63036`
- 读者：Lead（拍板）、DEV（实现）、TSE（回归）、CR（逐条核对 Q1–Q10 与 R1–R4）
- 章节索引（v5 最终编号）：§9 i18n 约定；**§10 = 扁平 `gateAi*`/`gateParse*` 文案契约（83 键）**；**§11 = Q1–Q10**；**§12 = R1–R4 处置**；§14 = 验收；**§15 = Lead 决策记录 D1–D11（已批准）**；§16 = DEV/TSE 交接。

---

## 0. 结论（一页）

1. **解析在宿主（插件 host half）执行，不在客户端、不新开会话、不新增 Remote namespace。**
2. 客户端通过**现有 settings Remote** 写一个“解析请求”到本插件 Config；宿主监听 `settings/document-updated`，读到新请求后用 `ctx.llm.stream(...)` 做一次**辅助请求**（照 `dsh-session-title-llm` 的先例，`purpose` 声明归属），把结构化结果写回 Config 的“解析结果”字段；客户端再用 `ctx.remote.$on('settings/document-updated')` 重读。
3. 解析结果**只回填**：客户端展示预览，用户点「采用」把 gate 放进**本地 `engine.gates`**（或 GateForm 预填），点顶部「保存」才真正 `settings.mutate` 写入 `gates`；解析/采用阶段**绝不直接落盘 `gates`**。
4. 保存路径新增校验兜底（修复 R4，分档）：未改动 gates 时 legacy 非法/删角色只警告；改动 gates 时逐条 `validateGate` + 条数 + **id 集合唯一 + 角色存在性**，非法即拒绝；`gatesDisabled` 始终只留现存 id；模板 apply 同 id 覆盖回报 `replaced: <ids>`；宿主 pre/post-execute 读取原始 gates 每 id 每进程一次 warn（不阻断）。
5. 保存失败不再 `await load()` 覆盖本地（修复 R1）：只刷新 revision 与解析状态，保留本地 `engine`。
6. `gateParseRequest` / `gateParseResult` 是 **volatile** 字段，会随 profile patch 持久化：请求原文在解析完成后原子清除；**结果不会自动清理**，保留至下次请求/保存/丢弃（README 披露）。这是 R2/R3 的**最小持久化边界**（不引入全局状态库）。
7. 一并修复既有客户端缺陷（Q6）：编辑态改 id 不查重（`client.js:908-910`）与 `upsert` 按 id 静默覆盖（`client.js:737-743`）；解析回填依赖 create 语义，必须同轮修。
8. i18n 使用**扁平 `gateAi*`/`gateParse*`**（§10，共 83 个 key）；点号键废弃；字典不得有未登记键；`persist-failed` 仅审计、无客户端 key。
9. 事件优先、轮询兜底：每 nonce 记 `eventSeen`；宿主轮询仅在 pending 且无事件时存在；首次 + ≤3 次重试（30/60/120s），persist 只重写缓存；客户端 `$on` + 2s `describe()` 轮询（同条件，卸载即停）。
10. schema 边界：`GateSchema` 只校验形状，`validateGate` 是唯一语义门；解析结果写回前宿主已自校验。

---

## 1. 调研事实（v2–v5 修订）

### 1.1 平台事实（DEV 已核实，直接引用）

| 事实 | 含义 |
|---|---|
| `settings.section` slot 只给 `{ close }`，**没有 sessionId**（`@deepseek-ai/dsh-client-ui-settings` 的 `slots.d.ts:154-157`）。 | 方案 (a)（`remote.commands.execute`）在设置页拿不到可靠 session；先例 `client.js:1432` 是在有 sessionId 的输入区 slot。 |
| `settings` Remote 只有 `describe/update/replace/mutate/openSettingsDocument`，**没有 subscribe**；但 `ctx.remote.$on('settings/document-updated', cb)` 可用。 | 客户端用「事件 + 重读」而非订阅；事件是通知，真源仍是 `describe()`。 |
| `ctx.provide('agentTeamRoles')` 只在 Host 进程内，客户端不可见。 | 客户端不能调用宿主内部服务；只能走 Config/Remote。 |
| 一次性模型调用先例：`dsh-session-title-llm`（`README.zh.md:36-38,75`）用 `ctx.llm.stream({ provider, model, messages, system, maxTokens, sessionId?, purpose?, signal })`，路由来自会话记录或显式覆盖，`purpose` 只做归属标注，请求**不进入对话历史**。 | 辅助请求是平台既有模式；设置页场景没有会话，因此取 `ctx.agentDefaultModel.currentSelection()`（`dsh-agent-default-model/README.zh.md:50-55`）。 |
| 子 agent `ctx.get('subagents').startActivation` 会真的创建成员。 | 不用于一次性解析。 |
| 运行时 desktop `0.2.2-rc.1`。 | 不按全局 npm 0.1.7 写。 |
| volatile 值随 profile patch **持久化到磁盘**；`settings.mutate` 一次多字段原子，任一字段非 volatile 整批失败。 | 请求/结果字段必须 volatile；每次请求/结果各用一次 mutate。 |

### 1.2 客户端→宿主现有桥（v2 选型依据）

| 通道 | 可用性 | 本流程 |
|---|---|---|
| `ctx.remote.settings.describe/mutate` | 已挂载（`dsh-api-settings-controller/lib/typert.remote-client.js:265-346`） | **主通道**：写请求、读结果、最终写 gates |
| `ctx.remote.$on('settings/document-updated')` | 已转发（`app.asar:403290`；声明 `app.asar:2569774-2569776`） | 解析完成/请求被清时唤醒客户端 |
| `ctx.remote.commands.execute(sessionId, line, [])` | 已挂载；需要可信 sessionId 与活跃 agent | 不用（设置页无 sessionId） |
| 新 Typert Remote namespace | 客户端无法在构建期外挂载（`dsh-api-remotes/README.zh.md:77-79`；平台模块表 `app.asar:2774788` 无 `dsh-typert-protocol`） | 不用（引入新平台面） |
| `ctx.get('agentTeamRoles')` | 仅 Host 进程内 | 客户端不可用 |

### 1.3 LLM / 路由 / 输出的事实

- `ctx.llm.stream(options)` 产出 `block-start` / `text-delta` / `usage` / `finish` 等分片，**每个流恰好一个终止 `finish`**；失败为 `{kind:'error', failure}`、取消为 `{kind:'aborted', failure}`（`dsh-llm/README.zh.md:47-57,93-96`）。
- `GenerateOptions`：`{ provider, model, reasoningEffort?, messages, system?, maxTokens?, temperature?, stop?, signal?, sessionId?, purpose? }`（`app.asar:2244699`）。
- `purpose` 是 `LlmRequestPurposeMap` 的键；既有值形如 `assistant`、`compaction`、`auto-review`、`session-title`（`app.asar:854544,917119,2515116`）。本契约用 `agent-team-roles-gate-parse`；适配器不认识该 purpose 也继续处理（`dsh-llm/README.zh.md:61`）。
- `ctx.agentDefaultModel.currentSelection(): { provider, model, reasoningEffort? }`（`dsh-agent-default-model/README.zh.md:50-55`）。该服务不校验模型目录；可用性由发起请求方诊断。
- **模型可见 ⟺ 可从记录重建**（`dsh-llm/README.zh.md:135`）。会话标题把精确请求记到 `session/title-llm-request`（`dsh-session-title-llm/README.zh.md:75`）；本流程没有会话，因此宿主必须把精确请求/响应追加到本插件状态目录的审计文件（§5.7），否则不算满足该不变量。

### 1.4 插件现状（相关行）

- `Config` 全部 volatile：`src/plugin.js:91-104`；`readConfig` 兼容 volatile：`src/config.js:36-41`。
- gate schema/校验：`src/gates.js:18-52,66-110,127-168,170-182`。
- gate 评估：`src/plugin.js:160-233`；`src/gates.js:199-206,222-252`。
- 客户端读写/保存：`client.js:368-390,412-431,531-552`。
- 手动 GateForm 校验：`client.js:903-957`；`upsert`：`client.js:737-743`；编辑态查重缺陷：`client.js:908-910`。
- 双挂载：`client.js:1599-1605`（settings.section）与 `1606-1611`（main）。
- 领域数据位置：`templates/software-dev/template.json:6-41`；`src/` 只做通用引擎（`README.md:7`）。

---

## 2. 方案对比与选择

### (a) 新命令 + `remote.commands.execute`
- 缺可靠 sessionId：`settings.section` 只拿 `{close}`（`slots.d.ts:154-157`）；靠 `ctx.sessions` 猜“当前会话”会踩空/串会话。
- 命令有 Lead/preset 门禁（`src/plugin.js:344-389,468-484`），在设置页跑命令还要有活跃 agent。
- 返回值是文本，客户端得再解析文本或另走 Config，仍然绕不开握手。
- **结论：否决。**

### (b) 新 Typert Remote + `dsh.client.inject`
- 最干净，但需要生成 descriptor、Host 侧注册、把 contribution 挂进应用组合；`dsh-api-remotes` 的能力集合构建期固定（`README.zh.md:77-79`），第三方插件无法只靠 `package.json dsh.client.inject`（那是模块注入）新增 endpoint。
- 需要改 DSH 组合或自带生成工具链，超出本插件“不 fork、不改官方包”的边界（`README.md:25`）。
- **结论：v1 否决；若平台未来提供“插件自定义 RPC”公开扩展点，迁移到它（本契约的 client/host 边界已为其预留）。**

### (c) 配置字段握手（**选中**）
- 客户端 `settings.mutate` 写 `gateParseRequest`（nonce + 原文 + at）并清空旧结果 → 宿主监听 `settings/document-updated` → `ctx.llm.stream` 辅助请求 → 原子写 `gateParseResult` 并清空请求 → 客户端 `$on` 重读 → 回填表单 → 用户点保存 → 现有保存路径写 `gates`。
- 只用现有公开桥，无需 session、无需 Lead/preset、无需新平台面；延迟一次模型调用；可在设置页内完成 `idle→thinking→parsed/error` 状态。
- 代价（必须写清并治理）：原文/结果会持久化；解析不是事务；宿主与客户端通过 Config 做请求/结果握手（本质是侧信道）；多实例并发要靠 revision/nonce 收敛。§4/§5 给出清理与失败路径。

**选择 (c)。** 它是“平台能力约束下的最小实现”，并把不稳定面隔离在 `src/gate-parse.js` + client 的两个 helper 中，未来可无痛切到 (b)。

---

## 3. 数据流（文字图）

```
[设置页 GatesPanel]
   │ 用户输入自然语言（≤4000 字符），点「解析」
   ▼
[client] 一次 settings.mutate（原子）：
   set gateParseRequest = { nonce, text, at }
   set gateParseResult  = { nonce:'', status:'', gates:[], note:'', warnings:[], code:'', detail:'', completedAt:0 }
   │   （失败：settings/conflict → 重读 revision，提示重试；不写 gates）
   ▼
[host] ctx.on('settings/document-updated', (ns) => ns === 'agent-team-roles')
   │  读 Config.gateParseRequest；nonce 去重 / at 过期 / 单飞
   ▼
[host] build prompt（系统指令 + 角色目录 + 用户原文）
   │  ctx.get('llm').stream({ provider, model, messages, system, maxTokens, temperature:0,
   │                          purpose:'agent-team-roles-gate-parse', signal })
   │  审计：追加 gate-parse-audit.jsonl（精确输入/输出）
   ▼
[host] 解析 JSON → normalizeGate → validateGate → 角色存在性 → 自动补 shell 工具 → 生成最终 id
   │  一次 configEditor.edit（原子）：
   │    gateParseRequest = 空
   │    gateParseResult  = { nonce, status:'ok'|'needs-input'|'error', gates, note, warnings, code, detail, completedAt }
   ▼
[client] ctx.remote.$on('settings/document-updated') → 重读 describe()
   │  status=ok      → 预览卡片：[采用]（回填本地 engine.gates / 打开 GateForm）
   │  status=needs-input → 显示缺失信息 + 原文可补充后重新解析
   │  status=error   → 本地化错误 + detail（次要行）
   ▼
[client] 用户点顶部「保存」→ 校验所有 gates（validateGate 镜像 + MAX_GATES）→ 一次 mutate：
   set gates / gatesDisabled / 其它 engine 字段
   （若已采用解析结果：`set gateParseResult = 空结果`；旧 Host 缺该字段时跳过）
   │  失败（settings/conflict 等）→ 只刷新 revision/解析状态，保留本地 engine（R1）
   ▼
[Config.gates] 生效；解析结果按 TTL 清理
```

**关键边界**：`gateParse*` 只承载“请求/结果”，不参与 `evaluateGates`；`gates` 仍只由用户保存动作写入。

---

## 4. Config 契约（Q2）

在 `src/plugin.js:91-104` 的 `Config` 追加两个 **volatile** 字段（原子写；不嵌套在其它字段里）：

```js
/** 一次自然语言解析请求；解析完成后由宿主原子清空。 */
gateParseRequest: z.object({
  nonce: z.string().default('').description('Client-minted request id; dedupes host work.'),
  text: z.string().default('').description('User description, <= 4000 chars; cleared after the parse.'),
  at: z.number().default(0).description('Epoch ms; requests older than 120s are ignored.'),
}).default({}).volatile().description('Pending natural-language gate parse request.'),

/** 最近一次解析结果；不参与 gate 评估，供设置页回填。 */
gateParseResult: z.object({
  nonce: z.string().default('').description('Request id this result answers.'),
  status: z.string().default('').description('ok | needs-input | error.'),
  gates: z.array(GateSchema).default([]).description('Normalized gate drafts; 0..5.'),
  note: z.string().default('').description('Assumptions or the missing-information note; <= 2000 chars.'),
  warnings: z.array(z.string()).default([]).description('Non-fatal normalization notes; <= 10 x 200 chars.'),
  code: z.string().default('').description('Stable error code for status=error (see 5.6).'),
  detail: z.string().default('').description('English diagnostic detail; <= 500 chars; secondary UI line.'),
  completedAt: z.number().default(0).description('Epoch ms; 0 = no result.'),
}).default({}).volatile().description('Latest natural-language gate parse result.'),
```

### 4.1 清理与生命周期（必须实现）

| 时机 | 动作 |
|---|---|
| 客户端发起新解析 | 一次 mutate：`set gateParseRequest={nonce,text,at}` + `set gateParseResult=空`（原子） |
| 宿主解析完成（成功/失败/需要补充） | 一次 `configEditor.edit`：`gateParseRequest=空` + `gateParseResult=最终结果`（原子；原文立刻不再持久化） |
| 宿主发现请求 `at` 超过 120s / nonce 非法 / 空文本 | 写 `status:'error', code:'stale-request'`（或 `empty-text`）并清空请求 |
| 宿主收到新 nonce 时旧解析仍在途 | 中止旧流（abort），旧结果丢弃；**最新请求优先**（单飞，队列深度 1） |
| 客户端取消 | 一次 mutate **`set gateParseRequest=空` + `set gateParseResult=空结果`**（先 `describe()` 判字段存在，旧 Host 缺字段跳过）；宿主在事件回调中发现 nonce 不匹配即 abort；**流返回/写结果前重读 nonce，不匹配即丢弃**（已写入的结果也会被这次清空覆盖） |
| 插件启动时发现遗留请求 | 若 `at` 在 120s 内：调度一次解析；否则写 `stale-request` 并清空 |
| 结果展示有效期 | 客户端：`completedAt` 在 10 分钟内才展示/可消费；超过不等于自动清理（清理由下次请求/保存/丢弃触发），只不可消费 |
| 新请求/保存成功后 | 若已采用该结果，保存的同一次 mutate 里 `set gateParseResult = 空结果`（先用 `describe()` 判字段存在，旧 Host 缺字段时跳过）；否则保留到下次请求/丢弃 |

### 4.2 长度/数量上限

| 字段 | 上限 |
|---|---|
| `request.text` | 4000 字符（client 与服务端都校验） |
| `request.nonce` | 64 字符 |
| `result.gates` | 5 条/次；且 `现有 gates + 5 ≤ MAX_GATES(50)` 由客户端保存时再校验（解析阶段只保证单次 ≤5） |
| 每条 gate | `GateSchema` **只定义形状**：字段类型/默认值/嵌套结构（id/role/pattern 为 string，tool 为 string[]，require 的两个钥匙可省略）。长度/语法/二选一/角色语义不在 shape 行 |
| 语义门 | `validateGate` 是**唯一语义门**：id 语法、tool 1..8、pattern ≤200 且可编译、event XOR commandSuccess、byRoles 非空、commandSuccess 必填、invalidateOn 一致性 |
| schema 边界 | `gateParseResult.gates` 的 schema 只保证形状，宿主写结果前已用 `normalizeGate`+`validateGate` 自校验（见 §5.5） |
| `result.note` | 2000 字符 |
| `result.warnings` | ≤10 条 × 200 字符 |
| `result.detail` | 500 字符 |
| 组装后的 prompt | ≤ 24 KiB（UTF-8；超出 → `prompt-too-large`，不截断，照 `session-title-llm` 的 `maxInputBytes` 语义） |

### 4.3 用户原文是否保存

- **暂存**：`gateParseRequest.text` 会持久化，直到解析完成（通常数秒）；完成后原子清除。
- **结果**：`gateParseResult` **不含**原文；`note`/`warnings` 是模型/宿主生成的说明，不得由代码原样复制 `request.text`（模型若引用，也按 note 长度上限截断）。
- **审计**：宿主把精确模型输入/输出追加到 `$DSH_HOME/agent-team-roles/gate-parse-audit.jsonl`（§5.7），这是“模型可见 ⟺ 可重建”的记录；与 session 日志同一信任边界，需在 README 说明。

---

## 5. 宿主解析服务契约

新增 `src/gate-parse.js`（通用逻辑，零领域词），在 `plugin.js` 的 `apply()` 里安装：

```js
const parser = installGateParser({ ctx, config })   // 返回 { dispose }
ctx.effect(() => () => parser.dispose(), 'agent-team-roles:gate-parse')
```

### 5.1 触发

```js
// payload 兼容 string | { ns }（不同版本转发事件的载荷形态）
ctx.effect(() => ctx.on('settings/document-updated', (payload) => {
  const ns = typeof payload === 'string' ? payload : payload?.ns
  if (ns !== 'agent-team-roles') return
  queueMicrotask(() => { void onSettingsChanged({ sawEvent: true }) })
}), 'agent-team-roles:gate-parse-events')
```

- 只处理本插件 namespace；`ctx.on` 不需要新增 inject。收到事件时对当前 pending nonce 置 `eventSeen=true`，并停止该 nonce 的轮询。
- `onSettingsChanged()`：读 `gateParseRequest`；空/过期/已处理（内存 `lastHandledNonce` 或 `result.nonce` 相同）→ 返回；有在途 → 按 §4.1 中止旧流/记录最新；否则启动解析。
- **读旧值防护**：若事件到达时读到的 `nonce` 与上一次相同、但 revision 已前进，100ms 后重读一次再决定（防止极端情况下 Config 引用晚于事件更新）。
- **宿主轮询（仅兜底）**：正常模式仅在 `gateParseRequest` 非空**且该 nonce 尚未收到事件（`eventSeen=false`）**时启用；延后到 pending ≥2 个轮询周期（约 2s）仍无事件；间隔 1s；一旦 `eventSeen=true`、请求被清空或插件 dispose 立即停止，不得常驻。正常路径必须记录来源 `via event`（日志与审计行带 `source:'event'|'poll'`）；`poll` 仅用于事件不可达时。**停止 poll 不应停止 persist 重试定时器**——二者解耦，否则“收到事件即停 poll”与“persist 重试最多 3 次”无法同时满足（实现发现的契约漏洞，必须按此写）。
- **重试与放弃（give-up）**：首次 + 最多 3 次重试，间隔 `30s → 60s → 120s`，由 **per-nonce 定时器**驱动（`dispose`、nonce 变化、请求被清空时清理定时器）。**persist 失败的重试只重写已缓存的 result，绝不重跑模型**；模型失败不做宿主重试（由用户以新 nonce 重试）。重试耗尽后只 warn/审计并记录 `lastHandledNonce`，**不写 `stale-request`、不主动清请求**；残留请求由客户端在 90s 超时/取消时 `set 空请求 + 空结果` 清除。新 nonce 重置计数与 `eventSeen`。
- **D5 降级例外**：若首日实测证明 `settings/document-updated` 在宿主侧不可达，允许一个**插件生命周期内的轻量 1s ticker**作为降级（只读 `gateParseRequest`，空则立即返回、不做工作；dispose 停止）；这是“轮询仅 pending 时有工作”的唯一例外，README 必须记录降级原因与实测结论。
- 插件启动时：`queueMicrotask(onSettingsChanged)` + 一个短延迟重试，覆盖 crash 遗留（配合 `at` TTL）。
- **D5 可证伪口径**：一次正常解析的日志/审计必须显示 `source:'event'`；只有事件不可达（首日实测失败）时才允许 `source:'poll'`，且 README 记录该降级。

### 5.2 路由与前置检查

```ts
const llm = ctx.get('llm')                      // 可选；缺失 → llm-unavailable
const defaultModel = ctx.get('agentDefaultModel')?.currentSelection?.()
// { provider, model, reasoningEffort? }；缺失/空 → no-route
```

- **不新增 Config 路由覆盖**（本轮）：使用部署默认模型；无默认路由时返回 `no-route`，客户端给“去设置默认模型 / 手动填写”的降级提示。
- 不用会话模型（设置页无会话）；不调用 `subagents`。
- `llm`/`agentDefaultModel` 均不写入 `inject`、不新增 peerDependency（Q9）。

### 5.3 模型调用

```js
const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), 45_000)   // 端到端 45s
const system = GATE_PARSE_SYSTEM_PROMPT                       // 5.4
const user = buildGateParsePrompt({ text, roles, platformShellTool, existingGateIds })
const stream = llm.stream({
  provider, model, reasoningEffort,
  system,
  messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
  maxTokens: 1200,
  temperature: 0,
  signal: controller.signal,
  purpose: 'agent-team-roles-gate-parse',
})
let text = ''
for await (const chunk of stream) {
  if (chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
  // finish 终止；error/aborted → 映射 5.6；其余按成功文本处理（字段以 dsh-llm 类型为准）
}
```

- 只收集 `text-delta`；不解析 reasoning。
- 流返回后**再读一次** `gateParseRequest.nonce`：若已被改/清空 → 丢弃结果，不写 Config（取消语义）。
- 错误映射：`failure.code`（如 `NO_ADAPTER`/`AUTH`/`RATE_LIMIT`/`CONTEXT_WINDOW_EXCEEDED`）→ `detail`；`code` 统一 `llm-error`。超时 → `timeout`；主动取消 → `cancelled`（且通常不写结果）。
- 不做自动重试（v1）；失败由用户点重试。

### 5.4 提示词（宿主拥有；通用，不含领域词）

**系统指令（要点）**：

```text
You translate one user requirement into DSH Agent Team workflow gate drafts.
Output ONLY a JSON object:
{"gates":[{"id"?,"description"?,"deny":{"role","tool":["..."],"commandPattern"?},
           "require":{"event"? | "commandSuccess"?{"role","tool","pattern"},
                      "byRoles"?,"freshFor"?,"invalidateOn"?{"role"?,"tool"?[]}}}],
 "note":"..."}
Rules:
- deny.role / byRoles / commandSuccess.role / invalidateOn.role MUST be ids from the provided roles; never invent ids; never use "lead".
- Exactly one key source per gate (event XOR commandSuccess). event gates need byRoles.
- commandPattern/pattern are JS RegExp sources, JSON-escaped, <=200 chars.
- For command patterns, list BOTH shell tool ids from the prompt (`bash` and `pwsh`); the prompt also names the platform shell.
- freshFor is integer seconds; 0/omit = valid until invalidated.
- description: same language as the user's requirement. ids/events: lowercase kebab-case.
- If key information is missing, return {"gates":[],"note":"<what you need>"} instead of guessing.
- No prose outside the JSON object.
```

**用户输入（由宿主组装）**：

```text
roles: <JSON: [{id,name,description,tools?}]>
existing gate ids: <JSON string[]>
shell tools: ["bash","pwsh"]        // 两个都给，命令型必须都列
platform shell: <'pwsh' on win32 else 'bash'>
user requirement:
<text>
```

- 角色目录来自 `mergeRoles(readConfig(config,'roles'))`（`src/config.js:92-96`），让模型用合法 id。
- 语言：`description` 跟用户语言；结构化 id 一律 ASCII kebab-case。
- 提示词不含 `git`/`review`/`dev` 等领域示例（领域知识来自用户输入与 roles 数据）。

### 5.5 输出解析与校验

1. 提取 JSON：去 ```json 围栏；取首个 `{` 到末个 `}`；`JSON.parse`。失败 → `invalid-output`。
2. 顶层形状：`gates` 必须为数组（若直接给单 gate 对象，容忍为 1 条）；`note` 字符串；未知字段**忽略不落盘**。**schema 边界**：`GateSchema` 只校验形状，`validateGate` 是唯一语义门；`gateParseResult.gates` 的 schema 只保证形状，宿主写结果前必须先自校验（见第 4 步）。
3. `gates.length === 0` 且 `note` 非空 → `status:'needs-input'`（否则 `invalid-output`）。
4. 每条：`normalizeGate` → `validateGate`；再补：
   - 所有角色引用 ∈ 已配置角色（含 `general`），且 ≠ `lead`（Lead 不被 gate 评估，`src/plugin.js:160-169`）；未知角色 → `invalid-output`；
   - 列表长度先显式检查 1..8；`normalizeGate` 的截断行为不得被用来“静默修复”超限；
   - `commandPattern`/`pattern` 可编译（`validateGate` 已查）；为空字符串不得出现在最终 gate；
   - 命令型（`commandPattern` 非空）：`deny.tool` 自动补 `bash` 与 `pwsh`（去重），并把补充写进 `warnings`；**补齐后若 >8，整批 `invalid-output`**（不得截断）；
   - `byRoles` 在 `commandSuccess` 下可保留（评估器忽略），或置空，二者等价（建议保留以匹配现有 GateForm 形状）；
   - `invalidateOn.role` 为空 = **任一成员（不含 Lead）**；Lead 本就不被 gate 评估（`src/plugin.js:160-169`）。
5. **元数据 clamp**（不因长度失败）：`note` 截断到 2000 字符、`warnings` 最多 10 条且每条 200 字符、`detail` 截断到 500 字符；发生截断时追加一条 warning（例如 `note truncated`），仍按 `ok`/`needs-input` 返回。
6. **最终 id 由宿主生成**（Q4/Q6，可执行规则）：
   - 若模型给了 `id`：小写/清洗为 kebab-case，**先截断到 ≤62 字符**；
   - 截断后仍不满足 `GATE_ID`（空 / 数字开头 / 含非法字符 / 超长）→ 直接用 **`gate-<nonceHash6>`**（nonce 哈希的 base36 前 6 位，例如 `gate-1a2b3c`）；
   - 合法候选与现有 gates 或本批重复 → 追加 `-2`、`-3`…（**先 ≤62 再加后缀，追加后总长 ≤64**）；
   - **绝不覆盖现有 gate**。最终 id 写进结果，客户端展示的就是最终 id。
7. 数量：单次 ≤5；超出 → `invalid-output`（detail 说明）。
8. 全部通过才生成 `status:'ok'`；任一失败整体失败（不部分写入）。

### 5.6 结果与稳定错误码

```ts
gateParseResult = {
  nonce: string
  status: 'ok' | 'needs-input' | 'error'
  gates: Gate[]           // status=ok 时 1..5；其它为 []
  note: string            // needs-input 的补充要求 / ok 的假设说明
  warnings: string[]
  code: string            // status=error 时必填（下表）
  detail: string          // 英文诊断，仅作次要展示
  completedAt: number
}
```

| code | 触发 | 客户端文案 key / 处理 |
|---|---|---|
| `empty-text` | trim 后为空 | `gateParseErrEmpty` |
| `text-too-long` | >4000 字符 | `gateParseErrTooLong` |
| `prompt-too-large` | 组装后 >24KiB | `gateParseErrPromptTooLarge`（单独文案） |
| `no-route` | 无 `agentDefaultModel` 选择 | `gateParseErrNoRoute` |
| `llm-unavailable` | `ctx.get('llm')` 缺失 | `gateParseErrUnavailable` |
| `llm-error` | 流失败（detail=provider code） | `gateParseErrLlm` |
| `timeout` | 45s 未完成 | `gateParseErrTimeout` |
| `cancelled` | 用户取消/配置被清 | `gateParseErrCancelled` |
| `invalid-output` | JSON/字段/正则/角色非法 | `gateParseErrInvalid` |
| `stale-request` | 请求超过 120s 才被处理 | `gateParseErrStale` |
| `unknown` | 兜底 | `gateParseErrUnknown` |

> `persist-failed` **不是客户端可见码**：宿主写结果失败只进审计（`code:'persist-failed'` + warn），客户端不显示该码；用户侧由 90s 超时兜底（`gateParseErrTimeout` / thinking 超时提示）后重试或手动填写（D7）。

**显示规则**：客户端按 `code` 翻译；`detail` 作为次要灰色行（允许英文）显示，便于排障。**不得**把英文 `detail` 当作唯一提示。

### 5.7 审计（模型可见 ⟺ 可重建）

- 每次解析向 `$DSH_HOME/agent-team-roles/gate-parse-audit.jsonl` 追加一行：
  ```json
  {"at":0,"nonce":"…","source":"event|poll","provider":"…","model":"…","purpose":"agent-team-roles-gate-parse",
   "system":"…","input":"…","output":"…","code":"","detail":""}
  ```
- `source` 记录解析是由事件还是轮询触发（D5 可证伪）；正常路径必须是 `event`。
- 失败也记录（`code`/`detail`，含 `persist-failed`），照 `session-title-llm` “生成失败仍保留请求记录”的做法。
- 轮转：>1 MiB 时重命名为 `gate-parse-audit.1.jsonl`（覆盖旧档），只需保证最近记录可查；写失败只记 warn，不影响解析结果。
- 复用 `src/store.js` 的 `stateDir()`；不新增配置项。

### 5.8 并发与失败路径（Q1 要求）

| 场景 | 行为 |
|---|---|
| 两次请求快速到达 | 单飞；旧流 abort；只处理最新 nonce |
| 客户端在解析中关闭页面 | 宿主照常完成并写结果；客户端重开后按 `completedAt` 展示（≤10min 为可消费窗口；结果不自动清理） |
| 客户端取消 | 写空请求 → 宿主事件回调 abort 当前流；**流返回/写结果前重读 nonce，不匹配即丢弃**；若宿主已完成并写入，客户端以“无 pending”忽略 |
| `configEditor.edit` 失败 | 审计 `persist-failed` + warn；**只重写缓存 result、不重跑模型**；由 per-nonce 定时器重试（首次 + ≤3 次，30/60/120s）；**每次写前重读 `gateParseRequest.nonce`，不匹配即丢弃（retry 路径同样适用）**；客户端 90s 超时/取消时清空请求+结果（该码不显示给用户） |
| 重试耗尽（give-up） | 只 warn/审计并记录 `lastHandledNonce`；**不写 `stale-request`、不主动清请求**；残留请求由客户端 90s 超时/取消 `set 空请求+空结果` 清除 |
| 取消后结果“复活” | 宿主写结果前重读 nonce，不匹配即丢弃；客户端 `matchesPending = pendingNonce !== '' && result.nonce === pendingNonce`，pending 为空时恒为 false，不展示/不消费旧结果 |
| 插件卸载/重启 | dispose abort 在途流；遗留请求按 `at` TTL 处理 |
| 多设置页实例 | 同一结果字段，后写者覆盖；revision 冲突由客户端保存路径处理 |

---

## 6. 客户端契约

### 6.1 解析触发（GatesPanel）

```
[用自然语言新增] → 小对话框（textarea ≤4000、字数、错误条）
  → [解析] → 一次 settings.mutate：
       set gateParseRequest  = { nonce: crypto.randomUUID(), text: trimmed, at: Date.now() }
       set gateParseResult   = 空结果
     （用当前 describe 的 revision；失败 settings/conflict → 重读 revision 并提示重试，不写 gates）
  → 进入 thinking：spinner + [取消]
```

- 前置：`describe().writable === true`、`ctx.remote.settings` 存在、namespace value 含 `gateParseRequest`/`gateParseResult`（旧 Host 缺字段 → 禁用 AI 入口给 `gateAiUnavailable`）；否则禁用入口并给 `settingsUnavailable`。
- 客户端在 thinking 期间：每个 nonce 维护 `eventSeen`。订阅 `$on('settings/document-updated')`；**收到事件即置 `eventSeen=true` 并清除轮询定时器**。2s `describe()` 轮询**首个 tick 延后 ≥4s（2 个周期）**且仅当 `eventSeen=false` 时启动，使用 **`setTimeout` 链**（每次完成后排下一次），不用固定 `setInterval`；`$on`、轮询、90s 计时器都必须随组件卸载/取消/解析结束清理（`ctx.effect`/`useEffect` cleanup，不得遗留）。**每次 mutate 成功后都用响应更新 `setRevision`**（请求、取消、保存、清结果都一样）。
- 90s 超时：视为放弃，执行与「取消」相同的清理 —— 一次 mutate **`set gateParseRequest=空` + `set gateParseResult=空结果`**；UI 回 idle（可重试）。
- 取消：一次 mutate **`set gateParseRequest=空` 与 `set gateParseResult=空结果`**；UI 回 idle。宿主在事件中 abort；若结果在清空前已写入，会被这次清空覆盖（用户取消即丢弃）。
- 重试：用新 nonce 重发同一文本（旧结果被清，`eventSeen` 重置）。

### 6.2 结果处理

- 读 `gateParseResult`：定义 `matchesPending = pendingNonce !== '' && result.nonce === pendingNonce`；**只有 `matchesPending === true` 才可自动消费**。`pendingNonce` 为空（idle/已取消/已超时）时恒为 false，旧结果不得自动“复活”或展示为可操作。**例外（用户主动）**：用户显式点「采用」一个已完成的 result 时，可先把 `pendingNonce` 设为该 `result.nonce` 再执行采用；取消/超时会清空结果字段，因此没有可复活对象。陈旧 nonce 的结果只展示为“过期”，不得采用。
  - `completedAt` 为 0 或超过 10 分钟 → 不作为可消费结果；**客户端不自动清理**（清理由下一次请求/保存/「丢弃」触发），10 分钟只是展示/消费窗口。
  - `status === 'ok'`：预览卡片（复用 GateCard 的只读摘要，`client.js:778-869`），每条显示最终 id、deny、key、warnings/note。操作：
    - 「采用」：**本地**校验（§6.4）后加入 `engine.gates`（create 语义），标记 `parseConsumedNonce = result.nonce`；不写盘。危险 gate（全 shell 拦截 / 自批自放）必须先通过 `gateParseWarnAck` 确认（`gateParseWarnAllShell`/`gateParseWarnSelfKey`）。
    - 「全部采用」：逐条采用，任一条非法/未确认危险警告则整体不采用并报错。
    - 「忽略」：**只丢该条预览**（当前挂载的本地列表），结果字段保留、不写盘；重新挂载后可能再次出现（持久化结果仍在），不视为“丢弃结果”。
    - 「丢弃结果」（`gateParseDiscardResult`）：**整条丢弃 + 二次确认**，一次 mutate `set gateParseResult=空结果`；只在结果已完成时可点，不取消仍在进行的解析（取消用「取消解析」）。
    - 采用成功显示 `gateParseToastAdopted` + `gateParseUndo`；Undo 只撤销尚未保存的本次采用。
  - `status === 'needs-input'`：显示 `note` + 「补充描述并重试」（预填原文）→ 新请求。
  - `status === 'error'`：显示 `code` 的本地化文案 + `detail` 次要行；保留原文供重试；提供「手动填写」入口。
- 采用后的 gate 可在现有 GateForm 中编辑（edit 语义，`originalId` = 采用时的 id）。
- **不直接写 `gates`**；只有顶部「保存」落盘。
- 保存时若 `parseConsumedNonce === 当前 result.nonce`，在同一次 mutate 中用 **`set gateParseResult = 空结果`** 清除（不使用未定义的 `unset` op）；写入/清理前先 `describe()` 判断字段存在，旧 Host 缺 `gateParse*` 字段时跳过该 op，而不是让整批 mutate 失败。
- `gateParseResult` **不会自动清理**：10min 只是展示/消费窗口，字段会留在 profile 配置里，直到下一次请求、保存（已采用）或用户「丢弃」；README 必须披露（D1）。

### 6.3 自动刷新与 R1

- 收到 `settings/document-updated` 且 `ns === NS`：
  - `!dirty && !busy`：完整 `load()`（更新 revision、gates、parse 状态等）。
  - `dirty`：只更新 `parse` 状态与 `revision`（新 helper `refreshParseAndRevision()`），**不覆盖** roles/engine 本地编辑；显示 `gateParseSettingsUpdated` 提示。
- `saveEngine` 失败：**不得** `await load()`（现状 `client.js:546-548` 会覆盖本地）。改为：
  ```js
  catch (caught) {
    setError(...)
    const view = await readNamespace(ctx)   // 只取 revision 与 parse 字段
    setRevision(view.revision)
    // 保留 engine/roles/rules 本地值，包含已采用的解析结果
  }
  ```
  冲突时用户可再次保存（新 revision），避免“解析结果被静默丢弃”。

### 6.4 保存前校验（R4）

`saveEngine` 在 `writeNamespaceFields` 之前（R4 边界见 §12），按“本次是否改动了 gates”分档：

1. **基线跟踪**：`load()` 时记录 `gatesBaseline = 逐条 normalizeGate(深拷贝(engine.gates))`；保存前把 `engine.gates` 同样逐条规范化后与基线做**深比较**（id/字段/顺序；忽略 schema 默认空对象差异）。比较口径固定为“规范化后深比较”，不得直接比原始对象，避免分档漂移。
2. **未改动 gates（规范化后与基线一致）**：legacy 非法 gate、引用已删角色的 gate **只警告、不阻塞**保存（其它字段照常写入）；警告列出 gate id/原因。
3. **改动了 gates**：必须全部合法 —— 逐条 `validateGateObject`（语义） + 条数 ≤ `MAX_GATES(50)` + **id 集合唯一** + **角色存在性**（`deny.role`/`byRoles`/`commandSuccess.role`/`invalidateOn.role` 均在**当前 Host 已保存的 roles**（`describe().value.roles` + 内置 `general`）中，且 ≠ `lead`）；任一失败不 mutate。若用户同时改了 roles 但尚未保存，先保存 roles 再保存 gates。
4. **`gatesDisabled` 过滤（要求实现，始终执行）**：仅保留仍存在于最终 `gates` 的 id；无论 gates 是否改动都写入过滤后的集合。
5. 失败：`setError` 指出 gate id 与原因，**不 mutate**；本地内容保留，用户可修复/删除后重存。
6. 全部通过才 mutate；写 `gateParseResult`/清空时先 `describe()` 判字段存在；旧 Host 缺字段则跳过该 op（不阻断 gates 保存）。
7. **保存成功回写**：`engine.gates` 与 `engine.gatesDisabled` **必须采用宿主返回的 `view.value.gates` / `view.value.gatesDisabled`**（不是本地提交值），`revision` 用响应值更新，并用返回的 gates 重置 `gatesBaseline`（同样逐条 normalize + 深拷贝）。

### 6.5 GateForm / upsert 修复（Q6）

- `GateForm` 改为 `mode: 'create' | 'edit'` + `originalId?: string`：
  - 查重：`existingIds.filter(id => id !== originalId)`；create（含解析采用）必须查重，edit 允许改 id 但不得与其它 gate 冲突。
  - 从 `submit` 抽出 `formFromGate` / `gateFromForm` / `validateGateInput`，供手动表单、解析采用、保存兜底共用。
- `upsert(gate, { mode, originalId })`：
  - create 且 id 已存在 → 返回错误（不覆盖）；
  - edit 且 id 改名 → 用 `originalId` 替换原项并删除旧 id（修掉当前按新 id 匹配导致旧项残留的潜在问题）；
  - edit 同 id → 原位替换。
- 解析采用走 create 语义；编辑已采用项走 edit 语义（`originalId` 记录采用时的 id）。

### 6.6 最小持久化边界（R2/R3）

- **持久化（Config/磁盘）**：`gateParseRequest`（解析期间，完成即清）、`gateParseResult`（**10min 只是展示/消费窗口，不是自动清理**；字段保留至下一次请求、保存（已采用）或用户「丢弃」）、用户保存后的 `gates`。
- **不持久化（组件局部）**：对话框开关、textarea、thinking 计时、已采用但未保存的 `engine.gates` 修改、表单草稿。
- 两个挂载点（settings.section / main）各自独立的 `SettingsSection` 实例共享 Config；事件驱动重读后两端都能看到解析结果。**切 tab** 在同一个 `SettingsSection` 挂载内会保留外层 `engine` state（`client.js:394,403`），不受影响；**关设置页/切到另一挂载点/刷新** 后，靠 `gateParseResult` 恢复解析结果，重新采用即可。
- 本轮不引入全局 store；若未来要求“未保存的采用项跨挂载保留”，再评估服务化，不在本轮。
- **生命周期**：`$on`、2s 轮询、90s 计时器都必须绑定组件生命周期，在卸载/取消/解析结束时清理（`ctx.effect` 或 `useEffect` cleanup）；两个挂载点各自管理，不共享定时器。

---

## 7. UI 状态机（idle / thinking / parsed / error）

| 状态 | 进入条件 | 界面 | 出口 |
|---|---|---|---|
| `idle` | 无 pending 请求、无新鲜结果 | 两个新增入口；已有 gate 列表 | 打开对话框 |
| `thinking` | 已写 `gateParseRequest`，结果未到 | 对话框内 spinner、`gateAiThinking`、[取消]；90s 倒计时 | 事件/轮询读到结果；或本地超时；或取消 |
| `parsed` | 结果 `status=ok`（1..5 gates） | 预览卡片：[采用]/[全部采用]/[忽略]；note/warnings | 采用 → 回填本地；重试 → thinking；关闭 → idle |
| `needs-input` | 结果 `status=needs-input` | 显示缺失信息 + 原文可补充 + [重新解析] | 重新解析 → thinking |
| `error` | 结果 `status=error` / 本地超时 / mutate 失败 | `gateParseErr*` 本地化文案 + detail 次要行 + [重试]/[手动填写] | 重试 → thinking；手动 → 现有 GateForm |
| `saving` | 顶部保存进行中 | 保存按钮 saving | 成功 → idle；失败 → error（保留本地） |

`idle → thinking → parsed → (采用) → 用户编辑 → saving → idle` 是主路径；任何一步失败都保留本地可编辑内容。

---

## 8. 错误与降级（必须实现）

| 场景 | 行为 |
|---|---|
| 无 settings Remote / `writable=false` | 禁用 AI 入口（`settingsUnavailable`）；手动表单照常（保存会失败，与现状一致） |
| 无 `ctx.get('llm')` / 无默认模型 | 宿主写 `llm-unavailable` / `no-route`；客户端本地化提示 + 手动入口；**不新增 Config 路由覆盖** |
| 模型失败/超时 | `llm-error`/`timeout`；结果写回；原文保留在对话框（若仍打开）供重试；不写 gates |
| 模型输出非法 | `invalid-output`（detail 指出字段）；不写 gates；可重试 |
| 信息不足 | `needs-input` + note；客户端提示补充，不猜 |
| 多条 gate | 一次最多 5 条；全部校验通过才 `ok`；不部分落盘 |
| 请求过期/遗留 | `stale-request`；清空请求；客户端提示重试 |
| 取消 | `set 空请求+空结果`；宿主 abort；流返回/写结果前重读 nonce，不匹配即丢弃；即使已写入也会被这次清空覆盖 |
| 事件丢失 | 宿主 `eventSeen=false` 时仅 pending ≥2 周期后 1s 轮询；客户端 thinking 期间 `eventSeen=false` 且 pending ≥2 周期时 2s `describe()` 轮询兜底；90s 超时后清空请求+结果；提供手动「刷新」重读；重开设置页也能读到结果 |
| 保存冲突 | 保留本地 engine 与已采用项；只刷新 revision；提示重试 |
| 非法 legacy gate（未改动 gates） | 只警告不阻塞（§6.4 第 2 档）；改动了 gates 时才拦截并指出 id |
| 解析结果过期 | 客户端不消费（>10min），但**不自动清理**；可「丢弃」清空；不阻塞手动路径 |
| `configEditor` 缺失/写入持续失败 | 只 warn/审计（`persist-failed`）+ 记录 `lastHandledNonce`；不写 `stale-request`、不清请求；客户端 90s 超时/取消时清空；手动路径不受影响 |

---

## 9. i18n 约定（键名/占位符规则）

- 自然语言流程统一用**扁平 camelCase key**：入口/thinking/无障碍/提示用 `gateAi*`，结果/错误/校验/摘要用 `gateParse*`；注册在 `client.js` 的 `zh`/`en` 字典里，`t('gateAiAdd')` 直接命中。
- **点号键方案（`gates.nlg.*`）已废弃**：不依赖“locale 是否把 `.` 当路径分隔”这一未验证假设；平台现有 `gate*` 也是扁平直查。
- **文案内容由 PM 提供；key 名、占位符名、分段拼装规则以本契约为准**。PM 文案包若与本清单有差异，以本清单改名/补键；任何新增 key 必须先登记到 §10。
- 旧的手动闸门 key（`gateForm*`/`gateErr*`/`gateDeny` 等）保持不变；`gateAi*`/`gateParse*` 只服务自然语言流程。
- 占位符统一 `{name}`；值按**纯文本**替换（React 自动转义，不得含 HTML）；缺失段传空串 `''` 并跳过（不保留字面 `{...}`）。
- 列表（工具/角色/警告）先在 JS 侧用 `gateParseListSep` 拼接成字符串再传入；不要把数组直接交给 `t`。
- 中英必须成对；漏 key 会显示 key 本身，视为阻塞缺陷。

---

## 10. i18n 文案契约（扁平 `gateAi*` / `gateParse*`；PM 提供文案，键名以本契约为准）

> 共 **83** 个 key（相对 v4：新增 `gateParseDiscardResult`；其余键名/占位符不变）。`zh`/`en` 同 key；下表“占位符”为**由数据/状态注入**的变量，“用途”描述该 key 出现的状态。数值类占位符由 client 格式化后传入（如 `{age}` 传“3 分钟”而非毫秒）。

### 10.1 入口与对话框（12）

| key | 占位符 | 用途/语义 |
|---|---|---|
| `gateAiAdd` | — | GatesPanel 上的「用自然语言新增」按钮 |
| `gateAiTitle` | — | 对话框标题 |
| `gateAiHint` | — | 对话框说明：描述什么、解析后可确认再保存 |
| `gateAiPlaceholder` | — | textarea placeholder（示例句） |
| `gateAiSubmit` | — | 提交解析按钮 |
| `gateAiCancel` | — | 取消按钮 |
| `gateAiClose` | — | 关闭对话框（× / Esc） |
| `gateAiCharCount` | `{count}` `{max}` | 字数计数 `count/max` |
| `gateAiEmpty` | — | 空描述提交提示 |
| `gateAiTooLong` | `{max}` | 超过 4000 字符 |
| `gateAiUnavailable` | — | 无 settings Remote / 功能不可用 |
| `gateAiReadonly` | — | `describe().writable === false`，只读 |

### 10.2 thinking（4）

| key | 占位符 | 用途/语义 |
|---|---|---|
| `gateAiThinking` | — | 解析中标题 |
| `gateAiThinkingHint` | — | 解析中说明（通常数秒） |
| `gateAiCancelParse` | — | 取消解析按钮 |
| `gateAiThinkingTimeout` | `{seconds}` | 客户端 90s 兜底超时提示 |

### 10.3 结果与操作（17）

| key | 占位符 | 用途/语义 |
|---|---|---|
| `gateParseResultTitle` | — | 解析结果区标题 |
| `gateParseResultHint` | — | 结果说明：采用后进入本地列表，保存才生效 |
| `gateParseResultCount` | `{count}` | 结果条数（1..5） |
| `gateParseNeedsInput` | `{note}` | `status=needs-input` 的缺失信息说明 |
| `gateParseAdopt` | — | 单条「采用」 |
| `gateParseAdoptAll` | — | 「全部采用」 |
| `gateParseIgnore` | — | 「忽略」单条 |
| `gateParseRetry` | — | 「重试」解析 |
| `gateParseManual` | — | 「手动填写」跳转现有 GateForm |
| `gateParseDetail` | `{detail}` | 错误详情次要行（英文可） |
| `gateParseCode` | `{code}` | 稳定错误码次要行 |
| `gateParseWarnings` | `{warnings}` | warnings 拼接串 |
| `gateParseNote` | `{note}` | 成功结果的假设说明 |
| `gateParseToastAdopted` | `{ids}` | 采用成功 toast（单条传一个 id，批量传逗号/列表拼接后的 ids；带「撤销」） |
| `gateParseUndo` | — | 采用后的「撤销」动作；只撤销未保存的本地采用 |
| `gateParseDiscardResult` | — | **整条丢弃**解析结果（按钮 + 二次确认；清空 `gateParseResult`，与单条「忽略」区分） |
| `gateParseStale` | `{age}` | 结果超过 10min，提示丢弃 |

### 10.4 错误（15）

| key | 占位符 | 用途/语义 |
|---|---|---|
| `gateParseErrEmpty` | — | `empty-text` |
| `gateParseErrTooLong` | `{max}` | `text-too-long` |
| `gateParseErrPromptTooLarge` | — | `prompt-too-large`（单独文案，不与 tooLong 混用） |
| `gateParseErrNoRoute` | — | `no-route`（无默认模型） |
| `gateParseErrUnavailable` | — | `llm-unavailable` |
| `gateParseErrLlm` | `{detail}` | `llm-error`（detail=provider code） |
| `gateParseErrTimeout` | — | `timeout` |
| `gateParseErrCancelled` | — | `cancelled`（用户取消时通常不展示） |
| `gateParseErrInvalid` | `{detail}` | `invalid-output` |
| `gateParseErrStale` | — | `stale-request` |
| `gateParseErrUnknown` | — | `unknown` 兜底 |
| `gateParseErrConflict` | — | 保存/请求 `settings/conflict` |
| `gateParseErrLimit` | `{max}` | 保存时超过 `MAX_GATES` |
| `gateParseErrLegacyGate` | `{id}` | 保存被拦截的非法 gate id |
| `gateParseErrRequestFailed` | — | 写请求 mutate 失败（非 conflict 的其它 Host 错误） |

> **`persist-failed` 无客户端 key**：宿主写结果失败只进审计（`code:'persist-failed'`），客户端不显示该码；用户侧由 90s 超时兜底（`gateParseErrTimeout` / thinking 超时提示）后重试或手动填写。

### 10.5 校验与采用（10）

| key | 占位符 | 用途/语义 |
|---|---|---|
| `gateParseValidateId` | `{id}` | gate id 不合法（采用前兜底校验） |
| `gateParseValidateDuplicate` | `{id}` | 与现有 gate 重复（create 语义） |
| `gateParseValidateTools` | — | deny.tool 为空/超 8 |
| `gateParseValidatePattern` | — | 正则不可编译或超 200 |
| `gateParseValidateEvent` | — | event 缺失/非 kebab-case |
| `gateParseValidateByRoles` | — | byRoles 为空 |
| `gateParseValidateCommandSuccess` | — | commandSuccess 必填项缺失 |
| `gateParseValidateInvalidate` | — | invalidateOn 一致性失败 |
| `gateParseValidateRole` | `{role}` | 角色不在当前配置（解析层本应拦截，client 兜底） |
| `gateParseValidateLimit` | `{max}` | 采用后超过上限 |

### 10.6 摘要拼装（扁平 `gateParseSum*` / 单位；17）

摘要只用于预览/确认卡片，**不是**可回写的数据；拼装顺序固定为 `deny → key → invalidate`，缺失段跳过。分隔符统一 `gateParseSumSep`。

| key | 占位符 | 用途/语义 |
|---|---|---|
| `gateParseSumTemplate` | `{deny}` `{key}` `{invalidateBlock}` | 整条摘要：`{deny} → {key}{invalidateBlock}` |
| `gateParseSumDeny` | `{role}` `{tools}` `{patternBlock}` | 拦截段：`@ {role} {tools}{patternBlock}` |
| `gateParseSumPattern` | `{pattern}` | patternBlock 本体：`/{pattern}/`；无 pattern 时传 `''` |
| `gateParseSumKeyEvent` | `{event}` `{byRoles}` `{freshForBlock}` | 事件钥匙段：`"{event}" ← {byRoles}{freshForBlock}` |
| `gateParseSumKeyCommand` | `{role}` `{tools}` `{patternLabel}` `{freshForBlock}` | 命令成功钥匙段：`{role} · {tools} {patternLabel}{freshForBlock}` |
| `gateParseSumInvalidate` | `{role}` `{tools}` | 作废段：`{role} 使用 {tools}`；`role` 空时用 `gateParseSumAnyRole`（空 = 任一成员，不含 Lead） |
| `gateParseSumFreshForever` | — | `freshFor` 为 0/缺省时的钥匙有效期文案 |
| `gateParseSumFreshFor` | `{value}` `{unit}` | `value` 为整数；`unit` ∈ `gateParseUnit*` |
| `gateParseUnitSecond` | — | 秒单位 |
| `gateParseUnitMinute` | — | 分钟单位 |
| `gateParseUnitHour` | — | 小时单位 |
| `gateParseSumAny` | — | `commandSuccess.pattern === ''` 时的 patternLabel 变体（Any） |
| `gateParseSumAnyRole` | — | `invalidateOn.role === ''` 时的角色变体（Any role / 任一成员，不含 Lead） |
| `gateParseSumNone` | — | 无法拼装时的兜底（理论上不应出现） |
| `gateParseSumSep` | — | 摘要段分隔符（zh ` · ` / en ` · `） |
| `gateParseListSep` | — | 列表分隔符（zh `、` / en `, `） |
| `gateAiFreshHint` | — | 表单/预览里对 freshFor 的说明（**权威 key**；不再复用 `gateFreshHint`） |

**拼装与占位符语义（必须按此实现）**：

1. `tools` / `byRoles`：数组 → `join(gateParseListSep)`；空数组不得传 `''` 给 `gateParseSumDeny`/`gateParseSumKeyEvent`（非法 gate 不渲染摘要）。
2. `patternBlock`：`deny.commandPattern` 非空 → `' ' + gateParseSumPattern`（即 ` /{pattern}/`，`gateParseSumPattern` 本体不含前导空格）；为空 → `''`（整段消失，不留 `/ /` 或尾随空格）。
3. `patternLabel`：`commandSuccess.pattern` 非空 → 同 patternBlock 规则；为空 → `gateParseSumAny`。
4. `freshForBlock`：由 `freshFor` 决定，**始终有值**：
   - `0` / 缺省 → `gateParseSumFreshForever`；
   - `>0` 且 `%3600===0` → `gateParseSumFreshFor` + `gateParseUnitHour` + 值 `freshFor/3600`；
   - `>0` 且 `%60===0` → `gateParseSumFreshFor` + `gateParseUnitMinute` + 值 `freshFor/60`；
   - 其它 `>0` → `gateParseSumFreshFor` + `gateParseUnitSecond` + 原值。
   拼装时 `freshForBlock = gateParseSumSep + freshLabel`。
5. `invalidateBlock`：`require.invalidateOn` 不存在或 `tool` 为空 → `''`；否则 `gateParseSumSep + gateParseSumInvalidate`（role 为空用 `gateParseSumAnyRole`，语义 = **任一成员，不含 Lead**；tools 用 listSep 拼接）。
6. `gateParseSumTemplate` 里 `{invalidateBlock}` 为空串时直接消失（不留尾部分隔符）；`deny`/`key` 两段必有。
7. 所有 `{...}` 只做一次字符串替换；替换值里即使含 `{}` 也不二次展开。未知占位符 → 替换为空串并在 dev 日志 warn（不显示给用户）。
8. `{count}`/`{max}`/`{value}` 必须是十进制整数；`{age}`/`{seconds}` 为已本地化的时长字符串或整数秒，由 client 决定并在此固定（`{age}` 传“3 分钟”这类人类可读串；`{seconds}` 传整数秒）。

**拼装示例（zh；仅供 DEV/TSE 对拍，文案最终由 PM 定）**：

- 事件钥匙 + 作废：
  `deny = {role:'dev', tool:['bash','pwsh'], commandPattern:'\\bgit\\s+commit\\b'}`
  `require = {event:'review-approved', byRoles:['cr'], freshFor:0, invalidateOn:{role:'dev', tool:['write','edit']}}`
  拼装：
  `gateParseSumDeny` → `@ dev bash、pwsh /\bgit\s+commit\b/`
  `gateParseSumKeyEvent` → `"review-approved" ← cr · 永久有效`
  `gateParseSumInvalidate` → `dev 使用 write、edit`
  `gateParseSumTemplate` → `@ dev bash、pwsh /\bgit\s+commit\b/ → "review-approved" ← cr · 永久有效 · dev 使用 write、edit`
- 命令成功钥匙 + 空 pattern（Any 变体）+ 4 小时：
  `require = {commandSuccess:{role:'tse', tool:['pwsh'], pattern:''}, freshFor:14400}`
  拼装：
  `gateParseSumKeyCommand` → `tse · pwsh Any · 4 小时内有效`
  `gateParseSumTemplate` → `{deny} → tse · pwsh Any · 4 小时内有效`
- 无 invalidateOn / 无 commandPattern：对应 `patternBlock=''`、`invalidateBlock=''`，模板里不留 `/ /`、不留尾随分隔符。
- `invalidateOn.role === ''`：作废段角色显示 `gateParseSumAnyRole`（任一成员，不含 Lead；Lead 本就不被 gate 评估）。

### 10.7 危险警告与确认（3）

采用前对“危险 gate”显示警告；用户必须确认（`gateParseWarnAck`）后才能采用。警告由 client 根据 gate 结构判定，不依赖模型文案。

| key | 占位符 | 用途/语义 |
|---|---|---|
| `gateParseWarnAllShell` | — | **条件**：`deny.tool` 含 shell 工具（`bash` 或 `pwsh`）且 `deny.commandPattern` 为空 → 该 gate 会拦截该角色的全部 shell 命令（整工具拦截） |
| `gateParseWarnSelfKey` | — | **条件**：钥匙产生者包含被拦截角色自身（`require.byRoles` 含 `deny.role`，或 `require.commandSuccess.role === deny.role`）→ 自批自放 |
| `gateParseWarnAck` | — | **复选框标签 + 采用前置校验**：勾选后才允许「采用/全部采用」；未勾选时按钮禁用并提示 |

> 警告只在上述**条件为真**时显示；`gateParseWarnAck` 是确认控件文案，本身不是“defined 即警告”。危险判定由 client 按 gate 结构计算，不依赖模型文案。

> 已删除未落地的危险键：`gateParseWarnCatchAll`、`gateParseWarnRole`（不实现、不登记）。忽略动作**无 toast**（`gateParseToastIgnored` 已删除）。

### 10.8 无障碍与通知（5）

| key | 占位符 | 用途/语义 |
|---|---|---|
| `gateAiA11yDialog` | `{title}` | 对话框 `aria-label` |
| `gateAiA11ySpinner` | — | 解析中 `role=status` 文案 |
| `gateAiA11yError` | — | 错误 banner `role=alert` |
| `gateAiA11yResult` | — | 结果区 `role=status` |
| `gateParseSettingsUpdated` | — | 配置在别处更新时的提示（**权威 key**；不再用 `settingsUpdatedElsewhere` 兜底） |

### 10.9 key 总数核对（83）

`12 + 4 + 17 + 15 + 10 + 17 + 3 + 5 = 83`。

- 相对 v4：仅新增 `gateParseDiscardResult`（整条丢弃结果）；其余 82 键不变。
- 历史清理（v4 已定）：`gateParseAdopted` 更名 `gateParseToastAdopted`；删 `gateParseIgnored`（忽略静默）、`gateParseErrPending`；`gateParseWarnCatchAll`/`gateParseWarnRole`/`gateParseToastIgnored` 不登记。
- **字典反向约束（含例外）**：`client.js` 的 `zh`/`en` 字典**不得有本清单之外的 `gateAi*`/`gateParse*` 前缀键**；TSE 增加反向断言（遍历字典 key 集合 === §10 清单；中英集合相等）。**例外**：既有 `gate*`/`gateForm*`/`gateErr*`/`settingsUpdatedElsewhere` 等历史键不属于 `gateAi*`/`gateParse*` 前缀，不在本清单约束内；但 `gateAiFreshHint`/`gateParseSettingsUpdated` 是自然语言流程的权威 key。
- `gateAiFreshHint`、`gateParseSettingsUpdated` 为唯一权威 key；不再保留“复用现有 key”的备选口子。

---

## 11. Q1–Q10 逐条回答


### Q1. 解析在哪执行、客户端如何触发？

**答：选 (c) 配置字段握手。**

- **执行**：宿主 `src/gate-parse.js`，在 `apply()` 里监听 `settings/document-updated`；客户端用现有 `ctx.remote.settings.mutate` 写 `gateParseRequest`（nonce/text/at）并清空旧结果；宿主读 Config、做一次 `ctx.llm.stream` 辅助请求，把 `gateParseResult` 写回并清空请求；客户端 `$on('settings/document-updated')` 后重读。
- **为什么不选 (a)**：`settings.section` 没有 `sessionId`（`slots.d.ts:154-157`），命令还要 lead/preset 门禁与活跃 agent；返回值是文本，仍需二次解析。
- **为什么不选 (b)**：第三方 client bundle 无法在构建期外新增 Typert endpoint（`dsh-api-remotes/README.zh.md:77-79`；模块表 `app.asar:2774788`），需要改 DSH 组合，超出“不 fork 官方包”的边界。
- **失败路径**：无 llm/默认模型 → `llm-unavailable`/`no-route`；流错误 → `llm-error`(+detail)；45s → `timeout`；输出非法 → `invalid-output`（不写 gates）；请求 >120s → `stale-request`；取消 → abort + 丢弃结果；`configEditor` 写失败 → persist 只重写缓存（首次+≤3 次 30/60/120s）→ 耗尽后 warn/审计 + `lastHandledNonce`（不写 stale、不清请求），客户端 90s 超时/取消清空；多实例并发 → 单飞 + 最新 nonce + revision 冲突由保存路径处理。
- **代价**：原文暂存于 Config 直到解析完成（完成即清）；结果字段保留（10min 可消费窗口，不自动清理）；审计文件保留精确输入/输出（§5.7）；未来若平台提供插件自定义 RPC，迁到 (b)。

### Q2. 新增 volatile Config 字段的名字、形状、清理策略

**答：两个顶层 volatile 对象字段：`gateParseRequest {nonce,text,at}` 与 `gateParseResult {nonce,status,gates,note,warnings,code,detail,completedAt}`**（完整 schema 见 §4）。

- **清理**：发起新请求时原子清旧结果；解析完成时原子“清请求 + 写结果”；`at>120s` → `stale-request` 并清请求；客户端取消 → `set 空请求 + 空结果`；客户端 10 分钟后忽略结果；已采用的结果在保存的同一次 mutate 里 `set gateParseResult = 空结果`（旧 Host 缺字段时跳过）。
- **nonce 去重**：宿主内存 `lastHandledNonce` + `result.nonce === request.nonce` 双重判断；重启后靠 `at` TTL + 遗留请求处理。
- **长度上限**：text 4000、note 2000、warnings 10×200、detail 500、gates 单次 ≤5、prompt ≤24KiB（§4.2）。
- **是否存原文**：请求字段暂存原文（持久化）直到解析完成，完成后清除；**结果字段不存原文**；精确输入/输出只进本地审计 JSONL（§5.7）。

### Q3. 模型路由来源与无路由降级

**答：`ctx.get('agentDefaultModel')?.currentSelection()`**（`dsh-agent-default-model/README.zh.md:50-55`），得到 `{provider, model, reasoningEffort?}`；设置页没有会话，因此不用会话模型。本轮不新增 Config 路由覆盖（避免模型 id 漂移）；无服务/无选择 → `no-route`，客户端提示“先在设置中配置默认模型”并保留手动入口，不自动挑 provider、不回退到别家模型。`llm-unavailable` 同理。

### Q4. 模型输出契约

**答：单次一个 JSON 对象，`gates` 为 1..5 条数组（不是多次调用）。**

- 顶层：`{gates:[...], note:string}`；`gates=[]` + `note` → `needs-input`；未知字段忽略。
- 每条 gate：
  - 必填：`deny.role`、`deny.tool[1..8]`，且 `require.event` XOR `require.commandSuccess`；
  - event 钥匙：`require.byRoles[1..8]`；
  - commandSuccess：`role/tool[1..8]/pattern`；
  - 可选：`id`、`description`、`deny.commandPattern`、`freshFor`、`invalidateOn`；
  - 禁填/忽略：`gatesDisabled`、未知字段、空字符串列表项。
- `id`：可选由模型给候选；**最终 id 由宿主生成**（清洗 → 冲突加 `-2/-3` → 空则 `gate-<nonce6>`）；绝不覆盖现有 gate。
- `description`：跟随用户描述语言；`id`/`event`/角色/工具一律 ASCII kebab-case。
- 命令型 gate：宿主自动把 `bash`、`pwsh` 补进 `deny.tool`（去重、≤8），写 `warnings`。
- 角色引用必须存在于当前 roles（否则 `invalid-output`）；工具名不强制存在性（见 Q8）。

### Q5. 失败语义

**答：稳定 `code` + 可选英文 `detail`，由客户端翻译。**

- 宿主只返回 `code`（§5.6 封闭集合）与 `detail`（诊断，≤500，英文允许）；错误 message 文本不参与客户端逻辑。
- 客户端按 `code` 映射 `gateParseErr*` 本地化文案；`detail` 作为次要灰色行显示，便于排障；未知 code 用 `gateParseErrUnknown` + detail；`persist-failed` 不映射（仅审计，D7）。
- 与现有 `gateErr*` 风格一致（`gateErrId`/`gateErrDup`/…）。

### Q6. id 冲突策略；既有查重/覆盖缺陷是否本轮修

**答：解析结果自动加后缀、绝不覆盖；手动新建/编辑查重报错；两个既有缺陷本轮一并修。**

- 解析：宿主生成最终 id（模型 id 清洗 → 冲突 `-2`/`-3` → 空则 `gate-<nonce6>`）；客户端采用时再做一次 create 查重兜底。
- 手动 create：重复 → `gateErrDup`，不写。
- 手动 edit 改 id：与“除 `originalId` 外的其它 gate”查重；改名时用 `originalId` 替换并移除旧项，修掉 `upsert` 按新 id 匹配导致旧项残留/静默覆盖的问题（`client.js:737-743`）。
- **本轮一并修**：`GateForm` create/edit 模式化 + 查重排除 `originalId`（修 `client.js:908-910` 只在 `initial===null` 时查重）；`upsert` 禁止 create 覆盖。理由：解析采用依赖 create 语义；不修会出现“新增变成覆盖已有 gate”。

### Q7. 授权与副作用

**答：解析是设置页动作，按 settings 可写性授权；不沿用 lead/preset 门禁；解析绝不直接落盘 gates。**

- 前置：`describe().writable === true`；无 Lead/preset 要求（设置页本就没有 session；解析不碰 Team 运行时）。
- 解析只写 `gateParseRequest`/`gateParseResult` 两个 volatile 字段（+ 本地审计文件），**不写 `gates`、不改角色、不发消息、不 spawn**。
- 「采用」只回填本地 `engine.gates`/GateForm；用户点顶部「保存」才走既有 `settings.mutate` 写 `gates`（与 dev 倾向一致：回填表单 → 草稿 → 顶部保存）。
- 唯一新增副作用：`$DSH_HOME/agent-team-roles/gate-parse-audit.jsonl` 审计追加（§5.7）。

### Q8. 角色/工具词汇校验的职责

**答：解析层（新 `src/gate-parse.js`）强制角色存在性 + 形状/上限；不强制工具存在性；不改 `validateGate`。**

- 角色：`deny.role`/`byRoles[]`/`commandSuccess.role`/`invalidateOn.role` 必须 ∈ `mergeRoles(config.roles)` 的 id；拒绝 `lead`（不被 gate 评估）。
- 工具：没有可靠的“所有注册工具”目录（工具按 agent 作用域注册），因此只校验非空/长度/去重；命令型自动补 shell 工具。非法工具名只会导致 gate 永不命中——须在 UI 预览里显示，由用户判断。
- `validateGate` 保持纯 schema 语义（模板/现有调用方不变）；解析层调用 `normalizeGate`+`validateGate` 后再做上述附加检查。

### Q9. 依赖策略

**答：`ctx.get('llm')` 与 `ctx.get('agentDefaultModel')` 运行时可选，不新增 peerDependency、不写 `inject`。**

- 不用 `import '@deepseek-ai/dsh-llm'`（本地 link 的插件解析不到 Host 包；与 `src/tools.js:107-110` 的既有做法一致）。
- 缺失时降级（`llm-unavailable`/`no-route`），插件其余功能照常。
- purpose 常量：`agent-team-roles-gate-parse`（照 `session-title`/`compaction` 的 kebab 约定）；运行时作为字符串传给 `ctx.llm.stream`。若未来加 TS 类型层，再在 `LlmRequestPurposeMap` 声明该键；当前 JS 插件不为此引入构建链。

### Q10. 文档与发布

**答：契约放在插件根 `docs/`（即本文件）；`package.json` 的 `files` 增加 `docs/**/*.md`；`README.md` 增补用户操作段。**

- `docs/gates-nl-ui-contract.md` 是唯一契约源；`README.md` 只写用户视角的“怎么用”，并链接本文件。
- README 必须同步更新：**gates 数据位置**（`Config.gates` / 模板 `gates`）、**模板 apply 四件事**（roles upsert、playbook/activeTemplate、gates 合并含 `replaced: <ids>` 与 `warnings`、skills 复制）、**已知限制三项**（事件来源/轮询降级；原文短暂写入、结果不自动清理、审计文件；无默认模型/旧 Host 缺字段/事件不可达）、**单条忽略 vs 整条丢弃**边界。
- 加入 `files` 让安装包带契约，便于 CR/后续维护；体积可忽略。
- 不把契约放仓库根（工作区根不是插件发布单元）。

---

## 12. 既有风险处置（R1–R4，结论）

### R1：`saveEngine` 失败 `await load()` 覆盖本地（`client.js:546-548`）

**结论：修复。失败时只刷新 revision 与 parse 字段，不覆盖 `engine`/`roles`/`rules`。**

- 新增 `refreshParseAndRevision()`：`readNamespace` 后只 `setRevision`，并按需更新 `parse` 状态（`gateParseRequest`/`gateParseResult`）。
- `save*` 的 catch 改为 `refreshParseAndRevision()`；保留本地（含已采用的解析结果）与错误提示。
- 若冲突：revision 已更新，用户再次点保存即可；不存在“解析结果被静默丢弃”。

**可验收断言（TSE 直接照此落测试）**：

1. **Given** 用户已「采用」解析结果并在本地编辑过 gates（或改了 id/description），**When** `saveEngine` 收到 `settings/conflict`、`settings-rejected` 或载体失败，**Then**：
   - `engine.gates` 深等于调用前的本地值（逐项比较 id + 全部字段，含已采用未保存项与用户编辑，不允许被 `load()` 覆盖）；
   - `engine.roles` / `engine.rules` 等非本次保存字段不变；
   - `revision` 等于重新 `describe()` 得到的最新 revision（不是失败前的旧值）；
   - `busy === false`，显示可重试错误（`saveFailed` + 原因），**不出现** `saved` notice；
   - 再次点「保存」（冲突已消除时）成功，且提交内容仍是本地编辑后的值。
2. **Given** `saveEngine` 在 mutate 前被 §12 R4 的校验拦截（非法 gate / 超上限），**When** 提交，**Then** 不发生 `settings.mutate`，`engine` 与 `revision` 均不变，错误横幅指出 gate id 与原因。
3. **Given** `saveEngine` 成功，**Then** `engine.gates` 等于宿主返回的 `value.gates`，`revision` 更新，出现 `saved` notice。
4. **Given** 解析事件在 `dirty` 状态到达，**When** 客户端处理 `settings/document-updated`，**Then** 只更新 `gateParse*` 与 `revision`，`engine`/roles/rules 本地值不变（允许提示“配置已在别处更新”）。
5. **Given** 保存失败后用户关闭/重开设置页（无未保存期待），**Then** 本地不再声称有未保存修改，且不会把旧 revision 用于后续写入。

### R4：保存路径 / 模板 / 读取侧的校验边界

**结论：三层边界分开处理，不能只修客户端。**
1. **客户端保存路径**：按 §6.4 **分档**——未改动 gates 时 legacy 非法/引用已删角色只警告；改动了 gates 时逐条 `validateGateObject` + 条数 + **id 集合唯一 + 角色存在性**；`gatesDisabled` 始终过滤为现存 id；任一失败（改动档）不 mutate。
2. **模板 apply（`mergeTemplateGates`，report-and-skip）**：
   - **只校验 incoming**（逐条 `normalizeGate`+`validateGate`）；incoming 非法项跳过并计入 `warnings`（不因单个坏 gate 拒绝整模板）。
   - **existing 非法项保留**（不重新校验/不丢弃），并**计入 `MAX_GATES`**；合并前先校验 gates，再写 roles（或同一事务），避免 gates 失败留下半套 roles。
   - 同 id 覆盖：incoming 同 id 替换 existing，记录 `replaced: <ids>`；新 id 追加。
   - 合并后超 `MAX_GATES`：跳过超出的 incoming 并写 `warnings`（仍保留 existing，不丢已有配置）。
   - 成功文本必须含 `warnings: [...]` 与 `replaced: <ids>`（无则空数组）。
3. **宿主读取侧（pre-execute 与 post-execute 两处，`src/plugin.js:176-233`）**：每次评估前对**原始 `gates` 列表**逐条 `validateGate`（在 `normalizeGates` 去重之前检查，确保被去重丢弃的重复 id 也能被看到）；**warn 去重键是 gate id（空 id 用固定哨兵 `(empty-id)`），不是消息文本**；每 id 每进程只 warn 一次；**不阻断执行**（fail-open），有效 gate 行为不变；不得每步刷日志。
- **schema 边界**：`GateSchema` 只校验形状；`validateGate` 是唯一语义门；`gateParseResult.gates` 的 schema 只保证形状，宿主写结果前已自校验（Q2/Q8）。

### R2/R3：双 `SettingsSection` 挂载、局部 state、切 tab/切页丢失

**结论：定义最小持久化边界，不引入全局状态库。**

- 服务端持久化：`gateParseRequest`（解析期间，完成即清）、`gateParseResult`（10min 可消费窗口，**不自动清理**）、保存后的 `gates`。
- 组件局部：对话框、thinking、已采用未保存项、表单草稿；允许随卸载丢失，**但解析结果不丢**：重新打开/切到另一挂载点后读 `gateParseResult`，可再次采用。
- 同一 `SettingsSection` 挂载内切 tab 保留外层 `engine` state（`client.js:394,403`）；两个挂载点各自独立，靠事件与 `describe()` 收敛。
- 明确不为 v1 上全局 store/服务化；若后续要求“未保存采用项跨页保留”，再单独立项。

---

## 13. 向后兼容、安全与不变量

1. **旧客户端 + 新 Host**：旧端只按路径 set 已知字段，不会删 `gateParse*`；旧端忽略它们，功能不受影响。
2. **新客户端 + 旧 Host 形态**：不在真实组合里构造“旧 Host”，用**客户端单测 mock `describe()` 去掉 `gateParseRequest`/`gateParseResult` 两字段**来断言：视为无请求/无结果；写/清时 `describe()` 判字段存在并跳过对应 op，不阻断 `gates` 保存；`$on` 失败 → 关闭自动刷新但保留手动保存；手动路径不变。
3. **schema 变更**：只新增带默认值的 volatile 字段，不重命名/删除现有字段；模板/`/team-gates`/评估器不变。
4. **不变量**：`gateParse*` 不参与 `evaluateGates`；`gates` 只由用户保存写入；解析/采用阶段不得 mutate `gates`；保存前必须过校验。
5. **安全/披露**：请求/结果都是惰性数据；无任意代码/命令执行；正则长度 ≤200 且必须可编译；角色必须来自配置；id 冲突不覆盖；审计文件与 session 日志同信任边界；README 必须披露“原文短暂写入 profile、结果保留至下次请求/保存/丢弃、审计文件存在”。
6. **领域词**：解析提示词/规则不得含领域词表（`git`/`review`/`dev`…）；领域知识来自用户输入与 roles 数据。⚠️ 现有 `src/` 注释已含 `git push`/`reviewer`/`review`（`src/policy.js:8`、`src/config.js:107`、`src/rules.js:7`、`src/tools.js:302`），见 §15（已批准为“已知遗留，不阻塞”）。

---

## 14. 验收标准

### 14.1 手动路径回归
- [ ] gate 新增/编辑（含改名）/删除/启用/停用与现状一致（除 Q6 的有意修复）。
- [ ] 现有校验文案与错误行为不变；模板 apply、`/team-gates` 正常。
- [ ] `node --test` 全绿。

### 14.2 Host 解析
- [ ] `gateParseRequest` 到达 → 单飞解析 → 原子写 `gateParseResult` 并清请求；成功/失败/需要补充三种状态正确。
- [ ] 无 llm/无默认模型 → `llm-unavailable`/`no-route`，不写 gates。
- [ ] 坏 JSON/坏字段/坏正则/未知角色/`lead`/超长/超 5 条 → `invalid-output`，不写 gates。
- [ ] 模型 id：清洗后不满足 `GATE_ID`（空/数字开头/超长）→ `gate-<nonceHash6>`；合法则先 ≤62 再加 `-2/-3`、总长 ≤64；不覆盖现有 gate。
- [ ] 命令型 gate 自动补 `bash`+`pwsh` 并写 warnings；补齐后 >8 → `invalid-output`。
- [ ] `note`/`warnings`/`detail` 按 §5.5 第 5 步 clamp 并追加 warning，不因长度失败。
- [ ] 45s 超时、取消、新请求抢占旧请求、`eventSeen`/轮询延后、120s 遗留请求、首次 + ≤3 次（30/60/120s）退避各路径符合 §5.1/§5.8。
- [ ] `configEditor` 写失败：仅审计 `persist-failed` + warn，无客户端可见码；**只重写缓存 result、不重跑模型**；客户端 90s 超时兜底；重试耗尽（give-up）不写 `stale-request`、不清请求、记 `lastHandledNonce`。
- [ ] 审计 JSONL 每次一行，失败也记；>1MiB 轮转；`source:'event'|'poll'` 字段正确。

### 14.3 客户端
- [ ] 入口在 `settings` 不可写/不可用时禁用并说明；手动入口始终可用。
- [ ] 点解析：一次原子 mutate 写请求+清旧结果；thinking 显示；取消/90s 超时都 `set 空请求+空结果`；每次 mutate 成功都 `setRevision`。
- [ ] `$on` 与 2s `describe()` 轮询随组件卸载/取消/结束清理（无遗留定时器/订阅）；轮询仅在 pending ≥2 周期且 `eventSeen=false` 时启用，收到事件即停。
- [ ] `status=ok`：仅 `result.nonce === pendingNonce` 可消费；危险 gate 需 `gateParseWarnAck` 确认（`gateParseWarnAllShell`/`gateParseWarnSelfKey`）；采用后进入 `engine.gates`（未保存）并显示 `gateParseToastAdopted`+`gateParseUndo`；忽略静默；非法项拒绝采用。
- [ ] `status=needs-input`：显示缺失信息，可补充重试。
- [ ] `status=error`：本地化 code + detail 次要行；可重试/手动填写；`persist-failed` 不显示。
- [ ] 顶部保存分档：基线=逐条 normalize 后深比较；未改动 gates 时 legacy 非法/删角色只警告不阻塞；改动 gates 时逐条 + 条数 + **id 集合唯一 + 角色存在性**，失败不 mutate；`gatesDisabled` 始终只保留现存 id；**成功后 `engine.gates/gatesDisabled` 采用宿主 `view.value` 并重设基线**；已采用结果 `set gateParseResult=空结果`（旧 Host 缺字段跳过）；失败保留本地（R1）。
- [ ] 忽略/丢弃边界：单条「忽略」仅丢当前预览、结果字段保留；整条「丢弃结果」`gateParseDiscardResult` + 二次确认，一次 mutate `set 空结果`，不取消仍在进行的解析。
- [ ] 事件刷新：clean 全量、dirty 只刷新 revision/parse；双挂载点均可看到结果。
- [ ] Q6：create 重复报错；edit 改名正确替换且查重。
- [ ] 模板 apply（`mergeTemplateGates`）：只校验 incoming（非法跳过 + `warnings`）；existing 非法保留并计入上限；同 id 覆盖 `replaced: <ids>`；先 gates 后 roles（或同事务）；成功文本含 `warnings: [...]`/`replaced: <ids>`。
- [ ] 宿主读取侧：pre/post-execute 两处对原始 gates 逐条 `validateGate`（含被 `normalizeGates` 丢弃的重复 id），**warn 按 gate id 去重（空 id 哨兵 `(empty-id)`）**、每 id 每进程一次、不阻断其它 gate。

### 14.4 GUI 实测（TSE/Lead，`http://127.0.0.1:63036`）
1. 设置 → Agent 团队角色 → 引擎：点「用自然语言新增」，输入 `dev 提交前必须由 cr 检视批准，dev 再改代码就失效`。
2. 观察 thinking；数秒内出现解析结果（deny=dev/bash+pwsh、key=event/byRoles=cr、invalidateOn=dev/write+edit、最终 id 合法）。
3. 点「采用」→ gate 进入本地列表（未保存）；点「编辑」可改；点顶部「保存」→ 列表生效；`/team-gates list` 可见；重启后仍在。
4. 再解析一条，点「忽略」或「取消」→ gates 不变。
5. 关闭设置页再打开 → 若结果仍在 10min 内可再次采用；请求字段为空。
6. 复现异常：临时清空默认模型 → `no-route` 文案 + 手动入口；外部并发改配置 → 保存冲突提示且本地不丢。

### 14.5 决策项验收（D1–D11，逐条对应 §15）

- [ ] **D1**：解析完成后 `describe()` 中 `gateParseRequest` 为空；`gateParseResult` **没有 `text` 字段**、不回显原文；审计 JSONL 有一行精确输入/输出且 >1MiB 轮转；`README.md` 明确披露“原文会短暂写入 profile 配置，解析完成后清除；结果会留在 profile 配置直至下次请求/保存/丢弃；有本地审计文件”。
- [ ] **D2**：无默认路由时结果为 `no-route`，无 provider 自动选择；`ctx.get('llm')` 缺失为 `llm-unavailable`；两种都显示手动入口。
- [ ] **D3**：解析、采用、忽略全过程中不调用 `settings.mutate` 写 `gates`；只有顶部「保存」会写（可用 spy/日志/配置快照断言）。
- [ ] **D4**：新增/修改的 `src/` 代码零领域词（`git|commit|review|reviewer|dev|cr|tse|pm` 等）且无领域词表；既有 4 处注释保留并在 §15 标注“已知遗留，不阻塞”。
- [ ] **D5（可证伪）**：每 nonce 维护 `eventSeen`；轮询延后到 pending ≥2 周期且无事件；审计 `source` 按“是否收到过事件”判定。正常路径 `source:'event'`（`via event`），只有首日实测事件不可达才允许 `source:'poll'`，且 README“已知限制”记录实测结论与降级选择。
- [ ] **D6**：client.js 字典只用扁平 `gateAi*`/`gateParse*`，**没有任何 `gates.nlg.*` 点号 key**；83 个 key zh/en 成对且**无未登记键**（前缀例外见 §10.9）；不依赖 locale 对 `.` 的路径解析。
- [ ] **D7**：`persist-failed` 没有客户端文案 key；宿主写结果失败只进审计/warn；客户端 90s 超时兜底后可重试。
- [ ] **D8**：宿主轮询正常模式仅在 `gateParseRequest` 非空且 `eventSeen=false` 时存在，清空/收到事件/dispose 即停；**persist 重试由 per-nonce 定时器驱动（30/60/120s，dispose/nonce 变化清理），与 poll 解耦**（停 poll 不停止重试）；首次 + ≤3 次重试；**persist 重试只重写缓存 result、不重跑模型**；耗尽后只 warn/审计 + `lastHandledNonce`（不写 `stale-request`、不清请求）；客户端 2s 轮询同条件并随卸载清理；D5 降级例外按 §5.1。
- [ ] **D9**：R4 三层均有测试：客户端保存分档（未改 gates 仅警告；改动 gates 强制逐条+条数+id 唯一+角色存在性）、模板 apply（`replaced: <ids>`）、宿主 pre/post-execute 读取原始 gates（含重复 id）每 id 每进程一次 warn、不阻断。
- [ ] **D10**：v4 的 82 键清单与字典完全一致（无未登记/死键）；保存校验分档落地；退避/重试对象（persist 只重写缓存）与放弃路径（不写 stale、不清请求）均有测试。
- [ ] **D11**：当前 **83 键**（+`gateParseDiscardResult`）与 §10 清单双向一致；单条忽略仅丢预览、整条丢弃二次确认；persist 重试由 per-nonce 定时器驱动（停 poll 不停止重试，dispose 清理）；保存成功后 `engine.gates/gatesDisabled` 采用宿主返回值且基线重设；`mergeTemplateGates` 只校验 incoming、existing 保留计入上限、`warnings`/`replaced: <ids>` 报告、先 gates 后 roles。

---

## 15. 决策记录（Lead 已批准）与残余风险

> 决策日期：2026-11-19；决策人：Lead；契约 v2 通过评审并已达 DEV；v3 追加 D6–D9；v4 追加 D10；v5 追加 D11（CR 第三轮复核裁决）。

### 15.1 已批准决策（11/11）

| # | 决策 | Lead 附加约束（必须实现） | 状态 |
|---|---|---|---|
| D1 | **方案 (c) 配置握手：接受** | 在 **Config 字段**中原文只存在于 `gateParseRequest`，解析完成即清除；`gateParseResult` 不含原文（**没有 `text` 字段**）；审计 JSONL 是独立本地记录、仅本地、≤1MiB 轮转；README 披露“原文短暂写入 profile、**结果保留至下次请求/保存/丢弃**”。 | 已批准 |
| D2 | **默认模型即解析模型：接受** | 本轮不加 Config 路由覆盖；无路由 → `llm-unavailable`/`no-route` + 手动入口，**不自动挑 provider**、不回退到别家模型。 | 已批准 |
| D3 | **两击语义：接受** | 解析结果只回填本地（采用 → 顶部「保存」）；解析/采用阶段绝不写 `gates`；不得新增第二写路径。 | 已批准 |
| D4 | **`src/` 既有注释领域词：本轮不清理** | 只要求**新增代码零领域词**；`src/policy.js:8`、`src/config.js:107`、`src/rules.js:7`、`src/tools.js:302` 标注为“**已知遗留，不阻塞**”，遗留清理另开任务（见 15.3）。 | 已批准 |
| D5 | **`settings/document-updated` 可达性：必做 + 可证伪** | 每 nonce 记 `eventSeen`；轮询延后到 pending ≥2 周期且无事件；审计 `source` 按“是否收到过事件”判定：正常路径必须 `event`，仅首日实测事件不可达才允许 `poll`，README“已知限制”记录。 | 已批准（待 DEV 首日验证） |
| D6 | **i18n 改扁平 camelCase** | 统一 `gateAi*`/`gateParse*`（平台 `t()` 字典直查）；**点号键废弃**；定稿 **83 键**（v5 增 `gateParseDiscardResult`），无未登记/死键（D10/D11）。 | 已批准 |
| D7 | **`persist-failed` 仅审计** | 从客户端可见码集合摘出；宿主写结果失败只进审计/warn；客户端由 90s 超时兜底（`gateParseErrTimeout`/thinking 超时）后重试。 | 已批准 |
| D8 | **退避与轮询边界** | 正常模式宿主轮询仅在 `gateParseRequest` 非空且 `eventSeen=false` 时启动、清空/收到事件/dispose 即停；**persist 重试由 per-nonce 定时器驱动（30/60/120s，dispose/nonce 变化清理），与 poll 解耦**；首次 + ≤3 次重试；**persist 重试只重写缓存 result、不重跑模型**；耗尽后只 warn/审计 + `lastHandledNonce`（不写 `stale-request`、不清请求）。客户端 2s 轮询同条件、卸载即停。D5 降级例外按 §5.1。 | 已批准 |
| D9 | **R4 边界** | 客户端保存分档（§6.4：未改 gates 只警告；改动 gates 强制逐条+条数+id 唯一+角色存在性）+ 模板 apply 校验且成功文本含 `replaced: <ids>` + 宿主 pre/post-execute 两处读取**原始 gates** 逐条 `validateGate`（含被 `normalizeGates` 丢弃的重复 id），每 id 每进程一次 warn、不阻断。 | 已批准 |
| D10 | **CR 第二轮细则（v4）** | ① 82 键与死键清理（`gateParseWarnCatchAll`/`gateParseWarnRole`/`gateParseToastIgnored`/`gateParseErrPending` 不登记）；② D9 层 3 写实（原始 gates + 重复 id + pre/post）；③ 保存校验分档（§6.4）；④ 退避/重试对象（persist 只重写缓存，放弃路径不写 stale/不清请求）；⑤ D5 `eventSeen` 与 `source` 判据。（v5 的 83 键与新增边界见 D11） | 已批准 |
| D11 | **CR 第三轮细则（v5）** | ① 83 键（+`gateParseDiscardResult`）与“忽略/整条丢弃”边界；② persist 重试由 per-nonce 定时器驱动（30/60/120s，dispose 清理），与 poll 解耦（停 poll 不停重试）；③ 服务端每次写结果前重读 nonce（含 retry），取消不复活；客户端 `matchesPending`（pending 为空恒 false）；④ 客户端 poll 用 `setTimeout` 链、首 tick ≥4s、事件即清；⑤ 保存成功后回写宿主 `view.value` 并重设基线（逐条 normalize 后深比较）；⑥ 危险 gate 条件写死（AllShell/SelfKey/Ack 前置校验）；⑦ `mergeTemplateGates` 只校验 incoming、existing 保留计入上限、`warnings`/`replaced: <ids>` 报告、先 gates 后 roles；⑧ 读侧 warn 按 gate id 去重（空 id 哨兵）。 | 已批准 |

### 15.2 决策对应的实现落点

- D1 → §4（字段/清理）、§5.7（审计）、§16 DEV 步骤 4/5（README 文案）、§14.5 D1（无 `text` 字段断言）。
- D2 → §5.2（路由与前置检查）、§8（降级表）、§11 Q3。
- D3 → §6.2（采用不写盘）、§6.4（保存前校验）、§14 验收。
- D4 → §13 不变量第 6 条、§16 DEV 步骤 6；遗留清理进 §15.3。
- D5 → §5.1（`eventSeen`/轮询延后/`source`）、§6.1、§14.5 D5。
- D6 → §9/§10（83 键）、§14.5 D6；client.js 字典不得出现 `gates.nlg.*` 或未登记 `gateAi*`/`gateParse*` 前缀键。
- D7 → §5.6（persist-failed 注）、§10.4（无客户端 key）、§14.5 D7。
- D8 → §5.1/§5.8（退避/放弃/重试对象/per-nonce 定时器）、§6.1（客户端轮询与清理）、§14.5 D8。
- D9 → §12 R4（三层边界）、§6.4（分档）、§14.3/§14.5 D9、§16 DEV/TSE。
- D10 → §10.9（82 键历史/反向断言）、§12 R4 层 3、§6.4（分档）、§5.1/§5.8（退避/放弃）；§14.5 D10 验收。
- D11 → §10.3/§10.9（83 键/丢弃边界）、§5.1/§5.8（per-nonce 定时器/不复活）、§6.1（setTimeout 链）、§6.2（忽略 vs 丢弃、matchesPending）、§6.4（回写/基线）、§10.7（危险条件）、§12 R4 层 2/3（模板/读侧）、§14.5 D11。

### 15.3 残余风险与后续任务（不阻塞 v5）

1. **审计文件隐私**：`gate-parse-audit.jsonl` 含精确用户原文与模型输出（本地 `$DSH_HOME`，与 session 日志同信任边界）；D1 已批准，README 必须披露。若未来合规要求更严，改为“摘要 + 哈希”，另立任务。
2. **默认模型质量**：解析质量取决于部署默认模型；D2 已批准不加覆盖。若出现系统性质量问题，后续可加 `gateParseProvider`/`gateParseModel`（空=默认），另立任务。
3. **两击 UX**：D3 已批准；若产品后续要求一击落盘，需重新评审第二写路径与原子性，不在 v5。
4. **事件可达性/来源**：D5 必测且可证伪（正常路径 `source:'event'`；轮询延后到 pending ≥2 周期且 `eventSeen=false`）；若不可达，README 已知限制记录“轮询降级”，并评估对 Host 唤醒/耗电的影响。
5. **校验规则双镜像**：client `validateGateObject` 与 `src/gates.js` 的 `validateGate` 是两份实现（client 不能 import Host/src）；TSE 用“规则用例对照 + `MAX_GATES` 常量同步”兜底；若未来把校验上提到 Host，再消除镜像。
6. **无全局状态**：采用但未保存的 gate 在卸载/双挂载点切换后可能丢失，需从持久化的 `gateParseResult` 重新采用（§12 R2/R3 已定义为可接受边界）。
7. **`src/` 领域词遗留**：D4 已批准不阻塞；建议另开清理任务，清理 `policy.js:8`、`config.js:107`、`rules.js:7`、`tools.js:302` 的领域注释并在 CI 加 grep 门禁。
8. **审计轮转实现**：≤1MiB 轮转、覆盖旧档（§5.7）；TSE 需测写失败不影响解析、轮转后仍能查到最近记录。
9. **结果不自动清理**：`gateParseResult` 会留在 profile 配置（D1），README 必须披露；用户可通过下一次请求/保存/「丢弃结果」清除。TSE 需断言“不请求就不自动清”。
10. **`persist-failed` 仅审计**：宿主写失败不产生客户端码；TSE 断言 `describe()` 无可见错误码、客户端 90s 超时兜底。
11. **模板 existing 非法 gate**：D11 规定保留并计入 `MAX_GATES`，不自动清理；用户需在设置页修复，apply 成功文本用 `warnings` 报告。
12. **单条忽略是本地行为**：只丢当前预览，结果字段保留；重新挂载可能再次出现。README 必须写清“忽略 ≠ 整条丢弃”。

---

## 16. 给 DEV 的实施顺序 / 给 TSE 的测试点

### DEV（按序）
1. `src/plugin.js`：Config 加 `gateParseRequest`/`gateParseResult`（注意 `GateSchema` 仅形状，语义在 `validateGate`）；`apply()` 安装 `installGateParser`。
2. `src/gate-parse.js`：事件监听（payload 兼容 `string|{ns}`）+ **每 nonce `eventSeen`**；正常模式轮询仅 pending 且 `eventSeen=false`、延后 ≥2 周期、1s 间隔，事件/清空/dispose 即停（D5 降级例外见 §5.1）；**persist 重试由 per-nonce 定时器驱动（30/60/120s），与 poll 解耦，dispose/nonce 变化清理**；**每次写结果前重读 `gateParseRequest.nonce`，不匹配即丢弃（含 retry 路径）**；单飞/去重/TTL；首次 + ≤3 次重试，persist 失败只重写缓存 result、不重跑模型；耗尽后只 warn/审计 + `lastHandledNonce`（不写 `stale-request`、不清请求）；prompt 组装（`shell tools:["bash","pwsh"]` + 平台标注）、`ctx.llm.stream` 消费、JSON 解析、`normalizeGate`+`validateGate`+角色检查、shell 补齐后 >8 → `invalid-output`、id 生成（清洗后不满足 `GATE_ID` → `gate-<nonceHash6>`；合法则先 ≤62 再加 `-2/-3`，总长 ≤64）、note/warnings/detail clamp、结果写回（含 `nonce`）、审计（`source`/`persist-failed`）。
3. `src/templates.js` / `src/plugin.js`：实现 `mergeTemplateGates`——**只校验 incoming**，非法 incoming 跳过并写 `warnings`；**existing 非法项保留并计入 `MAX_GATES`**；同 id 覆盖记录 `replaced: <ids>`；**先校验 gates 再写 roles（或同一事务）**；成功文本含 `warnings: [...]` 与 `replaced: <ids>`。宿主 **pre/post-execute 两处**对**原始 gates**逐条 `validateGate`（含被 `normalizeGates` 丢弃的重复 id），**warn 按 gate id 去重（空 id 用哨兵 `(empty-id)`）**、每 id 每进程一次、不阻断。
4. `client.js`：
   - 字典（§10，**扁平 `gateAi*`/`gateParse*`，83 键，无未登记键**）；
   - `refreshParseAndRevision()`；
   - AI 对话框 + 请求 mutate + `$on`（收到事件即置 `eventSeen` 并清 poll）+ **2s `describe()` 兜底轮询用 `setTimeout` 链，首 tick ≥4s、仅 `eventSeen=false`**（卸载即停）+ 90s 超时/取消（`set 空请求/空结果`，先 `describe()` 判字段存在）；每次 mutate 成功 `setRevision`；
   - 结果预览：`matchesPending`（pending 为空恒 false）才自动消费；用户显式「采用」可先置 `pendingNonce=result.nonce`（取消/超时已清结果，无可复活对象）；危险 gate 需 `gateParseWarnAck`（`gateParseWarnAllShell`/`gateParseWarnSelfKey`，条件见 §10.7）；采用 toast `gateParseToastAdopted` + `gateParseUndo`；**单条「忽略」仅丢预览**，**整条「丢弃结果」用 `gateParseDiscardResult` + 二次确认**；needs-input/error（`persist-failed` 不显示）；
   - `saveEngine` **分档校验**（基线=逐条 normalize 后深比较；未改 gates 仅警告；改动 gates 逐条+条数+id 唯一+角色存在性）+ `gatesDisabled` 始终过滤 + 失败保留（R1/R4）+ **成功后 `engine.gates/gatesDisabled` 采用宿主 `view.value` 并重设基线** + 已采用结果 `set 空结果`（旧 Host 缺字段跳过）；
   - `GateForm` create/edit 模式 + `formFromGate`/`gateFromForm`/`validateGateInput` + `upsert` 修复（Q6）。
5. `README.md`：用户操作段；**gates 数据位置**（`Config.gates`/模板 `gates`）；**apply 四件事**（roles upsert、playbook/activeTemplate、gates 合并（`replaced: <ids>` + `warnings`）、skills 复制）；**已知限制三项**：① 解析来源与轮询降级（`eventSeen`/`source`/pending ≥2 周期）；② 持久化与隐私（原文短暂写入、结果不自动清理、审计文件）；③ 兼容与降级（无默认模型、旧 Host 缺字段、事件不可达）。另需写清**单条忽略 vs 整条丢弃**边界（README 226/237 的矛盾措辞由 DEV 改）。链接本契约。
6. `package.json` `files` 加 `docs/**/*.md`（DEV 执行）；不碰 `locale/*.json`；`src/` 新增代码零领域词。

### TSE（测试点）
- **Host 单测（新建 `tests/gate-parse.test.js` 或扩展 tools.test.js）**：单飞/去重/TTL；`eventSeen` 与轮询延后（pending ≥2 周期且无事件）；事件/清空/dispose 即停；**persist 重试由 per-nonce 定时器驱动（停 poll 不影响重试）、dispose/nonce 变化清理**；首次 + ≤3 次 30/60/120s 退避；persist 重试只重写缓存（模型调用次数不增）；**每次写前重读 nonce（含 retry），取消后结果不复活**；耗尽后不写 `stale-request`、不清请求、记 `lastHandledNonce`；三种 status；可见错误码 + `persist-failed` 仅审计；坏 JSON/坏 gate/未知角色/`lead`/超长/超 5 条；id 生成（`GATE_ID` 失败 → `gate-<nonceHash6>`；≤62+后缀；总长 ≤64）；shell 补齐后 >8 → `invalid-output`；note/warnings/detail clamp；schema 边界；审计 `source`/轮转。
- **模板/读取侧**：`mergeTemplateGates` 只校验 incoming（非法项跳过 + `warnings`）；existing 非法保留并计入 `MAX_GATES`；同 id 覆盖 `replaced: <ids>`；先 gates 后 roles（或同事务）；宿主 pre/post-execute 两处读取原始 gates（含重复 id）**按 gate id 去重（空 id 哨兵 `(empty-id)`）**、每 id 每进程一次 warn、不阻断。
- **纯函数**：prompt 不含领域词且带两个 shell id + 平台；`validateGateObject` 与 `src/gates.js` 规则对照；`MAX_GATES` 常量同步（node 读文件断言）。
- **客户端**（无单测基建，GUI + 静态检查）：**83 键**与 §10 清单**双向一致**（无未登记/死键，中英集合相等）；Q6 查重/改名；R1 失败保留；保存分档（基线逐条 normalize 深比较；未改仅警告 / 改动强制）；**保存成功后采用宿主 `view.value` 并重设基线**；危险警告条件与 ack 前置；`gateParseUndo`；**单条忽略仅丢预览 vs 整条丢弃 `gateParseDiscardResult` 二次确认**；`matchesPending`（pending 空恒 false）；`$on` 事件清 poll、`setTimeout` 链首 tick ≥4s；`setRevision`；`set 空结果`；`gatesDisabled` 过滤。
- **旧 Host 形态**：**mock `describe()` 去掉 `gateParse*` 两字段**，断言无请求/无结果、清理 op 跳过且 gates 保存不受阻（不要构造真实旧组合）。
- **回归**：手动 CRUD、模板 apply、`/team-gates`、现有 `node --test`。
- **异常注入**：无默认模型、断线错过事件、10min 过期结果、并发两标签页、重启遗留请求、审计写失败、事件不可达（poll 兜底）、persist 重试耗尽（give-up）。


---

## 附：关键引用索引

- `settings.section` props：`@deepseek-ai/dsh-client-ui-settings` 的 `slots.d.ts:154-157`（DEV 核实）。
- settings Remote：`@deepseek-ai/dsh-api-settings-controller/lib/typert.remote-client.js:265-346`。
- `settings/document-updated`：`app.asar:403290,2569774-2569776`。
- 客户端能力固定/模块表：`@deepseek-ai/dsh-api-remotes/README.zh.md:77-79`；`app.asar:2774788`。
- LLM 辅助请求与 purpose：`@deepseek-ai/dsh-llm/README.zh.md:47-57,61-63,93-96,135`；`@deepseek-ai/dsh-session-title-llm/README.zh.md:36-38,75`。
- 默认模型：`@deepseek-ai/dsh-agent-default-model/README.zh.md:50-55`。
- volatile/持久化：`@deepseek-ai/dsh-settings/README.zh.md:12,33,47`；`@deepseek-ai/dsh-config-editor/README.zh.md:11-12,33-43`。
- 插件 gate 引擎：`src/gates.js:18-52,66-110,127-182,199-206,222-252`；`src/plugin.js:91-104,160-233`。
- 插件客户端：`client.js:368-390,394,403,412-431,531-552,737-743,778-869,903-957,1599-1611`。
- 领域数据位置：`templates/software-dev/template.json:6-41`；`src/templates.js:63-75`。
