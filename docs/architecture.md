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

A rider lives in track space: distance along the road `s`, lateral offset `x` in metres, speed, and lateral speed. The bike is not a rigid body. The model is the smallest one that produces the behaviour we want, and it steers the way the Road Rash games did:

- **Steering is direct.** Holding left or right moves the bike sideways at up to about 9 m/s, so a lane change takes half a second. Lateral speed follows the key with a short response, so releasing stops the bike within about half a metre. The lean is only a visual tilt that follows the lateral motion.
- **Curves push you out.** A bend drifts the bike outward at `curvature · speed² / curvePush`. A rider who does nothing ends up on the grass, and every bend has a speed above which full steer cannot hold it.
- **Grass is slow.** Off the road the bike has less steering authority and heavy drag.
- **Hills matter.** Grade speeds you up or slows you down. Vertical curvature changes the load on the tyres, so a crest goes light, and above about 170 km/h the big crest launches the bike.
- **Crashes separate rider and bike.** A hard hit throws the rider, who tumbles, lies still, gets up, runs back to the bike, lifts it, and remounts. A light side contact with a car only costs speed.

`BikeSpec` holds the numbers for one bike: power, drag, brakes, lateral speed, steering response, curve push, and visual lean. Faster bikes are new specs, not new code.

`pilotInput` is the AI rider. It brakes for bends from the same physics, picks a lane around traffic and other riders, and throws punches and kicks at a rate set by its profile's aggression. An unarmed rider next to an armed one prefers to kick. The same code drives the title screen, the five rivals, and the police. Its dice live in `RaceState`, so a race replays the same way whatever ran before it.

Combat lives in `combat.ts`. A punch or kick lands on the nearest rider on the chosen side within about two metres, drains stamina, shoves them sideways, and stuns their steering briefly. A rider whose stamina reaches zero is thrown. Rider-to-rider contact shoves both bikes apart, and a hard rear-end throws the rider behind. Remounting restores stamina to 55.

Weapons are numbers in `weapons.ts`, the same way handling is a `BikeSpec`. A rider holding one swings it when they press punch; kick stays a kick. Each strike has damage, shove, reach, timing, and a number of hits before the weapon breaks:

| Strike  | Damage | Shove | Reach (along × across) | Hits |
| ------- | ------ | ----- | ---------------------- | ---- |
| Fist    | 14     | 1.6   | 1.9 × 2.2 m            |      |
| Boot    | 22     | 3.2   | 1.9 × 2.2 m            |      |
| Club    | 28     | 3.8   | 2.2 × 2.6 m            | 6    |
| Chain   | 20     | 2.2   | 2.6 × 3.1 m            | 8    |
| Crowbar | 22     | 2.8   | 2.2 × 2.6 m            | 4    |
| Baton   | 18     | 2.4   | 2.2 × 2.6 m            | 12   |

A kick that lands on an armed rider hands the weapon to the kicker if the kicker is unarmed. A thrown rider drops whatever they hold. Viper starts with a chain, Bruiser with a club, and Ratchet with a crowbar; the player starts with nothing.

Police are riders with the `police` role, so riding, contacts, combat, and the renderer treat them like anyone else. `createRace` places them on the road ahead of the grid, 700 m and then every 1.6 km, cruising at 22 m/s. `police.ts` decides whom a cop chases: a downed racer whose body is within 60 m ahead comes first, then the nearest racer riding within 40 m, who is kept until they are 120 m away. The pilot rides alongside a riding target at up to 54 m/s, below a racer's top speed, and swings its baton. A racer who is off the bike (thrown, running back, or lifting it) when a riding cop comes within 2.5 m of their body is busted. Their race ends with a $1,500 fine, and standings put busted riders after everyone still racing. The busted rider and bike are moved onto the verge and traffic stops braking for them, so a bust never blocks the road. A cop near the end of the track pulls onto the verge for the same reason. A cop who is knocked down remounts with a fresh baton. Police are not in the standings and cannot finish.

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
| 2 | Riding greybox: physics, Ridge Road, traffic, crashes, AI pilot, placeholder models, audio | Done |
| 3 | Combat, weapons, a pack of rival riders, police | Done |
| 4 | Art: rigged bike and rider, vehicles, environment kit |  |
| 5 | Career: more tracks, levels, money, bike shop, characters, story |  |
| 6 | Multiplayer on the same simulation, then ads |  |

Step 2 is finished when a person riding Ridge Road alone wants another run. That is a play test, not an automated one.

Blender is needed from step 4, for mesh cleanup, rigging, and GLB export. Base meshes come from a 3D generation model or bought assets.

## Local development

`pnpm dev` runs `alchemy dev` with local state in `.alchemy/` and needs no Cloudflare account. The web app is at `http://localhost:1350`.

Alchemy is installed from its preview registry at `main` commit `e354a455`, because the latest npm beta does not support Effect 4.0.0. `pnpm-workspace.yaml` disables `blockExoticSubdeps` for its sibling tarballs. Move back to an npm release when one supports Effect 4.0.0.
