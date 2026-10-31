# Tracks

Drafted October 10, 2026. The five roads as `TrackPlan` data. Each level-1 plan below compiles with the existing format in `packages/track/src/track.ts`: sections of `{ length, turnDegrees, climb }`, with the same lead-in and runoff as Ridge Road. Levels 2 to 5 append sections to the same road.

Lengthened October 14, 2026. The original game's level-1 roads measure 8.0 to 8.9 km (5.0 to 5.5 miles), and the first drafts here were 3.6 to 4.4 km, so a race lasted about a minute and a half instead of several minutes. Each level-1 road keeps every section it had and continues past its old finish line, which is now a place the race rides through. The new stretch is listed in each road's section table below the old finish, and its moments are named in the paragraph after the road's opening description. Level-1 roads are now 8.05 to 8.85 km.

Jumps added October 15, 2026. Three roads gained a hump across the whole road, made by splitting a straight, so no road changed length and no bend moved: **the Pier hump** on Breakwater Run and **the Pressure Ridge** on Cinder Wash launch at 172 km/h, and **the Slag Heap hump** on Slag Row at 163 km/h. Every road gained steel ramps at fixed places: two each on Breakwater Run, Cinder Wash, and Hollow Pine Road, one on Ridge Road, and two on Slag Row with a third from level 4. The section tables of the three roads with a hump are renumbered to match the plans. "Ramps and humps" below says how they are placed, and each road has a table of its ramps. The pilot's times in "Ridden by the pilot" were taken before the jumps.

Hazards added October 16, 2026. Every road has oil slicks, rocks, and potholes on the tarmac, placed from the road's seed by the rules in "Hazards" below: four to six at level 1 and eleven to fourteen at level 5. No road changed length and no bend or ramp moved.

Launch cities agreed October 23, 2026. Three of these shapes become real cities with a cyberpunk twist: Slag Row becomes Madrid, Breakwater Run becomes Mumbai, and Ridge Road becomes a Bay Area mountain road on the hills above Silicon Valley (`game-design.md` section 0). Each keeps its road's shape where the city fits, so the bends, crests, ramps, and hazard rules below carry over; the landmarks, junctions, crossings, and billboard slots are new. The career moves to three levels, so the level blocks below are re-measured. Cinder Wash and Hollow Pine Road stay in the build until later cities replace them.

Pieces replaced sections October 24, 2026. A plan is now a start pose and a list of pieces (`docs/architecture.md`, "Tracks"). Each section in the tables and plans below is one eased piece, written `[length, turnDegrees, climb]` inside `eased(...)` in the road files, and every road samples bit for bit as it did. The plan listings below keep the older `{ length, turnDegrees, climb }` objects; the road files in `packages/track/src/tracks` are the source.

All figures were produced by compiling each plan at each level with `compileTrack` and reading the compiled `curvature` and `slopeRate` arrays. A bend's radius is one over its peak curvature, which is `turn / (length × 0.7)` because of the 30% ease in and out. A bend's hold speed is where full steer equals the outward push for that bike's `BikeSpec` in `game-design.md`. The hold speeds quoted in the road sections below are from before the grip retune of October 15, 2026 (`game-design.md`, "Bends and the lean scrub"), which raised every `curvePush` by 30%; multiply them by 1.14 for the current bikes, so a 70 m right angle that held at 97 km/h on a Wren now holds at 112. Since that retune a leaned bike also scrubs its own speed, so "not flat" below no longer means the bend needs the brake: see the paragraph after the table. A crest's launch speed is where `slopeRate × speed²` passes gravity, the condition `rider-drive.ts` uses. No person has ridden the roads yet. The AI pilot finishes every level-1 road on its own without a crash (section "Ridden by the pilot" below), but passing numbers do not show that a road plays well, so each needs a play test.

## Summary

| Region | Road | id | Level-1 length | Lane width / shoulder / verge | Traffic per km, level 1 | Seed |
| --- | --- | --- | --: | --- | --: | --- |
| Salt Coast | Breakwater Run | `breakwater-run` | 8,500 m | 2 × 3.6 / 0.9 / 7 m | 5 | `0xb4_7a_c1` |
| Cinder Flats | Cinder Wash | `cinder-wash` | 8,850 m | 2 × 3.8 / 1.4 / 14 m | 3 | `0xc1_d3_0a` |
| Kettle Woods | Hollow Pine Road | `hollow-pine-road` | 8,050 m | 1 × 3.4 / 0.6 / 5 m | 6 | `0x4f_17_e2` |
| Lowtown | Slag Row | `slag-row` | 8,500 m | 2 × 3.5 / 0.5 / 6 m | 8 | `0x5a_9c_33` |
| Stonepeak | Ridge Road | `ridge-road` | 8,550 m | 1 × 3.6 / 0.9 / 9 m | 5 | `0x51_ed_27` |

Breakwater Run, Cinder Wash and Slag Row have two lanes each way, as The City did in the original; Hollow Pine Road and Ridge Road have one. `trafficPerKilometre` is per direction, as in `createTraffic`, and a two-lane direction shares it between its lanes. Every plan uses `leadInLength: 80` and `runoffLength: 400`.

### How hard each road is

A bend counts as "not flat" for a bike when the bike's top speed is above the speed full steer can hold. The three bikes stand for the three classes.

| Road | Level | Length | Bends | Tightest radius | Not flat: Wren 400 | Not flat: Sesta 600 | Not flat: Anvil 1100 |
| --- | --: | --: | --: | --: | --: | --: | --: |
| Breakwater Run | 1 | 8.50 km | 16 | 102 m | 4 | 9 | 12 |
| Breakwater Run | 2 | 9.65 km | 19 | 102 m | 6 | 11 | 15 |
| Breakwater Run | 3 | 10.80 km | 22 | 102 m | 7 | 13 | 18 |
| Breakwater Run | 4 | 11.95 km | 25 | 62 m | 9 | 15 | 20 |
| Breakwater Run | 5 | 13.10 km | 28 | 62 m | 11 | 17 | 23 |
| Cinder Wash | 1 | 8.85 km | 10 | 67 m | 2 | 5 | 6 |
| Cinder Wash | 2 | 10.00 km | 12 | 67 m | 3 | 6 | 8 |
| Cinder Wash | 3 | 11.15 km | 13 | 67 m | 4 | 7 | 9 |
| Cinder Wash | 4 | 12.30 km | 15 | 67 m | 5 | 8 | 10 |
| Cinder Wash | 5 | 13.45 km | 17 | 56 m | 7 | 10 | 12 |
| Hollow Pine Road | 1 | 8.05 km | 24 | 88 m | 12 | 19 | 23 |
| Hollow Pine Road | 2 | 9.20 km | 28 | 88 m | 14 | 22 | 26 |
| Hollow Pine Road | 3 | 10.35 km | 31 | 88 m | 17 | 25 | 29 |
| Hollow Pine Road | 4 | 11.50 km | 34 | 67 m | 19 | 27 | 32 |
| Hollow Pine Road | 5 | 12.65 km | 37 | 67 m | 22 | 30 | 35 |
| Slag Row | 1 | 8.50 km | 15 | 70 m | 10 | 12 | 12 |
| Slag Row | 2 | 9.65 km | 17 | 67 m | 11 | 14 | 14 |
| Slag Row | 3 | 10.80 km | 19 | 67 m | 12 | 15 | 16 |
| Slag Row | 4 | 11.95 km | 22 | 59 m | 15 | 18 | 19 |
| Slag Row | 5 | 13.10 km | 25 | 59 m | 17 | 20 | 21 |
| Ridge Road | 1 | 8.55 km | 19 | 136 m | 7 | 10 | 17 |
| Ridge Road | 2 | 9.70 km | 22 | 92 m | 9 | 13 | 20 |
| Ridge Road | 3 | 10.85 km | 25 | 92 m | 11 | 16 | 23 |
| Ridge Road | 4 | 12.00 km | 27 | 58 m | 13 | 18 | 25 |
| Ridge Road | 5 | 13.15 km | 30 | 58 m | 15 | 21 | 28 |

The counts are for the bikes as retuned to the original game's measured starter bike on October 14, 2026 (`game-design.md`, section 6), before the grip went up by 30% on October 15; with the current grip each count is a little lower, and "not flat" is no longer the question that matters. Since October 15 a leaned bike scrubs its own speed, so what decides whether a bend needs a lift or a brake is whether the scrub can bring the bike under the hold speed before the push has run it off the road. A probe that turns in 50 m before each bend at the speed a flat-out Wren arrives with, steers as hard as the bend needs, and holds the throttle cannot take 0 level-1 bends on Breakwater Run, 1 on Cinder Wash (the Mesa Hairpin), 3 on Hollow Pine Road (the Sawmill Hook, the Widowmaker, and the Kiln Hook), 7 on Slag Row (every right angle), and 0 on Ridge Road, against 3, 2, 12, 8, and 6 before; on a Sesta 4, 2, 12, 8, and 7, against 8, 2, 21, 11, and 10. A lift with no brake gets the Wren round every one of them. Hold speeds fell to about 60% of what they were, top speeds to about 90%, so far more bends ask for the brakes: before the retune the Wren took every level-1 bend on Breakwater Run, Hollow Pine Road, and Ridge Road flat, and now it takes all but four, twelve, and seven. The hold speeds quoted in the road sections below are for the retuned bikes. The pattern is the design: Cinder Wash is easy to steer and hard to survive, Hollow Pine Road asks the most of a fast bike, Slag Row makes even the Wren brake, and every road gets tighter in the kilometres that later levels add. The stretch each level-1 road gained in October keeps to the road's level-1 limits: no new bend on Breakwater Run, Hollow Pine Road, or Ridge Road is tighter than that road's tightest old bend, and Slag Row's new right angles sit at radii of 70 to 73 m beside its old ones at 71 to 73 m.

### Ridden by the pilot

The AI pilot rode each level-1 road headless through `createRace` and `stepRace`, on the bikes as retuned on October 14, 2026. Alone on an empty road on the Sesta 600 it finishes every road without a crash and without touching the brake. With the career's level-1 field, the Wren 400, traffic, and the level-1 cop, it finished 37 of 40 starts (eight seeds a road); the other three were busts at 1.2, 2.1, and 6.5 km, each a baton knockdown beside the cop.

| Road | Alone, Sesta 600, no traffic | Career level 1, Wren 400, finishes | Their times |
| --- | --: | --: | --- |
| Breakwater Run | 199 s | 8 of 8 | 218 to 232 s |
| Cinder Wash | 199 s | 8 of 8 | 221 to 236 s |
| Hollow Pine Road | 212 s | 6 of 8 | 241 to 245 s |
| Slag Row | 227 s | 8 of 8 | 246 to 255 s |
| Ridge Road | 204 s | 7 of 8 | 236 to 249 s |

Before the retune the same pilot took 158 to 175 s alone on the Sesta and 214 to 251 s in the level-1 field. The old 4.25 km Ridge Road took it 82 s alone on the old Sesta.

With the grip and the lean scrub of October 15, 2026, the pilot alone on a quiet road takes 165, 163, 178, 192, and 170 s on the Sesta (Breakwater Run, Cinder Wash, Hollow Pine Road, Slag Row, Ridge Road) and 178, 180, 185, 199, and 181 s on the Wren; with level-1 traffic and no field, the Wren's medians over six seeds are 182, 182, 280, 206, and 277 s, where the two one-lane roads are slow because the pilot queues behind log trucks and buses, which the field races above do not show because the pack passes them together.

