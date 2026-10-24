# PROVENANCE

- Skill: glb-web-export
- Source: https://github.com/pascalorg/skills, glb-web-export
- Source commit: 7be87e9292e12fe412d1eb8582fd95fdbd151325 (head at vendoring time, 2026-09-11 commit)
- Vendored: 2026-10-24 by unit skills-1
- Licence: MIT

## Licence finding

- The folder has no licence file. The repository README's License section states "MIT". pascalorg/skills is a fork whose head commit sha matches this repo's other adopted tree, and the README claim is the only licence evidence. The vendored copy therefore carries the repository-level MIT claim; recorded as accepted evidence rather than a licence file.

## Taken

- SKILL.md, references/commands.md, references/correctness-checklist.md, references/loader-support.md, examples/textured-scene.md, with their measurements kept as evidence.

## Cut

- scripts/ (glb-audit.mjs, make-fixture.mjs, glb-audit.sh, package.json, package-lock.json): the repo's typescript-only check bans tracked .js/.mjs files, so the scripts cannot pass pnpm check, and the skill's own verification step requires an isolated npm install. The audit knowledge was folded into SKILL.md and references; the measured numbers in commands.md and examples/ stay as evidence.
- The closing "If the model needs to stay editable" section: it advertises the upstream author's Pascal editor product, which has nothing to do with this repo.

## Edited

- Markdown (SKILL.md and reference files) is normalised by the repo formatter, oxfmt, at vendoring time: paragraphs are unwrapped to one line per paragraph and table gutters removed. Wording is unchanged.

- SKILL.md: the three places that invoke scripts/glb-audit.sh now explain the audit was cut and how to cover the same ground (inspect diff, brotli/gzip, validate).
- repo notes added: the game wires MeshoptDecoder in apps/web/src/game/assets.ts and compress.ts runs prune + meshopt; node names must survive because the game looks up the rider's 53 joints by name.

## Review (untrusted-data review before vendoring)

- Network calls, telemetry: none in the text. The cut scripts' package.json declared only @gltf-transform/core, @gltf-transform/extensions, draco3dgltf, meshoptimizer, pngjs as local deps, no telemetry.
- Writes outside the repo: the cut scripts wrote report files to their argument paths; text does not write.
- Subprocess: the cut glb-audit.sh ran node on its sibling .mjs; not vendored.
- Obfuscated code: none.
- Prompt injection: none found.
- Claims: the before/after numbers (optimize dropped 15 of 16 named nodes, 7,056 -> 6,740 tris, instance erases names, KTX2 ETC1S 0.67 MiB vs WebP 5.33 MiB VRAM) are upstream's measurements on a deterministic fixture; the fixture generator was not vendored and the numbers were not rerun.
