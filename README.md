> English · [中文](README.zh-CN.md)

# dsh-agent-team-roles

A **generic team engine plus domain template packs** for the official Agent Teams runtime of DeepSeek Harness.

This is a **companion plugin**: `@deepseek-ai/dsh-experimental-agent-team` keeps owning the roster, member messaging, the shared task board, and member lifecycle; this plugin adds what the official runtime does not have — reusable role definitions, role-based spawning, command-level command policy (`denyCommands`), and a layer of "learned rules" that members keep updating while they run.

**Engine and domain are separate**: the plugin itself (`src/`) contains only mechanisms that hold for any domain — spawning and reuse, the handshake protocol, tool guards, concurrency discipline, rule learning. The concrete workflow (who reviews whom, what comes first, which commands are forbidden) is all data, supplied by the built-in `software-dev` template pack or by a template you write yourself. With no template applied and an empty `leadPlaybook`, the plugin degrades into a plain generic scheduling engine and still works.

## Features

- **Role presets managed in Settings**: each role has an id, responsibility, standing prompt, optional model route and reasoning effort, tool policy, and private skills.
- **Role-based spawning**: the Lead calls `spawn_team_member({ role, prompt })` instead of the official ephemeral spawn tool. The role prompt, model route, tool policy, skills, and learned rules are installed into the member's Agent scope before its first request.
- **Self-updating role prompts**: members or the Lead record long-term requirements through `remember_role_rule` / `record_role_feedback`. Durable rules are written to the plugin's volatile Config; the member's prompt section is re-read on every assembly, so the change takes effect on the **next step** and persists for later instances. `session` rules stay in memory only.
- **Rule review**: the Settings page lists each learned rule's status, evidence count, and source; you can edit its status and text, retire it, or delete it. Direction (polarity) can only be chosen when a rule is added.
- **`general` fallback role**: shipped, editable, handles tasks that match no specialized role; it keeps dispatch working after the official ephemeral exit is removed.
- **Removing the ephemeral exit**: the official `spawn_teammate` is blocked by a tool guard, and the Lead is explicitly told to use role-based `spawn_team_member`.
- **Team Lead preset**: the plugin ships a `team-lead` Agent preset (a scheduling leader) and exposes an **Agent team roles** entry in the main navigation. Manual member pulling is available only in Team Lead preset sessions.
- **Lead status panel**: a right-sidebar panel for Team Lead sessions shows the current objective, the latest round's progress and next step, and every decision waiting for the user. Options keep their named upside and tradeoff, the user confirms the whole batch in the panel, and the Lead's status is refreshed each turn. It reads Harness's native timed questions, so chat and panel share one answer path.

## Requirements

- DeepSeek Harness `>=0.2.2-rc.1 <0.3.0`.
- A Team-enabled profile. Both Team runtimes are supported: the retired `@deepseek-ai/dsh-experimental-agent-team-profile` composition and the subagent-based `@deepseek-ai/dsh-agent-team` used by current DSH. When the legacy `ctx.agentTeams.tryMembership` API is absent, the plugin maps membership, spawning, and messaging onto `ctx.subagents` (`rootOf`, `namesOf`, `startActivation`, `resolveName`, `sendMessage`).
- A Web or Desktop profile with Settings and the required Client services.

The plugin does not fork or modify the official packages, and does not depend on `dsh-agent-team-presets`.

## Install

From this repository:

```sh
dsh plugin --profile desktop add /absolute/path/to/dsh-agent-team-roles
```

Or in the GUI: **Plugins → Add plugin**, enter this directory's absolute path, and install. The bundle patch registers an `agent-team-roles` row.

After installation, open **Settings → Agent team roles**; a `general` role already exists.

## Lead status panel

In a root **Team Lead** session, select **Lead status** to open the right sidebar beside the conversation. It shows the current objective, latest progress, next step, and decisions waiting for you. The view belongs to that session. If the Lead has not reported an update for the current turn, the last report stays visible and is labeled accordingly.

For a decision, the Lead uses Harness's native question flow and describes the upside and tradeoff of each option. Compare the options in the panel, select your answer, and confirm it there. Chat and the panel share the same question and answer, so there is no need to submit twice. A timeout or an explicit skip is never approval.

The panel requires a Harness client with the right sidebar and timed user questions. An open Team Lead session may retain its previous preset after an upgrade; if new questions do not appear in the panel, start a new Team Lead session.

## Configure roles

| Field | Meaning |
|---|---|
| Role id | Stable identity, also the default teammate target; lowercase kebab-case, `lead` reserved. |
| Display name | Name shown to the Lead and in Settings. |
| Responsibility | One-line responsibility the Lead uses to pick a member; at most 200 characters. |
| Role prompt | The member's standing persona; at most 12000 characters. |
| Provider / model / effort | Optional member route; provider and model must be filled together or left empty, and empty means inherit the current session route. |
| Tool policy | `all`, or a custom allow-list. A custom policy also rejects scoped Team tools that are not listed. |
| Private skills | Available bundled and local skill names for the role; empty exposes all of them. |
| Accent color | Role color in the roster. |