## The crest rule

Only a big crest launches a bike, and only at speed. The rule for every road at every level:

- **No crest launches below 160 km/h,** except one signature launch on a road that is built around it.
- **Two roads have a signature launch between 150 and 160 km/h:** Cinder Wash's Main Wash at 154 km/h and Slag Row's rail crossing at 152 km/h. Ridge Road's signature, the Saddle, is at 162 km/h and needs no exception. Breakwater Run and Hollow Pine Road have none below 160.
- The Gutter Pup tops out at 145 km/h, 151 tucked in, still below every launch speed here, so it never flies on level ground. The Wren's 190 km/h (198 tucked) clears every crest up to that speed, so the Saddle and the two signature launches are flights on a Wren, and the AI pilot lifts for a drop ahead to stay under 1.15 times its launch speed.

Height is eased through each section with a cosine, so every section that climbs or falls has one point where the road curves away fastest: the top of a rise and the start of a drop. For a section of length `L` and climb `c` the peak is `slopeRate = π² × c / (2 × L²)`, and the bike leaves the road above `L × √(2g / (π² × |c|))` m/s, which is `5.08 × L / √|c|` km/h. A dip launches at both of its lips: where the road drops into it and where it climbs out.

Each road below has a table of every crest that launches under 260 km/h, read from the compiled `slopeRate`. A crest made of a rise and a drop is listed once, at its top, with the lower of its two launch speeds. A dip is listed at its far lip. Every other change of grade on these roads needs more than 260 km/h, which only the Meridian (263 km/h tucked), the Anvil (278), and the Nera (294) can reach, and only at the end of a long straight.

## Ramps and humps

A hump is an ordinary crest. It is a piece of straight split into a rise and a drop of the same length, 1.4 m up and 1.4 m down, across the whole road, so it obeys the crest rule and is listed in its road's crest table. A 40 m rise and drop launch at 172 km/h and a 38 m pair at 163 km/h, the formula above with `c` of 1.4. Each hump took its length from the straight it sits in, so the road's length and every position outside that straight are unchanged.

A ramp is not part of the road's height. It is a steel loading ramp, a `Track.features` entry of kind `"jump"`, that stands on the road from its toe at `s` to its lip at `s + length` and is `width` wide. The deck height is `rise × u²`, where `u` runs from 0 at the toe to 1 at the lip, so the deck leaves the road flat and is steepest at the lip, where the slope is `2 × rise / length`. The 16 m ramps rise 0.8 m and the 18 m ramps on Cinder Wash rise 1 m, so their lips are at 0.1 and 0.111. A bike leaves the lip with the lip's height and slope and nothing more. Off a 16 m ramp at 180 km/h it is in the air 1.16 s, lands 58 m past the lip on level road, and comes down at 6.4 m/s, which costs 5% of its speed; off an 18 m ramp it flies 1.29 s and 64.5 m and comes down at 7.1 m/s. On level road neither ramp gives a landing over the 11 m/s crash limit below 326 km/h, faster than any bike.

Every ramp is placed by the same rules. `compileFeatures` in `features.ts` enforces the first four, the track tests check the next two, and the last is how every ramp so far was placed:

- **It reserves its approach and landing.** The compiled ramp holds the 80 m before its toe and a landing corridor after its lip as long as its level flight at 306 km/h (85 m/s) plus 25 m: 180 m after a 16 m ramp, 276 m in all, and 197 m after an 18 m ramp, 295 m in all. No other feature may sit in that stretch.
- **It is clear of the start and the finish.** The reservation starts at least 300 m after the start line and ends before the finish.
- **It stays on the road.** `|x| + width / 2` must be no more than the road's half width.
- **It has a level.** A ramp exists from its `fromLevel` up; the level-1 ramps are there at every level.
- **It is on a straight.** The road is straight from 40 m before the toe to the end of the landing corridor, and no crest in the reservation launches below 200 km/h, so a ramp never throws a bike off a crest or into a bend.
- **It is away from the roadblocks.** The reservation is at least 100 m from every roadblock spot the level uses.
- **It stands off the centre line, where traffic cannot reach it.** On a road with two lanes each way a ramp is 1.4 m wide and centred on the dashed line between the two same-way lanes. On a road with one lane each way it is narrower and stands between the same-way lane and the kerb: 1.2 m wide with its centre 3.8 m out on Ridge Road, 1 m wide and 3.45 m out on Hollow Pine Road. Traffic keeps to the lane centres and never changes lane, so cars and vans clear every ramp; a truck, 2.4 m wide, clears the one-lane ramps and Cinder Wash's but overhangs the edge of a 1.4 m deck by up to 0.1 m on Breakwater Run and 0.15 m on Slag Row, because traffic does not see ramps. Off the centre line the chase camera sees the ramp beside the player's bike from far off instead of behind it, and a rider who does not want the jump rides past it in a lane.

The compiled ramps are indexed in 32 m cells along the road, and the simulation and the renderer both find the deck under a bike with `supportAt(track, s, x, out)`.

## Hazards

A hazard is something lying on the road: an oil slick, a small rock, or a pothole. The track carries a schedule of them, `Track.hazards`, and the race spawns each one into `RaceState.hazards` when it is created, so a hazard is race state, not part of the road's surface. Hazards are good to avoid, not must avoid: none is a crash on contact. Oil is safe straight across at any speed and puts down only a bike that holds the bars hard over on it; a rock bumps the bike into the air and costs speed, and throws the rider only from about 210 km/h or when the bike is already steering hard; a pothole is a jolt and a wobble, and throws only a bike leaned hard over above 175 km/h. They are drawn at their real size and are not made to stand out, so a rider who sees one late chooses between a quick swerve and riding through. Only riders meet them: traffic drives over every hazard unchanged. `docs/architecture.md` has the numbers.

| Kind      | Footprint   | Height |
| --------- | ----------- | ------ |
| Oil slick | 5.2 × 2.2 m | flat   |
| Rock      | 0.6 × 0.6 m | 0.3 m  |
| Pothole   | 1 × 1.2 m   | flat   |

### Where hazards lie

Hazards are placed where they change how a rider takes the road, not spread evenly. `placeHazards` in `packages/track/src/hazards.ts` lists the places that matter on a road from its sections:

| Setting | Where along the road | Where across it | Kind |
| --- | --- | --- | --- |
| Turn-in | 15% into every bend of 20° or more | The same-way lane on the outside of the bend, pushed further out by up to 0.5 m | Oil, so the rider crosses it upright and turns after it |
| Apex | The middle of the bend | The same-way lane on the inside, moved up to 0.7 of a lane further in, so it lies where a rider cuts the corner and can cross the centre line | Pothole |
| Exit | 20 m past the end of the bend | The same-way lane on the outside, where a bike runs wide on the power | Oil or rock |
| Crest | 30 m past the top of a climb of 6 m or more that is followed by level road or a descent | A lane, same-way seven times in ten | Rock or pothole |
| Traffic | A straight, where the walk lands with no place near | Half the time within 0.9 m of the centre line or the dashed line between two same-way lanes, where a rider squeezes between cars; otherwise in a lane | The region's mix |

A rock mid-bend would throw nearly every rider leaning through it, which is a must-avoid, so the apex takes potholes. The same holds wherever a rock lands, whatever its setting: the road is read from 10 m before the rock to 40 m past it, where a bike that hits it comes down. If the curvature anywhere there reaches 0.0015 (a radius of about 670 m), the bend is tight and the place takes no rock; an exit 20 m past one bend that falls inside the next is such a place. Below that the bend is gentle (from 0.0003), and a rock there lies at the edge of a lane, 0.35 m in from the lane line, not on the lane's centre, so a rider holding the lane through the bend passes it, and one who rides over it leaning lightly stays up at moderate speed. The 0.0015 limit comes from riding the rock rule through a constant bend: a Wren, Sesta, or Meridian holding the lane at 0.0015 and riding over a rock on its line stays up to 160 km/h and goes down from about 180; at 0.002 the Sesta and Meridian already go down from 160. Rocks lie in the lanes, not on the road edge: no hazard reaches past the outer lane line onto the shoulder.

A plan's `hazardsPerKilometre`, 1 on every road, sets how many hazards there are. The road's own seeded stream (its seed with a salt) walks it from the start in steps of 0.6 to 1.4 times 1,000 m, and each step is a candidate. For each candidate the stream draws its kind, its line, its offset, the level it appears from (60% of candidates from level 1 and 10% more from each level after), and which place it takes. The candidate takes one of the places that are free between it and 250 m behind it and at least 60 m past the previous hazard; with none, it lies on the straight where it stands, in the traffic setting. Its kind is drawn from the region's `hazardMix` weighted by the setting, so a turn-in is always oil and an apex always a pothole. Every number is drawn whether or not the candidate is kept, and the place it takes depends only on the road behind it, so a hazard on the part of the road a player already knows is in the same place, with the same id, at every level. A placed hazard is kept when:

- **It is clear of the start and the finish.** It is at least 450 m past the start line and 150 m before the finish.
- **It is clear of every ramp.** Its footprint is at least 30 m outside every ramp's reservation, its approach and its landing corridor, including ramps that only appear at a later level, so no hazard sits on a ramp, in its run-up, or where a bike comes down.
- **It is not hidden until it is under the wheel.** From 25 m before it, the line from a rider's eye 1.2 m above the road on the hazard's own line to a point 0.1 m above the hazard stays above the road and inside the verges. A hazard does not have to be visible from far off: one round a blind bend or just over a crest is part of the game.

If the place a candidate takes fails a rule, it tries the straight where it stands instead; if that fails too, the candidate is dropped.

The track tests check every rule above at every level, that a level-1 road has four to seven hazards, one or more of them oil, that a level-5 road has at least twice as many, that oil is the most common kind across the roads at every level, that every hazard is on the lanes, that rocks are spread across the road rather than on a few lines, that most hazards lie at a bend or a crest, that a mid-bend hazard is a pothole on the inside line and a turn-in hazard is oil on the outside line, that no rock lies in or lands a bike in a tight bend, that a rock in a gentle bend lies at a lane's edge, and that every level-1 hazard is in the same place at every later level.

| Region       |  Oil | Rock | Pothole |
| ------------ | ---: | ---: | ------: |
| Salt Coast   | 0.65 | 0.15 |     0.2 |
| Cinder Flats |  0.6 | 0.25 |    0.15 |
| Kettle Woods |  0.6 |  0.2 |     0.2 |
| Lowtown      |  0.6 |  0.2 |     0.2 |
| Stonepeak    |  0.6 | 0.25 |    0.15 |

| Setting | Oil | Rock | Pothole |
| ------- | --: | ---: | ------: |
| Turn-in |   1 |    0 |       0 |
| Apex    |   0 |    0 |       1 |
| Exit    |   1 |    1 |       0 |
| Crest   |   0 |    2 |       1 |
| Traffic |   1 |  1.5 |       1 |

Hazards by road and level, as oil / rock / pothole. Before October 16, 2026 the roads had 24 hazards at level 1 between them and 60 at level 5, of which 5 and 15 were oil slicks (none on Cinder Wash at level 1), because rocks had to stand where no car drives and every hazard had to be visible from 170 m. The totals now are 26, 33, 43, 50, and 63 at levels 1 to 5 against 24, 35, 41, 52, and 60 before, and more than half are oil (15 of 26 at level 1 and 33 of 63 at level 5): the count stays where it was and the mix moves from rocks and potholes to oil. The seed salt, 0x4bc2, was picked from 400 as the one closest to the old per-road counts at levels 1 and 5 that keeps every level within 12% of the old total, gives every level-1 road two or more oil slicks, and keeps at least five rocks at level 1.

