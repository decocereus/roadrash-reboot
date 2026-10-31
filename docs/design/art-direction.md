# Art direction

Drafted October 10, 2026. The look and sound of the game: palette, type, HUD, models, the five regions, readability rules, camera, and audio. It builds on what the greybox already does (flat matte materials, a chase camera, synthesised audio) and on `docs/architecture.md`, which fixes the style as stylized low-poly.

Superseded in part on October 13, 2026. The race view is now cel-shaded cyberpunk anime, as `docs/architecture.md` describes under Product and Browser client. The principles of flat matte low-poly shading, the palette, the HUD style, and the region kits below describe the earlier direction and no longer bind the race view. The readability rules, camera rules, and audio direction still hold.

Superseded for the interface on October 23, 2026. The menus are painted rooms with ruled paper and neon ink, and `DESIGN.md` is the source for the interface palette, type, and components. The interface palette below is kept as history.

The reference captures were studied for composition only: a large rider low in the frame, a high horizon, bright riders on a grey road, orange headings on dark menus, and consequences shown as a character's reaction. Nothing here copies a screen, a portrait, a logo, or a layout.

## Principles

1. **The road is the brightest idea on screen.** Grey road, clear lines, a horizon in the upper third. Scenery frames it and never competes with it.
2. **Riders are colour blocks.** Each rider is one bike colour and one jacket colour, readable as a pair at 80 m. Detail comes third.
3. **Flat and matte.** Flat-shaded faces, vertex colour, no photo textures. Decals (numbers, stripes, signs) are the only textures. This keeps generated and hand-made models consistent and the download small.
4. **Clean in the race, rough in the menus.** The race view is tidy. Grit lives between races: cork, torn paper, Polaroids, marker pen, stencil type.
5. **Funny through silhouette.** A veil, a delivery box, a stop sign, a hat brim. The joke should read as a shape before it reads as a texture.

## Palette

### Interface

| Role | Hex | Use |
| --- | --- | --- |
| Ink | `#0E0F12` | Screen background |
| Panel | `#17191F` | Cards, strips |
| Raised | `#22252D` | Selected card, bar tracks |
| Line | `#2E323C` | Dividers, outlines |
| Text | `#F2EEE6` | Body text, warm white |
| Muted | `#9A9AA3` | Secondary text, locked items |
| **Orange** | `#FF6A1A` | Headings, the one accent per screen |
| **Yellow** | `#FFC531` | Current selection, the player's outline, `QUALIFIED` |
| Red | `#E5312B` | Money out, debt, low stamina, `WRECKED` |
| Green | `#5BD06A` | Money in, full stamina |
| Police blue | `#2F6BFF` | Cop warning, `BUSTED` (with red) |
| Cork | `#8A6A45` | The board |
| Paper | `#EDE4D0` | Notes, invoices, tickets |
| Polaroid | `#F7F3EA` | Photo frames |

Orange and yellow never sit on a light background. Orange is for what a thing is called; yellow is for where you are.

### Road

| Role         | Hex                    |
| ------------ | ---------------------- |
| Asphalt      | `#3A3C40`              |
| Worn patch   | `#4A4B4E`              |
| Centre line  | `#E8C23A`              |
| Edge line    | `#E9E6DF`              |
| Shoulder     | `#5E5A52`              |
| Gravel verge | `#8C7D5E`              |
| Chevron sign | `#FFC531` on `#15171B` |

Each region tints the asphalt slightly (below) but the centre and edge lines keep these values everywhere, so the road reads the same in every light.

### Region skies

