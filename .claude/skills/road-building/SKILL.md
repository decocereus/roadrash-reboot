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

| Measure | Value |
| --- | ---: |
| Length | 8,500 m |
| Districts | 8 |
| One-lane stretches | 2, of 440 m and 320 m |
| Bends | 25 |
| Bends under a 100 m radius | 7 |
| Tightest bend | 83 m |
| Solo lap, Sesta | 181.5 s |
| Solo lap, Wren | 190.8 s |

## What makes a road fight

Measured on Breakwater Run on 2026-11-05:

- Narrowing forces fights. Tight bends alone do not.
- Fighting collapses after about 2,300 m, because the field spreads. A road needs a squeeze after that point as well as before it.
- A wide road with nothing in it leaves a leading rider nothing to do. The owner said so after riding it.
- A long stretch without steering is dull. Measure the longest one.

## Prove the road

Do these in order. A road that fails a step goes back to the plan.

1. Run the bot test at the top tier and at tier 1, with the real tier conditions:

   ```sh
   pnpm road:test --road <roadId> --tiers 1,3 --pacing off --out <file>.json
   ```

   Compare a variant plan with `--plan <module>`. `tools/road-test/README.md` defines each number. The player is the AI pilot, which rides differently from a person, so treat its numbers as a floor for what a person meets. Run at most 3 of these at once, because the machine is shared.

2. Hold these against Breakwater Run at commit `2d942624`, with the default field and pacing off. Riders' stuck mean was 4.4% at tier 1 and 7.3% at tier 3. Median finish was 201 s and 209 s. Riders spent 21% and 26% of their time on one-lane stretches stuck, which is the most a one-lane stretch should reach. Stuck bots were the owner's original complaint, so a road that gains fights by jamming the field has failed.

3. Check every hazard placement by tier. Hazards are hard and survivable, good to avoid but not must-avoid, graded by speed and lean, with no telegraphing. A rider at racing speed must survive any placement on a one-lane stretch.

4. Update the pins. `packages/track/src/chevron-runs.ts` is a snapshot of generated runs, and the test in `packages/sim/src/corner-warnings.test.ts` names any that changed. Update the road's table and history line in `docs/design/tracks.md`. Update `docs/architecture.md` if a stated fact moved.

5. Run `pnpm check`, `pnpm build` and `pnpm perf`. Re-pin perf rows only by the procedure in `tools/perf/README.md`, with the reason in the PR. Append to the baseline file, never overwrite it. Merge main into your branch rather than rebasing, or the commits the pins name are lost. Linux rows come from the `perf-results` artifact of the CI perf job.

6. Measure the frame cost on the UHD 630 before and after, on `vimaan`, as `AGENTS.md` describes. Density, stalls, walkers and new skylines add frame cost, so this result lands with the change, beside the ride.

7. Look at it. Follow `.claude/skills/verify-rushline/SKILL.md`, and watch every taper and every bend under 100 m frame by frame, at racing speed with traffic on. Check that kerbs and stripes stay connected, buildings stay behind the pavement, and chevrons point the right way. `?ride=<roadId>&at=<metres>&autopilot` starts there. `at` moves only the player, so also run from the grid to see the pack.

8. The owner rides it before it lands, at the top tier and tier 1, through a tunnel to a development build. `?ride=` works only in a development build. Hand over the link with the frame cost. New art goes to the owner before it is wired in.

## Limits

- Rooms have no catch-up. `roomSetup` keeps its pacing at zero and `packages/career/src/room-race.test.ts` asserts it. A road or tuning change must not change a room race.
- Tier 3 `hitDamage` is the owner's decision. Leave it.
- Madrid is faithful to the real city, with some neon. No real logos or brand signs. Each recognisable landmark is a swappable asset.
