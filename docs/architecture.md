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

`BikeSpec` holds the numbers for one bike: power, drag, brakes, lateral speed, steering response, curve push, and visual lean, with its class and price. Each rider carries their own (`RiderState.bike`), so the riding step, the pilot's corner speeds, and the lean the renderer draws all come from the bike that rider is on. `bikes.ts` has the nine bikes of the catalogue in `docs/design/game-design.md`, keyed by id. The Ostra Sesta 600 is the reference: it is exported as `streetBike`, and the tests that pin the feel ride it. Its `curvePush` of 2.1 and `steerResponse` of 20 are the values the feel was tuned on, and the other eight bikes use the revised design table, which is scaled to them. Faster bikes are new specs, not new code.

`pilotInput` is the AI rider. It brakes for bends from the same physics, picks a lane around traffic and other riders, and throws punches and kicks at a rate set by its profile's aggression. It judges a swing by the reach of the weapon in its hand and a kick by the reach of the boot, so a chain holder attacks from further across than a rider with fists. An unarmed rider next to an armed one prefers to kick. A rival can hold a grudge against one rider: when that rider is in reach the pilot goes for them instead of anyone nearer, on their side. A rival can also carry an `aggressionBoost` toward the player, rider 0. The pilot adds it to the rival's aggression whenever the rider it would strike is the player, with or without a grudge, so a boost above zero means more attacks on the player and one below zero means fewer. Toward everyone else the rival keeps its profile's aggression. The pilot rides round downed riders and ignores wrecked ones. The same code drives the title screen, the rivals, and the police. Its dice live in `RaceState`, so a race replays the same way whatever ran before it.

Combat lives in `combat.ts`. A punch or kick lands on the nearest rider on the chosen side within about two metres, drains stamina, shoves them sideways, and stuns their steering briefly. A rider whose stamina reaches zero is thrown. Strikes that come due on the same tick are all aimed before any of them lands, so two riders who swing at each other both connect. Cooldown and stun timers tick down before any strike lands, and every strike lands before any rider starts a new swing, so both are stunned for the same ten ticks and nobody starts a swing on the tick they were hit. Every rider remembers who last hit or touched them and when. A `crash` event carries `by`: that rider if it was within the last 60 ticks, otherwise −1, so a rider punched into a car is put down to the puncher. Rider-to-rider contact shoves both bikes apart, and a hard rear-end throws the rider behind, once per tick at most, and leaves them behind the bike they hit. The condition it costs and the speed on its `crash` event come from the speed the rider had at impact, not from the bike they ran into. Every pair in contact is read from the positions and speeds the riders had when the contact step began, and the pushes are added up before any is applied, so a three-bike pileup comes out the same whichever rider is listed first. A rider who runs hard into two bikes at once is thrown off the nearer one, and both of them are shunted forward. Traffic cars follow each other from the previous tick's positions. A car that has stopped for a rider stays stopped until the rider is out of its way; it does not creep forward. Remounting restores stamina to 55.

Weapons are numbers in `weapons.ts`, the same way handling is a `BikeSpec`. A rider holding one swings it when they press punch; kick stays a kick. Each strike has damage, shove, reach, timing, and a number of hits before the weapon breaks:

| Strike  | Damage | Shove | Reach (along × across) | Hits |
| ------- | ------ | ----- | ---------------------- | ---- |
| Fist    | 14     | 1.6   | 1.9 × 2.2 m            |      |
| Boot    | 22     | 3.2   | 1.9 × 2.2 m            |      |
| Club    | 28     | 3.8   | 2.2 × 2.6 m            | 6    |
| Chain   | 20     | 2.2   | 2.6 × 3.1 m            | 8    |
| Crowbar | 22     | 2.8   | 2.2 × 2.6 m            | 4    |
| Baton   | 18     | 2.4   | 2.2 × 2.6 m            | 12   |
| Cue     | 15     | 1.8   | 3.0 × 3.4 m            | 3    |
| Sign    | 32     | 4.6   | 2.4 × 2.8 m            | 3    |