| Region | Zenith | Horizon | Light |
| --- | --- | --- | --- |
| Salt Coast | `#3C7FCC` | `#CFE3EC` | Clear late morning, cool |
| Cinder Flats | `#4A8FD4` | `#F1D9B0` | High noon, dusty warm horizon |
| Kettle Woods | `#6F8FA6` | `#C9D3CF` | Overcast, soft, low contrast |
| Lowtown | `#3B3354` | `#E08A5C` | Smoggy dusk, sodium lamps on |
| Stonepeak | `#3F7FD6` | `#C9DBE8` | Bright mountain afternoon (today's sky) |

### Riders

Bike paint is the primary identifier; the jacket is the second. These twelve entries replace the current seven-colour `bikePaints` and `jacketColours` tables.

| Index | Rider | Bike | Jacket | Helmet |
| --: | --- | --- | --- | --- |
| 0 | Player (default) | `#C82F2F` | `#23262C` | `#F2C230` |
| 1 | Juno Kade | `#15171B` | `#15171B` | `#15171B`, gold stripe `#D4A63A` |
| 2 | Ruth Ann Bixby | `#26A6A0` | `#A8743E` | `#EDE4D0`, brim |
| 3 | Dee Santangelo | `#2F9A4E` | `#D7263D` | `#F2EEE6`, stickers |
| 4 | Ines Marchetti | `#F2ECDF` | `#F2ECDF` | `#FFFFFF`, veil |
| 5 | Mags Dunleavy | `#77806A` | `#3F4A57` | `#5B432E`, goggles |
| 6 | Lyle Gorski | `#22335C` | `#8A7A55` | `#22335C` |
| 7 | Tristan Lux | `#E040A0` | `#7B4FE0` | `#E040A0`, camera |
| 8 | Coach Dale Hutto | `#E0A21B` | `#1E5AA8` | `#F2EEE6`, visor |
| 9 | Moose Kowalczyk | `#C2521F` | `#5B4632` | `#2B2E33` |
| 10 | Gus Abernathy | `#6B6B3A` | `#C8E03A` | `#F2C230`, hard-hat shape |
| 11 | Police | `#F4F6F8` with `#2F6BFF` panels | `#141C33` | `#F4F6F8` |

The player can repaint their bike in the Garage from eight swatches that avoid the rivals' hues at close range: `#C82F2F`, `#F26B1D`, `#F2C230`, `#3FA34D`, `#2C8ED6`, `#5A4FCF`, `#B14FC9`, `#E9E6DF`.

## Typography

Three free faces, all under the SIL Open Font License, self-hosted as `woff2` so the page makes no font request to another origin.

| Role | Face | Use |
| --- | --- | --- |
| Display | **Saira Extra Condensed**, weights 700 and 800 | Screen headings, rider names, HUD numerals, buttons. Always capitals, tracking +0.02 em. |
| Body | **Inter**, weights 400 and 600 | Descriptions, rival lines, ledgers, small labels. Tabular numerals on for all money and times. |
| Outcome | **Big Shoulders Stencil Display**, weight 800 | Only the big outcome words: `WRECKED`, `BUSTED`, `BROKE`, `WINNER`, `FINISHED`, and the title wordmark. |

Scale at 1280 × 720, scaling with the shorter screen side: outcome words 120 px; headings 56 px; HUD speed and position 64 px; rider names 28 px; body 18 px on a 26 px line; labels 13 px capitals with +0.08 em tracking. Rival lines are set in Inter 600 at 22 px inside quotation marks, never in italics.

HUD numerals sit in fixed-width boxes, one per digit, so a changing speed does not shift the layout.

Handwriting on the board (Vic's notes, the marker on Polaroids) is drawn as part of the illustration, not set in a font.

## HUD style

- No dashboard, no bezel, no dials. Text and bars float directly over the road with a 2 px `#0E0F12` outline and a soft shadow so they hold up against sky and asphalt.
- Bars are flat rectangles with a 2 px `#0E0F12` border and square ends, 10 px tall for stamina and 6 px for bike condition. Stamina is green above 50, yellow to 25, red below. Bike condition is warm white `#F2EEE6` above 50, yellow to 25, red below. A bar changes colour at its threshold and holds that colour; it does not flash.
- Weapon hits are pips: small solid rectangles in `#F2EEE6`, hollow when spent.
- The rival tag is a `#17191F` plate at 85% opacity with the rival's bike colour as a 4 px left edge, their name in Saira, and their stamina bar. The speech tag is the same plate, wider, with the line in Inter.
- The cop warning alternates `#2F6BFF` and `#E5312B` at 2 Hz. Nothing else on the HUD blinks. The position numeral turns yellow `#FFC531` for half a second when it changes and then returns to warm white, as one steady change of colour.
- Notices are one or two words in Saira 800, yellow, centred at 30% of the screen height, on screen for 0.8 seconds, scaling from 110% to 100% as they appear.
- Layout, strings, and data sources are in `screens.md`.

## Riders and bikes

### Launch cast and bikes

Agreed October 23, 2026 (`game-design.md` section 0). The six launch celebrities are caricatures: the face and build exaggerated until the person is recognisable at a glance, drawn in the same two tones and ink lines as the rest of the world, never a likeness traced from a photo. Their outfits carry their memes. The bikes parody real makers' shapes under invented brands with no logos; the starter, mid-tier, and litre tiers map roughly onto the three silhouettes below, and the near-future prototypes at the top may break them. Heads, outfits, and landmark props are generated with Hunyuan3D or Hyper3D Rodin and finished in Blender to the budget below. The first test is the Ronaldo parody's head, which passes only if the owner recognises him at a glance.

### Budget and build

About 1,200 triangles for a bike, 500 for a car, and 20 to 200 for a prop. One material per bike, coloured by vertex colour and instance colour. Every rider shares one 53-joint skeleton and one set of poses, so every animation works on everyone, and draws as one skinned mesh.

A generic rider is one of three builds coloured through the material slots `suit`, `suit2`, `helmet` and `helmet2`, which the race tints with each rider's palette. A celebrity rider is painted instead. It has up to 31,500 triangles and one material shared by the body and the helmet, which is a separate mesh bound only to the head. That material samples one 1024 × 1024 sRGB albedo atlas through `TEXCOORD_0`. The atlas holds material colours and drawn ink only, with no baked light, normal map or face texture, because the renderer adds the cel bands, gloss, rim and outline. Every part of a celebrity paints from the atlas, and the loader refuses a rider that mixes atlas parts and colour slots.

Riders and bikes keep their own colours in every look; the world takes the look's tones. A rider's or a bike's lit band is its colour under the figure light, `FIGURE_LIGHT` in `cel.ts` (1.10, 0.97, 0.82, the dusk lit tone), scaled to the brightness of the look's lit tone, so a celebrity's lit flats match its sheet at night as at dusk. Lock a new atlas to the sheet against that light, as the measured method's palette lock already does: an atlas colour is the sheet colour divided by the figure light in linear RGB. The renderer makes the shadow band from the lit colour in OKLCH, the way the approved sheets draw it: lightness falls by the look's own shadow depth (the cube root of the ratio of the shadow tone's luminance to the lit tone's), chroma by that depth times 1.24, the sheets' ratio of chroma kept to lightness kept (0.93 to 0.75), and the hue turns 10° toward magenta (330°), the way the sheets' blue turns from 280° to 294° and their red from 24° to 13°. A shade that falls outside sRGB loses chroma, never hue. So a flat holds its hue within 15° from lit to shadow under every look, an ivory or silver flat stays neutral instead of turning purple, and the atlas needs no shade half and no second texture: generic riders' palette colours, every bike paint and trim, and any atlas get the rule with no manual step. Each colour is shaded from its own lit colour, so every bike model and paint keeps its own hue in shadow. Cars, vans and the world keep the look's coloured tones. `apps/web/test/rider-shade.ts` measures the rule; the verify recipe in `riding-and-fighting.md` says how to run it.

The Blender master and the PNG atlas stay with the art. Export the rider to `tools/blender/out/rider_<name>.glb`, then `node tools/blender/compress.ts` stages the shipped model, with the atlas as lossless WebP, into the art store, and `pnpm art:upload` publishes it (see [Game art](../architecture.md#game-art)). The art is flat colour with crisp ink, which lossless WebP keeps exactly and smaller than the alternatives. The pilot Kylie atlas was 81,840 B, against 97,225 B for its PNG master, 108 KB for WebP at quality 90 (43.7 dB), 105 KB for KTX2 ETC1S (38.4 dB) and 252 KB for KTX2 UASTC, and WebP needs no Basis transcoder. On the GPU an atlas decodes to RGBA8 with its mip chain, 5,592,404 B, about 4.9 MB more than an ETC1S atlas would take. No celebrity loads at boot: a race downloads and decodes the celebrities its riders wear, and the atlas leaves the GPU when the next race no longer shows that rider, so a plain race holds no atlas.

| Budget | Measured | Gate |
| --- | --- | --- |
| Kylie GLB with its atlas | 344,904 B, 21,887 triangles | `assets.glb.rider_kylie`, exact |
| Ronaldo GLB with its atlas | 316,580 B, 18,607 triangles | `assets.glb.rider_ronaldo`, exact |
| Mbappé GLB with its atlas | 236,968 B, 10,652 triangles | `assets.glb.rider_mbappe`, exact |
| Musk GLB with its atlas | 261,240 B, 10,550 triangles | `assets.glb.rider_musk`, exact |
| Altman GLB with its atlas | 347,996 B, 22,802 triangles | `assets.glb.rider_altman`, exact |
| Ranveer GLB with its atlas | 302,744 B, 29,816 triangles | `assets.glb.rider_ranveer`, exact |
| Texture memory of every shipped atlas | 33,554,424 B, six atlases | `assets.texture.total`, exact |
| Draw calls per rider | one skinned mesh, textured or not | `apps/web/test/renderer-lifecycle.test.ts` |
| Shader programs | the rider and bike rule adds none, because riders, bikes and traffic share the painted cel shader source and a per-material uniform picks the rule; a celebrity adds one, the painted cel material with a map, compiled in warm-up and shared by every celebrity on screen: the `?stress` race wearing all six has 44 programs and 84 textures, against 43 and 78 without | none, because the GPU lane's races wear no celebrity |

A new celebrity adds its own exact GLB row and raises `assets.texture.total` by one atlas, both from a build-lane baseline run.

### Rider silhouette

Heads are 15% larger than life and hands 20% larger, so a raised fist or weapon reads at distance. Shoulders are squared and the back is one clean plane, because the player looks at backs all race. Every rival has one feature that breaks the helmet-and-shoulders outline: the cast list in `game-design.md` names it for each.

The player's rider is the plainest in the field on purpose: charcoal jacket, yellow helmet, no attachment. The yellow helmet is the one constant anchor in the frame.

### Bike silhouettes by class

| Class | Shape | Tells |
| --- | --- | --- |
| Featherweight | Narrow, tall, exposed frame, round headlight, thin tyres, short tail. The rider sits upright and looks big on it. | Daylight visible through the frame. A single thin exhaust. |
| Middleweight | Half fairing, wedge profile, twin headlights, rider leaning forward. | A solid nose and an open engine. One wide exhaust. |
| Heavyweight | Full fairing, wide tank, fat rear tyre, long low tail. The rider is tucked and looks small on it. | No daylight through the body. Twin exhausts. |

The **Gutter Pup 250** breaks its class shape: mismatched wheels, a milk crate bolted to the tail, one mirror, a seat in the wrong colour, and a headlight held on with tape. It leans further than anything else (`visualLean` 0.46) and trails a thin line of smoke.

Makers have a visual habit each: Halden bikes have round lights and visible frames, Ostra bikes have sharp noses and a diagonal stripe, Brack bikes are boxy with square lights and oversized exhausts.

### Weapons

Each weapon is a distinct shape and colour so the player knows what a rival holds before reaching them: club (thick, tapered, wood `#6B4A2B`), chain (thin, sagging, steel `#8A9096`), crowbar (hooked, dark red `#7A1C1C`), baton (straight, black `#15161A`), pool cue (very long, pale wood `#D9B98A` with a blue tip `#2C8ED6`), stop sign (red octagon `#D7263D` on a grey pole, white border). Held weapons are carried upright or across the shoulder while riding, so they add to the silhouette.

## Regions

Each region is a kit: a ground treatment, a near prop set scattered by `scatterProps`, a far backdrop, and set pieces placed at the road's signature moments from `tracks.md`. The compiler today scatters trees, poles, and rocks for every road and stands chevrons before the bends a rider has to brake for; a `kit` field on `TrackPlan` selects the set below. The kits come after the first career release (`game-design.md` section 14). Until then every road uses today's scatter with its own palette, sky, and fog from this document.

For launch the regions become real cities: Madrid on Slag Row's road, Mumbai on Breakwater Run's, and the Bay Area on Ridge Road's (`game-design.md` section 0). Each needs a landmark kit of buildings and set pieces that parody the real ones rather than copy them. The region notes below describe the current build.

Every road is two lanes, one each way, with the same centre and edge lines. Regions differ in lane width, shoulder, verge, and what stands beside the road, not in lane count.

### Salt Coast (Breakwater Run)

Sea on the right for most of the road, low cliff or seawall on the left. Open, bright, and windy.

- **Ground.** Asphalt `#44474B`, pale and salt-bleached. Sand `#D9C79A`, dune grass `#7FA35A`, cliff rock `#B9A88C`, sea `#2B6F8F` with a lighter band `#5FA6BF` at the shore.
- **Near props.** Wind-bent cypress (replaces tree), wooden telegraph poles, low stone seawall segments, beach huts in `#E5503A`, `#F2C230`, and `#3FB8AF`, upturned rowing boats, lifebuoy posts, gull flocks as flat cards.
- **Far backdrop.** A headland, a lighthouse `#F2EEE6` with a red band, container ships as flat silhouettes on the horizon.
- **Set pieces.** The harbour start with moored boats. The tunnel through the headland: a dark concrete mouth, inside lit by a row of orange lamps `#FFB347`. The lighthouse at the kink. The pier at the finish with a striped pavilion.
- **Traffic.** Hatchbacks, a camper van, an ice cream van.

### Cinder Flats (Cinder Wash)

Flat, enormous, and empty, with a red mesa at the end. Heat and distance.

- **Ground.** Asphalt `#4B4640`, sun-baked and cracked at the edges. Sand `#C9925A`, dry lake bed `#E3CFA5`, mesa rock `#A8512E` with a darker band `#7C3A22`, scrub `#8C9A5B`.
- **Near props.** Saguaro-like cacti with one or two arms (replaces tree), tumbleweeds, leaning wooden fence posts with wire, dead tyres, a cow skull on a post, billboards faded to pastel, cattle grid rails.
- **Far backdrop.** Mesas in three flat layers fading to `#D8B48A`, a line of pylons, dust devils.
- **Set pieces.** The dead gas station at the start with a toppled sign. The three washes, each marked by a yellow "DIP" sign and a line of white stones; the third, the Main Wash, is the one that launches and gets a second sign and a bleached cattle skull on its lip. The mesa hairpin with a wall of red rock on the inside and a long drop on the outside. The drive-in cinema at the finish, its blank screen `#EDE4D0` facing the road and a teal neon arrow `#3FB8AF`.
- **Traffic.** Pickup trucks, a road train (the longest vehicle in the game), a dusty sedan.

### Kettle Woods (Hollow Pine Road)

A narrow road in a tall dark forest. The sky is a strip overhead and the next bend is always hidden.

- **Ground.** Asphalt `#33363A`, dark and damp, with a faint green edge. Forest floor `#3E4A2E`, fern `#4F7A3D`, bark `#5B432E`, pine `#2E4A33` with a lighter tip `#3F6A45`, fog `#AEBBB5`.
- **Near props.** Tall pines close to the verge (the 5 m verge puts them near the road), fern clumps, log piles, mossy boulders, yellow diamond warning signs `#E0A43A`, deer standing still at the tree line.
- **Far backdrop.** Layers of pine silhouettes fading into fog. No horizon line; the fog is the horizon.
- **Set pieces.** The ranger station at the start. A log truck parked at the Logjam Left. The covered bridge: a red timber tunnel `#8A2E24` with slatted light. The sawmill at the finish with a conical burner and stacked planks.
- **Traffic.** Log trucks, an old station wagon, a forestry pickup.
- **Light.** Fog shortens the draw distance to about 350 m, which helps the frame budget and hides the bends.

### Lowtown (Slag Row)

An industrial port at dusk: brick, steel, and orange light. Two lanes like every other road, and the most traffic of any. It feels broad because the buildings stand 6 m back and the straights are long, not because the road is wider: its 3.5 m lanes are narrower than Cinder Wash's.

- **Ground.** Asphalt `#2F3033` with lighter repair patches `#55585C`, tram rails set into the two lanes, and painted arrows. Kerbs `#8A8C90`, pavement `#6E6F73`, brick `#7A3B2E`, steel `#3A3F47`, canal water `#2C4A52`.
- **Near props.** Sodium streetlights `#FFB347` (replaces pole, with a warm pool of light on the road), brick warehouses with roller doors, shipping containers in `#B8432E`, `#2C6E8F`, and `#C99A2E`, chain-link fence, oil drums, traffic cones, bus shelters. Buildings replace trees: flat-roofed blocks set back 6 m from the road.
- **Far backdrop.** Gantry cranes, smokestacks with slow smoke, the freeway on stilts, a skyline of lit windows.
- **Set pieces.** The cranes over the start. The level crossing with striped barriers up and lights flashing. The underpass beneath the freeway (the Lowside's neon sign is visible on the left as you come out). The canal with moored barges. The drawbridge with its towers. The smelter gate at the finish, glowing orange inside.
- **Traffic.** Box vans, a city bus, taxis, a forklift that should not be on the road.

### Stonepeak (Ridge Road)

The existing road: a two-lane mountain road climbing through meadow and rock to a lookout.

- **Ground.** Asphalt `#3A3C40`. Grass `#6A9A3F` near and `#4C7A38` far, dry grass `#9AA84A`, gravel `#8C7D5E`, rock `#7D7F82`, far ridges `#9DB6CC`. These are today's values.
- **Near props.** Firs and broadleaf trees as now, timber poles, boulders, chevrons, plus steel guard rail on the outside of bends, snow poles, and a few cows behind a fence.
- **Far backdrop.** Two layers of blue ridges and one snow-capped peak.
- **Set pieces.** A stone bridge at the first climb. The quarry cut at Quarry Bend with grey terraces. The Saddle: bare rock both sides and nothing but sky ahead. The lookout at the finish with a car park, a coin telescope, and a view of every other region in the distance.
- **Traffic.** Sedans, a tour bus, a farm tractor at higher levels.

## Readability rules for crashes and fights

1. **A hit has three beats: wind-up, contact, reaction.** The wind-up is the arm or weapon raised clear of the body for at least 10 ticks (the fist's `strikeTick`), so a watchful player can react. Contact is one frame of white flash on the struck rider and a spark or dust puff at the point of impact. The reaction is the struck rider's body rocking away for the length of the hit stun.
2. **The attacking arm is always on the side of the target** and extends away from the body, never across it, so the silhouette changes.
3. **Weapons are visible before they are used.** A rider's weapon is on screen from the grid onward, and the HUD rival tag is the second source.
4. **Low stamina shows on the rider.** Below 25 stamina a rider slumps and wobbles slightly; the player can see who is one hit from falling without reading a bar.
5. **A knockdown separates two shapes.** The rider leaves the bike upward and away from the hit; the bike slides on its side with sparks. They never overlap after the first three frames.
6. **A downed rider stays readable.** The rider on the ground keeps their jacket colour, lies flat for the settle time, then stands. The run back is a full-height figure, upright, arms pumping. A yellow outline marks the player's own rider and bike while they are apart.
7. **The world slows only once.** A knockdown the player causes gets 150 ms at 60% speed in the render only (the simulation does not slow). Nothing else uses slow motion.
8. **Crash causes look different.** Traffic: the bike stops dead and the rider goes over the bars. Prop: the bike spins. Landing: both bounce. Combat: the rider goes sideways. Off-track: a long slide in a dust cloud.
9. **Damage shows on the bike.** Below 50 condition the bike smokes lightly; below 25 it smokes dark and the fairing is cracked. A wreck is a clear event: the bike breaks into three pieces and stays down.
10. **Police read at a distance.** White bike, blue panels, and a light bar that flashes blue and red at all times while pursuing. A roadblock cruiser's lights are visible from the full 250 m sightline that the placement rule in `tracks.md` guarantees.
11. **No gore.** Riders tumble, groan, and get up. The tone is slapstick.

## Camera rules

1. **Chase camera, behind and above.** The rider sits at the horizontal centre and in the lower third of the frame; the horizon sits in the upper third. The camera is high enough to see the road surface between the rider and the next bend, which is the current raised position.
2. **Speed opens the lens.** Field of view runs from 60° at rest to 76° at top speed, as now, and the camera drops back about a metre over that range.
3. **The camera follows the road, not the lean.** It yaws with the road's heading and shifts sideways with half the bike's lateral offset. It rolls at most 30% of the bike's visual lean.
4. **Crests are honest.** The camera does not rise to peek over a crest. What the rider cannot see, the player cannot see.
5. **In the air, the camera stays level** and lets the bike rise in the frame. On landing it dips by an amount scaled to the impact and recovers in 200 ms. This and the hit shake are scaled by the `REDUCE CAMERA SHAKE` setting.
6. **On a hit, a small shake.** 2 px for a fist, 4 px for a weapon, 100 ms, no rotation.
7. **Thrown: the camera follows the body, not the bike.** It pulls back to hold both the rider and the bike in frame while they are apart, and eases back behind the bike on remount.
8. **Finish: one move.** The camera swings 30° to the side and slows over 1.5 seconds.
9. **Never clip.** The camera stays above the road surface and outside tunnel walls; in the tunnel, covered bridge, and underpass it lowers by 0.4 m instead of pushing through the roof.

## Audio direction

All music is original and instrumental. Nothing is licensed and nothing imitates a named band. Music and effects have separate volume controls, and effects always sit above music in the mix: the player must hear an engine behind them and a siren ahead.

### Music

| Where | Style | Tempo | Lead |
| --- | --- | --: | --- |
| The Lowside (menus) | Slow bar-room groove, fuzz bass, brushed drums, a jukebox crackle underneath | 92 bpm | Baritone guitar |
| Salt Coast | Surf garage: tremolo-picked guitar, spring reverb, driving snare | 152 bpm | Twang guitar |
| Cinder Flats | Desert rock: one heavy riff, lots of space, a slide guitar that enters on the mesa | 128 bpm | Fuzz guitar, slide |
| Kettle Woods | Tense post-punk: tight bass line, dry drums, chiming guitar, minor key | 160 bpm | Bass |
| Lowtown | Industrial breakbeat: distorted bass, metal percussion, a factory-hooter stab | 140 bpm | Synth bass |
| Stonepeak | Grunge-weight rock: drop-tuned guitars, half-time drums that double for the last kilometre | 120 bpm | Rhythm guitar |
| Results | A 12-second sting in the region's style: major for qualified, a slump for not |  |  |

Each race track has three layers (drums and bass; rhythm; lead). The lead layer drops out when the player is off the bike and returns on remount. The last kilometre adds a fourth percussion layer. Tracks loop at about 90 seconds with a clean seam.

### Engines

The current synthesised engine is kept and given a character per class by its oscillator mix and pitch range.

| Class | Character | Idle to redline |
| --- | --- | --- |
| Featherweight | Buzzy and thin, a small twin. Square-heavy mix, quick to rev. | 70 to 290 Hz |
| Middleweight | A smooth four-cylinder whine. Today's sound. | 58 to 235 Hz |
| Heavyweight | A deep, uneven growl with a second voice a fifth below. Slow to rev, loud on the overrun. | 44 to 190 Hz |
| Gutter Pup | A rattly single with a random misfire every few seconds and a backfire when the throttle closes. | 62 to 210 Hz |

Rival engines pan and fade by position, so a bike coming up on the left is heard on the left before it is seen. Police engines are Middleweights with a two-tone siren (today's 660 and 880 Hz) that starts when a pursuit starts.

### Hits, crashes, and voices

- **Strikes.** A whoosh on the wind-up and a distinct contact per weapon: fist (dull thud), boot (heavier thud with a scrape), club (wooden knock), chain (rattle and slap), crowbar (metal clang), baton (sharp crack), pool cue (a light tock, and a splintering snap when it breaks), stop sign (a loud sheet-metal gong, the most satisfying sound in the game).
- **Grunts.** Short wordless voice sounds, three effort grunts and three pain grunts per voice type, with five voice types shared across the cast. No recorded dialogue; rival lines are text.
- **Knockdown.** Tyre chirp, a scrape of metal on road with sparks, a body thud, then a second of ringing quiet in the music's lead layer.
- **Crash by cause.** Traffic: a crunch and a car horn that holds. Prop: a wooden or metal knock by prop type. Landing: a suspension bottom-out. Off-track: gravel hiss.
- **Remount.** A grunt, a kick, and the engine catching. This cue tells the player they have control again.
- **World.** Wind that rises with speed; a doppler pass for each oncoming car; tunnel and underpass reverb on the player's own engine; gulls on the coast, cicadas in the desert, a rail crossing bell in Lowtown, a cowbell on the Ridge.
- **Interface.** Menu moves are a soft cork tap, confirm is a rubber stamp, money in is a cash-drawer ring, money out is paper tearing.
