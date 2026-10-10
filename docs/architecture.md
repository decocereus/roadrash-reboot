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

- **Steering is direct.** Holding left or right moves the bike sideways at up to about 9 m/s, so a lane change takes half a second. Lateral speed follows the key with a short response, so releasing stops the bike within about half a metre. The lean is only a visual tilt that follows the lateral motion. Steering authority fades below 12 m/s, but a bike under throttle steers as if it were doing at least 3 m/s, so a rider held at a standstill can still steer out.
- **Curves push you out.** A bend drifts the bike outward at `curvature · speed² / curvePush`. A rider who does nothing ends up on the grass, and every bend has a speed above which full steer cannot hold it. Sideways slip uses up tyre grip that braking would otherwise get, but braking always keeps at least 35% of the grip, so the brakes never vanish in a bend.
- **Grass is slow.** Off the road the bike has heavy drag, less grip, and 80% of its steering authority. Grip and steering fade to the grass values over the first 0.75 m past the edge, so running wide is a slope, not a wall. A hit stuns steering to 65% for a sixth of a second, so a rider punched onto the grass can still fight back to the road.
- **Hills matter.** Grade speeds you up or slows you down. Vertical curvature changes the load on the tyres, so a crest goes light, and above about 170 km/h the big crest launches the bike.
- **Crashes separate rider and bike, and wear the bike out.** A hard hit throws the rider, who tumbles, lies still, gets up, runs back to the bike, lifts it, and remounts. Each crash also takes condition off the bike, which starts at 100: 35 for traffic, 30 for a tree or pole, 25 for a hard landing, 15 for running into another rider, and 10 for a knockdown or leaving the track, scaled by the speed at impact over 40 m/s and held between half and one and a half times. At zero the bike is wrecked: the rider and bike slide to a stop as in any crash, are then moved onto the verge where traffic ignores them, and that rider's race is over with no fine. Three hard crashes into traffic wreck a bike. Police bikes and riders who have already finished take no damage. A light side contact with a car only costs speed. A gentle bump into the nose of a car that is stopped or coming the other way leaves the bike up to 3 m/s and slides it sideways round the bumper at 3 m/s, towards the side the rider is steering or else the nearer side, so the bike and the car never hold each other still.

`BikeSpec` holds the numbers for one bike: power, drag, brakes, lateral speed, steering response, curve push, and visual lean, with its class and price. Each rider carries their own (`RiderState.bike`), so the riding step, the pilot's corner speeds, and the lean the renderer draws all come from the bike that rider is on. `bikes.ts` has the nine bikes of the catalogue in `docs/design/game-design.md`, keyed by id. The Ostra Sesta 600 is the reference: it is exported as `streetBike`, and the tests that pin the feel ride it. Its `curvePush` of 2.1 and `steerResponse` of 20 are the values the feel was tuned on; the design table lists 2.00 and 16, and the other eight bikes use the table as written. Faster bikes are new specs, not new code.

`pilotInput` is the AI rider. It brakes for bends from the same physics, picks a lane around traffic and other riders, and throws punches and kicks at a rate set by its profile's aggression. It judges a swing by the reach of the weapon in its hand and a kick by the reach of the boot, so a chain holder attacks from further across than a rider with fists. An unarmed rider next to an armed one prefers to kick. A rival can hold a grudge against one rider: when that rider is in reach the pilot goes for them instead of anyone nearer, on their side, and adds the grudge's boost to its aggression. The pilot rides round downed riders and ignores wrecked ones. The same code drives the title screen, the rivals, and the police. Its dice live in `RaceState`, so a race replays the same way whatever ran before it.

