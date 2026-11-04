# Tracks

Drafted October 10, 2026. The three roads as `TrackPlan` data. Each plan below compiles with the existing format in `packages/track/src/track.ts`: sections of `{ length, turnDegrees, climb }`, with the same lead-in and runoff as Ridge Road.

Lengthened October 14, 2026. The original game's level-1 roads measure 8.0 to 8.9 km (5.0 to 5.5 miles), and the first drafts here were 3.6 to 4.4 km, so a race lasted about a minute and a half instead of several minutes. Each road keeps every section it had and continues past its old finish line, which is now a place the race rides through. The new stretch is listed in each road's section table below the old finish, and its moments are named in the paragraph after the road's opening description. Roads are now 8.50 to 8.55 km.

Jumps added October 15, 2026. Breakwater Run and Slag Row gained a hump across the whole road, made by splitting a straight, so no road changed length and no bend moved: **the Pier hump** on Breakwater Run launches at 172 km/h, and **the Slag Heap hump** on Slag Row at 163 km/h. Every road gained steel ramps at fixed places, which car carrier trucks replaced in November 2026. "Carriers and humps" below says how they are placed, and each road has a table of its trucks. The pilot's times in "Ridden by the pilot" were taken before the jumps.

Hazards added October 16, 2026. Every road has oil slicks, rocks, and potholes on the tarmac, placed from the road's seed by the rules in "Hazards" below. No road changed length and no bend or ramp moved.

Launch cities agreed October 23, 2026. Three of these shapes become real cities with a cyberpunk twist: Slag Row becomes Madrid, Breakwater Run becomes Mumbai, and Ridge Road becomes a Bay Area mountain road on the hills above Silicon Valley (`game-design.md` section 0). Each keeps its road's shape where the city fits, so the bends, crests, trucks, and hazard rules below carry over; the landmarks, junctions, crossings, and billboard slots are new.

Pieces replaced sections October 24, 2026. A plan is now a start pose and a list of pieces (`docs/architecture.md`, "Tracks"). Each section in the tables and plans below is one eased piece, written `[length, turnDegrees, climb]` inside `eased(...)` in the road files, and every road samples bit for bit as it did. The plan listings below keep the older `{ length, turnDegrees, climb }` objects; the road files in `packages/track/src/tracks` are the source.

One layout per road November 4, 2026. A road has one layout, the sections below, and nothing about a race changes its bends, crests, trucks, crossings or hazards. The blocks that old levels 2 to 5 appended are gone, and with them the roadblock spots, which the simulation never read. Cinder Wash and Hollow Pine Road and their regions are gone, because the launch has three cities. The figures below that were taken with all five roads, such as hazard totals before October 16, are history.

Breakwater Run's districts laid November 4, 2026. Breakwater Run now changes width seven times along its 8,500 m, its squeeze replaces the Long Sweeper with two quick bends, and its old hill replaces the yacht basin, the Mole and the Harbour Arm. Figures for it dated before this are of the sixteen-bend road.

Breakwater Run tightened November 5, 2026. The owner rode the seven districts and asked for more bends, tighter bends and more places where combat is needed. The road now has eight districts and 25 bends, the tightest at a radius of 83 m, and a second one-lane stretch, the Arcades, at 3,900 m. Figures for it dated before this are of the seven-district road.

All figures were produced by compiling each plan with `compileTrack` and reading the compiled `curvature` and `slopeRate` arrays. A bend's radius is one over its peak curvature, which is `turn / (length × 0.7)` because of the 30% ease in and out. A bend's hold speed is where full steer equals the outward push for that bike's `BikeSpec` in `game-design.md`. The hold speeds quoted in the road sections below are from before the grip retune of October 15, 2026 (`game-design.md`, "Bends and the lean scrub"), which raised every `curvePush` by 30%; multiply them by 1.14 for the current bikes, so a 70 m right angle that held at 97 km/h on a Wren now holds at 112. Breakwater Run's section is the exception and quotes the current bikes directly. Since that retune a leaned bike also scrubs its own speed, so "not flat" below no longer means the bend needs the brake: see the paragraph after the table. A crest's launch speed is where `slopeRate × speed²` passes gravity, the condition `rider-drive.ts` uses. No person has ridden the roads yet. The AI pilot finishes every road on its own without a crash (section "Ridden by the pilot" below), but passing numbers do not show that a road plays well, so each needs a play test.

## Summary

| Region | Road | id | Length | Lane width / shoulder / verge | Traffic per km | Seed |
| --- | --- | --- | --: | --- | --: | --- |
| Salt Coast | Breakwater Run | `breakwater-run` | 8,500 m | 1 to 3 × 3.6 / 0.2 to 7.2 / 7 m, eight districts | 5 | `0xb4_7a_c1` |
| Lowtown | Slag Row | `slag-row` | 8,500 m | 2 × 3.5 / 0.5 / 6 m | 8 | `0x5a_9c_33` |
| Stonepeak | Ridge Road | `ridge-road` | 8,550 m | 1 × 3.6 / 0.9 / 9 m | 5 | `0x51_ed_27` |

Slag Row has two lanes each way, as The City did in the original, and Ridge Road has one. Each is a single district, so it keeps one width the whole way. Breakwater Run has eight districts, listed in its section. A plan's `districts` can change the lane count, up to three lanes each way, and the shoulder and verge along a road, with a 60 m taper inside the wider district. `docs/architecture.md` has the rules. `trafficPerKilometre` is per direction, as in `createTraffic`, and a direction shares it between its lanes. Every plan uses `leadInLength: 80` and `runoffLength: 400`.

### How hard each road is

A bend counts as "not flat" for a bike when the bike's top speed is above the speed full steer can hold. The three bikes stand for the three classes.

