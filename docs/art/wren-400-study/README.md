# Halden Wren 400 Blender study

An original, standalone bike candidate built in Blender 5.2.2 on October 23, 2026. The shipped bike is unchanged.

The narrow tank, round headlight and exposed frame follow Halden's design rules in `docs/design/art-direction.md`. Yellow paint and cyan trim follow the current palette in `DESIGN.md`. The geometry uses the existing bike's wheel centres, seat and handlebar positions.

## Files

- `wren-400.blend`: editable mesh objects and the presentation camera.
- `wren-400.glb`: uncompressed glTF 2.0 binary, ready for the game's asset parser.
- `hero.webp`, `side.webp`: Blender Workbench renders. These show the model in Blender, not the game's shading.
- `in-game.webp`: the candidate running with existing riders in an isolated race.
- `metrics.json`: counts from the generator.
- `verification.json`: export, browser and repository check results.

## Contract

1,188 triangles: 692 in `bike_body` and 248 in each of `wheel_f` and `wheel_r`. The target in the art direction is approximately 1,200. The GLB is 56,852 bytes and uses no textures.

One Blender unit is one metre. The wheelbase is 1.38 m. Blender's exporter writes glTF Y-up coordinates, matching the existing `common.B` and actor orientation convention. Front and rear wheel centres in the export are `(0, 0.293, 0.69)` and `(0, 0.306, -0.69)`. Object origins remain at the bike origin because `actors.ts` applies the wheel-centre offsets itself.

Material names are the existing slots: `body`, `accent`, `dark`, `metal`, `gold`, `tyre`, `glass`, `seat`, `light_head`, and `light_tail`. The game replaces the Blender material colours through these names. Cyan trim is a presentation choice; the game's rider palette controls `accent` when used in a race. Materials are combined into cel and glow geometry by the existing renderer.

## Rebuild and check

From the repository root:

```sh
blender -b --python-exit-code 1 -P tools/blender/wren_study.py
```

The script rebuilds the blend, GLB, metrics and the full PNG set (`hero.png`, `side.png`, `rear.png`, `topology.png`). It asserts a maximum of 1,200 triangles, finite positions and nonzero triangle areas. Commit only the WebP renders; the PNGs stay local.

The review snapshots stay outside the repository, in `~/.claude/orchestrate/rushline-launch/evidence/bike-studies/`. They are the self-contained viewer `index.html`, its browser captures and the full PNG renders.

The candidate has been decoded with the real `assetParsers.parts` function. Its three mesh names, material slots and triangle counts were checked after decoding. An isolated `createGame` race used this GLB with the existing riders and reached 159 km/h on Breakwater Run. The chase-camera capture shows the candidate in `in-game.webp`. The browser reported no console errors. Results are recorded in `verification.json`.

This is an asset demonstration, not an installed bike selection or a performance approval for shipping it. The production loader, racing rules, shipped GLBs and performance budgets have not changed. A shipping change still needs the repository's paired GPU performance gate and the riding verification recipe.

`THIRD_PARTY_LICENSES.txt` holds the Three.js and Geist licences for the viewer snapshot.
