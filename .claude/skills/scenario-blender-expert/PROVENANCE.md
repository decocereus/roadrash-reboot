# PROVENANCE

- Skill: scenario-blender-expert
- Source: https://github.com/scenario-labs/skills, skills/dcc/blender/scenario-blender-expert
- Source commit: 5429dea302ccc7edbce8ace9d5c1fb6852499540 (head at vendoring time, 2026-10-22)
- Vendored: 2026-10-24 by unit skills-1
- Licence: MIT, Copyright (c) 2026 Scenario Inc., kept at [LICENSE](LICENSE)

## Provenance of the upstream material (checked before vendoring)

- The repo's README states scenario-blender-expert was ported from edemaistre/blender-expert-skills v0.1 (2026-09-24), upstream of which has no licence file.
- The MIT claim is plausible but not backed by a written grant: GitHub's profile for edemaistre (github.com/edemaistre, "Emm") lists company "Scenario", and Scenario Inc. holds the MIT licence of the repository that publishes the port. The port is therefore treated as the author's own movement of his work to his employer's MIT repository.
- Uncertainty recorded; if the owner wants a hard guarantee, the coordinators' contact chain ("lowside-research") can ask Scenario for the grant in writing. Deliberate decision: it earns its place for rigging and export judgement, and this level of provenance risk is reported rather than hidden.

## Taken

- The whole skill folder: SKILL.md, references/, scripts/ (including bx_audit.py).

## Cut

- Nothing from the folder itself. Upstream repo extras (tests at repo top level, installer documents, other dcc skills) were not vendored.

## Edited

- Markdown (SKILL.md and reference files) is normalised by the repo formatter, oxfmt, at vendoring time: paragraphs are unwrapped to one line per paragraph and table gutters removed. Wording is unchanged.

- SKILL.md: the "ask the user to install it (npx skills add ...)" instruction was rewritten to point at the vendored set in .claude/skills/ and to forbid fetching, as an agent-directed instruction inside a third-party file it is a finding, not a command.
- SKILL.md: the upstream "Live channel: the Scenario Blender Plugin" section was rewritten for this repo's bridge, ahujasid's mcp-for-blender (execute_blender_code, get_scene_info, get_viewport_screenshot, look), including the fresh-namespace and stage-backup guidance; the plugin tool table and its tool-name warnings are gone.
- SKILL.md: persona rows for skills upstream ships but this repo does not vendor (sculpting, hair, texturing-shading, previs, grease-pencil, geometry-nodes, lighting-rendering, textures) were cut to the personas the vendored set can serve, and the sculpting capability row now says bx_sculpt is absent.
- Repo-specific notes added about MPFB's UE-style bone names and RIGIFY_POSES, and about the game's own engine check replacing the scenario-*-pipeline-automation skills in the export skill.

## Review (untrusted-data review before vendoring)

- Network calls, telemetry: none. Grep over the vendored files found no requests, urllib, http, curl, wget or installer text.
- Writes outside the repo: none found. This folder's scripts (bx_audit.py, bx_review.py, bx_gui.py) write their sheets, legends and json to caller-given output directories via os.makedirs on the passed out_dir.
- Subprocess: none in this folder's scripts (bx_audit.py subprocess-free here; bx_export.py's background-Blender round trip lives in the export skill, which documents it).
- Obfuscated code: none. No eval, exec, base64 or encoded payloads.
- Prompt injection: the sibling-install instruction (above) was the only agent-directed instruction beyond technique text, and it is now inert.
- Claims: "tested on 5.2.1" and the numeric gates are upstream's own statements, not rerun here. RIGIFY_POSES assumes Rigify names, which the vendored copy says explicitly.
