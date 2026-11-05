---
name: road-building
description: Build or rework a Rushline road the way the owner approved on Breakwater Run. Use when adding a road, or changing a road's districts, widths, bends, traffic, hazards or crossings under packages/track/src/tracks, and when asked what a good road is here. Covers the layout rules, the bot test that decides whether a road works, the pins to update, and how the owner rides it before it lands.
---

# Road building

Breakwater Run is the reference road. On 2026-11-05 the owner rode it and called the map design "perfect", and asked that the rest of the maps follow it. Read `packages/track/src/tracks/breakwater-run.ts` and its section in `docs/design/tracks.md` before you lay a new road. `docs/architecture.md` explains how a plan compiles.

## Layout rules

The owner decided these. Do not change them without asking.

- At least 2 lanes each way on most of a road, and 3 on boulevards.
- 1 lane each way only in squeezes of 600 m or less.
- About 7 districts per road, each with its own width, skyline and ad spots. Breakwater Run has 8.
- A fork starts as a side-by-side split with a divider on one road, only in some districts. The left way carries head-on cars and the right way carries same-way cars. Riders stay on one centre line plus an offset, so both ways follow the same bends and share a height.
- Every district reserves rooftop boards, shopfront boards and divider wraps for ad spots.

Breakwater Run's shape, as a target:

| Measure                    |                 Value |
| -------------------------- | --------------------: |
| Length                     |               8,500 m |
| Districts                  |                     8 |
| One-lane stretches         | 2, of 440 m and 320 m |
| Bends                      |                    25 |
| Bends under a 100 m radius |                     7 |
| Tightest bend              |                  83 m |
| Solo lap, Sesta            |               181.5 s |
| Solo lap, Wren             |               190.8 s |
| Cars per kilometre         |                     7 |
| Hazards by tier            |            15, 20, 24 |
| Walkers                    |       59, on 36 sites |

## What makes a road fight

Measured on Breakwater Run on 2026-11-05:

- Narrowing forces fights. Tight bends alone do not.
- Fighting collapses after about 2,300 m, because the field spreads. A road needs a squeeze after that point as well as before it.
- A wide road with nothing in it leaves a leading rider nothing to do. The owner said so after riding it.
- A long stretch without steering is dull. Measure the longest one.

## How busy a road should be

The owner asked for more of everything on Breakwater Run, because a rider out front had too much room. These are what the numbers said on 2026-11-05.

Traffic:

- Traffic slows the whole field. Each 2 cars per kilometre from 5 to 9 added about 8 s to the median finish and about 3 points to the stuck mean.
- Stop before tier 3 wrecks climb. At 9 per kilometre, 13 riders wrecked in 30 races and the worst seed was stuck 26% of the time. Breakwater Run stopped at 7.
- Necks rise first, and cars are not what jams. In a neck cars hold 0.8 to 0.9 of cruise and stop less than 2% of the time. Riders queue behind them, because the only way past is the oncoming lane and its gaps close as density rises. Where cars are seated does not help, since seating does not survive about 30 s of driving. Leave the merge constants alone. A fix belongs in how the pilot passes a car on one lane, and nobody has built it yet.

People:

- `crossings` reject bends, so a stretch that bends gets a plan's `crowds` instead. Its walkers cross with no lights, on a gap in the cars. A region's `footfall` raises every road in that city, so check the other roads' sites when you change it.
- Walkers add hits more than they add stuck. Going from 28 to 59 walkers tripled the times riders hit one and added about 2 points to the stuck mean at most.
- Every walker within 300 m draws about 5,400 triangles in each of three passes, with no level of detail. Before that cap they drew all the way to the fog. On the UHD 630 at tier 1, the cap brought Breakwater Run's first 1,300 m from 44.6 back to 48.4 fps, against 51.0 without the market, and the picture did not change. The market itself still costs about 5 fps, because its people are within 300 m of a rider in it. Put the walker count beside the frame cost.
- A plan's `bazaars` fills a stretch's footpaths with stalls. They leave a 3 m gap at every walk site, so moving `crowds` or `footfall` moves the stalls too, and the stall pins in `packages/track/src/stalls.test.ts` change with them. Stalls are solid for a rider, a sliding bike and a thrown body. The market's 56 people draw beside the walkers, about 300,000 triangles a pass when all of them are within 300 m, so put that beside the frame cost too.

Hazards:

- Read the kinds after you raise the rate. A tight bend bars a rock, so a road made of tight bends came out almost all oil whatever its region's mix said. Change the region's `hazardHabit` rather than hunting for a seed.
- "Slips" is what oil does to a bike. There is no fourth kind.
- The only lane has its own rule, because a rider there cannot go round. It takes no rock, and no oil within reach of a bend tighter than 125 m. Ridden at racing speed, a pothole on the only lane threw nobody in 120 rides and a rock threw 31. Oil threw 11 of 66 near a sharp bend and 0 of 54 elsewhere.
- Wrecks come from crashes adding up, and those are nearly all fights and traffic. At tier 3 with the career field, 10 riders in 300 wrecked where none had before, and only 3 of 594 crashes named a hazard. Report wrecks beside stuck.