| Road | Level 1 | 2 | 3 | 4 | 5 |
| --- | --- | --- | --- | --- | --- |
| Breakwater Run | 6 (3/3/0) | 6 (3/3/0) | 8 (5/3/0) | 9 (5/4/0) | 13 (8/5/0) |
| Cinder Wash | 4 (2/2/0) | 5 (3/2/0) | 9 (5/3/1) | 10 (6/3/1) | 11 (6/4/1) |
| Hollow Pine Road | 5 (4/1/0) | 7 (5/1/1) | 8 (5/1/2) | 10 (6/1/3) | 13 (8/2/3) |
| Slag Row | 6 (3/2/1) | 8 (4/2/2) | 11 (6/2/3) | 11 (6/2/3) | 14 (8/3/3) |
| Ridge Road | 5 (3/0/2) | 7 (3/1/3) | 7 (3/1/3) | 10 (5/2/3) | 12 (5/3/4) |

The level-1 hazards, by id, kind, setting, position along the road, and position across it:

| Road | Hazards at level 1 |
| --- | --- |
| Breakwater Run | `hazard-1` rock (exit) at 920 m, x 0.84; `hazard-3` oil (turn-in) at 3,145 m, x 5.73; `hazard-5` rock (exit) at 4,680 m, x 1.03; `hazard-7` rock (traffic) at 6,946 m, x 0.32; `hazard-8` oil (turn-in) at 7,488 m, x 1.49; `hazard-9` oil (turn-in) at 8,081 m, x 5.41 |
| Cinder Wash | `hazard-2` oil (traffic) at 2,193 m, x 0.69; `hazard-5` rock (traffic) at 5,668 m, x 2.68; `hazard-6` rock (traffic) at 6,422 m, x 1.83; `hazard-7` oil (traffic) at 7,814 m, x 0.78 |
| Hollow Pine Road | `hazard-1` oil (exit) at 840 m, x 1.73; `hazard-4` oil (turn-in) at 3,630 m, x 2.02; `hazard-5` rock (exit) at 4,300 m, x 2.09; `hazard-6` oil (turn-in) at 5,181 m, x 1.37; `hazard-8` oil (turn-in) at 7,350 m, x 2.16 |
| Slag Row | `hazard-2` oil (exit) at 1,480 m, x 5.66; `hazard-3` pothole (traffic) at 2,271 m, x 0.64; `hazard-6` rock (exit) at 5,300 m, x 1.21; `hazard-7` rock (traffic) at 6,372 m, x 1.41; `hazard-8` oil (turn-in) at 7,004 m, x 5.39; `hazard-9` oil (exit) at 7,760 m, x 1.48 |
| Ridge Road | `hazard-2` oil (turn-in) at 1,696 m, x 1.74; `hazard-3` oil (turn-in) at 2,823 m, x 1.67; `hazard-4` oil (traffic) at 4,244 m, x 1.38; `hazard-6` pothole (apex) at 6,150 m, x 0.84; `hazard-7` pothole (apex) at 7,640 m, x 0.22 |

Roadblock spots are not checked against hazards yet; roadblocks are not in the simulation.

## Junctions and crossings

A road declares the places where something crosses it in `crossings`. Each entry has an id, the level it appears from, its position `s`, its lights or none, its cross road or none, and its walk, a zebra or unmarked. A cross road has one or two lanes each way, a lane width, and arms on both sides, on the left (oncoming, negative x) or on the right (same-way, positive x), so a T is one arm. An entry with a cross road is a junction; one without is a pedestrian crossing. Lights carry only a phase offset in ticks; the cycle itself is a game rule in `packages/sim/src/signals.ts`.

A junction's box is as long as the cross road is wide, from kerb to kerb. A zebra lies a metre outside the box on each side, 4 m wide, and the stop line 1.5 m beyond it, so a two-lane cross road with 3.4 m lanes puts the stop lines 13.8 m either side of the centre. A crossing with no cross road has one zebra across its centre and stop lines 3.5 m either side. The compiler reserves the stretch from 30 m before one stop line to 30 m past the other, at every level, and refuses an entry whose reserved stretch:

- curves more than 1/400 per metre, a 400 m radius, anywhere;
- climbs or falls more than 6%, or changes grade faster than 0.002 per metre, which is a crest;
- starts within 300 m of the start or ends within 100 m of the finish at a level that has it;
- overlaps a ramp's reservation, or comes within 120 m of another crossing's.

No hazard lies in a reserved stretch, and no tree, pole or rock stands within 3 m of a cross road's arm on the side that has it. Both reserve every level's crossings, so a road with crossings keeps the rest of its hazards and props where they were. City blocks keep 2 m clear of the arms.

The lights run main green 9 s, main amber 2.5 s, all red 1 s, cross green 7 s, cross amber 2.5 s and all red 1 s, a 23 s cycle, so a rider meets a red about half the time. A pedestrian crossing runs main green 10 s, amber 2.5 s, all red 1 s, walk 6 s, flashing 2 s and all red 1 s. The phase is a function of the race tick and the entry's offset, so it needs no race state and replays exactly.

| Road | Id | From level | At (m) | Lights | Cross road | Walk |
| --- | --- | --: | --: | --- | --- | --- |
| Breakwater Run | `harbour-cross` | 1 | 1,700 | offset 0 | two lanes each way, both arms | zebra |
| Breakwater Run | `market-cross` | 1 | 6,000 | offset 540 | one lane each way, right arm | zebra |
| Breakwater Run | `pier-crossing` | 1 | 7,850 | offset 300 | none | zebra |
| Breakwater Run | `esplanade-cross` | 4 | 10,900 | none, give way | one lane each way, left arm | unmarked |

Nothing on the road reacts to a crossing yet: riders, traffic and the pilot ride through as if it were not there. The lights cycle and are drawn.

## How levels extend a road

Level N is the level-1 section list followed by the appended blocks for levels 2 to N. The start line never moves, so the opening kilometres are the ones the player already knows; the finish moves 1,150 m further each level. Appended sections are written `[length, turnDegrees, climb]`.

The 1,150 m a level adds is ours. The original's level-1 lengths were measured, but how much each later level grew was not, so the extension stayed as it was when the level-1 roads were lengthened. The level blocks did not change; each now starts where the longer level-1 road ends, so every position inside them moved by the length that road gained: 4,600 m on Breakwater Run, 4,450 m on Cinder Wash and Hollow Pine Road, 4,500 m on Slag Row, and 4,300 m on Ridge Road. Each level-1 road still ends on a level straight of at least 300 m, as it did before, so the first section of each level-2 block meets the same kind of road it was designed against.

Each level also changes the race around the road:

| Level | Length added | Traffic per km | Cops | Pursuit top speed | Roadblocks |
| --: | --: | --- | --: | --: | --: |
| 1 |  | Base (table above) | 1 | 166 km/h | 0 |
| 2 | +1,150 m | Base + 1 | 2 | 180 km/h | 0 |
| 3 | +1,150 m | Base + 2 | 3 | 194 km/h | 1 |
| 4 | +1,150 m | Base + 3 | 4 | 209 km/h | 2 |
| 5 | +1,150 m | Base + 4 | 5 | 223 km/h | 3 |

Traffic is a field of the plan, so a level's plan carries its own `trafficPerKilometre` and the sim needs no change for it. Cops are spaced by the road's length: the first is parked 700 m in, the last 1 km before the finish, and the rest evenly between, so a level-2 road has its two cops about 8 km apart and a level-5 road its five about 2.9 km apart. Each gives up the chase a beat past its post: 3,000, 5,000, 3,000, 1,500, and 2,000 m at levels 1 to 5 (`game-design.md` section 8). The level-1 cop is alone, so its beat still ends at 3.7 km of an 8.05 to 8.85 km road and the rest of that road has no police; from level 2 the police reach the whole race. Cop count, pursuit speed, beat, and roadblocks are race settings listed in `game-design.md` section 14; roadblocks come after the first career release. A level's plan id is the road id with the level, for example `slag-row-3`, and it keeps the road's seed so the scenery of the familiar part does not change.

### Roadblock spots

A roadblock sits on a straight of at least 400 m. It is at least 250 m past the end of the previous bend, at least 150 m before the start of the next bend or the finish line, never inside a dip, and never within 150 m after a crest from the tables below. At the Nera's 249 km/h, 250 m is 3.6 seconds of sightline. Every section with a `turnDegrees` other than zero counts as a bend for this rule, however gentle.

Each road has three spots, checked against the compiled sections at every level that uses them. A level uses the spots that exist on its road: one at level 3, two at level 4, three at level 5. Where a road has more spots than the level needs, the race seed picks.

## Breakwater Run (Salt Coast)

Breakwater Run goes from the harbour along the seawall, over the pier, and out round the harbour wall to the fish market, with the sea beside it nearly the whole way. It is the easiest road to see down and the gentlest on a light bike: the Wren takes all but four level-1 bends flat. Its character is rhythm, a long stretch of holding one line followed by a sudden demand. The signature moments are **the Long Sweeper**, 700 m of constant right-hand bend beside the water at a radius of about 739 m that every bike holds flat out and that is the best place on any road to fight side by side; **the tunnel**, 300 m of straight where engine noise doubles and oncoming headlights are all you see; and **the Lighthouse Kink**, a 55° left packed into 140 m right at the tunnel mouth, which a Sesta 600 holds at 102 km/h and a Wren at 117, and no faster. A rider who comes out of the tunnel flat out on any bike meets the lighthouse. Two crests, the Headland drop and the Seawall hump, launch at 176 and 169 km/h: a Wren at full stretch stays on the road over them, and anything from the Sesta up flies.

The pier is no longer the end. Halfway along it the road crosses **the Pier hump**, 1.4 m up and down in 80 m, which launches at 172 km/h; its top is 140 m before the old finish. The road runs off the pier onto **the Promenade**, 800 m of straight between the arcades counting the pier itself, where the first ramp stands between the same-way lanes, and over **the Marina bridge**, a crest that launches at 179 km/h, then round the yacht basin and out along the harbour wall. **The Mole** is 440 m of straight with spray on both sides and the second ramp on the line between the same-way lanes, and **the Harbour Arm** is the Long Sweeper's twin: 600 m of constant right at a radius of 752 m, flat out on every bike. At the end of the arm is **the Fort Gate**, a 58° left in 150 m at a radius of 104 m that a Sesta 600 holds at 103 km/h and a Wren at 118, so the road asks the same question as at the lighthouse: whoever comes off the sweeper flat out meets the fort. **The Battery crest** under the fort walls launches at 186 km/h, the road sweeps down to the quay, and **the Crane Kink**, a 46° left at a radius of 122 m (112 km/h on a Sesta, 129 on a Wren), comes 300 m before the finish at the fish market. The Wren brakes for four level-1 bends: the Lighthouse Kink, the 48° right after it, the Fort Gate, and the Crane Kink.

### Level 1 sections