| Road | Length | Bends | Tightest radius | Not flat: Wren 400 | Not flat: Sesta 600 | Not flat: Anvil 1100 |
| --- | --: | --: | --: | --: | --: | --: |
| Breakwater Run | 8.50 km | 25 | 83 m | not recounted | not recounted | not recounted |
| Slag Row | 8.50 km | 15 | 70 m | 10 | 12 | 12 |
| Ridge Road | 8.55 km | 19 | 136 m | 7 | 10 | 17 |

The counts are for the bikes as retuned to the original game's measured starter bike on October 14, 2026 (`game-design.md`, section 6), before the grip went up by 30% on October 15; with the current grip each count is a little lower, and "not flat" is no longer the question that matters. Since October 15 a leaned bike scrubs its own speed, so what decides whether a bend needs a lift or a brake is whether the scrub can bring the bike under the hold speed before the push has run it off the road. A probe that turns in 50 m before each bend at the speed a flat-out Wren arrives with, steers as hard as the bend needs, and holds the throttle cannot take 0 bends on Breakwater Run, 7 on Slag Row (every right angle), and 0 on Ridge Road, against 3, 8, and 6 before; on a Sesta 4, 8, and 7, against 8, 11, and 10. A lift with no brake gets the Wren round every one of them. Hold speeds fell to about 60% of what they were, top speeds to about 90%, so far more bends ask for the brakes: before the retune the Wren took every bend on Breakwater Run and Ridge Road flat, and now it takes all but four and seven. The hold speeds quoted in the road sections below are for the retuned bikes. The pattern is the design: Slag Row makes even the Wren brake, and every road gets tighter in the kilometres that later levels add. The stretch each road gained in October keeps to the road's limits: no new bend on Breakwater Run or Ridge Road is tighter than that road's tightest old bend, and Slag Row's new right angles sit at radii of 70 to 73 m beside its old ones at 71 to 73 m. Every count in this paragraph for Breakwater Run is of the sixteen-bend road. The bikes of October 14 no longer exist, so its nineteen bends have no count on the same terms.

### Ridden by the pilot

The AI pilot rode each road headless through `createRace` and `stepRace`, on the bikes as retuned on October 14, 2026. Alone on an empty road on the Sesta 600 it finishes every road without a crash and without touching the brake. With the career's first field, the Wren 400, traffic, and one cop, it finished 23 of 24 starts (eight seeds a road); the other was a bust beside the cop.

| Road | Alone, Sesta 600, no traffic | First field, Wren 400, finishes | Their times |
| --- | --: | --: | --- |
| Breakwater Run | 199 s | 8 of 8 | 218 to 232 s |
| Slag Row | 227 s | 8 of 8 | 246 to 255 s |
| Ridge Road | 204 s | 7 of 8 | 236 to 249 s |

Before the retune the same pilot took 158 to 175 s alone on the Sesta and 214 to 251 s in the first field. The old 4.25 km Ridge Road took it 82 s alone on the old Sesta.

With the grip and the lean scrub of October 15, 2026, the pilot alone on a quiet road takes 165, 192, and 170 s on the Sesta (Breakwater Run, Slag Row, Ridge Road) and 178, 199, and 181 s on the Wren; with traffic and no field, the Wren's medians over six seeds are 182, 206, and 277 s, where the one-lane road is slow because the pilot queues behind log trucks and buses, which the field races above do not show because the pack passes them together.

## The crest rule

Only a big crest launches a bike, and only at speed. The rule for every road:

- **No crest launches below 160 km/h,** except one signature launch on a road that is built around it.
- **One road has a signature launch between 150 and 160 km/h:** Slag Row's rail crossing at 152 km/h. Ridge Road's signature, the Saddle, is at 162 km/h and needs no exception. Breakwater Run has none below 160.
- The Gutter Pup tops out at 145 km/h, 151 tucked in, still below every launch speed here, so it never flies on level ground. The Wren's 190 km/h (198 tucked) clears every crest up to that speed, so the Saddle and the rail crossing are flights on a Wren, and the AI pilot lifts for a drop ahead to stay under 1.15 times its launch speed.

Height is eased through each section with a cosine, so every section that climbs or falls has one point where the road curves away fastest: the top of a rise and the start of a drop. For a section of length `L` and climb `c` the peak is `slopeRate = π² × c / (2 × L²)`, and the bike leaves the road above `L × √(2g / (π² × |c|))` m/s, which is `5.08 × L / √|c|` km/h. A dip launches at both of its lips: where the road drops into it and where it climbs out.

Each road below has a table of every crest that launches under 260 km/h, read from the compiled `slopeRate`. A crest made of a rise and a drop is listed once, at its top, with the lower of its two launch speeds. A dip is listed at its far lip. Every other change of grade on these roads needs more than 260 km/h, which only the Meridian (263 km/h tucked), the Anvil (278), and the Nera (294) can reach, and only at the end of a long straight.

## Carriers and humps

A hump is an ordinary crest. It is a piece of straight split into a rise and a drop of the same length, 1.4 m up and 1.4 m down, across the whole road, so it obeys the crest rule and is listed in its road's crest table. A 40 m rise and drop launch at 172 km/h and a 38 m pair at 163 km/h, the formula above with `c` of 1.4. Each hump took its length from the straight it sits in, so the road's length and every position outside that straight are unchanged.

A carrier is not part of the road. It is a car-carrying truck that drives the first same-way lane at 20 m/s (72 km/h) and tows a straight ramp 10.7 m long that rises 4.3 m. The plan lists where each truck starts, and `compileTrack` turns the list into `Track.carrierStarts`.

A truck moves, so it has no fixed stretch and reserves nothing. Hazards, crossings and walkers do not keep clear of it. Each start is chosen so a rider meets the truck at about a stretch the road had a fixed ramp on: the start is that stretch minus 20 m/s times the median time a field of pilots on starting bikes took to reach the stretch, rounded to 50 m. A faster rider meets the truck earlier on the road and a slower one later. A start must be at least 300 m past the start line and on the road, a road with no traffic has no trucks, and traffic is cleared for 30 m round each truck when the race starts. A truck that drives off the end of the road comes back at the start, like any car.

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

