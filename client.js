window.__ModuleLoader__.load({
  id: 'dsh-agent-team-roles',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'agent-team-roles'
    const TABS = [
      { id: 'roles', label: 'roles' },
      { id: 'rules', label: 'rules' },
    ]

    const zh = {
      nav: 'Agent 团队角色',
      title: 'Agent 团队角色',
      subtitle: '为子 Agent 预设提示词、模型、工具与私有技能；成员在运行中学会的长期要求会出现在这里。',
      loading: '正在读取角色配置…',
      roles: '角色',
      rules: '规则',
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
      roleSkillHint: '私有技能放在 ~/.dsh/agent-team-roles/skills/<角色ID>/ 下，每个技能是 <名称>/SKILL.md 或 <名称>.md。',
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
      roleSkillHint: 'Private skills live in ~/.dsh/agent-team-roles/skills/<role id>/ as <name>/SKILL.md or <name>.md.',
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

    /** Read this plugin's namespace from the settings Remote. */
    async function readNamespace(ctx) {
      if (ctx.remote?.settings === undefined) throw new Error('settings-remote-unavailable')
      const response = await ctx.remote.settings.describe()
      if (!response.ok) throw new Error(response.error.message)
      const view = response.value.namespaces.find((entry) => entry.ns === NS)
      if (view === undefined) throw new Error(`settings namespace "${NS}" is not active`)
      return view
    }

    /** Write one volatile field under the current revision. */
    async function writeNamespace(ctx, revision, field, value) {
      if (ctx.remote?.settings === undefined) throw new Error('settings-remote-unavailable')
      const response = await ctx.remote.settings.mutate(
        NS,
        [{ op: 'set', path: [field], value }],
        revision,
      )
      if (!response.ok) throw new Error(response.error.message)
      return readNamespace(ctx)
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

        const load = React.useCallback(async () => {
          setLoading(true)
          setError('')
          try {
            const view = await readNamespace(ctx)
            setRevision(view.revision)
            const nextRoles = Array.isArray(view.value?.roles) ? view.value.roles : []
            setRoles(nextRoles)
            setRules(Array.isArray(view.value?.rules) ? view.value.rules : [])
            if (!nextRoles.some((role) => role.id === selectedRole)) {
              setSelectedRole(nextRoles[0]?.id ?? 'general')
            }
          } catch (caught) {
            setError(caught.message === 'settings-remote-unavailable'
              ? t('settingsUnavailable')
              : `${t('loadFailed')}${caught.message}`)
          } finally {
            setLoading(false)
          }
        }, [ctx, selectedRole, t])

        React.useEffect(() => {
          void load()
          // Load once on mount; later reads are explicit refresh or post-save.
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [])

        const selected = roles.find((role) => role.id === selectedRole)

        const editSelected = (patch) => {
          setRoles((current) => current.map((role) =>
            role.id === selectedRole ? { ...role, ...patch } : role,
          ))
        }

        const renameSelected = (id) => {
          const previous = selectedRole
          setRoles((current) => current.map((role) =>
            role.id === previous ? { ...role, id } : role,
          ))
          setSelectedRole(id)
        }

        const addRole = () => {
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
            setNotice(t('saved'))
          } catch (caught) {
            setError(`${t('saveFailed')}${caught.message}`)
            await load()
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
            setNotice(t('saved'))
          } catch (caught) {
            setError(`${t('saveFailed')}${caught.message}`)
            await load()
          } finally {
            setBusy(false)
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
            padding: '18px 20px 32px',
            maxWidth: 1080,
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
            : h(RulesPanel, {
                key: 'rules',
                t,
                roles,
                rules,
                busy,
                setRules,
                onSave: saveRules,
                onRefresh: load,
              }),
        ])
      }
    }

    function RolesPanel({ t, roles, rules, selectedRole, selected, busy, onSelect, onAdd, onRemove, onEdit, onRename, onSave, onRefresh }) {
      const roleRules = roles === undefined || rules === undefined
        ? []
        : rules
            .filter((rule) => rule.roleId === selectedRole)
            .sort((left, right) => (right.updatedAt ?? right.createdAt ?? 0) - (left.updatedAt ?? left.createdAt ?? 0))
      return h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(150px, 180px) minmax(0, 1fr)', gap: 14, alignItems: 'start' } }, [
        h('div', { key: 'list', style: { ...panel, ...card, gap: 8 } }, [
          h('div', { key: 'list-head', style: { display: 'flex', flexDirection: 'column', gap: 8 } }, [
            h('strong', { key: 'label', style: { fontSize: 13 } }, t('roles')),
            h('button', { key: 'add', type: 'button', style: { ...button, width: '100%' }, onClick: onAdd }, t('addRole')),
          ]),
          ...(roles.length === 0
            ? [h('span', { key: 'empty', style: small }, t('empty'))]
            : roles.map((role) => h('button', {
                key: role.id,
                type: 'button',
                onClick: () => onSelect(role.id),
                style: {
                  ...button,
                  textAlign: 'left',
                  background: role.id === selectedRole ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
                  borderColor: role.id === selectedRole ? 'var(--dsw-alias-border-l2)' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                },
              }, [
                h('span', {
                  key: 'dot',
                  style: {
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: role.color || 'var(--dsw-alias-brand-primary)',
                    flex: '0 0 auto',
                  },
                }),
                h('span', { key: 'name', style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 } }, [
                  h('span', {
                    key: 'n',
                    style: {
                      fontSize: 13,
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    },
                  }, role.name || role.id),
                  h('span', {
                    key: 'id',
                    style: {
                      ...small,
                      fontSize: 11,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    },
                  }, role.id),
                ]),
              ]))),
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
                        value: textOf(selected.tools),
                        onChange: (event) => onEdit({ tools: listOf(event.target.value) }),
                      }),
                    ])
                  : h('span', { key: 'all-hint', style: { ...small, fontSize: 11 } }, t('toolModeAllHint')),
              ]),
              h('label', { key: 'skills', style: label }, [
                h('span', { key: 'l' }, t('skills')),
                h('input', {
                  key: 'i',
                  style: input,
                  value: textOf(selected.skills),
                  onChange: (event) => onEdit({ skills: listOf(event.target.value) }),
                }),
                h('span', { key: 'hint', style: { ...small, fontSize: 11 } }, t('roleSkillHint')),
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
      return function PullControl({ sessionId }) {
        const [open, setOpen] = React.useState(false)
        const [roles, setRoles] = React.useState([])
        const [task, setTask] = React.useState('')
        const [loading, setLoading] = React.useState(false)
        const [busy, setBusy] = React.useState('')
        const [error, setError] = React.useState('')
        const [notice, setNotice] = React.useState('')

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
            setTimeout(() => {
              setOpen(false)
              setTask('')
            }, 650)
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

    return {
      inject: ['slots', 'locale', 'remote', 'remote.settings', 'remote.commands', 'sessions'],
      apply(ctx) {
        const t = ctx.locale.bind(NS)
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'agent-team-roles:locale')
        ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: NS,
          order: 26,
          label: () => t('nav'),
          locale: NS,
        }, createSection(ctx, t))), 'agent-team-roles:settings-page')
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
