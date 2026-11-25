# Upstream provenance

- Repository: [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill).
- Version: `v2.5.1`, commit `f6b76575f949707b4e3c37cd86cb44b0b98643e8`.
- Upstream package: `skills/taste-skill`; skill name `design-taste-frontend`.
- The original work is MIT; see [LICENSE](LICENSE). The separate vendored skill records [its provenance and third-party asset notices](../taste-skill/UPSTREAM.md).

`design-taste` is the DSH workflow for a read-only PM. It keeps page-kind classification, design specifications and review criteria. The sibling [design-taste-frontend](../taste-skill/SKILL.md) is the complete pinned upstream skill and includes the resources and tools for the broader frontend workflow. PM does not run its scripts or install its hooks; use the wrapper's manual review unless an authorized teammate is available to perform browser verification.

For updates, keep the wrapper and vendored release in sync. Compare the pinned upstream skill and gate reference, then revise the wrapper only where review guidance changed. The upstream skill's own provenance file records the distribution checks.