A plan's `hazardsPerKilometre`, 1 on every road, sets how many hazards there are. The road's own seeded stream (its seed with a salt) walks it from the start in steps of 0.6 to 1.4 times 1,000 m, and each step is a candidate. For each candidate the stream draws its kind, its line, its offset, whether it lies on the road (a roll under `PLACED_SHARE`, 0.6), and which place it takes. The candidate takes one of the places that are free between it and 250 m behind it and at least 60 m past the previous hazard; with none, it lies on the straight where it stands, in the traffic setting. Its kind is drawn from the region's `hazardMix` weighted by the setting, so a turn-in is always oil and an apex always a pothole. Every number is drawn whether or not the candidate is kept, and the place it takes depends only on the road behind it, so a hazard is in the same place, with the same id, in every race. A placed hazard is kept when:

- **It is clear of the start and the finish.** It is at least 450 m past the start line and 150 m before the finish.
- **It is not hidden until it is under the wheel.** From 25 m before it, the line from a rider's eye 1.2 m above the road on the hazard's own line to a point 0.1 m above the hazard stays above the road and inside the verges. A hazard does not have to be visible from far off: one round a blind bend or just over a crest is part of the game.

If the place a candidate takes fails a rule, it tries the straight where it stands instead; if that fails too, the candidate is dropped.

The track tests check every rule above, that a road has four to seven hazards, one or more of them oil, that oil is the most common kind across the roads, that every hazard is on the lanes, that rocks are spread across the road rather than on a few lines, that most hazards lie at a bend or a crest, that a mid-bend hazard is a pothole on the inside line and a turn-in hazard is oil on the outside line, that no rock lies in or lands a bike in a tight bend, and that a rock in a gentle bend lies at a lane's edge.

| Region     |  Oil | Rock | Pothole |
| ---------- | ---: | ---: | ------: |
| Salt Coast | 0.65 | 0.15 |     0.2 |
| Lowtown    |  0.6 |  0.2 |     0.2 |
| Stonepeak  |  0.6 | 0.25 |    0.15 |

| Setting | Oil | Rock | Pothole |
| ------- | --: | ---: | ------: |
| Turn-in |   1 |    0 |       0 |
| Apex    |   0 |    0 |       1 |
| Exit    |   1 |    1 |       0 |
| Crest   |   0 |    2 |       1 |
| Traffic |   1 |  1.5 |       1 |

The seed salt, 0x4bc2, was picked from 400 when there were five roads, as the one that kept the old hazard counts and gave every road two or more oil slicks. Breakwater Run has 6 at tier 1 (3 oil, 3 rock), Slag Row 6 (3 oil, 2 rock, 1 pothole) and Ridge Road 6 (4 oil, 2 potholes).

Tier 1 places these hazards, by id, kind, setting, position along the road, and position across it. A compiled road holds more candidates, ranked per road by a seeded roll, and a tier places the share of them its table gives (`game-design.md` section 4): 6, 8 and 9 on Breakwater Run and Slag Row, and 5, 7 and 8 on Ridge Road. Breakwater Run's tier 2 adds `hazard-4`, oil at 3,967 m, x 1.85, on the only open lane at the Arcades' first bend, and `hazard-6`, oil at 5,720 m, x 5.78, on the hill's second left. Its tier 3 adds `hazard-2`, oil at 1,720 m, x 2.02, on the only open lane at the squeeze's exit. The road has more bends for a hazard to snap to, so seven of its nine candidates are oil, where four were on the seven-district road.

| Road | Hazards |
| --- | --- |
| Breakwater Run | `hazard-1` rock (exit) at 920 m, x 0.84; `hazard-3` oil (turn-in) at 3,145 m, x 9.33; `hazard-5` oil (turn-in) at 4,687 m, x 5.72; `hazard-7` oil (exit) at 6,930 m, x 5.74; `hazard-8` pothole (apex) at 7,565 m, x 10.15; `hazard-9` oil (exit) at 8,080 m, x 1.79 |
| Slag Row | `hazard-2` oil (exit) at 1,480 m, x 5.66; `hazard-3` pothole (traffic) at 2,271 m, x 0.64; `hazard-6` rock (exit) at 5,300 m, x 1.21; `hazard-7` rock (traffic) at 6,372 m, x 1.41; `hazard-8` oil (turn-in) at 7,004 m, x 5.39; `hazard-9` oil (exit) at 7,760 m, x 1.48 |
| Ridge Road | `hazard-2` oil (turn-in) at 1,696 m, x 1.74; `hazard-4` oil (traffic) at 4,244 m, x 1.38; `hazard-6` pothole (apex) at 6,150 m, x 0.84; `hazard-7` pothole (apex) at 7,640 m, x 0.22; `hazard-8` oil (exit) at 8,270 m, x 1.38 |

## Junctions and crossings

A road declares the places where something crosses it in `crossings`. Each entry has an id, its position `s`, its lights or none, its cross road or none, and its walk, a zebra or unmarked. A cross road has one or two lanes each way, a lane width, its cars per minute, and arms on both sides, on the left (oncoming, negative x) or on the right (same-way, positive x), so a T is one arm. An entry with a cross road is a junction; one without is a pedestrian crossing. Lights carry only a phase offset in ticks; the cycle itself is a game rule in `packages/sim/src/signals.ts`.

A junction's box is as long as the cross road is wide, from kerb to kerb. A zebra lies a metre outside the box on each side, 4 m wide, and the stop line 1.5 m beyond it, so a two-lane cross road with 3.4 m lanes puts the stop lines 13.8 m either side of the centre. A crossing with no cross road has one zebra across its centre and stop lines 3.5 m either side. The compiler reserves the stretch from 30 m before one stop line to 30 m past the other, and refuses an entry whose reserved stretch:

- curves more than 1/400 per metre, a 400 m radius, anywhere;
- climbs or falls more than 6%, or changes grade faster than 0.002 per metre, which is a crest;
- starts within 300 m of the start or ends within 100 m of the finish;
- comes within 120 m of another crossing's reservation.

No hazard lies in a reserved stretch, and no tree, pole or rock stands within 3 m of a cross road's arm on the side that has it. City blocks keep 2 m clear of the arms. In open country the ground lies flat under an arm and 30 m beyond its end, and rises again 2 m either side of it. The greybox scenery of the Madrid stretches does not yet make room for an arm, so a Madrid stretch declares a cross road only where its corridor data already has a street.

The lights run main green 9 s, main amber 2.5 s, all red 1 s, cross green 7 s, cross amber 2.5 s and all red 1 s, a 23 s cycle, so a rider meets a red about half the time. A pedestrian crossing runs main green 10 s, amber 2.5 s, all red 1 s, walk 6 s, flashing 2 s and all red 1 s. The phase is a function of the race tick and the entry's offset, so it needs no race state and replays exactly.

A region's `footfall` sets how many unmarked crossings and jaywalkers it seeds per kilometre. Lowtown, Madrid centro and the Salt Coast are city scenery, at 1 unmarked crossing and 1.5 jaywalkers per kilometre, and every other region has none. Sites keep their places in every race. A road gets them without declaring anything.

Cars come down the cross roads at the rate each one declares: Breakwater Run has 14 a minute at `harbour-cross` and 8 at `market-cross`. They obey the lights and queue at the stop line, and at a give-way they wait for a five-second gap. A car on a through junction drives across the main road and off the far arm. A car on a T turns into a main-road lane and drops out once no rider can see it go. A car crossing at speed throws a rider it reaches; a rider who reaches it at speed crashes the same way as into main-road traffic, so a slow, upright rider can glance off or clear it.

Main-road traffic obeys the lights. On a red, and on an amber it can stop for at its normal 7 m/s² braking, a car stops with its nose a metre short of its stop line, and the cars behind it queue 2 m apart. A car too close to stop runs the amber, so no car stops inside the box. Riders and the pilot ignore the lights. They meet the queue as slow or stopped cars.

| Road | Id | At (m) | Lights | Cross road | Walk |
| --- | --- | --: | --- | --- | --- |
| Breakwater Run | `harbour-cross` | 560 | offset 0 | two lanes each way, both arms | zebra |
| Breakwater Run | `market-cross` | 6,000 | offset 540 | one lane each way, right arm | zebra |
| Breakwater Run | `pier-crossing` | 7,850 | offset 300 | none | zebra |

Nothing on the road reacts to a crossing yet: riders, traffic and the pilot ride through as if it were not there. The lights cycle and are drawn.

## Breakwater Run (Salt Coast)

Breakwater Run goes from the harbour along a wide boulevard, through a market one lane wide, across a plaza, along the seawall and the pier, through the Arcades, one lane wide again, up an old hill, and down into the docks. Its character is a road that changes under the rider: 23 m, 8 m, 36 m, 23 m, 16 m, 8 m, 15 m and 22 m wide. Traffic follows the open lanes through each change, so the same cars that spread over three lanes on the boulevard file in single order through the market.

| # | District | From (m) | Lanes each way | Shoulder | Road width | Taper |
| --: | --- | --: | --: | --: | --: | --- |
| 1 | Harbour boulevard | 0 | 3 | 0.7 | 23 m | 1,240 to 1,300, into the squeeze |
| 2 | Market squeeze | 1,300 | 1 | 0.4 | 8 m | 1,740 to 1,800, out to the plaza |
| 3 | The plaza | 1,740 | 3 | 7.2 | 36 m | 2,240 to 2,300, in to 23 m |
| 4 | Where the split will go | 2,300 | 3 | 0.7 | 23 m | 3,440 to 3,500, in to 16 m |
| 5 | Seafront | 3,500 | 2 | 0.8 | 16 m | 3,840 to 3,900, into the Arcades |
| 6 | The Arcades | 3,900 | 1 | 0.4 | 8 m | 4,220 to 4,280, out to 15 m |
| 7 | Old hill | 4,220 | 2 | 0.3 | 15 m | 7,150 to 7,210, out to 22 m |
| 8 | Docks into neon | 7,150 | 3 | 0.2 | 22 m | none |

The eighth district is there for the Arcades. Fighting on the seven-district road stopped at about 2,300 m, because the field has spread out by then, and only a narrow road brings it together again. Lanes are 3.6 m apart and a punch or a kick reaches 2.2 m across, so a pass one lane over is out of reach. In 30 pilot races at tier 1, 90 percent of passes in the squeeze happened within reach, against 15 percent on the boulevard. Tighter bends alone moved nothing: they lowered attacks in the squeeze from 8.13 to 6.67 per kilometre on eight seeds.

Hold speeds in this section are the current bikes', from `holdSpeed` in `packages/sim/src/corner-warnings.ts`, so the 1.14 at the top of this document does not apply to them. A ride at fixed speed with full steer on a constant radius read 126 km/h on a Sesta 600 and 152 on a Wren at a radius of 97 m, and 116 and 139 at 83 m, within 3 km/h of the formula. The pilots ride a little under these figures. Alone on an empty road the pilot laps in 181.5 s on a Sesta 600 and 190.8 s on a Wren, 14.4 and 11.6 s slower than on the seven-district road.