The pool cue has the longest reach, 3.4 m across against the chain's 3.1 m, which is still short of a lane width. It swings again soonest and snaps after three hits. The stop sign is the biggest hit and the slowest to come round again, 66 ticks against the club's 40, and a rider holding it has 85% of their bike's steering response.

`strikeTick` counts the ticks left in the swing when the hit lands, so a strike lands `ticks − strikeTick` ticks after the press. The stop sign's swing is 42 ticks with a `strikeTick` of 12, so it lands 30 ticks after the press, the half-second wind-up the design asks for, and follows through for 12.

A kick that lands on an armed rider hands the weapon to the kicker if the kicker is unarmed. Who was armed is read when the strikes are aimed, so two riders who kick each other on the same tick end the same way whichever is listed first: the unarmed one takes the weapon and keeps it. A swing that lands on that tick still costs the weapon a hit, and if two unarmed riders kick the same holder the nearer one gets it. A thrown rider drops whatever they hold. Rivals start with the weapon in their profile and a full count of hits. The player starts with the weapon and the hits left that the race setup carries over from the last race.

Police are riders with the `police` role, so riding, contacts, combat, and the renderer treat them like anyone else. How many there are, how fast they chase, how far they see, and what a bust costs come from the race setup. `createRace` parks them on the verge, 1.1 m beyond the road edge, 700 m from the start and then every 1.6 km. A parked cop sits still until a racer is alongside it or up to 35 m ahead of it, then pulls out, so the pack meets the first cop about twenty seconds into a race instead of chasing a patrol it may never catch. A cop that has pulled out and has nobody to chase patrols at 22 m/s. `police.ts` decides whom a cop chases: a downed racer whose body is within 60 m ahead comes first, then the nearest racer riding within the sight range, who is kept until they are 120 m away. The pilot rides alongside a riding target at up to the pursuit top speed, which a level sets below the top speed of the bikes raced there, and swings its baton. It rides to a downed rider's body no faster than that speed either. A chasing cop picks its lane around traffic the way a racer does, at the speed the chase calls for. It leaves that lane for the spot 1.5 m beside its quarry only when it is within 20 m of them and no car threatens that line, and for a downed rider's body only when no car nearer than the body does. A pilot gives a car that drives the other way its longer warning even when that car has stopped. A racer who is off the bike (thrown, running back, or lifting it) when a riding cop comes within 2.5 m of their body is busted. Their race ends with the setup's fine, and standings put busted and wrecked riders after everyone still racing, ordered by how far they got. A thrown rider drops their weapon at once, so each rider keeps `weaponAtThrow`, the weapon they held when they were last thrown. The `busted` event carries the body's `s` and `x` at the moment of the arrest and that weapon, all read before the rider is moved. The busted rider and bike are moved onto the verge and traffic stops braking for them, so a bust never blocks the road. A cop within 80 m of the end of the track pulls onto the verge for the same reason: it crawls at 6 m/s until the bike is clear of the road edge and only then stops, because a bike that brakes to a halt first has no steering left to leave the lane with. A cop who is knocked down remounts with a fresh baton. Police are not in the standings and cannot finish.

## Race setup and cast