| # | Starts at (m) | length | turnDegrees | climb | Note |
| --: | --: | --: | --: | --: | --- |
| 1 | 0 | 240 | 0 | 0 | Harbour start |
| 2 | 240 | 300 | -18 | 2 | Onto the seafront |
| 3 | 540 | 200 | 0 | 6 | Climb to the headland |
| 4 | 740 | 160 | 34 | 4 | Headland right |
| 5 | 900 | 120 | 0 | -12 | Headland drop; launches at 176 km/h |
| 6 | 1,020 | 220 | -42 | -4 | Left down to the beach |
| 7 | 1,240 | 700 | 38 | 0 | The Long Sweeper, along the water |
| 8 | 1,940 | 300 | 0 | 0 | Tunnel |
| 9 | 2,240 | 140 | -55 | 0 | Lighthouse Kink at the tunnel mouth; 102 km/h on a Sesta 600 |
| 10 | 2,380 | 160 | 48 | 2 | Right, recovering |
| 11 | 2,540 | 360 | 0 | 8 | Seawall climb |
| 12 | 2,900 | 100 | 0 | 6 | Seawall hump, rise |
| 13 | 3,000 | 100 | 0 | -9 | Seawall hump, drop; launches at 169 km/h |
| 14 | 3,100 | 300 | -26 | -5 | Sweeping left down to the pier |
| 15 | 3,400 | 200 | 30 | 0 | Pier approach |
| 16 | 3,600 | 120 | 0 | 0 | Along the pier |
| 17 | 3,720 | 40 | 0 | 1.4 | Pier hump, rise |
| 18 | 3,760 | 40 | 0 | -1.4 | Pier hump, drop; launches at 172 km/h |
| 19 | 3,800 | 100 | 0 | 0 | Along the pier, the old finish |
| 20 | 3,900 | 500 | 0 | 0 | The Promenade, between the arcades; ramp at 4,050 m |
| 21 | 4,400 | 260 | 22 | 2 | Easy right at the Ferris wheel |
| 22 | 4,660 | 180 | 0 | 6 | Climb to the Marina bridge |
| 23 | 4,840 | 100 | 0 | 5 | Marina bridge, rise |
| 24 | 4,940 | 100 | 0 | -8 | Marina bridge, drop; launches at 179 km/h |
| 25 | 5,040 | 240 | -48 | -3 | Left round the yacht basin |
| 26 | 5,280 | 440 | 0 | 0 | The Mole; ramp at 5,420 m |
| 27 | 5,720 | 600 | 32 | 0 | The Harbour Arm |
| 28 | 6,320 | 150 | -58 | 0 | Fort Gate at the end of the arm; 103 km/h on a Sesta 600 |
| 29 | 6,470 | 200 | 40 | 2 | Right under the fort walls |
| 30 | 6,670 | 260 | 0 | 4 | Climb along the battery |
| 31 | 6,930 | 110 | 0 | 5 | Battery crest, rise |
| 32 | 7,040 | 110 | 0 | -9 | Battery crest, drop; launches at 186 km/h |
| 33 | 7,150 | 300 | -24 | -4 | Sweeping left down to the quay |
| 34 | 7,450 | 250 | 30 | 0 | Right onto the quay |
| 35 | 7,700 | 360 | 0 | -2 | Quay straight |
| 36 | 8,060 | 140 | -46 | 0 | The Crane Kink; 112 km/h on a Sesta 600 |
| 37 | 8,200 | 300 | 0 | 0 | Finish at the fish market |

Total 8,500 m.

```ts
export const breakwaterRun: TrackPlan = {
  id: "breakwater-run",
  laneWidth: 3.6,
  leadInLength: 80,
  name: "Breakwater Run",
  runoffLength: 400,
  sections: [
    { climb: 0, length: 240, turnDegrees: 0 },
    { climb: 2, length: 300, turnDegrees: -18 },
    { climb: 6, length: 200, turnDegrees: 0 },
    { climb: 4, length: 160, turnDegrees: 34 },
    { climb: -12, length: 120, turnDegrees: 0 },
    { climb: -4, length: 220, turnDegrees: -42 },
    { climb: 0, length: 700, turnDegrees: 38 },
    { climb: 0, length: 300, turnDegrees: 0 },
    { climb: 0, length: 140, turnDegrees: -55 },
    { climb: 2, length: 160, turnDegrees: 48 },
    { climb: 8, length: 360, turnDegrees: 0 },
    { climb: 6, length: 100, turnDegrees: 0 },
    { climb: -9, length: 100, turnDegrees: 0 },
    { climb: -5, length: 300, turnDegrees: -26 },
    { climb: 0, length: 200, turnDegrees: 30 },
    { climb: 0, length: 120, turnDegrees: 0 },
    { climb: 1.4, length: 40, turnDegrees: 0 },
    { climb: -1.4, length: 40, turnDegrees: 0 },
    { climb: 0, length: 100, turnDegrees: 0 },
    { climb: 0, length: 500, turnDegrees: 0 },
    { climb: 2, length: 260, turnDegrees: 22 },
    { climb: 6, length: 180, turnDegrees: 0 },
    { climb: 5, length: 100, turnDegrees: 0 },
    { climb: -8, length: 100, turnDegrees: 0 },
    { climb: -3, length: 240, turnDegrees: -48 },
    { climb: 0, length: 440, turnDegrees: 0 },
    { climb: 0, length: 600, turnDegrees: 32 },
    { climb: 0, length: 150, turnDegrees: -58 },
    { climb: 2, length: 200, turnDegrees: 40 },
    { climb: 4, length: 260, turnDegrees: 0 },
    { climb: 5, length: 110, turnDegrees: 0 },
    { climb: -9, length: 110, turnDegrees: 0 },
    { climb: -4, length: 300, turnDegrees: -24 },
    { climb: 0, length: 250, turnDegrees: 30 },
    { climb: -2, length: 360, turnDegrees: 0 },
    { climb: 0, length: 140, turnDegrees: -46 },
    { climb: 0, length: 300, turnDegrees: 0 },
  ],
  seed: 0xb4_7a_c1,
  shoulderWidth: 0.9,
  trafficPerKilometre: 5,
  vergeWidth: 7,
};
```

### Levels 2 to 5

**Level 2 appends (1,150 m).** Past the fish market and into the cannery district: a 62° right at a radius of 104 m, a 48° left behind the sheds, and the 450 m cannery straight.

`[220, -20, 0], [180, 0, 4], [160, 62, 2], [140, -48, -2], [280, 0, -4], [170, 0, 0]`

**Level 3 appends (1,150 m).** The cliff road: a climb, a crest that launches at 169 km/h, and a 70° left at Gull Rock immediately after it.

`[320, 44, 6], [120, 0, 7], [100, 0, -9], [200, -70, -4], [240, 22, 0], [170, 0, 0]`

**Level 4 appends (1,150 m).** A third long sweeper, 500 m to the left this time, then the Boathouse Hairpin: 84° in 130 m at a radius of 62 m, 78 km/h on a Sesta 600.

`[500, -36, 0], [160, 0, 0], [130, 84, 3], [160, -40, 3], [200, 0, -6]`

**Level 5 appends (1,150 m).** The climb to the ferry: a crest that launches at 179 km/h, a 92° left falling toward the water at a radius of 74 m, and the finish at the ferry terminal.

`[200, 0, 10], [90, 0, 5], [100, 0, -8], [170, -92, -5], [140, 58, 0], [260, 30, 0], [190, 0, -2]`

### Crests

| Crest           | Level |       At | Sections | Launches at |
| --------------- | ----: | -------: | -------- | ----------: |
| Headland drop   |     1 |   0.9 km | 5        |    176 km/h |
| Seawall hump    |     1 |   3.0 km | 12, 13   |    169 km/h |
| Pier hump       |     1 |  3.76 km | 17, 18   |    172 km/h |
| Marina bridge   |     1 |  4.94 km | 23, 24   |    179 km/h |
| Battery crest   |     1 |  7.04 km | 31, 32   |    186 km/h |
| Gull Rock crest |     3 | 10.09 km | 45, 46   |    169 km/h |
| Ferry crest     |     5 | 12.24 km | 56, 57   |    179 km/h |

No crest on Breakwater Run launches below 160 km/h.

### Ramps

| Ramp | From level | Toe at (m) | Lip at (m) | x (m) | Length × width × rise | Reserved (m) | Where |
| --- | --: | --: | --: | --: | --- | --- | --- |
| `promenade-ramp` | 1 | 4,050 | 4,066 | 3.6 | 16 × 1.4 × 0.8 m | 3,970 to 4,246 | The Promenade (section 20), between the same-way lanes |
| `mole-ramp` | 1 | 5,420 | 5,436 | 3.6 | 16 × 1.4 × 0.8 m | 5,340 to 5,616 | The Mole (section 26), between the same-way lanes |

The promenade ramp's approach starts 170 m past the bottom of the Pier hump.

Traffic per km by level: 5, 6, 7, 8, 9.

Roadblocks: the seawall climb at 2.8 km (260 m past the bend, 200 m before the top of the hump); the cannery straight at 9.45 km (250 m past the bend, 200 m before the next); and the ferry climb at 12.05 km, which needs level 5 (300 m past the bend, 190 m before the crest). Never in the tunnel or at its mouth. The Promenade and the Mole would hold a cruiser, but the road keeps its three spots.

## Cinder Wash (Cinder Flats)

Cinder Wash is the fast road: 2.5 km of near-straight across the dry lake before the first real bend. The danger is speed and air. **The three washes** are dips where the road drops into a dry stream bed and climbs out, each shorter and sharper than the one before. The first launches only above 205 km/h and the second above 182, both beyond a Wren, so at level 1 they are a lurch in the suspension and a warning. The third is **the Main Wash**, the road's signature: its lips launch at 154 km/h, so every bike but the Gutter Pup flies, and the question is who lands next to whom. Then comes **the Drag**, 760 m flat out, and at the end of it **the Mesa Hairpin**: 120° of right-hand bend at a radius of 67 m, which a Sesta 600 holds at 81 km/h and a Wren at 93. It is the hairpin after the straight, the hardest braking zone at level 1, and the place where slipstreaming rivals arrive too fast together. The road then climbs 22 m up the mesa, crosses a crest that launches only the fastest bikes (215 km/h), and falls in a long sweeper to the drive-in. Traffic is light, the verge is wide and open, and there is nothing to hit but the occasional cactus and each other.

The drive-in is no longer the end. The first ramp stands between the same-way lanes past the drive-in. Then the road drops onto **the Salt Pan**, 900 m of dead straight across the white crust. 100 m in, **the Pressure Ridge**, a 1.4 m buckle in the crust, launches at 172 km/h, and 220 m past it the second ramp stands on the line between the same-way lanes. From the start of the pan to the next real bend is 1.7 km without a turn of the bars. Halfway across is **the Ladder**: three short washes 40 m apart, each a little smaller than the last, launching at 196, 190, and 184 km/h. A Wren at 158 km/h rides through them on the suspension; a Sesta flat out rides the first two and hops the third; an Anvil or a Nera skips from rung to rung and lands each time next to whoever it took off beside. At the end of the 1.7 km is **the Boneyard Bend**, a 90° left at a radius of 94 m around the rows of parked bombers. A Wren holds it at 112 km/h, a Sesta 600 at 97, and an Anvil 1100 at 86, so it is the Mesa Hairpin's lesson again, at the end of a longer straight. The road then climbs a butte, crosses **the Butte crest** at 192 km/h, and falls 14 m in a long left to the finish at the Last Chance motel. The Wren brakes for only two level-1 bends, the Mesa Hairpin and the Boneyard Bend; a Sesta brakes for five and an Anvil for six.

### Level 1 sections

