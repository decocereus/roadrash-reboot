# PROVENANCE

- Skill: threejs-animation
- Source: https://github.com/CloudAI-X/threejs-skills, skills/threejs-animation
- Source commit: 0e181866f095b5f06d005133876e926515390d95 (head at vendoring time, 2026-10-19)
- Vendored: 2026-10-24 by unit skills-1
- Licence: MIT, Copyright (c) 2026 CloudAI-X, kept at [LICENSE](LICENSE)

## Taken

- The whole skill folder: SKILL.md only (each upstream skill is a single SKILL.md).

## Cut

- Nothing. The other seven upstream skills were not adopted (textures, geometry, fundamentals, lighting, postprocessing, interaction, React Three Fiber: the last one does not match this stack).

- No edits. Content taken as-is from upstream.

## Review (untrusted-data review before vendoring)

- Network calls, telemetry: nothing to scan for code: this skill is one markdown file of web-platform knowledge with no scripts. Its text keeps ordinary web examples (threejs-loaders shows a browser `fetch("model.glb")`); those are documentation, not scripts this change executes.
- Writes outside the repo: none.
- Subprocess: none.
- Obfuscated code: none.
- Prompt injection: scoped text scans over this folder found no instruction overrides, credential extraction or exfiltration directives.
- Claims: previously checked by the research unit against three.js behaviour (DataTexture gradient maps, SkeletonUtils.clone, bounding-sphere culling of animated skinned meshes, setMeshoptDecoder, weld before simplify, meshopt last). Not rerun here.