`createRace` takes a `RaceSetup`: the track and seed, the player (a profile, a bike, and the weapon and hits they carry in), the rivals for this race (each a profile and a bike, with an optional `grudge` rider index and an optional `aggressionBoost` toward the player), the police settings (count, pursuit top speed, sight range, fine, the officer's profile, and the bike they ride), and the grid order. Rider 0 is always the player, the rivals follow in the order given, and the police come last; a grudge index counts in that order. With `playerLast` the rivals fill the grid two to a row and the player has a row to themselves behind them. With `playerFirst` the player is on the front row.

`validateSetup(setup)` returns a list of typed problems: more than seven rivals, a rival listed twice, or an entrant with no bike. `createRace` calls it and throws one error carrying every message, so a caller at a boundary validates first.

`defaultSetup(track, seed)` is the race the tests and the title screen use: the player on the Sesta, five rivals on their level-3 bikes, one cop at 54 m/s with a 40 m sight range and a $1,500 fine, and the player last on the grid.

`cast.ts` holds the ten rivals and the two officers from the design: name, skill, aggression, home region, the weapon they carry and the level they carry it from, a bike for each of the five levels, and their colours. `rivalAt(rival, level)` turns one into a setup entry. From level 4 an unarmed rival with aggression of 0.5 or more starts with a club. Their lines, the field draw, and everything else about the career live in `packages/career`.

A profile's `paint` and `jacket` are indices into the twelve entries of `palette.ts`, which gives the bike, jacket, and helmet colour for each rider and a trim colour where there is one: the gold stripe on Juno Kade and the blue panels on the white police bikes.

## Tracks

`packages/track` compiles a `TrackPlan` into a `Track`. A plan is a list of sections, each with a length, a total turn in degrees, and a climb in metres, plus its region, its level, its traffic per kilometre, and the positions where a roadblock may stand. Compilation eases curvature and height through each section, samples the centre line every metre, and scatters trees, poles, rocks, and chevron signs from the plan's seed. The simulation and the renderer read the same compiled track.

There are five roads, one per region, each two lanes. `docs/design/tracks.md` has their sections and the reasoning.

| Road | id | Region | Level 1 | Level 5 | Lowest launch |
| --- | --- | --- | --: | --: | --: |
| Breakwater Run | `breakwater-run` | Salt Coast | 3,900 m | 8,500 m | 169 km/h |
| Cinder Wash | `cinder-wash` | Cinder Flats | 4,400 m | 9,000 m | 154 km/h, the Main Wash |
| Hollow Pine Road | `hollow-pine-road` | Kettle Woods | 3,600 m | 8,200 m | 162 km/h, at level 5 |
| Slag Row | `slag-row` | Lowtown | 4,000 m | 8,600 m | 152 km/h, the rail crossing |
| Ridge Road | `ridge-road` | Stonepeak | 4,250 m | 8,850 m | 162 km/h, the Saddle |

A road file in `tracks/` exports its level-1 plan, the four blocks of sections that levels 2 to 5 append, and a `Road` that ties them to the road's roadblock spots. `roadAtLevel(road, level)` builds a level's plan: the level-1 sections followed by the blocks up to that level, 1,150 m more road each time, one more car per kilometre, the id `slag-row-3`, and the same seed. `roadblocks` lists the spots that exist on the road at that level and is empty below level 3. A level can list more spots than it uses, and nothing in the simulation reads them yet.

`roads.ts` is the registry: `roads`, `roadIds` in career order, `regionOf(roadId)`, and `trackFor(roadId, level)`, which compiles each road and level once and returns the same `Track` afterwards.

`regions.ts` holds each region's look as data: sky zenith and horizon, asphalt, three ground colours, backdrop, sunlight and skylight, fog range, and a prop mix. The prop mix weights trees, poles, rocks, and chevrons in the scatter, so Kettle Woods is dense with trees and has no poles and Cinder Flats is nearly bare. The renderer draws the same prop meshes everywhere; the region kits of `docs/design/art-direction.md` come later. Rocks are scattered from their own seeded stream, so the scenery of the part of a road the player already knows is the same at every level.

The track tests compile every road at every level. They check the lengths, the lowest launch speed against the crest tables, that only the Main Wash and the rail crossing launch below 160 km/h, and that every roadblock spot is on a straight with 250 m behind it and 150 m ahead.

## Career

`packages/career` owns every career rule: money, levels, qualification, the shop, the field draw, rival memory, season points, story flags, settlement, and the save format. Like the simulation it is plain data and plain functions, with no DOM, clock, or unseeded randomness. React renders what it returns and never changes a rule; if the career should behave differently, change `packages/career`. It reads the cast, the bikes, and `RaceSetup` from `packages/sim` and the road ids and levels from `packages/track`. It never looks up or compiles a track: the caller passes one in.

`CareerState` is the save. It holds cash, level, the bike ridden and every bike owned, the carried weapon, the roads qualified at each level with the best place, the record, season points, what each rival remembers, story flags, the three newest board notes, the active-race record, the last settled result, and the game-over flag. Bike condition is not in it, because bikes are repaired between races. Every function returns a new state and leaves the old one alone, so a screen can ask what a bill would do before the player agrees to it.

| File | Owns |
| --- | --- |
| `tables.ts` | The numbers from `docs/design/game-design.md`: prizes, repairs, fines, police per level, shop stock, road lengths, trade-in and credit rates |
| `state.ts` | `CareerState` and `newCareer` |
| `field.ts` | `fieldFor`, `setupFor`, and `roadsFor`: who races, the `RaceSetup`, and which roads are open |
| `outcome.ts` | The race log and `outcomeOf` |
| `settle.ts` | `startRace`, `settleRace`, `quitRace`, `resumeCareer`, and the `Ledger` |
| `result.ts` | `LastResult`: the stored summary of the last settled race |
| `memory.ts`, `season.ts` | Rival memory and the season board |
| `shop.ts`, `story.ts`, `lines.ts` | The garage, the story beats and the envelope, and every line the cast and the officers say |
| `save.ts` | `serialiseCareer` and `parseCareer` |

A career race runs like this. `setupFor(career, roadId, seed, track)` draws the seven rivals, puts each on their bike and weapon for the level, sets grudges and aggression bonuses from memory, and adds the level's police. `startRace` writes the active-race record and clears the last result. The simulation clears its events every tick, so the runner calls `recordTick(log, state, setup)` after each `stepRace`. The log counts knockdowns, stolen weapons, hits, and busts, with the tick and the kilometre of each, and freezes the result at the tick the player's `finish`, `busted`, or `wrecked` event fires. Nothing after that tick changes it. The arrest's position and the confiscated weapon come from the `busted` event. `outcomeOf` returns the frozen result, or a quit if the player has not settled yet. `settleRace(career, outcome)` applies it once: prize with the repeat-run rule, repair or fine, the envelope, the debt check with repossession and game over, qualification, level-up, the ending, season points, memory, and the carried weapon. It clears the active-race record in the same step and returns a `Ledger` for Results.

**Race identity.** Every started race has a `raceId`, the career's count of starts. `startRace` puts it in the active-race record, `setupFor` puts it in the setup, and the race log stamps it into the outcome. `settleRace` accepts an outcome only when its `raceId`, road, level, and seed match the active race, so a result from an earlier race cannot pay again, even on the same road with the same seed. A refusal is a value, not a throw: the `Settlement` has `settled: false`, a null ledger, the career unchanged, and a `reason` of `noActiveRace`, `gameOver`, or `wrongRace`.

**Quitting.** `quitRace(career, outcome)` takes the live outcome from `outcomeOf` at the tick of the quit. Every rival is classified where they are at that tick, the player is placed behind everyone still racing and counts as wrecked, and the full repair bill is charged with no ad offer. Season points, memory, and board notes from the part of the race that was ridden all count. A player who quits after their race has already settled gets that settled result.

**Reloading.** `resumeCareer` is what the web app calls on a loaded save. If the save holds an active-race record, the race itself is gone, so it settles an empty outcome as a wreck at the full bill, once: no places, no points, and nothing remembered. It adds Vic's note to the board. With no active-race record it returns a `noActiveRace` refusal and the save unchanged.

**The last result.** Settlement stores `lastResult` in the career: the `Ledger` and a summary with the race's `raceId` and settlement tick, a row for each racer (name, bike, place, fate, finish tick or metres left, and prize), the incidents with each rival, the arrest (officer, their line, kilometre, confiscated weapon, fine), and the wreck (bike and kilometre). It is in the save, so a refresh during the Finish animation or on Results still has every number those screens show. The next `startRace` clears it.

**The save.** `parseCareer` checks every field and range and returns an error value for a bad save; it does not throw, whatever the text holds. The error has a kind and the path of the first field that failed. `invalid` is a value of the wrong kind or out of range, or a road or racer the game does not have. `inconsistent` is a save that contradicts itself: an active race on a bike other than the one ridden, at another level, with the wrong `raceId`, in a career that is over, or beside a stored result; a stored result that is not the last race started; a season or memory stamp later than the number of starts; or a bike ridden that is not in the garage. Reading and writing `localStorage` is the web app's job.

**The board.** Notes from a race are ordered by the tick they happened at, newest first, ahead of older notes, and the board keeps three. A repossession or a new bike at the garage happens at settlement and goes on top.

The design left some things open. These are the choices made here:

- A knockdown is a `crash` whose `by` names the other rider, whatever the cause except `rider`, so a rival punched into a car counts and a rival who runs into the back of the player does not. The same holds the other way: a rival who punches the player into traffic is put down for the knockdown. The log keeps the kilometre of the last knockdown each way, and a rival who knocked the player down gets a `knockedPlayerDown` board note.
- A rival placed ahead of the player won by a wheel when the player finished within 30 ticks after them. A rival placed behind lost by a wheel when they finished within 30 ticks after the player, or were still riding within 25 m at settlement.
- A rival's aggression bonus applies toward the player at any size and either sign. The grudge flag only decides whether the rival prefers the player as a target.
- The save version is still 1. No save had been written by a released build when `raceId` and `lastResult` were added.
- Police ride the Sesta at levels 1 to 3, the Meridian at level 4, and the Nera at level 5, so the bike is always faster than the level's pursuit speed.
- Selling is `sellBike`: the player gets the trade-in value and rides the Gutter Pup. It is the only shop action open to a player in debt.
- The envelope can be taken until the player's first start on Breakwater Run at level 2 or the move to level 3, whichever comes first.
- Once an ending is earned, no further career race starts.

## Browser client

`apps/web/src/game` builds the world from the compiled track: chunked road and terrain meshes, instanced scenery and traffic, a chase camera, and synthesized audio. Sky, fog, light, asphalt, and ground colours come from the road's region. The loop steps the simulation at 60 Hz and draws interpolated poses at the display's refresh rate. A governor lowers the render resolution when frames run slow.

React renders menus and the HUD only. The game is loaded with a dynamic import after the page is interactive, and it reports HUD values at 15 Hz. Besides speed, place, and stamina these are the bike's name and condition, the road's name and length, the distance to the nearest cop chasing the player at any range, and the distance left to the finish. The race screen decides when that distance becomes a warning: under 80 m the badge turns red and blinks.

Until the career screens exist, the title screen and the default race rotate through the five roads at level 1. The attract race moves to the next road each time it ends, Ride starts on the road the title is showing, and every race after that takes the next road.

The target is 60 frames per second on an integrated-graphics laptop.

## Build order

| Step | Delivers | Status |
| --- | --- | --- |
| 1 | Faceless-style workspace | Done |
| 2 | Riding greybox: physics, Ridge Road, traffic, crashes, AI pilot, placeholder models, audio | Done |
| 3 | Combat, weapons, a pack of rival riders, police | Done |
| 4 | Art: rigged bike and rider, vehicles, environment kit |  |
| 5 | Career: more tracks, levels, money, bike shop, characters, story | In progress: the simulation has the bikes, the cast, race setups, condition and wrecks, the two new weapons, and grudges. `packages/track` has the five roads. `packages/career` has the career rules, the lines, and the save format. The screens and the save adapter in the web app are next. |
| 6 | Multiplayer on the same simulation, then ads |  |

Step 2 is finished when a person riding Ridge Road alone wants another run. That is a play test, not an automated one.

Blender is needed from step 4, for mesh cleanup, rigging, and GLB export. Base meshes come from a 3D generation model or bought assets.

## Local development

`pnpm dev` runs `alchemy dev` with local state in `.alchemy/` and needs no Cloudflare account. The web app is at `http://localhost:1350`.

Alchemy is installed from its preview registry at `main` commit `e354a455`, because the latest npm beta does not support Effect 4.0.0. `pnpm-workspace.yaml` disables `blockExoticSubdeps` for its sibling tarballs. Move back to an npm release when one supports Effect 4.0.0.