**The Market squeeze** is the road's first demand: two lanes' worth of oncoming and same-way traffic on 8 m of tarmac for 440 m, with a 58° right and a 58° left at a radius of 97 m that a Sesta 600 holds at 129 km/h and a Wren at 155. **The plaza** is a stand-in until its own surface exists: traffic keeps to three lanes, and the 7.2 m each side of them is bare asphalt a pilot may use to pass. No paving or ad tower stands on it yet, and `roadSurfacesOf` paints one texture per lane count at the widest half, so every three-lane stretch shows the same road markings at 28 texels a metre rather than 44. Its 558 m straight and the 620 m along the seawall stay straight on purpose, the first as the sprint out of the squeeze and the second as the place the split will go. **The Lighthouse Kink**, a 68° left packed into 140 m at a radius of 83 m, comes as the plaza closes, and it is the tightest bend on the road. A Sesta 600 holds it at 118 km/h and a Wren at 142. **The Arcades** is the road's second demand: 320 m of one lane on the old Promenade straight, with a 46° left at a radius of 96 m (128 km/h on a Sesta, 154 on a Wren) and a 50° right at 88 m (123 and 147). It is at 3,900 m because the two lanes before it hold a queue without making one, where three lanes before it brought stuck to about 50 percent at tier 3, and because a neck on the hill drew 0.75 to 1.07 attacks per kilometre at tier 1 against 2.81 here. **The Old hill** climbs 25 m through four bends, a 52° left, a 50° right, a 50° left and a 42° right, at radii of 139 to 144 m, to a 170 m flat top that holds `market-cross`, then falls 18 m through a 28° right. It keeps two lanes through **the Fort Gate**, a 72° left at a radius of 84 m (119 km/h on a Sesta, 143 on a Wren), which is the docks' first demand. **The Crane Kink**, a 66° left at a radius of 85 m (120 km/h on a Sesta, 144 on a Wren), follows a 38° right with no straight between them and comes 300 m before the finish at the fish market.

Five crests remain: the Headland drop, the Seawall hump, the Pier hump, the Marina bridge and the Battery crest, launching at 176, 169, 172, 179 and 186 km/h. The sea and the jump are later units.

A wider road forgives more of a bend's hands-off drift, so a gentle bend on three lanes lets a rider with centred bars stay on the road. The new bends on the wide stretches turn far enough to put that rider off, except the 38° right before the Crane Kink, which drifts 10.2 m against an 11 m half width. `pnpm check:handling` holds this road to five such bends, and it now has four: 266 to 515, 747 to 894, 3,122 to 3,379 and 7,907 to 8,054 m.

### Bends

| At (m)         | Turn | Radius | Sesta 600 | Wren 400 | Lanes |
| -------------- | ---: | -----: | --------: | -------: | ----: |
| 266 to 515     |  18° |  668 m |  396 km/h | 492 km/h |     3 |
| 747 to 894     |  34° |  189 m |  187 km/h | 227 km/h |     3 |
| 1,031 to 1,230 |  42° |  210 m |  199 km/h | 241 km/h |     3 |
| 1,345 to 1,476 |  58° |   97 m |  129 km/h | 155 km/h |     1 |
| 1,565 to 1,696 |  58° |   97 m |  129 km/h | 155 km/h |     1 |
| 2,244 to 2,377 |  68° |   83 m |  118 km/h | 142 km/h |     3 |
| 2,386 to 2,535 |  62° |  104 m |  134 km/h | 161 km/h |     3 |
| 3,122 to 3,379 |  26° |  463 m |  316 km/h | 389 km/h |     3 |
| 3,411 to 3,590 |  30° |  267 m |  228 km/h | 278 km/h |     2 |
| 3,954 to 4,057 |  46° |   96 m |  128 km/h | 154 km/h |     1 |
| 4,104 to 4,207 |  50° |   88 m |  123 km/h | 147 km/h |     1 |
| 4,412 to 4,629 |  40° |  241 m |  215 km/h | 261 km/h |     2 |
| 4,669 to 4,832 |  30° |  241 m |  215 km/h | 261 km/h |     2 |
| 5,047 to 5,214 |  52° |  139 m |  157 km/h | 190 km/h |     2 |
| 5,287 to 5,454 |  50° |  144 m |  161 km/h | 194 km/h |     2 |
| 5,527 to 5,694 |  50° |  144 m |  161 km/h | 194 km/h |     2 |
| 5,766 to 5,905 |  42° |  143 m |  160 km/h | 193 km/h |     2 |
| 6,095 to 6,306 |  28° |  344 m |  264 km/h | 324 km/h |     2 |
| 6,325 to 6,466 |  72° |   84 m |  119 km/h | 143 km/h |     2 |
| 6,478 to 6,663 |  52° |  154 m |  167 km/h | 202 km/h |     2 |
| 6,682 to 6,899 |  40° |  241 m |  215 km/h | 261 km/h |     2 |
| 7,162 to 7,379 |  40° |  241 m |  215 km/h | 261 km/h |     3 |
| 7,461 to 7,670 |  48° |  192 m |  189 km/h | 229 km/h |     3 |
| 7,907 to 8,054 |  38° |  169 m |  176 km/h | 212 km/h |     3 |
| 8,065 to 8,196 |  66° |   85 m |  120 km/h | 144 km/h |     3 |

Eight straights over 250 m remain: 0 to 307, 474 to 756, 1,691 to 2,249 (the plaza), 2,530 to 3,150 (the split), 3,577 to 3,958, 6,884 to 7,177, 7,658 to 7,915 and the last 308 m.

### Sections