| # | Starts at (m) | length | turnDegrees | climb | Note |
| --: | --: | --: | --: | --: | --- |
| 1 | 0 | 400 | 0 | 0 | Start at the dead gas station |
| 2 | 400 | 600 | 8 | -6 | Long fall to the dry lake |
| 3 | 1,000 | 70 | 0 | -3 | First wash, down |
| 4 | 1,070 | 70 | 0 | 3 | First wash, up; launches at 205 km/h |
| 5 | 1,140 | 200 | 0 | 0 |  |
| 6 | 1,340 | 60 | 0 | -2.8 | Second wash, down |
| 7 | 1,400 | 60 | 0 | 2.8 | Second wash, up; launches at 182 km/h |
| 8 | 1,460 | 180 | 0 | 0 |  |
| 9 | 1,640 | 50 | 0 | -2.7 | Main Wash, down |
| 10 | 1,690 | 50 | 0 | 2.7 | Main Wash, up; the signature launch at 154 km/h |
| 11 | 1,740 | 760 | 0 | 2 | The Drag, 760 m flat out |
| 12 | 2,500 | 200 | 120 | 6 | Mesa Hairpin; 81 km/h on a Sesta 600 |
| 13 | 2,700 | 300 | 0 | 22 | Climb the mesa |
| 14 | 3,000 | 200 | -30 | 4 | Left along the rim |
| 15 | 3,200 | 120 | 0 | 5 | Mesa top, rise |
| 16 | 3,320 | 120 | 0 | -8 | Mesa top, drop; launches at 215 km/h |
| 17 | 3,440 | 400 | 24 | -20 | Sweeping descent off the mesa |
| 18 | 3,840 | 250 | -36 | 0 | Left at the cattle grid |
| 19 | 4,090 | 310 | 0 | 0 | Past the drive-in, the old finish; ramp at 4,250 m |
| 20 | 4,400 | 200 | 0 | 0 |  |
| 21 | 4,600 | 300 | -14 | -4 | Gentle left down to the salt pan |
| 22 | 4,900 | 100 | 0 | 0 | The Salt Pan, 900 m flat out |
| 23 | 5,000 | 40 | 0 | 1.4 | Pressure Ridge, rise |
| 24 | 5,040 | 40 | 0 | -1.4 | Pressure Ridge, drop; launches at 172 km/h |
| 25 | 5,080 | 720 | 0 | 0 | The Salt Pan; ramp at 5,300 m |
| 26 | 5,800 | 70 | 0 | -3.3 | The Ladder, first rung, down |
| 27 | 5,870 | 70 | 0 | 3.3 | First rung, up; launches at 196 km/h |
| 28 | 5,940 | 40 | 0 | 0 |  |
| 29 | 5,980 | 65 | 0 | -3 | Second rung, down |
| 30 | 6,045 | 65 | 0 | 3 | Second rung, up; launches at 190 km/h |
| 31 | 6,110 | 40 | 0 | 0 |  |
| 32 | 6,150 | 60 | 0 | -2.75 | Third rung, down |
| 33 | 6,210 | 60 | 0 | 2.75 | Third rung, up; launches at 184 km/h |
| 34 | 6,270 | 350 | 0 | 2 | Run-up to the boneyard |
| 35 | 6,620 | 210 | -90 | 0 | The Boneyard Bend; 97 km/h on a Sesta 600 |
| 36 | 6,830 | 300 | 0 | 0 | Past the bombers |
| 37 | 7,130 | 250 | 26 | 6 | Climbing right toward the butte |
| 38 | 7,380 | 200 | 0 | 8 | Climb the butte |
| 39 | 7,580 | 100 | 0 | 5 | Butte crest, rise |
| 40 | 7,680 | 100 | 0 | -7 | Butte crest, drop; launches at 192 km/h |
| 41 | 7,780 | 350 | -20 | -14 | Long descent left off the butte |
| 42 | 8,130 | 200 | 0 | 0 |  |
| 43 | 8,330 | 220 | 34 | 0 | Right at the motel sign |
| 44 | 8,550 | 300 | 0 | 0 | Finish at the Last Chance motel |

Total 8,850 m.

```ts
export const cinderWash: TrackPlan = {
  id: "cinder-wash",
  laneWidth: 3.8,
  leadInLength: 80,
  name: "Cinder Wash",
  runoffLength: 400,
  sections: [
    { climb: 0, length: 400, turnDegrees: 0 },
    { climb: -6, length: 600, turnDegrees: 8 },
    { climb: -3, length: 70, turnDegrees: 0 },
    { climb: 3, length: 70, turnDegrees: 0 },
    { climb: 0, length: 200, turnDegrees: 0 },
    { climb: -2.8, length: 60, turnDegrees: 0 },
    { climb: 2.8, length: 60, turnDegrees: 0 },
    { climb: 0, length: 180, turnDegrees: 0 },
    { climb: -2.7, length: 50, turnDegrees: 0 },
    { climb: 2.7, length: 50, turnDegrees: 0 },
    { climb: 2, length: 760, turnDegrees: 0 },
    { climb: 6, length: 200, turnDegrees: 120 },
    { climb: 22, length: 300, turnDegrees: 0 },
    { climb: 4, length: 200, turnDegrees: -30 },
    { climb: 5, length: 120, turnDegrees: 0 },
    { climb: -8, length: 120, turnDegrees: 0 },
    { climb: -20, length: 400, turnDegrees: 24 },
    { climb: 0, length: 250, turnDegrees: -36 },
    { climb: 0, length: 310, turnDegrees: 0 },
    { climb: 0, length: 200, turnDegrees: 0 },
    { climb: -4, length: 300, turnDegrees: -14 },
    { climb: 0, length: 100, turnDegrees: 0 },
    { climb: 1.4, length: 40, turnDegrees: 0 },
    { climb: -1.4, length: 40, turnDegrees: 0 },
    { climb: 0, length: 720, turnDegrees: 0 },
    { climb: -3.3, length: 70, turnDegrees: 0 },
    { climb: 3.3, length: 70, turnDegrees: 0 },
    { climb: 0, length: 40, turnDegrees: 0 },
    { climb: -3, length: 65, turnDegrees: 0 },
    { climb: 3, length: 65, turnDegrees: 0 },
    { climb: 0, length: 40, turnDegrees: 0 },
    { climb: -2.75, length: 60, turnDegrees: 0 },
    { climb: 2.75, length: 60, turnDegrees: 0 },
    { climb: 2, length: 350, turnDegrees: 0 },
    { climb: 0, length: 210, turnDegrees: -90 },
    { climb: 0, length: 300, turnDegrees: 0 },
    { climb: 6, length: 250, turnDegrees: 26 },
    { climb: 8, length: 200, turnDegrees: 0 },
    { climb: 5, length: 100, turnDegrees: 0 },
    { climb: -7, length: 100, turnDegrees: 0 },
    { climb: -14, length: 350, turnDegrees: -20 },
    { climb: 0, length: 200, turnDegrees: 0 },
    { climb: 0, length: 220, turnDegrees: 34 },
    { climb: 0, length: 300, turnDegrees: 0 },
  ],
  seed: 0xc1_d3_0a,
  shoulderWidth: 1.4,
  trafficPerKilometre: 3,
  vergeWidth: 14,
};
```

### Levels 2 to 5

**Level 2 appends (1,150 m).** A fourth wash (163 km/h) and a 72° right around the water tower at a radius of 89 m.

`[420, 0, 0], [60, 0, -3.5], [60, 0, 3.5], [300, -28, 0], [160, 72, 2], [150, 0, 0]`

**Level 3 appends (1,150 m).** A second drag, 560 m, into the Corral: a 110° left at a radius of 80 m, then a crest that launches at 203 km/h.

`[560, 0, -2], [220, -110, 4], [130, 0, 6], [80, 0, 4], [100, 0, -6], [60, 0, 0]`

**Level 4 appends (1,150 m).** Twin washes back to back (190 and 170 km/h), so a fast bike lands from one and takes off from the next, then a 100° left at a radius of 68 m.

`[330, 18, -10], [65, 0, -3], [65, 0, 3], [60, 0, -3.2], [60, 0, 3.2], [220, 0, 0], [170, -100, 0], [180, 0, 0]`

**Level 5 appends (1,150 m).** The last drag into the tightest bend in the game, a 130° right at a radius of 56 m (74 km/h on a Sesta 600), then a climb, a crest at 169 km/h, and a 50° left down to the airstrip finish.

`[380, 0, 0], [180, 130, 8], [160, 0, 10], [90, 0, 5], [100, 0, -9], [140, -50, -6], [100, 0, 0]`

### Crests

| Crest               | Level |       At | Sections |          Launches at |
| ------------------- | ----: | -------: | -------- | -------------------: |
| First wash          |     1 |  1.14 km | 3, 4     |             205 km/h |
| Second wash         |     1 |  1.46 km | 6, 7     |             182 km/h |
| Main Wash           |     1 |  1.74 km | 9, 10    | 154 km/h (signature) |
| Mesa top            |     1 |  3.32 km | 15, 16   |             215 km/h |
| Pressure Ridge      |     1 |  5.04 km | 23, 24   |             172 km/h |
| The Ladder, first   |     1 |  5.94 km | 26, 27   |             196 km/h |
| The Ladder, second  |     1 |  6.11 km | 29, 30   |             190 km/h |
| The Ladder, third   |     1 |  6.27 km | 32, 33   |             184 km/h |
| Butte crest         |     1 |  7.68 km | 39, 40   |             192 km/h |
| Fourth wash         |     2 |  9.39 km | 46, 47   |             163 km/h |
| Corral crest        |     3 | 10.99 km | 54, 55   |             203 km/h |
| Twin washes, first  |     4 | 11.61 km | 58, 59   |             190 km/h |
| Twin washes, second |     4 | 11.73 km | 60, 61   |             170 km/h |
| Airstrip climb      |     5 | 13.02 km | 67       |             257 km/h |
| Airstrip crest      |     5 | 13.11 km | 68, 69   |             169 km/h |

The Main Wash is the only crest on Cinder Wash that launches below 160 km/h.

### Ramps

| Ramp | From level | Toe at (m) | Lip at (m) | x (m) | Length × width × rise | Reserved (m) | Where |
| --- | --: | --: | --: | --: | --- | --- | --- |
| `drive-in-ramp` | 1 | 4,250 | 4,268 | 3.8 | 18 × 1.4 × 1 m | 4,170 to 4,465 | Past the drive-in (section 19), between the same-way lanes |
| `salt-pan-ramp` | 1 | 5,300 | 5,318 | 3.8 | 18 × 1.4 × 1 m | 5,220 to 5,515 | The Salt Pan (section 25), between the same-way lanes |

Cinder Wash's ramps are the only ones 18 m long and 1 m high, so their lips are steeper than the rest, at 0.111, and their landing corridors are 197 m. The drive-in ramp's landing runs over the old finish line at 4,400 m, and the salt pan ramp's approach starts 140 m past the bottom of the Pressure Ridge.

Traffic per km by level: 3, 4, 5, 6, 7.

Roadblocks: the Drag at 1.9 km (160 m past the lip of the Main Wash, 600 m before the hairpin); the straight past the Last Chance motel at 9.05 km (500 m past the right at the motel sign, 220 m before the fourth wash); and the second drag at 10.25 km (400 m past the water tower, 310 m before the Corral). All three exist from level 3. Never inside a wash. The Salt Pan would hold a cruiser, but the road keeps its three spots.

## Hollow Pine Road (Kettle Woods)