The Lead's prompt shows the current role catalog and expects:

```text
spawn_team_member({ role: "reviewer", prompt: "Review this change and report problems." })
```

If the role already has a member that has **not failed** (`status` is not `failed`), the command reuses that member instead of creating another. A new member is created only when the role has no healthy member; a taken name gets a numeric suffix (`reviewer-2`), and the suffix maps back to the same role.

### Advanced configuration

`freshProvider` / `forkProvider` choose the sub-agent backend used for fresh / fork members (defaults: `spawn` / `fork`). They are not on the Settings page and can only be changed in the plugin configuration (profile config).

### Built-in role catalog

The bundle patch ships these roles (all editable or removable):

| Role | id | Tool policy | Responsibility |
|---|---|---|---|
| General | `general` | All tools | General tasks that match no specialized role. |
| Product manager | `pm` | Read-only + reporting | Requirements analysis, user scenarios, experience tradeoffs; produces requirement-document text, does not define technical solutions. |
| SE | `se` | Read-only + documentation writes | Architecture/contract owner: maintains `docs/architecture.md`, interface contracts and ADRs; may write docs/ and interface/type definition files, has no shell. |
| DEV | `dev` | Read/write + terminal | Implements against the SE contract; reads the contract before starting and reports changes and checks afterwards. DEV performs `git push`, constrained by workflow gates (rejected when checks fail). |
| TSE | `tse` | Read/write + pwsh | Designs tests and verifies the affected flows locally after implementation or fixes; writes only under `tests/`. |
| CI/CD | `cicd` | Shell + selected desktop tools + reporting | Owns production releases, deployment verification, and rollback. Follows the project's runbook after explicit approval; execution requires an existing authorized project tool. No deployment access is bundled. |
| CR | `cr` | Read-only + reporting | Code reviewer: checks the diff item by item against the contract and produces a defect report; spawned fresh, changes no files. |

Review flow: once a diff exists, the Lead **dispatches CR (static review) and TSE (dynamic testing) in parallel**; they run independently without waiting for each other. Defects go back to DEV through the Lead, and the fix goes through CR + TSE again.

## Viewing and pulling members from the composer

Only Team Lead preset sessions show **Team (people icon)** in the composer tool row. Clicking it opens the **Members** page directly, and you can switch to the **Gates** page inside the same panel. The panel anchors beside the icon, does not cover the conversation, and does not block typing. It reads the current state when opened; click **Refresh** for the latest data — there is no background polling.

1. The **Members** page shows the current roster and models; **Pull a member** opens role selection inside the same panel.
2. An initial task is optional; leaving it empty only performs the handshake: the new member replies `READY` and that reply does not wake the Lead.
3. Click **Pull** on the role. An existing healthy member is reused: the task is sent to it, and with an empty task no message is sent.
4. After a successful pull the panel returns to **Members** with a refreshed roster, so there is no need to close or refresh manually. Pulling runs `/team-spawn <role> [task]` without a model turn; other preset sessions cannot run that command.

The Lead's system prompt also contains a dynamic **Active team members** section: name, role, one-line function, and status for every pulled member, regenerated each step. The Lead therefore knows who exists and what they can do without being woken or calling `list_agents`, and is explicitly told to hand work to them rather than duplicate them.

The same command can be run from the `/` menu or typed directly:

```text
/team-spawn se Analyze the plugin boundaries of this repository and propose an implementation.
```

If the Team has reached its member limit or the command fails, the error is shown in the pull panel.

## Team Lead preset

The bundle ships a `team-lead` Agent preset that appears in the new-session preset list after installation:

- **Position**: a scheduling leader — splits work, dispatches to members, relays results; it does not implement, does not verify, and does not run git commit/push itself (DEV does that under workflow gates).
- **Scheduling rules**: dispatch every independent task first and end the turn without blocking; call `wait_agent` only when the next step truly depends on a member's result, with a timeout of at most 30 seconds.
- **Fallback tools**: the preset includes file read/write (`tool-fs`), search (`tool-fs-search`), and a terminal (`tool-pwsh` on Windows). Dispatching stays the default; these tools are used for minimal investigation or recording only when a member reports a permission block or the user asks the Leader to act directly.
- **Injection boundary**: this bundle's Lead prompts, Lead rule tools and `/team-*` commands are available only to the Lead in the `team-lead` preset. Teammates get this bundle's role persona, private skills and tool policy only while their official Team root runs `team-lead`. A blank session can switch presets before its first turn: entering `team-lead` adds these features, and leaving removes them without deleting stored Lead rules. Other presets retain the official Team tools and policy and their project memory.

