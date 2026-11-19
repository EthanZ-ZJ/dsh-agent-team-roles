# E2E 手测脚本：自然语言创建工序闸门（gates）

- 被测插件：`dsh-agent-team-roles`（工作区：`D:\packet\dsh-plugin-for-zzj\dsh-agent-team-roles`）
- 契约源：`dsh-agent-team-roles/docs/gates-nl-ui-contract.md`（v2）
- GUI：`http://127.0.0.1:63036`（DSH desktop `0.2.2-rc.1`）
- 执行人：Lead 或 TSE 指定的执行者
- 说明：TSE 角色的工具白名单不含 desktop 自动化，无法直接操作 GUI；本文件是可直接照做的逐步脚本。每步都给出**操作 / 预期 / 证据**，证据按步骤编号落盘。

---

## 0. 环境准备与证据约定

### 0.1 前置检查（执行前一次性）

```pwsh
cd D:\packet\dsh-plugin-for-zzj\dsh-agent-team-roles
node --version                     # 预期 v22+（本机 v24.18.0）
node --test                        # 预期全绿；记录 pass/fail 数
git rev-parse --short HEAD         # 记录被测提交
```

- 确认插件已装入当前 DSH profile，且 GUI 能打开：设置 → **Agent 团队角色** → **引擎** 标签。
- 记录初始 gates：在 Team Lead 会话执行 `/team-gates list`，截图 `e2e-00-initial-gates.png`。
- 备份审计文件（若存在）：
  ```pwsh
  Copy-Item "$env:DSH_HOME\agent-team-roles\gate-parse-audit.jsonl" ".\e2e-before-audit.jsonl" -ErrorAction SilentlyContinue
  ```