Pack pressure:

- Check the bikes first. Compare each tier's solo laps with the bike the player rides. At tier 1 the Sesta laps 5.3 s faster than the best rival on Breakwater Run, and that gap was most of "nobody catches me".
- Pacing is not the lever. `leadEase` does nothing once the player leads, and `catchUp` lifts skill, which barely moves a lap. Raising `catchUp` from 0.08 to 0.2 changed nothing at a 188 s lap.
- A faster pack is the lever. `bikeMatches` in `launchRules` moves the Kite riders onto the Sesta when the player rides one at tier 1. A rider on a 192 s lap went from 30 wins in 30 to 23, and the margin from 9.5 s to 5.3 s. Rooms leave `bikeMatches` empty.
- Density can work against you. It slows the pack by about 10 s, and a person who threads it loses less than a bot does. A rider on a 192 s lap won 25 of 30 on the quieter road and all 30 on the busier one. Measure pack pressure again whenever you add density.
- Tier 3 is not a bike problem. Its rivals lap in about 180 s alone and 225 s in a race, because traffic and fights take the rest. A 189 s rider wins all 30 there. Nothing in the rules fixes that yet, and how the pilot passes a car on one lane is the place to look, for this and for the necks.
- The pilot is not a person. In the player's seat it queues and fights like a bot. To measure a person, hold the player to a share of a clean solo lap, so it neither queues nor fights, and try several shares. A person sits somewhere between that and the pilot. Count the rivals who come within 20 m.

## Prove the road

Do these in order. A road that fails a step goes back to the plan.

1. Run the bot test at the top tier and at tier 1, with the real tier conditions:

   ```sh
   pnpm road:test --road <roadId> --tiers 1,3 --pacing off --out <file>.json
   ```

   Compare a variant plan with `--plan <module>`. `tools/road-test/README.md` defines each number. The player is the AI pilot, which rides differently from a person, so treat its numbers as a floor for what a person meets. Run at most 3 of these at once, because the machine is shared.

2. Hold these against Breakwater Run at commit `5190e123`, with the default field and pacing off. Riders' stuck mean was 6.7% at tier 1 and 13.5% at tier 3. Median finish was 206 s and 224 s. Riders spent 28% and 46% of their time on one-lane stretches stuck, which is the most a one-lane stretch should reach. One rider in 180 failed to finish at each tier. Those numbers follow the owner's request for a busier road, and the owner has not ridden them yet. Before it, at commit `433e82d7`, the same measure read 4.4% and 7.3%, 201 s and 209 s, and 21% and 26%. Stuck bots were the owner's original complaint, so a road that gains fights by jamming the field has failed.

3. Check every hazard placement by tier. Hazards are hard and survivable, good to avoid but not must-avoid, graded by speed and lean, with no telegraphing. A rider at racing speed must survive any placement on a one-lane stretch, and `packages/sim/src/hazard-only-lane.test.ts` rides them, so add any new road with a one-lane stretch to it.

4. Update the pins. `packages/track/src/chevron-runs.ts` is a snapshot of generated runs, and the test in `packages/sim/src/corner-warnings.test.ts` names any that changed. Update the road's table and history line in `docs/design/tracks.md`. Update `docs/architecture.md` if a stated fact moved.

5. Run `pnpm check`, `pnpm build` and `pnpm perf`. Re-pin perf rows only by the procedure in `tools/perf/README.md`, with the reason in the PR. Append to the baseline file, never overwrite it. Merge main into your branch rather than rebasing, or the commits the pins name are lost. Linux rows come from the `perf-results` artifact of the CI perf job.

6. Measure the frame cost on the UHD 630 before and after, on `vimaan`, as `AGENTS.md` describes. Density, stalls, walkers and new skylines add frame cost, so this result lands with the change, beside the ride.

7. Look at it. Follow `.claude/skills/verify-rushline/SKILL.md`, and watch every taper and every bend under 100 m frame by frame, at racing speed with traffic on. Check that kerbs and stripes stay connected, buildings stay behind the pavement, and chevrons point the right way. `?ride=<roadId>&at=<metres>&autopilot` starts there. `at` moves only the player, so also run from the grid to see the pack.

8. The owner rides it before it lands, at the top tier and tier 1, through a tunnel to a development build. `?ride=` works only in a development build. Hand over the link with the frame cost. New art goes to the owner before it is wired in.

## Limits

- Rooms have no catch-up. `roomSetup` keeps its pacing at zero and `packages/career/src/room-race.test.ts` asserts it. Rooms race the same roads and tier conditions, so a road change also reaches them. Check a room race when you change a road.
- Tier 3 `hitDamage` is the owner's decision. Leave it.
- Madrid is faithful to the real city, with some neon. No real logos or brand signs. Each recognisable landmark is a swappable asset.