Combat lives in `combat.ts`. A punch or kick lands on the nearest rider on the chosen side within about two metres, drains stamina, shoves them sideways, and stuns their steering briefly. A rider whose stamina reaches zero is thrown. Strikes that come due on the same tick are all aimed before any of them lands, so two riders who swing at each other both connect. Cooldown and stun timers tick down before any strike lands, and every strike lands before any rider starts a new swing, so both are stunned for the same ten ticks and nobody starts a swing on the tick they were hit. Every rider remembers who last hit or touched them and when. A `crash` event carries `by`: that rider if it was within the last 60 ticks, otherwise −1, so a rider punched into a car is put down to the puncher. Rider-to-rider contact shoves both bikes apart, and a hard rear-end throws the rider behind, once per tick at most, and leaves them behind the bike they hit. Every pair in contact is read from the positions and speeds the riders had when the contact step began, and the pushes are added up before any is applied, so a three-bike pileup comes out the same whichever rider is listed first. A rider who runs hard into two bikes at once is thrown off the nearer one, and both of them are shunted forward. Traffic cars follow each other from the previous tick's positions. A car that has stopped for a rider stays stopped until the rider is out of its way; it does not creep forward. Remounting restores stamina to 55.

Weapons are numbers in `weapons.ts`, the same way handling is a `BikeSpec`. A rider holding one swings it when they press punch; kick stays a kick. Each strike has damage, shove, reach, timing, and a number of hits before the weapon breaks:

| Strike  | Damage | Shove | Reach (along × across) | Hits |
| ------- | ------ | ----- | ---------------------- | ---- |
| Fist    | 14     | 1.6   | 1.9 × 2.2 m            |      |
| Boot    | 22     | 3.2   | 1.9 × 2.2 m            |      |
| Club    | 28     | 3.8   | 2.2 × 2.6 m            | 6    |
| Chain   | 20     | 2.2   | 2.6 × 3.1 m            | 8    |
| Crowbar | 22     | 2.8   | 2.2 × 2.6 m            | 4    |
| Baton   | 18     | 2.4   | 2.2 × 2.6 m            | 12   |
| Cue     | 24     | 3.0   | 2.6 × 3.1 m            | 5    |
| Sign    | 30     | 4.2   | 2.2 × 2.6 m            | 3    |

The pool cue reaches as far as the chain and swings fastest. The stop sign is the biggest and slowest hit, and a rider holding it has 85% of their bike's steering response.

A kick that lands on an armed rider hands the weapon to the kicker if the kicker is unarmed. Who was armed is read when the strikes are aimed, so two riders who kick each other on the same tick end the same way whichever is listed first: the unarmed one takes the weapon and keeps it. A swing that lands on that tick still costs the weapon a hit, and if two unarmed riders kick the same holder the nearer one gets it. A thrown rider drops whatever they hold. Rivals start with the weapon in their profile and a full count of hits. The player starts with the weapon and the hits left that the race setup carries over from the last race.

Police are riders with the `police` role, so riding, contacts, combat, and the renderer treat them like anyone else. How many there are, how fast they chase, how far they see, and what a bust costs come from the race setup. `createRace` parks them on the verge, 1.1 m beyond the road edge, 700 m from the start and then every 1.6 km. A parked cop sits still until a racer is alongside it or up to 35 m ahead of it, then pulls out, so the pack meets the first cop about twenty seconds into a race instead of chasing a patrol it may never catch. A cop that has pulled out and has nobody to chase patrols at 22 m/s. `police.ts` decides whom a cop chases: a downed racer whose body is within 60 m ahead comes first, then the nearest racer riding within the sight range, who is kept until they are 120 m away. The pilot rides alongside a riding target at up to the pursuit top speed, which a level sets below the top speed of the bikes raced there, and swings its baton. A chasing cop picks its lane around traffic the way a racer does, at the speed the chase calls for. It leaves that lane for the spot 1.5 m beside its quarry only when it is within 20 m of them and no car threatens that line, and for a downed rider's body only when no car nearer than the body does. A pilot gives a car that drives the other way its longer warning even when that car has stopped. A racer who is off the bike (thrown, running back, or lifting it) when a riding cop comes within 2.5 m of their body is busted. Their race ends with the setup's fine, and standings put busted and wrecked riders after everyone still racing, ordered by how far they got. The busted rider and bike are moved onto the verge and traffic stops braking for them, so a bust never blocks the road. A cop within 80 m of the end of the track pulls onto the verge for the same reason: it crawls at 6 m/s until the bike is clear of the road edge and only then stops, because a bike that brakes to a halt first has no steering left to leave the lane with. A cop who is knocked down remounts with a fresh baton. Police are not in the standings and cannot finish.

