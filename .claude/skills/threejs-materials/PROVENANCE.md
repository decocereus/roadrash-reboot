# PROVENANCE

- Skill: threejs-materials
- Source: https://github.com/CloudAI-X/threejs-skills, skills/threejs-materials
- Source commit: 0e181866f095b5f06d005133876e926515390d95 (head at vendoring time, 2026-10-19)
- Vendored: 2026-10-24 by unit skills-1
- Licence: MIT, Copyright (c) 2026 CloudAI-X, kept at [LICENSE](LICENSE)

## Taken

- The whole skill folder: SKILL.md only (each upstream skill is a single SKILL.md).

## Cut

- Nothing. The other seven upstream skills were not adopted (textures, geometry, fundamentals, lighting, postprocessing, interaction, React Three Fiber: the last one does not match this stack).

- No edits. Content taken as-is from upstream; the MeshToonMaterial gradient-map advice matches this repo's cel ramp work.

## Review (untrusted-data review before vendoring)

- Network calls, telemetry: none. This skill is one markdown file of web-platform knowledge with no scripts.
- Writes outside the repo: none.
- Subprocess: none.
- Obfuscated code: none.
- Prompt injection: none found.
- Claims: previously checked by the research unit against three.js behaviour (DataTexture gradient maps, SkeletonUtils.clone, bounding-sphere culling of animated skinned meshes, setMeshoptDecoder, weld before simplify, meshopt last). Not rerun here.
