# Frame rate and load

The game holds 60 frames per second on one fixed quality preset, which `apps/web/src/game/presets.ts` picks from the WebGL renderer string before the race. Nothing changes the preset during a race. The target is 60 fps on an integrated-graphics laptop; the Intel UHD 630 rows are a floor near 50 fps, not that cap. The heaviest moment is the `?stress` race on Slag Row at tier 3 with fifteen riders and eight police.

## Sub-features

- `fps-overlay` shows fps, frame time, worst frame, pixel ratio, preset, pace, refresh, draw calls, and triangles with `?fps` or Settings → Frame meter.
- `device-preset` is the preset the device check picked; `?preset=` pins another.
- `frame-rate-setting` is Settings → Frame rate, which cycles 60 and 30.
- `stress-race` starts the fixed worst-case race on the pilot as soon as the page loads.
- `frame-sample` reads per-frame interval, CPU per part and draw calls from the frame recorder.
- `throttled-play` shows how the game paces with the main thread slowed, and that the picture does not change.
- `trace` records main-thread, compositor, and GPU-process work for a few seconds.
- `first-load` measures time to the bar or to a race on a throttled network.
- `perf-gpu` is the perf gate's GPU lane, `pnpm perf:gpu`: frame pacing and render counts against `tools/perf/budgets.json`, side A against side B in two `rv` runs. It is the only check of draw calls, triangles, programs and textures.
- `perf-ab` compares the uncapped frame cost of two builds on the bench window with `tools/perf/measure.ts`.

## How to get to it (user POV)

- A player sees frame rate only as smoothness, or turns on Settings → Frame meter. Add `?fps` to any URL for the same overlay.
- Settings, from the bar's Settings tab or the pause menu, has Frame rate: 60 (the default) or 30. Frame meter is a tester row under `?tester`.
- `?stress` and `?stress=reference` work in every build; `&ratio=2` pins the pixel ratio, past the preset's pixel cap, and turns the pacer off.

## Driving it with rv

Preconditions:

- `rv doctor --run <run>` passes and its gpu line reads the renderer this machine's row requires: Metal on the Mac, NVIDIA on vimaan.
- Note the machine load (`uptime`); other agents' work moves these numbers.

- **Overlay.** Run `rv open --run <run> "/?stress&ratio=2&fps" --until race` and `rv shot --run <run> fps-overlay`. The readout shows fps, ms, worst, `×2.00`, the preset, pace, the display's Hz, calls, and tris.
- **Frame-rate setting.** In a race past its countdown, run `rv press --run <run> Escape`, `rv click --run <run> Settings --within Pause` and `rv click --run <run> "Frame rate" --within Settings`; each click steps between 60 and 30. Then `rv click --run <run> Back --within Settings`, `rv click --run <run> Resume --within Pause`, ride for two seconds, and read `rv js --run <run> 'globalThis.__rushlineDiagnostics.snapshot().quality'`: `frameRate` and `pace` read `"60"` and 60, or `"30"` and 30. `rv sample` then reports 60.0 or 30.0 fps while the race clock still runs 60 ticks a second.
- **Sample.** Run `rv wait --run <run> 'globalThis.__rushlineProfile.info().tick > 600' --timeout 120` and `rv sample --run <run> stress --seconds 6`. The line reports frames, fps, p50/p95/p99/worst frame interval, frames over 20 and 33 ms, JS ms per frame, calls, and ratio, and `stress.sample.json` holds the same. On the M4 Pro the stress race runs near 60 fps with a few frames over 20 ms; a build reads lower on `--dev`.
- **Throttled.** Run `rv throttle --run <run> --cpu 4`, `rv sample --run <run> stress-cpu4 --seconds 6`, then `rv throttle --run <run> --cpu 1`. Expect roughly twice the JS per frame and the same pixel ratio throughout; the sample records `cpu x4`.
- **Trace.** Run `rv trace --run <run> stress --seconds 5`. The summary lists long tasks, GC pauses, and the busiest threads (`Renderer/CrRendererMain`, `GPU Process/CrGpuMain`, `GPU Process/VizCompositorThread`); open `stress.trace.json` in the DevTools Performance panel for detail.
- **First load.** Run `rv throttle --run <run> --network slow4g`, then `rv open --run <run> / --until bar` and `rv open --run <run> "/?ride=ridge-road" --until race`. Each prints load time and time to the signal. Clear with `rv throttle --run <run> --network off`.
- **Perf gate on the GPU.** Follow "The perf gate on the GPU" in `SKILL.md`: a quiet machine, this checkout's `tools/verify/rushline.ts up --slot 0 --path /kit` with the working directory in a clone at the baseline revision, `rv up --slot 1 --path /kit` here, then `pnpm perf:gpu --a <A run> --b <B run>`. It ends with `PASS perf gpu <id>` or a `FAIL` row per metric, including `render.calls.max`, `render.triangles.max`, `render.programs.max` and `render.textures.max`. `rv down` both runs and delete the clone afterwards.
- **Perf A/B.** Follow "Frame cost with measure.ts" in `SKILL.md`: one server per side, `?stress&ratio=2`, `node tools/perf/measure.ts --url ... --label <side> --runs 1 --port <free port>` alternated A, B, A, B at least five times each, then compare means and spread.

## Gotchas

- A frame-rate change applies on the next rendered frame. While the pause menu is up the snapshot still shows the old rate; resume before you read it.
- `rv sample` measures whatever ticks pass while it waits; it is not the bench window. For a number to quote, use `pnpm perf:gpu` or `measure.ts`, which wait for ticks 2028-2628 of the stress race.
- Compare runs only at the same preset and pixel ratio.
- `rv sample` appends to `<name>.sample.json`, so a name used twice holds two JSON objects and no longer parses. Use a new name per sample.
- CPU throttling slows the main thread only. The GPU runs at full speed, so GPU-bound passes look better than they would on an Air; compare `?ratio=1` with `?ratio=2` to see fill cost.
- Throttling lives in the console watcher. If `rv doctor` shows the watcher dead, the throttling is gone too.
- `?prof=gpu` timer queries on ANGLE over Metal add up to more than the frame; do not quote them.
- measure.ts launches a headless browser by default (allowed for this bench only). `--browser windowed` runs it windowed; give it a DevTools `--port` nobody holds. A second bench on the same machine fails at once and names the one holding the GPU.
