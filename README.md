# dsh-agent-team-roles

Role presets and self-updating role memory for the official DeepSeek Harness Agent Teams runtime.

This is a **companion plugin**: `@deepseek-ai/dsh-experimental-agent-team` keeps the roster, peer messages, shared task board, and member lifecycle. This plugin adds the part the official runtime does not have — reusable role definitions, role-aware spawning, and a learned-instruction layer that updates while a member is running.

## What it does

- **Role presets in Settings.** Each role has an id, responsibility, standing prompt, optional model route and reasoning effort, a tool policy, and private skills.
- **Role-aware spawning.** The Lead calls `spawn_team_member({ role, prompt })` instead of the official ad-hoc spawn tool. The role's prompt, model route, tool policy, skills, and learned rules are installed into that member's Agent scope before its first request.
- **Self-updating role prompts.** A member (or the Lead) can record a lasting requirement with `remember_role_rule` / `record_role_feedback`. The rule store edits the plugin's volatile Config; the member's prompt section re-reads it on every assembly, so the next model step already follows the new rule. The rule also persists for future instances.
- **Rule review.** The Settings page lists learned rules with status, direction, evidence, and source. You can edit, promote, retire, or delete them.
- **`general` fallback role.** Shipped by default and editable. It covers tasks that do not match a specialized role, so removing the official ad-hoc exit does not remove the ability to delegate.
- **No ad-hoc exit.** The official `spawn_teammate` tool is denied by a tool guard; the Lead is told to use `spawn_team_member` with a configured role.

## Requirements

- DeepSeek Harness `>=0.2.2-rc.1 <0.3.0`.
- The Agent Teams profile bundle (`@deepseek-ai/dsh-experimental-agent-team-profile`) is active. That bundle supplies the Team service and tools this plugin composes with.
- A Web or Desktop profile with Settings and the Client services the bundle declares.

This plugin does not fork or patch the official packages, and it does not use `dsh-agent-team-presets`.

## Install

From this checkout:

```sh
dsh plugin --profile desktop add /absolute/path/to/dsh-agent-team-roles
```

Or in the GUI: **Plugins → Add plugin**, pass the absolute directory, and install. The bundle patch registers one row, `agent-team-roles`.

After installation, open **Settings → Agent team roles**. The `general` role is present by default.

## Configure a role

| Field | Meaning |
|---|---|
| Role id | Stable identity and the default teammate target. Lowercase kebab-case; `lead` is reserved. |
| Display name | Human-readable name shown to the Lead and in Settings. |
| Responsibility | One-line description the Lead uses to choose the role. |
| Role prompt | Standing persona for the member. |
| Provider / model / reasoning effort | Optional member route. Leave both provider and model empty to inherit the Session route. |
| Tool policy | `all`, or a custom allow-list. A custom policy also denies scoped Team tools that are not listed. |
| Private skills | Names of skills inside the role's private folder; empty exposes every skill in that folder. |
| Accent color | Roster accent. |

The Lead sees the current role catalog in its prompt and must use `spawn_team_member`:

```text
spawn_team_member({ role: "reviewer", prompt: "Review the change and report findings." })
```

If the role is already in use, the target gets a numeric suffix (`reviewer-2`), and the suffix maps back to the same role.

## Pull a teammate from the composer

The composer's left control row now has **Pull member**. It opens the role catalog and pulls one role directly:

1. Optionally type an initial task. Leave it empty for a **handshake-only** spawn: the member replies exactly `READY` and does not analyze, ask questions, call tools, or write a report. The roster entry is enough for the Lead to know the member exists.
2. The member's `READY` settlement notice is not delivered to the Lead at all (handshake spawns use caller delivery), so the Lead is not woken into an unnecessary verification turn. A real user message arriving at the same time is still processed normally.
3. Click **Pull** next to a role.
4. The button executes `/team-spawn <role> [task]` through the existing `commands` Remote, so **no model turn is involved**. The roster updates through the normal Team projection.

The Lead's system prompt also carries a live **Active team members** section, rebuilt on every step: each pulled member's name, role, one-line responsibility, and status. The Lead therefore sees who already exists and what they can do without needing a wake-up or a `list_agents` call, and is told to assign work to them instead of spawning duplicates.

