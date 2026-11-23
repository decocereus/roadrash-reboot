# Time of day

A race starts in the evening and the sun sets while the field rides, so it is night by the time the median rider finishes. Slag Row starts at late dusk and ends in deep night. The light is a pure function of the race tick: `hourOf(look.nightTick, tick)` runs from 0 at the green light to 1 at the road's `nightTick`, the median finish of a tier 1 field, and holds there. `skyClock` in `apps/web/src/game/sky-clock.ts` blends the road's keyframes in `looks.ts` (the look's own hour at 0, then its `later` list) into one preallocated hour, in 1,000 steps, and `World.light` applies a new step as uniform and colour writes only: the lights, fog, sky, mountains, plain, cel tones, rim, ink, grade, bloom and every glow material. Every player in a room sees the same sky at the same tick, and a rollback or a rejoin never makes it jump, because the tick is already part of the race.

## Sub-features

- `tod-start`: the green light shows the road's start hour, evening on Breakwater Run and Ridge Road with the sun above the horizon, late dusk on Slag Row.
- `tod-sunset`: near 40% of `nightTick` the sun sits on the horizon, and by 60% it has gone under it.
- `tod-night`: from 85% of `nightTick` the road holds full night, with the moon and stars out, until the race ends.
- `tod-playable`: at the darkest point the road, its edge and centre lines, traffic, hazards and rivals stay readable on the UHD 630's `lean` preset.
- `tod-cost`: changing the hour compiles no shader and creates no texture mid-race.

## How to get to it (user POV)

- Ride any road to the end and watch the sky; a rider far behind sees the same sky as the leader at the same moment.

## Driving it with rv

Preconditions: `rv doctor --run <run>` passes on a development build; `?hour=` is DEV only.

- **tod-start, tod-sunset, tod-night.** `rv open --run <run> "/?ride=<road>&with=field&autopilot&at=600&prof&hour=<h>&hold=at&holdafter=700" --until held`, then `rv shot --run <run> <road>-<h>`, for `h` 0, 0.333, 0.667 and 1 on `breakwater-run`, `slag-row` and `ridge-road`. At 0 the sun shows over the horizon on Breakwater Run and Ridge Road; at 0.667 and 1 the sun is gone, the moon and stars are out and the windows and signs carry the light.
- **The change in motion.** `rv open --run <run> "/?ride=breakwater-run&with=alone&autopilot&prof"` and `rv screencast --run <run> sunset --seconds 20 --every 4` once `__rushlineProfile.info().tick` passes `0.35 * 14000`. The sun sinks into the horizon and the light cools with no jump between frames.
- **tod-playable.** On a `RUSHLINE_BROWSER_HOST=linux-intel` slot, shoot `hour=1` on each road on a straight, in a bend, alongside a rival, and 60 m before each hazard kind (`?hazard=<id>&before=60`). Measure the OKLab lightness contrast of road against verge or walk, edge line against road, hazard against road, car against road and rider against road, and compare each with the same pair on Slag Row at `hour=0.5`, the night look the owner approved; none may be lower.
- **tod-cost.** `pnpm perf:gpu` reports `ok first-use` for side B; its races ride through the clock as a player does.

## Gotchas

- `?hour=` pins the clock for the whole page, including the attract race.
- The perf windows sit at about 15% to 35% of `nightTick` (reference ticks 3849 to 4449, stress 2028 to 2628), so they never measure night; measure the darkest point with `?hour=1` and `measure.ts`.
