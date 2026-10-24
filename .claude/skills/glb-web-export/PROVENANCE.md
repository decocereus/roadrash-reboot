# PROVENANCE

- Skill: glb-web-export
- Source: https://github.com/pascalorg/skills, glb-web-export
- Source commit: 7be87e9292e12fe412d1eb8582fd95fdbd151325 (head at vendoring time, 2026-09-11 commit)
- Vendored: 2026-10-24 by unit skills-1
- Licence: MIT, kept at [LICENSE](LICENSE) (full notice reconstructed from the upstream README declaration; the upstream repo carries no licence file)

## Licence finding

- The folder has no licence file upstream. The repository README's License section states "MIT" (README at 7be87e92), which is a valid way for a README to communicate a licence; the missing folder-level file does not make the work unlicensed. The vendored copy adds LICENSE with the full MIT notice and the upstream author as rights holder, plus the note above recording the pinned declaration it is reconstructed from. The earlier research note that this repo is "a fork whose head commit sha matches" another tree explained nothing about licensing and was removed: the only licence evidence is the README statement, recorded as such.

## Taken

- SKILL.md, references/commands.md, references/correctness-checklist.md, references/loader-support.md, examples/textured-scene.md, with their measurements kept as evidence.

## Cut

- scripts/ (glb-audit.mjs, make-fixture.mjs, glb-audit.sh, package.json, package-lock.json): the repo's typescript-only check bans tracked .js/.mjs files, so the scripts cannot pass pnpm check, and the skill's own verification step requires an isolated npm install. The audit knowledge was folded into SKILL.md and references; the measured numbers in commands.md and examples/ stay as evidence.
- The closing "If the model needs to stay editable" section: it advertises the upstream author's Pascal editor product, which has nothing to do with this repo.

## Edited

- Markdown (SKILL.md and reference files) is normalised by the repo formatter, oxfmt, at vendoring time: paragraphs are unwrapped to one line per paragraph and table gutters removed. Wording is unchanged apart from the edits listed below.

- SKILL.md: the three places that invoke scripts/glb-audit.sh now explain the audit was cut and how to cover the same ground (inspect diff, brotli/gzip, validate).
- repo notes added: the game wires MeshoptDecoder in apps/web/src/game/assets.ts and compress.ts runs prune + meshopt; node names must survive because the game looks up the rider's 53 joints by name.
- After the Sol review (2026-10-25): SKILL.md gained a "Tools (read first)" paragraph (provision a pinned @gltf-transform/cli@4.5.0, never let bare npx fetch); commands are shown as `gltf-transform ...` instead of `npx @gltf-transform/cli ...`; the `npm view` version checks became local `--version` checks. commands.md dropped the global-install recommendation, and examples/textured-scene.md keeps the upstream measurements as archival evidence without a runnable reproduction. correctness-checklist.md marks the audit-script-only outputs (`worldBounds.sizeMeters`, `namedNodesLost`) as unverified with the script cut.

## Review (untrusted-data review before vendoring)

- Network calls, telemetry: none in the vendored text; no code in the text to scan. The commands the skill documents used a networked tool upstream at measure time (`npm view`, unpinned npx); they now read "provision a pinned @gltf-transform/cli@4.5.0, run `gltf-transform --version` locally; if missing, report" and contain no install or fetch step (see SKILL.md "Tools (read first)" and commands.md).
- Writes outside the repo: the cut scripts wrote report files to their argument paths; the vendored text itself writes nothing.
- Subprocess: the cut glb-audit.sh ran node on its sibling .mjs; not vendored.
- Obfuscated code: none.
- Prompt injection: scoped text scans found no instruction overrides, credential extraction or exfiltration directives. The remaining tool instructions are deliberate text for the agent, reviewable in the diff.
- Claims: the before/after numbers (optimize dropped 15 of 16 named nodes, 7,056 -> 6,740 tris, instance erases names, KTX2 ETC1S 0.67 MiB vs WebP 5.33 MiB VRAM) are upstream's measurements on a deterministic fixture; the fixture generator was not vendored and the numbers were not rerun.