Hollow Pine Road is the technical road: the shortest, the narrowest (3.4 m lanes and a 5 m verge with trees at the edge of it), and at level 1 never straight for more than 380 m. Twenty-four bends in 8.05 km, nineteen of which a Sesta 600 cannot take flat and twelve of which even a Wren cannot; ten in the first 3.6 km, eight of them not flat on a Sesta. Its signature is the **blind crest** at 0.96 km: the road rises 6 m, drops away, and the 44° right that follows is hidden until the bike is over the top. The crest only launches above 207 km/h, so at level 1 it hides the bend without throwing anyone at it. After it come **the Esses**, a left and a right at radii of 120 and 127 m with no straight between them, where a shove sends a rider into the pines. **Logjam Left** is a 60° bend at the bottom of a long descent, **the Hummocks** are a double crest that launches at 186 km/h, and the **covered bridge** is 220 m of straight in a timber tunnel. **The Sawmill Hook**, 64° at a radius of 88 m, 94 km/h on a Sesta and 108 on a Wren, 380 m before the old finish in the sawmill yard, is still the tightest bend at level 1. Fog limits sight to about 350 m. Log trucks make the traffic slow and long.

The sawmill yard is no longer the end. The road leaves it into **the Chapel Bends**, a 48° right and a 44° left at radii of 134 and 128 m with no straight between them (118 and 115 km/h on a Sesta), past the burnt-out chapel. It climbs along the dam to **the Spillway crest**, which launches only above 207 km/h, and drops to **the Widowmaker**, a 52° right at a radius of 108 m around a lone dead pine that leans over the road (105 km/h on a Sesta). **The Flume** is 350 m of falling straight beside the log flume, and it ends in a 66° left at a radius of 115 m. **The Windfall crest** launches at 192 km/h between storm-felled trunks, and **the Ranger's Elbow**, a 58° left at a radius of 97 m (99 km/h on a Sesta), is followed at once by a 50° right. **The trestle** is 240 m of straight on timber over the gorge. The last bend is **the Kiln Hook**, 66° at a radius of 91 m, 96 km/h on a Sesta, 380 m before the finish at the charcoal kilns: like the Sawmill Hook before it, the place where a lead is lost. The Wren brakes for twelve of the twenty-four level-1 bends, every one with a radius under 175 m.

### Level 1 sections

| # | Starts at (m) | length | turnDegrees | climb | Note |
| --: | --: | --: | --: | --: | --- |
| 1 | 0 | 260 | 0 | 0 | Start at the ranger station |
| 2 | 260 | 200 | -20 | 0 | Gentle left into the trees |
| 3 | 460 | 180 | 30 | 3 | S-bend, right |
| 4 | 640 | 180 | -34 | 3 | S-bend, left |
| 5 | 820 | 140 | 0 | 6 | Blind crest, rise |
| 6 | 960 | 100 | 0 | -6 | Blind crest, drop; launches at 207 km/h |
| 7 | 1,060 | 160 | 44 | -3 | Right hander hidden by the crest |
| 8 | 1,220 | 120 | -40 | 0 | Esses, left |
| 9 | 1,340 | 120 | 38 | 0 | Esses, right |
| 10 | 1,460 | 340 | 0 | -8 | Long descent |
| 11 | 1,800 | 220 | -60 | -4 | Logjam Left |
| 12 | 2,020 | 160 | 0 | 4 | Hummocks, rise |
| 13 | 2,180 | 90 | 0 | 5 | Hummocks, second rise |
| 14 | 2,270 | 90 | 0 | -6 | Hummocks, drop; launches at 186 km/h |
| 15 | 2,360 | 300 | 32 | -2 | Right through the clearing |
| 16 | 2,660 | 200 | -28 | 0 | Left along the creek |
| 17 | 2,860 | 220 | 0 | 0 | Covered bridge |
| 18 | 3,080 | 140 | 64 | 0 | Sawmill Hook; 94 km/h on a Sesta 600 |
| 19 | 3,220 | 380 | 0 | 0 | Through the sawmill yard, the old finish |
| 20 | 3,600 | 200 | -26 | 0 | Left out of the yard |
| 21 | 3,800 | 180 | 0 | -4 |  |
| 22 | 3,980 | 160 | 48 | -3 | Chapel Bends, right; 118 km/h on a Sesta 600 |
| 23 | 4,140 | 140 | -44 | -2 | Chapel Bends, left; 115 km/h on a Sesta 600 |
| 24 | 4,280 | 200 | 0 | 2 |  |
| 25 | 4,480 | 260 | 18 | 6 | Climbing along the dam |
| 26 | 4,740 | 100 | 0 | 4 | Spillway crest, rise |
| 27 | 4,840 | 100 | 0 | -6 | Spillway crest, drop; launches at 207 km/h |
| 28 | 4,940 | 220 | -30 | -4 | Left below the dam |
| 29 | 5,160 | 140 | 52 | 0 | The Widowmaker; 105 km/h on a Sesta 600 |
| 30 | 5,300 | 350 | 0 | -6 | The Flume |
| 31 | 5,650 | 190 | -66 | -4 | Left at the foot of the flume; 109 km/h on a Sesta 600 |
| 32 | 5,840 | 220 | 24 | 0 |  |
| 33 | 6,060 | 260 | -36 | 3 | Climbing left |
| 34 | 6,320 | 140 | 0 | 5 | Windfall crest, rise |
| 35 | 6,460 | 100 | 0 | -7 | Windfall crest, drop; launches at 192 km/h |
| 36 | 6,560 | 220 | 30 | -3 |  |
| 37 | 6,780 | 140 | -58 | 0 | The Ranger's Elbow; 99 km/h on a Sesta 600 |
| 38 | 6,920 | 160 | 50 | 0 | Right out of the Elbow; 115 km/h on a Sesta 600 |
| 39 | 7,080 | 240 | 0 | 0 | The trestle |
| 40 | 7,320 | 200 | -28 | 0 |  |
| 41 | 7,520 | 150 | 66 | 0 | The Kiln Hook; 96 km/h on a Sesta 600 |
| 42 | 7,670 | 380 | 0 | 0 | Finish at the charcoal kilns |

Total 8,050 m.

```ts
export const hollowPineRoad: TrackPlan = {
  id: "hollow-pine-road",
  laneWidth: 3.4,
  leadInLength: 80,
  name: "Hollow Pine Road",
  runoffLength: 400,
  sections: [
    { climb: 0, length: 260, turnDegrees: 0 },
    { climb: 0, length: 200, turnDegrees: -20 },
    { climb: 3, length: 180, turnDegrees: 30 },
    { climb: 3, length: 180, turnDegrees: -34 },
    { climb: 6, length: 140, turnDegrees: 0 },
    { climb: -6, length: 100, turnDegrees: 0 },
    { climb: -3, length: 160, turnDegrees: 44 },
    { climb: 0, length: 120, turnDegrees: -40 },
    { climb: 0, length: 120, turnDegrees: 38 },
    { climb: -8, length: 340, turnDegrees: 0 },
    { climb: -4, length: 220, turnDegrees: -60 },
    { climb: 4, length: 160, turnDegrees: 0 },
    { climb: 5, length: 90, turnDegrees: 0 },
    { climb: -6, length: 90, turnDegrees: 0 },
    { climb: -2, length: 300, turnDegrees: 32 },
    { climb: 0, length: 200, turnDegrees: -28 },
    { climb: 0, length: 220, turnDegrees: 0 },
    { climb: 0, length: 140, turnDegrees: 64 },
    { climb: 0, length: 380, turnDegrees: 0 },
    { climb: 0, length: 200, turnDegrees: -26 },
    { climb: -4, length: 180, turnDegrees: 0 },
    { climb: -3, length: 160, turnDegrees: 48 },
    { climb: -2, length: 140, turnDegrees: -44 },
    { climb: 2, length: 200, turnDegrees: 0 },
    { climb: 6, length: 260, turnDegrees: 18 },
    { climb: 4, length: 100, turnDegrees: 0 },
    { climb: -6, length: 100, turnDegrees: 0 },
    { climb: -4, length: 220, turnDegrees: -30 },
    { climb: 0, length: 140, turnDegrees: 52 },
    { climb: -6, length: 350, turnDegrees: 0 },
    { climb: -4, length: 190, turnDegrees: -66 },
    { climb: 0, length: 220, turnDegrees: 24 },
    { climb: 3, length: 260, turnDegrees: -36 },
    { climb: 5, length: 140, turnDegrees: 0 },
    { climb: -7, length: 100, turnDegrees: 0 },
    { climb: -3, length: 220, turnDegrees: 30 },
    { climb: 0, length: 140, turnDegrees: -58 },
    { climb: 0, length: 160, turnDegrees: 50 },
    { climb: 0, length: 240, turnDegrees: 0 },
    { climb: 0, length: 200, turnDegrees: -28 },
    { climb: 0, length: 150, turnDegrees: 66 },
    { climb: 0, length: 380, turnDegrees: 0 },
  ],
  seed: 0x4f_17_e2,
  shoulderWidth: 0.6,
  trafficPerKilometre: 6,
  vergeWidth: 5,
};
```

### Levels 2 to 5

Level 1 has no straight long enough for a roadblock, and it does not need one. Each of levels 3, 4, and 5 adds one long straight to the road, and that straight is where the level's new roadblock lives.

**Level 2 appends (1,150 m).** A crest that launches at 173 km/h with a 62° left hidden behind it.

`[200, -36, 2], [150, 40, 2], [120, 0, 6], [90, 0, -7], [150, -62, -3], [250, 20, -2], [190, 0, 0]`

**Level 3 appends (1,150 m).** A tight S at 52° each way, a crest at 176 km/h, a 70° right, and **the Firebreak**: 475 m of falling straight through a cut in the trees, the first place on the road to use a fast bike's top speed.

`[160, 52, 0], [140, -52, 0], [110, 0, 5], [85, 0, -6], [180, 70, -2], [475, 0, -6]`

**Level 4 appends (1,150 m).** A climbing left, the sharpest blind crest on the road (170 km/h) into a 78° left at a radius of 67 m, a 66° right, and **the Cutline**, a 485 m straight under the power lines.

`[200, -24, 8], [100, 0, 6], [95, 0, -8], [130, -78, -4], [140, 66, 0], [485, 0, -2]`

**Level 5 appends (1,150 m).** Two linked bends, a 420 m climb to a last crest at 162 km/h, and a 90° left at a radius of 67 m to the finish at the lake.

`[160, 46, -4], [140, -58, -2], [420, 0, 6], [90, 0, 5], [90, 0, -8], [150, -90, -3], [100, 0, 0]`

### Crests

| Crest               | Level |       At | Sections | Launches at |
| ------------------- | ----: | -------: | -------- | ----------: |
| Blind crest         |     1 |  0.96 km | 5, 6     |    207 km/h |
| Hummocks            |     1 |  2.27 km | 13, 14   |    186 km/h |
| Spillway crest      |     1 |  4.84 km | 26, 27   |    207 km/h |
| Windfall crest      |     1 |  6.46 km | 34, 35   |    192 km/h |
| Level-2 crest       |     2 |  8.52 km | 45, 46   |    173 km/h |
| Level-3 crest       |     3 |  9.61 km | 52, 53   |    176 km/h |
| Level-4 blind crest |     4 | 10.65 km | 57, 58   |    170 km/h |
| Lake crest          |     5 | 12.31 km | 65, 66   |    162 km/h |

No crest on Hollow Pine Road launches below 160 km/h.

### Ramps

