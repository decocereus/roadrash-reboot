# Frame rate and load

The game paces itself at 60 frames per second at the screen's native pixel ratio, and drops quality one rung at a time (shadow map, bloom, then pixel ratio) only when frames are late for a sustained stretch. The target is 60 fps on an integrated-graphics laptop. The heaviest moment is the `?stress` race on Slag Row at level 5 with the full field and eight police.

## Sub-features

- `fps-overlay` shows fps, frame time, worst frame, pixel ratio, rung, pace, refresh, draw calls, and triangles with `?fps`.
- `stress-race` starts the fixed worst-case race on the pilot as soon as the page loads.
- `frame-sample` reads per-frame interval, CPU per part, draw calls, and rung from the frame recorder.
- `throttled-play` shows how the game paces and which quality rungs it takes with the main thread slowed.
- `trace` records main-thread, compositor, and GPU-process work for a few seconds.
- `first-load` measures time to the title or to a race on a throttled network.
- `perf-ab` compares two builds on the bench window with `tools/perf/measure.ts`.

## How to get to it (user POV)

- A player sees frame rate only as smoothness. Add `?fps` to any URL for the overlay.
- `?stress` and `?stress=reference` work in every build; `&ratio=2` pins the pixel ratio.

## Driving it with rv

Preconditions:

- `rv doctor --run <run>` passes and its gpu line reads the Metal renderer.
- Note the machine load (`uptime`); other agents' work moves these numbers.

- **Overlay.** Run `rv open --run <run> "/?stress&ratio=2&fps" --until race` and `rv shot --run <run> fps-overlay`. The top-left readout shows fps, ms, worst, `×2.00`, the rung, pace, the display's Hz, calls, and tris.
- **Sample.** Run `rv wait --run <run> 'globalThis.__rushlineProfile.info().tick > 600' --timeout 120` and `rv sample --run <run> stress --seconds 6`. The line reports frames, fps, p50/p95/p99/worst frame interval, frames over 20 and 33 ms, JS ms per frame, calls, ratio, and rung, and `stress.sample.json` holds the same. On the M4 Pro the stress race runs near 60 fps with a few frames over 20 ms; a build reads lower on `--dev`.
- **Throttled.** Run `rv throttle --run <run> --cpu 4`, `rv sample --run <run> stress-cpu4 --seconds 6`, then `rv throttle --run <run> --cpu 1`. Expect roughly twice the JS per frame and the rung climbing as the governor sheds quality; the sample records `cpu x4`.
- **Trace.** Run `rv trace --run <run> stress --seconds 5`. The summary lists long tasks, GC pauses, and the busiest threads (`Renderer/CrRendererMain`, `GPU Process/CrGpuMain`, `GPU Process/VizCompositorThread`); open `stress.trace.json` in the DevTools Performance panel for detail.
- **First load.** Run `rv throttle --run <run> --network slow4g`, then `rv open --run <run> / --until title` and `rv open --run <run> "/?ride=ridge-road" --until race`. Each prints load time and time to the signal. Clear with `rv throttle --run <run> --network off`.
- **Perf A/B.** Follow "The perf A/B" in `SKILL.md`: one server per side, `?stress&ratio=2`, `node tools/perf/measure.ts --url ... --label <side> --runs 1 --port <free port>` alternated A, B, A, B at least five times each, then compare means and spread.

## Gotchas

- `rv sample` measures whatever ticks pass while it waits; it is not the bench window. For a number to quote, use `measure.ts`, which waits for ticks 2880-3480 of the stress race.
- The governor moves the rung and pixel ratio unless `?ratio=` pins them; compare runs only at the same ratio.
- CPU throttling slows the main thread only. The GPU runs at full speed, so GPU-bound passes look better than they would on an Air; compare `?ratio=1` with `?ratio=2` to see fill cost.
- Throttling lives in the console watcher. If `rv doctor` shows the watcher dead, the throttling is gone too.
- `?prof=gpu` timer queries on ANGLE over Metal add up to more than the frame; do not quote them.
- measure.ts launches headless Chrome by default (allowed for this bench only). `--browser helium` runs it windowed; give it a DevTools `--port` nobody holds.
