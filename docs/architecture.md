# Rushline architecture

Agreed October 6, 2026. This replaces the first prototype, a server-driven lane model with sprite riders. That code is kept in commit `2ba657f`.

## Product

An original motorcycle combat racer for desktop browsers, in the spirit of the mid-1990s Road Rash games: fast point-to-point road races, oncoming traffic, fights between riders, and crashes that throw you off the bike. Single-player comes first. The name, tracks, bikes, riders, art, and audio are our own; RUSHLINE is the working title. "Road Rash" is an Electronic Arts trademark and nothing of theirs is used.

The art direction is cel-shaded cyberpunk anime: two flat tones, ink outlines, neon signs, and a palette of yellow, cyan, magenta, and red on near-black. Proportions are realistic, for the world, the bikes, and the riders. The look was accepted on October 13, 2026 as the base to build on. Colours, faces, and outfits get refined after the rest of the game exists.

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
- **Crashes separate rider and bike, and wear the bike out.** A hard hit throws the rider, who tumbles, lies still, gets up, runs back to the bike, lifts it, and remounts. Each crash also takes condition off the bike, which starts at 100. At 200 km/h that is 34 for traffic, 32 for a tree or pole, 30 for a hard landing or for running into another rider, 28 for a knockdown, and 22 for leaving the track. The cost scales with the speed at impact over 200 km/h, held between a tenth and one and a quarter, so a crash at 100 km/h costs about 15 and a tip-over at walking pace about 3. At zero the bike is wrecked: the rider and bike slide to a stop as in any crash, are then moved onto the verge where traffic ignores them, and that rider's race is over with no fine. Three crashes into traffic at 200 km/h wreck a bike, and so do four knockdowns at that speed. Police bikes and riders who have already finished take no damage. A light side contact with a car only costs speed. A gentle bump into the nose of a car that is stopped or coming the other way leaves the bike up to 3 m/s and slides it sideways round the bumper at 3 m/s, towards the side the rider is steering or else the nearer side, so the bike and the car never hold each other still.

`BikeSpec` holds the numbers for one bike: power, drag, brakes, lateral speed, steering response, curve push, and visual lean, with its class and price. Each rider carries their own (`RiderState.bike`), so the riding step, the pilot's corner speeds, and the lean the renderer draws all come from the bike that rider is on. `bikes.ts` has the nine bikes of the catalogue in `docs/design/game-design.md`, keyed by id. The Ostra Sesta 600 is the reference: it is exported as `streetBike`, and the tests that pin the feel ride it. Its `curvePush` of 2.1 and `steerResponse` of 20 are the values the feel was tuned on, and the other eight bikes use the revised design table, which is scaled to them. Faster bikes are new specs, not new code.

`pilotInput` is the AI rider. It brakes for bends from the same physics, picks a lane around traffic and other riders, and throws punches and kicks at a rate set by its profile's aggression. Its home is the same-way lane next to the centre line, and it goes back there whenever that lane is clear. When something blocks it, it takes the first clear lane in order of preference: the other same-way lane, then the oncoming lanes, so on a road with two lanes each way a rival behind a slow car passes in the outer lane and only crosses the centre line when both same-way lanes are blocked. A lane it would have to cross to get there must not hold a threat due within 1.5 s, unless the bike is already in that lane, within 1 m of its centre; a bike beside a car does not steer through it to reach a clear lane on the far side. When no clear lane can be reached it splits the seam between the lane it is in and the neighbouring lane, the same-way one if there is a choice, at the blocker's speed plus 8 m/s. On a road with one lane each way nothing is ever between two lanes, so that is the old behaviour exactly: its own lane, then the oncoming lane, then the centre line. It judges a swing by the reach of the weapon in its hand and a kick by the reach of the boot, so a chain holder attacks from further across than a rider with fists. An unarmed rider next to an armed one prefers to kick. A rival can hold a grudge against one rider: when that rider is in reach the pilot goes for them instead of anyone nearer, on their side. A rival can also carry an `aggressionBoost` toward the player, rider 0. The pilot adds it to the rival's aggression whenever the rider it would strike is the player, with or without a grudge, so a boost above zero means more attacks on the player and one below zero means fewer. Toward everyone else the rival keeps its profile's aggression. The pilot rides round downed riders and ignores wrecked ones. The same code drives the title screen, the rivals, and the police. Its dice live in `RaceState`, so a race replays the same way whatever ran before it.

