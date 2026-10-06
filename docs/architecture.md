# Rushline architecture

Agreed October 6, 2026. This replaces the first prototype, a server-driven lane model with sprite riders. That code is kept in commit `2ba657f`.

## Product

An original motorcycle combat racer for desktop browsers, in the spirit of the mid-1990s Road Rash games: fast point-to-point road races, oncoming traffic, fights between riders, and crashes that throw you off the bike. Single-player comes first. The name, tracks, bikes, riders, art, and audio are our own; RUSHLINE is the working title. "Road Rash" is an Electronic Arts trademark and nothing of theirs is used.

The art direction is stylized low-poly. It stays consistent across generated and hand-made models and keeps the download small for a free, ad-funded web game.

## Platform

| Concern | Choice |
| --- | --- |
| Infrastructure as code | Alchemy v2, pinned to the same preview build as Faceless |
| Web app | TanStack Start on Cloudflare Workers, shadcn components in `packages/ui` |
| Rendering | Three.js on WebGL 2 |
| Simulation | Plain TypeScript in `packages/sim`, fixed 60 Hz, running in the browser |
| Server runtime | Effect 4.0.0 on Workers, when a server feature exists |
| Multiplayer (later) | One Durable Object per race running the same simulation |
| Tooling | pnpm, TypeScript 7, Oxlint with the anti-slop rules, Oxfmt through Ultracite, Vitest |

There is no API Worker or database yet, because nothing needs one. Leaderboards, accounts, and multiplayer bring them back.

## Riding model

`packages/sim` owns every rule. It has no DOM, Three.js, clock, or unseeded randomness, so the same inputs always produce the same race. State is plain data that `stepRace` advances by exactly 1/60 second.

A rider lives in track space: distance along the road `s`, lateral offset `x` in metres, speed, heading relative to the road, and lean angle. The bike is not a rigid body. The model is the smallest one that produces the behaviour we want:

- **Steering is leaning.** Input sets a wanted yaw rate. The bike rolls toward the lean that produces it at a limited rate, and the actual yaw rate comes from the lean (`g · tan(lean) / speed`). Changing direction takes time and carries after release.
- **Curves push you out.** The road turns under the bike at `curvature · speed`. A rider who does nothing drifts to the outside, and every bend has a speed above which full lean cannot hold it.
- **Grip is a budget.** Lean and braking share one traction circle. Grass has less than half the grip of asphalt and heavy drag.
- **Hills matter.** Grade speeds you up or slows you down. Vertical curvature changes the load on the tyres, so a crest goes light, and above about 170 km/h the big crest launches the bike.
- **Crashes separate rider and bike.** A hard hit throws the rider, who tumbles, runs back to the bike, and remounts. A light side contact with a car only costs speed.

`BikeSpec` holds the numbers for one bike: power, drag, brakes, maximum lean, lean rate, and the two steering assists. Faster bikes are new specs, not new code.

`pilotInput` is the AI rider. It brakes for bends from the same physics, picks a lane around traffic, and drives the title screen today. Rival riders build on it.

## Tracks

`packages/track` compiles a `TrackPlan` into a `Track`. A plan is a list of sections, each with a length, a total turn in degrees, and a climb in metres. Compilation eases curvature and height through each section, samples the centre line every metre, and scatters trees, poles, rocks, and chevron signs from the plan's seed. The simulation and the renderer read the same compiled track.

Ridge Road is the first track: 4.25 km, two lanes, eleven bends, and two crests.

## Browser client

`apps/web/src/game` builds the world from the compiled track: chunked road and terrain meshes, instanced scenery and traffic, a chase camera, and synthesized audio. The loop steps the simulation at 60 Hz and draws interpolated poses at the display's refresh rate. A governor lowers the render resolution when frames run slow.

React renders menus and the HUD only. The game is loaded with a dynamic import after the page is interactive, and it reports HUD values at 15 Hz.

The target is 60 frames per second on an integrated-graphics laptop.

## Build order

| Step | Delivers | Status |
| --- | --- | --- |
| 1 | Faceless-style workspace | Done |
| 2 | Riding greybox: physics, Ridge Road, traffic, crashes, AI pilot, placeholder models, audio | In progress |
| 3 | Combat, weapons, a pack of rival riders, police |  |
| 4 | Art: rigged bike and rider, vehicles, environment kit |  |
| 5 | Career: more tracks, levels, money, bike shop, characters, story |  |
| 6 | Multiplayer on the same simulation, then ads |  |

Step 2 is finished when a person riding Ridge Road alone wants another run. That is a play test, not an automated one.

Blender is needed from step 4, for mesh cleanup, rigging, and GLB export. Base meshes come from a 3D generation model or bought assets.

## Local development

`pnpm dev` runs `alchemy dev` with local state in `.alchemy/` and needs no Cloudflare account. The web app is at `http://localhost:1350`.

Alchemy is installed from its preview registry at `main` commit `e354a455`, because the latest npm beta does not support Effect 4.0.0. `pnpm-workspace.yaml` disables `blockExoticSubdeps` for its sibling tarballs. Move back to an npm release when one supports Effect 4.0.0.