## Race setup and cast

`createRace` takes a `RaceSetup`: the track and seed, the player (a profile, a bike, and the weapon and hits they carry in), the rivals for this race (each a profile and a bike, with an optional `grudge` rider index and `aggressionBoost`), the police settings (count, pursuit top speed, sight range, fine, the officer's profile, and the bike they ride), and the grid order. Rider 0 is always the player, the rivals follow in the order given, and the police come last; a grudge index counts in that order. With `playerLast` the rivals fill the grid two to a row and the player has a row to themselves behind them. With `playerFirst` the player is on the front row.

`defaultSetup(track, seed)` is the race the tests and the title screen use: the player on the Sesta, five rivals on their level-3 bikes, one cop at 54 m/s with a 40 m sight range and a $1,500 fine, and the player last on the grid.

`cast.ts` holds the ten rivals and the two officers from the design: name, skill, aggression, home region, the weapon they carry and the level they carry it from, a bike for each of the five levels, and their colours. `rivalAt(rival, level)` turns one into a setup entry. From level 4 an unarmed rival with aggression of 0.5 or more starts with a club. Their lines, the field draw, and everything else about the career are not in the simulation yet.

A profile's `paint` and `jacket` are indices into the twelve entries of `palette.ts`, which gives the bike, jacket, and helmet colour for each rider and a trim colour where there is one: the gold stripe on Juno Kade and the blue panels on the white police bikes.

## Tracks

`packages/track` compiles a `TrackPlan` into a `Track`. A plan is a list of sections, each with a length, a total turn in degrees, and a climb in metres. Compilation eases curvature and height through each section, samples the centre line every metre, and scatters trees, poles, rocks, and chevron signs from the plan's seed. The simulation and the renderer read the same compiled track.

Ridge Road is the first track: 4.25 km, two lanes, eleven bends, and two crests.

## Browser client

`apps/web/src/game` builds the world from the compiled track: chunked road and terrain meshes, instanced scenery and traffic, a chase camera, and synthesized audio. The loop steps the simulation at 60 Hz and draws interpolated poses at the display's refresh rate. A governor lowers the render resolution when frames run slow.

React renders menus and the HUD only. The game is loaded with a dynamic import after the page is interactive, and it reports HUD values at 15 Hz. Besides speed, place, and stamina these are the bike's name and condition, the distance to the nearest cop chasing the player, and the distance left to the finish.

The target is 60 frames per second on an integrated-graphics laptop.

## Build order

| Step | Delivers | Status |
| --- | --- | --- |
| 1 | Faceless-style workspace | Done |
| 2 | Riding greybox: physics, Ridge Road, traffic, crashes, AI pilot, placeholder models, audio | Done |
| 3 | Combat, weapons, a pack of rival riders, police | Done |
| 4 | Art: rigged bike and rider, vehicles, environment kit |  |
| 5 | Career: more tracks, levels, money, bike shop, characters, story | In progress: the simulation has the bikes, the cast, race setups, condition and wrecks, the two new weapons, and grudges. Career state, the roads, and the screens are next. |
| 6 | Multiplayer on the same simulation, then ads |  |

Step 2 is finished when a person riding Ridge Road alone wants another run. That is a play test, not an automated one.

Blender is needed from step 4, for mesh cleanup, rigging, and GLB export. Base meshes come from a 3D generation model or bought assets.

## Local development

`pnpm dev` runs `alchemy dev` with local state in `.alchemy/` and needs no Cloudflare account. The web app is at `http://localhost:1350`.

Alchemy is installed from its preview registry at `main` commit `e354a455`, because the latest npm beta does not support Effect 4.0.0. `pnpm-workspace.yaml` disables `blockExoticSubdeps` for its sibling tarballs. Move back to an npm release when one supports Effect 4.0.0.
