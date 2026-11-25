# Upstream provenance and third-party notices

- Project: [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill), release [`v2.5.1`](https://github.com/Leonxlnx/taste-skill/releases/tag/v2.5.1), commit [`f6b76575f949707b4e3c37cd86cb44b0b98643e8`](https://github.com/Leonxlnx/taste-skill/tree/f6b76575f949707b4e3c37cd86cb44b0b98643e8/skills/taste-skill).
- This directory preserves all 1,631 files of the pinned `skills/taste-skill/` subtree without edits, including sample assets, library, references, and scripts. The upstream repository-root [MIT license](LICENSE) is copied here. This notice and the separate third-party license files are packaging additions.
- The skill's frontmatter name is `design-taste-frontend`. The upstream Claude-specific stop hook is preserved verbatim as source metadata; it is not a DSH hook. Distribution does not install or execute upstream hooks or scripts. PM is read-only; use the separate `design-taste` skill for the PM workflow.

## Third-party assets

The MIT license for the Taste Skill does not relicense third-party assets. The original file-level credits are part of this distribution.

| Asset group | Attribution and terms |
| --- | --- |
| `assets/icons/demo/` and `assets/ui/icons/` | Preserve the [demo credits](assets/icons/demo/icons-credits.json) and [UI credits](assets/ui/icons/icons-credits.json). They identify the source, pinned version, license and trademark status for every bundled SVG in these folders. Source notices: [Gil Barbara Logos (CC0)](third-party-licenses/gilbarbara-logos-CC0.txt), [Simple Icons (CC0)](third-party-licenses/simple-icons-CC0.md), [VSCode Icons (MIT)](third-party-licenses/vscode-icons-MIT.txt), [Lucide (ISC) and its Feather-derived icons (MIT)](third-party-licenses/lucide-ISC-and-Feather-MIT.txt). Product names and logos are trademarks of their owners; identify products without implying endorsement. CC0 does not grant trademark rights. |
| Photographs and derivatives | Keep the [layout credits](assets/layout/img/credits.json), [moment demo credits](assets/moments/_demo/credits.json), [scene demo credits](assets/scenes/_demo/credits.json), [object photo kit credits](assets/objects/photo-kit/photos.json), [photo component attribution](assets/components/fx-photo/meta.json), and [photo library entries](assets/photos/photos.json). The photo library entries include the file paths for all 66 local WebP variants. Those variants (including any low-resolution data previews) are derived from the credited original photographs. Retain the photographer, source and applicable license link; indicate resizing, re-encoding, cropping or effects when applicable. Keep adaptations of a CC BY-SA photograph under its applicable share-alike terms. The two photos marked Public Domain Mark 1.0 are identified on their Wikimedia Commons source pages as author-released via Flickr; the Mark itself is not a license. |
| Unsplash demos | The [Unsplash License](https://unsplash.com/license) allows distribution, but not selling substantially unmodified photos or compiling them to replicate a competing service. Here they are included as example inputs for a frontend design skill, not offered as a standalone photo service. Keep the bundled attribution. |

No files from the scoped upstream subtree were excluded. Repository-level examples, installers, Claude plugin manifests, or any profile configuration are not part of the skill subtree and were not copied.

To update, select a release and full commit, compare the complete subtree and repository-root license against the pinned archive, and audit changed asset sources, credits and accompanying license notices before shipping. Do not run upstream code or hooks during packaging.
