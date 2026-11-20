window.__ModuleLoader__.load({
  id: 'dsh-agent-team-roles',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'agent-team-roles'
    const TABS = [
      { id: 'roles', label: 'roles' },
      { id: 'rules', label: 'rules' },
      { id: 'engine', label: 'engine' },
    ]

    const zh = {
      nav: 'Agent 团队角色',
      title: 'Agent 团队角色',
      subtitle: '为子 Agent 预设提示词、模型、工具与私有技能；成员在运行中学会的长期要求会出现在这里。',
      loading: '正在读取角色配置…',
      roles: '角色',
      rules: '规则',
      engine: '引擎',
      denyCommands: '命令拒绝策略',
      denyHint: '示例：\\bgit\\s+push\\b, \\bnpm\\s+publish\\b —— 该角色调用 bash/pwsh 且命令命中任一正则即被拒绝（≤20 条、单条 ≤200 字符）。',
      leadPlaybook: 'Lead 编排 playbook',
      playbookPlaceholder: '示例：\n分工与流程：\n- 需求与体验取舍 → pm\n- 跨模块改动 → 先出契约并评审，Lead 拍板\n- diff 完成后 → 静态检视与动态测试并行派发，不互相等待\n- 缺陷处理：报告给 Lead → 派回实现者修复 → 修复后重新检视',
      activeTemplate: '当前模板 ID',
      templateHint: '用 /team-template list 查看可用模板；apply 后此处自动填入。',
      freshProvider: 'fresh 成员后端',
      forkProvider: 'fork 成员后端',
      backendHint: '可选值：spawn（全新子 Agent）/ fork（继承 Lead 已完成回合）。留空回退默认。',
      gates: '工序闸门',
      gatesHint: '闸门 = 拦截 + 钥匙：命中「拦截」的调用必须存在一把未过期的「钥匙」事件才放行。修改后点上方「保存」生效；模板可用 /team-template apply 应用。',
      gateEmpty: '尚未配置任何闸门。点「新增闸门」创建，或用 /team-template apply 从模板安装。',
      gateAdd: '新增闸门',
      gateEdit: '编辑',
      gateDelete: '删除',
      gateOn: '启用中',
      gateOff: '已停用',
      gateEnable: '点击启用',
      gateDisable: '点击停用',
      gateDeny: '拦截',
      gateKey: '钥匙',
      gateNeedKey: '需要钥匙',
      gateKeyBy: '由',
      gateKindEvent: '事件钥匙',
      gateKindCommand: '命令成功钥匙',
      gateFreshAlways: '永久有效（直到作废）',
      gateFreshFor: '{v} {u}内有效',
      unitHour: '小时',
      unitMinute: '分钟',
      unitSecond: '秒',
      gateInvalidateOn: '作废触发',
      gateFormId: '闸门 ID',
      gateFormDesc: '说明（可选）',
      gateFormDenyRole: '被拦角色',
      gateFormDenyTools: '被拦工具（逗号分隔）',
      gateFormPattern: '命令匹配（可选，仅 bash/pwsh）',
      gatePatternHint: '正则；只对 shell 命令参数匹配，留空 = 整工具拦截。',
      gateFormKeyKind: '钥匙类型',
      gateFormEvent: '事件名',
      gateFormByRoles: '可产生钥匙的角色（逗号分隔）',
      gateFormFreshFor: '新鲜期（秒）',
      gateFreshHint: '超过该时长后钥匙失效',
      gateFormInvRole: '作废触发角色（可选）',
      gateFormInvTools: '作废触发工具（逗号分隔，可空）',
      gateFormCsRole: '命令执行角色',
      gateFormCsTool: '监听的 shell 工具（逗号分隔）',
      gateFormCsPattern: '命令匹配正则',
      gateFormSave: '保存闸门',
      gateFormCancel: '取消',
      gateErrId: 'ID 必须是小写字母开头的 kebab-case（字母/数字/连字符，≤64 字符）',
      gateErrDup: '已存在同 ID 的闸门',
      gateErrTools: '被拦工具至少填一个',
      gateErrPattern: '正则无法编译',
      gateErrEvent: '事件名必须是小写 kebab-case',
      gateErrByRoles: '钥匙角色至少填一个',
      gateErrCsRole: '命令执行角色必填',
      gateErrCsTool: '监听工具至少填一个',
      gateErrInvalidate: '配置了作废触发角色时，触发工具至少填一个',
      gateAiAdd: '用自然语言新增',
      gateAiTitle: '自然语言新增闸门',
      gateAiHint: '用一句话描述“谁在什么操作前、需要谁的什么结果、何时失效”。解析后可确认再保存。',
      gateAiPlaceholder: '例：dev 提交前必须由 cr 检视批准，dev 再改代码就失效',
      gateAiSubmit: '解析',
      gateAiCancel: '取消',
      gateAiClose: '关闭',
      gateAiCharCount: '{count} / {max}',
      gateAiEmpty: '请先描述闸门需求',
      gateAiTooLong: '描述过长（最多 {max} 字符）',
      gateAiUnavailable: '当前环境不支持解析',
      gateAiReadonly: '配置为只读，无法解析',
      gateAiThinking: '正在解析…',
      gateAiThinkingHint: '通常数秒即可完成，可随时取消。',
      gateAiCancelParse: '取消解析',
      gateAiThinkingTimeout: '解析超过 {seconds} 秒仍未返回，请重试',
      gateParseRetry: '重试',
      gateParseManual: '手动填写',
      gateParseResultTitle: '解析结果',
      gateParseResultHint: '采用后进入本地列表，点上方「保存」才生效。',
      gateParseResultCount: '{count} 条',
      gateParseNeedsInput: '还需要补充信息：{note}',
      gateParseAdopt: '采用',
      gateParseAdoptAll: '全部采用',
      gateParseIgnore: '忽略',
      gateParseDiscardResult: '丢弃结果（不可恢复）',
      gateParseDetail: '详情：{detail}',
      gateParseCode: '错误码：{code}',
      gateParseWarnings: '提示：{warnings}',
      gateParseNote: '说明：{note}',
      gateParseStale: '结果已过期（{age}前），请重新解析',
      gateParseErrEmpty: '没有可解析的描述',
      gateParseErrTooLong: '描述过长（最多 {max} 字符）',
      gateParseErrPromptTooLarge: '描述或角色目录过长',
      gateParseErrNoRoute: '当前没有可用的默认模型，请先在设置中配置模型',
      gateParseErrUnavailable: '当前环境不支持解析',
      gateParseErrLlm: '模型调用失败（{detail}）',
      gateParseErrTimeout: '解析超时',
      gateParseErrCancelled: '解析已取消',
      gateParseErrInvalid: '模型输出无法解析（{detail}）',
      gateParseErrStale: '请求已过期，请重试',
      gateParseErrUnknown: '解析失败',
      gateParseErrLegacyGate: '闸门 {id} 配置无效，无法保存',
      gateParseErrRequestFailed: '写入解析请求失败',
      gateParseErrConflict: '配置已被其它页面/会话修改，请刷新后重试',
      gateParseErrLimit: '闸门数量已达上限 {max}',
      gateErrDenyRole: '被拦角色必填',
      gateErrPatternLong: '正则过长（最多 {max} 字符）',
      gateErrToolsMax: '工具列表最多 {max} 个',
      gateErrInvalid: '闸门配置无效（需要且只能需要一把钥匙）',
      gateParseValidateId: '闸门 ID 不合法（{id}）',
      gateParseValidateDuplicate: '已存在同 ID 的闸门（{id}）',
      gateParseValidateTools: '被拦工具需为 1-8 个',
      gateParseValidatePattern: '正则无法编译或超过 200 字符',
      gateParseValidateEvent: '事件名不合法',
      gateParseValidateByRoles: '钥匙角色至少填一个',
      gateParseValidateCommandSuccess: '命令成功钥匙缺必填项',
      gateParseValidateInvalidate: '作废触发配置不一致',
      gateParseValidateRole: '角色不在当前配置中（{role}）',
      gateParseValidateLimit: '采用后闸门数量超过上限 {max}',
      gateParseSumTemplate: '{deny} → {key}{invalidateBlock}',
      gateParseSumDeny: '@ {role} {tools}{patternBlock}',
      gateParseSumPattern: '/{pattern}/',
      gateParseSumKeyEvent: '"{event}" ← {byRoles}{freshForBlock}',
      gateParseSumKeyCommand: '{role} · {tools} {patternLabel}{freshForBlock}',
      gateParseSumInvalidate: '{role} 使用 {tools}',
      gateParseSumFreshForever: '永久有效',
      gateParseSumFreshFor: '{value} {unit}内有效',
      gateParseUnitSecond: '秒',
      gateParseUnitMinute: '分钟',
      gateParseUnitHour: '小时',
      gateParseSumAny: '任意命令',
      gateParseSumAnyRole: '任一成员（不含 Lead）',
      gateParseSumNone: '无法生成摘要',
      gateParseSumSep: ' · ',
      gateParseListSep: '、',
      gateAiFreshHint: '超过该时长后钥匙失效（0 表示永久有效）',
      gateParseWarnAllShell: '该闸门未限定命令正则，将拦截 shell 工具的全部调用，请确认影响面。',
      gateParseWarnSelfKey: '钥匙由被拦角色自己产生，等于闸门可被自己满足，请确认是否预期。',
      gateParseWarnAck: '该闸门会拦截整个工具调用（无命令正则），影响面较大，请确认。',
      gateParseToastAdopted: '已采用 {id}',
      gateParseUndo: '撤销',
      gateAiA11yDialog: '自然语言新增闸门：{title}',
      gateAiA11ySpinner: '正在解析闸门描述',
      gateAiA11yError: '解析错误',
      gateAiA11yResult: '解析结果已就绪',
      gateParseSettingsUpdated: '配置已在别处更新',
      engineHint: '此处 playbook 非空即生效（追加到 Lead 提示词）；为空时回退 activeTemplate 模板自带的 playbook，模板 apply 时也会把模板文本复制到这里便于查看与修改。',
      addRole: '新建角色',
      deleteRole: '删除角色',
      save: '保存',
      saving: '保存中…',
      saved: '已保存',
      refresh: '刷新',
      empty: '还没有角色。',
      generalLocked: 'general 是内置兜底角色，不能删除。',
      roleId: '角色 ID（同时作为默认 teammate 名称）',
      roleName: '显示名称',
      description: '职责描述',
      persona: '角色提示词',
      provider: '提供方',
      model: '模型',
      effort: '推理强度',
      toolMode: '工具策略',
      toolModeAll: '所有工具',
      toolModeCustom: '自定义白名单',
      toolModeAllHint: '当前允许全部工具；如需限制，切换到自定义白名单。',
      tools: '允许的工具（逗号或换行分隔）',
      skills: '私有技能（逗号或换行分隔；留空表示角色技能目录全部可用）',
      color: '强调色',
      newRole: '新角色',
      ruleRole: '角色',
      allRoles: '全部角色',
      ruleText: '规则内容',
      ruleStatus: '状态',
      rulePolarity: '方向',
      addRule: '添加规则',
      deleteRule: '删除',
      noRules: '还没有学习到的规则。',
      evidence: '证据',
      source: '来源',
      candidate: '候选',
      active: '生效',
      superseded: '已取代',
      do: '要做',
      dont: '不要',
      preference: '偏好',
      invalidRole: '角色配置无效：',
      idTaken: '角色 ID 重复。',
      saveFailed: '保存失败：',
      loadFailed: '读取配置失败：',
      settingsUnavailable: '当前环境没有暴露 settings Remote，无法编辑。',
      roleSkillHint: '私有技能放在 ~/.dsh/agent-team-roles/skills/<角色ID>/ 下，每个技能是 <名称>/SKILL.md 或 <名称>.md。留空 = 暴露该目录下全部技能；填写名称 = 白名单模式，仅列出的技能可用。已安装但未列出的技能可用 list_team_roles 查看（installedSkills 字段）。',
      installedSkills: '已安装的技能（点击查看内容）',
      noInstalledSkills: '该角色的技能目录当前没有技能。',
      skillLoadFailed: '（内容加载失败）',
      skillViewGuide: '设置页不提供新增/修改技能的入口。要新增技能，请直接让 agent 处理——例如对 Team Lead 说：「给 pm 角色新增一个 xxx 技能，写到 ~/.dsh/agent-team-roles/skills/pm/xxx/SKILL.md」；文件放好后点「刷新」即可在这里查看。',
      ruleHint: 'permanent 会立即进入提示词；candidate 需要重复或在这里确认；session 只在当前会话生效，不会出现在这里。',
      history: '历史记忆',
      noHistory: '该角色还没有历史记忆。',
      historyHint: '包含生效、候选和已退役的规则。退役只停止进入提示词，记录会保留在这里。',
      pullMembers: '拉取成员',
      pullTitle: '从角色预设拉取成员',
      pullHint: '不经过模型；同角色已有成员会复用，不再重复创建。留空只做握手（回复 READY，不分析、不提问）。',
      pullTaskPlaceholder: '可选：初始任务；留空则只回复 READY',
      pullAction: '拉取',
      pulling: '拉取中…',
      pullFailed: '拉取失败：',
      pullSuccess: '已拉取',
      pullNoRoles: '没有可用角色。',
      pullLoadFailed: '读取角色失败：',
      close: '关闭',
    }

    const en = {
      nav: 'Agent team roles',
      title: 'Agent team roles',
      subtitle: 'Preset a sub-agent prompt, model, tools, and private skills. Lasting requirements learned during a run appear here.',
      loading: 'Reading role configuration…',
      roles: 'Roles',
      rules: 'Rules',
      engine: 'Engine',
      denyCommands: 'Denied commands',
      denyHint: 'Example: \\bgit\\s+push\\b, \\bnpm\\s+publish\\b — matching bash/pwsh commands are denied for this role (at most 20 patterns of 200 characters).',
      leadPlaybook: 'Lead orchestration playbook',
      playbookPlaceholder: 'Example:\nWorkflow:\n- requirements and UX trade-offs -> pm\n- cross-module changes -> draft a contract and review before the Lead decides\n- after the diff -> static review and dynamic testing in parallel, never waiting on each other\n- defects -> report to the Lead -> back to the implementer -> re-review',
      activeTemplate: 'Active template id',
      templateHint: 'Run /team-template list to see available ids; apply fills this automatically.',
      freshProvider: 'Fresh member backend',
      forkProvider: 'Fork member backend',
      backendHint: 'Values: spawn (brand-new child agent) / fork (inherits the Lead\'s completed turns). Empty falls back to the default.',
      gates: 'Workflow gates',
      gatesHint: 'A gate = deny + key: a matching call is rejected unless a fresh key event exists. Click Save above to apply; install templates with /team-template apply.',
      gateEmpty: 'No gates configured. Click "Add gate" or install a template with /team-template apply.',
      gateAdd: 'Add gate',
      gateEdit: 'Edit',
      gateDelete: 'Delete',
      gateOn: 'Enabled',
      gateOff: 'Disabled',
      gateEnable: 'Click to enable',
      gateDisable: 'Click to disable',
      gateDeny: 'Deny',
      gateKey: 'Key',
      gateNeedKey: 'requires key',
      gateKeyBy: 'from',
      gateKindEvent: 'Reported event',
      gateKindCommand: 'Command success',
      gateFreshAlways: 'Valid until invalidated',
      gateFreshFor: 'valid {v} {u}',
      unitHour: 'h',
      unitMinute: 'min',
      unitSecond: 's',
      gateInvalidateOn: 'Invalidated by',
      gateFormId: 'Gate ID',
      gateFormDesc: 'Description (optional)',
      gateFormDenyRole: 'Denied role',
      gateFormDenyTools: 'Denied tools (comma separated)',
      gateFormPattern: 'Command pattern (optional, bash/pwsh only)',
      gatePatternHint: 'RegExp matched against shell command; empty = whole tool denied.',
      gateFormKeyKind: 'Key type',
      gateFormEvent: 'Event name',
      gateFormByRoles: 'Key producer roles (comma separated)',
      gateFormFreshFor: 'Fresh window (seconds)',
      gateFreshHint: 'the key expires after this window',
      gateFormInvRole: 'Invalidation trigger role (optional)',
      gateFormInvTools: 'Invalidation trigger tools (comma separated, optional)',
      gateFormCsRole: 'Command role',
      gateFormCsTool: 'Watched shell tools (comma separated)',
      gateFormCsPattern: 'Command pattern (RegExp)',
      gateFormSave: 'Save gate',
      gateFormCancel: 'Cancel',
      gateErrId: 'ID must be lowercase kebab-case (letters/digits/hyphens, at most 64 characters)',
      gateErrDup: 'A gate with this ID already exists',
      gateErrTools: 'List at least one denied tool',
      gateErrPattern: 'RegExp does not compile',
      gateErrEvent: 'Event name must be lowercase kebab-case',
      gateErrByRoles: 'List at least one key producer role',
      gateErrCsRole: 'Command role is required',
      gateErrCsTool: 'List at least one watched tool',
      gateErrInvalidate: 'List at least one trigger tool when a trigger role is set',
      gateErrDenyRole: 'Denied role is required',
      gateErrPatternLong: 'Pattern too long (max {max} characters)',
      gateErrToolsMax: 'At most {max} entries in one tool list',
      gateErrInvalid: 'Invalid gate: exactly one key source is required',
      gateAiAdd: 'Add with natural language',
      gateAiTitle: 'Describe a gate',
      gateAiHint: 'One sentence: who is blocked before what, whose result is required, and when it expires. Review the draft before saving.',
      gateAiPlaceholder: 'e.g. the implementer cannot submit until the reviewer approves; further edits invalidate it',
      gateAiSubmit: 'Parse',
      gateAiCancel: 'Cancel',
      gateAiClose: 'Close',
      gateAiCharCount: '{count} / {max}',
      gateAiEmpty: 'Describe the gate first',
      gateAiTooLong: 'Too long (max {max} characters)',
      gateAiUnavailable: 'Parsing is unavailable here',
      gateAiReadonly: 'Configuration is read-only',
      gateAiThinking: 'Parsing…',
      gateAiThinkingHint: 'Usually a few seconds; you can cancel at any time.',
      gateAiCancelParse: 'Cancel parsing',
      gateAiThinkingTimeout: 'No result after {seconds} seconds; try again',
      gateParseRetry: 'Retry',
      gateParseManual: 'Fill in manually',
      gateParseResultTitle: 'Parsed result',
      gateParseResultHint: 'Adopted drafts stay local until you save above.',
      gateParseResultCount: '{count} draft(s)',
      gateParseNeedsInput: 'More information needed: {note}',
      gateParseAdopt: 'Adopt',
      gateParseAdoptAll: 'Adopt all',
      gateParseIgnore: 'Ignore',
      gateParseDiscardResult: 'Discard result (cannot be undone)',
      gateParseDetail: 'Detail: {detail}',
      gateParseCode: 'Code: {code}',
      gateParseWarnings: 'Notes: {warnings}',
      gateParseNote: 'Note: {note}',
      gateParseStale: 'Result expired ({age} ago); parse again',
      gateParseErrEmpty: 'Nothing to parse',
      gateParseErrTooLong: 'Description too long (max {max} characters)',
      gateParseErrPromptTooLarge: 'Description or role catalog too long',
      gateParseErrNoRoute: 'No default model is configured',
      gateParseErrUnavailable: 'Parsing is unavailable here',
      gateParseErrLlm: 'Model call failed ({detail})',
      gateParseErrTimeout: 'Parsing timed out',
      gateParseErrCancelled: 'Parsing cancelled',
      gateParseErrInvalid: 'The model returned an invalid result ({detail})',
      gateParseErrStale: 'Request expired; try again',
      gateParseErrUnknown: 'Parsing failed',
      gateParseErrLegacyGate: 'Gate {id} is invalid and blocks the save',
      gateParseErrRequestFailed: 'Could not write the parse request',
      gateParseErrConflict: 'Configuration changed elsewhere; refresh and retry',
      gateParseErrLimit: 'Gate limit {max} reached',
      gateParseValidateId: 'Invalid gate id ({id})',
      gateParseValidateDuplicate: 'A gate with this id already exists ({id})',
      gateParseValidateTools: 'Denied tools must be 1-8 entries',
      gateParseValidatePattern: 'RegExp does not compile or exceeds 200 characters',
      gateParseValidateEvent: 'Event name is invalid',
      gateParseValidateByRoles: 'List at least one key producer role',
      gateParseValidateCommandSuccess: 'Command key is missing required fields',
      gateParseValidateInvalidate: 'Invalidation trigger is inconsistent',
      gateParseValidateRole: 'Role is not in the current catalog ({role})',
      gateParseValidateLimit: 'Adopting these drafts exceeds the limit {max}',
      gateParseSumTemplate: '{deny} → {key}{invalidateBlock}',
      gateParseSumDeny: '@ {role} {tools}{patternBlock}',
      gateParseSumPattern: '/{pattern}/',
      gateParseSumKeyEvent: '"{event}" ← {byRoles}{freshForBlock}',
      gateParseSumKeyCommand: '{role} · {tools} {patternLabel}{freshForBlock}',
      gateParseSumInvalidate: '{role} uses {tools}',
      gateParseSumFreshForever: 'valid until invalidated',
      gateParseSumFreshFor: 'valid for {value} {unit}',
      gateParseUnitSecond: 's',
      gateParseUnitMinute: 'min',
      gateParseUnitHour: 'h',
      gateParseSumAny: 'Any command',
      gateParseSumAnyRole: 'any member (not the Lead)',
      gateParseSumNone: 'Cannot summarize this gate',
      gateParseSumSep: ' · ',
      gateParseListSep: ', ',
      gateAiFreshHint: 'The key expires after this window (0 = valid until invalidated).',
      gateParseWarnAllShell: 'This gate has no command pattern, so it blocks every shell tool call; check the impact.',
      gateParseWarnSelfKey: 'The key is produced by the same role this gate blocks, so the gate can satisfy itself; confirm that is intended.',
      gateParseWarnAck: 'This gate blocks a whole tool call (no command pattern), which has a wide impact; confirm it.',
      gateParseToastAdopted: 'Adopted {id}',
      gateParseUndo: 'Undo',
      gateAiA11yDialog: 'Describe a gate: {title}',
      gateAiA11ySpinner: 'Parsing the gate description',
      gateAiA11yError: 'Parsing error',
      gateAiA11yResult: 'Parsing result is ready',
      gateParseSettingsUpdated: 'Configuration was updated elsewhere',
      engineHint: 'A non-empty playbook here is appended to the Lead prompt; when empty, the active template\'s playbook is the fallback. Applying a template copies its text here for editing.',
      addRole: 'New role',
      deleteRole: 'Delete role',
      save: 'Save',
      saving: 'Saving…',
      saved: 'Saved',
      refresh: 'Refresh',
      empty: 'No roles yet.',
      generalLocked: 'general is the built-in fallback role and cannot be deleted.',
      roleId: 'Role id (also the default teammate name)',
      roleName: 'Display name',
      description: 'Responsibility',
      persona: 'Role prompt',
      provider: 'Provider',
      model: 'Model',
      effort: 'Reasoning effort',
      toolMode: 'Tool policy',
      toolModeAll: 'All tools',
      toolModeCustom: 'Custom allow-list',
      toolModeAllHint: 'All tools are allowed. Switch to a custom allow-list to restrict them.',
      tools: 'Allowed tools (comma or newline separated)',
      skills: 'Private skills (comma or newline separated; empty exposes the whole role skill folder)',
      color: 'Accent color',
      newRole: 'New role',
      ruleRole: 'Role',
      allRoles: 'All roles',
      ruleText: 'Rule text',
      ruleStatus: 'Status',
      rulePolarity: 'Direction',
      addRule: 'Add rule',
      deleteRule: 'Delete',
      noRules: 'No learned rules yet.',
      evidence: 'Evidence',
      source: 'Source',
      candidate: 'Candidate',
      active: 'Active',
      superseded: 'Superseded',
      do: 'Do',
      dont: "Don't",
      preference: 'Preference',
      invalidRole: 'Invalid role: ',
      idTaken: 'Role id is duplicated.',
      saveFailed: 'Save failed: ',
      loadFailed: 'Cannot read configuration: ',
      settingsUnavailable: 'This deployment does not expose the settings Remote.',
      roleSkillHint: 'Private skills live in ~/.dsh/agent-team-roles/skills/<role id>/ as <name>/SKILL.md or <name>.md. Empty = expose every installed skill; filled = whitelist mode with only the listed skills. Use list_team_roles (installedSkills field) to see installed-but-unlisted skills.',
      installedSkills: 'Installed skills (click to view)',
      noInstalledSkills: 'No skills installed for this role yet.',
      skillLoadFailed: '(failed to load content)',
      skillViewGuide: 'This page intentionally has no add/edit button for skills. To add one, just ask an agent — e.g. tell the Team Lead: "add an xxx skill for the pm role, write it to ~/.dsh/agent-team-roles/skills/pm/xxx/SKILL.md"; click Refresh afterwards to view it here.',
      ruleHint: 'permanent reaches the prompt immediately; candidate waits for a repeat or confirmation here; session rules only live in the current Session and do not appear here.',
      history: 'Memory history',
      noHistory: 'No memory history for this role yet.',
      historyHint: 'Includes active, candidate, and retired rules. Retiring only removes a rule from the prompt; the record stays here.',
      pullMembers: 'Pull member',
      pullTitle: 'Pull a teammate from a role preset',
      pullHint: 'Creates directly without a model turn. An existing member of the same role is reused instead of duplicated. Leave the task empty for a handshake only (reply READY; no analysis or questions).',
      pullTaskPlaceholder: 'Optional initial task; empty replies READY only',
      pullAction: 'Pull',
      pulling: 'Pulling…',
      pullFailed: 'Pull failed: ',
      pullSuccess: 'Pulled',
      pullNoRoles: 'No roles available.',
      pullLoadFailed: 'Cannot read roles: ',
      close: 'Close',
    }

    const ROLE_ID = /^[a-z][a-z0-9-]{0,63}$/
    /** Gate cap; mirrors MAX_GATES in src/gates.js. */
    const MAX_GATES = 50
    /** Per-gate tool list cap; mirrors MAX_GATE_TOOLS in src/gates.js. */
    const MAX_GATE_TOOLS = 8
    /** RegExp source cap; mirrors MAX_GATE_PATTERN in src/gates.js. */
    const MAX_GATE_PATTERN = 200
    /** Longest natural-language description; mirrors MAX_PARSE_TEXT in src/gate-parse.js. */
    const MAX_PARSE_TEXT = 4000
    /** How long a parse result stays presentable; mirrors PARSE_RESULT_TTL_MS in src/gate-parse.js. */
    const PARSE_RESULT_TTL_MS = 10 * 60 * 1000
    /** Client-side wait budget for one parse; the host budget is 45 seconds. */
    const PARSE_CLIENT_TIMEOUT_MS = 90 * 1000
    /** Fallback describe cadence while a parse is pending (2 periods before first). */
    const PARSE_POLL_PERIOD_MS = 2000
    /** Gate id grammar; mirrors GATE_ID in src/gates.js. */
    const GATE_ID = /^[a-z][a-z0-9-]{0,63}$/
    const input = {
      width: '100%',
      boxSizing: 'border-box',
      background: 'var(--dsw-alias-bg-base)',
      color: 'var(--dsw-alias-label-primary)',
      border: '1px solid var(--dsw-alias-border-l1)',
      borderRadius: 8,
      padding: '8px 10px',
      font: 'inherit',
      outline: 'none',
    }
    const label = {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      color: 'var(--dsw-alias-label-secondary)',
      fontSize: 12,
      minWidth: 0,
    }
    const panel = {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      minWidth: 0,
    }
    const button = {
      border: '1px solid var(--dsw-alias-border-l1)',
      background: 'var(--dsw-alias-bg-layer-2)',
      color: 'var(--dsw-alias-label-primary)',
      borderRadius: 8,
      padding: '7px 12px',
      font: 'inherit',
      fontSize: 13,
      cursor: 'pointer',
    }
    const primaryButton = {
      ...button,
      background: 'var(--dsw-alias-brand-primary)',
      borderColor: 'var(--dsw-alias-brand-primary)',
      color: 'var(--dsw-alias-bg-base)',
      fontWeight: 600,
    }
    const tabStyle = (active) => ({
      ...button,
      background: active ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
      borderColor: active ? 'var(--dsw-alias-border-l2)' : 'transparent',
      color: active ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
      padding: '6px 10px',
    })
    const small = { color: 'var(--dsw-alias-label-secondary)', fontSize: 12 }
    const row = { display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }
    const card = {
      border: '1px solid var(--dsw-alias-border-l1)',
      background: 'var(--dsw-alias-bg-layer-1)',
      borderRadius: 10,
      padding: 14,
    }
    const banner = (tone) => ({
      border: `1px solid var(--dsw-alias-${tone}-primary)`,
      color: `var(--dsw-alias-${tone}-primary)`,
      background: 'var(--dsw-alias-bg-layer-1)',
      borderRadius: 8,
      padding: '8px 10px',
      fontSize: 13,
    })

    /** Split a comma/newline separated field into unique trimmed values. */
    function listOf(value) {
      return [...new Set(
        String(value ?? '')
          .split(/[\n,]/)
          .map((entry) => entry.trim())
          .filter(Boolean),
      )]
    }

    /** Format a list field for editing. */
    function textOf(value) {
      return Array.isArray(value) ? value.join(', ') : ''
    }

    /** Fill {placeholders} in one localized template; unknown names disappear. */
    function fill(template, params) {
      return String(template ?? '').replace(/\{(\w+)\}/g, (match, name) =>
        params !== undefined && name in params ? String(params[name]) : '')
    }

    /** Human-readable age built from the localized unit keys. */
    function ageLabel(t, milliseconds) {
      const value = Number.isFinite(milliseconds) ? Math.max(0, Math.round(milliseconds / 1000)) : 0
      if (value >= 3600) return fill(t('gateParseSumFreshFor'), { value: String(Math.round(value / 3600)), unit: t('gateParseUnitHour') })
      if (value >= 60) return fill(t('gateParseSumFreshFor'), { value: String(Math.round(value / 60)), unit: t('gateParseUnitMinute') })
      return fill(t('gateParseSumFreshFor'), { value: String(value), unit: t('gateParseUnitSecond') })
    }

    /** Join one list with the localized separator. */
    function joinList(t, values) {
      return (Array.isArray(values) ? values : []).join(t('gateParseListSep'))
    }

    /** One ` /pattern/` block, or an empty string when the pattern is empty. */
    function patternBlock(t, pattern) {
      return typeof pattern === 'string' && pattern !== ''
        ? ` ${fill(t('gateParseSumPattern'), { pattern })}`
        : ''
    }

    /** Localized freshness window for one gate requirement. */
    function freshnessLabel(t, freshFor) {
      const value = Number(freshFor)
      if (!Number.isFinite(value) || value <= 0) return t('gateParseSumFreshForever')
      const unit = value % 3600 === 0 ? t('gateParseUnitHour') : value % 60 === 0 ? t('gateParseUnitMinute') : t('gateParseUnitSecond')
      const amount = value % 3600 === 0 ? value / 3600 : value % 60 === 0 ? value / 60 : value
      return fill(t('gateParseSumFreshFor'), { value: String(amount), unit })
    }

    /** Human summary of one gate; preview only, never written back. */
    function gateSummary(gate, t) {
      const deny = gate?.deny ?? {}
      const require = gate?.require ?? {}
      const tools = Array.isArray(deny.tool) ? deny.tool.filter((entry) => typeof entry === 'string' && entry !== '') : []
      if (tools.length === 0) return t('gateParseSumNone')
      const sep = t('gateParseSumSep')
      const denyText = fill(t('gateParseSumDeny'), {
        role: String(deny.role ?? ''),
        tools: joinList(t, tools),
        patternBlock: patternBlock(t, deny.commandPattern),
      })
      const freshForBlock = `${sep}${freshnessLabel(t, require.freshFor)}`
      const commandSuccess = require.commandSuccess
      let keyText
      // A schema-filled `{}` / empty role is not a command-success key.
      if (hasCommandSuccessKey(require)) {
        const patternLabel = typeof commandSuccess.pattern === 'string' && commandSuccess.pattern !== ''
          ? patternBlock(t, commandSuccess.pattern)
          : t('gateParseSumAny')
        keyText = fill(t('gateParseSumKeyCommand'), {
          role: String(commandSuccess.role ?? ''),
          tools: joinList(t, commandSuccess.tool),
          patternLabel,
          freshForBlock,
        })
      } else {
        keyText = fill(t('gateParseSumKeyEvent'), {
          event: String(require.event ?? ''),
          byRoles: joinList(t, require.byRoles),
          freshForBlock,
        })
      }
      const invalidateOn = require.invalidateOn
      const invalidateTools = Array.isArray(invalidateOn?.tool) ? invalidateOn.tool : []
      const invalidateBlock = invalidateTools.length === 0
        ? ''
        : `${sep}${fill(t('gateParseSumInvalidate'), {
            role: String(invalidateOn?.role ?? '') === '' ? t('gateParseSumAnyRole') : String(invalidateOn.role),
            tools: joinList(t, invalidateTools),
          })}`
      return fill(t('gateParseSumTemplate'), { deny: denyText, key: keyText, invalidateBlock })
    }

    /** An empty parse request shape. */
    function emptyParseRequest() {
      return { nonce: '', text: '', at: 0 }
    }

    /** An empty parse result shape. */
    function emptyParseResult() {
      return {
        nonce: '',
        status: '',
        gates: [],
        note: '',
        warnings: [],
        code: '',
        detail: '',
        completedAt: 0,
      }
    }

    /** Read one parse request out of a settings view value. */
    function parseRequestOf(value) {
      const raw = value?.gateParseRequest
      return {
        nonce: typeof raw?.nonce === 'string' ? raw.nonce : '',
        text: typeof raw?.text === 'string' ? raw.text : '',
        at: Number.isFinite(raw?.at) ? raw.at : 0,
      }
    }

    /** Read one parse result out of a settings view value. */
    function parseResultOf(value) {
      const raw = value?.gateParseResult
      return {
        nonce: typeof raw?.nonce === 'string' ? raw.nonce : '',
        status: typeof raw?.status === 'string' ? raw.status : '',
        gates: Array.isArray(raw?.gates) ? raw.gates : [],
        note: typeof raw?.note === 'string' ? raw.note : '',
        warnings: Array.isArray(raw?.warnings)
          ? raw.warnings.filter((entry) => typeof entry === 'string')
          : [],
        code: typeof raw?.code === 'string' ? raw.code : '',
        detail: typeof raw?.detail === 'string' ? raw.detail : '',
        completedAt: Number.isFinite(raw?.completedAt) ? raw.completedAt : 0,
      }
    }

    /** Whether one parsed result is still inside its presentation window. */
    function parseResultFresh(result) {
      return result !== undefined
        && result !== null
        && result.completedAt > 0
        && Date.now() - result.completedAt <= PARSE_RESULT_TTL_MS
    }

    /** Mint one request id well inside the 64-character bound. */
    function makeNonce() {
      const holder = typeof crypto !== 'undefined' ? crypto : undefined
      if (typeof holder?.randomUUID === 'function') return holder.randomUUID()
      return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
    }

    /** Localization key for one stable host error code. */
    const PARSE_ERROR_KEYS = {
      'empty-text': 'gateParseErrEmpty',
      'text-too-long': 'gateParseErrTooLong',
      'prompt-too-large': 'gateParseErrPromptTooLarge',
      'no-route': 'gateParseErrNoRoute',
      'llm-unavailable': 'gateParseErrUnavailable',
      'llm-error': 'gateParseErrLlm',
      timeout: 'gateParseErrTimeout',
      cancelled: 'gateParseErrCancelled',
      'invalid-output': 'gateParseErrInvalid',
      'stale-request': 'gateParseErrStale',
      // `persist-failed` is audit-only by contract (D7): never client-visible.
      unknown: 'gateParseErrUnknown',
    }

    /** Localized headline for one failed parse result. */
    function parseErrorText(result, t) {
      const key = PARSE_ERROR_KEYS[result?.code] ?? 'gateParseErrUnknown'
      return fill(t(key), {
        max: MAX_PARSE_TEXT,
        detail: result?.detail ?? '',
        code: result?.code ?? '',
      })
    }

    /** Project one stored gate into the editable form shape. */
    function formFromGate(gate) {
      const base = gate !== null && typeof gate === 'object' ? gate : {}
      const deny = base.deny ?? {}
      const require = base.require ?? {}
      const commandSuccess = require.commandSuccess
        && (require.commandSuccess.role || require.commandSuccess.pattern)
        ? require.commandSuccess
        : undefined
      return {
        id: base.id ?? '',
        description: base.description ?? '',
        denyRole: deny.role ?? '',
        denyTools: Array.isArray(deny.tool) ? deny.tool.join(', ') : '',
        commandPattern: deny.commandPattern ?? '',
        kind: commandSuccess !== undefined ? 'command' : 'event',
        event: require.event ?? '',
        byRoles: Array.isArray(require.byRoles) ? require.byRoles.join(', ') : '',
        freshFor: require.freshFor ?? 0,
        invalidateRole: require.invalidateOn?.role ?? '',
        invalidateTools: Array.isArray(require.invalidateOn?.tool) ? require.invalidateOn.tool.join(', ') : '',
        csRole: commandSuccess?.role ?? '',
        csTool: Array.isArray(commandSuccess?.tool) ? commandSuccess.tool.join(', ') : '',
        csPattern: commandSuccess?.pattern ?? '',
      }
    }

    /** Build the canonical gate object from the editable form. */
    function gateFromForm(form) {
      const id = String(form.id ?? '').trim().toLowerCase()
      const denyTools = listOf(form.denyTools)
      const commandPattern = String(form.commandPattern ?? '').trim()
      const byRoles = listOf(form.byRoles)
      const freshFor = Number(form.freshFor) > 0 ? Number(form.freshFor) : undefined
      const invalidateTools = listOf(form.invalidateTools)
      const invalidateRole = String(form.invalidateRole ?? '').trim()
      const invalidateOn = invalidateTools.length === 0 && invalidateRole === ''
        ? undefined
        : {
            ...(invalidateRole === '' ? {} : { role: invalidateRole.toLowerCase() }),
            tool: invalidateTools,
          }
      return {
        id,
        deny: {
          role: String(form.denyRole ?? '').trim().toLowerCase(),
          tool: denyTools,
          ...(commandPattern === '' ? {} : { commandPattern }),
        },
        require: form.kind === 'event'
          ? {
              event: String(form.event ?? '').trim().toLowerCase(),
              byRoles,
              ...(freshFor === undefined ? {} : { freshFor }),
              ...(invalidateOn === undefined ? {} : { invalidateOn }),
            }
          : {
              commandSuccess: {
                role: String(form.csRole ?? '').trim().toLowerCase(),
                tool: listOf(form.csTool),
                pattern: String(form.csPattern ?? '').trim(),
              },
              ...(freshFor === undefined ? {} : { freshFor }),
              ...(invalidateOn === undefined ? {} : { invalidateOn }),
            },
        description: String(form.description ?? '').trim(),
      }
    }

    /** Validate one editable form; returns `''` or `{key, params}`. */
    function validateGateInput(form, existingIds, originalId) {
      const id = String(form.id ?? '').trim().toLowerCase()
      if (!GATE_ID.test(id)) return { key: 'gateErrId' }
      const taken = (Array.isArray(existingIds) ? existingIds : [])
        .filter((entry) => entry !== (originalId ?? ''))
      if (taken.includes(id)) return { key: 'gateErrDup' }
      const denyTools = listOf(form.denyTools)
      if (denyTools.length === 0) return { key: 'gateErrTools' }
      if (denyTools.length > MAX_GATE_TOOLS) return { key: 'gateErrToolsMax', params: { max: MAX_GATE_TOOLS } }
      const commandPattern = String(form.commandPattern ?? '').trim()
      if (commandPattern !== '') {
        if (commandPattern.length > MAX_GATE_PATTERN) {
          return { key: 'gateErrPatternLong', params: { max: MAX_GATE_PATTERN } }
        }
        try { void new RegExp(commandPattern) } catch { return { key: 'gateErrPattern' } }
      }
      const invalidateTools = listOf(form.invalidateTools)
      if (invalidateTools.length > MAX_GATE_TOOLS) {
        return { key: 'gateErrToolsMax', params: { max: MAX_GATE_TOOLS } }
      }
      if (String(form.invalidateRole ?? '').trim() !== '' && invalidateTools.length === 0) {
        return { key: 'gateErrInvalidate' }
      }
      if (form.kind === 'event') {
        if (!GATE_ID.test(String(form.event ?? '').trim().toLowerCase())) return { key: 'gateErrEvent' }
        const byRoles = listOf(form.byRoles)
        if (byRoles.length === 0) return { key: 'gateErrByRoles' }
        if (byRoles.length > MAX_GATE_TOOLS) return { key: 'gateErrToolsMax', params: { max: MAX_GATE_TOOLS } }
      } else {
        if (String(form.csRole ?? '').trim() === '') return { key: 'gateErrCsRole' }
        const csTool = listOf(form.csTool)
        if (csTool.length === 0) return { key: 'gateErrCsTool' }
        if (csTool.length > MAX_GATE_TOOLS) return { key: 'gateErrToolsMax', params: { max: MAX_GATE_TOOLS } }
        const csPattern = String(form.csPattern ?? '').trim()
        if (csPattern.length > MAX_GATE_PATTERN) {
          return { key: 'gateErrPatternLong', params: { max: MAX_GATE_PATTERN } }
        }
        try { void new RegExp(csPattern) } catch { return { key: 'gateErrPattern' } }
      }
      return ''
    }

    /** Whether one gate truly carries a command-success key (schema fills `{}`). */
    function hasCommandSuccessKey(require) {
      const command = require?.commandSuccess
      return command !== null && typeof command === 'object' && String(command.role ?? '').trim() !== ''
    }

    /** Whether one gate truly carries an event key (the schema default is `''`). */
    function hasEventKey(require) {
      return typeof require?.event === 'string' && require.event.trim() !== ''
    }

    /**
     * Strip schema-filled empty objects so an adopted draft matches the shape
     * the Host itself normalizes (and keeps `commandSuccess` only when it has a
     * role). Adoption and the subsequent save both use this shape.
     */
    function canonicalAdoptableGate(gate) {
      const base = gate !== null && typeof gate === 'object' ? gate : {}
      const deny = base.deny ?? {}
      const require = base.require ?? {}
      const list = (value) => (Array.isArray(value)
        ? [...new Set(value.map((entry) => String(entry ?? '').trim()).filter(Boolean))]
        : [])
      const commandPattern = typeof deny.commandPattern === 'string' ? deny.commandPattern.trim() : ''
      const event = hasEventKey(require) ? require.event.trim().toLowerCase() : ''
      const command = hasCommandSuccessKey(require)
        ? {
            role: String(require.commandSuccess.role).trim().toLowerCase(),
            tool: list(require.commandSuccess.tool),
            pattern: typeof require.commandSuccess.pattern === 'string'
              ? require.commandSuccess.pattern.trim()
              : '',
          }
        : undefined
      const invalidateOnRaw = require.invalidateOn !== null && typeof require.invalidateOn === 'object'
        ? require.invalidateOn
        : undefined
      const invalidateRole = String(invalidateOnRaw?.role ?? '').trim().toLowerCase()
      const invalidateTools = list(invalidateOnRaw?.tool)
      const invalidateOn = invalidateRole === '' && invalidateTools.length === 0
        ? undefined
        : { ...(invalidateRole === '' ? {} : { role: invalidateRole }), tool: invalidateTools }
      const freshFor = Number.isFinite(Number(require.freshFor)) && Number(require.freshFor) > 0
        ? Number(require.freshFor)
        : undefined
      return {
        id: String(base.id ?? '').trim().toLowerCase(),
        deny: {
          role: String(deny.role ?? '').trim().toLowerCase(),
          tool: list(deny.tool),
          ...(commandPattern === '' ? {} : { commandPattern }),
        },
        require: {
          ...(event === '' ? {} : { event }),
          ...(command === undefined ? {} : { commandSuccess: command }),
          byRoles: list(require.byRoles).map((entry) => entry.toLowerCase()),
          ...(freshFor === undefined ? {} : { freshFor }),
          ...(invalidateOn === undefined ? {} : { invalidateOn }),
        },
        description: String(base.description ?? '').trim(),
      }
    }

    /** Validate one canonical gate before persisting it; returns `''` or `{key, params}`. */
    function validateGateObject(gate) {
      const base = gate !== null && typeof gate === 'object' ? gate : {}
      const deny = base.deny ?? {}
      const require = base.require ?? {}
      if (!GATE_ID.test(String(base.id ?? ''))) return { key: 'gateErrId' }
      if (String(deny.role ?? '').trim() === '') return { key: 'gateErrDenyRole' }
      const denyTools = Array.isArray(deny.tool)
        ? deny.tool.filter((entry) => typeof entry === 'string' && entry.trim() !== '')
        : []
      if (denyTools.length === 0) return { key: 'gateErrTools' }
      if (denyTools.length > MAX_GATE_TOOLS) return { key: 'gateErrToolsMax', params: { max: MAX_GATE_TOOLS } }
      const commandPattern = typeof deny.commandPattern === 'string' ? deny.commandPattern : ''
      if (commandPattern !== '') {
        if (commandPattern.length > MAX_GATE_PATTERN) {
          return { key: 'gateErrPatternLong', params: { max: MAX_GATE_PATTERN } }
        }
        try { void new RegExp(commandPattern) } catch { return { key: 'gateErrPattern' } }
      }
      const event = typeof require.event === 'string' ? require.event.trim() : ''
      const hasEvent = event !== ''
      // `GateSchema` fills `require.commandSuccess` with an empty object; only a
      // non-empty role makes it a real key, otherwise event gates look like
      // they carry two key sources.
      const hasCommand = hasCommandSuccessKey(require)
      if (hasEvent && hasCommand) return { key: 'gateErrInvalid' }
      if (!hasEvent && !hasCommand) return { key: 'gateErrInvalid' }
      if (hasEvent) {
        if (!GATE_ID.test(event.toLowerCase())) return { key: 'gateErrEvent' }
        const byRoles = Array.isArray(require.byRoles)
          ? require.byRoles.filter((entry) => typeof entry === 'string' && entry.trim() !== '')
          : []
        if (byRoles.length === 0) return { key: 'gateErrByRoles' }
        if (byRoles.length > MAX_GATE_TOOLS) return { key: 'gateErrToolsMax', params: { max: MAX_GATE_TOOLS } }
      } else {
        const commandSuccess = require.commandSuccess
        const tools = Array.isArray(commandSuccess.tool)
          ? commandSuccess.tool.filter((entry) => typeof entry === 'string' && entry.trim() !== '')
          : []
        if (tools.length === 0) return { key: 'gateErrCsTool' }
        if (tools.length > MAX_GATE_TOOLS) return { key: 'gateErrToolsMax', params: { max: MAX_GATE_TOOLS } }
        const pattern = typeof commandSuccess.pattern === 'string' ? commandSuccess.pattern : ''
        if (pattern.length > MAX_GATE_PATTERN) {
          return { key: 'gateErrPatternLong', params: { max: MAX_GATE_PATTERN } }
        }
        try { void new RegExp(pattern) } catch { return { key: 'gateErrPattern' } }
      }
      const invalidateOn = require.invalidateOn
      if (invalidateOn !== null && typeof invalidateOn === 'object') {
        const tools = Array.isArray(invalidateOn.tool)
          ? invalidateOn.tool.filter((entry) => typeof entry === 'string' && entry.trim() !== '')
          : []
        if (tools.length > MAX_GATE_TOOLS) return { key: 'gateErrToolsMax', params: { max: MAX_GATE_TOOLS } }
        if (tools.length === 0 && String(invalidateOn.role ?? '').trim() === '') {
          return ''
        }
        if (tools.length === 0) return { key: 'gateErrInvalidate' }
      }
      return ''
    }

    /** Every role reference one gate carries. */
    function gateRoleRefs(gate) {
      const deny = gate?.deny ?? {}
      const require = gate?.require ?? {}
      const refs = [String(deny.role ?? '')]
      if (Array.isArray(require.byRoles)) refs.push(...require.byRoles.map((entry) => String(entry ?? '')))
      if (require.commandSuccess !== null && typeof require.commandSuccess === 'object') {
        refs.push(String(require.commandSuccess.role ?? ''))
      }
      if (require.invalidateOn !== null && typeof require.invalidateOn === 'object') {
        refs.push(String(require.invalidateOn.role ?? ''))
      }
      return refs.filter((entry) => entry !== '')
    }

    /** Report the first role reference a gate carries that is not gated-eligible. */
    function gateRoleProblem(gate, roleIds) {
      for (const reference of gateRoleRefs(gate)) {
        if (reference === 'lead') return { key: 'gateParseValidateRole', params: { role: reference } }
        if (!roleIds.has(reference)) return { key: 'gateParseValidateRole', params: { role: reference } }
      }
      return ''
    }

    /** Compose one gate-specific validation message. */
    function gateProblemMessage(t, gate, problem) {
      const label = typeof gate?.id === 'string' && gate.id !== '' ? gate.id : '?'
      const reason = problem.params === undefined ? t(problem.key) : fill(t(problem.key), problem.params)
      return `${t('gates')} "${label}": ${reason}`
    }

    /** Validate one role before writing it. */
    function validate(role, roles, t) {
      if (!ROLE_ID.test(role.id)) return `${t('invalidRole')}${role.id}`
      if (role.id === 'lead') return `${t('invalidRole')}lead is reserved`
      if (roles.filter((candidate) => candidate.id === role.id).length > 1) return t('idTaken')
      const hasProvider = String(role.provider ?? '').trim() !== ''
      const hasModel = String(role.model ?? '').trim() !== ''
      if (hasProvider !== hasModel) return `${t('invalidRole')}${role.id}: provider and model must be set together`
      if (role.toolMode === 'custom' && (!Array.isArray(role.tools) || role.tools.length === 0)) {
        return `${t('invalidRole')}${role.id}: custom policy needs at least one tool`
      }
      return ''
    }

    /** Build one Error that carries the Remote's stable failure code. */
    function remoteError(response, fallback) {
      const error = new Error(response?.error?.message ?? fallback)
      if (typeof response?.error?.code === 'string') error.code = response.error.code
      return error
    }

    /** Read the plugin namespace plus the deployment's write capability. */
    async function readSettingsState(ctx) {
      if (ctx.remote?.settings === undefined) throw new Error('settings-remote-unavailable')
      const response = await ctx.remote.settings.describe()
      if (!response.ok) throw remoteError(response, 'settings-describe-failed')
      const view = response.value.namespaces.find((entry) => entry.ns === NS)
      if (view === undefined) throw new Error(`settings namespace "${NS}" is not active`)
      return { view, writable: response.value.writable !== false }
    }

    /** Read this plugin's namespace from the settings Remote. */
    async function readNamespace(ctx) {
      const state = await readSettingsState(ctx)
      return state.view
    }

    /** Write one volatile field under the current revision. */
    async function writeNamespace(ctx, revision, field, value) {
      return writeNamespaceFields(ctx, revision, [{ field, value }])
    }

    /** Write several volatile fields in one atomic mutate under one revision. */
    async function writeNamespaceFields(ctx, revision, fields) {
      if (ctx.remote?.settings === undefined) throw new Error('settings-remote-unavailable')
      const ops = fields.map(({ field, value }) => ({ op: 'set', path: [field], value }))
      const response = await ctx.remote.settings.mutate(NS, ops, revision)
      if (!response.ok) {
        // Keep the Remote's stable failure code reachable for conflict handling.
        const error = new Error(response?.error?.message ?? 'settings-mutate-failed')
        if (typeof response?.error?.code === 'string') error.code = response.error.code
        throw error
      }
      return readNamespace(ctx)
    }

    /** Whether one caught failure is a stale-revision conflict. */
    function isConflict(error) {
      return error?.code === 'settings/conflict' || /conflict/i.test(String(error?.message ?? ''))
    }

    function createSection(ctx, t) {
      return function SettingsSection() {
        const [tab, setTab] = React.useState('roles')
        const [loading, setLoading] = React.useState(true)
        const [busy, setBusy] = React.useState(false)
        const [error, setError] = React.useState('')
        const [notice, setNotice] = React.useState('')
        const [revision, setRevision] = React.useState(0)
        const [roles, setRoles] = React.useState([])
        const [rules, setRules] = React.useState([])
        const [selectedRole, setSelectedRole] = React.useState('general')
        const [writable, setWritable] = React.useState(true)
        const [dirty, setDirty] = React.useState(false)
        const [parse, setParse] = React.useState({ request: emptyParseRequest(), result: emptyParseResult() })
        const [parseError, setParseError] = React.useState('')
        const [parseTimeoutNonce, setParseTimeoutNonce] = React.useState('')
        const [pendingNonce, setPendingNonce] = React.useState('')
        const [consumedNonce, setConsumedNonce] = React.useState('')
        const [parseFieldsPresent, setParseFieldsPresent] = React.useState(true)
        const parseFieldRef = React.useRef(false)
        const gatesBaselineRef = React.useRef('[]')
        const [engine, setEngine] = React.useState({
          leadPlaybook: '',
          activeTemplate: '',
          freshProvider: 'spawn',
          forkProvider: 'fork',
          gates: [],
          gatesDisabled: [],
        })
        const dirtyRef = React.useRef(false)
        const busyRef = React.useRef(false)
        React.useEffect(() => { dirtyRef.current = dirty }, [dirty])
        React.useEffect(() => { busyRef.current = busy }, [busy])

        /** Adopt one settings view into every local slice. */
        const applyView = React.useCallback((view) => {
          const nextRoles = Array.isArray(view.value?.roles) ? view.value.roles : []
          setRoles(nextRoles)
          setRules(Array.isArray(view.value?.rules) ? view.value.rules : [])
          setEngine({
            leadPlaybook: typeof view.value?.leadPlaybook === 'string' ? view.value.leadPlaybook : '',
            activeTemplate: typeof view.value?.activeTemplate === 'string' ? view.value.activeTemplate : '',
            freshProvider: typeof view.value?.freshProvider === 'string' && view.value.freshProvider !== '' ? view.value.freshProvider : 'spawn',
            forkProvider: typeof view.value?.forkProvider === 'string' && view.value.forkProvider !== '' ? view.value.forkProvider : 'fork',
            gates: Array.isArray(view.value?.gates) ? view.value.gates : [],
            gatesDisabled: Array.isArray(view.value?.gatesDisabled) ? view.value.gatesDisabled : [],
          })
          setSelectedRole((current) =>
            nextRoles.some((role) => role.id === current) ? current : (nextRoles[0]?.id ?? 'general'))
          setParse({ request: parseRequestOf(view.value), result: parseResultOf(view.value) })
          gatesBaselineRef.current = JSON.stringify(Array.isArray(view.value?.gates) ? view.value.gates : [])
          // A request left pending by another page keeps this mount polling too.
          const restoredRequest = parseRequestOf(view.value)
          setPendingNonce((current) => (current !== '' ? current : restoredRequest.nonce))
          const present = Object.prototype.hasOwnProperty.call(view.value ?? {}, 'gateParseResult')
            && Object.prototype.hasOwnProperty.call(view.value ?? {}, 'gateParseRequest')
          parseFieldRef.current = present
          setParseFieldsPresent(present)
          setRevision(view.revision)
          setDirty(false)
        }, [])

        const load = React.useCallback(async () => {
          setLoading(true)
          setError('')
          try {
            const stateView = await readSettingsState(ctx)
            setWritable(stateView.writable)
            applyView(stateView.view)
            // Land on the engine tab when a parse is still pending so the user
            // can see its state (or the readable timeout error) immediately.
            if (parseRequestOf(stateView.view.value).nonce !== '') setTab('engine')
          } catch (caught) {
            setError(caught.message === 'settings-remote-unavailable'
              ? t('settingsUnavailable')
              : `${t('loadFailed')}${caught.message}`)
          } finally {
            setLoading(false)
          }
        }, [ctx, t, applyView])

        /** Re-read revision and parse fields without touching local edits. */
        const refreshParseAndRevision = async () => {
          try {
            const stateView = await readSettingsState(ctx)
            setRevision(stateView.view.revision)
            setWritable(stateView.writable)
            setParse({ request: parseRequestOf(stateView.view.value), result: parseResultOf(stateView.view.value) })
            const present = Object.prototype.hasOwnProperty.call(stateView.view.value ?? {}, 'gateParseResult')
              && Object.prototype.hasOwnProperty.call(stateView.view.value ?? {}, 'gateParseRequest')
            parseFieldRef.current = present
            setParseFieldsPresent(present)
          } catch {
            // Keep the local view; the next event or explicit refresh retries.
          }
        }

        /** React to the configuration changing in another page or mount. */
        const onExternalUpdate = async () => {
          try {
            const stateView = await readSettingsState(ctx)
            setRevision(stateView.view.revision)
            setWritable(stateView.writable)
            setParse({ request: parseRequestOf(stateView.view.value), result: parseResultOf(stateView.view.value) })
            const present = Object.prototype.hasOwnProperty.call(stateView.view.value ?? {}, 'gateParseResult')
              && Object.prototype.hasOwnProperty.call(stateView.view.value ?? {}, 'gateParseRequest')
            parseFieldRef.current = present
            setParseFieldsPresent(present)
            if (!dirtyRef.current && !busyRef.current) {
              applyView(stateView.view)
            } else {
              setNotice(t('gateParseSettingsUpdated'))
            }
          } catch {
            // A transient read failure keeps the local view intact.
          }
        }

        const clientPollRef = React.useRef({ start: null, interval: null })
        const eventSeenNonceRef = React.useRef('')
        const parseRequestRef = React.useRef(parse.request)
        const pendingNonceRef = React.useRef('')
        React.useEffect(() => { parseRequestRef.current = parse.request }, [parse.request])
        React.useEffect(() => { pendingNonceRef.current = pendingNonce }, [pendingNonce])

        /** Stop the 2s fallback poll and its delayed start. */
        const stopClientPoll = () => {
          const poll = clientPollRef.current
          if (poll.start !== null) {
            clearTimeout(poll.start)
            poll.start = null
          }
          if (poll.interval !== null) {
            clearInterval(poll.interval)
            poll.interval = null
          }
        }

        /** Start the fallback poll no earlier than two periods after a request. */
        const startClientPoll = () => {
          stopClientPoll()
          clientPollRef.current.start = setTimeout(() => {
            clientPollRef.current.start = null
            clientPollRef.current.interval = setInterval(() => { void refreshParseAndRevision() }, 2000)
          }, 2 * PARSE_POLL_PERIOD_MS)
        }

        React.useEffect(() => {
          void load()
          // Load once on mount; later reads are explicit refresh or post-save.
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [])

        React.useEffect(() => {
          const remote = ctx.remote
          if (typeof remote?.$on !== 'function') return undefined
          const off = remote.$on('settings/document-updated', (payload) => {
            // Some emitters pass the namespace string, others a document object.
            const namespace = typeof payload === 'string' ? payload : payload?.ns
            if (typeof namespace === 'string' && namespace !== NS) return
            // The event path owns this nonce: never let the poll shadow it.
            const expected = parseRequestRef.current.nonce || pendingNonceRef.current
            if (expected !== '') eventSeenNonceRef.current = expected
            stopClientPoll()
            queueMicrotask(() => { void onExternalUpdate() })
          })
          return () => {
            stopClientPoll()
            if (typeof off === 'function') off()
          }
          // The subscription reads refs, so it never needs to re-register.
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [])

        // While one parse is in flight, re-read the handshake fields with a short
        // poll: the event is best-effort. The poll starts two periods late and
        // stops as soon as the event arrives or nothing is pending.
        React.useEffect(() => {
          const pending = pendingNonce !== '' || parse.request.nonce !== ''
          if (!pending) {
            stopClientPoll()
            return undefined
          }
          const nonce = parse.request.nonce || pendingNonce
          const timeout = setTimeout(() => { setParseTimeoutNonce(nonce) }, PARSE_CLIENT_TIMEOUT_MS)
          if (eventSeenNonceRef.current !== nonce) startClientPoll()
          return () => {
            clearTimeout(timeout)
            stopClientPoll()
          }
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [pendingNonce, parse.request.nonce])

        // Only a result answering the local request is consumed; anything else is
        // treated as stale and leaves the thinking state alone until timeout.
        React.useEffect(() => {
          if (pendingNonce === '' || parse.result.status === '') return
          if (parse.result.nonce !== pendingNonce) return
          setPendingNonce('')
          setParseTimeoutNonce('')
        }, [pendingNonce, parse.result.nonce, parse.result.status])

        const selected = roles.find((role) => role.id === selectedRole)

        const editSelected = (patch) => {
          setDirty(true)
          setRoles((current) => current.map((role) =>
            role.id === selectedRole ? { ...role, ...patch } : role,
          ))
        }

        const renameSelected = (id) => {
          setDirty(true)
          const previous = selectedRole
          setRoles((current) => current.map((role) =>
            role.id === previous ? { ...role, id } : role,
          ))
          setSelectedRole(id)
        }

        const addRole = () => {
          setDirty(true)
          let index = 1
          while (roles.some((role) => role.id === `role-${index}`)) index += 1
          const role = {
            id: `role-${index}`,
            name: `Role ${index}`,
            description: '',
            persona: '',
            provider: '',
            model: '',
            reasoningEffort: '',
            toolMode: 'all',
            tools: [],
            skills: [],
            color: '',
          }
          setRoles((current) => [...current, role])
          setSelectedRole(role.id)
          setTab('roles')
        }

        const removeRole = () => {
          if (selectedRole === 'general') return
          setDirty(true)
          setRoles((current) => current.filter((role) => role.id !== selectedRole))
          setSelectedRole('general')
        }

        const saveRoles = async () => {
          setError('')
          setNotice('')
          for (const role of roles) {
            const invalid = validate(role, roles, t)
            if (invalid !== '') {
              setError(invalid)
              return
            }
          }
          setBusy(true)
          try {
            const view = await writeNamespace(ctx, revision, 'roles', roles)
            setRevision(view.revision)
            setRoles(Array.isArray(view.value?.roles) ? view.value.roles : roles)
            setDirty(false)
            setNotice(t('saved'))
          } catch (caught) {
            setError(`${t('saveFailed')}${caught.message}`)
            await refreshParseAndRevision()
          } finally {
            setBusy(false)
          }
        }

        const saveRules = async () => {
          setError('')
          setNotice('')
          setBusy(true)
          try {
            const view = await writeNamespace(ctx, revision, 'rules', rules)
            setRevision(view.revision)
            setRules(Array.isArray(view.value?.rules) ? view.value.rules : rules)
            setDirty(false)
            setNotice(t('saved'))
          } catch (caught) {
            setError(`${t('saveFailed')}${caught.message}`)
            await refreshParseAndRevision()
          } finally {
            setBusy(false)
          }
        }

        const saveEngine = async () => {
          setError('')
          setNotice('')
          const gateList = Array.isArray(engine.gates) ? engine.gates : []
          const gatesChanged = JSON.stringify(gateList) !== gatesBaselineRef.current
          let legacyWarning = ''
          const describeProblem = (gate, problem) =>
            `${fill(t('gateParseErrLegacyGate'), { id: gate?.id || '?' })} ${problem.params === undefined ? t(problem.key) : fill(t(problem.key), problem.params)}`
          if (gatesChanged) {
            // The gate list is part of this save: every entry must be fully valid.
            if (gateList.length > MAX_GATES) {
              setError(fill(t('gateParseErrLimit'), { max: MAX_GATES }))
              return
            }
            const roleIds = new Set([...roles.map((role) => role.id), 'general'])
            const seenIds = new Set()
            for (const gate of gateList) {
              const problem = validateGateObject(gate)
              if (problem !== '') {
                setError(describeProblem(gate, problem))
                return
              }
              const roleProblem = gateRoleProblem(gate, roleIds)
              if (roleProblem !== '') {
                setError(describeProblem(gate, roleProblem))
                return
              }
              if (seenIds.has(gate.id)) {
                setError(describeProblem(gate, { key: 'gateParseValidateDuplicate', params: { id: gate.id } }))
                return
              }
              seenIds.add(gate.id)
            }
          } else {
            // Only other engine fields changed: legacy gate defects are surfaced
            // as a warning instead of blocking a save that does not touch gates.
            const roleIds = new Set([...roles.map((role) => role.id), 'general'])
            for (const gate of gateList) {
              const problem = validateGateObject(gate) || gateRoleProblem(gate, roleIds)
              if (problem !== '') {
                legacyWarning = describeProblem(gate, problem)
                break
              }
            }
          }
          setBusy(true)
          try {
            const gateIds = new Set(gateList.map((gate) => gate.id))
            const keptDisabled = (Array.isArray(engine.gatesDisabled) ? engine.gatesDisabled : [])
              .filter((id) => gateIds.has(id))
            const fields = [
              { field: 'leadPlaybook', value: engine.leadPlaybook },
              { field: 'activeTemplate', value: engine.activeTemplate },
              { field: 'freshProvider', value: engine.freshProvider.trim() || 'spawn' },
              { field: 'forkProvider', value: engine.forkProvider.trim() || 'fork' },
              { field: 'gates', value: engine.gates },
              { field: 'gatesDisabled', value: keptDisabled },
            ]
            // An adopted result is consumed by this save: drop it in the same write.
            // Older Hosts do not declare the field, so the cleanup is skipped
            // there instead of failing the whole save.
            if (consumedNonce !== '' && parse.result.nonce === consumedNonce && parseFieldRef.current) {
              fields.push({ field: 'gateParseResult', value: emptyParseResult() })
            }
            const view = await writeNamespaceFields(ctx, revision, fields)
            setRevision(view.revision)
            // Adopt the Host's canonical shape (schema defaults filled) into the
            // local editor, then use that same value as the save baseline.
            const savedGates = Array.isArray(view.value?.gates) ? view.value.gates : []
            const savedDisabled = Array.isArray(view.value?.gatesDisabled) ? view.value.gatesDisabled : []
            setEngine((current) => ({ ...current, gates: savedGates, gatesDisabled: savedDisabled }))
            setParse({ request: parseRequestOf(view.value), result: parseResultOf(view.value) })
            setConsumedNonce('')
            setDirty(false)
            gatesBaselineRef.current = JSON.stringify(savedGates)
            setNotice(legacyWarning === '' ? t('saved') : `${t('saved')} · ${legacyWarning}`)
          } catch (caught) {
            setError(`${t('saveFailed')}${caught.message}`)
            // Keep the local engine (including adopted drafts); only refresh the
            // revision and parse fields so the user can retry the save.
            await refreshParseAndRevision()
          } finally {
            setBusy(false)
          }
        }

        const markDirty = () => setDirty(true)

        /** Ask the host to parse one natural-language gate description. */
        const startParse = async (textValue) => {
          const description = String(textValue ?? '').trim()
          if (description === '') {
            setParseError(t('gateAiEmpty'))
            return
          }
          if (description.length > MAX_PARSE_TEXT) {
            setParseError(fill(t('gateAiTooLong'), { max: MAX_PARSE_TEXT }))
            return
          }
          setParseError('')
          setParseTimeoutNonce('')
          setNotice('')
          try {
            const nonce = makeNonce()
            setPendingNonce(nonce)
            const view = await writeNamespaceFields(ctx, revision, [
              { field: 'gateParseRequest', value: { nonce, text: description, at: Date.now() } },
              { field: 'gateParseResult', value: emptyParseResult() },
            ])
            setRevision(view.revision)
            setParse({ request: parseRequestOf(view.value), result: parseResultOf(view.value) })
          } catch (caught) {
            setPendingNonce('')
            setParseError(isConflict(caught)
              ? t('gateParseErrConflict')
              : `${t('gateParseErrRequestFailed')} ${caught.message}`)
            await refreshParseAndRevision()
          }
        }

        /** Clear both handshake fields; the host drops any in-flight reply. */
        const cancelParse = async () => {
          setParseError('')
          setParseTimeoutNonce('')
          setPendingNonce('')
          setNotice('')
          try {
            const view = await writeNamespaceFields(ctx, revision, [
              { field: 'gateParseRequest', value: emptyParseRequest() },
              { field: 'gateParseResult', value: emptyParseResult() },
            ])
            setRevision(view.revision)
            setParse({ request: parseRequestOf(view.value), result: parseResultOf(view.value) })
            setConsumedNonce('')
          } catch (caught) {
            setParseError(`${t('gateParseErrRequestFailed')} ${caught.message}`)
            await refreshParseAndRevision()
          }
        }

        /** Drop the stored result without touching the gate list. */
        const clearParseResult = async () => {
          setConsumedNonce('')
          setParseTimeoutNonce('')
          setPendingNonce('')
          if (!parseFieldRef.current) {
            // An older Host does not declare the field: clear only the local copy.
            setParse({ request: parseRequestOf({}), result: emptyParseResult() })
            return
          }
          try {
            const view = await writeNamespaceFields(ctx, revision, [
              { field: 'gateParseResult', value: emptyParseResult() },
            ])
            setRevision(view.revision)
            setParse({ request: parseRequestOf(view.value), result: parseResultOf(view.value) })
          } catch {
            await refreshParseAndRevision()
          }
        }

        /** Remember which result the user adopted, so the save can clear it. */
        const consumeParse = (nonce) => {
          if (typeof nonce === 'string' && nonce !== '') setConsumedNonce(nonce)
        }

        /**
         * Give up on one timed-out request: clear both handshake fields (the
         * host may have given up writing them) and stop the fallback poll.
         *
         * A fresh read + revision guard keeps this from clobbering a newer
         * request that arrived while the timeout was firing.
         */
        const abandonParse = async (nonce) => {
          setParseTimeoutNonce('')
          setPendingNonce((current) => (current === nonce ? '' : current))
          if (!parseFieldRef.current) return
          let latestRevision = revision
          try {
            const stateView = await readSettingsState(ctx)
            latestRevision = stateView.view.revision
            setRevision(latestRevision)
            const currentRequest = parseRequestOf(stateView.view.value)
            if (currentRequest.nonce !== '' && currentRequest.nonce !== nonce) return
          } catch {
            await refreshParseAndRevision()
            return
          }
          try {
            const view = await writeNamespaceFields(ctx, latestRevision, [
              { field: 'gateParseRequest', value: emptyParseRequest() },
              { field: 'gateParseResult', value: emptyParseResult() },
            ])
            setRevision(view.revision)
            setParse({ request: parseRequestOf(view.value), result: parseResultOf(view.value) })
            setConsumedNonce('')
          } catch {
            await refreshParseAndRevision()
          }
        }

        React.useEffect(() => {
          if (parseTimeoutNonce === '') return
          // Keep a readable failure visible after the fields are cleaned up:
          // the thinking state would otherwise silently return to idle. The
          // error key is intentionally not the thinking-state string, so an
          // abandoned request never leaves "正在解析" wording behind.
          setParseError(t('gateParseErrTimeout'))
          void abandonParse(parseTimeoutNonce)
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [parseTimeoutNonce])

        const editEngine = (patch) => {
          markDirty()
          // The engine editor API takes a patch object; anything else is ignored.
          if (patch !== null && typeof patch === 'object') {
            setEngine((current) => ({ ...current, ...patch }))
          }
        }

        if (loading) {
          return h('div', { style: { padding: 24, color: 'var(--dsw-alias-label-secondary)' } }, t('loading'))
        }

        return h('div', {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            padding: '14px 16px 28px',
            maxWidth: 1200,
            width: '100%',
            boxSizing: 'border-box',
            margin: '0 auto',
            color: 'var(--dsw-alias-label-primary)',
          },
        }, [
          h('header', { key: 'head', style: { display: 'flex', flexDirection: 'column', gap: 6 } }, [
            h('h2', { key: 'title', style: { margin: 0, fontSize: 20, fontWeight: 600 } }, t('title')),
            h('p', { key: 'sub', style: { ...small, margin: 0, maxWidth: 720, lineHeight: 1.5 } }, t('subtitle')),
          ]),
          h('div', { key: 'tabs', style: { ...row, borderBottom: '1px solid var(--dsw-alias-border-l1)', paddingBottom: 8 } },
            TABS.map((entry) => h('button', {
              key: entry.id,
              type: 'button',
              style: tabStyle(tab === entry.id),
              onClick: () => { setTab(entry.id); setNotice('') },
            }, t(entry.label)))),
          error !== '' ? h('div', { key: 'error', style: banner('state-error') }, error) : null,
          notice !== '' ? h('div', { key: 'notice', style: banner('state-success') }, notice) : null,
          // Mirrors a pending-parse failure at page level, so it stays readable
          // even when the engine tab (and its inline banner) is not mounted.
          parseError !== ''
            ? h('div', { key: 'parse-error', role: 'alert', style: banner('state-error') }, parseError)
            : null,
          tab === 'roles'
            ? h(RolesPanel, {
                key: 'roles',
                t,
                roles,
                rules,
                selectedRole,
                selected,
                busy,
                onSelect: (id) => { setSelectedRole(id); setNotice('') },
                onAdd: addRole,
                onRemove: removeRole,
                onEdit: editSelected,
                onRename: renameSelected,
                onSave: saveRoles,
                onRefresh: load,
              })
            : tab === 'engine'
              ? h(EnginePanel, {
                  key: 'engine',
                  t,
                  engine,
                  setEngine: editEngine,
                  busy,
                  onSave: saveEngine,
                  onRefresh: load,
                  parse,
                  parseError,
                  parseTimeoutNonce,
                  pendingNonce,
                  writable,
                  parseFieldsPresent,
                  onStartParse: startParse,
                  onCancelParse: cancelParse,
                  onClearParseResult: clearParseResult,
                  onConsumeParse: consumeParse,
                })
              : h(RulesPanel, {
                  key: 'rules',
                  t,
                  roles,
                  rules,
                  busy,
                  setRules: (updater) => { setDirty(true); setRules(updater) },
                  onSave: saveRules,
                  onRefresh: load,
                }),
        ])
      }
    }

    function EnginePanel({
      t, engine, setEngine, busy, onSave, onRefresh,
      parse, parseError, parseTimeoutNonce, pendingNonce, writable, parseFieldsPresent,
      onStartParse, onCancelParse, onClearParseResult, onConsumeParse,
    }) {
      const edit = (patch) => setEngine(patch)
      return h('div', { style: { ...panel, ...card, maxWidth: 860 } }, [
        h('div', { key: 'head', style: { ...row, justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 } }, [
          h('strong', { key: 'title', style: { fontSize: 13 } }, t('engine')),
          h('div', { key: 'actions', style: row }, [
            h('button', { key: 'refresh', type: 'button', style: button, onClick: onRefresh }, t('refresh')),
            h('button', { key: 'save', type: 'button', style: primaryButton, disabled: busy, onClick: onSave }, busy ? t('saving') : t('save')),
          ]),
        ]),
        h('span', { key: 'hint', style: small }, t('engineHint')),
        h('label', { key: 'playbook', style: label }, [
          h('span', { key: 'l' }, t('leadPlaybook')),
          h('textarea', {
            key: 'i',
            placeholder: t('playbookPlaceholder'),
            style: { ...input, minHeight: 140, resize: 'vertical', lineHeight: 1.5, fontFamily: 'monospace' },
            value: engine.leadPlaybook,
            onChange: (event) => edit({ leadPlaybook: event.target.value }),
          }),
        ]),
        h('div', { key: 'row', style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 } }, [
          h('label', { key: 'template', style: label }, [
            h('span', { key: 'l' }, t('activeTemplate')),
            h('input', {
              key: 'i',
              style: input,
              value: engine.activeTemplate,
              placeholder: 'software-dev',
              onChange: (event) => edit({ activeTemplate: event.target.value }),
            }),
            h('span', { key: 'hint', style: { ...small, fontSize: 11 } }, t('templateHint')),
          ]),
        ]),
        h('div', { key: 'backends', style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 } }, [
          h('label', { key: 'fresh', style: label }, [
            h('span', { key: 'l' }, t('freshProvider')),
            h('input', {
              key: 'i',
              style: input,
              value: engine.freshProvider,
              placeholder: 'spawn',
              onChange: (event) => edit({ freshProvider: event.target.value }),
            }),
          ]),
          h('label', { key: 'fork', style: label }, [
            h('span', { key: 'l' }, t('forkProvider')),
            h('input', {
              key: 'i',
              style: input,
              value: engine.forkProvider,
              placeholder: 'fork',
              onChange: (event) => edit({ forkProvider: event.target.value }),
            }),
          ]),
          h('span', { key: 'backend-hint', style: { ...small, fontSize: 11, alignSelf: 'end' } }, t('backendHint')),
        ]),
        h(GatesPanel, {
          key: 'gates',
          t,
          gates: engine.gates,
          disabled: engine.gatesDisabled,
          onChange: (patch) => edit(patch),
          parse,
          parseError,
          parseTimeoutNonce,
          pendingNonce,
          writable,
          parseFieldsPresent,
          onStartParse,
          onCancelParse,
          onClearParseResult,
          onConsumeParse,
        }),
      ])
    }

    /** Chip-style badge used inside gate cards. */
    function gateChip(text, tone) {
      const tones = {
        neutral: { background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-primary)' },
        deny: { background: 'rgba(229,72,77,0.12)', color: '#e5484d' },
        key: { background: 'rgba(70,167,88,0.12)', color: '#46a758' },
        muted: { background: 'transparent', color: 'var(--dsw-alias-label-secondary)' },
      }
      return h('span', {
        style: {
          ...tones[tone] ?? tones.neutral,
          fontSize: 11,
          padding: '2px 8px',
          borderRadius: 10,
          whiteSpace: 'nowrap',
        },
      }, text)
    }

    /** Human summary of one freshness window. */
    function freshLabel(freshFor, t) {
      if (!Number.isFinite(freshFor) || freshFor <= 0) return t('gateFreshAlways')
      if (freshFor % 3600 === 0) return t('gateFreshFor').replace('{v}', String(freshFor / 3600)).replace('{u}', t('unitHour'))
      if (freshFor % 60 === 0) return t('gateFreshFor').replace('{v}', String(freshFor / 60)).replace('{u}', t('unitMinute'))
      return t('gateFreshFor').replace('{v}', String(freshFor)).replace('{u}', t('unitSecond'))
    }

    /** Drafts of one parse result that are still offered for adoption. */
    function parseDrafts(result, ignored, adopted) {
      const gates = Array.isArray(result?.gates) ? result.gates : []
      return gates.filter((gate) => !ignored.includes(gate.id) && !adopted.includes(gate.id))
    }

    /** List of gate cards, the add/edit form, and the natural-language dialog. */
    function GatesPanel({
      t, gates, disabled, onChange,
      parse, parseError, parseTimeoutNonce, pendingNonce, writable, parseFieldsPresent,
      onStartParse, onCancelParse, onClearParseResult, onConsumeParse,
    }) {
      const [editing, setEditing] = React.useState(null)
      const [dialog, setDialog] = React.useState(false)
      const [draft, setDraft] = React.useState('')
      const [localError, setLocalError] = React.useState('')
      const [ignored, setIgnored] = React.useState([])
      const [adopted, setAdopted] = React.useState([])
      const [acknowledged, setAcknowledged] = React.useState(false)
      const [discardPending, setDiscardPending] = React.useState(false)
      const gateList = Array.isArray(gates) ? gates : []
      const disabledList = Array.isArray(disabled) ? disabled : []
      const request = parse?.request ?? emptyParseRequest()
      const result = parse?.result ?? emptyParseResult()
      const pending = pendingNonce !== '' || request.nonce !== ''
      const timedOut = pendingNonce !== '' && parseTimeoutNonce === pendingNonce
      const fresh = parseResultFresh(result)
      // Only the answer to the local request is consumed; a late reply to an
      // older request must not replace the state the user is watching.
      const matchesPending = pendingNonce === '' || result.nonce === pendingNonce
      const visible = fresh && result.status !== '' && matchesPending
      const thinking = pending && !(result.status !== '' && result.nonce === pendingNonce)
      const drafts = visible && result.status === 'ok' ? parseDrafts(result, ignored, adopted) : []
      const existingIds = gateList.map((gate) => gate.id)
      /** Whether one gate blocks every shell call (no command pattern). */
      const needsAck = (gate) => {
        const deny = gate?.deny ?? {}
        const tools = Array.isArray(deny.tool) ? deny.tool : []
        const pattern = typeof deny.commandPattern === 'string' ? deny.commandPattern : ''
        return pattern === '' && (tools.includes('bash') || tools.includes('pwsh'))
      }
      /** Non-fatal warnings shown next to one draft. */
      const draftWarnings = (gate) => {
        const list = []
        const deny = gate?.deny ?? {}
        const require = gate?.require ?? {}
        if (needsAck(gate)) list.push(t('gateParseWarnAllShell'))
        const commandSuccess = require.commandSuccess
        const byRoles = Array.isArray(require.byRoles) ? require.byRoles : []
        const selfKey = (require.event !== undefined && byRoles.includes(deny.role))
          || (commandSuccess !== null && typeof commandSuccess === 'object'
            && String(commandSuccess.role ?? '') === String(deny.role ?? ''))
        if (selfKey) list.push(t('gateParseWarnSelfKey'))
        return list
      }
      const ackRequired = drafts.some((gate) => needsAck(gate))
      React.useEffect(() => {
        setAcknowledged(false)
        setDiscardPending(false)
      }, [result.nonce])
      const toast = adopted.length > 0
        ? fill(t('gateParseToastAdopted'), { id: adopted[adopted.length - 1] })
        : ''

      const toggle = (id) => {
        const next = disabledList.includes(id)
          ? disabledList.filter((entry) => entry !== id)
          : [...disabledList, id]
        onChange({ gatesDisabled: next })
      }
      const remove = (id) => {
        onChange({
          gates: gateList.filter((gate) => gate.id !== id),
          gatesDisabled: disabledList.filter((entry) => entry !== id),
        })
      }
      /** Add or replace one gate; create never overwrites an existing id. */
      const upsert = (gate, mode, originalId) => {
        if (mode === 'create') {
          if (gateList.some((entry) => entry.id === gate.id)) return false
          onChange({ gates: [...gateList, gate] })
        } else {
          const previous = originalId ?? gate.id
          onChange({ gates: gateList.map((entry) => (entry.id === previous ? gate : entry)) })
        }
        setEditing(null)
        return true
      }

      const openDialog = () => {
        setDialog(true)
        setLocalError('')
        if (draft === '' && request.text !== '') setDraft(request.text)
      }
      const closeDialog = () => {
        setDialog(false)
        setLocalError('')
      }
      const submitDialog = () => {
        const value = draft.trim()
        if (value === '') {
          setLocalError(t('gateAiEmpty'))
          return
        }
        if (value.length > MAX_PARSE_TEXT) {
          setLocalError(fill(t('gateAiTooLong'), { max: MAX_PARSE_TEXT }))
          return
        }
        setLocalError('')
        void onStartParse(value)
      }

      /** Adopt one draft into the local gate list; never writes configuration. */
      const adoptOne = (rawGate) => {
        const gate = canonicalAdoptableGate(rawGate)
        if (needsAck(gate) && !acknowledged) {
          setLocalError(t('gateParseWarnAck'))
          return
        }
        if (gateList.length >= MAX_GATES) {
          setLocalError(fill(t('gateParseValidateLimit'), { max: MAX_GATES }))
          return
        }
        const problem = validateGateObject(gate)
        if (problem !== '') {
          setLocalError(gateProblemMessage(t, gate, problem))
          return
        }
        if (existingIds.includes(gate.id)) {
          setLocalError(gateProblemMessage(t, gate, { key: 'gateParseValidateDuplicate', params: { id: gate.id } }))
          return
        }
        onChange({ gates: [...gateList, gate] })
        setAdopted((current) => (current.includes(gate.id) ? current : [...current, gate.id]))
        if (result.nonce !== '') onConsumeParse(result.nonce)
        setLocalError('')
      }
      /** Adopt every remaining draft, refusing the batch when any draft is invalid. */
      const adoptAll = () => {
        const candidates = drafts.map((gate) => canonicalAdoptableGate(gate))
        if (candidates.length === 0) return
        if (candidates.some((gate) => needsAck(gate)) && !acknowledged) {
          setLocalError(t('gateParseWarnAck'))
          return
        }
        if (gateList.length + candidates.length > MAX_GATES) {
          setLocalError(fill(t('gateParseValidateLimit'), { max: MAX_GATES }))
          return
        }
        const seen = new Set(existingIds)
        for (const gate of candidates) {
          const problem = validateGateObject(gate)
          if (problem !== '') {
            setLocalError(gateProblemMessage(t, gate, problem))
            return
          }
          if (seen.has(gate.id)) {
            setLocalError(gateProblemMessage(t, gate, { key: 'gateParseValidateDuplicate', params: { id: gate.id } }))
            return
          }
          seen.add(gate.id)
        }
        onChange({ gates: [...gateList, ...candidates] })
        setAdopted((current) => [...current, ...candidates.map((gate) => gate.id)])
        if (result.nonce !== '') onConsumeParse(result.nonce)
        setLocalError('')
      }
      /** Undo the most recent adoption (local only). */
      const undoAdopt = () => {
        const last = adopted[adopted.length - 1]
        if (last === undefined) return
        onChange({
          gates: gateList.filter((gate) => gate.id !== last),
          gatesDisabled: disabledList.filter((entry) => entry !== last),
        })
        setAdopted((current) => current.filter((entry) => entry !== last))
      }

      const thinkingBlock = thinking
        ? h('div', {
            key: 'thinking',
            role: 'status',
            'aria-label': t('gateAiA11ySpinner'),
            style: { ...row, gap: 8, flexWrap: 'wrap' },
          }, [
            h('span', { key: 's', style: small }, timedOut
              ? fill(t('gateAiThinkingTimeout'), { seconds: Math.round(PARSE_CLIENT_TIMEOUT_MS / 1000) })
              : t('gateAiThinking')),
            h('span', { key: 'h', style: { ...small, fontSize: 11 } }, t('gateAiThinkingHint')),
            h('button', {
              key: 'cancel',
              type: 'button',
              style: button,
              onClick: () => { void onCancelParse() },
            }, t('gateAiCancelParse')),
            h('button', {
              key: 'retry',
              type: 'button',
              style: button,
              disabled: draft.trim() === '',
              onClick: submitDialog,
            }, t('gateParseRetry')),
          ])
        : null

      const resultBlock = visible
        ? h('div', {
            key: 'result',
            role: 'status',
            'aria-label': t('gateAiA11yResult'),
            style: {
              ...card,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              background: 'var(--dsw-alias-bg-layer-2)',
            },
          }, [
            h('div', { key: 'head', style: { ...row, justifyContent: 'space-between', flexWrap: 'wrap' } }, [
              h('strong', { key: 't', style: { fontSize: 12 } }, t('gateParseResultTitle')),
              result.status === 'ok'
                ? h('span', { key: 'count', style: { ...small, fontSize: 11 } }, fill(t('gateParseResultCount'), { count: drafts.length }))
                : null,
              h('div', { key: 'actions', style: row }, [
                result.status === 'ok'
                  ? h('button', {
                      key: 'all',
                      type: 'button',
                      style: primaryButton,
                      disabled: drafts.length === 0 || (ackRequired && !acknowledged),
                      onClick: adoptAll,
                    }, t('gateParseAdoptAll'))
                  : null,
                ...(discardPending
                  ? [
                      h('button', {
                        key: 'discard-confirm',
                        type: 'button',
                        style: button,
                        onClick: () => { setDiscardPending(false); void onClearParseResult() },
                      }, t('gateParseDiscardResult')),
                      h('button', {
                        key: 'discard-cancel',
                        type: 'button',
                        style: button,
                        onClick: () => setDiscardPending(false),
                      }, t('gateAiCancel')),
                    ]
                  : [
                      h('button', {
                        key: 'discard',
                        type: 'button',
                        style: button,
                        onClick: () => setDiscardPending(true),
                      }, t('gateParseDiscardResult')),
                    ]),
              ]),
            ]),
            h('span', { key: 'hint', style: { ...small, fontSize: 11 } }, t('gateParseResultHint')),
            ackRequired
              ? h('label', { key: 'ack', style: { ...row, gap: 8, alignItems: 'flex-start' } }, [
                  h('input', {
                    key: 'i',
                    type: 'checkbox',
                    checked: acknowledged,
                    onChange: (event) => setAcknowledged(event.target.checked === true),
                  }),
                  h('span', { key: 'l', style: { ...small, fontSize: 11 } }, t('gateParseWarnAck')),
                ])
              : null,
            result.status === 'ok'
              ? (drafts.length === 0
                  ? h('span', { key: 'none', style: small }, t('gateEmpty'))
                  : h('div', { key: 'drafts', style: { display: 'flex', flexDirection: 'column', gap: 8 } },
                      drafts.map((gate) => h('div', {
                        key: gate.id,
                        style: { display: 'flex', flexDirection: 'column', gap: 6 },
                      }, [
                        h(GateCard, { key: 'card', t, gate, off: false, readOnly: true }),
                        h('span', { key: 'summary', style: { ...small, fontSize: 11, lineHeight: 1.5 } }, gateSummary(gate, t)),
                        ...draftWarnings(gate).map((warning) => h('span', {
                          key: 'warn-' + warning.slice(0, 12),
                          style: { ...small, fontSize: 10, color: 'var(--dsw-alias-state-warn-primary)' },
                        }, warning)),
                        h('div', { key: 'actions', style: row }, [
                          h('button', {
                            key: 'adopt',
                            type: 'button',
                            style: primaryButton,
                            disabled: needsAck(gate) && !acknowledged,
                            onClick: () => adoptOne(gate),
                          }, t('gateParseAdopt')),
                          h('button', {
                            key: 'ignore',
                            type: 'button',
                            style: button,
                            onClick: () => setIgnored((current) => [...current, gate.id]),
                          }, t('gateParseIgnore')),
                        ]),
                      ]))))
              : null,
            result.status === 'needs-input'
              ? h('span', { key: 'need', style: small }, fill(t('gateParseNeedsInput'), { note: result.note }))
              : null,
            result.status === 'error'
              ? h('div', { key: 'error', role: 'alert', 'aria-label': t('gateAiA11yError'), style: banner('state-error') }, [
                  h('div', { key: 'h' }, parseErrorText(result, t)),
                  result.code !== ''
                    ? h('div', {
                        key: 'c',
                        style: { fontSize: 11, opacity: 0.75, marginTop: 3 },
                      }, fill(t('gateParseCode'), { code: result.code }))
                    : null,
                  result.detail !== ''
                    ? h('div', {
                        key: 'd',
                        style: { fontSize: 11, opacity: 0.75, marginTop: 3 },
                      }, fill(t('gateParseDetail'), { detail: result.detail }))
                    : null,
                ])
              : null,
            result.status === 'ok' && result.note !== ''
              ? h('span', { key: 'note', style: small }, fill(t('gateParseNote'), { note: result.note }))
              : null,
            result.warnings.length > 0
              ? h('span', {
                  key: 'warnings',
                  style: { ...small, fontSize: 11 },
                }, fill(t('gateParseWarnings'), { warnings: result.warnings.join('; ') }))
              : null,
            toast !== ''
              ? h('div', { key: 'toast', style: { ...row, gap: 6, flexWrap: 'wrap' } }, [
                  h('span', { key: 't', style: { ...small, fontSize: 11 } }, toast),
                  h('button', { key: 'undo', type: 'button', style: button, onClick: undoAdopt }, t('gateParseUndo')),
                ])
              : null,
          ])
        : null

      const dialogBlock = dialog
        ? h('div', {
            key: 'ai',
            role: 'dialog',
            'aria-label': fill(t('gateAiA11yDialog'), { title: t('gateAiTitle') }),
            style: { ...card, display: 'flex', flexDirection: 'column', gap: 8 },
          }, [
            h('div', { key: 'head', style: { ...row, justifyContent: 'space-between' } }, [
              h('strong', { key: 't', style: { fontSize: 12 } }, t('gateAiTitle')),
              h('button', { key: 'close', type: 'button', style: button, title: t('gateAiCancel'), onClick: closeDialog }, t('gateAiClose')),
            ]),
            h('span', { key: 'hint', style: { ...small, fontSize: 11 } }, t('gateAiHint')),
            h('textarea', {
              key: 'input',
              style: { ...input, minHeight: 80, resize: 'vertical', lineHeight: 1.5 },
              placeholder: t('gateAiPlaceholder'),
              value: draft,
              disabled: pending,
              maxLength: MAX_PARSE_TEXT,
              onChange: (event) => { setDraft(event.target.value); setLocalError('') },
            }),
            h('span', { key: 'count', style: { ...small, fontSize: 10 } },
              fill(t('gateAiCharCount'), { count: draft.length, max: MAX_PARSE_TEXT })),
            localError !== '' || parseError !== ''
              ? h('div', {
                  key: 'err',
                  role: 'alert',
                  'aria-label': t('gateAiA11yError'),
                  style: banner('state-error'),
                }, parseError || localError)
              : null,
            thinkingBlock,
            h('div', { key: 'actions', style: row }, [
              h('button', {
                key: 'submit',
                type: 'button',
                style: primaryButton,
                disabled: pending,
                onClick: submitDialog,
              }, t('gateAiSubmit')),
              h('button', {
                key: 'manual',
                type: 'button',
                style: button,
                onClick: () => { closeDialog(); setEditing('new') },
              }, t('gateParseManual')),
            ]),
          ])
        : null

      if (editing !== null) {
        const isCreate = editing === 'new'
        return h(GateForm, {
          key: 'form',
          t,
          mode: isCreate ? 'create' : 'edit',
          initial: isCreate ? null : editing,
          originalId: isCreate ? undefined : editing.id,
          existingIds,
          onSubmit: (gate) => {
            const ok = upsert(gate, isCreate ? 'create' : 'edit', isCreate ? undefined : editing.id)
            if (!ok) setLocalError(gateProblemMessage(t, gate, { key: 'gateErrDup' }))
          },
          onCancel: () => setEditing(null),
        })
      }

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } }, [
        h('div', { key: 'head', style: { ...row, justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 } }, [
          h('span', { key: 'l', style: { fontSize: 12, fontWeight: 600 } }, t('gates')),
          h('div', { key: 'actions', style: row }, [
            h('button', {
              key: 'ai',
              type: 'button',
              style: button,
              disabled: !writable || parseFieldsPresent === false,
              title: !writable
                ? t('gateAiReadonly')
                : (parseFieldsPresent === false ? t('gateAiUnavailable') : t('gateAiTitle')),
              onClick: openDialog,
            }, t('gateAiAdd')),
            h('button', {
              key: 'add',
              type: 'button',
              style: button,
              onClick: () => setEditing('new'),
            }, t('gateAdd')),
          ]),
        ]),
        h('span', { key: 'hint', style: { ...small, fontSize: 11 } }, t('gatesHint')),
        result.completedAt > 0 && result.status !== '' && !fresh
          ? h('div', { key: 'stale', style: { ...row, gap: 8, flexWrap: 'wrap' } }, [
              h('span', { key: 's', style: { ...small, fontSize: 11 } },
                fill(t('gateParseStale'), { age: ageLabel(t, Date.now() - result.completedAt) })),
              h('button', {
                key: 'drop',
                type: 'button',
                style: button,
                onClick: () => { void onClearParseResult() },
              }, t('gateParseIgnore')),
            ])
          : null,
        localError !== '' ? h('div', { key: 'err', style: banner('state-error') }, localError) : null,
        // A timeout/parse failure stays readable after the handshake fields are
        // cleared, and always offers the manual form as a fallback.
        parseError !== ''
          ? h('div', {
              key: 'parse-error',
              role: 'alert',
              'aria-label': t('gateAiA11yError'),
              style: banner('state-error'),
            }, [
              h('div', { key: 'text' }, parseError),
              h('div', { key: 'actions', style: { ...row, marginTop: 6 } }, [
                h('button', {
                  key: 'manual',
                  type: 'button',
                  style: button,
                  onClick: () => { closeDialog(); setEditing('new') },
                }, t('gateParseManual')),
              ]),
            ])
          : null,
        resultBlock,
        dialogBlock,
        gateList.length === 0
          ? h('div', { key: 'empty', style: { ...small, padding: '8px 0' } }, t('gateEmpty'))
          : h('div', { key: 'list', style: { display: 'flex', flexDirection: 'column', gap: 10 } },
              gateList.map((gate) => h(GateCard, {
                key: gate.id,
                t,
                gate,
                off: disabledList.includes(gate.id),
                onToggle: () => toggle(gate.id),
                onEdit: () => setEditing(gate),
                onDelete: () => remove(gate.id),
              }))),
      ])
    }

    /** One gate rendered as a deny -> key flow card. */
    function GateCard({ t, gate, off, readOnly, onToggle, onEdit, onDelete }) {
      const deny = gate.deny ?? {}
      const require = gate.require ?? {}
      // Schema defaults leave empty objects behind; only a filled commandSuccess counts.
      const commandSuccess = require.commandSuccess && (require.commandSuccess.role || require.commandSuccess.pattern)
        ? require.commandSuccess
        : undefined
      const invalidateOn = require.invalidateOn && ((require.invalidateOn.tool ?? []).length > 0 || require.invalidateOn.role)
        ? require.invalidateOn
        : undefined
      const chipBox = {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        alignItems: 'center',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 8,
        padding: '8px 10px',
        flex: '1 1 220px',
        minWidth: 0,
        opacity: off ? 0.55 : 1,
      }
      return h('div', {
        style: {
          border: '1px solid var(--dsw-alias-border-l1)',
          borderRadius: 10,
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          background: 'var(--dsw-alias-bg-layer-1)',
        },
      }, [
        h('div', { key: 'head', style: { ...row, justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 } }, [
          h('div', { key: 'name', style: { ...row, gap: 8, minWidth: 0 } }, [
            readOnly ? null : h('button', {
              key: 'toggle',
              type: 'button',
              title: `${off ? t('gateEnable') : t('gateDisable')}: ${gate.id}`,
              'aria-label': `${off ? t('gateEnable') : t('gateDisable')}: ${gate.id}`,
              onClick: onToggle,
              style: {
                width: 34, height: 18, borderRadius: 9, border: 'none', cursor: 'pointer',
                background: off ? 'var(--dsw-alias-bg-layer-2)' : '#46a758',
                position: 'relative', flex: '0 0 auto',
              },
            }, h('span', {
              style: {
                position: 'absolute', top: 2, left: off ? 2 : 18, width: 14, height: 14,
                borderRadius: 7, background: '#fff', transition: 'left 0.15s',
              },
            })),
            h('code', { key: 'id', style: { fontWeight: 600, fontSize: 12 } }, gate.id),
            off
              ? gateChip(t('gateOff'), 'muted')
              : readOnly
                ? gateChip(t('candidate'), 'muted')
                : gateChip(t('gateOn'), 'key'),
          ]),
          readOnly
            ? null
            : h('div', { key: 'actions', style: row }, [
                h('button', { key: 'edit', type: 'button', style: button, title: `${t('gateEdit')}: ${gate.id}`, 'aria-label': `${t('gateEdit')}: ${gate.id}`, onClick: onEdit }, t('gateEdit')),
                h('button', { key: 'delete', type: 'button', style: button, title: `${t('gateDelete')}: ${gate.id}`, 'aria-label': `${t('gateDelete')}: ${gate.id}`, onClick: onDelete }, t('gateDelete')),
              ]),
        ]),
        gate.description ? h('div', { key: 'desc', style: { ...small, fontSize: 11 } }, gate.description) : null,
        h('div', {
          key: 'flow',
          style: { display: 'flex', alignItems: 'stretch', gap: 8, flexWrap: 'wrap' },
        }, [
          h('div', { key: 'deny', style: chipBox }, [
            gateChip(t('gateDeny'), 'deny'),
            gateChip(`@ ${deny.role ?? '?'}`, 'neutral'),
            ...(Array.isArray(deny.tool) ? deny.tool.map((tool) => gateChip(tool, 'neutral')) : []),
            deny.commandPattern ? gateChip(`/ ${deny.commandPattern} /`, 'muted') : null,
          ]),
          h('div', { key: 'arrow', style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' } }, [
            h('span', { style: { fontSize: 16, lineHeight: '16px' } }, '→'),
            h('span', { style: { ...small, fontSize: 10 } }, t('gateNeedKey')),
          ]),
          h('div', { key: 'key', style: chipBox }, [
            gateChip(t('gateKey'), 'key'),
            commandSuccess
              ? gateChip(t('gateKindCommand'), 'neutral')
              : gateChip(`"${require.event || '?'}"`, 'neutral'),
            commandSuccess
              ? gateChip(`@ ${commandSuccess.role}`, 'neutral')
              : gateChip(`${t('gateKeyBy')} ${(require.byRoles ?? []).join('/')}`, 'neutral'),
            commandSuccess ? gateChip(`/ ${commandSuccess.pattern} /`, 'muted') : null,
            gateChip(freshLabel(require.freshFor, t), 'muted'),
            invalidateOn
              ? gateChip(`${t('gateInvalidateOn')} ${invalidateOn.role ?? t('gateParseSumAnyRole')} ${(invalidateOn.tool ?? []).join('/')}`, 'deny')
              : null,
          ]),
        ]),
      ])
    }

    /** Structured add/edit form for one gate. */
    function GateForm({ t, mode, initial, originalId, existingIds, onSubmit, onCancel }) {
      const editingExisting = mode === 'edit'
      const [form, setForm] = React.useState(() => formFromGate(editingExisting ? initial : null))
      const [error, setError] = React.useState('')
      const set = (patch) => setForm((current) => ({ ...current, ...patch }))

      const submit = () => {
        const problem = validateGateInput(form, existingIds, editingExisting ? (originalId ?? initial?.id) : undefined)
        if (problem !== '') {
          setError(problem.params === undefined ? t(problem.key) : fill(t(problem.key), problem.params))
          return
        }
        onSubmit(gateFromForm(form))
      }

      const field = (key, text, placeholder, value, onChange, extra) => h('label', { key, style: label }, [
        h('span', { key: 'l' }, text),
        h('input', { key: 'i', style: input, placeholder, value, onChange: (event) => onChange(event.target.value) }),
        extra ?? null,
      ])

      return h('div', {
        style: {
          border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 10, padding: '12px 14px',
          display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--dsw-alias-bg-layer-1)',
        },
      }, [
        h('div', { key: 'head', style: { ...row, justifyContent: 'space-between' } }, [
          h('strong', { key: 't', style: { fontSize: 13 } }, editingExisting ? `${t('gateEdit')}: ${initial?.id ?? ''}` : t('gateAdd')),
          h('button', { key: 'cancel', type: 'button', style: button, onClick: onCancel }, t('gateFormCancel')),
        ]),
        h('div', { key: 'grid1', style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,2fr)', gap: 12 } }, [
          field('id', t('gateFormId'), 'review-before-commit', form.id, (v) => set({ id: v })),
          field('desc', t('gateFormDesc'), '', form.description, (v) => set({ description: v })),
        ]),
        h('div', { key: 'deny-title', style: row }, gateChip(t('gateDeny'), 'deny')),
        h('div', { key: 'grid2', style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1.4fr)', gap: 12 } }, [
          field('denyRole', t('gateFormDenyRole'), 'dev', form.denyRole, (v) => set({ denyRole: v })),
          field('denyTools', t('gateFormDenyTools'), 'bash, pwsh', form.denyTools, (v) => set({ denyTools: v })),
          field('pattern', t('gateFormPattern'), '\\bgit\\s+commit\\b', form.commandPattern, (v) => set({ commandPattern: v }), h('span', { key: 'h', style: { ...small, fontSize: 11 } }, t('gatePatternHint'))),
        ]),
        h('div', { key: 'key-title', style: row }, [
          gateChip(t('gateKey'), 'key'),
          h('span', { key: 'kind', style: { ...small, fontSize: 11 } }, `${t('gateFormKeyKind')}:`),
          h('button', { key: 'ke', type: 'button', style: tabStyle(form.kind === 'event'), onClick: () => set({ kind: 'event' }) }, t('gateKindEvent')),
          h('button', { key: 'kc', type: 'button', style: tabStyle(form.kind === 'command'), onClick: () => set({ kind: 'command' }) }, t('gateKindCommand')),
        ]),
        form.kind === 'event'
          ? h('div', { key: 'event-fields', style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', gap: 12 } }, [
              field('event', t('gateFormEvent'), 'review-approved', form.event, (v) => set({ event: v })),
              field('byRoles', t('gateFormByRoles'), 'cr', form.byRoles, (v) => set({ byRoles: v })),
            ])
          : h('div', { key: 'cs-fields', style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1.4fr)', gap: 12 } }, [
              field('csRole', t('gateFormCsRole'), 'tse', form.csRole, (v) => set({ csRole: v })),
              field('csTool', t('gateFormCsTool'), 'pwsh', form.csTool, (v) => set({ csTool: v })),
              field('csPattern', t('gateFormCsPattern'), '\\b(pnpm|npm)\\s+test\\b', form.csPattern, (v) => set({ csPattern: v })),
            ]),
        h('div', { key: 'grid3', style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', gap: 12 } }, [
          field('freshFor', t('gateFormFreshFor'), '14400', String(form.freshFor), (v) => set({ freshFor: v }), h('span', { key: 'h', style: { ...small, fontSize: 11 } }, t('gateAiFreshHint'))),
        ]),
        h('div', { key: 'inv-title', style: row }, gateChip(t('gateInvalidateOn'), 'deny')),
        h('div', { key: 'grid4', style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 } }, [
          field('invRole', t('gateFormInvRole'), 'dev', form.invalidateRole, (v) => set({ invalidateRole: v })),
          field('invTools', t('gateFormInvTools'), 'write, edit', form.invalidateTools, (v) => set({ invalidateTools: v })),
        ]),
        error !== '' ? h('div', { key: 'err', style: banner('state-error') }, error) : null,
        h('div', { key: 'foot', style: { ...row, justifyContent: 'flex-end' } }, [
          h('button', { key: 'save', type: 'button', style: primaryButton, onClick: submit }, t('gateFormSave')),
        ]),
      ])
    }

    function RolesPanel({ t, roles, rules, selectedRole, selected, busy, onSelect, onAdd, onRemove, onEdit, onRename, onSave, onRefresh }) {
      const roleRules = roles === undefined || rules === undefined
        ? []
        : rules
            .filter((rule) => rule.roleId === selectedRole)
            .sort((left, right) => (right.updatedAt ?? right.createdAt ?? 0) - (left.updatedAt ?? left.createdAt ?? 0))
      const [installedSkills, setInstalledSkills] = React.useState([])
      const [skillView, setSkillView] = React.useState(null)
      React.useEffect(() => {
        let cancelled = false
        setInstalledSkills([])
        setSkillView(null)
        if (selectedRole === undefined || selectedRole === '') return undefined
        fetch(`/agent-team-roles/role-skills/${selectedRole}`)
          .then((response) => (response.ok ? response.json() : { skills: [] }))
          .then((data) => {
            if (!cancelled) setInstalledSkills(Array.isArray(data.skills) ? data.skills : [])
          })
          .catch(() => {
            if (!cancelled) setInstalledSkills([])
          })
        return () => {
          cancelled = true
        }
      }, [selectedRole, onRefresh])
      const viewSkill = (name) => {
        if (skillView !== null && skillView.name === name) {
          setSkillView(null)
          return
        }
        fetch(`/agent-team-roles/role-skills/${selectedRole}/${name}`)
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error('not found'))))
          .then((data) => setSkillView({ name: data.name ?? name, content: data.content ?? '' }))
          .catch(() => setSkillView({ name, content: t('skillLoadFailed') }))
      }
      const skillViewer = skillView === null
        ? null
        : h('pre', {
            key: 'skill-content',
            style: {
              margin: 0,
              padding: 10,
              border: '1px solid var(--dsw-alias-border-l1)',
              borderRadius: 6,
              background: 'var(--dsw-alias-bg-layer-2)',
              color: 'var(--dsw-alias-label-primary)',
              fontSize: 12,
              lineHeight: 1.55,
              maxHeight: 320,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              fontFamily: 'monospace',
            },
          }, skillView.content)
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } }, [
        h('div', {
          key: 'picker',
          style: {
            ...panel,
            ...card,
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            flex: '0 0 auto',
            height: 'auto',
            gap: 8,
            alignItems: 'center',
            justifyContent: 'flex-start',
            padding: '8px 10px',
          },
        }, [
          h('label', {
            key: 'role',
            style: {
              ...label,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              flex: '1 1 260px',
              minWidth: 0,
            },
          }, [
            h('span', { key: 'l', style: { flex: '0 0 auto' } }, t('roles')),
            h('select', {
              key: 'i',
              style: { ...input, flex: '1 1 auto', minWidth: 0 },
              value: selectedRole,
              onChange: (event) => onSelect(event.target.value),
            }, roles.map((role) => h('option', { key: role.id, value: role.id }, `${role.name || role.id} (${role.id})`))),
          ]),
          h('button', { key: 'add', type: 'button', style: button, onClick: onAdd }, t('addRole')),
        ]),
        h('div', { key: 'editor', style: { ...panel, ...card } }, selected === undefined
          ? [h('span', { key: 'empty', style: small }, t('empty'))]
          : [
              h('div', { key: 'row1', style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 } }, [
                h('label', { key: 'id', style: label }, [
                  h('span', { key: 'l' }, t('roleId')),
                  h('input', {
                    key: 'i',
                    style: input,
                    value: selected.id,
                    disabled: selected.id === 'general',
                    title: selected.id === 'general' ? t('generalLocked') : undefined,
                    onChange: (event) => onRename(event.target.value.toLowerCase()),
                  }),
                ]),
                h('label', { key: 'name', style: label }, [
                  h('span', { key: 'l' }, t('roleName')),
                  h('input', {
                    key: 'i',
                    style: input,
                    value: selected.name ?? '',
                    onChange: (event) => onEdit({ name: event.target.value }),
                  }),
                ]),
              ]),
              h('label', { key: 'desc', style: label }, [
                h('span', { key: 'l' }, t('description')),
                h('input', {
                  key: 'i',
                  style: input,
                  value: selected.description ?? '',
                  onChange: (event) => onEdit({ description: event.target.value }),
                }),
              ]),
              h('label', { key: 'persona', style: label }, [
                h('span', { key: 'l' }, t('persona')),
                h('textarea', {
                  key: 'i',
                  style: { ...input, minHeight: 120, resize: 'vertical', lineHeight: 1.5 },
                  value: selected.persona ?? '',
                  onChange: (event) => onEdit({ persona: event.target.value }),
                }),
              ]),
              h('div', { key: 'route', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 } }, [
                h('label', { key: 'provider', style: label }, [
                  h('span', { key: 'l' }, t('provider')),
                  h('input', {
                    key: 'i',
                    style: input,
                    value: selected.provider ?? '',
                    onChange: (event) => onEdit({ provider: event.target.value }),
                  }),
                ]),
                h('label', { key: 'model', style: label }, [
                  h('span', { key: 'l' }, t('model')),
                  h('input', {
                    key: 'i',
                    style: input,
                    value: selected.model ?? '',
                    onChange: (event) => onEdit({ model: event.target.value }),
                  }),
                ]),
                h('label', { key: 'effort', style: label }, [
                  h('span', { key: 'l' }, t('effort')),
                  h('input', {
                    key: 'i',
                    style: input,
                    value: selected.reasoningEffort ?? '',
                    onChange: (event) => onEdit({ reasoningEffort: event.target.value }),
                  }),
                ]),
              ]),
              h('div', { key: 'tools', style: { ...panel, gap: 10 } }, [
                h('label', { key: 'mode', style: label }, [
                  h('span', { key: 'l' }, t('toolMode')),
                  h('select', {
                    key: 'i',
                    style: input,
                    value: selected.toolMode === 'custom' ? 'custom' : 'all',
                    onChange: (event) => onEdit({ toolMode: event.target.value }),
                  }, [
                    h('option', { key: 'all', value: 'all' }, t('toolModeAll')),
                    h('option', { key: 'custom', value: 'custom' }, t('toolModeCustom')),
                  ]),
                ]),
                selected.toolMode === 'custom'
                  ? h('label', { key: 'allow', style: label }, [
                      h('span', { key: 'l' }, t('tools')),
                      h('textarea', {
                        key: 'i',
                        style: { ...input, minHeight: 72, resize: 'vertical', lineHeight: 1.5 },
                        placeholder: 'read, glob, grep, write, edit, pwsh',
                        value: textOf(selected.tools),
                        onChange: (event) => onEdit({ tools: listOf(event.target.value) }),
                      }),
                    ])
                  : h('span', { key: 'all-hint', style: { ...small, fontSize: 11 } }, t('toolModeAllHint')),
              ]),
              h('label', { key: 'deny', style: label }, [
                h('span', { key: 'l' }, t('denyCommands')),
                h('textarea', {
                  key: 'i',
                  style: { ...input, minHeight: 60, resize: 'vertical', lineHeight: 1.5, fontFamily: 'monospace' },
                  placeholder: '\\bgit\\s+push\\b, \\bnpm\\s+publish\\b',
                  value: textOf(selected.denyCommands),
                  onChange: (event) => onEdit({ denyCommands: listOf(event.target.value) }),
                }),
                h('span', { key: 'hint', style: { ...small, fontSize: 11 } }, t('denyHint')),
              ]),
              h('label', { key: 'skills', style: label }, [
                h('span', { key: 'l' }, t('skills')),
                h('input', {
                  key: 'i',
                  style: input,
                  placeholder: 'change-review, api-docs',
                  value: textOf(selected.skills),
                  onChange: (event) => onEdit({ skills: listOf(event.target.value) }),
                }),
                h('span', { key: 'hint', style: { ...small, fontSize: 11 } }, t('roleSkillHint')),
              ]),
              h('div', { key: 'installed-skills', style: { ...label, gap: 6 } }, [
                h('span', { key: 'l', style: { ...small, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' } }, t('installedSkills')),
                installedSkills.length === 0
                  ? h('span', { key: 'none', style: small }, t('noInstalledSkills'))
                  : h('div', {
                      key: 'chips',
                      style: { display: 'flex', flexWrap: 'wrap', gap: 6 },
                    }, installedSkills.map((name) => h('button', {
                      key: name,
                      type: 'button',
                      style: tabStyle(skillView !== null && skillView.name === name),
                      onClick: () => viewSkill(name),
                    }, name))),
                skillViewer,
                h('span', { key: 'guide', style: { ...small, fontSize: 11 } }, t('skillViewGuide')),
              ]),
              h('label', { key: 'color', style: { ...label, maxWidth: 180 } }, [
                h('span', { key: 'l' }, t('color')),
                h('input', {
                  key: 'i',
                  style: input,
                  value: selected.color ?? '',
                  placeholder: '#7c9cff',
                  onChange: (event) => onEdit({ color: event.target.value }),
                }),
              ]),
              h('div', { key: 'footer', style: { ...row, justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, paddingTop: 4 } }, [
                h('div', { key: 'left', style: row }, [
                  h('button', { key: 'refresh', type: 'button', style: button, onClick: onRefresh }, t('refresh')),
                  h('button', {
                    key: 'delete',
                    type: 'button',
                    style: { ...button, color: 'var(--dsw-alias-state-error-primary)' },
                    disabled: selected.id === 'general',
                    title: selected.id === 'general' ? t('generalLocked') : t('deleteRole'),
                    onClick: onRemove,
                  }, t('deleteRole')),
                ]),
                h('button', {
                  key: 'save',
                  type: 'button',
                  style: primaryButton,
                  disabled: busy,
                  onClick: onSave,
                }, busy ? t('saving') : t('save')),
              ]),
              h('div', {
                key: 'history',
                style: {
                  ...panel,
                  gap: 8,
                  borderTop: '1px solid var(--dsw-alias-border-l1)',
                  paddingTop: 12,
                  marginTop: 4,
                },
              }, [
                h('div', { key: 'history-head', style: { ...row, flexWrap: 'wrap', gap: 8 } }, [
                  h('strong', { key: 'title', style: { fontSize: 13 } }, t('history')),
                  h('span', { key: 'hint', style: { ...small, fontSize: 11 } }, t('historyHint')),
                ]),
                ...(roleRules.length === 0
                  ? [h('span', { key: 'empty', style: small }, t('noHistory'))]
                  : roleRules.map((rule) => h('div', {
                      key: rule.id,
                      style: {
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        padding: '7px 0',
                        borderTop: '1px dashed var(--dsw-alias-border-l1)',
                      },
                    }, [
                      h('div', { key: 'meta', style: { ...row, flexWrap: 'wrap', gap: 8, alignItems: 'center' } }, [
                        h('span', {
                          key: 'status',
                          style: {
                            ...small,
                            fontSize: 10,
                            padding: '1px 7px',
                            borderRadius: 999,
                            background: 'var(--dsw-alias-bg-layer-2)',
                          },
                        }, t(rule.status) ?? rule.status),
                        h('span', { key: 'time', style: { ...small, fontSize: 11 } }, new Date(rule.updatedAt ?? rule.createdAt ?? Date.now()).toLocaleString()),
                        h('span', { key: 'meta', style: { ...small, fontSize: 11 } }, `${t('evidence')} ${rule.evidence} · ${t('source')} ${rule.source}`),
                      ]),
                      h('span', { key: 'text', style: { fontSize: 12, lineHeight: 1.55 } }, rule.text),
                    ]))),
              ]),
            ]),
      ])
    }

    function RulesPanel({ t, roles, rules, busy, setRules, onSave, onRefresh }) {
      const [roleFilter, setRoleFilter] = React.useState('')
      const [draft, setDraft] = React.useState({ roleId: roles[0]?.id ?? 'general', text: '', polarity: 'preference', status: 'active' })
      const visible = roleFilter === '' ? rules : rules.filter((rule) => rule.roleId === roleFilter)

      const editRule = (id, patch) => {
        setRules((current) => current.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)))
      }
      const removeRule = (id) => setRules((current) => current.filter((rule) => rule.id !== id))
      const addRule = () => {
        if (draft.text.trim() === '') return
        const now = Date.now()
        setRules((current) => [...current, {
          id: `manual-${now}-${current.length}`,
          roleId: draft.roleId,
          text: draft.text.trim(),
          polarity: draft.polarity,
          status: draft.status,
          evidence: 1,
          source: 'user',
          createdAt: now,
          updatedAt: now,
        }])
        setDraft((current) => ({ ...current, text: '' }))
      }

      return h('div', { style: { ...panel, ...card } }, [
        h('div', { key: 'head', style: { ...row, justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 } }, [
          h('div', { key: 'left', style: row }, [
            h('label', { key: 'filter', style: { ...label, width: 200 } }, [
              h('span', { key: 'l' }, t('ruleRole')),
              h('select', {
                key: 'i',
                style: input,
                value: roleFilter,
                onChange: (event) => setRoleFilter(event.target.value),
              }, [
                h('option', { key: 'all', value: '' }, t('allRoles')),
                ...roles.map((role) => h('option', { key: role.id, value: role.id }, role.name || role.id)),
              ]),
            ]),
          ]),
          h('div', { key: 'right', style: row }, [
            h('button', { key: 'refresh', type: 'button', style: button, onClick: onRefresh }, t('refresh')),
            h('button', { key: 'save', type: 'button', style: primaryButton, disabled: busy, onClick: onSave }, busy ? t('saving') : t('save')),
          ]),
        ]),
        h('span', { key: 'hint', style: small }, t('ruleHint')),
        ...(visible.length === 0
          ? [h('span', { key: 'empty', style: small }, t('noRules'))]
          : visible.map((rule) => h('div', {
              key: rule.id,
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                borderTop: '1px solid var(--dsw-alias-border-l1)',
                paddingTop: 10,
              },
            }, [
              h('div', { key: 'meta-row', style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } }, [
                h('span', { key: 'role', style: { ...small, fontSize: 12, fontWeight: 500 } }, rule.roleId),
                h('select', {
                  key: 'status',
                  style: { ...input, width: 110 },
                  value: rule.status,
                  onChange: (event) => editRule(rule.id, { status: event.target.value }),
                }, [
                  h('option', { key: 'active', value: 'active' }, t('active')),
                  h('option', { key: 'candidate', value: 'candidate' }, t('candidate')),
                  h('option', { key: 'superseded', value: 'superseded' }, t('superseded')),
                ]),
                h('span', { key: 'meta', style: { ...small, fontSize: 11 } }, `${t('evidence')} ${rule.evidence} · ${t('source')} ${rule.source}`),
                h('span', { key: 'spacer', style: { flex: '1 1 auto' } }),
                h('button', {
                  key: 'delete',
                  type: 'button',
                  title: t('deleteRule'),
                  style: { ...button, padding: '3px 9px', color: 'var(--dsw-alias-state-error-primary)' },
                  onClick: () => removeRule(rule.id),
                }, '×'),
              ]),
              h('input', {
                key: 'text',
                style: input,
                value: rule.text,
                onChange: (event) => editRule(rule.id, { text: event.target.value }),
              }),
            ]))),
        h('div', { key: 'add', style: { display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--dsw-alias-border-l1)', paddingTop: 12 } }, [
          h('input', {
            key: 'text',
            style: input,
            placeholder: t('ruleText'),
            value: draft.text,
            onChange: (event) => setDraft((current) => ({ ...current, text: event.target.value })),
          }),
          h('div', { key: 'controls', style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px 120px auto', gap: 8 } }, [
            h('select', {
              key: 'role',
              style: input,
              value: draft.roleId,
              onChange: (event) => setDraft((current) => ({ ...current, roleId: event.target.value })),
            }, roles.map((role) => h('option', { key: role.id, value: role.id }, role.name || role.id))),
            h('select', {
              key: 'polarity',
              style: input,
              value: draft.polarity,
              onChange: (event) => setDraft((current) => ({ ...current, polarity: event.target.value })),
            }, [
              h('option', { key: 'preference', value: 'preference' }, t('preference')),
              h('option', { key: 'do', value: 'do' }, t('do')),
              h('option', { key: 'dont', value: 'dont' }, t('dont')),
            ]),
            h('select', {
              key: 'status',
              style: input,
              value: draft.status,
              onChange: (event) => setDraft((current) => ({ ...current, status: event.target.value })),
            }, [
              h('option', { key: 'active', value: 'active' }, t('active')),
              h('option', { key: 'candidate', value: 'candidate' }, t('candidate')),
            ]),
            h('button', { key: 'add', type: 'button', style: button, onClick: addRule }, t('addRule')),
          ]),
        ]),
      ])
    }

    let createPortal = null
    try {
      createPortal = require('react-dom').createPortal
    } catch {
      createPortal = null
    }

    function createPullControl(ctx, t) {
      return function PullControl({ sessionId, useSessions }) {
        const [open, setOpen] = React.useState(false)
        const [roles, setRoles] = React.useState([])
        const [task, setTask] = React.useState('')
        const [loading, setLoading] = React.useState(false)
        const [busy, setBusy] = React.useState('')
        const [error, setError] = React.useState('')
        const [notice, setNotice] = React.useState('')
        const preset = useSessions === undefined
          ? undefined
          : useSessions((state) => {
              const value = state.byId?.[sessionId]?.projectionValues?.agentPreset
              return typeof value === 'string' ? value : undefined
            })
        if (useSessions !== undefined && preset !== 'team-lead') return null

        const openPanel = async () => {
          setOpen(true)
          setError('')
          setNotice('')
          setLoading(true)
          try {
            const view = await readNamespace(ctx)
            setRoles(Array.isArray(view.value?.roles) ? view.value.roles : [])
          } catch (caught) {
            setError(`${t('pullLoadFailed')}${caught.message}`)
          } finally {
            setLoading(false)
          }
        }

        const pull = async (role) => {
          if (busy !== '' || sessionId === undefined) return
          setBusy(role.id)
          setError('')
          setNotice('')
          try {
            const line = `/team-spawn ${role.id}${task.trim() === '' ? '' : ` ${task.trim()}`}`
            const response = await ctx.remote.commands.execute(sessionId, line, [])
            if (!response.ok) throw new Error(response.error.message)
            if (response.value === undefined) throw new Error('team-spawn command is unavailable')
            if (response.value.result.kind === 'error') throw new Error(response.value.result.text)
            setNotice(`${t('pullSuccess')} ${role.name || role.id}`)
            try {
              await ctx.sessions?.refreshProjections(sessionId)
            } catch {
              // The Team projection also refreshes from its own event push.
            }
            // The panel stays open after a successful pull so several members
            // can be pulled in a row; it closes via ×, the backdrop, or a
            // preset change. The consumed task is cleared for the next pull.
            setTask('')
          } catch (caught) {
            setError(`${t('pullFailed')}${caught.message}`)
          } finally {
            setBusy('')
          }
        }

        const trigger = h('button', {
          key: 'trigger',
          type: 'button',
          title: t('pullTitle'),
          style: { ...button, padding: '4px 8px', fontSize: 12, whiteSpace: 'nowrap' },
          onClick: openPanel,
        }, `＋ ${t('pullMembers')}`)

        if (!open) return trigger

        const panel = h('div', {
          key: 'panel',
          role: 'dialog',
          'aria-label': t('pullTitle'),
          onClick: (event) => event.stopPropagation(),
          style: {
            position: 'fixed',
            left: '50%',
            bottom: 96,
            transform: 'translateX(-50%)',
            width: 'min(560px, calc(100vw - 32px))',
            maxHeight: '70vh',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            padding: 14,
            background: 'var(--dsw-alias-bg-overlay)',
            color: 'var(--dsw-alias-label-primary)',
            border: '1px solid var(--dsw-alias-border-l2)',
            borderRadius: 12,
            boxShadow: '0 18px 50px rgba(0, 0, 0, 0.35)',
            zIndex: 1001,
          },
        }, [
          h('div', { key: 'head', style: { ...row, justifyContent: 'space-between', gap: 8 } }, [
            h('div', { key: 'title', style: { display: 'flex', flexDirection: 'column', gap: 3 } }, [
              h('strong', { key: 't', style: { fontSize: 14 } }, t('pullTitle')),
              h('span', { key: 'h', style: { ...small, fontSize: 11 } }, t('pullHint')),
            ]),
            h('button', {
              key: 'close',
              type: 'button',
              style: { ...button, padding: '2px 8px' },
              onClick: () => setOpen(false),
            }, '×'),
          ]),
          h('input', {
            key: 'task',
            style: input,
            placeholder: t('pullTaskPlaceholder'),
            value: task,
            onChange: (event) => setTask(event.target.value),
          }),
          error !== '' ? h('div', { key: 'error', style: banner('state-error') }, error) : null,
          notice !== '' ? h('div', { key: 'notice', style: banner('state-success') }, notice) : null,
          h('div', {
            key: 'list',
            style: { display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', minHeight: 0 },
          }, loading
            ? [h('span', { key: 'loading', style: small }, t('loading'))]
            : roles.length === 0
              ? [h('span', { key: 'empty', style: small }, t('pullNoRoles'))]
              : roles.map((role) => h('div', {
                  key: role.id,
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    border: '1px solid var(--dsw-alias-border-l1)',
                    borderRadius: 8,
                    background: 'var(--dsw-alias-bg-layer-1)',
                  },
                }, [
                  h('span', {
                    key: 'dot',
                    style: {
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      flex: '0 0 auto',
                      background: role.color || 'var(--dsw-alias-brand-primary)',
                    },
                  }),
                  h('span', { key: 'copy', style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: '1 1 auto' } }, [
                    h('span', { key: 'name', style: { fontSize: 13, fontWeight: 500 } }, role.name || role.id),
                    h('span', {
                      key: 'id',
                      style: {
                        ...small,
                        fontSize: 11,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      },
                    }, `${role.id}${role.description ? ` · ${role.description}` : ''}`),
                  ]),
                  h('button', {
                    key: 'pull',
                    type: 'button',
                    'aria-label': `${t('pullAction')} ${role.name || role.id}`,
                    style: primaryButton,
                    disabled: busy !== '',
                    onClick: () => pull(role),
                  }, busy === role.id ? t('pulling') : t('pullAction')),
                ]))),
        ])

        const backdrop = h('div', {
          key: 'backdrop',
          onClick: () => { if (busy === '') setOpen(false) },
          style: { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0, 0, 0, 0.28)' },
        }, [panel])

        return h(React.Fragment, null, [
          trigger,
          createPortal === null ? backdrop : createPortal(backdrop, document.body),
        ])
      }
    }

    function TeamRolesIcon({ size = 18 }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
      }, [
        h('circle', { key: 'a', cx: 9, cy: 8, r: 3 }),
        h('path', { key: 'b', d: 'M3.5 19c0-2.8 2.5-4.5 5.5-4.5s5.5 1.7 5.5 4.5' }),
        h('circle', { key: 'c', cx: 17, cy: 9, r: 2.2 }),
        h('path', { key: 'd', d: 'M14.6 14.8c2.8-.5 5.9 1 5.9 4.2' }),
      ])
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.settings', 'remote.commands', 'sessions'],
      apply(ctx) {
        const t = ctx.locale.bind(NS)
        const SettingsPage = createSection(ctx, t)
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'agent-team-roles:locale')
        ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: NS,
          order: 26,
          label: () => t('nav'),
          locale: NS,
        }, SettingsPage)), 'agent-team-roles:settings-page')
        ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: NS,
        }, () => h('div', { style: { height: '100%', overflowY: 'auto' } }, [
          h(SettingsPage, {}),
        ]))), 'agent-team-roles:main-panel')
        ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: NS,
          order: 25,
          label: () => t('nav'),
        }, TeamRolesIcon)), 'agent-team-roles:sidebar-entry')
        ctx.effect(() => ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
          name: 'conversation.input.left',
          id: 'agent-team-roles-pull',
          order: 15,
          label: () => t('pullMembers'),
          locale: NS,
        }, createPullControl(ctx, t))), 'agent-team-roles:pull-control')
      },
    }
  },
})