Combat lives in `combat.ts`. A punch or kick lands on the nearest rider on the chosen side within about two metres, drains stamina, shoves them sideways, and stuns their steering briefly. A rider whose stamina reaches zero is thrown. Strikes that come due on the same tick are all aimed before any of them lands, so two riders who swing at each other both connect. Cooldown and stun timers tick down before any strike lands, and every strike lands before any rider starts a new swing, so both are stunned for the same ten ticks and nobody starts a swing on the tick they were hit. Every rider remembers who last hit or touched them and when. A `crash` event carries `by`: that rider if it was within the last 60 ticks, otherwise −1, so a rider punched into a car is put down to the puncher. Rider-to-rider contact is sorted by where the two bikes were a tick earlier. If they were clear of each other along the road and already overlapping across it, the one behind ran in: a rear-end, which above a closing speed of 9 m/s throws the rider behind, once per tick at most, and leaves them behind the bike they hit. If they were clear across the road and overlapping along it, it is a side shove that pushes both bikes apart. If both gaps closed in the same tick, the one that closed last decides. A side shove costs each rider 0.9 m/s on a tick however many bikes touch them, and no more than 6 m/s in any second, so two bikes leaning on each other cannot hold each other still. The condition it costs and the speed on its `crash` event come from the speed the rider had at impact, not from the bike they ran into. Every pair in contact is read from the positions and speeds the riders had when the contact step began, and the pushes are added up before any is applied, so a three-bike pileup comes out the same whichever rider is listed first. A rider who runs hard into two bikes at once is thrown off the nearer one, and both of them are shunted forward. Traffic cars follow each other from the previous tick's positions. Each lane is its own sorted queue: a car follows the car ahead in its lane, never changes lane, and yields to a rider or a body in its lane. A car that has stopped for a rider stays stopped until the rider is out of its way; it does not creep forward. Remounting restores stamina to 55.

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

Police are riders with the `police` role, so riding, contacts, combat, and the renderer treat them like anyone else. How many there are, how fast they chase, how far they see, how far past their post they keep chasing, and what a bust costs come from the race setup. `createRace` parks them on the verge, 1.1 m beyond the road edge, spread over the road's length: the first 700 m from the start, the last 1 km before the finish, and the rest evenly between, so a level's police cover the whole race however long the road is, and a single cop sits at 700 m. A parked cop sits still until a racer is alongside it or up to 35 m ahead of it, then pulls out, so the pack meets the first cop about twenty seconds into a race instead of chasing a patrol it may never catch. A cop that has pulled out and has nobody to chase patrols at 22 m/s. `police.ts` decides whom a cop chases: a downed racer whose body is within 60 m ahead comes first, then the nearest racer riding within the sight range, who is kept until they are 120 m away. Each cop remembers its `post`, the spot where it was parked. Once it is more than the setup's `beat` past that spot it chases nobody new, pulls onto the verge, and stays there; a cop riding to a downed racer finishes that first. The pilot rides alongside a riding target at up to the pursuit top speed, which a level sets below the top speed of the bikes raced there, and swings its baton. It rides to a downed rider's body no faster than that speed either. A chasing cop picks its lane around traffic the way a racer does, at the speed the chase calls for. It leaves that lane for the spot 1.5 m beside its quarry only when it is within 20 m of them and no car threatens that line, and for a downed rider's body only when no car nearer than the body does. A pilot gives a car that drives the other way its longer warning even when that car has stopped. A racer who is off the bike when a riding cop is within 4 m of their body is busted, except in the first 30 ticks after they are thrown: a rider who is running back or lifting the bike can be arrested at once, and one who has just come off cannot, so a cop riding alongside does not arrest a rider on the tick they fall. Their race ends with the setup's fine, and standings put busted and wrecked riders after everyone still racing, ordered by how far they got. A thrown rider drops their weapon at once, so each rider keeps `weaponAtThrow`, the weapon they held when they were last thrown. The `busted` event carries the body's `s` and `x` at the moment of the arrest and that weapon, all read before the rider is moved. The busted rider and bike are moved onto the verge and traffic stops braking for them, so a bust never blocks the road. A cop that is off its beat or within 80 m of the end of the track pulls onto the verge for the same reason: it crawls at 6 m/s until the bike is clear of the road edge and only then stops, because a bike that brakes to a halt first has no steering left to leave the lane with. A cop who is knocked down remounts with a fresh baton. Police are not in the standings and cannot finish.