The **Agent team roles** entry in the main navigation opens the same role management page (role editing + rule history) without going through Settings.

## Template packs

A template = role catalog + Lead orchestration playbook + private skills, distributed as pure data and able to carry any domain workflow.

### Directory layout

```text
$DSH_HOME/agent-team-roles/templates/<template id>/
  template.json          # template descriptor (required)
  skills/<role id>/       # optional: private skills for this template's roles
    <skill name>/SKILL.md
```

### template.json schema

```json
{
  "id": "software-dev",              // required; kebab-case starting with a lowercase letter, <=64 characters
  "name": "Software Development Team", // required
  "description": "...",               // optional
  "leadPlaybook": "...",              // optional; appended to the Lead prompt when applied
  "roles": [ /* same role shape as Settings; denyCommands allowed */ ],
  "gates": [ /* same gate shape as Settings; merged on apply, same id overwrites, at most 50 total */ ]
}
```

`roles` reuse the role `normalizeRole`/`validateRole` checks: one invalid role makes the whole template invalid, and a broken template is skipped quietly (no error, no effect on other templates).

### Built-in template

On activation the plugin **seeds** the packaged `templates/software-dev/` into the state directory (missing directories only; user changes are never overwritten). Later updates to the built-in template (for example new gates) therefore do not reach an existing state directory; delete `<stateDir>/templates/<id>/` and reload the plugin to seed it again. `software-dev` is the software-development department template: PM, SE, DEV, TSE, CR, CI/CD roles + a parallel-review playbook + two pre-commit gates; DEV and TSE carry `denyCommands` blocking `git push`.

### Applying a template

In a Team Lead session:

```text
/team-template list          # list discovered templates
/team-template apply software-dev
```