- 证据目录：`D:\packet\dsh-plugin-for-zzj\dsh-agent-team-roles\.e2e-evidence\`（自建，不提交）。
- 命名：`e2e-<步骤号>-<简述>.png`；命令输出直接粘贴到执行记录（逐字，不截断）。

### 0.2 本次 E2E 的边界

- **结构性正确性**（UI 状态机、原子写、不落盘 gates、i18n、失败保留）由本脚本判定。
- **语义正确性**（模型是否把"测试同学"映射成 `tse`、把"4 小时"映射成 `freshFor: 14400`）取决于部署默认模型；不符时先查审计 JSONL 的 `output`，记录为模型质量问题，不直接判实现缺陷。
- 请求/结果字段本身不进 UI 正文；需要时用 §8 的审计与服务端方式取证。

---

## 1. 主路径：解析 → 采用 → 保存 → 生效（契约 §13.4 / §7）

**输入文本**（逐字）：

```
开发提交代码前必须由测试同学跑通回归，4 小时内有效
```

| # | 操作 | 预期 | 证据 |
|---|---|---|---|
| 1.1 | 设置 → Agent 团队角色 → 引擎，点「用自然语言新增」 | 弹出对话框：标题`自然语言新增闸门`、textarea、字数提示、`解析`/`取消` | `e2e-11-dialog.png` |
| 1.2 | 粘贴输入文本，点「解析」 | 立即进入 thinking：spinner + `正在解析…` + `取消解析`；解析按钮禁用 | `e2e-12-thinking.png`（2 秒内） |
| 1.3 | 等待结果（预期 2~3 秒，硬上限 90 秒） | 出现结果卡：`解析结果`；至少 1 条 gate 摘要，展示最终 id / 拦截角色与工具 / 钥匙类型与角色 / 新鲜期 / 说明；不出现英文 `detail` 作为唯一提示 | `e2e-13-result.png` |
| 1.4 | 检查结果卡结构（对照契约 §5.5） | `deny.role=dev`；`deny.tool` 同时含 `bash` 与 `pwsh`（命令型自动补齐，应看到 warnings 提示）；钥匙为 event 且 byRoles 含测试角色（默认模型下应为 `tse`）；`freshFor=14400`；`invalidateOn` 含 dev 的写/改工具；最终 id 为小写 kebab-case | 同图 + 文字记录实际 JSON 摘要 |
| 1.5 | 点「采用」 | 卡片进入**本地**闸门列表（标记未保存/编辑态），设置页顶部「保存」可用；此时**尚未落盘** | `e2e-15-adopted.png` |
| 1.6 | 点顶部「保存」 | 成功提示（`已保存`），列表保持；无错误横幅 | `e2e-16-saved.png` |
| 1.7 | 在 Team Lead 会话执行 `/team-gates list` | 输出含 **1.3 的最终 id**，格式形如 `[on]  <id>: deny dev bash/pwsh ← event "<event>" from tse (fresh 14400s) — <说明>` | `e2e-17-command.png` |
| 1.8 | 关闭并重开设置页（或重启 GUI） | 该 gate 仍在列表中，id/字段不变（落盘成功） | `e2e-18-reopen.png` |

**判定**：1.6 之前 `/team-gates list` 不应出现该 gate（1.5 后立刻跑一次反证，记为 1.5b，预期"看不到"）。

---

## 2. 取消 / 关闭 / 忽略 都不改 gates（§4.1 / §6.2 / §7）

### 2.1 thinking 中取消

1. 重复 1.1–1.2，进入 thinking。
2. 立即点「取消解析」（或关闭对话框）。
3. 预期：UI 回 idle；**不**出现结果卡；等待 5 秒，无迟到的结果卡弹出。
4. 执行 `/team-gates list`：与 §0.1 的初始列表**逐字相同**。
5. 证据：`e2e-21-cancelled.png`、`e2e-22-cancel-command.png`。

若宿主日志（DSH 日志/控制台）可见，应看到 `gate parse ... discarded: request was cleared or replaced`。

### 2.2 结果卡上「忽略」

1. 重新解析一次，结果卡出现后点「忽略」。
2. 预期：卡片从预览移除或标记忽略；本地列表不变；点顶部「保存」后 `/team-gates list` 也不新增该 gate。

### 2.4 采用 toast 与「撤销」（v4）

1. 解析成功点「采用」→ 出现采用 toast（含最终 gate id）+「撤销」动作。
2. 保存前点「撤销」→ 该 gate 从本地列表消失；`/team-gates list` 不变；可再次「采用」。
3. 保存后「撤销」不得回滚已落盘 gate（或动作不可用）。
4. 证据：`e2e-24-adopt-toast.png`、`e2e-25-undo.png`。

### 2.5 危险 gate 警告与确认（v4）

1. 输入 `dev 可以自行批准 dev 的提交` → 结果卡出现「自批自放」警告（`gateParseWarnSelfKey`）；未确认时「采用」禁用/被拒绝。
2. 勾选确认（`gateParseWarnAck`）后「采用」成功。
3. 输入 `dev 的所有 shell 命令都要把关`（无具体命令匹配）→ 结果卡出现「拦截全部 shell」警告（`gateParseWarnAllShell`），同样需确认。
4. 证据：`e2e-26-warn-self.png`、`e2e-27-warn-shell.png`。

### 2.6 直接关闭设置页（结果已返回）

1. 解析成功、**不点采用**，直接关闭设置页。
2. 10 分钟内重开设置页 → 结果卡可再次出现并可「采用」（`completedAt` ≤10 分钟）。
3. 超过 10 分钟（或临时把系统时间/等待）重开 → 结果不再展示；可点「丢弃结果」。
4. 证据：`e2e-23-reopen-result.png`、`e2e-24-expired-result.png`。

---

## 3. 非法角色 / 非法正则：就地报错、不落盘（§5.5 / §6.4）

### 3.1 非法角色

1. 用自然语言输入让模型产出未知角色，例如：

```
由 ghost 角色批准后才允许继续
```

2. 预期：结果卡为错误态（`模型输出无法解析` 的本地化文案）+ 次要 `详情` 行；**不出现采用按钮**。
3. 点「手动填写」→ 打开 GateForm；在「被拦角色」填 `ghost` 并保存表单 → 本地列表可编辑态，但点顶部「保存」时应被校验拦截（非法角色不落盘）。
4. `/team-gates list` 不变。

### 3.2 非法正则

1. GateForm 里新增闸门，`命令匹配` 填 `([bad`，保存表单。
2. 预期：就地错误 `正则无法编译`；不进入列表；或进入列表后顶部保存被 R4 拦截并指出 gate id。
3. `/team-gates list` 不变。

### 3.3 超过 5 条 / 超长

- `gates>5` 由宿主单测覆盖（`invalid-output`）；GUI 侧只需确认错误态不提供采用。
- 在对话框输入 >4000 字符：预期就地提示 `描述过长（最多 4000 字符）`，不发起解析（无 thinking）。证据 `e2e-33-toolong.png`。

---

## 4. 中英切换：无裸 key（§9）

1. 切换 DSH 界面语言到 English（设置 → 外观/语言），刷新 GUI。
2. 打开 Agent 团队角色 → 引擎 → 「Add with natural language」。
3. 逐项检查下列位置**不出现裸 key**（形如 `gateAiAdd`、`gateParseErrInvalid`、`gateErrConflict`）：
   - 入口按钮、对话框标题/提示/placeholder/按钮；
   - thinking、结果卡（采用/全部采用/忽略/提示/详情）；
   - 错误态（优先制造一次非法输入，如超长或坏输出）；
   - 保存冲突与数量上限错误。
4. 切回中文，重复 3；对照契约 §10 的 **82 个扁平 key**（`gateAi*` / `gateParse*`）的 zh/en 文案，并确认无死键（`gateParseAdopted`/`gateParseIgnored`/`gateParseErrPending`/`gateParseWarnCatchAll`/`gateParseWarnRole`/`gateParseToastIgnored`）。
   - 机械核对命令（不依赖 GUI）：
     ```pwsh
     node --test tests\gate-contract.test.js   # 断言 §10＝82 key、zh/en 成对且无未登记键
     ```
   - 人工只核对“语义是否通顺 / 占位符是否替换正确”，键覆盖由上面的用例兜底。
5. 证据：`e2e-41-en-idle.png`、`e2e-42-en-error.png`、`e2e-43-zh-error.png`。

**判定**：任何一处显示 `gateXxx` 原文即缺陷。

---

## 5. R1：保存失败后本地草稿不丢（§6.3 / §11 R1）

准备：同一 profile 打开两个 GUI 标签页 A、B，都在设置 → Agent 团队角色 → 引擎。

1. 在 A 里解析并「采用」一条 gate，**不要保存**；再在 A 的角色/引擎里任意改一个本地字段（制造 dirty）。
2. 在 B 里新增一个无关 gate 并保存（B 的 revision 前进）。
3. 回到 A 点顶部「保存」。
4. 预期：
   - A 显示保存失败/冲突提示（`配置已被其它页面/会话修改…`）；
   - **A 的本地内容仍在**：已采用的解析结果、未保存的编辑都还在，没有被服务端旧值覆盖；
   - A 的 revision 已刷新；再点一次「保存」应成功；
   - `/team-gates list` 最终同时含 B 的 gate 与 A 采用的 gate（若第二次保存成功）。
5. 证据：`e2e-51-conflict-a.png`、`e2e-52-conflict-retry-ok.png`、`e2e-53-command.png`。

**失败判据**：出现"保存失败后解析/编辑内容消失"即 R1 回归。

### 5.1 保存校验分档（v4 / R4）

1. 制造一条 legacy 非法 gate（模板/手改 profile，例如 `deny.role` 为空），进入引擎页。
2. **只改 playbook**（不动 gates 列表）→ 点「保存」：预期保存**成功**，提示形如 `已保存 · <legacy gate 警告>`；`gates` 原样落盘。
3. **再改动 gates 列表**（新增/编辑任意 gate）→ 点「保存」：预期被**拒绝**，错误指出 legacy gate id 与原因，不发 mutate；修复/删除该 gate 后重存成功。
4. 另测：本地 gates 出现重复 id 时保存被拒（id 集合唯一）。
5. 证据：`e2e-54-tier1-ok.png`、`e2e-55-tier2-reject.png`。

---

## 6. AI 不可用 / 超时 → 可转手动填写（§8 / §7 error 态）

### 6.1 no-route

1. 临时把默认模型清空（DSH 设置 → 模型/默认模型），回到插件引擎页。
2. 解析一条需求。
3. 预期：错误卡 `当前没有可用的默认模型，请先在设置中配置模型`（本地化）+ 次要 `详情`；有「重试」「手动填写」；点「手动填写」能打开 GateForm 并完成一次正常保存。
4. 恢复默认模型；证据 `e2e-61-noroute.png`、`e2e-62-manual-form.png`。

### 6.2 超时 / 事件丢失

1. 若可注入慢模型（或临时断网/代理超时），触发 90 秒本地超时或宿主 45 秒 `timeout`。
2. 预期：thinking 结束，显示 `解析超时，请重试`；「重试」重新发起 thinking；「取消解析」清请求；手动路径不受影响。
3. 证据：`e2e-63-timeout.png`。

### 6.3 llm-unavailable（可选）

在无 LLM 服务的环境启动 GUI：AI 入口禁用或解析返回 `当前环境不支持解析`；手动表单始终可用。

---

## 7. 保存后的闸门行为回归（手动路径不退化，§13.1）

1. `/team-gates list` / `status`：状态行格式与既有版本一致。
2. `enable/disable <id>`：`[on]/[off]` 切换正确。
3. 编辑已采用的 gate（改 id、改名）：无重复 id、旧项不残留（Q6）。
4. 模板 apply 后 gates 来自模板；同 id 覆盖时成功文本含 `replaced: <id>`；手动 CRUD 行为不变。
5. **模板超限**：先保存到 50 条 gate，再 `/team-template apply` 一个含新 gate 的模板 → 命令返回 error（`exceeds` / MAX_GATES），`/team-gates list` 不变（不写入、不截断）。
6. 证据：`e2e-71-list-status.png`、`e2e-72-edit-rename.png`、`e2e-73-template-limit.png`。

---

## 8. 服务端证据（请求/结果/审计）

### 8.1 审计 JSONL（每次解析一行）

```pwsh
$file = "$env:DSH_HOME\agent-team-roles\gate-parse-audit.jsonl"
Get-Content $file -Tail 5
```

预期每行 JSON 含：`at / nonce / provider / model / purpose="agent-team-roles-gate-parse" / system / input / output / code / detail / source`。
- 成功：`code=""`，`output` 是可解析的 `{"gates":[...]}`。
- 失败：`code` ∈ 12 码集合；`input` 仍保留用户原文。
- 轮转：`gate-parse-audit.jsonl` >1 MiB 后出现 `gate-parse-audit.1.jsonl`。
- **D5 证据**：点「解析」后写入的首行 `source` 必须是 `"event"`（事件路径），不是 `"poll"`；同时记录 UI 从点击到结果卡出现的端到端延迟。若连续多次都是 `"poll"`，按契约 §15.1 D5 记录“1s 轮询降级”并写进 README 已知限制。

### 8.2 请求成功后不再持久化原文

成功解析后立即（2 秒内）在配置文档里检查：`gateParseRequest` 应为空对象/空字段，`gateParseResult.nonce` 等于客户端 nonce、`completedAt>0`。检查入口：DSH 设置文档（openSettingsDocument）或 profile 的 Config 落盘文件；若 UI 无入口，以「重开设置页不出现 thinking、结果卡正常」+ 审计行 `input` 作为间接证据。

### 8.3 不落盘 gates 的反证

任何解析/取消/忽略/错误步骤后，执行 `/team-gates list` 与 §0.1 初始输出对比；未点顶部「保存」前不得出现新 gate。

---

## 9. 缺陷记录模板（每条缺陷必填）

```
标题：<步骤号> <一句话现象>
环境：DSH 0.2.2-rc.1 / 插件 <commit> / OS
前置：<初始 state>
最小复现：1) … 2) … 3) …
预期（契约条款）：§x.y …
实际：<逐字报错/截图路径>
证据：.e2e-evidence/e2e-xx-*.png，审计行：<粘贴>
归属初判：src 缺陷 / client 缺陷 / 模型语义 / 契约歧义
```

三档结论：
- **PASS**：所有步骤符合预期。
- **PASS with notes**：仅模型语义偏差或文档缺口，结构行为正确。
- **FAIL**：出现裸 key、取消/忽略后 gates 变化、保存失败丢本地、非法 gate 落盘、请求成功后原文仍持久化、错误态无手动入口等任一硬性项。

---

## 10. 结果回执（发给 Lead）

```
被测 commit：
node --test：pass __ / fail __
§1 主路径：PASS/FAIL
§2 取消/忽略/关闭：PASS/FAIL
§2.4/2.5 采用撤销 / 危险确认：PASS/FAIL
§3 非法角色/正则：PASS/FAIL
§4 中英（82 key）：PASS/FAIL
§5 R1 冲突保留：PASS/FAIL
§5.1 保存校验分档：PASS/FAIL
§6 AI 降级：PASS/FAIL
§7 手动回归（含模板超限/ replaced）：PASS/FAIL
§8 审计/持久化/D5 source：PASS/FAIL
截图目录：
失败步骤与缺陷编号：
```