## Race setup and cast

`createRace` takes a `RaceSetup`: the track and seed, the player (a profile, a bike, and the weapon and hits they carry in), the rivals for this race (each a profile and a bike, with an optional `grudge` rider index and an optional `aggressionBoost` toward the player), the police settings (count, pursuit top speed, sight range, beat, fine, the officer's profile, and the bike they ride), and the grid order. Rider 0 is always the player, the rivals follow in the order given, and the police come last; a grudge index counts in that order. With `playerLast` the rivals fill the grid two to a row and the player has a row to themselves behind them. With `playerFirst` the player is on the front row. On a road with one lane each way the grid straddles the centre line, one bike in each lane; with two lanes each way it stands in the two same-way lanes, the player's row in the lane next to the centre line.

`validateSetup(setup)` returns a list of typed problems: more than seven rivals, a rival listed twice, or an entrant with no bike. `createRace` calls it and throws one error carrying every message, so a caller at a boundary validates first.

`defaultSetup(track, seed)` is the race the tests and the title screen use: the player on the Sesta, five rivals on their level-3 bikes, one cop at 54 m/s with a 40 m sight range, a 1,500 m beat, and a $1,500 fine, and the player last on the grid.

`cast.ts` holds the ten rivals and the two officers from the design: name, skill, aggression, home region, the weapon they carry and the level they carry it from, a bike for each of the five levels, and their colours. `rivalAt(rival, level)` turns one into a setup entry. From level 4 an unarmed rival with aggression of 0.5 or more starts with a club. Their lines, the field draw, and everything else about the career live in `packages/career`.

A profile's `paint` and `jacket` are indices into the twelve entries of `palette.ts`, which gives the bike, jacket, and helmet colour for each rider and a trim colour where there is one: the gold stripe on Juno Kade and the blue panels on the white police bikes.

## Tracks

`packages/track` compiles a `TrackPlan` into a `Track`. A plan is a list of sections, each with a length, a total turn in degrees, and a climb in metres, plus its region, its level, its traffic per kilometre, and the positions where a roadblock may stand. Compilation eases curvature and height through each section, samples the centre line every metre, and scatters trees, poles, rocks, and chevron signs from the plan's seed. The simulation and the renderer read the same compiled track.

A plan also says how many lanes the road has each way, `lanesEachWay`, 1 or 2, and how wide a lane is. The road's half width is `lanesEachWay × laneWidth + shoulderWidth`; the compiled `Track` lists the lane centres as `sameWayLanes` and `oncomingLanes`, positive x for the race's direction and negative for oncoming, each from the centre line outward. Traffic spawns in every lane, the plan's `trafficPerKilometre` cars per direction shared between that direction's lanes, and the slower cars favour the outer lane. Riding, props, the police verge, and the renderer all read the half width, so a wider road is wider everywhere.

There are five roads, one per region. Breakwater Run, Cinder Wash, and Slag Row have two lanes each way; Hollow Pine Road and Ridge Road have one. `docs/design/tracks.md` has their sections and the reasoning.

| Road | id | Region | Level 1 | Level 5 | Lowest launch |
| --- | --- | --- | --: | --: | --: |
| Breakwater Run | `breakwater-run` | Salt Coast | 8,500 m | 13,100 m | 169 km/h |
| Cinder Wash | `cinder-wash` | Cinder Flats | 8,850 m | 13,450 m | 154 km/h, the Main Wash |
| Hollow Pine Road | `hollow-pine-road` | Kettle Woods | 8,050 m | 12,650 m | 162 km/h, at level 5 |
| Slag Row | `slag-row` | Lowtown | 8,500 m | 13,100 m | 152 km/h, the rail crossing |
| Ridge Road | `ridge-road` | Stonepeak | 8,550 m | 13,150 m | 162 km/h, the Saddle |

The level-1 lengths follow the original game's level-1 roads, which measure 8.0 to 8.9 km. A level-1 race takes the AI pilot 2.6 to 3 minutes alone on an empty road and 3.6 to 4.2 minutes in a full field with traffic.

A road file in `tracks/` exports its level-1 plan, the four blocks of sections that levels 2 to 5 append, and a `Road` that ties them to the road's roadblock spots. `roadAtLevel(road, level)` builds a level's plan: the level-1 sections followed by the blocks up to that level, 1,150 m more road each time, one more car per kilometre, the id `slag-row-3`, and the same seed. `roadblocks` lists the spots that exist on the road at that level and is empty below level 3. A level can list more spots than it uses, and nothing in the simulation reads them yet.

`roads.ts` is the registry: `roads`, `roadIds` in career order, `regionOf(roadId)`, and `trackFor(roadId, level)`, which compiles each road and level once and returns the same `Track` afterwards.

`regions.ts` holds each region's name and prop mix. The prop mix weights trees, poles, rocks, and chevrons in the scatter, so Kettle Woods is dense with trees and has no poles and Cinder Flats is nearly bare. A region's colours and light are the renderer's business and live in `apps/web/src/game/looks.ts`. The renderer decides what a prop looks like per kit: a tree is a round street tree in a city and a pine on open ground, and a rock is a barrier block in a city. Rocks are scattered from their own seeded stream, so the scenery of the part of a road the player already knows is the same at every level.

The track tests compile every road at every level. They check the lengths, the lowest launch speed against the crest tables, that only the Main Wash and the rail crossing launch below 160 km/h, and that every roadblock spot is on a straight with 250 m behind it and 150 m ahead. They also pin the first 4,250 m of the level-1 Ridge Road, the original track, by digest (curvature, heights, centre line, crests, every prop, and the rocks by themselves), and check that a longer lead-in changes the trees and leaves the 35 rocks where they were.

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

`apps/web/src/game` builds the world from the compiled track: chunked road and terrain meshes, instanced scenery and traffic, a chase camera, and synthesized audio. The loop steps the simulation at 60 Hz and draws interpolated poses at the display's refresh rate. A governor lowers the render resolution when frames run slow.

Every surface is drawn in two tones. `cel.ts` makes the materials: a toon ramp with one hard step, a hard rim strip on the side facing the sky's light, and a hard highlight on glossy paint. The shadow tone is the ambient light and the lit tone is ambient plus the one directional light, so a look states both tones as the colours they should reach on screen. `post.ts` draws the frame through a fixed chain: the scene, ink outlines found from a normal and depth pass, bloom on anything brighter than a lit wall, a colour fringe and vignette, then output. Sky, clouds, cables, and far ground sit on a second layer the outline pass does not see. One 4096 shadow map follows the camera.

`looks.ts` holds a look per region: sky, fog, the two tones, light directions, outline colour, wall and road colours, window and lamp colours, bloom, and whether the road is wet. A look also picks a kit. Salt Coast is a city at dusk and Lowtown is a wet city at night. Cinder Flats is open desert at dawn, Kettle Woods is open forest at night, and Stonepeak is an open ridge at dusk. The city kit in `city.ts` lines both sides of the road with buildings generated from the track's seed: shopfronts, towers, awnings, balconies, blade signs, billboards, and cables. It builds them in 200 m chunks around the player. Building fronts stand at the distance where the simulation crashes a rider who leaves the road, so what looks solid is solid. The open kit keeps the terrain, trees, rocks, and a ring of mountains. `textures.ts` draws every texture on a canvas at load: facades, shopfronts, the sign atlas, the road with its lines, paving, and the sky.

Bikes, riders, cars, and vans are glTF models in `apps/web/public/models`, loaded once by `assets.ts` before the first race. The scripts in `tools/blender` build them: run `Blender -b -P tools/blender/bike.py`, and the same for `car.py`, `van.py`, and `rider_rig.py`. Add `-- show` to render previews into the system's temporary folder. A material's name is a colour slot. The loader merges each model into one vertex-coloured mesh and paints the slots a rider's or a car's colours, with lamps in a second mesh that glows. Riders are three builds of one skinned figure with 53 bones. A rider's 18 poses are frames of one animation, and `rider-figure.ts` blends between poses per bone, so a punch, a kick, a swing, a run, and a tumble are poses the simulation's state selects. Traffic is instanced: the car model for low vehicles and the van model, scaled, for vans and trucks.

The chase camera frames the race the way the original game did. It faces along the road's direction at the player's bike and never looks toward a point further up the road, so a bend swings the far road across the screen while the bike stays near the middle. It does not roll and its field of view is fixed at 48 degrees. It takes three quarters of the bike's sideways offset, and the bike crosses the screen for the last quarter. Its pitch, distance, and height are solved from the frame it must produce: the horizon 0.34 of the way down, the rear wheel 0.685 of the way down, and the rider 0.27 of the frame tall. Hits still jolt it.

React renders menus and the HUD only. During a race the HUD is one speedometer at the bottom centre: a ring of ticks that light with speed, the speed as a number, the player's place out of the field, and an arc around the ring that fills with progress along the road. There are no stamina or condition bars; the rider and the bike show damage themselves. A rival's line of speech still floats over that rival, and the cop warning still appears. The game is loaded with a dynamic import after the page is interactive, `createGame` resolves once the models have loaded, and the game reports HUD values at 15 Hz. Besides speed, place, and progress these are stamina, the bike's name and condition, the road's name and length, the distance to the nearest cop chasing the player at any range, and the distance left to the finish. The race screen decides when the cop's distance becomes a warning: under 80 m the badge turns red and blinks.

Until the career screens exist, the title screen and the default race rotate through the five roads at level 1. The attract race moves to the next road each time it ends, Ride starts on the road the title is showing, and every race after that takes the next road.

The target is 60 frames per second on an integrated-graphics laptop.

## Build order

| Step | Delivers | Status |
| --- | --- | --- |
| 1 | Faceless-style workspace | Done |
| 2 | Riding greybox: physics, Ridge Road, traffic, crashes, AI pilot, placeholder models, audio | Done |
| 3 | Combat, weapons, a pack of rival riders, police | Done |
| 4 | Art: rigged bike and rider, vehicles, environment kit | In progress: the cel renderer, the five looks, the city and open kits, one bike, three rigged riders, a car, and a van are in. More bikes, the cast's faces and outfits, a truck, region set pieces, and the menus in this style are next. |
| 5 | Career: more tracks, levels, money, bike shop, characters, story | In progress: the simulation has the bikes, the cast, race setups, condition and wrecks, the two new weapons, and grudges. `packages/track` has the five roads. `packages/career` has the career rules, the lines, and the save format. The screens and the save adapter in the web app are next. |
| 6 | Multiplayer on the same simulation, then ads |  |

Step 2 is finished when a person riding Ridge Road alone wants another run. That is a play test, not an automated one.

Blender 5.2 with the MPFB add-on is needed from step 4. The scripts in `tools/blender` model the bike and vehicles from code, take the rider's body from MPFB, pose it, and export GLB.

## Local development

`pnpm dev` runs `alchemy dev` with local state in `.alchemy/` and needs no Cloudflare account. The web app is at `http://localhost:1350`.

Alchemy is installed from its preview registry at `main` commit `e354a455`, because the latest npm beta does not support Effect 4.0.0. `pnpm-workspace.yaml` disables `blockExoticSubdeps` for its sibling tarballs. Move back to an npm release when one supports Effect 4.0.0.