| # | Starts at (m) | length | turnDegrees | climb | Note |
| --: | --: | --: | --: | --: | --- |
| 1 | 0 | 240 | 0 | 0 | Harbour start |
| 2 | 240 | 300 | -18 | 2 | Along the boulevard |
| 3 | 540 | 200 | 0 | 6 | Climb to the headland, over `harbour-cross` at 560 m |
| 4 | 740 | 160 | 34 | 4 | Headland right |
| 5 | 900 | 120 | 0 | -12 | Headland drop; launches at 176 km/h |
| 6 | 1,020 | 220 | -42 | -4 | Left down to the market |
| 7 | 1,240 | 100 | 0 | 0 | Into the squeeze |
| 8 | 1,340 | 140 | 58 | 0 | Squeeze, right; 129 km/h on a Sesta 600, 155 on a Wren |
| 9 | 1,480 | 80 | 0 | 0 | Squeeze, between the bends |
| 10 | 1,560 | 140 | -58 | 0 | Squeeze, left; 129 km/h on a Sesta 600, 155 on a Wren |
| 11 | 1,700 | 240 | 0 | 0 | Out of the squeeze, widening to the plaza at 1,740 m |
| 12 | 1,940 | 300 | 0 | 0 | The plaza |
| 13 | 2,240 | 140 | -68 | 0 | Lighthouse Kink as the plaza closes; 118 km/h on a Sesta 600, 142 on a Wren |
| 14 | 2,380 | 160 | 62 | 2 | Right, recovering; 134 km/h on a Sesta 600, 161 on a Wren |
| 15 | 2,540 | 360 | 0 | 8 | Seawall climb |
| 16 | 2,900 | 100 | 0 | 6 | Seawall hump, rise |
| 17 | 3,000 | 100 | 0 | -9 | Seawall hump, drop; launches at 169 km/h |
| 18 | 3,100 | 300 | -26 | -5 | Sweeping left down to the pier |
| 19 | 3,400 | 200 | 30 | 0 | Pier approach, narrowing to two lanes |
| 20 | 3,600 | 120 | 0 | 0 | Along the pier |
| 21 | 3,720 | 40 | 0 | 1.4 | Pier hump, rise |
| 22 | 3,760 | 40 | 0 | -1.4 | Pier hump, drop; launches at 172 km/h |
| 23 | 3,800 | 100 | 0 | 0 | Along the pier, the old finish, closing to one lane |
| 24 | 3,900 | 50 | 0 | 0 | Into the Arcades, one lane from 3,900 m |
| 25 | 3,950 | 110 | -46 | 0 | Arcades, left; 128 km/h on a Sesta 600, 154 on a Wren |
| 26 | 4,060 | 40 | 0 | 0 | Arcades, between the bends |
| 27 | 4,100 | 110 | 50 | 0 | Arcades, right; 123 km/h on a Sesta 600, 147 on a Wren |
| 28 | 4,210 | 190 | 0 | 0 | Out of the Arcades, widening at 4,220 m |
| 29 | 4,400 | 240 | 40 | 2 | Right at the Ferris wheel |
| 30 | 4,640 | 20 | 0 | 0 | Between the Marina bends |
| 31 | 4,660 | 180 | -30 | 6 | Left, climbing to the Marina bridge |
| 32 | 4,840 | 100 | 0 | 5 | Marina bridge, rise |
| 33 | 4,940 | 100 | 0 | -8 | Marina bridge, drop; launches at 179 km/h |
| 34 | 5,040 | 180 | -52 | 6 | Old hill, first left |
| 35 | 5,220 | 60 | 0 | 0 | Old hill |
| 36 | 5,280 | 180 | 50 | 7 | Old hill, right |
| 37 | 5,460 | 60 | 0 | 0 | Old hill |
| 38 | 5,520 | 180 | -50 | 7 | Old hill, left |
| 39 | 5,700 | 60 | 0 | 0 | Old hill |
| 40 | 5,760 | 150 | 42 | 5 | Old hill, last right |
| 41 | 5,910 | 170 | 0 | 0 | The hilltop, over `market-cross` at 6,000 m |
| 42 | 6,080 | 240 | 28 | -18 | Down into the docks, bending right |
| 43 | 6,320 | 150 | -72 | 0 | Fort Gate; 119 km/h on a Sesta 600, 143 on a Wren |
| 44 | 6,470 | 200 | 52 | 2 | Right under the fort walls |
| 45 | 6,670 | 240 | -40 | 4 | Left, climbing along the battery |
| 46 | 6,910 | 20 | 0 | 0 | Along the battery |
| 47 | 6,930 | 110 | 0 | 5 | Battery crest, rise |
| 48 | 7,040 | 110 | 0 | -9 | Battery crest, drop; launches at 186 km/h |
| 49 | 7,150 | 240 | -40 | -4 | Sweeping left down to the quay, three lanes from 7,150 m |
| 50 | 7,390 | 60 | 0 | 0 | Onto the quay |
| 51 | 7,450 | 230 | 48 | 0 | Right onto the quay |
| 52 | 7,680 | 20 | 0 | 0 | The quay |
| 53 | 7,700 | 200 | 0 | -2 | Quay straight, over `pier-crossing` at 7,850 m |
| 54 | 7,900 | 160 | 38 | 0 | Right toward the cranes |
| 55 | 8,060 | 140 | -66 | 0 | The Crane Kink; 120 km/h on a Sesta 600, 144 on a Wren |
| 56 | 8,200 | 300 | 0 | 0 | Finish at the fish market |

Total 8,500 m.