The same command is available from the `/` menu and by typing it:

```text
/team-spawn se 分析当前仓库的插件边界，给出实现方案
```

If the Team is at its member limit, the command result is shown inline in the pull panel.

## Agent-facing tools

| Tool | Who may call it | Purpose |
|---|---|---|
| `spawn_team_member` | Lead | Create a teammate from a role. |
| `list_team_roles` | Lead and every managed member | Read the role catalog. |
| `create_team_role` | Lead and every managed member | Create a new reusable role. |
| `update_team_role` | Lead | Update a role; the id is immutable. |
| `delete_team_role` | Lead | Delete a role; `general` is protected. |
| `record_role_feedback` | Lead | Record a lasting requirement for a role. |
| `list_role_rules` / `forget_role_rule` | Lead | Inspect or retire learned rules. |
| `remember_role_rule` / `list_my_rules` | Managed member | Learn about and read its own role. |

A managed member can create a role even under a custom tool policy: `list_team_roles` and `create_team_role` are implicit capabilities. Members cannot update or delete roles. A newly created role is available to the next `spawn_team_member` call.

## Other plugins: `agentTeamRoles`

The Host exposes a trusted in-process service for other plugins:

```js
const roles = ctx.get('agentTeamRoles')
await roles.create({ id: 'reviewer', name: 'Reviewer', persona: 'Review changes.' })
await roles.update('reviewer', { persona: 'Review changes strictly.' })
roles.list()          // merged catalog, including the built-in general role
roles.get('reviewer')
await roles.remove('reviewer')
```

The service is intentionally trusted: it does not check a caller's Agent identity. Agent-facing writes should go through the tools above, where the Lead/member boundary is enforced by scope. Changes persist through the live config editor and show up in Settings.

## Learned rules

Two tools write rules:

- `remember_role_rule` — a member records a requirement about its own role.
- `record_role_feedback` — the Lead records a requirement on the user's behalf.

Both take a scope:

| Scope | Use it for | Behavior |
|---|---|---|
| `permanent` | “From now on”, “always”, “never” | Active immediately; persists. |
| `candidate` | The requirement is plausible but not confirmed | Stored; becomes active after a second observation or a review confirmation. |
| `session` | “This time”, task-local corrections | In-memory only; never persists. |

Repeated identical observations increment `evidence`. Opposite-direction rules supersede the old rule instead of leaving contradictory instructions in the prompt. Each role is limited to 40 persistent rules of 600 characters each, and `list_role_rules` / the Settings page can retire them.

The learned layer cannot change a role's tool policy or model route. A member cannot edit another role's rules.

## Private skills

Place role skills under:

```text
$DSH_HOME/agent-team-roles/skills/<role id>/
  <skill-name>/SKILL.md
  or
  <skill-name>.md
```

`SKILL.md` uses the usual frontmatter:

```markdown
---
name: change-review
description: Checks a diff for regressions before reporting.
whenToUse: A change is ready for review.
---
Review the diff...
```

The skill is registered only in that member's Agent scope. Global skills remain visible through the deployment's own skill provider. An empty role `skills` list exposes the whole role folder; a non-empty list selects skill names.

## Known limitations

- The role persona is **frozen at spawn**. Editing a role's base prompt does not rewrite an already-running member; the next summon gets the new prompt. Learned rules are the layer that updates live.
- A custom tool policy uses a tool guard for scoped Team tools; disallowed scoped tools may still appear in the schema but calls are refused. Global tools are also hidden through `ctx.tools.restrict()`.
- Saved member snapshots live in `$DSH_HOME/agent-team-roles/members.json`. They are retained after the member is gone so a cold resume can reconstruct its configuration.
- The official Agent Teams runtime is experimental; this plugin pins its compatibility window to the `0.2.2-rc.1` line.
- Members, the Lead, and the plugin share the working directory. Rules and role configuration do not add filesystem isolation.

## Development

```sh
node --test
```

The test suite covers pure role normalization, rule evidence/promotion/conflict logic, and prompt rendering. The installed plugin is exercised against a live Agent Teams profile for spawn injection, rule hot updates, and private skills.

## License

MIT.