| Ramp | From level | Toe at (m) | Lip at (m) | x (m) | Length × width × rise | Reserved (m) | Where |
| --- | --: | --: | --: | --: | --- | --- | --- |
| `sawmill-ramp` | 1 | 3,330 | 3,346 | 3.45 | 16 × 1 × 0.8 m | 3,250 to 3,526 | The sawmill yard (section 19), 110 m past the Sawmill Hook, by the kerb |
| `kiln-ramp` | 1 | 7,760 | 7,776 | 3.45 | 16 × 1 × 0.8 m | 7,680 to 7,956 | The finish straight at the charcoal kilns (section 42), 90 m past the Kiln Hook, by the kerb |

Hollow Pine Road has no straight longer than 380 m at level 1, so both ramps sit on the two 380 m straights after its hooks, and the kiln ramp's landing ends 94 m before the finish. The road is 8 m wide, so each ramp stands between the same-way lane and the kerb, 1 m wide, with 0.05 m between it and a truck's side and 0.55 m between its outer edge and the edge of the road.

Traffic per km by level: 6, 7, 8, 9, 10.

Roadblocks: the Firebreak at 10.15 km, from level 3 (275 m past the 70° right, 200 m before the level-3 finish and before the next bend at later levels); the Cutline at 11.3 km, from level 4 (285 m past the bend, 200 m before the level-4 finish and before the next bend at level 5); and the lake climb at 12.1 km at level 5 (300 m past the bend, 210 m before the top of the crest). Never in the covered bridge or on the trestle.

## Slag Row (Lowtown)

Slag Row is the stop-and-go road. Long straights through the port end in right-angle corners at radii near 70 m, which even the Wren must brake for (95 to 97 km/h) and a Sesta 600 holds at 83 to 85 km/h. It has two lanes like every other road; it feels wide because the buildings stand back and the straights are long. Three corners, **Foundry Corner**, **Canal Corner**, and **Smelter Gate**, set the rhythm: sprint, brake, turn, sprint. Between them, **the rail crossing** is a 60 m hump and the road's signature launch at 152 km/h, so every bike but the Gutter Pup hops it at full speed, and **the underpass** is a dip under the freeway that compresses the suspension and hides what is coming up the far side. **The scrapyard chicane** flicks right and left at 46° each, and **the drawbridge** is a 10 m ramp with a crest at the top that launches at 166 km/h. Traffic is the heaviest of any road and includes buses and vans that block the view. The old finish was 310 m after Smelter Gate.

The smelter is no longer the end. Past it the road runs along the slag heaps and keeps the rhythm with four more right angles. **Coke Oven Corner** is an 88° left at a radius of 73 m after a 710 m sprint from Smelter Gate over **the Slag Heap hump**, which rises across the old finish line and launches at 163 km/h. **The Slipway**, 560 m along the shipyard where hulls stand over the road, has a ramp on the line between the same-way lanes and ends in **Dry Dock Corner**, a 92° right at a radius of 70 m and the tightest bend on the level-1 road: 95 km/h on a Wren and 83 on a Sesta 600. **The Gasholder Esses** are a second, gentler chicane, 40° each way at radii of 180 and 160 m, which a Wren holds at 160 and 150 km/h, so even the Wren brakes for the second; a Sesta holds 139 and 130, an Anvil 1100 122 and 115. **The ore bridge** climbs 12 m over the ore railway to a crest that launches at 176 km/h, and the road comes down off it to **Customs Corner**, a 90° left at a radius of 71 m. A second ramp stands between the same-way lanes on the bonded straight after it. The last corner is **the Dock Gate**, an 88° right at a radius of 73 m, and the finish at the dry dock is 360 m after it, close enough that the exit of the last corner decides the race.

### Level 1 sections

| # | Starts at (m) | length | turnDegrees | climb | Note |
| --: | --: | --: | --: | --: | --- |
| 1 | 0 | 320 | 0 | 0 | Start under the gantry cranes |
| 2 | 320 | 160 | 88 | 0 | Foundry Corner |
| 3 | 480 | 480 | 0 | 0 | Warehouse straight |
| 4 | 960 | 30 | 0 | 1 | Rail crossing, rise |
| 5 | 990 | 30 | 0 | -1 | Rail crossing, drop; the signature launch at 152 km/h |
| 6 | 1,020 | 440 | -20 | 0 | Long left drift past the depot |
| 7 | 1,460 | 120 | 0 | -5 | Underpass, down |
| 8 | 1,580 | 120 | 0 | 5 | Underpass, up |
| 9 | 1,700 | 160 | -90 | 0 | Canal Corner |
| 10 | 1,860 | 560 | 0 | 2 | Canal straight along the docks |
| 11 | 2,420 | 200 | 46 | 0 | Scrapyard chicane, right |
| 12 | 2,620 | 150 | -46 | 0 | Scrapyard chicane, left |
| 13 | 2,770 | 300 | 0 | 10 | Bridge ramp |
| 14 | 3,070 | 80 | 0 | 4 | Drawbridge, rise |
| 15 | 3,150 | 80 | 0 | -6 | Drawbridge, drop; launches at 166 km/h |
| 16 | 3,230 | 300 | -10 | -8 | Down off the bridge |
| 17 | 3,530 | 160 | 90 | 0 | Smelter Gate |
| 18 | 3,690 | 290 | 0 | 0 | Past the smelter |
| 19 | 3,980 | 38 | 0 | 1.4 | Slag Heap hump, rise; the old finish is at 4,000 m |
| 20 | 4,018 | 38 | 0 | -1.4 | Slag Heap hump, drop; launches at 163 km/h |
| 21 | 4,056 | 344 | 0 | 0 | Along the slag heaps |
| 22 | 4,400 | 160 | -88 | 0 | Coke Oven Corner |
| 23 | 4,560 | 560 | 0 | 0 | The Slipway; ramp at 4,720 m |
| 24 | 5,120 | 160 | 92 | 0 | Dry Dock Corner; 83 km/h on a Sesta 600 |
| 25 | 5,280 | 330 | 0 | 2 |  |
| 26 | 5,610 | 180 | 40 | 0 | Gasholder Esses, right |
| 27 | 5,790 | 160 | -40 | 0 | Gasholder Esses, left |
| 28 | 5,950 | 260 | 0 | 8 | Ore bridge ramp |
| 29 | 6,210 | 85 | 0 | 4 | Ore bridge, rise |
| 30 | 6,295 | 85 | 0 | -6 | Ore bridge, drop; launches at 176 km/h |
| 31 | 6,380 | 300 | -12 | -6 | Down off the ore bridge |
| 32 | 6,680 | 300 | 0 | 0 |  |
| 33 | 6,980 | 160 | -90 | 0 | Customs Corner |
| 34 | 7,140 | 400 | 0 | 0 | Bonded straight; ramp at 7,280 m |
| 35 | 7,540 | 200 | 30 | 0 |  |
| 36 | 7,740 | 240 | 0 | 0 |  |
| 37 | 7,980 | 160 | 88 | 0 | The Dock Gate |
| 38 | 8,140 | 360 | 0 | 0 | Finish at the dry dock |

Total 8,500 m.

```ts
export const slagRow: TrackPlan = {
  id: "slag-row",
  laneWidth: 3.5,
  leadInLength: 80,
  name: "Slag Row",
  runoffLength: 400,
  sections: [
    { climb: 0, length: 320, turnDegrees: 0 },
    { climb: 0, length: 160, turnDegrees: 88 },
    { climb: 0, length: 480, turnDegrees: 0 },
    { climb: 1, length: 30, turnDegrees: 0 },
    { climb: -1, length: 30, turnDegrees: 0 },
    { climb: 0, length: 440, turnDegrees: -20 },
    { climb: -5, length: 120, turnDegrees: 0 },
    { climb: 5, length: 120, turnDegrees: 0 },
    { climb: 0, length: 160, turnDegrees: -90 },
    { climb: 2, length: 560, turnDegrees: 0 },
    { climb: 0, length: 200, turnDegrees: 46 },
    { climb: 0, length: 150, turnDegrees: -46 },
    { climb: 10, length: 300, turnDegrees: 0 },
    { climb: 4, length: 80, turnDegrees: 0 },
    { climb: -6, length: 80, turnDegrees: 0 },
    { climb: -8, length: 300, turnDegrees: -10 },
    { climb: 0, length: 160, turnDegrees: 90 },
    { climb: 0, length: 290, turnDegrees: 0 },
    { climb: 1.4, length: 38, turnDegrees: 0 },
    { climb: -1.4, length: 38, turnDegrees: 0 },
    { climb: 0, length: 344, turnDegrees: 0 },
    { climb: 0, length: 160, turnDegrees: -88 },
    { climb: 0, length: 560, turnDegrees: 0 },
    { climb: 0, length: 160, turnDegrees: 92 },
    { climb: 2, length: 330, turnDegrees: 0 },
    { climb: 0, length: 180, turnDegrees: 40 },
    { climb: 0, length: 160, turnDegrees: -40 },
    { climb: 8, length: 260, turnDegrees: 0 },
    { climb: 4, length: 85, turnDegrees: 0 },
    { climb: -6, length: 85, turnDegrees: 0 },
    { climb: -6, length: 300, turnDegrees: -12 },
    { climb: 0, length: 300, turnDegrees: 0 },
    { climb: 0, length: 160, turnDegrees: -90 },
    { climb: 0, length: 400, turnDegrees: 0 },
    { climb: 0, length: 200, turnDegrees: 30 },
    { climb: 0, length: 240, turnDegrees: 0 },
    { climb: 0, length: 160, turnDegrees: 88 },
    { climb: 0, length: 360, turnDegrees: 0 },
  ],
  seed: 0x5a_9c_33,
  shoulderWidth: 0.5,
  trafficPerKilometre: 8,
  vergeWidth: 6,
};
```

### Levels 2 to 5

**Level 2 appends (1,150 m).** A 90° left at a radius of 67 m and a second rail crossing, longer and gentler than the first (178 km/h).

`[290, 0, 0], [150, -90, 0], [260, 0, -4], [35, 0, 1], [35, 0, -1], [200, 40, 4], [180, 0, 0]`

**Level 3 appends (1,150 m).** The flyover: a crest at 173 km/h, a 92° right, and a 400 m boulevard.

`[220, 0, 6], [80, 0, 4], [90, 0, -7], [200, -26, -3], [160, 92, 0], [400, 0, 0]`

**Level 4 appends (1,150 m).** An 88° left in 130 m (radius 59 m), a third chicane, and a second underpass. The boulevard ramp stands on the block's first straight, which carries on from the level-3 boulevard.

`[340, 0, 0], [130, -88, 0], [160, 50, 0], [140, -50, 0], [120, 0, -5], [120, 0, 5], [140, 0, 0]`

**Level 5 appends (1,150 m).** The freeway ramp with a crest at 169 km/h, a 95° right at a radius of 63 m, and the finish at the container terminal.

`[300, 0, 8], [90, 0, 5], [100, 0, -9], [220, -12, -4], [150, 95, 0], [150, -40, 0], [140, 0, 0]`

### Crests

| Crest                | Level |       At | Sections |          Launches at |
| -------------------- | ----: | -------: | -------- | -------------------: |
| Rail crossing        |     1 |  0.99 km | 4, 5     | 152 km/h (signature) |
| Drawbridge           |     1 |  3.15 km | 14, 15   |             166 km/h |
| Slag Heap hump       |     1 |  4.02 km | 19, 20   |             163 km/h |
| Ore bridge           |     1 |  6.30 km | 29, 30   |             176 km/h |
| Second rail crossing |     2 |  9.24 km | 42, 43   |             178 km/h |
| Flyover              |     3 |  9.95 km | 47, 48   |             173 km/h |
| Freeway ramp         |     5 | 12.34 km | 60, 61   |             169 km/h |