`apply` does four things: it **upserts** the template roles into the role catalog (update existing, create missing, preserve non-empty skill selections); it sets `activeTemplate` and copies the template playbook into the editable `leadPlaybook` config (visible and editable in Settings; the config wins when non-empty, otherwise the template playbook is used); it merges the template `gates` into the current gate list (same id overwrites and reports `replaced`; only the template's own gates are validated, and if the merged list would exceed 50 entries or a template gate is invalid the whole apply is rejected without writing; invalid gates already in the list are kept as-is, counted toward the limit, and reported as `warnings:` in the success text); it merges and copies `skills/<role id>/` into `stateDir/skills/<role id>/` (copying new entries without replacing existing bundles or flat files). Gate validation happens before any write.

## denyCommands: command-level policy

The optional role field `denyCommands` is an array of RegExp sources (at most 20 entries, each at most 200 characters, each must compile). While a member runs as that role, a `bash` / `pwsh` call whose `command` argument matches any pattern is rejected with an error naming the role id and the matched rule.

- **Independent of the tool allow-list**: it applies to both `toolMode: all` and `custom`. Typical use: attach an unconditional command ban to a role; for "only allow once a precondition holds", use gates (next section).
- It matches shell command arguments only; other tools are unaffected.
- Non-Team members are unaffected; the policy belongs to the role definition and can be maintained in the role JSON in Settings.

## Workflow gates

`denyCommands` is an **unconditional** rejection; gates are a **stateful conditional** rejection: before role R performs operation X, a "key" event E must exist that was produced recently by one of the roles Y, has not expired, and has not been invalidated — otherwise the call is rejected.

### The three-part model

```json
{
  "id": "review-before-commit",
  "description": "Optional human-readable note, shown by /team-gates",
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

- `deny.role` / `deny.tool`: who is blocked and which tool (1–8). With `commandPattern` only matching shell commands are blocked; without it the whole tool is blocked (write/edit style).
- `require.event` + `byRoles`: the key event name and the roles allowed to produce it (1–8).
- `freshFor`: seconds; absent means valid until invalidated.
- `invalidateOn`: when a matching role successfully uses a matching tool, the team's recorded events are cleared (changing code invalidates the old approval). An optional `pathPattern` (RegExp source) narrows invalidation to matching file paths — for example only code extensions, so editing docs/README does not invalidate a review approval. Absent = any path invalidates.
- Alternatively `require.commandSuccess = { role, tool, pattern }` uses "role X successfully ran a matching command" as the key, mutually exclusive with `event`.

### Two event sources

1. **Reporting tool** `report_gate_event({ event, note? })`: any managed member can call it (implicit tool, unaffected by the allow-list). Safety is enforced by the evaluator: an event only counts when its producer's role is in that gate's `byRoles`; events from unrelated roles are worthless.
2. **Command success**: with `require.commandSuccess` configured, a post-execute listener records the key when the matching command succeeds.

### /team-gates commands

Available to the Team Lead (and only in a Team Lead preset session):

```text
/team-gates list                 # one line per gate: state, deny summary, require summary
/team-gates status               # live key state: who produced the latest event and when; expired/missing
/team-gates enable <id>
/team-gates disable <id>
```

### Relationship to denyCommands

| Mechanism | Condition | Where the data lives |
|---|---|---|
| denyCommands | Unconditional: reject when the command matches | Role field |
| gates | Stateful: reject only when a qualifying event is missing | Config.gates (saved in Settings or written by template apply) |

### Known limitations

- **In-memory**: events are not persisted; a host restart clears them and every gate drops back to "unsatisfied" — a deliberate safe default.
- **fail-open**: evaluator exceptions allow the call and log a warning; only a valid configuration with a definitely unsatisfied state rejects.
- **Single-event conditions**: v1 has no AND/OR composition, branching, or orchestration DSL; multiple gates are independent (one call may be rejected in turn, each with its own reason).
- **Limited event sources**: task-board events, messages, and file changes are not event sources yet; only the reporting tool and command success.
- **Managed members only**: no Team membership or an unresolvable role means allow.
- **Automatic exemption (roster aware)**: when no live member of the key-producing roles exists in the current team roster, the gate is treated as "inapplicable" and allowed entirely (including its deny) — a session that never pulled CR is not stuck behind the review gate; pulling CR in restores enforcement immediately. `/team-gates status` shows `inapplicable`.
- **Invalidation granularity**: events carry no tool information, so an `invalidateOn` hit clears the whole team event bucket.
- **Zero behavior when empty**: with no gates configured the pre/post-execute listeners return immediately and add no perceptible cost.
- **Read-side self-check**: when the configuration contains gates the evaluator would silently skip (invalid fields, duplicate ids), the host warns once per id per process on the pre/post-execute read side without blocking the call (fail-open).

### Sharing images with a member

`spawn_team_member` accepts an optional `images` array of absolute file paths (at most 8). Every path must be inside the session working directory — paths outside are rejected, so the feature is a workspace passthrough, not an arbitrary host read. The member's task text gains a "Shared images" list, and the member reads each image with its regular `read` tool. A reused member receives the list with its task; a fresh member gets it in the spawn prompt. The tool result echoes the verified paths in `member.images`.

## Agent-facing tools

| Tool | Callers | Purpose |
|---|---|---|
| `spawn_team_member` | Lead | Spawn a member by role. |
| `list_team_roles` | Lead and every managed member | Read the role catalog. |
| `create_team_role` | Lead and every managed member | Create a reusable role. |
| `update_team_role` | Lead | Update a role; the id is immutable. |
| `delete_team_role` | Lead | Delete a role; `general` is protected. |
| `record_role_feedback` | Lead | Record a long-term requirement for a role. |
| `list_role_rules` / `forget_role_rule` | Lead | Inspect learned rules; forget retires a rule (superseded), keeping it in history and out of the prompt. |
| `remember_role_rule` / `list_my_rules` | Managed members | Learn and read their own role's rules. |

Even under a custom tool policy, managed members keep an implicit set of capabilities: `remember_role_rule`, `list_my_rules`, `list_team_roles`, `create_team_role`, and `skill`. Members cannot update or delete roles. A new role is available on the next `spawn_team_member`.

When the memory plugin exposes them, `memory_recall`, `wiki_search`, and `wiki_read` pass the member role guard without per-role configuration. Memory writes are not implicitly allowed. The role guard likewise allows `web_search` and `web_fetch` when the host provides them; existing network policies still apply. For Codex-backed members, these permissions apply to the DSH relay, not the external Codex CLI.

Native `tse` members can use the installed `agent-desktop` MCP to run browser acceptance checks on authorized test URLs. The role guard supplies the browser-testing tools even for older saved TSE allow-lists. The host's desktop policy still applies; report blocked checks to the Lead rather than treating a fetched page as interaction evidence.

## For other plugins: `agentTeamRoles`

The Host exposes a trusted in-process service:

```js
const roles = ctx.get('agentTeamRoles')
await roles.create({ id: 'reviewer', name: 'Reviewer', persona: 'Review changes.' })
await roles.update('reviewer', { persona: 'Review changes strictly.' })
roles.list()          // merged catalog including the built-in general role
roles.get('reviewer')
await roles.remove('reviewer')
```

The service is deliberately a "trusted plugin API" and does not verify the calling Agent. Agent-side writes should go through the tools above, where scopes separate the Lead from members. Writes persist through the live config editor and show up in Settings.

## Keeping the Lead out of implementation

A Team Lead orchestrates; it must not edit files, run shells, or execute code itself. The plugin enforces this on the Lead's tool layer:

- **hide** (default) — `write`, `edit`, `apply_patch`, `pwsh`, `bash`, `run_code`, `subagent`, and `subagent_fork` are removed from the Lead's visible tool list, so the model never reaches for them.
- **deny** — the tools stay visible, but every call is refused with a message naming the teammates that can take the work and the routing tools (`spawn_team_member` / `send_message`).
- **off** — no restriction.

`run_code` and scoped tools cannot be hidden, so a guard covers them in both modes. The guard also reads the policy live: switching to `deny` or `off` in Settings applies on the next tool call, while the hidden list itself needs a plugin reload. Read-only tools (`read`, `grep`, `glob`) stay available for checking a report or diff. Extra tool names can be appended in Settings → Engine → Lead tool policy; non-Team sessions are unaffected.

## Routing decision model

Before dispatching, the Lead calls `route_task` with the task (and only the minimum context) and dispatches with the `roleId` it returns instead of choosing a role by intuition. The routing model is a separate, single-purpose call: it is not the Lead's conversation, so a long or compressed Lead context does not change which role gets picked — the call sees only the task text, the optional context, the role catalog and the active teammate names.

The router is configured in Settings → Engine → Routing decision model:

- `routerMode`: `model` (default), `rules`, or `off` (`route_task` fails).
- `routerProvider` / `routerModel` are picked from a dropdown fed by the same model catalog as the role model configuration (the empty choice means "not configured" and falls back to rules routing); `routerReasoningEffort` is a second dropdown limited to the efforts the selected model advertises — selecting a model preselects that model's advertised default effort (e.g. `high`), and switching to a model that drops the current level adopts the new model's default; the empty option reads "adapter default (<actual default>)". A model whose adapter explicitly declares no reasoning support shows a disabled effort control labeled "This model does not support reasoning effort" instead of the generic level list; when the catalog cannot learn the capability, the generic `off`/`minimal`/…/`max` fallback levels remain. `routerTimeoutMs` (default 20000) and `routerMaxTokens` (default 800) bound the single call.
- `routerRequireDecision` (default on): while on, `spawn_team_member` is refused until a `route_task` has succeeded in the current turn.

In rules fallback, design/visual review requests (visual style, design specs, screenshot review, taste) route to `pm` first, while plain implementation or fixes stay with `dev`.

If the provider or model is empty, the mode is `rules`, or the model call fails, times out or its reply cannot be parsed, `route_task` returns a deterministic keyword/token decision instead (`source: "rules"`) — routing never blocks dispatch. Model decisions report `source: "model"` and the `provider/model` that answered; both return `confidence`, `reason` and `suggestedTaskPrompt`, plus `needsSplit` for tasks that genuinely need several roles.

## Turn protocol: dispatch first

The Lead's remaining way to drift is investigating the code itself. The plugin enforces a dispatch-first turn protocol on the Lead:

- One `team_task_create` per unit of work, then `spawn_team_member` (the owning role) or `send_message` (an existing member).
- Self-check tools (`read`, `grep`, `glob`, `read_image`) are budgeted: at most **1** call before a dispatch and **3** per turn by default. Exceeding either is refused with a message naming the routing tools; the counters reset every turn.
- The Lead's answer is a dispatch report (who got what, status, what it needs), not the design or root-cause analysis — the owning role produces that.

All three limits are editable in Settings → Engine → Lead turn protocol (`dispatch-first` / `off`, self-checks per turn, self-checks before dispatch) and the guard reads them live. This complements the tool policy above: the policy removes implementation tools, the protocol limits self-investigation.

## Learned rules

The Team Lead has its own rule bucket, id `lead`. Say "from now on, X" to the Lead and it records that with `record_role_feedback` using `role: "lead"`; the rule is rendered into the Lead's own prompt on the next step and can be reviewed, promoted, or retired in the **Rules** tab of Settings, where `lead` appears after the spawnable roles and a new rule still defaults to a real role. The Lead rule tools, memory guide and prompt section require a `team-lead` preset session; other presets never see them, while recorded Lead rules stay stored and are rendered again the next time a `team-lead` session runs. This is separate from a role's rules: a Lead rule governs how the Lead itself works, never a teammate.

A "remember this" request is routed before anything is written: a lasting working requirement ("从今以后/每次/不要…", "from now on", "always", "never") becomes a rule — `role: "lead"` for the Lead itself, or the teammate's role id — while a workspace fact (paths, versions, commands, discovered APIs) goes to project memory with `memory_capture`. Rules live in the profile and apply in every project; the memory vault is workspace-scoped. When the intent is ambiguous the Lead asks which store the user means instead of guessing. To move something that was filed into project memory by mistake, read the note and record it as a rule, then retire the note.

Two tools write rules:

- `remember_role_rule`: a member records a long-term requirement about its own role.
- `record_role_feedback`: the Lead records a long-term requirement for a role on the user's behalf.

Both accept a scope:

| Scope | When to use | Behavior |
|---|---|---|
| `permanent` | "from now on", "always", "forever" | Takes effect immediately and persists. |
| `candidate` | Possibly long-term but unconfirmed | Saved first; promoted to active after a repeat, a second recording as `permanent`, or confirmation in Settings. |
| `session` | "this time", "for now" | In-memory only, not persisted. |

Recording the same requirement again increases its evidence count. A new requirement with the opposite direction marks the old rule as superseded instead of leaving two contradictory instructions in the prompt. Each role holds at most 40 un-superseded durable rules of 600 characters each. `forget_role_rule` and retirement in Settings only mark a rule `superseded` and keep it in history; only manual deletion on the **Rules** tab removes it physically.

Learned rules **cannot** change a role's tool policy or model route, and members cannot change another role's rules.

**Role rules hold only long-term role behavior** (working style, boundaries, reporting process). Project-specific facts — brand names, domains, data models, environments, versions, file paths — do not belong in role rules or role prompts; they belong in the project memory store (`memory_capture`), otherwise they pollute that role's prompt across every project.

## Private skills

Native teammates in `team-lead` discover these packaged skills as soon as the bundle is installed; no template reapply is needed:

- `product-sense` (PM) — product-manager working method: problem framing, research synthesis, prioritization frameworks, PRD structure and user-story checks; loaded before writing requirements, ranking trade-offs or summarizing research.
- `design-taste-frontend` (PM) — the complete [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) v2.5.1 bundle (MIT), including scripts and reference assets. PM uses the design and review guidance within its read-only tool policy.
- `software-architect` (SE) — SE's merged architecture and contracts handbook: leveling (L0–L3), ASR quality scenarios, C4 current-state mapping, decomposition and boundaries, trade-off matrix, ADR, API/event/schema contracts with compatibility windows and versioning, migration and evolution, review and handoff. One skill owns both architecture design and contract duties, so SE intentionally ships a single skill; it is fully offline (seven `references/` checklists, no scripts).
- `clean-code-guard` (DEV and CR) — from [amElnagdy/guard-skills](https://github.com/amElnagdy/guard-skills) (MIT, license included). Clean Code, SOLID, DRY, KISS, YAGNI and LLM-specific failure-mode checks for generated or changed production code, used before presenting, committing or merging.
- `frontend-design` (DEV and CR) — from [anthropics/skills](https://github.com/anthropics/skills) (Apache-2.0, license included). Design-direction guidance: distinctive typography, palette, layout, and anti-"AI slop" checks for building or reshaping UI.
- `web-interface-guidelines` (DEV and CR) — from [vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines) (MIT, license included). The full Vercel Web Interface Guidelines copied locally: accessibility, focus, forms, animation, typography, performance, interaction. DEV self-checks against it before reporting; CR uses the same rules when reviewing frontend changes with `file:line` findings.

### Role skill folders

The package ships no private skills for General, TSE or CI/CD. To add a skill or override a packaged definition, use the local role folder:

```text
$DSH_HOME/agent-team-roles/skills/<role id>/
  <skill name>/SKILL.md
  or
  <skill name>.md
```

`SKILL.md` uses ordinary frontmatter:

```markdown
---
name: change-review
description: Check the diff for regressions before reporting.
whenToUse: When a change is about to enter review.
---
Review this diff...
```

A valid local skill with the same frontmatter `name` replaces the packaged skill for that role, including its resource directory. The description is required; when only `name` is omitted, the directory or filename supplies it. An empty `skills` list exposes all available skills for that role; a non-empty list remains an allow-list. The legacy `design-taste` wrapper remains available for existing PM selections. To opt into the full upstream skill, add `design-taste-frontend` in Settings; existing local files and selections are not migrated.

Private skills are registered only in the native teammate's Agent scope while the root uses `team-lead`. The Lead, other roles, other presets and Codex-backed teammates do not receive them. Global skills still come from the deployment's own providers; this bundle does not register skills with the external Codex CLI.

## Design taste and visual review

Frontend and UI work carries a design phase, not only a code phase. PM owns it through the private `design-taste-frontend` skill, and the team flow is:

1. **PM: references and spec first.** Before DEV starts, PM produces a one-sentence visual positioning, 2–3 concrete reference images with what to borrow from each, and a design spec: palette tokens, type scale, spacing scale, radii, motion rules and prohibitions. "Make it prettier" is not an accepted requirement; every review comment must name a location and a concrete change.
2. **DEV: implement to the spec.** For any UI change DEV follows the PM spec and uses the design tokens; temporarily hard-coded colors, sizes, spacing or radii are not allowed. Without a spec, DEV asks the Lead instead of inventing one.
3. **TSE: three-width screenshots.** Every frontend change is captured at desktop (1440), tablet (768/820) and phone (390), and the report includes each screenshot path.
4. **PM: visual review and `design-approved`.** PM reviews the screenshots with `read_image` against the skill's design guidance and returns three actionable changes. When the review passes, PM reports the `design-approved` gate event with `report_gate_event`.

The `design-approved-before-release` workflow gate blocks the CI/CD role's `git push`, `npm publish` and `deploy` commands until a fresh `design-approved` event from PM exists (8-hour window). A backend-only release can disable this gate for the current session from the Team panel gates view (or `/team-gates`) instead of fabricating an approval.

Bundling the Taste resources does not run them. DSH loads the skill body and provides its directory for relative references; it does not install or invoke upstream Claude/Codex hooks. Running the upstream checker separately requires Node.js 22+ and Chrome, Edge or Chromium, and remains subject to the executing role's tool policy, sandbox and user authorization. PM does not run scripts or write code; it hands off implementation and browser checks to DEV/TSE via the Lead.

## Reusing a model chain

In Settings → Agent team roles, use the model chain template editor to create a named chain without selecting or configuring a teammate. Choose the primary model and reasoning effort, then add fallbacks in the order they should be tried. Selecting a saved template shows its call order in a read-only preview. Choose Edit to make changes; saving returns to the preview, and cancelling keeps the original. Deletion asks you to confirm the template by name before removing it. For example, create “Daily development” first, then check SE, DEV and TSE only when you want to apply it. Unchecked roles, tool permissions, prompts and private skills stay unchanged.

A chain may inherit the session's primary model and still define its own fallbacks. Selecting a template previews those fallbacks in order. Creating, updating or deleting a template persists just the template library; applying one stages the selected roles until you click Save at the top of the page.

Applying a template copies its values; it does not link the roles to the template. Editing or deleting the template later will not change those roles. To sync an existing Team, use **↻ (Apply settings)** in its panel. A member with a manual override must follow its role route again to pick up the new chain.

## Switching a member's model from the Team panel

The Team panel's **Members** page lists each teammate with the model it is actually using. **Switch model** opens a picker for that member that offers only the routes the role configures — its primary and its fallbacks, with each route's reasoning effort shown alongside (there is no separate effort select). Opening the picker preselects the route the member is using, or the primary route when the current model is not among the role routes. **Apply** posts to `/agent-team-roles/member-model` with the Team root and member name.

The switch is scoped to that Team (that session): a live member is re-selected in place without losing its conversation, and a dormant member keeps the selection as a pending override that applies on its next activation. The role definition is untouched, so other Teams and future members keep their configured route, and the row is labelled `manual` until the member returns to its role route or a fallback. Switching a Codex-backed member is refused: its model belongs to the external Codex CLI configuration.

## Settings change log and live apply

Role configuration can be edited from the Settings page, the Lead tools, and the role service other plugins use. Two mechanisms make those edits observable and immediate:

**Change log.** `$DSH_HOME/agent-team-roles/settings.log` is a JSONL file with one line per observed catalog change: timestamp, actor, and per-role field diffs (`provider`, `model`, `reasoningEffort`, `fallbacks`, `tools`, `toolMode`, `denyCommands`, `skills`, `persona`, …). Writers are attributed explicitly — `settings-ui` for a Settings save, `role-service:update|create|remove` for agent and plugin writes, `team-template apply: <id>`, and `apply settings`. Any change it cannot attribute (for example a hand-edited profile) is recorded as `settings`. The file keeps the newest 400 entries. The **Change log** tab of the Settings page lists the recent entries, and `GET /agent-team-roles/settings-log?limit=<n>` returns the same data as JSON, so an unexplained model-route change has a timestamp and an actor.

**Live apply.** Role prompts, tool policy, and `denyCommands` are resolved from the live role on every step and every tool call, so those edits apply to existing members immediately. Model routes and private skills are refreshed by **↻ (Apply settings)** in the Team panel, which posts to `/agent-team-roles/apply-settings`: a **running** member is re-selected in place and gets its skills reinstalled, while an **idle** member has its saved snapshot rebased onto the current role, which is what its next activation reads. Members with an explicit route switch (manual or fallback) keep that route. The panel reports how many members were refreshed.

## Known limitations

- **Role personas are live**. A member's prompt section reads the current role definition on every assembly; editing a role affects existing members on their next step without re-spawning. The creation snapshot is only a fallback after the role is deleted.
- A custom tool policy uses a **per-call tool guard**: a call outside the allow-list fails with `Tool "x" is not allowed by role "<id>"`. Tool visibility is left to the Agent preset, so members (standard preset) always see basic tools such as `read/glob/grep/write/edit`; the role allow-list decides whether they may be used.
- The role editor provides **rule history**: every rule (active/candidate/superseded) with its time, evidence, and source; retiring keeps the record.
- Member snapshots live in `$DSH_HOME/agent-team-roles/members.json`; they survive a member's end so a cold resume can rebuild its configuration.
- The Settings page does not yet enforce the description and role-prompt length limits; over-long content may save but fails validation when a member is spawned.
- The skill-folder hint in Settings always shows `~/.dsh/agent-team-roles/...`; with a custom `DSH_HOME`, use the `$DSH_HOME` paths from this document.
- Official Agent Teams is still experimental; this plugin tracks the `0.2.2-rc` line and adapts to the subagent-based Team runtime introduced there.
- **`config.roles` in `cordis.patch.yml` only applies to a fresh install**. An installed profile keeps the role catalog in volatile Config and the patch does not overwrite it; update the built-in catalog in Settings, or uninstall and reinstall the bundle.
- Members, the Lead, and the plugin share the working directory; rules and role configuration provide no filesystem isolation.

## Development

```sh
node --test
```

The suite spans 31 test files. Representative coverage: `tests/config.test.js` (role normalization and validation), `tests/rules.test.js` (rule evidence/promotion/conflicts/limits/retirement), `tests/prompts.test.js` (prompt rendering), `tests/spawn.test.js` (reuse/suffixes/failure rollback/handshake delivery/standard preset), `tests/plugin.test.js` (handshake detection/role resolution/preset gating), `tests/store.test.js` (RoleStore persistence), `tests/tools.test.js` (tool schemas and argument validation), `tests/preset.test.js` (Team Lead preset assembly), `tests/role-skills.test.js` (role-private skill scanning and registration, including the merged SE skill), `tests/templates.test.js` (template parsing/seeding/skill copy), `tests/template-authority.test.js` (authority and check contract), and `tests/skill-routes.test.js` (role-skill HTTP routes). The session/fallback paths of `RuleStore` still have no direct unit tests. The plugin has also been verified by hand in a real Agent Teams profile (spawn injection, live rule updates, private skills).

## License

MIT.

## Model fallback and quota exhaustion

Each role can configure one primary model and up to 8 **fallback models** (an ordered fallback chain). The primary and every fallback model can have its own reasoning effort; a model whose adapter explicitly declares no reasoning support shows a disabled control with an “unsupported” marker (the generic level list is not offered), while a capability the catalog cannot learn keeps the generic fallback levels. The legacy single `fallbackProvider`/`fallbackModel`/`fallbackReasoningEffort` pair is still honored and counts as "fallback 1". When quota runs out or the primary route stops working:

1. Tell the Lead: "switch dev to its fallback and continue" (or let the Lead decide); the Lead calls `switch_member_model(member:"dev", route:"fallback", index:0)` to pick a position in the chain.
2. Automatic switching advances through the chain too: at most 2 switches per turn, so one failure cannot burn every fallback's quota; transient errors (timeouts, rate limits) are left to the host's retry policy.
3. The tool re-selects the model on the **existing member** (session and context unchanged) and sends a "continue" message automatically — no new member, no lost context.
4. After quota recovers: `switch_member_model(member:"dev", route:"primary")` switches back to the primary model with the same context.

Boundary: if a member is already in an unrecoverable terminal state and cannot receive messages, the tool fails explicitly; fix the role route (`update_team_role`) and pull a fresh member instead. Switching a member's model affects only the current conversation and does not change the role configuration.

## Viewing member models

The **Members** page of the Team panel shows both the roster and model information:

- The top row is the Lead's own model (= the team root session route).
- Each row: status dot (running / idle / failed), member name · role, `provider/model · reasoning effort`, and a source tag (session / primary / fallback·auto / fallback·manual); a pending fallback switch is marked "pending".
- Data comes from the host read-only route `GET /agent-team-roles/member-models`: live members read `agent.model.current()` (exact), dormant members are derived from "switch override → role snapshot" (i.e. the route that will apply on next activation).

## Gate toggle scope (session-level)

Gate **definitions** and the **global default disable list** (Settings) are shared; **enabling/disabling** is a **session-level** decision:

- `/team-gates enable|disable <id>` affects only the current session and returns to the global default after a restart.
- `/team-gates list|status` marks the source: `[on]`, `[on·session]`, `[off·session]` (disabled for this session), `[off·global]` (disabled by configuration), `[n/a]` (no key-producing role in this team).
- Priority: session override > global default.
- The **Gates** page in the Team panel shows the state and toggles gates for this session; the Lead's prompt also carries a `Current workflow gates: ...` summary.
- Event keys stay isolated per team: an approval in team A never unlocks team B.