```ts
export const breakwaterRun: TrackPlan = {
  districts: [
    { from: 0, lanesEachWay: 3, shoulderWidth: 0.7, vergeWidth: 7 },
    { from: 1300, lanesEachWay: 1, shoulderWidth: 0.4, vergeWidth: 7 },
    { from: 1740, lanesEachWay: 3, shoulderWidth: 7.2, vergeWidth: 7 },
    { from: 2300, lanesEachWay: 3, shoulderWidth: 0.7, vergeWidth: 7 },
    { from: 3500, lanesEachWay: 2, shoulderWidth: 0.8, vergeWidth: 7 },
    { from: 3900, lanesEachWay: 1, shoulderWidth: 0.4, vergeWidth: 7 },
    { from: 4220, lanesEachWay: 2, shoulderWidth: 0.3, vergeWidth: 7 },
    { from: 7150, lanesEachWay: 3, shoulderWidth: 0.2, vergeWidth: 7 },
  ],
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
    { climb: 0, length: 100, turnDegrees: 0 },
    { climb: 0, length: 140, turnDegrees: 58 },
    { climb: 0, length: 80, turnDegrees: 0 },
    { climb: 0, length: 140, turnDegrees: -58 },
    { climb: 0, length: 240, turnDegrees: 0 },
    { climb: 0, length: 300, turnDegrees: 0 },
    { climb: 0, length: 140, turnDegrees: -68 },
    { climb: 2, length: 160, turnDegrees: 62 },
    { climb: 8, length: 360, turnDegrees: 0 },
    { climb: 6, length: 100, turnDegrees: 0 },
    { climb: -9, length: 100, turnDegrees: 0 },
    { climb: -5, length: 300, turnDegrees: -26 },
    { climb: 0, length: 200, turnDegrees: 30 },
    { climb: 0, length: 120, turnDegrees: 0 },
    { climb: 1.4, length: 40, turnDegrees: 0 },
    { climb: -1.4, length: 40, turnDegrees: 0 },
    { climb: 0, length: 100, turnDegrees: 0 },
    { climb: 0, length: 50, turnDegrees: 0 },
    { climb: 0, length: 110, turnDegrees: -46 },
    { climb: 0, length: 40, turnDegrees: 0 },
    { climb: 0, length: 110, turnDegrees: 50 },
    { climb: 0, length: 190, turnDegrees: 0 },
    { climb: 2, length: 240, turnDegrees: 40 },
    { climb: 0, length: 20, turnDegrees: 0 },
    { climb: 6, length: 180, turnDegrees: -30 },
    { climb: 5, length: 100, turnDegrees: 0 },
    { climb: -8, length: 100, turnDegrees: 0 },
    { climb: 6, length: 180, turnDegrees: -52 },
    { climb: 0, length: 60, turnDegrees: 0 },
    { climb: 7, length: 180, turnDegrees: 50 },
    { climb: 0, length: 60, turnDegrees: 0 },
    { climb: 7, length: 180, turnDegrees: -50 },
    { climb: 0, length: 60, turnDegrees: 0 },
    { climb: 5, length: 150, turnDegrees: 42 },
    { climb: 0, length: 170, turnDegrees: 0 },
    { climb: -18, length: 240, turnDegrees: 28 },
    { climb: 0, length: 150, turnDegrees: -72 },
    { climb: 2, length: 200, turnDegrees: 52 },
    { climb: 4, length: 240, turnDegrees: -40 },
    { climb: 0, length: 20, turnDegrees: 0 },
    { climb: 5, length: 110, turnDegrees: 0 },
    { climb: -9, length: 110, turnDegrees: 0 },
    { climb: -4, length: 240, turnDegrees: -40 },
    { climb: 0, length: 60, turnDegrees: 0 },
    { climb: 0, length: 230, turnDegrees: 48 },
    { climb: 0, length: 20, turnDegrees: 0 },
    { climb: -2, length: 200, turnDegrees: 0 },
    { climb: 0, length: 160, turnDegrees: 38 },
    { climb: 0, length: 140, turnDegrees: -66 },
    { climb: 0, length: 300, turnDegrees: 0 },
  ],
  seed: 0xb4_7a_c1,
  trafficPerKilometre: 5,
};
```

### Crests

| Crest         |      At | Sections | Launches at |
| ------------- | ------: | -------- | ----------: |
| Headland drop |  0.9 km | 5        |    176 km/h |
| Seawall hump  |  3.0 km | 16, 17   |    169 km/h |
| Pier hump     | 3.76 km | 21, 22   |    172 km/h |
| Marina bridge | 4.94 km | 32, 33   |    179 km/h |
| Battery crest | 7.04 km | 47, 48   |    186 km/h |

No crest on Breakwater Run launches below 160 km/h. The hill's fall into the docks launches at 287 km/h.

### Trucks

| Starts at (m) | Median meeting, tier 1 | Median meeting, tier 3 | Where |
| --: | --: | --: | --- |
| 3,900 | 7,248 m at 172 s | 7,263 m at 178 s | Where the docks open to three lanes |
| 4,650 | 7,887 m at 189 s | 7,957 m at 197 s | The quay, into the Crane Kink |

A truck runs in the inner same-way lane. The first starts at the mouth of the Arcades and has left them about a minute before the pack arrives, and both reach the pack in the docks, where three lanes leave a way round. Every meeting in eight seeds of a full pilot field fell between 6,665 and 8,517 m. A start at 3,750 m put the first truck at `market-cross`'s red as the pack arrived. The pilots rode 12 of 89 ramps at tier 1 and 8 of 85 at tier 3.

Traffic per km: 5.

## Slag Row (Lowtown)

Slag Row is the stop-and-go road. Long straights through the port end in right-angle corners at radii near 70 m, which even the Wren must brake for (95 to 97 km/h) and a Sesta 600 holds at 83 to 85 km/h. It has two lanes like every other road; it feels wide because the buildings stand back and the straights are long. Three corners, **Foundry Corner**, **Canal Corner**, and **Smelter Gate**, set the rhythm: sprint, brake, turn, sprint. Between them, **the rail crossing** is a 60 m hump and the road's signature launch at 152 km/h, so every bike but the Gutter Pup hops it at full speed, and **the underpass** is a dip under the freeway that compresses the suspension and hides what is coming up the far side. **The scrapyard chicane** flicks right and left at 46° each, and **the drawbridge** is a 10 m ramp with a crest at the top that launches at 166 km/h. Traffic is the heaviest of any road and includes buses and vans that block the view. The old finish was 310 m after Smelter Gate.

