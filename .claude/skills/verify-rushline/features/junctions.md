# Junctions and crossings

A road declares junctions and pedestrian crossings in its plan's `crossings`. A junction has a cross road with arms on one or both sides, a zebra each side of its box and, when it has lights, a stop line and a mast-arm signal for each direction of the main road and a short signal on each arm. A pedestrian crossing has one zebra and, with lights, the same two mast-arm signals. The lights cycle in 23 s at a junction (main green 9 s, amber 2.5 s, all red 1 s, cross green 7 s, amber 2.5 s, all red 1 s) from the race tick and the crossing's offset. Main-road traffic stops at the stop line on a red, and on an amber it can stop for, and queues behind it. A car too close to stop runs the amber. Riders and the pilot ride through.

## Sub-features

- `crossing-format` compiles each road's crossings and refuses one on a bend, a crest, near the start or finish, in a ramp's reservation, or within 120 m of another.
- `crossing-clearance` keeps hazards off a crossing's reserved stretch and props and city blocks off a cross road's arms.
- `crossing-look` draws the arms, zebras, stop lines and signal heads.
- `crossing-lights` lights the green, amber or red lamp of each head from `signalPhaseAt`.
- `traffic-at-lights` stops main-road traffic at a red and queues it behind the stop line (`stopAtLights` in `packages/sim/src/traffic.ts`).

## How to get to it (user POV)

Breakwater Run has `harbour-cross` at 1,700 m (two lanes each way, both arms, lights), `market-cross` at 6,000 m (one lane each way, a right arm only, lights), `pier-crossing` at 7,850 m (a signalled zebra) from level 1, and `esplanade-cross` at 10,900 m (a give-way T to the left, unmarked) from level 4. List them from the checkout under test with no browser: `node --input-type=module -e 'import { trackFor } from "./packages/track/src/roads.ts"; for (const level of [1, 4]) for (const c of trackFor("breakwater-run", level).crossings) console.log(level, c.id, c.s, c.fromS, c.toS, c.road?.arms ?? "no road", c.lights ? "lights" : "no lights", c.walk);'`.

## Driving it with rv

Preconditions: `rv doctor --run <run>` passes on a development build (`?at`, `?kmh`, `?clear` and `?prof` are DEV only).

- **The junction draws.** `rv open --run <run> "/?ride=breakwater-run&at=1672&kmh=0&clear&prof" --until race`, `rv wait --run <run> 'globalThis.__rushlineProfile.info().tick > 120' --timeout 30`, `rv shot --run <run> green`. The frame shows two zebras across the road, a white stop line across the same-way lanes just ahead, cross-road asphalt with a dashed centre line running off both sides, the kerb and the shop fronts broken where each arm meets the road, and a mast arm over the right-hand lanes with a three-lamp head lit green at the bottom.
- **The lights cycle.** On the same page, `rv wait ... 'globalThis.__rushlineProfile.info().tick > 600'` and `rv shot --run <run> amber`, then `> 760` and `rv shot --run <run> red`. The lit lamp moves to the middle and turns amber, then to the top and turns red. The phase depends only on the tick, so the same ticks give the same colours on every run.
- **A T junction.** `rv open --run <run> "/?ride=breakwater-run&at=5975&kmh=0&clear&prof" --until race`, then `rv shot`. The cross road leaves only on the right; the left kerb and shop fronts run on unbroken.
- **A pedestrian crossing.** `rv open --run <run> "/?ride=breakwater-run&at=7828&kmh=0&clear&prof" --until race`, then `rv shot`. One zebra, a stop line on each side and the two mast-arm signals, with no cross road.
- **Traffic queues at the red.** `rv open --run <run> "/?ride=breakwater-run&at=1560&kmh=0&clear&prof" --until race`, then `rv wait ... 'globalThis.__rushlineProfile.info().tick > 800'` and `rv shot --run <run> queue`. With the main light red from tick 690, the same-way cars ahead stand nose to tail behind the stop line, and the oncoming cars stand behind theirs. `> 1400` and another `rv shot` shows them gone on the green.
- **No console errors.** `rv console --run <run> errors` reads 0 lines.

## Gotchas

- `?at` is metres along the road, and the camera sits behind the bike, so `at` 25 to 30 m short of a crossing's centre frames it best.
- The lamps are small at 30 m. Crop the head from the full-size PNG (`sips -c 260 260 --cropOffset 240 1470 <png> --out <crop>` at rv's default page size) to read the colour.
- The proofs in `packages/track/src/crossings.test.ts`, `packages/sim/src/signals.test.ts` and `packages/sim/src/junction-traffic.test.ts` pin the placement rules, the cycle and the queue.
