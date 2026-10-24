# PROVENANCE

- Skill: blender-character-rigging
- Source: https://github.com/EL4CTEO/blender-skills (blender-skills, skills/blender-character-rigging)
- Source commit: 71d031dab8bc6729504d11a78cbe91945401045f (head at vendoring time, 2026-10-16)
- Vendored: 2026-10-24 by unit skills-1
- Licence: MIT, Copyright (c) 2026 EL4CTEO, kept at [LICENSE](LICENSE)
- Upstream version: "1.1.0"

## Taken

- The whole skill folder as published: SKILL.md, scripts/ and references/.

## Cut

- Upstream repo extras were not vendored: install/ (its install.sh writes into ~/.claude), shared/ and tools/ (sync helpers), tests/ (not our test suite), skills not adopted.
- blender-character-rigging keeps its upstream sibling folders in scripts/_bpyx.py form: the copies are self-contained and the "synced by tools/sync_shared.py" note is inert here.

## Edited

- Markdown (SKILL.md and reference files) is normalised by the repo formatter, oxfmt, at vendoring time: paragraphs are unwrapped to one line per paragraph and table gutters removed. Wording is unchanged.

- SKILL.md was lightly adapted to this repo (see the notes in the file). Details in the PR body.

## Review (untrusted-data review before vendoring)

- Network calls, telemetry: none. Grep over the vendored files for requests, urllib, http fetches, curl, wget, npm/pip installs, telemetry and analytics found nothing.
- Writes outside the repo: none found. Scripts write to their caller's output paths only.
- Subprocess: blender-core/scripts/run_in_blender.py uses shutil.which and subprocess to locate and run Blender headlessly. Expected, benign, runs only the local Blender binary the user asks it to.
- Obfuscated code: none. No eval, exec, base64 packing or string-built imports (the only re.compile hit is regex-driven bone-name lookup in blender-character-rigging/scripts/stress_poses.py).
- Prompt injection: none found. Text addressed to the agent matches the upstream README's install instructions, which were not vendored.
- Claims: the glTF exporter flags it names (export_meshopt_compression_enable, export_meshopt_extension, export_use_gltfpack, export_influence_nb default 4) were verified against glTF-Blender-IO's blender-v5.2-release branch by the prior research unit (char-r1, 2026-10-24). The skill's own test suite was not run here.
