# Upstream provenance

- Repository: `Leonxlnx/taste-skill` (GitHub).
- Version: `v2.5.1` (git tag; the upstream README calls it `tasteskill 2.5.1`).
- Package: `skills/taste-skill` in the repository (skill name `design-taste-frontend`).
- License: MIT; the upstream copyright and license are included in [LICENSE](LICENSE).
- Requirements: Node 22+, Chrome / Edge / Chromium (ffmpeg optional, for WebP output and the phone crop).

Referenced, not vendored: the local `design-taste` skill condenses the upstream judgment, page-kind
classification, workflow, review checklist and deliverable format into a form PM (a read-only role
without shell tools) can own. The upstream package is intentionally not copied in: it ships the
Node 22+ scripts (`scripts/start.mjs`, `consistency.mjs`, `gate.mjs`, `shoot.mjs`, `photos.mjs`, …),
a large `assets/` and `library/` set, and long `references/`; `consistency.mjs` alone is roughly 1 MB,
which is too heavy for a role-private skill and would rot without an updater.

Local changes: no upstream file is copied. `SKILL.md` keeps the 10-item review checklist, the
landing-page versus in-app-UI split (shaders / 3D / scroll scenes for software, tech and gaming
marketing pages only), the three-width screenshot review flow, the design-spec deliverable format
and the "no vague feedback" rule. `UPSTREAM.md` and `LICENSE` record provenance; the mandatory
clone-and-run steps are documented there because PM cannot execute shell commands itself.

Updating: the local copy is pinned to `v2.5.1`. To bump it, clone the same tag range
(`git clone --depth 1 --branch <tag> https://github.com/Leonxlnx/taste-skill`), read the upstream
`skills/taste-skill/SKILL.md` and `skills/taste-skill/references/gate.md`, then update this file,
the checklist in `SKILL.md` if upstream rules changed, and the version assertions in
`tests/templates.test.js`. Do not vendor the scripts without an owner for upgrades.
