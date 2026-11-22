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
      { id: 'log', label: 'logTab' },
    ]

    const zh = {
      nav: 'Agent 团队角色',
      leadRole: 'Lead（团队领导）',
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
      gateErrLegacyGate: '闸门 {id} 配置无效，无法保存',
      gateErrLimit: '闸门数量已达上限 {max}',
      gateErrDenyRole: '被拦角色必填',
      gateErrPatternLong: '正则过长（最多 {max} 字符）',
      gateErrToolsMax: '工具列表最多 {max} 个',
      gateErrInvalid: '闸门配置无效（需要且只能需要一把钥匙）',
      gateErrDuplicate: '已存在同 ID 的闸门（{id}）',
      gateErrUnknownRole: '角色不在当前配置中（{role}）',
      gateAnyMemberRole: '任一成员（不含 Lead）',
      gateFreshHint: '超过该时长后钥匙失效（0 表示永久有效）',
      settingsUpdated: '配置已在别处更新',
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
      closeSettings: '关闭', unsaved: '有未保存的修改', saveAndLeave: '保存并继续', discardAndLeave: '放弃修改', keepEditing: '继续编辑',
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
      roleSkillHint: '留空可用全部已安装的私有技能；填写名称后仅启用所列技能。',
      installedSkills: '私有技能（点击名称查看）',
      noInstalledSkills: '该角色的技能目录当前没有技能。',
      skillLoadFailed: '（内容加载失败）',
      skillReveal: '在文件管理器中定位',
      skillRevealFailed: '无法在文件管理器中定位此技能。',
      effortDefault: '默认（跟随会话）',
      membersModel: '成员模型',
      membersTitle: '成员模型（实时）',
      membersHint: '打开时刷新一次，可点「刷新」再取最新状态；「备用·自动」表示额度失败后由插件自动切换。',
      membersRefresh: '刷新',
      teamPanel: '团队',
      teamTitle: '本群团队', teamMembers: '成员', teamClose: '关闭',
      gatesModel: '闸门',
      gatesTitle: '闸门（本群）',
      gatesHint: '启停只影响当前会话，重启后恢复全局默认。',
      gatesEmpty: '本群没有配置闸门。',
      gatesEnable: '启用',
      gatesDisable: '停用',
      gatesLoadFailed: '加载失败：',
      gatesToggleFailed: '操作失败：',
      gateStateOn: 'on',
      gateStateOffSession: 'off·群',
      gateStateOffGlobal: 'off·全局',
      gateStateOnSession: 'on·群',
      gateStateNa: 'n/a',

      membersLead: 'Lead',
      membersEmpty: '本群还没有成员。',
      membersNoTeam: '当前会话尚未加入团队。',
      membersRefreshFailed: '刷新失败：',
      applySettings: '应用设置',
      appliedMembers: '已应用到',
      appliedMembersUnit: '个成员（含待命）',
      applyFailed: '应用失败：',
      logTab: '变更日志',
      logHint: '记录角色配置（含模型）的变更：时间、操作者、改了哪些字段（含前后值见接口）。设置页保存显示为 settings-ui。',
      logEmpty: '还没有变更记录。',
      logLoadFailed: '加载失败：',
      logRemoved: '已删除',
      logAdded: '已新增',
      membersNoModel: '（未指定，跟随环境）',
      modelSourceSession: '跟随会话',
      modelSourcePrimary: '主模型',
      modelSourceFallbackAuto: '备用·自动',
      modelSourceFallbackManual: '备用·手动',
      modelPending: '待激活',
      modelSourceManual: '手动',
      modelSwitch: '切换模型',
      modelCancel: '取消',
      modelApply: '应用',
      modelApplied: '已切换',
      modelApplyFailed: '切换失败：',
      modelPick: '选择模型（角色配置的模型）',
      modelRoutePrimary: '主模型',
      modelRouteFallback: '备用',
      modelNoRoutes: '该角色还没有配置模型或备用模型，请先在设置里配置。',
      modelClear: '恢复角色路由',
      modelCleared: '已恢复角色路由：',

      primaryModel: '主模型',
      modelEffortDefault: '模型默认',
      fallbackModel: '备用模型',
      fallbackNone: '选择模型',
      fallbacks: '备用模型链',
      addFallback: '添加备用模型',
      removeFallback: '移除',
      moveUp: '上移',
      moveDown: '下移',
      fallbackEmpty: '还没有备用模型；主模型不可用时可切到这里。',
      fallbackHint: '按顺序尝试：主模型失败后先试备用 1，再试备用 2；每轮最多自动切换 2 次，切换后模型面板会标注序号。',
      modelChainTemplates: '模型链模板',
      modelChainTemplateHint: '选择模板可只读浏览；点「编辑」或「新建模板」进入编辑，保存后回到只读。只改模型路由，不改提示词、工具、技能或 Codex 配置。',
      modelChainTemplateEmpty: '还没有模型链模板。点「新建模板」创建，保存后可勾选角色应用。',
      modelChainTemplateNew: '新建模板',
      modelChainTemplateEdit: '编辑',
      modelChainTemplateCancel: '取消',
      modelChainTemplateReadOnly: '只读',
      modelChainTemplateEditingHint: '编辑中：模板选择与「新建模板」已禁用，保存后回到只读；「取消」丢弃未保存修改。',
      modelChainTemplateName: '模板名称',
      modelChainTemplateNamePlaceholder: '例如：主力链',
      modelChainTemplateSelect: '选择模板',
      modelChainTemplateSave: '保存模板',
      modelChainTemplateDelete: '删除模板',
      modelChainTemplateDeleteConfirm: '删除模板「{name}」？只删除模板库，已应用的角色不受影响。',
      modelChainTemplateDeleteAction: '确认删除',
      modelChainTemplateTargets: '应用到的角色',
      matchingTemplates: '匹配模板',
      noMatchingTemplate: '无匹配模板',
      modelChainTemplateApply: '应用到勾选角色',
      modelChainTemplateCheckedCount: '已选 {count} 个角色',
      modelChainTemplateNone: '未选择模板',
      modelChainTemplateRoute: '主模型：{route}',
      modelChainTemplateInherit: '跟随会话',
      modelChainTemplateFallbacksOrdered: '备用：{list}',
      modelChainTemplateFallbackOrder: '备用顺序（按尝试顺序）',
      modelChainTemplateEmptyChain: '模板既没有主模型也没有备用链，无法保存。',
      modelChainTemplatePartialRoute: '提供方和主模型必须同时填写或同时留空。',
      modelChainTemplateNameRequired: '请先填写模板名称。',
      modelChainTemplateNameLong: '模板名称过长（最多 {max} 个字符）。',
      modelChainTemplateNameExists: '已存在同名模板「{name}」，请换一个名称。',
      modelChainTemplateLimit: '模板数量已达上限 {max}。',
      modelChainTemplatePick: '请先选择一个模板。',
      modelChainTemplateCheckedNone: '请至少勾选一个角色。',
      modelChainTemplateApplied: '已把模板应用到 {count} 个角色；点上方「保存」后写入配置。',
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
      leadRole: 'Lead (team lead)',
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
      gateErrLegacyGate: 'Gate {id} is invalid and blocks the save',
      gateErrLimit: 'Gate limit {max} reached',
      gateErrDuplicate: 'A gate with this id already exists ({id})',
      gateErrUnknownRole: 'Role is not in the current catalog ({role})',
      gateAnyMemberRole: 'any member (not the Lead)',
      gateFreshHint: 'The key expires after this window (0 = valid until invalidated).',
      settingsUpdated: 'Configuration was updated elsewhere',
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
      closeSettings: 'Close', unsaved: 'Unsaved changes', saveAndLeave: 'Save and continue', discardAndLeave: 'Discard changes', keepEditing: 'Keep editing',
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
      roleSkillHint: 'Leave blank to enable all installed private skills, or list the names to enable.',
      installedSkills: 'Private skills (click a name to view)',
      noInstalledSkills: 'No skills installed for this role yet.',
      skillLoadFailed: '(failed to load content)',
      skillReveal: 'Show in file manager',
      skillRevealFailed: 'Could not reveal this skill in the file manager.',
      effortDefault: 'Default (follow the session)',
      membersModel: 'Member models',
      membersTitle: 'Member models (live)',
      membersHint: 'Fetches once when opened; click Refresh for the latest state. "fallback·auto" means the plugin switched after a quota failure.',
      membersRefresh: 'Refresh',
      teamPanel: 'Team',
      teamTitle: 'This team', teamMembers: 'Members', teamClose: 'Close',
      gatesModel: 'Gates',
      gatesTitle: 'Gates (this Team)',
      gatesHint: 'Toggling affects this session only; global defaults return after restart.',
      gatesEmpty: 'No gates configured for this Team.',
      gatesEnable: 'Enable',
      gatesDisable: 'Disable',
      gatesLoadFailed: 'Load failed: ',
      gatesToggleFailed: 'Action failed: ',
      gateStateOn: 'on',
      gateStateOffSession: 'off·session',
      gateStateOffGlobal: 'off·global',
      gateStateOnSession: 'on·session',
      gateStateNa: 'n/a',

      membersLead: 'Lead',
      membersEmpty: 'No members in this Team yet.',
      membersNoTeam: 'This session is not in a Team yet.',
      membersRefreshFailed: 'Refresh failed: ',
      applySettings: 'Apply settings',
      appliedMembers: 'Applied to',
      appliedMembersUnit: 'members (busy + idle)',
      applyFailed: 'Apply failed: ',
      logTab: 'Change log',
      logHint: 'Records role configuration changes, including model routes: when, by whom, and which fields. Saves from this page show as settings-ui.',
      logEmpty: 'No changes recorded yet.',
      logLoadFailed: 'Load failed: ',
      logRemoved: 'removed',
      logAdded: 'added',
      membersNoModel: '(unset, follows environment)',
      modelSourceSession: 'session',
      modelSourcePrimary: 'primary',
      modelSourceFallbackAuto: 'fallback·auto',
      modelSourceFallbackManual: 'fallback·manual',
      modelPending: 'pending',
      modelSourceManual: 'manual',
      modelSwitch: 'Switch model',
      modelCancel: 'Cancel',
      modelApply: 'Apply',
      modelApplied: 'Switched',
      modelApplyFailed: 'Switch failed: ',
      modelPick: 'Choose a configured model',
      modelRoutePrimary: 'primary',
      modelRouteFallback: 'fallback',
      modelNoRoutes: 'This role has no model or fallback configured yet; set one in Settings first.',
      modelClear: 'Follow role again',
      modelCleared: 'Role route restored: ',

      primaryModel: 'Primary model',
      modelEffortDefault: 'Model default',
      fallbackModel: 'Fallback model',
      fallbackNone: 'Choose a model',
      fallbacks: 'Fallback chain',
      addFallback: 'Add fallback',
      removeFallback: 'Remove',
      moveUp: 'Move up',
      moveDown: 'Move down',
      fallbackEmpty: 'No fallback routes yet; a failing primary route cannot fall back.',
      fallbackHint: 'Tried in order: fallback 1, then fallback 2. The plugin switches at most twice per turn and the member panel shows the position.',
      modelChainTemplates: 'Model chain templates',
      modelChainTemplateHint: 'Select a template to browse it read-only, or click "Edit" / "New template" to change it; saving returns to the read-only view. Only the model route changes; prompts, tools, skills, and Codex settings stay untouched.',
      modelChainTemplateEmpty: 'No model chain templates yet. Click "New template", save it, then check roles to apply it.',
      modelChainTemplateNew: 'New template',
      modelChainTemplateEdit: 'Edit',
      modelChainTemplateCancel: 'Cancel',
      modelChainTemplateReadOnly: 'read-only',
      modelChainTemplateEditingHint: 'Editing: the template picker and "New template" are disabled; save to return to read-only, or cancel to discard unsaved changes.',
      modelChainTemplateName: 'Template name',
      modelChainTemplateNamePlaceholder: 'For example: primary chain',
      modelChainTemplateSelect: 'Select template',
      modelChainTemplateSave: 'Save template',
      modelChainTemplateDelete: 'Delete template',
      modelChainTemplateDeleteConfirm: 'Delete the template "{name}"? Only the template library is removed; roles that already used it are unchanged.',
      modelChainTemplateDeleteAction: 'Delete',
      modelChainTemplateTargets: 'Apply to roles',
      matchingTemplates: 'Matches',
      noMatchingTemplate: 'No matching template',
      modelChainTemplateApply: 'Apply to checked roles',
      modelChainTemplateCheckedCount: '{count} roles checked',
      modelChainTemplateNone: 'No template selected',
      modelChainTemplateRoute: 'Primary: {route}',
      modelChainTemplateInherit: 'inherit session',
      modelChainTemplateFallbacksOrdered: 'Fallbacks: {list}',
      modelChainTemplateFallbackOrder: 'Fallback order (tried in order)',
      modelChainTemplateEmptyChain: 'The template has neither a primary model nor a fallback chain; it cannot be saved.',
      modelChainTemplatePartialRoute: 'Configure the provider and model together, or leave both empty.',
      modelChainTemplateNameRequired: 'Enter a template name first.',
      modelChainTemplateNameLong: 'The template name is too long (at most {max} characters).',
      modelChainTemplateNameExists: 'A template named "{name}" already exists; choose another name.',
      modelChainTemplateLimit: 'The template limit of {max} has been reached.',
      modelChainTemplatePick: 'Select a template first.',
      modelChainTemplateCheckedNone: 'Check at least one role.',
      modelChainTemplateApplied: 'Applied the template to {count} roles; click Save above to write the configuration.',
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
    /** Gate id grammar; mirrors GATE_ID in src/gates.js. */
    const GATE_ID = /^[a-z][a-z0-9-]{0,63}$/
    /** Cap on named model-chain templates stored in one Config field. */
    const MAX_MODEL_CHAIN_TEMPLATES = 20
    /** Template names stay short enough to read in a single select row. */
    const MODEL_CHAIN_TEMPLATE_NAME_LIMIT = 64
    /** Ordered fallback cap; mirrors FALLBACK_LIMIT in src/config.js. */
    const MAX_MODEL_CHAIN_FALLBACKS = 8
    const input = {
      width: '100%',
      boxSizing: 'border-box',
      background: 'var(--dsw-alias-bg-base)',
      color: 'var(--dsw-alias-label-primary)',
      border: '1px solid var(--dsw-alias-border-l1)',
      borderRadius: 8,
      padding: '8px 10px',
      fontFamily: 'inherit',
      fontSize: 13,
      lineHeight: 1.4,
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

    /** Trim one model-chain string field, never throwing on a non-string. */
    function chainText(value) {
      return typeof value === 'string' ? value.trim() : ''
    }

    /**
     * Normalize one ordered fallback chain.
     *
     * Only complete routes survive; duplicates are dropped and the host's
     * eight-route cap is enforced. Every entry is copied, so a template and a
     * role never share a mutable route object.
     */
    function chainFallbacks(input) {
      const routes = []
      const seen = new Set()
      for (const candidate of Array.isArray(input) ? input : []) {
        if (candidate === null || typeof candidate !== 'object') continue
        const provider = chainText(candidate.provider)
        const model = chainText(candidate.model)
        if (provider === '' || model === '') continue
        const key = `${provider}::${model}`
        if (seen.has(key)) continue
        seen.add(key)
        routes.push({ provider, model, reasoningEffort: chainText(candidate.reasoningEffort) })
        if (routes.length >= MAX_MODEL_CHAIN_FALLBACKS) break
      }
      return routes
    }

    // Match configured routes, not application history: templates are copied, not bound.
    function effectiveChainFallbacks(chain) {
      const list = chainFallbacks(chain.fallbacks)
      return list.length ? list : chainFallbacks([{
        provider: chain.fallbackProvider, model: chain.fallbackModel, reasoningEffort: chain.fallbackReasoningEffort,
      }])
    }

    function chainKey(chain) {
      return JSON.stringify([chainText(chain.provider), chainText(chain.model), chainText(chain.reasoningEffort), effectiveChainFallbacks(chain)])
    }

    /** Normalize the persisted `modelChainTemplates` field into the editor shape. */
    function normalizeModelChainTemplates(input) {
      const templates = []
      const seen = new Set()
      for (const candidate of Array.isArray(input) ? input : []) {
        if (candidate === null || typeof candidate !== 'object') continue
        const name = chainText(candidate.name)
        if (name === '' || seen.has(name)) continue
        seen.add(name)
        // A half-filled primary route is not usable: treat it as "inherit the
        // session route" so applying it can never write an invalid role route.
        const provider = chainText(candidate.provider)
        const model = chainText(candidate.model)
        const paired = provider !== '' && model !== ''
        // Older templates may still carry the single fallbackProvider/Model pair
        // with no ordered list; keep that route instead of dropping it.
        const fallbacks = effectiveChainFallbacks(candidate)
        templates.push({
          name,
          provider: paired ? provider : '',
          model: paired ? model : '',
          reasoningEffort: paired ? chainText(candidate.reasoningEffort) : '',
          fallbacks,
        })
        if (templates.length >= MAX_MODEL_CHAIN_TEMPLATES) break
      }
      return templates
    }

    /** An empty editable draft for the template editor. */
    function emptyTemplateDraft() {
      return { name: '', provider: '', model: '', reasoningEffort: '', fallbacks: [] }
    }

    /** Copy one stored template into a fresh editable draft (independent of roles). */
    function templateDraftOf(template) {
      return {
        name: chainText(template?.name),
        provider: chainText(template?.provider),
        model: chainText(template?.model),
        reasoningEffort: chainText(template?.reasoningEffort),
        fallbacks: chainFallbacks(template?.fallbacks),
      }
    }

    /**
     * The complete route-only patch a template applies to a role.
     *
     * Applying a chain must never touch a role's prompt, tool policy, skills,
     * color, or Codex settings: this object lists exactly the routing fields.
     * The legacy single-fallback fields are retired because `fallbacks` becomes
     * authoritative, matching what the chain editor itself does.
     */
    function chainPatchOf(template) {
      return {
        provider: chainText(template?.provider),
        model: chainText(template?.model),
        reasoningEffort: chainText(template?.reasoningEffort),
        fallbacks: chainFallbacks(template?.fallbacks),
        fallbackProvider: '',
        fallbackModel: '',
        fallbackReasoningEffort: '',
      }
    }

    /**
     * One readable line for a model chain, used in template previews.
     *
     * An empty primary route means "inherit the session route"; in that case the
     * ordered fallback names are the only concrete routes, so they are listed
     * by position instead of being reduced to a count.
     */
    function chainSummary(template, t) {
      const route = template.provider === '' || template.model === ''
        ? t('modelChainTemplateInherit')
        : `${template.provider}/${template.model}${template.reasoningEffort === '' ? '' : ` · ${template.reasoningEffort}`}`
      const primary = fill(t('modelChainTemplateRoute'), { route })
      if (template.fallbacks.length === 0) return primary
      const ordered = template.fallbacks
        .map((fallback, index) => `#${index + 1} ${fallback.provider}/${fallback.model}${fallback.reasoningEffort === '' ? '' : ` · ${fallback.reasoningEffort}`}`)
        .join(' → ')
      return `${primary} · ${fill(t('modelChainTemplateFallbacksOrdered'), { list: ordered })}`
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
        if (reference === 'lead') return { key: 'gateErrUnknownRole', params: { role: reference } }
        if (!roleIds.has(reference)) return { key: 'gateErrUnknownRole', params: { role: reference } }
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
      // This Settings write bypasses the plugin's own stores, so announce it:
      // the host change log attributes the next observed diff to the settings
      // page instead of guessing.
      try {
        void fetch('/agent-team-roles/settings-log-note', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ actor: 'settings-ui' }),
        }).catch(() => undefined)
      } catch {
        // A missing fetch (unit sandbox) must not fail a successful save.
      }
      return readNamespace(ctx)
    }

    /** Settings change log: what changed, when, and by whom. */
    function SettingsLogPanel({ t, version }) {
      const [entries, setEntries] = React.useState(null)
      const [error, setError] = React.useState('')
      React.useEffect(() => {
        let cancelled = false
        fetch('/agent-team-roles/settings-log?limit=100')
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
          .then((data) => {
            if (cancelled) return
            setEntries(Array.isArray(data.entries) ? data.entries : [])
            setError('')
          })
          .catch((caught) => {
            if (!cancelled) setError(`${t('logLoadFailed')}${caught.message}`)
          })
        return () => {
          cancelled = true
        }
      }, [version])
      const fieldsOf = (change) => {
        if (change.removed === true) return t('logRemoved')
        if (change.added === true) return t('logAdded')
        return (change.fields ?? []).map((field) => field.field).join(', ')
      }
      const rows = (entries ?? []).map((entry, index) => h('div', {
        key: `${entry.at}-${index}`,
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          padding: '8px 10px',
          border: '1px solid var(--dsw-alias-border-l1)',
          borderRadius: 8,
          background: 'var(--dsw-alias-bg-layer-1)',
        },
      }, [
        h('span', { key: 'meta', style: { ...small, fontFamily: 'monospace', fontSize: 11 } },
          `${new Date(entry.at).toLocaleString()} · ${entry.actor}`),
        ...(entry.changes ?? []).map((change, changeIndex) => h('span', {
          key: `change-${changeIndex}`,
          style: { fontSize: 12 },
        }, `${change.roleId}: ${fieldsOf(change)}`)),
      ]))
      return h(React.Fragment, null, [
        h('span', { key: 'hint', style: { ...small, margin: 0 } }, t('logHint')),
        error === '' ? null : h('div', { key: 'error', style: banner('state-error') }, error),
        h('div', { key: 'list', style: { display: 'flex', flexDirection: 'column', gap: 6 } },
          entries === null
            ? [h('span', { key: 'loading', style: small }, t('loading'))]
            : rows.length === 0
              ? [h('span', { key: 'empty', style: small }, t('logEmpty'))]
              : rows),
      ])
    }

    function createSection(ctx, t) {
      return function SettingsSection({ close } = {}) {
        const [leaving, setLeaving] = React.useState(null)
        const [tab, setTab] = React.useState('roles')
        const [loading, setLoading] = React.useState(true)
        const [busy, setBusy] = React.useState(false)
        const [error, setError] = React.useState('')
        const [notice, setNotice] = React.useState('')
        const [logVersion, setLogVersion] = React.useState(0)
        const [revision, setRevision] = React.useState(0)
        const [roles, setRoles] = React.useState([])
        const [rules, setRules] = React.useState([])
        const [templates, setTemplates] = React.useState([])
        const [selectedRole, setSelectedRole] = React.useState('general')
        const [dirty, setDirty] = React.useState(false)
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
          // Model chain templates are a separate Config field: keep the editor
          // shape complete even when the host value is missing or hand-edited.
          setTemplates(normalizeModelChainTemplates(view.value?.modelChainTemplates))
          setEngine({
            leadPlaybook: typeof view.value?.leadPlaybook === 'string' ? view.value.leadPlaybook : '',
            activeTemplate: typeof view.value?.activeTemplate === 'string' ? view.value.activeTemplate : '',
            freshProvider: typeof view.value?.freshProvider === 'string' && view.value.freshProvider !== '' ? view.value.freshProvider : 'spawn',
            forkProvider: typeof view.value?.forkProvider === 'string' && view.value.forkProvider !== '' ? view.value.forkProvider : 'fork',
            gates: Array.isArray(view.value?.gates) ? view.value.gates : [],
            gatesDisabled: Array.isArray(view.value?.gatesDisabled) ? view.value.gatesDisabled : [],
          })
          setSelectedRole((current) =>
            nextRoles.some(role => role.id === current && role.id !== 'general') ? current : (nextRoles.find(role => role.id !== 'general')?.id ?? ''))
          gatesBaselineRef.current = JSON.stringify(Array.isArray(view.value?.gates) ? view.value.gates : [])
          setRevision(view.revision)
          setDirty(false)
        }, [])

        const load = React.useCallback(async () => {
          setLoading(true)
          setError('')
          try {
            const stateView = await readSettingsState(ctx)
            applyView(stateView.view)
          } catch (caught) {
            setError(caught.message === 'settings-remote-unavailable'
              ? t('settingsUnavailable')
              : `${t('loadFailed')}${caught.message}`)
          } finally {
            setLoading(false)
          }
        }, [ctx, t, applyView])

        /** Re-read revision without touching local edits. */
        const refreshRevision = async () => {
          try {
            const stateView = await readSettingsState(ctx)
            setRevision(stateView.view.revision)
          } catch {
            // Keep the local view; the next event or explicit refresh retries.
          }
        }

        // Our own save also broadcasts settings/document-updated; a notice for
        // that would be self-noise on top of "已保存", so a recent write is
        // treated as ours and only refreshes the revision.
        const lastWriteAt = React.useRef(0)

        /** React to the configuration changing in another page or mount. */
        const onExternalUpdate = async () => {
          try {
            const stateView = await readSettingsState(ctx)
            setRevision(stateView.view.revision)
            const selfWrite = Date.now() - lastWriteAt.current < 2000
            if (!dirtyRef.current && !busyRef.current) {
              applyView(stateView.view)
            } else if (!selfWrite) {
              setNotice(t('settingsUpdated'))
            }
          } catch {
            // A transient read failure keeps the local view intact.
          }
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
            queueMicrotask(() => { void onExternalUpdate() })
          })
          return () => {
            if (typeof off === 'function') off()
          }
          // The subscription reads refs, so it never needs to re-register.
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [])

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
          setSelectedRole(roles.find(role => role.id !== 'general' && role.id !== selectedRole)?.id ?? '')
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
            lastWriteAt.current = Date.now()
            setNotice(t('saved'))
            return true
          } catch (caught) {
            setError(`${t('saveFailed')}${caught.message}`)
            await refreshRevision()
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
            lastWriteAt.current = Date.now()
            setNotice(t('saved'))
            return true
          } catch (caught) {
            setError(`${t('saveFailed')}${caught.message}`)
            await refreshRevision()
          } finally {
            setBusy(false)
          }
        }

        /**
         * Persist only the `modelChainTemplates` field.
         *
         * Template CRUD is independent of the role editor save: it must not
         * rewrite `roles` (that would publish an unsaved draft or clobber
         * another writer) and it must not touch any other Config field. The
         * local draft and panel selection are left alone on failure.
         */
        const persistTemplates = async (nextTemplates) => {
          const value = normalizeModelChainTemplates(nextTemplates)
          setError('')
          setNotice('')
          setBusy(true)
          try {
            const view = await writeNamespace(ctx, revision, 'modelChainTemplates', value)
            setRevision(view.revision)
            setTemplates(normalizeModelChainTemplates(view.value?.modelChainTemplates ?? value))
            lastWriteAt.current = Date.now()
            setNotice(t('saved'))
            return true
          } catch (caught) {
            setError(`${t('saveFailed')}${caught.message}`)
            await refreshRevision()
            return false
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
            `${fill(t('gateErrLegacyGate'), { id: gate?.id || '?' })} ${problem.params === undefined ? t(problem.key) : fill(t(problem.key), problem.params)}`
          if (gatesChanged) {
            // The gate list is part of this save: every entry must be fully valid.
            if (gateList.length > MAX_GATES) {
              setError(fill(t('gateErrLimit'), { max: MAX_GATES }))
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
                setError(describeProblem(gate, { key: 'gateErrDuplicate', params: { id: gate.id } }))
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
            const view = await writeNamespaceFields(ctx, revision, fields)
            setRevision(view.revision)
            // Adopt the Host's canonical shape (schema defaults filled) into the
            // local editor, then use that same value as the save baseline.
            const savedGates = Array.isArray(view.value?.gates) ? view.value.gates : []
            const savedDisabled = Array.isArray(view.value?.gatesDisabled) ? view.value.gatesDisabled : []
            setEngine((current) => ({ ...current, gates: savedGates, gatesDisabled: savedDisabled }))
            setDirty(false)
            gatesBaselineRef.current = JSON.stringify(savedGates)
            lastWriteAt.current = Date.now()
            setNotice(legacyWarning === '' ? t('saved') : `${t('saved')} · ${legacyWarning}`)
            return true
          } catch (caught) {
            setError(`${t('saveFailed')}${caught.message}`)
            // Keep the local engine edits; only refresh the
            // revision so the user can retry the save.
            await refreshRevision()
          } finally {
            setBusy(false)
          }
        }

        const markDirty = () => setDirty(true)

        const editEngine = (patch) => {
          markDirty()
          // The engine editor API takes a patch object; anything else is ignored.
          if (patch !== null && typeof patch === 'object') {
            setEngine((current) => ({ ...current, ...patch }))
          }
        }

        const save = tab === 'roles' ? saveRoles : tab === 'rules' ? saveRules : saveEngine
        const navigate = action => {
          if (busy) return
          if (dirty) setLeaving(() => action)
          else action()
        }
        React.useEffect(() => {
          if (!dirty || typeof window === 'undefined' || !window.addEventListener) return
          const warn = event => { event.preventDefault(); event.returnValue = '' }
          const escape = event => {
            if (event.key !== 'Escape' || !close) return
            event.preventDefault()
            event.stopImmediatePropagation()
            if (!busy) setLeaving(() => close)
          }
          window.addEventListener('beforeunload', warn)
          window.addEventListener('keydown', escape, true)
          return () => {
            window.removeEventListener('beforeunload', warn)
            window.removeEventListener('keydown', escape, true)
          }
        }, [dirty, close, busy])
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
          h('div', { key: 'tabs', style: { ...row, position: 'sticky', top: 0, zIndex: 2, background: 'var(--dsw-alias-bg-base)', padding: '8px 0', flexWrap: 'wrap' } }, [
            ...TABS.map(entry => h('button', { key: entry.id, type: 'button', style: tabStyle(tab === entry.id), onClick: () => { if (entry.id !== tab) navigate(() => setTab(entry.id)) } }, t(entry.label))),
            h('span', { key: 'spacer', style: { flex: 1 } }),
            h('button', { key: 'refresh', type: 'button', style: button, disabled: busy, onClick: () => navigate(() => { setLogVersion(current => current + 1); load() }) }, t('refresh')),
            tab === 'log' ? null : h('button', { key: 'save', type: 'button', style: primaryButton, disabled: busy, onClick: save }, busy ? t('saving') : t('save')),
            close && h('button', { key: 'close', type: 'button', style: button, disabled: busy, onClick: () => navigate(close) }, t('closeSettings')),
          ]),
          leaving && h('div', { key: 'unsaved', role: 'alertdialog', 'aria-label': t('unsaved'), style: { ...card, ...row, flexWrap: 'wrap' } }, [
            h('strong', { key: 'message' }, t('unsaved')),
            h('button', { key: 'save', type: 'button', style: primaryButton, disabled: busy, onClick: async () => { if (await save()) { setLeaving(null); leaving() } } }, t('saveAndLeave')),
            h('button', { key: 'discard', type: 'button', style: button, disabled: busy, onClick: async () => { await load(); setLeaving(null); leaving() } }, t('discardAndLeave')),
            h('button', { key: 'cancel', type: 'button', style: button, onClick: () => setLeaving(null) }, t('keepEditing')),
          ]),
          error !== '' ? h('div', { key: 'error', style: banner('state-error') }, error) : null,
          notice !== '' ? h('div', { key: 'notice', style: banner('state-success') }, notice) : null,
          tab === 'roles'
            ? h(RolesPanel, {
                key: 'roles',
                t,
                roles,
                rules,
                selectedRole,
                selected,
                templates,
                busy,
                onSelect: (id) => { setSelectedRole(id); setNotice('') },
                onAdd: addRole,
                onRemove: removeRole,
                onEdit: editSelected,
                onRename: renameSelected,
                onSave: saveRoles,
                onRefresh: load,
                onTemplatesChange: persistTemplates,
                onRolesChange: (updater) => { setDirty(true); setRoles(updater) },
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
                })
              : tab === 'log'
                ? h(SettingsLogPanel, { key: 'log', t, version: logVersion })
                : h(RulesPanel, {
                  key: 'rules',
                  t,
                  // 'lead' is a rule bucket, not a spawnable role: the Rules tab
                  // lists it so instructions aimed at the Lead are visible here.
                  roles: [{ id: 'lead', name: t('leadRole') }, ...roles],
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
    }) {
      const edit = (patch) => setEngine(patch)
      return h('div', { style: { ...panel, ...card } }, [
        h('div', { key: 'head', style: { ...row, justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 } }, [
          h('strong', { key: 'title', style: { fontSize: 13 } }, t('engine')),
          h('div', { key: 'actions', style: row }, [
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
            h('span', { key: 'hint', style: small }, t('templateHint')),
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
          h('span', { key: 'backend-hint', style: { ...small, alignSelf: 'end' } }, t('backendHint')),
        ]),
        h(GatesPanel, {
          key: 'gates',
          t,
          gates: engine.gates,
          disabled: engine.gatesDisabled,
          onChange: (patch) => edit(patch),
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

    /** List of gate cards and the manual add/edit form. */
    function GatesPanel({
      t, gates, disabled, onChange,
    }) {
      const [editing, setEditing] = React.useState(null)
      const [localError, setLocalError] = React.useState('')
      const gateList = Array.isArray(gates) ? gates : []
      const disabledList = Array.isArray(disabled) ? disabled : []
      const existingIds = gateList.map((gate) => gate.id)
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
              key: 'add',
              type: 'button',
              style: button,
              onClick: () => setEditing('new'),
            }, t('gateAdd')),
          ]),
        ]),
        h('span', { key: 'hint', style: small }, t('gatesHint')),
        localError !== '' ? h('div', { key: 'err', style: banner('state-error') }, localError) : null,
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
    function GateCard({ t, gate, off, onToggle, onEdit, onDelete }) {
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
            h('button', {
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
              : gateChip(t('gateOn'), 'key'),
          ]),
          h('div', { key: 'actions', style: row }, [
            h('button', { key: 'edit', type: 'button', style: button, title: `${t('gateEdit')}: ${gate.id}`, 'aria-label': `${t('gateEdit')}: ${gate.id}`, onClick: onEdit }, t('gateEdit')),
            h('button', { key: 'delete', type: 'button', style: button, title: `${t('gateDelete')}: ${gate.id}`, 'aria-label': `${t('gateDelete')}: ${gate.id}`, onClick: onDelete }, t('gateDelete')),
          ]),
        ]),
        gate.description ? h('div', { key: 'desc', style: small }, gate.description) : null,
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
            h('span', { style: small }, t('gateNeedKey')),
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
              ? gateChip(`${t('gateInvalidateOn')} ${invalidateOn.role ?? t('gateAnyMemberRole')} ${(invalidateOn.tool ?? []).join('/')}`, 'deny')
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
          field('pattern', t('gateFormPattern'), '\\bgit\\s+commit\\b', form.commandPattern, (v) => set({ commandPattern: v }), h('span', { key: 'h', style: small }, t('gatePatternHint'))),
        ]),
        h('div', { key: 'key-title', style: row }, [
          gateChip(t('gateKey'), 'key'),
          h('span', { key: 'kind', style: small }, `${t('gateFormKeyKind')}:`),
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
          field('freshFor', t('gateFormFreshFor'), '14400', String(form.freshFor), (v) => set({ freshFor: v }), h('span', { key: 'h', style: small }, t('gateFreshHint'))),
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

    function SkillReveal({ t, role, skill }) {
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const reveal = async () => {
        setBusy(true)
        setError('')
        try {
          const response = await fetch('/agent-team-roles/skill-reveal', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ role, skill }),
          })
          const data = await response.json().catch(() => ({}))
          if (!response.ok) setError(data.error || t('skillRevealFailed'))
        } catch {
          setError(t('skillRevealFailed'))
        } finally {
          setBusy(false)
        }
      }
      return h('div', { style: { ...row, flexWrap: 'wrap' } }, [
        h('button', { key: 'reveal', type: 'button', style: button, disabled: busy, onClick: reveal }, t('skillReveal')),
        error ? h('span', { key: 'error', role: 'alert', style: small }, error) : null,
      ])
    }

    /**
     * Named model-chain templates with an explicit read/edit state.
     *
     * A saved template is browsed read-only by default. The chain changes only
     * through an explicit Edit / New template action, and the picker plus New
     * are disabled while editing so a draft can never be replaced silently.
     * Template CRUD persists through `onChange`, which writes only the
     * `modelChainTemplates` Config field; applying a template is a local,
     * route-only edit of the checked roles whose page Save writes the roles.
     */
    function ModelChainTemplatesPanel({ t, roles, templates, catalogPairs, effortLevels, busy, onChange, onRolesChange }) {
      const [mode, setMode] = React.useState('view')
      const [selectedName, setSelectedName] = React.useState('')
      const [draft, setDraft] = React.useState(emptyTemplateDraft)
      const [editingName, setEditingName] = React.useState('')
      const [checkedRoles, setCheckedRoles] = React.useState([])
      const [localError, setLocalError] = React.useState('')
      const [localNotice, setLocalNotice] = React.useState('')
      const [deleteConfirm, setDeleteConfirm] = React.useState(false)

      const checkableRoles = Array.isArray(roles) ? roles : []
      const checkedSet = new Set(checkedRoles.filter(id => checkableRoles.some(role => role.id === id)))
      const matchingNames = new Map()
      for (const template of templates) {
        const key = chainKey(template)
        if (!matchingNames.has(key)) matchingNames.set(key, [])
        matchingNames.get(key).push(template.name)
      }
      const matchLabel = role => {
        const names = matchingNames.get(chainKey(role))
        return names ? `${t('matchingTemplates')}: ${names.join(' / ')}` : t('noMatchingTemplate')
      }
      const pairs = Array.isArray(catalogPairs) ? catalogPairs : []
      const levels = Array.isArray(effortLevels) && effortLevels.length > 0
        ? effortLevels
        : ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
      const selected = templates.find(item => item.name === selectedName) ?? null
      const editing = mode === 'edit'
      // While creating a new template the picker is locked and shows no name;
      // editing an existing template keeps its identity visible but locked.
      const pickerValue = editingName === '' ? (editing ? '' : (selected?.name ?? '')) : (selected?.name ?? '')

      // Browse defaults to the first available saved template. While editing the
      // draft is never touched by library changes, so a picker refresh cannot
      // overwrite in-progress work.
      React.useEffect(() => {
        if (mode !== 'view') return
        if (templates.some(item => item.name === selectedName)) return
        setSelectedName(templates[0]?.name ?? '')
      }, [mode, selectedName, templates])

      const fail = (message) => { setLocalNotice(''); setLocalError(message) }
      const done = (message) => { setLocalError(''); setLocalNotice(message) }
      const clearMessages = () => { setLocalError(''); setLocalNotice('') }
      const patchDraft = (patch) => setDraft(current => ({ ...current, ...patch }))

      /** Human-readable route used by the picker options and the read-only view. */
      const routeLabelOf = (chain) => {
        if (chain.provider === '' || chain.model === '') return t('modelChainTemplateInherit')
        return `${chain.provider}/${chain.model}${chain.reasoningEffort === '' ? '' : ` · ${chain.reasoningEffort}`}`
      }

      /** Normalize the draft the same way the persisted field is normalized. */
      const normalizeDraft = () => {
        const provider = chainText(draft.provider)
        const model = chainText(draft.model)
        const paired = provider !== '' && model !== ''
        return {
          name: chainText(draft.name),
          provider: paired ? provider : '',
          model: paired ? model : '',
          reasoningEffort: paired ? chainText(draft.reasoningEffort) : '',
          fallbacks: chainFallbacks(draft.fallbacks),
        }
      }

      const startNew = () => {
        setDraft(emptyTemplateDraft())
        setEditingName('')
        setDeleteConfirm(false)
        setMode('edit')
        clearMessages()
      }

      const startEdit = () => {
        if (selected === null) return
        setDraft(templateDraftOf(selected))
        setEditingName(selected.name)
        setDeleteConfirm(false)
        setMode('edit')
        clearMessages()
      }

      const cancelEdit = () => {
        setDraft(emptyTemplateDraft())
        setEditingName('')
        setDeleteConfirm(false)
        setMode('view')
        clearMessages()
      }

      /**
       * Create or update one template from the editor.
       *
       * A blank primary route is legal: it means "inherit the session route" and
       * is only rejected when the template also has no fallback chain. Renaming
       * an open template changes its identity; the new name must still be free.
       * A successful save always returns to the read-only view.
       */
      const saveTemplate = async () => {
        const template = normalizeDraft()
        if (template.name === '') return fail(t('modelChainTemplateNameRequired'))
        if (template.name.length > MODEL_CHAIN_TEMPLATE_NAME_LIMIT) {
          return fail(fill(t('modelChainTemplateNameLong'), { max: MODEL_CHAIN_TEMPLATE_NAME_LIMIT }))
        }
        const rawProvider = chainText(draft.provider)
        const rawModel = chainText(draft.model)
        if ((rawProvider === '') !== (rawModel === '')) return fail(t('modelChainTemplatePartialRoute'))
        const openName = editingName
        const open = openName === '' ? undefined : templates.find(item => item.name === openName)
        if (openName !== '' && open === undefined) return fail(t('modelChainTemplatePick'))
        if (template.provider === '' && template.fallbacks.length === 0) {
          return fail(t('modelChainTemplateEmptyChain'))
        }
        if (templates.some(item => item.name === template.name && item.name !== openName)) {
          return fail(fill(t('modelChainTemplateNameExists'), { name: template.name }))
        }
        if (openName === '' && templates.length >= MAX_MODEL_CHAIN_TEMPLATES) {
          return fail(fill(t('modelChainTemplateLimit'), { max: MAX_MODEL_CHAIN_TEMPLATES }))
        }
        const next = openName === ''
          ? [...templates, template]
          : templates.map(item => (item.name === openName ? template : item))
        if (await onChange(next) === false) return
        setDraft(emptyTemplateDraft())
        setEditingName('')
        setSelectedName(template.name)
        setDeleteConfirm(false)
        setMode('view')
        // The page-level "saved" banner reports the successful write.
        done('')
      }

      const askDelete = () => {
        if (selected === null) return fail(t('modelChainTemplatePick'))
        setDeleteConfirm(true)
        clearMessages()
      }

      const cancelDelete = () => setDeleteConfirm(false)

      /**
       * Delete the browsed template only after the named confirmation.
       *
       * A failed write keeps both the template and the browse selection. A
       * successful write selects the next template, then the previous one, and
       * leaves the empty state when the library becomes empty.
       */
      const deleteTemplate = async () => {
        if (selected === null) return fail(t('modelChainTemplatePick'))
        const index = templates.findIndex(item => item.name === selected.name)
        const next = templates.filter(item => item.name !== selected.name)
        if (await onChange(next) === false) {
          setDeleteConfirm(false)
          return
        }
        const neighbor = next[Math.min(index, next.length - 1)] ?? null
        setDeleteConfirm(false)
        setSelectedName(neighbor?.name ?? '')
        setMode('view')
        done('')
      }

      const toggleRole = (id) => {
        setCheckedRoles(current => (current.includes(id)
          ? current.filter(entry => entry !== id)
          : [...current, id]))
      }

      const addFallback = () => {
        setDraft(current => (current.fallbacks.length >= MAX_MODEL_CHAIN_FALLBACKS
          ? current
          : { ...current, fallbacks: [...current.fallbacks, { provider: '', model: '', reasoningEffort: '' }] }))
      }

      const updateFallback = (index, patch) => {
        setDraft(current => ({
          ...current,
          fallbacks: current.fallbacks.map((entry, at) => (at === index ? { ...entry, ...patch } : entry)),
        }))
      }

      const removeFallback = (index) => {
        setDraft(current => ({ ...current, fallbacks: current.fallbacks.filter((entry, at) => at !== index) }))
      }

      const moveFallback = (index, delta) => {
        setDraft(current => {
          const target = index + delta
          if (target < 0 || target >= current.fallbacks.length) return current
          const next = [...current.fallbacks]
          const [moved] = next.splice(index, 1)
          next.splice(target, 0, moved)
          return { ...current, fallbacks: next }
        })
      }

      /**
       * Apply the browsed (already saved) template to the checked roles.
       *
       * Browsing only shows persisted data, so there is no unsaved draft to
       * apply. The edit state hides/disabled this action; saving is required
       * before an edited chain can be applied.
       */
      const applyTemplate = () => {
        if (editing || selected === null) return fail(t('modelChainTemplatePick'))
        const targets = [...checkedSet]
        if (targets.length === 0) return fail(t('modelChainTemplateCheckedNone'))
        const patch = chainPatchOf(selected)
        onRolesChange(current => current.map(role => (
          targets.includes(role.id) ? { ...role, ...patch } : role
        )))
        done(fill(t('modelChainTemplateApplied'), { count: targets.length }))
      }

      /** Group model options by provider so long catalogs stay readable. */
      const groupedPairs = (list) => {
        const groups = new Map()
        for (const pair of list) {
          const provider = String(pair.provider ?? '')
          if (!groups.has(provider)) groups.set(provider, [])
          groups.get(provider).push(pair)
        }
        return [...groups.entries()].map(([provider, routes]) => h('optgroup', {
          key: provider,
          label: provider,
        }, routes.map(pair => h('option', {
          key: pair.provider + '::' + pair.id,
          value: pair.provider + '::' + pair.id,
        }, pair.provider + '/' + pair.id + (pair.name ? ' — ' + pair.name : '')))))
      }

      /** One row of the ordered fallback editor. */
      const fallbackRow = (entry, index) => {
        const currentValue = entry.provider && entry.model ? `${entry.provider}::${entry.model}` : ''
        const known = pairs.find(pair => pair.provider === entry.provider && pair.id === entry.model)
        const rowPairs = currentValue && !known
          ? [{ provider: entry.provider, id: entry.model }, ...pairs]
          : pairs
        const rowLevels = Array.isArray(known?.efforts)
          ? known.efforts
          : levels.map(id => ({ id, name: id }))
        const options = [{ id: '', name: t('modelEffortDefault') }, ...rowLevels]
        if (entry.reasoningEffort && !rowLevels.some(level => level.id === entry.reasoningEffort)) {
          options.push({ id: entry.reasoningEffort, name: entry.reasoningEffort })
        }
        return h('div', {
          key: index,
          style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr) auto', gap: 6, alignItems: 'end' },
        }, [
          h('label', { key: 'model', style: label }, [
            h('span', { key: 'label' }, `${t('fallbackModel')} #${index + 1}`),
            h('select', {
              key: 'select',
              style: input,
              value: currentValue,
              'aria-label': `${t('fallbackModel')} #${index + 1}`,
              onChange: event => {
                const [nextProvider = '', nextModel = ''] = event.target.value.split('::')
                updateFallback(index, { provider: nextProvider, model: nextModel, reasoningEffort: '' })
              },
            }, [
              h('option', { key: 'none', value: '' }, t('fallbackNone')),
              ...groupedPairs(rowPairs),
            ]),
          ]),
          h('label', { key: 'effort', style: label }, [
            h('span', { key: 'label' }, t('effort')),
            h('select', {
              key: 'select',
              style: input,
              value: entry.reasoningEffort ?? '',
              disabled: !entry.provider || !entry.model,
              'aria-label': `${t('effort')} #${index + 1}`,
              onChange: event => updateFallback(index, { reasoningEffort: event.target.value }),
            }, options.map(option => h('option', { key: option.id, value: option.id }, option.name))),
          ]),
          h('div', { key: 'actions', style: row }, [
            h('button', {
              key: 'up', type: 'button', style: button, disabled: index === 0,
              title: t('moveUp'), 'aria-label': t('moveUp'), onClick: () => moveFallback(index, -1),
            }, '↑'),
            h('button', {
              key: 'down', type: 'button', style: button, disabled: index === draft.fallbacks.length - 1,
              title: t('moveDown'), 'aria-label': t('moveDown'), onClick: () => moveFallback(index, 1),
            }, '↓'),
            h('button', {
              key: 'remove', type: 'button', style: button,
              title: t('removeFallback'), 'aria-label': t('removeFallback'), onClick: () => removeFallback(index),
            }, '×'),
          ]),
        ])
      }

      // Primary route options: the empty value is the legal "inherit session"
      // choice, and an unknown stored route stays selectable for compatibility.
      const primaryValue = draft.provider && draft.model ? `${draft.provider}::${draft.model}` : ''
      const primaryKnown = pairs.find(pair => pair.provider === draft.provider && pair.id === draft.model)
      const primaryPairs = primaryValue && !primaryKnown
        ? [{ provider: draft.provider, id: draft.model }, ...pairs]
        : pairs
      const primaryLevels = Array.isArray(primaryKnown?.efforts)
        ? primaryKnown.efforts
        : levels.map(id => ({ id, name: id }))
      const primaryOptions = [{
        id: '',
        name: primaryKnown?.defaultEffort
          ? `${t('effortDefault')} (${primaryKnown.defaultEffort})`
          : t('effortDefault'),
      }, ...primaryLevels]
      if (draft.reasoningEffort && !primaryLevels.some(level => level.id === draft.reasoningEffort)) {
        primaryOptions.push({ id: draft.reasoningEffort, name: draft.reasoningEffort })
      }

      const applyDisabled = busy || editing || selected === null || checkedSet.size === 0

      return h('div', { style: { ...panel, ...card } }, [
        h('div', { key: 'head', style: { ...row, flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' } }, [
          h('strong', { key: 'title', style: { fontSize: 13 } }, t('modelChainTemplates')),
          h('button', {
            key: 'new', type: 'button', style: button,
            disabled: busy || editing,
            onClick: startNew,
          }, t('modelChainTemplateNew')),
        ]),
        h('span', { key: 'hint', style: small }, t('modelChainTemplateHint')),
        templates.length === 0 ? h('span', { key: 'empty', style: small }, t('modelChainTemplateEmpty')) : null,
        h('div', { key: 'pick-row', style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, alignItems: 'end' } }, [
          h('label', { key: 'pick', style: label }, [
            h('span', { key: 'l' }, t('modelChainTemplateSelect')),
            h('select', {
              key: 's',
              style: input,
              value: pickerValue,
              disabled: busy || editing || templates.length === 0,
              'aria-label': t('modelChainTemplateSelect'),
              onChange: event => {
                if (editing) return
                setSelectedName(event.target.value)
                setDeleteConfirm(false)
                clearMessages()
              },
            }, [
              h('option', { key: 'none', value: '' }, t('modelChainTemplateNone')),
              ...templates.map(item => h('option', {
                key: item.name,
                value: item.name,
              }, `${item.name} — ${routeLabelOf(item)}`)),
            ]),
          ]),
          h('button', {
            key: 'edit', type: 'button', style: primaryButton,
            disabled: busy || editing || selected === null,
            onClick: startEdit,
          }, t('modelChainTemplateEdit')),
        ]),
        editing
          ? h('div', { key: 'editor', style: { ...panel, gap: 10, paddingTop: 6, borderTop: '1px solid var(--dsw-alias-border-l1)' } }, [
              h('span', { key: 'editing-hint', style: small }, t('modelChainTemplateEditingHint')),
              h('div', { key: 'name-row', style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 8, alignItems: 'end' } }, [
                h('label', { key: 'name', style: label }, [
                  h('span', { key: 'l' }, t('modelChainTemplateName')),
                  h('input', {
                    key: 'i',
                    style: input,
                    value: draft.name,
                    placeholder: t('modelChainTemplateNamePlaceholder'),
                    'aria-label': t('modelChainTemplateName'),
                    onChange: event => patchDraft({ name: event.target.value }),
                  }),
                ]),
                h('button', {
                  key: 'save', type: 'button', style: primaryButton, disabled: busy,
                  onClick: saveTemplate,
                }, t('modelChainTemplateSave')),
                h('button', {
                  key: 'cancel', type: 'button', style: button, disabled: busy,
                  onClick: cancelEdit,
                }, t('modelChainTemplateCancel')),
              ]),
              h('div', { key: 'primary', style: { display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 10 } }, [
                h('label', { key: 'model', style: label }, [
                  h('span', { key: 'label' }, t('primaryModel')),
                  h('select', {
                    key: 'select',
                    style: input,
                    value: primaryValue,
                    'aria-label': t('primaryModel'),
                    onChange: event => {
                      const [nextProvider = '', nextModel = ''] = event.target.value.split('::')
                      patchDraft({ provider: nextProvider, model: nextModel, reasoningEffort: '' })
                    },
                  }, [
                    h('option', { key: 'inherit', value: '' }, t('modelChainTemplateInherit')),
                    ...groupedPairs(primaryPairs),
                  ]),
                ]),
                h('label', { key: 'effort', style: label }, [
                  h('span', { key: 'label' }, t('effort')),
                  h('select', {
                    key: 'select',
                    style: input,
                    value: draft.reasoningEffort ?? '',
                    disabled: primaryValue === '',
                    'aria-label': t('effort'),
                    onChange: event => patchDraft({ reasoningEffort: event.target.value }),
                  }, primaryOptions.map(option => h('option', { key: option.id, value: option.id }, option.name))),
                ]),
              ]),
              h('div', { key: 'fallbacks', style: { ...panel, gap: 8 } }, [
                h('div', { key: 'head', style: { ...row, justifyContent: 'space-between' } }, [
                  h('span', { key: 'title', style: { ...small, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' } }, t('fallbacks')),
                  h('button', {
                    key: 'add', type: 'button', style: button,
                    disabled: draft.fallbacks.length >= MAX_MODEL_CHAIN_FALLBACKS,
                    onClick: addFallback,
                  }, '＋ ' + t('addFallback')),
                ]),
                draft.fallbacks.length === 0
                  ? h('span', { key: 'empty', style: small }, t('fallbackEmpty'))
                  : draft.fallbacks.map((entry, index) => fallbackRow(entry, index)),
              ]),
              h('span', { key: 'preview', style: small }, chainSummary(normalizeDraft(), t)),
            ])
          : selected === null
            ? null
            : h('div', { key: 'view', style: { ...panel, gap: 6, paddingTop: 6, borderTop: '1px solid var(--dsw-alias-border-l1)' } }, [
                h('div', { key: 'title-row', style: { ...row, flexWrap: 'wrap', gap: 8 } }, [
                  h('strong', { key: 'name', style: { fontSize: 13 } }, selected.name),
                  h('span', {
                    key: 'readonly',
                    style: { ...small, fontSize: 10, padding: '1px 7px', borderRadius: 999, background: 'var(--dsw-alias-bg-layer-2)' },
                  }, t('modelChainTemplateReadOnly')),
                ]),
                h('span', { key: 'route', style: small }, fill(t('modelChainTemplateRoute'), { route: routeLabelOf(selected) })),
                h('span', { key: 'order-title', style: { ...small, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' } }, t('modelChainTemplateFallbackOrder')),
                selected.fallbacks.length === 0
                  ? h('span', { key: 'no-fallbacks', style: small }, t('fallbackEmpty'))
                  : h('div', { key: 'order', style: { display: 'grid', gap: 2 } }, selected.fallbacks.map((route, index) => h('span', {
                      key: index,
                      style: small,
                    }, `${index + 1}. ${route.provider}/${route.model}${route.reasoningEffort === '' ? '' : ` · ${route.reasoningEffort}`}`))),
              ]),
        h('div', {
          key: 'targets',
          style: { ...panel, gap: 6, paddingTop: 6, borderTop: '1px solid var(--dsw-alias-border-l1)' },
        }, [
          h('span', { key: 'title', style: { ...small, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' } }, t('modelChainTemplateTargets')),
          h('div', {
            key: 'list',
            style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 6 },
          }, checkableRoles.map(role => h('label', {
            key: role.id,
            style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, minWidth: 0 },
          }, [
            h('input', {
              key: 'check',
              type: 'checkbox',
              value: role.id,
              checked: checkedSet.has(role.id),
              'aria-label': role.id,
              onChange: () => toggleRole(role.id),
            }),
            h('span', { key: 'details', style: { display: 'grid', minWidth: 0, overflowWrap: 'anywhere' } }, [
              h('span', { key: 'text' }, `${role.name || role.id} (${role.id})`),
              h('small', { key: 'match', style: small }, matchLabel(role)),
            ]),
          ]))),
          h('div', { key: 'actions', style: { ...row, flexWrap: 'wrap', gap: 8 } }, [
            h('button', {
              key: 'apply', type: 'button', style: primaryButton, disabled: applyDisabled,
              onClick: applyTemplate,
            }, t('modelChainTemplateApply')),
            h('span', { key: 'count', style: small }, fill(t('modelChainTemplateCheckedCount'), { count: checkedSet.size })),
          ]),
        ]),
        // Deletion is deliberately secondary: a quiet action at the bottom that
        // always asks for the named template before writing the library.
        !editing && selected !== null
          ? h('div', { key: 'delete-zone', style: { ...row, justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, paddingTop: 6 } },
              deleteConfirm
                ? [
                    h('span', {
                      key: 'text',
                      style: { ...small, color: 'var(--dsw-alias-state-error-primary)', maxWidth: 520 },
                    }, fill(t('modelChainTemplateDeleteConfirm'), { name: selected.name })),
                    h('button', {
                      key: 'confirm', type: 'button',
                      style: { ...button, color: 'var(--dsw-alias-state-error-primary)', borderColor: 'var(--dsw-alias-state-error-primary)' },
                      disabled: busy,
                      onClick: deleteTemplate,
                    }, t('modelChainTemplateDeleteAction')),
                    h('button', {
                      key: 'cancel', type: 'button', style: button, disabled: busy,
                      onClick: cancelDelete,
                    }, t('modelChainTemplateCancel')),
                  ]
                : [
                    h('button', {
                      key: 'ask', type: 'button',
                      style: { ...button, background: 'transparent', borderColor: 'transparent', color: 'var(--dsw-alias-label-secondary)', fontSize: 12, padding: '4px 6px' },
                      disabled: busy,
                      onClick: askDelete,
                    }, t('modelChainTemplateDelete')),
                  ])
          : null,
        localError !== '' ? h('div', { key: 'error', style: banner('state-error') }, localError) : null,
        // Keep the page-level success banner as the only `banner('state-success')`
        // in this section; this line is panel-local feedback, not a save notice.
        localNotice !== '' ? h('span', {
          key: 'notice',
          role: 'status',
          style: { ...small, color: 'var(--dsw-alias-state-success-primary)' },
        }, localNotice) : null,
      ])
    }

    function RolesPanel({ t, roles, rules, selectedRole, selected, templates, busy, onSelect, onAdd, onRemove, onEdit, onRename, onSave, onRefresh, onTemplatesChange, onRolesChange }) {
      const roleRules = roles === undefined || rules === undefined
        ? []
        : rules
            .filter((rule) => rule.roleId === selectedRole)
            .sort((left, right) => (right.updatedAt ?? right.createdAt ?? 0) - (left.updatedAt ?? left.createdAt ?? 0))
      const [catalog, setCatalog] = React.useState(null)
      React.useEffect(() => {
        let cancelled = false
        fetch('/agent-team-roles/model-catalog')
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error('catalog unavailable'))))
          .then((data) => {
            if (!cancelled) setCatalog({ routes: Array.isArray(data.routes) ? data.routes : [], efforts: Array.isArray(data.efforts) ? data.efforts : null })
          })
          .catch(() => {
            if (!cancelled) setCatalog({ routes: [], efforts: null })
          })
        return () => {
          cancelled = true
        }
      }, [])
      const catalogPairs = catalog === null
        ? roles
            .filter((role) => role.provider !== '' && role.model !== '')
            .map((role) => ({ provider: role.provider, id: role.model, name: role.name }))
        : catalog.routes
      const effortLevels = catalog?.efforts ?? ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
      const [installedSkills, setInstalledSkills] = React.useState(null)
      const [skillName, setSkillName] = React.useState('')
      const [skillView, setSkillView] = React.useState(null)
      const skillBase = '/agent-team-roles/role-skills/' + encodeURIComponent(selectedRole ?? '')
      React.useEffect(() => {
        setInstalledSkills(null)
        setSkillName('')
        setSkillView(null)
        if (!selectedRole) return
        let active = true
        fetch(skillBase).then(response => {
          if (!response.ok) throw new Error('skill list unavailable')
          return response.json()
        }).then(data => {
          if (active) setInstalledSkills(Array.isArray(data.skills) ? data.skills : [])
        }).catch(() => {
          if (active) setInstalledSkills(false)
        })
        return () => { active = false }
      }, [selectedRole])
      React.useEffect(() => {
        if (!skillName) return
        let active = true
        setSkillView(null)
        const url = skillBase + '/' + encodeURIComponent(skillName)
        fetch(url).then(response => {
          if (!response.ok) throw new Error('skill unavailable')
          return response.json()
        }).then(data => {
          if (active) setSkillView({ url, content: data.content ?? '', filePath: data.filePath })
        }).catch(() => {
          if (active) setSkillView({ url, error: true })
        })
        return () => { active = false }
      }, [skillBase, skillName])
      const skillUrl = skillBase + '/' + encodeURIComponent(skillName)
      const skillViewer = !skillName ? null : h('div', {
        key: 'skill-content', role: 'region', 'aria-label': skillName,
        style: { ...card, ...panel },
      }, skillView?.url !== skillUrl ? t('loading') : skillView.error ? t('skillLoadFailed') : [
        h(SkillReveal, { key: skillUrl, t, role: selectedRole, skill: skillName }),
        h('pre', {
          key: 'text', tabIndex: 0,
          style: { margin: 0, maxHeight: 360, overflow: 'auto', font: 'inherit', lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
        }, skillView.content),
      ])
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
            }, roles.filter(role => role.id !== 'general').map((role) => h('option', { key: role.id, value: role.id }, `${role.name || role.id} (${role.id})`))),
          ]),
          h('button', { key: 'add', type: 'button', style: button, onClick: onAdd }, t('addRole')),
        ]),
        h(ModelChainTemplatesPanel, {
          key: 'chain-templates',
          t,
          roles,
          templates: Array.isArray(templates) ? templates : [],
          catalogPairs,
          effortLevels,
          busy,
          onChange: onTemplatesChange,
          onRolesChange,
        }),
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
              h('div', { key: 'route', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 12 } }, [(() => {
                const provider = selected.provider ?? '', model = selected.model ?? ''
                const current = provider && model ? provider + '::' + model : ''
                const route = catalogPairs.find(pair => pair.provider === provider && pair.id === model)
                const pairs = current && !route ? [{ provider, id: model }, ...catalogPairs] : catalogPairs
                const effort = selected.reasoningEffort ?? ''
                const levels = Array.isArray(route?.efforts) ? route.efforts : effortLevels.map(id => ({ id, name: id }))
                const options = [{ id: '', name: route?.defaultEffort ? t('effortDefault') + ' (' + route.defaultEffort + ')' : t('effortDefault') }, ...levels]
                if (effort && !levels.some(level => level.id === effort)) options.push({ id: effort, name: effort })
                return h('div', { key: 'primary', style: { ...panel, ...card, gap: 8 } }, [
                  h('label', { key: 'model', style: label }, [
                    h('span', { key: 'label' }, t('primaryModel')),
                    h('select', { key: 'select', style: input, value: current, onChange: event => {
                      const [nextProvider = '', nextModel = ''] = event.target.value.split('::')
                      onEdit({ provider: nextProvider, model: nextModel, reasoningEffort: '' })
                    } }, [
                      h('option', { key: 'empty', value: '' }, t('effortDefault')),
                      ...pairs.map(pair => h('option', { key: pair.provider + '::' + pair.id, value: pair.provider + '::' + pair.id }, pair.provider + '/' + pair.id + (pair.name ? ' — ' + pair.name : ''))),
                    ]),
                  ]),
                  h('label', { key: 'effort', style: label }, [
                    h('span', { key: 'label' }, t('effort')),
                    h('select', { key: 'select', style: input, value: effort, disabled: options.length === 1,
                      onChange: event => onEdit({ reasoningEffort: event.target.value }),
                    }, options.map(option => h('option', { key: option.id, value: option.id }, option.name))),
                  ]),
                ])
              })(), (() => {
                const legacy = selected.fallbacks === undefined || selected.fallbacks.length === 0
                  ? (selected.fallbackProvider && selected.fallbackModel
                    ? [{ provider: selected.fallbackProvider, model: selected.fallbackModel, reasoningEffort: selected.fallbackReasoningEffort ?? '' }]
                    : [])
                  : selected.fallbacks
                const write = (next) => onEdit({
                  fallbacks: next,
                  fallbackProvider: '',
                  fallbackModel: '',
                  fallbackReasoningEffort: '',
                })
                const routeOptions = (entry) => {
                  const current = entry.provider && entry.model ? entry.provider + '::' + entry.model : ''
                  const found = catalogPairs.find(pair => pair.provider === entry.provider && pair.id === entry.model)
                  const pairs = current && !found ? [{ provider: entry.provider, id: entry.model }, ...catalogPairs] : catalogPairs
                  return [{ value: '', label: t('fallbackNone') }, ...pairs.map(pair => ({ value: pair.provider + '::' + pair.id, label: pair.provider + '/' + pair.id + (pair.name ? ' — ' + pair.name : '') }))]
                }
                return h('div', { key: 'fallbacks', style: { ...panel, ...card, gap: 8 } }, [
                  h('div', { key: 'head', style: { ...row, justifyContent: 'space-between' } }, [
                    h('span', { key: 'title', style: { ...small, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' } }, t('fallbacks')),
                    h('button', {
                      key: 'add', type: 'button', style: button, disabled: legacy.length >= 8,
                      onClick: () => write([...legacy, { provider: '', model: '', reasoningEffort: '' }]),
                    }, '＋ ' + t('addFallback')),
                  ]),
                  legacy.length === 0
                    ? h('span', { key: 'empty', style: small }, t('fallbackEmpty'))
                    : legacy.map((entry, index) => {
                        const route = catalogPairs.find(pair => pair.provider === entry.provider && pair.id === entry.model)
                        const levels = Array.isArray(route?.efforts) ? route.efforts : effortLevels.map(id => ({ id, name: id }))
                        const options = [{ id: '', name: t('modelEffortDefault') }, ...levels]
                        if (entry.reasoningEffort && !levels.some(level => level.id === entry.reasoningEffort)) options.push({ id: entry.reasoningEffort, name: entry.reasoningEffort })
                        const update = (patch) => write(legacy.map((item, at) => (at === index ? { ...item, ...patch } : item)))
                        const move = (delta) => {
                          const next = [...legacy]
                          const [moved] = next.splice(index, 1)
                          next.splice(index + delta, 0, moved)
                          write(next)
                        }
                        return h('div', { key: index, style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr) auto', gap: 6, alignItems: 'end' } }, [
                          h('label', { key: 'model', style: label }, [
                            h('span', { key: 'label' }, t('fallbackModel') + ' #' + (index + 1)),
                            h('select', {
                              key: 'select', style: input, value: entry.provider && entry.model ? entry.provider + '::' + entry.model : '',
                              onChange: event => {
                                const [nextProvider = '', nextModel = ''] = event.target.value.split('::')
                                update({ provider: nextProvider, model: nextModel, reasoningEffort: '' })
                              },
                            }, routeOptions(entry).map(option => h('option', { key: option.value, value: option.value }, option.label))),
                          ]),
                          h('label', { key: 'effort', style: label }, [
                            h('span', { key: 'label' }, t('effort')),
                            h('select', {
                              key: 'select', style: input, value: entry.reasoningEffort ?? '', disabled: !entry.provider || !entry.model,
                              onChange: event => update({ reasoningEffort: event.target.value }),
                            }, options.map(option => h('option', { key: option.id, value: option.id }, option.name))),
                          ]),
                          h('div', { key: 'actions', style: row }, [
                            h('button', { key: 'up', type: 'button', style: button, disabled: index === 0, title: t('moveUp'), 'aria-label': t('moveUp'), onClick: () => move(-1) }, '↑'),
                            h('button', { key: 'down', type: 'button', style: button, disabled: index === legacy.length - 1, title: t('moveDown'), 'aria-label': t('moveDown'), onClick: () => move(1) }, '↓'),
                            h('button', { key: 'remove', type: 'button', style: button, title: t('removeFallback'), 'aria-label': t('removeFallback'), onClick: () => write(legacy.filter((item, at) => at !== index)) }, '×'),
                          ]),
                        ])
                      }),
                  h('span', { key: 'hint', style: small }, t('fallbackHint')),
                ])
              })()]),
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
                  : h('span', { key: 'all-hint', style: small }, t('toolModeAllHint')),
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
                h('span', { key: 'hint', style: small }, t('denyHint')),
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
                h('span', { key: 'hint', style: small }, t('roleSkillHint')),
              ]),
              h('div', { key: 'installed-skills', style: { ...label, gap: 6 } }, [
                h('span', { key: 'l', style: { ...small, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' } }, t('installedSkills')),
                !Array.isArray(installedSkills) || installedSkills.length === 0
                  ? h('span', { key: 'none', style: small }, t(installedSkills === null ? 'loading' : installedSkills === false ? 'skillLoadFailed' : 'noInstalledSkills'))
                  : h('div', {
                      key: 'chips',
                      style: { display: 'flex', flexWrap: 'wrap', gap: 6 },
                    }, installedSkills.map((name) => h('button', {
                      key: name,
                      type: 'button',
                      style: skillName === name ? primaryButton : button,
                      'aria-expanded': skillName === name,
                      onClick: () => setSkillName(current => current === name ? '' : name),
                    }, name))),
                skillViewer,
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
                  h('button', {
                    key: 'delete',
                    type: 'button',
                    style: { ...button, color: 'var(--dsw-alias-state-error-primary)' },
                    disabled: selected.id === 'general',
                    title: selected.id === 'general' ? t('generalLocked') : t('deleteRole'),
                    onClick: onRemove,
                  }, t('deleteRole')),
                ]),
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
                  h('span', { key: 'hint', style: small }, t('historyHint')),
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
                        h('span', { key: 'time', style: small }, new Date(rule.updatedAt ?? rule.createdAt ?? Date.now()).toLocaleString()),
                        h('span', { key: 'meta', style: small }, `${t('evidence')} ${rule.evidence} · ${t('source')} ${rule.source}`),
                      ]),
                      h('span', { key: 'text', style: { fontSize: 13, lineHeight: 1.55 } }, rule.text),
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
                h('span', { key: 'meta', style: small }, `${t('evidence')} ${rule.evidence} · ${t('source')} ${rule.source}`),
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

    function createTeamPanel(ctx, t) {
      function PullPage({ sessionId, onPulled }) {
        const [roles, setRoles] = React.useState([])
        const [task, setTask] = React.useState('')
        const [loading, setLoading] = React.useState(false)
        const [busy, setBusy] = React.useState('')
        const [error, setError] = React.useState('')
        const [notice, setNotice] = React.useState('')
        React.useEffect(() => {
          let mounted = true
          setLoading(true)
          readNamespace(ctx).then(view => { if (mounted) setRoles(view.value?.roles ?? []) })
            .catch(err => { if (mounted) setError(t('pullLoadFailed') + err.message) })
            .finally(() => { if (mounted) setLoading(false) })
          return () => { mounted = false }
        }, [])
        const pull = async (role) => {
          if (busy !== '' || sessionId === undefined) return
          setBusy(role.id)
          setError('')
          try {
            const line = `/team-spawn ${role.id}${task.trim() === '' ? '' : ` ${task.trim()}`}`
            const response = await ctx.remote.commands.execute(sessionId, line, [])
            if (!response.ok) throw new Error(response.error.message)
            if (response.value === undefined) throw new Error('team-spawn command is unavailable')
            if (response.value.result.kind === 'error') throw new Error(response.value.result.text)
            try {
              await ctx.sessions?.refreshProjections(sessionId)
            } catch {
              // The Team projection also refreshes from its own event push.
            }
            setNotice(t('pullSuccess') + ' ' + role.name)
            setTask('')
            onPulled()
          } catch (caught) {
            setError(`${t('pullFailed')}${caught.message}`)
          } finally {
            setBusy('')
          }
        }
        return h(React.Fragment, null, [
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
                    style: { ...primaryButton, flex: '0 0 auto', inlineSize: '5.5em', blockSize: 32, boxSizing: 'border-box', padding: '0 8px', whiteSpace: 'nowrap' },
                    disabled: busy !== '',
                    onClick: () => pull(role),
                  }, busy === role.id ? t('pulling') : t('pullAction')),
                ]))),
        ])
      }
      function MembersPage({ sessionId, reloadKey }) {
        const [team, setTeam] = React.useState(null)
        const [error, setError] = React.useState('')
        const [editing, setEditing] = React.useState('')
        const [draft, setDraft] = React.useState('')
        const [saving, setSaving] = React.useState(false)
        const [note, setNote] = React.useState('')
        const [localKey, setLocalKey] = React.useState(0)
        React.useEffect(() => {
          if (sessionId === undefined) return undefined
          let cancelled = false
          const load = async () => {
            try {
              const response = await fetch('/agent-team-roles/member-models')
              if (!response.ok) throw new Error(`HTTP ${response.status}`)
              const data = await response.json()
              if (cancelled) return
              const root = Array.isArray(data.roots)
                ? data.roots.find((entry) => entry.rootId === sessionId)
                : undefined
              setTeam(root ?? null)
              setError(root === undefined ? t('membersNoTeam') : '')
            } catch (caught) {
              if (!cancelled) setError(`${t('membersRefreshFailed')}${caught.message}`)
            }
          }
          void load()
          return () => {
            cancelled = true
          }
        }, [sessionId, reloadKey, localKey])
        /** Apply one manual model selection to a member of this Team only. */
        const applyModel = async (member) => {
          if (saving || sessionId === undefined) return
          const index = draft === '' ? -1 : Number(draft)
          const chosen = index >= 0 && Array.isArray(member.routes) ? member.routes[index] : undefined
          if (chosen === undefined) {
            setNote(t('modelPick'))
            return
          }
          setSaving(true)
          setNote('')
          try {
            const response = await fetch('/agent-team-roles/member-model', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                rootId: sessionId,
                member: member.name,
                provider: chosen.provider,
                model: chosen.model,
                reasoningEffort: chosen.reasoningEffort ?? '',
              }),
            })
            const data = await response.json().catch(() => ({}))
            if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`)
            setEditing('')
            setNote(`${t('modelApplied')} ${member.name} → ${data.provider}/${data.model}`)
            setLocalKey(current => current + 1)
          } catch (caught) {
            setNote(`${t('modelApplyFailed')}${caught.message}`)
          } finally {
            setSaving(false)
          }
        }
        /** Drop the manual switch so the member follows its role route again. */
        const clearModel = async (member) => {
          if (saving || sessionId === undefined) return
          setSaving(true)
          setNote('')
          try {
            const response = await fetch('/agent-team-roles/member-model', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ rootId: sessionId, member: member.name, clear: true }),
            })
            const data = await response.json().catch(() => ({}))
            if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`)
            setEditing('')
            setNote(`${t('modelCleared')} ${member.name}`)
            setLocalKey(current => current + 1)
          } catch (caught) {
            setNote(`${t('modelApplyFailed')}${caught.message}`)
          } finally {
            setSaving(false)
          }
        }
        const labelOf = (member) => {
          if (member.provider === '' && member.model === '') return t('membersNoModel')
          return `${member.provider}/${member.model}${member.reasoningEffort === '' ? '' : ` · ${member.reasoningEffort}`}`
        }
        const sourceLabel = (source) => {
          if (source === 'primary') return t('modelSourcePrimary')
          if (source === 'manual') return t('modelSourceManual')
          if (source === 'fallback-auto') return t('modelSourceFallbackAuto')
          if (source === 'fallback-manual') return t('modelSourceFallbackManual')
          return t('modelSourceSession')
        }
        const dotColor = (status) => status === 'failed'
          ? 'var(--dsw-alias-state-error-primary)'
          : status === 'running' || status === 'active'
            ? 'var(--dsw-alias-state-success-primary)'
            : 'var(--dsw-alias-label-tertiary)'
        const rows = team === null
          ? []
          : [
              { key: 'lead', name: t('membersLead'), roleName: '', status: 'running', provider: team.lead.provider, model: team.lead.model, reasoningEffort: team.lead.reasoningEffort, source: 'session', pending: false },
              ...(team.members ?? []).map((member) => ({ key: member.name, ...member })),
            ]
        return h(React.Fragment, null, [
          error === '' ? null : h('div', { key: 'error', style: banner('state-error') }, error),
          note === '' ? null : h('div', { key: 'note', style: banner('state-success') }, note),
          h('div', {
            key: 'list',
            style: { display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', minHeight: 0 },
          }, rows.length === 0
            ? [h('span', { key: 'empty', style: small }, error === '' ? t('loading') : '')]
            : rows.map((member) => h('div', {
                key: member.key,
                style: { display: 'flex', flexDirection: 'column', gap: 4 },
              }, [
                h('div', {
                  key: 'row',
                  style: {
                    display: 'grid',
                    gridTemplateColumns: '10px minmax(0, 1.1fr) minmax(0, 1.6fr) auto',
                    gap: 8,
                    alignItems: 'center',
                    padding: '6px 8px',
                    border: '1px solid var(--dsw-alias-border-l1)',
                    borderRadius: 8,
                    background: 'var(--dsw-alias-bg-layer-1)',
                  },
                }, [
                  h('span', { key: 'dot', style: { width: 8, height: 8, borderRadius: 999, background: dotColor(member.status) } }),
                  h('span', { key: 'name', style: { fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                    member.roleName === '' ? member.name : `${member.name} · ${member.roleName}`),
                  h('span', { key: 'model', title: labelOf(member), style: { fontSize: 12, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, labelOf(member)),
                  h('span', { key: 'tags', style: { display: 'flex', gap: 4, alignItems: 'center' } }, [
                    h('span', {
                      key: 'source',
                      style: {
                        ...small,
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 999,
                        background: 'var(--dsw-alias-bg-layer-2)',
                        whiteSpace: 'nowrap',
                      },
                    }, sourceLabel(member.source) + (member.fallbackIndex === undefined ? '' : ' #' + (member.fallbackIndex + 1))),
                    member.pending === true
                      ? h('span', {
                          key: 'pending',
                          style: { ...small, fontSize: 10, padding: '1px 6px', borderRadius: 999, background: 'var(--dsw-alias-bg-layer-2)', whiteSpace: 'nowrap' },
                        }, t('modelPending'))
                      : null,
                    member.key === 'lead'
                      ? null
                      : h('button', {
                          key: 'switch',
                          type: 'button',
                          style: { ...button, fontSize: 11, padding: '2px 8px' },
                          onClick: () => {
                            setNote('')
                            if (editing === member.name) {
                              setEditing('')
                              return
                            }
                            setEditing(member.name)
                            const routes = Array.isArray(member.routes) ? member.routes : []
                            const current = routes.findIndex((route) => route.provider === member.provider && route.model === member.model)
                            setDraft(routes.length === 0 ? '' : String(current >= 0 ? current : 0))
                          },
                        }, editing === member.name ? t('modelCancel') : t('modelSwitch')),
                  ]),
                ]),
                editing !== member.name ? null : h('div', {
                  key: 'editor',
                  style: { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: '6px 8px', border: '1px dashed var(--dsw-alias-border-l2)', borderRadius: 8 },
                }, [
                  (Array.isArray(member.routes) ? member.routes : []).length === 0
                    ? h('span', { key: 'no-routes', style: small }, t('modelNoRoutes'))
                    : h('select', {
                        key: 'model',
                        'aria-label': t('modelPick'),
                        style: { ...input, flex: '1 1 240px' },
                        value: draft,
                        onChange: (event) => setDraft(event.target.value),
                      }, [
                        ...member.routes.map((route, index) => h('option', { key: String(index), value: String(index) },
                          `${route.kind === 'primary' ? t('modelRoutePrimary') : `${t('modelRouteFallback')} ${route.index + 1}`} · ${route.provider}/${route.model}${route.reasoningEffort === '' ? '' : ` · ${route.reasoningEffort}`}`)),
                      ]),
                  h('button', {
                    key: 'apply',
                    type: 'button',
                    style: primaryButton,
                    disabled: saving || (Array.isArray(member.routes) ? member.routes : []).length === 0,
                    onClick: () => { void applyModel(member) },
                  }, saving ? t('saving') : t('modelApply')),
                  h('button', {
                    key: 'clear',
                    type: 'button',
                    style: { ...button, fontSize: 11 },
                    disabled: saving,
                    onClick: () => { void clearModel(member) },
                  }, t('modelClear')),
                ]),
              ]))),
        ])
      }
      function GatesPage({ sessionId, refresh }) {
        const [view, setView] = React.useState(null)
        const [error, setError] = React.useState('')
        const [busy, setBusy] = React.useState('')
        const [reloadKey, setReloadKey] = React.useState(0)
        React.useEffect(() => {
          if (sessionId === undefined) return undefined
          let cancelled = false
          fetch(`/agent-team-roles/gates/${encodeURIComponent(sessionId)}`)
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
            .then((data) => {
              if (cancelled) return
              setView({ gates: Array.isArray(data.gates) ? data.gates : [], reason: data.reason ?? '' })
              setError('')
            })
            .catch((caught) => {
              if (!cancelled) setError(`${t('gatesLoadFailed')}${caught.message}`)
            })
          return () => {
            cancelled = true
          }
        }, [sessionId, refresh, reloadKey])
        const stateLabel = (gate) => {
          if (!gate.applicable) return t('gateStateNa')
          if (gate.state === 'off-session') return t('gateStateOffSession')
          if (gate.state === 'off-global') return t('gateStateOffGlobal')
          if (gate.state === 'on-session') return t('gateStateOnSession')
          return t('gateStateOn')
        }
        const disabledNow = (gate) => gate.state === 'off-session' || gate.state === 'off-global'
        const toggle = async (gate) => {
          if (busy !== '' || sessionId === undefined) return
          setBusy(gate.id)
          setError('')
          try {
            const line = `/team-gates ${disabledNow(gate) ? 'enable' : 'disable'} ${gate.id}`
            const response = await ctx.remote.commands.execute(sessionId, line, [])
            if (!response.ok) throw new Error(response.error.message)
            if (response.value === undefined) throw new Error('team-gates command is unavailable')
            if (response.value.result.kind === 'error') {
              throw new Error(response.value.result.text)
            }
            setReloadKey((current) => current + 1)
          } catch (caught) {
            setError(`${t('gatesToggleFailed')}${caught.message}`)
          } finally {
            setBusy('')
          }
        }
        const rows = view === null ? [] : view.gates
        return h(React.Fragment, null, [
          h('small', { key: 'scope', style: small }, t('gatesHint')),
          error === '' ? null : h('div', { key: 'error', style: banner('state-error') }, error),
          h('div', {
            key: 'list',
            style: { display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', minHeight: 0 },
          }, view === null
            ? [h('span', { key: 'loading', style: small }, t('loading'))]
            : rows.length === 0
              ? [h('span', { key: 'empty', style: small }, view.reason !== '' ? view.reason : t('gatesEmpty'))]
              : rows.map((gate) => h('div', {
                  key: gate.id,
                  style: {
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) auto',
                    gap: 8,
                    alignItems: 'center',
                    padding: '8px 10px',
                    border: '1px solid var(--dsw-alias-border-l1)',
                    borderRadius: 8,
                    background: 'var(--dsw-alias-bg-layer-1)',
                  },
                }, [
                  h('div', { key: 'copy', style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 } }, [
                    h('div', { key: 'line', style: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' } }, [
                      h('span', { key: 'id', style: { fontSize: 13, fontWeight: 600 } }, gate.id),
                      h('span', {
                        key: 'state',
                        style: {
                          ...small,
                          fontSize: 10,
                          padding: '1px 6px',
                          borderRadius: 999,
                          background: 'var(--dsw-alias-bg-layer-2)',
                          whiteSpace: 'nowrap',
                        },
                      }, stateLabel(gate)),
                    ]),
                    h('span', { key: 'deny', style: { ...small, fontSize: 11, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                      `deny ${gate.deny} ← ${gate.require}`),
                    gate.description === '' ? null : h('span', { key: 'desc', style: { ...small, fontSize: 11 } }, gate.description),
                  ]),
                  h('button', {
                    key: 'toggle',
                    type: 'button',
                    style: primaryButton,
                    disabled: busy !== '' || !gate.applicable,
                    onClick: () => toggle(gate),
                  }, busy === gate.id ? t('saving') : disabledNow(gate) ? t('gatesEnable') : t('gatesDisable')),
                ]))),
        ])
      }

      function TeamButton({ sessionId }) {
        const [page, setPage] = React.useState(null)
        const [refresh, setRefresh] = React.useState(0)
        const [applying, setApplying] = React.useState(false)
        const [notice, setNotice] = React.useState('')
        const [position, setPosition] = React.useState({})
        const trigger = React.useRef(null)
        const popup = React.useRef(null)
        const open = page !== null
        const place = () => {
          const rect = trigger.current.getBoundingClientRect()
          const width = Math.min(480, window.innerWidth - 16)
          setPosition({ width, left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), bottom: window.innerHeight - rect.top + 6, maxHeight: Math.max(40, rect.top - 14) })
        }
        const close = () => { setPage(null); trigger.current?.focus() }
        // One click = apply the current Settings to live members, then reload the
        // view. Personas and tool policy already read the live role; this covers
        // the captured model route and private skills.
        const applySettings = async () => {
          if (applying) return
          setApplying(true)
          setNotice('')
          try {
            const response = await fetch('/agent-team-roles/apply-settings', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ rootId: sessionId }),
            })
            if (!response.ok) {
              const body = await response.json().catch(() => ({}))
              throw new Error(body.error ?? `HTTP ${response.status}`)
            }
            const data = await response.json()
            const count = Array.isArray(data.members) ? data.members.length : 0
            setNotice(`${t('appliedMembers')} ${count} ${t('appliedMembersUnit')}`)
            setRefresh(current => current + 1)
          } catch (caught) {
            setNotice(`${t('applyFailed')}${caught.message}`)
          } finally {
            setApplying(false)
          }
        }
        React.useEffect(() => {
          if (!open) return
          popup.current?.focus()
          const outside = event => {
            if (!popup.current?.contains(event.target) && !trigger.current?.contains(event.target)) setPage(null)
          }
          const key = event => { if (event.key === 'Escape') { event.preventDefault(); close() } }
          document.addEventListener('pointerdown', outside, true)
          document.addEventListener('keydown', key)
          window.addEventListener('resize', place)
          window.addEventListener('scroll', place, true)
          return () => {
            document.removeEventListener('pointerdown', outside, true)
            document.removeEventListener('keydown', key)
            window.removeEventListener('resize', place)
            window.removeEventListener('scroll', place, true)
          }
        }, [open])
        const action = (key, label, text, fn, extra = {}) => h('button', {
          key, type: 'button', title: label, 'aria-label': label, onClick: fn, style: button, ...extra,
        }, text)
        const panel = !open ? null : h('section', {
          key: 'panel', ref: popup, tabIndex: -1, role: 'dialog', 'aria-label': t('teamTitle'),
          style: { position: 'fixed', ...position, boxSizing: 'border-box', zIndex: 1001, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto', padding: 12, borderRadius: 12, border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-overlay)', color: 'var(--dsw-alias-label-primary)', boxShadow: '0 8px 32px #0003' },
        }, [
          h('div', { key: 'header', style: { ...row, gap: 6 } }, [
            h('strong', { key: 'title', style: { flex: 1 } }, t('teamTitle')),
            page !== 'pull' && action('refresh', t('applySettings'), '↻', () => { void applySettings() }, { disabled: applying }),
            action('close', t('teamClose'), '×', close),
          ]),
          notice === '' ? null : h('div', { key: 'notice', style: small }, notice),
          h('div', { key: 'pages', style: row }, ['members', 'gates'].map(id => {
            const selected = page === id || (page === 'pull' && id === 'members')
            const label = t(id === 'members' ? 'teamMembers' : 'gatesModel')
            return action(id, label, label, () => setPage(id), { 'aria-pressed': selected, style: selected ? primaryButton : button })
          })),
          page === 'pull' ? h(PullPage, { key: 'pull', sessionId, onPulled: () => setRefresh(n => n + 1) }) : page === 'gates' ? h(GatesPage, { key: 'gates', sessionId, refresh }) : h(MembersPage, { key: 'members', sessionId, reloadKey: refresh }),
          page === 'members' && action('add', t('pullMembers'), `＋ ${t('pullMembers')}`, () => setPage('pull'), { style: { ...button, alignSelf: 'flex-start' } }),
        ])
        return h(React.Fragment, null, [action('team', t('teamPanel'), [h(TeamRolesIcon, { key: 'icon', size: 15 }), t('teamPanel')], () => {
          if (open) close(); else { place(); setPage('members') }
        }, { ref: trigger, 'aria-haspopup': 'dialog', 'aria-expanded': open, style: { ...button, display: 'inline-flex', gap: 5, alignItems: 'center', padding: '4px 8px' } }), panel && (createPortal ? createPortal(panel, document.body) : panel)])
      }
      return function TeamControl({ sessionId, useSessions }) {
        const preset = useSessions?.(state => state.byId?.[sessionId]?.projectionValues?.agentPreset)
        return preset === 'team-lead' ? h(TeamButton, { key: sessionId, sessionId }) : null
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
          id: 'agent-team-roles-team',
          order: 15,
          label: () => t('teamPanel'),
          locale: NS,
        }, createTeamPanel(ctx, t))), 'agent-team-roles:team-control')
      },
    }
  },
})
