# Breakwater Run stall kit

Stall art for the market on Breakwater Run's footpaths, the squeeze at 1300 to 1740 m. The owner approved this art, and `apps/web/src/game/bazaar.ts` draws it from `models/stalls.glb` in `apps/web/src/assets/art.json`.

## Contract

`stalls.glb` is 55,976 B and holds twelve nodes: six stalls and six decorations. `metrics.json` lists each part's triangles, its glowing triangles and its footprint. `tools/blender/stalls.py` refuses to build a stall over 400 triangles or a decoration over 60.

Each node's local `+x` faces the road and its origin stands on the footpath, which is the convention `plant` in `apps/web/src/game/ground.ts` uses with `turnedOnRight`. `deco_string_lights` is the exception. Its span runs along `x`, so it turns a quarter turn to run along the road, with its `+z` towards the road. Its span is 6 m.

Colour is per-vertex `COLOR_0`. There are two materials, which are the two the city already draws with in `createCity` in `apps/web/src/game/city.ts`.

| GLB material | City material | Lighting |
| --- | --- | --- |
| `stall_cel` | `solid`, `shading.cel("#ffffff", { vertexColors: true })` | Cel bands |
| `stall_glow` | `glow`, `shading.glowPaint()` | Unlit |

The renderer has no local lights in the city, so the lamp light in the art is painted into the vertices. Awning undersides, lit back panels and hanging cloth are `stall_glow` with a vertex gradient. The review pictures scale glow by 1.6. The city scales its own glow by 1.5 to 2.5.

Sign words are invented generic words drawn as polygons: NOODLE, HOT, SILK, SCRAP, FRUIT, NEON, 24H, INK. The hanging sign said OIL in the review pictures. It became INK before the kit shipped, because OIL could read as a warning for the oil hazard. There are no logos or brands.

## Parts

| Part                 | Triangles | Glowing | Footprint, depth by width |
| -------------------- | --------- | ------- | ------------------------- |
| `stall_noodle`       | 389       | 192     | 3.2 by 4.4 m              |
| `stall_parts`        | 330       | 122     | 3.0 by 4.6 m              |
| `stall_food_cart`    | 294       | 196     | 2.6 by 3.2 m              |
| `stall_fruit`        | 256       | 106     | 3.0 by 4.0 m              |
| `stall_fabric`       | 234       | 82      | 3.0 by 5.0 m              |
| `stall_neon`         | 224       | 154     | 3.2 by 3.2 m              |
| `deco_string_lights` | 60        | 48      |                           |
| `deco_lanterns`      | 56        | 52      |                           |
| `deco_hanging_sign`  | 52        | 40      |                           |
| `deco_stool`         | 34        | 0       |                           |
| `deco_crates`        | 30        | 0       |                           |
| `deco_bin`           | 20        | 0       |                           |

## Cost

These numbers are worked out from the parts and the city code. Nobody has measured them in the game, and they say nothing about frame rate.

A stall averages 288 triangles and a decoration averages 42. Thirty of each come to about 9,900 triangles and about 20,800 vertices.

Draw one merged mesh per material for the whole patch, and hide it through a `Stretch` once the rider has passed. That costs 2 draw calls in the main pass and none in the shadow pass.

| Way to draw it | Main pass calls | Why not |
| --- | --- | --- |
| One merged mesh per material for the patch | 2 | This is the recommendation |
| New chunk bucket, patch crosses city chunks 6 to 9 | 4 to 8 | Chunk culling saves little, because most of the patch is in view at once |
| One `InstancedMesh` per part and material | 21 | The GLB has 21 primitives, and `plant` draws one instanced mesh per part |
| Merged into the city's existing `solid` bucket | 0 | Every triangle would also draw into the shadow pass, because `meshFor` makes `solid` cast |

Stalls set `castShadow = false` and `receiveShadow = true`. Each stall has a dark 2-triangle ground mat that stands in for a contact shadow, so the kit adds nothing to the shadow pass. If a ride shows that stalls need a real shadow, use one 12-triangle box per stall from `metrics.json`'s footprint, merged into one mesh with `colorWrite` and `depthWrite` off. That adds 360 shadow triangles, one shadow call and one main call.

Density decides the triangle count, and the merged mesh keeps the calls at 2 either way. The review patch is the dense form: 12 stalls and 14 decorations in 40 m, 4,104 triangles. Thirty stalls is about two and a half of those clusters. Filling all 440 m at that density takes about 132 stalls and about 45,000 triangles.

## How the game uses it

- `Track.stalls` comes from `packages/track/src/stalls.ts`, whose `stallSizes` match the footprints in `metrics.json`. A stall's front stands 2.6 m from the road's edge, not the 1.7 m of the review layout, because the chevrons and lamp poles reach 2.58 m from the road's edge.
- The whole market is 47,667 triangles and 102,167 vertices, 23,105 and 47,389 in the cel mesh and 24,562 and 54,778 in the glow mesh, about 3.96 MB on the GPU. That is 135 stalls and their decorations, worked out from the shipped kit and pinned in `apps/web/test/bazaar-kit.test.ts`. The cost above assumed 30 stalls.
- The merged mesh costs 2 draw calls in the main pass and 2 more in the normal pass in `post.ts`, which the table above leaves out, and none in the shadow pass.
- `clearance.ts` collapses one stall's index range when the camera reaches it, so the merged mesh and per-stall hiding are not a choice.

## Rebuild

```
blender -b --factory-startup --python-exit-code 1 -P tools/blender/stalls.py
node tools/blender/compress.ts
blender -b --factory-startup --python-exit-code 1 -P tools/blender/stalls_preview.py -- <output folder>
```

`compress.ts` writes the new key into `art.json`. Copy the compressed file from `~/.cache/rushline/art/<key>` to this folder so the record stays current, and run `pnpm art:upload` before you push.

The preview script renders with Eevee using the `dusk` look's key direction, lit tone and shadow tone in a cel shader that follows `createShading`, then adds ink lines and bloom. The road width, kerb, footpath and building line are the market squeeze's numbers, and the camera comes from `frameRig` in `chase-camera.ts`. The buildings are dark stand-ins, so judge the stalls against them and not the city.