The smelter is no longer the end. Past it the road runs along the slag heaps and keeps the rhythm with four more right angles. **Coke Oven Corner** is an 88° left at a radius of 73 m after a 710 m sprint from Smelter Gate over **the Slag Heap hump**, which rises across the old finish line and launches at 163 km/h. **The Slipway**, 560 m along the shipyard where hulls stand over the road ends in **Dry Dock Corner**, a 92° right at a radius of 70 m and the tightest bend on the road: 95 km/h on a Wren and 83 on a Sesta 600. **The Gasholder Esses** are a second, gentler chicane, 40° each way at radii of 180 and 160 m, which a Wren holds at 160 and 150 km/h, so even the Wren brakes for the second; a Sesta holds 139 and 130, an Anvil 1100 122 and 115. **The ore bridge** climbs 12 m over the ore railway to a crest that launches at 176 km/h, and the road comes down off it to **Customs Corner**, a 90° left at a radius of 71 m. The last corner is **the Dock Gate**, an 88° right at a radius of 73 m, and the finish at the dry dock is 360 m after it, close enough that the exit of the last corner decides the race.

### Sections

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
| 23 | 4,560 | 560 | 0 | 0 | The Slipway |
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
| 34 | 7,140 | 400 | 0 | 0 | Bonded straight |
| 35 | 7,540 | 200 | 30 | 0 |  |
| 36 | 7,740 | 240 | 0 | 0 |  |
| 37 | 7,980 | 160 | 88 | 0 | The Dock Gate |
| 38 | 8,140 | 360 | 0 | 0 | Finish at the dry dock |

Total 8,500 m.

```ts
export const slagRow: TrackPlan = {
  districts: [{ from: 0, lanesEachWay: 2, shoulderWidth: 0.5, vergeWidth: 6 }],
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
  trafficPerKilometre: 8,
};
```

### Crests

| Crest          |      At | Sections |          Launches at |
| -------------- | ------: | -------- | -------------------: |
| Rail crossing  | 0.99 km | 4, 5     | 152 km/h (signature) |
| Drawbridge     | 3.15 km | 14, 15   |             166 km/h |
| Slag Heap hump | 4.02 km | 19, 20   |             163 km/h |
| Ore bridge     | 6.30 km | 29, 30   |             176 km/h |

The rail crossing is the only crest on Slag Row that launches below 160 km/h. The two underpasses need more than 270 km/h at their lips.

### Trucks

| Starts at (m) | Meant to meet riders near | Median pilot arrival | Where |
| --: | --: | --: | --- |
| 2,600 | 4,720 m | 106 s | The Slipway (section 23) |
| 4,100 | 7,280 m | 159 s | The bonded straight (section 34) |

Traffic per km: 8.

## Ridge Road (Stonepeak)

Ridge Road's first 4.25 km are the existing track: ten bends and two crests on the climb to the lookout. Those sections are unchanged. Its rocks are not quite the greybox's: they moved to their own seeded stream so that a longer road keeps the scenery of the part the player knows, and that changed 34 rocks into 35. The track tests pin those first 4,250 m as they compiled before the road was lengthened, by digest: curvature, heights, centre line, crests, every prop, and the rocks by themselves. It is the balanced road and the home road. On a Wren seven bends are not flat; on a Sesta 600 ten; on an Anvil 1100 seventeen. The signature moments are **the Switchback**, a 44° left straight into a 50° right at radii of 155 and 136 m, where the left is the first bend on the road the Wren cannot take flat (147 km/h) and the right (137 km/h on a Wren, 119 on a Sesta) is the first it must brake hard for; **the Saddle**, a 90 m rise and 90 m drop at 2.19 km that launches at 162 km/h with bare rock on both sides, just above the Wren's 158 km/h, so on the first bikes it is a lurch and from the Kite up a flight; **Quarry Bend**, a 42° right at a radius of 143 m that a Sesta holds at 123 km/h; and **the Hump**, a second, gentler crest before the lookout that only launches above 211 km/h. Its name stays. It is the finale at level 5, where it is called the Long Ridge.

The lookout is no longer the end. Past it the road takes **the Cornice**, 450 m of sweeping left along the cliff edge at a radius of 531 m, flat out on every bike with the drop on the outside, then a right and a left at radii of 157 and 160 m that a Wren holds at 148 and 150 km/h and a Sesta at 129 and 130, so no bike takes them flat. It climbs 16 m to **the Notch**, a crest cut through the rock that launches at 179 km/h, falls into **Hermit's Bend**, a 52° left at a radius of 139 m (121 km/h on a Sesta 600, 139 on a Wren), and runs through **the Snow Shed**, 240 m of avalanche gallery where the light flickers between the pillars. **The Gendarme** is a 44° right at a radius of 137 m around a rock pinnacle, 120 km/h on a Sesta, the Switchback's right again. **The Knuckle** is a last small crest that launches only above 228 km/h, and the finish is at the cable-car station. No new crest launches below the Saddle.

### Sections

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

Sections 1 to 21 are the original road and are unchanged; sections 22 to 42 were appended when the roads were lengthened. The table is `packages/track/src/tracks/ridge-road.ts`.

### Crests

| Crest       |      At | Sections |          Launches at |
| ----------- | ------: | -------- | -------------------: |
| The Saddle  | 2.19 km | 11, 12   | 162 km/h (signature) |
| The Hump    | 3.58 km | 18, 19   |             211 km/h |
| The Notch   | 5.72 km | 28, 29   |             179 km/h |
| The Knuckle | 7.90 km | 39, 40   |             228 km/h |

No crest on Ridge Road launches below 160 km/h. The Saddle is the lowest launch on the road.

### Trucks

| Starts at (m) | Meant to meet riders near | Median pilot arrival | Where |
| --: | --: | --: | --- |
| 4,500 | 8,290 m | 189 s | The finish straight at the cable-car station (section 42) |

Traffic per km: 5.