The rail crossing is the only crest on Slag Row that launches below 160 km/h. The two underpasses need more than 270 km/h at their lips.

### Ramps

| Ramp | From level | Toe at (m) | Lip at (m) | x (m) | Length × width × rise | Reserved (m) | Where |
| --- | --: | --: | --: | --: | --- | --- | --- |
| `slipway-ramp` | 1 | 4,720 | 4,736 | 3.5 | 16 × 1.4 × 0.8 m | 4,640 to 4,916 | The Slipway (section 23), between the same-way lanes |
| `bonded-ramp` | 1 | 7,280 | 7,296 | 3.5 | 16 × 1.4 × 0.8 m | 7,200 to 7,476 | The bonded straight (section 34), between the same-way lanes |
| `boulevard-ramp` | 4 | 10,880 | 10,896 | 3.5 | 16 × 1.4 × 0.8 m | 10,800 to 11,076 | The straight past the boulevard (section 52), between the same-way lanes |

The boulevard ramp's approach starts at the level-3 finish, so it exists from level 4. It starts 150 m past the boulevard's roadblock spot at 10.65 km and its landing ends 64 m before the 88° left.

Traffic per km by level: 8, 9, 10, 11, 12.

Roadblocks: the warehouse straight at 0.75 km (270 m past Foundry Corner, 210 m before the rail crossing); the canal straight at 2.15 km (290 m past Canal Corner, 270 m before the chicane); and the boulevard at 10.65 km (250 m past the 92° right, 150 m before the level-3 finish, and 490 m before the next bend at later levels). All three exist from level 3. The Slipway would hold a cruiser, but the road keeps its three spots.

## Ridge Road (Stonepeak)

Ridge Road's first 4.25 km are the existing track: ten bends and two crests on the climb to the lookout. Those sections are unchanged. Its rocks are not quite the greybox's: they moved to their own seeded stream so that a longer road keeps the scenery of the part the player knows, and that changed 34 rocks into 35. The track tests pin those first 4,250 m as they compiled before the road was lengthened, by digest: curvature, heights, centre line, crests, every prop, and the rocks by themselves. It is the balanced road and the home road. On a Wren seven level-1 bends are not flat; on a Sesta 600 ten; on an Anvil 1100 seventeen. The signature moments are **the Switchback**, a 44° left straight into a 50° right at radii of 155 and 136 m, where the left is the first bend on the road the Wren cannot take flat (147 km/h) and the right (137 km/h on a Wren, 119 on a Sesta) is the first it must brake hard for; **the Saddle**, a 90 m rise and 90 m drop at 2.19 km that launches at 162 km/h with bare rock on both sides, just above the Wren's 158 km/h, so at level 1 it is a lurch and from the Kite up a flight; **Quarry Bend**, a 42° right at a radius of 143 m that a Sesta holds at 123 km/h; and **the Hump**, a second, gentler crest before the lookout that only launches above 211 km/h. Its name stays. It is the finale at level 5, where it is called the Long Ridge.

The lookout is no longer the end. Past it the road takes **the Cornice**, 450 m of sweeping left along the cliff edge at a radius of 531 m, flat out on every bike with the drop on the outside, then a right and a left at radii of 157 and 160 m that a Wren holds at 148 and 150 km/h and a Sesta at 129 and 130, so no bike takes them flat. It climbs 16 m to **the Notch**, a crest cut through the rock that launches at 179 km/h, falls into **Hermit's Bend**, a 52° left at a radius of 139 m (121 km/h on a Sesta 600, 139 on a Wren), and runs through **the Snow Shed**, 240 m of avalanche gallery where the light flickers between the pillars. **The Gendarme** is a 44° right at a radius of 137 m around a rock pinnacle, 120 km/h on a Sesta, the Switchback's right again. **The Knuckle** is a last small crest that launches only above 228 km/h, and the finish is at the cable-car station. No new crest launches below the Saddle.

### Level 1 sections

| # | Starts at (m) | length | turnDegrees | climb | Note |
| --: | --: | --: | --: | --: | --- |
| 1 | 0 | 220 | 0 | 0 | Start straight below the ridge |
| 2 | 220 | 260 | 22 | 4 | Easy right, climbing |
| 3 | 480 | 180 | 0 | 8 |  |
| 4 | 660 | 240 | -38 | 6 | Left over the shoulder |
| 5 | 900 | 160 | 0 | -9 |  |
| 6 | 1,060 | 300 | 48 | -4 | Long right, falling |
| 7 | 1,360 | 140 | 0 | 3 |  |
| 8 | 1,500 | 170 | -44 | 0 | Switchback left |
| 9 | 1,670 | 170 | 50 | 2 | Switchback right; 119 km/h on a Sesta 600 |
| 10 | 1,840 | 260 | 0 | 10 | Climb to the Saddle |
| 11 | 2,100 | 90 | 0 | 7 | The Saddle, rise |
| 12 | 2,190 | 90 | 0 | -8 | The Saddle, drop; the signature launch at 162 km/h |
| 13 | 2,280 | 320 | -30 | -10 | Long descending left |
| 14 | 2,600 | 200 | 16 | 3 |  |
| 15 | 2,800 | 150 | 42 | 0 | Quarry Bend; 123 km/h on a Sesta 600 |
| 16 | 2,950 | 240 | 0 | -6 |  |
| 17 | 3,190 | 280 | -52 | 8 | Climbing left 52 degrees |
| 18 | 3,470 | 110 | 0 | 6 | The Hump, rise |
| 19 | 3,580 | 110 | 0 | -7 | The Hump, drop; launches at 211 km/h |
| 20 | 3,690 | 260 | 26 | 0 | Run toward the lookout |
| 21 | 3,950 | 300 | 0 | -3 | Past the lookout, the old finish |
| 22 | 4,250 | 100 | 0 | 0 |  |
| 23 | 4,350 | 450 | -34 | 4 | The Cornice |
| 24 | 4,800 | 200 | 0 | 6 |  |
| 25 | 5,000 | 180 | 46 | 4 | Right off the cliff edge |
| 26 | 5,180 | 160 | -40 | 0 | Left |
| 27 | 5,340 | 280 | 0 | 10 | Climb to the Notch |
| 28 | 5,620 | 100 | 0 | 6 | The Notch, rise |
| 29 | 5,720 | 100 | 0 | -8 | The Notch, drop; launches at 179 km/h |
| 30 | 5,820 | 240 | 0 | -10 | Falling straight |
| 31 | 6,060 | 180 | -52 | -4 | Hermit's Bend; 121 km/h on a Sesta 600 |
| 32 | 6,240 | 200 | 0 | -6 |  |
| 33 | 6,440 | 240 | 0 | 0 | The Snow Shed |
| 34 | 6,680 | 260 | 30 | 2 | Right out of the shed |
| 35 | 6,940 | 200 | -24 | 4 |  |
| 36 | 7,140 | 150 | 44 | 0 | The Gendarme; 120 km/h on a Sesta 600 |
| 37 | 7,290 | 200 | 0 | -8 |  |
| 38 | 7,490 | 300 | -36 | -6 | Long falling left |
| 39 | 7,790 | 110 | 0 | 5 | The Knuckle, rise |
| 40 | 7,900 | 110 | 0 | -6 | The Knuckle, drop; launches at 228 km/h |
| 41 | 8,010 | 240 | 20 | 0 | Run to the cable-car station |
| 42 | 8,250 | 300 | 0 | 0 | Finish at the cable-car station |

Total 8,550 m.

Sections 1 to 21 are the original road and are unchanged; sections 22 to 42 were appended when the level-1 roads were lengthened. The table is `packages/track/src/tracks/ridge-road.ts`.

### Levels 2 to 5

**Level 2 appends (1,150 m).** Past the cable-car station: the Elbow, a 70° right at a radius of 92 m, then a 58° left and a 410 m straight along the top.

`[180, -34, 6], [140, 0, 9], [160, 70, 4], [120, 0, -6], [140, -58, -4], [410, 0, 2]`

**Level 3 appends (1,150 m).** The Step: a crest that launches at 170 km/h into an 80° left.

`[225, 30, 8], [120, 0, 6], [95, 0, -8], [220, -80, -6], [180, 0, 0], [160, 62, 4], [150, 0, -4]`

**Level 4 appends (1,150 m).** A 300 m descent into the Drop Hairpin, 96° at a radius of 58 m (76 km/h on a Sesta 600), then a crest at 173 km/h.

`[300, 0, -12], [140, -96, -3], [200, 0, 5], [100, 0, 6], [90, 0, -7], [180, 54, -2], [140, 0, 0]`

**Level 5 appends (1,150 m).** The summit climb: a 76° left at a radius of 79 m, a crest that launches at 169 km/h into an 88° right, and a 450 m straight to the finish at the summit mast.

`[180, 40, 10], [150, -76, 6], [100, 0, 8], [105, 0, -10], [165, 88, -6], [450, 0, -4]`

### Crests

| Crest                | Level |       At | Sections |          Launches at |
| -------------------- | ----: | -------: | -------- | -------------------: |
| The Saddle           |     1 |  2.19 km | 11, 12   | 162 km/h (signature) |
| The Hump             |     1 |  3.58 km | 18, 19   |             211 km/h |
| The Notch            |     1 |  5.72 km | 28, 29   |             179 km/h |
| The Knuckle          |     1 |  7.90 km | 39, 40   |             228 km/h |
| Climb to the Elbow   |     2 |  8.87 km | 44       |             237 km/h |
| Drop after the Elbow |     2 |  9.03 km | 46       |             249 km/h |
| The Step             |     3 | 10.05 km | 50, 51   |             170 km/h |
| Level-4 crest        |     4 | 11.59 km | 59, 60   |             173 km/h |
| Summit crest         |     5 | 12.43 km | 65, 66   |             169 km/h |

No crest on Ridge Road launches below 160 km/h. The Saddle stays the lowest launch on the road at every level.

### Ramps

| Ramp | From level | Toe at (m) | Lip at (m) | x (m) | Length × width × rise | Reserved (m) | Where |
| --- | --: | --: | --: | --: | --- | --- | --- |
| `cable-car-ramp` | 1 | 8,290 | 8,306 | 3.8 | 16 × 1.2 × 0.8 m | 8,210 to 8,486 | The finish straight at the cable-car station (section 42), by the kerb |

The ramp is in the appended part of the road, so the pinned first 4,250 m are unchanged. Its landing ends 64 m before the level-1 finish.

Traffic per km by level: 5, 6, 7, 8, 9.

Roadblocks: the straight past the cable-car station at 9.55 km, from level 3 (260 m past the 58° left, 150 m before the next bend); the descent to the Drop Hairpin at 10.95 km, from level 4 (250 m past the bend, 200 m before the hairpin); and the summit straight at 12.95 km at level 5 (250 m past the 88° right, 200 m before the finish). The first 4.25 km have no spot: the climb to the Saddle is 440 m long only by counting the Saddle itself, and a cruiser is never parked on the approach to a signature launch. The new stretch has straights that could hold one, on the climb to the Notch and in the descent beyond it, but the road keeps its three spots, and a cruiser is never parked inside the Snow Shed.
