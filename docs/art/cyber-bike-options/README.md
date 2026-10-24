# Cyber sport-bike options

Three original Blender studies for the current LOWSIDE direction.

## Direction

`PRODUCT.md` and `docs/design/game-design.md` section 0 establish a near-future illegal racing league, real cities, parody bike makers and celebrity-company prototypes. The accepted visual reference is Cyberpunk: Edgerunners: realistic proportions, two-tone shading, ink outlines and yellow, cyan, magenta and red against near-black. The October 13 note at the top of `docs/design/art-direction.md` supersedes the earlier flat low-poly look. The earlier Wren study gave that older direction too much weight.

These studies use sport-bike proportions and original bodywork. None reproduces a manufacturer's logo or exact model. The fictional names are design labels, not new catalogue entries.

| Option | Reference cues | Original treatment |
| --- | --- | --- |
| 01. Ostra Seraph RR | Aprilia RSV4's layered fairings and stacked aero surfaces | Wide split nose, paired horizontal lamps, a low wraparound screen and double wings |
| 02. Kairo Ghost R | Yamaha R1's compact nose, central intake and race proportions | Narrow spear nose, paired vertical lamps, a tall blade screen and upright canards |
| 03. Vanta Oni X | Ninja H2/H2R's broad shoulders, trellis frame and aerospace-inspired wings | Broad armoured face, one continuous visor lamp, a short wide screen and a vented jaw |

Primary references: [Aprilia RSV4](https://press.piaggiogroup.com/en_EN/post/show/308733/new-aprilia-rsv4-and-rsv4-fact.html), [Yamaha R1](https://yamahamotorsports.com/Blogs.php?action=blogArticle&blog_id=introducing-yamaha-2025-yzf-r1-and-r1m), [Kawasaki H2R](https://answers.khi.co.jp/en/mobility/20150430e-02/).

## Front revision

The first three options shared too much of their front shell and windscreen. Each front is now built by its own geometry function. Seraph is low and wide with a split nose; Ghost is narrow and tall; Oni has a broad, flat armoured face. Their lamp layouts are horizontal pairs, vertical pairs and one continuous bar respectively.

A rebuild also renders `front-detail.png`, `front-detail-neutral.png` and `front-neutral.png` in each option folder. They compare the faces at one camera position and scale, in paint and in uniform clay, so later changes can be judged without their colour schemes. Each option's `in-game.webp` shows the prior front revision in a race; current export checks are recorded in `verification.json`, and the prior race checks in `verification-v1.json`.

## Files and contract

Each option folder contains an editable `.blend`, a `.glb`, measured geometry counts in `metrics.json`, and three renders kept as WebP: `hero.webp`, `side.webp` and `in-game.webp`. `catalogue.json` collects the measurements. Blender files separate the original bodywork, the game export and the presentation meshes. The game export retains Principled materials; the studio copies use a two-tone Eevee shader and ink shells. Studio geometry is not exported.

The exports use the existing `bike_body`, `wheel_f`, and `wheel_r` root names and material slots. Units are metres, with a 1.38 m wheelbase. Front and rear wheel centres in glTF space are `(0, 0.293, 0.69)` and `(0, 0.306, -0.69)`, matching the actor's existing rotation pivots. Text is geometry, and the assets need no textures. Body and accent colours are read through the existing material slots. In a race, the rider palette chooses those colours.

These studies deliberately exceed the older 1,200-triangle note. The shipped `bike.glb` measured 18,476 triangles at the start of this work; the generator checks each candidate against an 18,500-triangle study ceiling and reports the actual counts. That comparison does not establish a frame-time budget. Nothing has changed the shipped assets, renderer or handling. Integrating a chosen design still requires the paired GPU performance gate and the normal riding checks.

## Rebuild

```sh
blender -b --python-exit-code 1 -P tools/blender/cyber_bikes.py
```

An optional final argument selects a design, for example `-- oni`. The generator checks finite coordinates and nonzero triangle areas, writes the GLBs before adding presentation meshes, renders the full PNG set (front, rear, side, three-quarter and the neutral front comparisons) and saves the Blender files. Commit only the three WebP renders per option; the PNGs stay local.

The review snapshots stay outside the repository, in `~/.claude/orchestrate/rushline-launch/evidence/bike-studies/`. They are the self-contained 3D selector `index.html`, the earlier Blender sources in `front-v1-source.zip`, each option's `front-before.png`, the browser captures and the full PNG renders.

`cyber_parts.py` owns the mechanical kit, `cyber_bodywork.py` the three fairing/aero/tail designs, and `cyber_bikes.py` assembly, export, the presentation scene and checks.

## Review

The renders show Blender's presentation shading. The game draws the exports with its cel and outline pipeline, so judge the final look in a race.

`THIRD_PARTY_LICENSES.txt` holds the Three.js and Geist licences for the selector snapshot.
