# Frame measurement

`measure.ts` drives headless Chrome over the DevTools protocol, waits for a tick window in a race, and prints frame times, the cost of each part of the frame, draw calls, triangles, GC pauses, long tasks, and the WebGL renderer. It uses Node's built-in WebSocket and fetch, and `effect/Schema` from the root dependencies to decode what Chrome sends back. It adds no dependencies.

## Serve the production build

Ports 1350 and 1351 belong to the play server. Use 1352 or higher.

```sh
cd apps/web
pnpm exec vite build --sourcemap
pnpm exec vite preview --port 1352 --strictPort
```

`--sourcemap` only adds `.map` files and a trailing comment to each chunk, so the code that runs is the production bundle. The maps let a CPU profile name functions by source file and line. Stop the server by port when you are done: `lsof -ti tcp:1352 | xargs kill`.

## Run

```sh
node tools/perf/measure.ts --url "http://localhost:1352/?stress&ratio=2" --label stress-r2 --runs 3
node tools/perf/measure.ts --url "http://localhost:1352/?stress&ratio=1" --label stress-r1 --runs 3
node tools/perf/measure.ts --url "http://localhost:1352/?stress=reference&ratio=2" --label reference-r2 --runs 3
node tools/perf/measure.ts --url "http://localhost:1352/?stress&ratio=2" --label profile --runs 1 --cpu-profile --save-trace
node tools/perf/measure.ts --url "http://localhost:1352/?stress&ratio=2" --label shots --runs 1 --no-trace --shots 2761,2900,3131
node tools/perf/measure.ts --url "http://localhost:1352/?stress&ratio=2" --label first-run --runs 4 --first-run
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `--url` | required | Page to load. Pin the ratio with `?ratio=` so the governor's 60 Hz pacing does not hide the headroom. |
| `--runs` | 3 | Fresh browser per run; the summary shows the mean and the spread across runs. |
| `--from`, `--to` | the bench window | Tick range measured, inclusive. The default comes from `benchWindow` in `apps/web/src/career/bench.ts`. |
| `--first-run` | off | Start the trace during the countdown and measure from the green light, tick 1, so first-use stalls (shader compiles, texture uploads, the first city chunk of a kind) land in the window. The trace adds the `toplevel` and `gpu` categories so a stall that happens outside JavaScript still shows up, in the GPU process. |
| `--worst` | 5 | For each run, list this many of the longest frames with the CPU time of each part and the longest trace events on any thread that overlap the frame. |
| `--cpu-profile` | off | Sample the main thread every 100 µs in the window and list the top self-time functions. |
| `--alloc-profile` | off | Sample allocations in the window with V8's sampling heap profiler, every 4 kB on average and counting objects the GC has already collected, and list the sites that allocate the most. This is where minor GC pauses come from. |
| `--save-trace` | off | Write the window's trace as `<label>-run<n>-trace.json`, which the DevTools Performance panel opens. |
| `--no-trace` | off | Skip the trace, which otherwise runs to count GC pauses and long tasks. |
| `--shots` | none | Comma-separated ticks to screenshot. |
| `--port` | 9333 | DevTools port. |
| `--width`, `--height`, `--scale` | 1512, 860, 2 | Viewport and device scale factor. |
| `--out` | `tools/perf/results` | Where JSON, traces, and screenshots go. The folder is ignored by git. |

Each run launches `/Applications/Google Chrome.app` with `--headless=new`, a new temporary profile that is deleted afterwards, `--force-device-scale-factor`, `--disable-gpu-vsync --disable-frame-rate-limit` so frames are not capped, and `--use-angle=metal --enable-gpu --ignore-gpu-blocklist`. The summary prints the unmasked renderer string; it should read `ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro, ...)` and never SwiftShader.

## The page side

`?stress` starts a fixed race as soon as the game loads and puts the player on the pilot: Slag Row at level 5, the full field of fourteen, seed 31, the player on the Ostra Sesta 600 with aggression 0.8, rivals given the most aggression toward the player and a grudge against them, eight police with a 250 m sight range, and pacing of `leadEase` 0.8 and `catchUp` 0.6, which holds the pack around the player. `?stress=reference` is the ordinary Slag Row level 1 race on the starting bike with the same seed. Both are in `apps/web/src/career/bench.ts`.

The window, ticks 2640 to 3240, is ten seconds of race time from the moment the pack wakes the first police officer at 1,500 m. Through it ten or eleven rivals are within 150 m ahead, about thirty-three cars are within the fleet's reach, the officer chases a rival within 25 m of the player, and rivals swing at the player at close range. Tick 2761 shows the officer beside the camera and a rival in front of it.

`?prof` records without starting a race, and `?stress` implies it. The frame loop then records, per frame, the CPU time of each part and the draw calls and triangles each pass submits. Where `EXT_disjoint_timer_query_webgl2` is exposed it also times each part on the GPU. Samples sit in preallocated typed arrays and `globalThis.__rushlineProfile` reads them out: `info()` and `window(fromTick, toTick)`. Each frame also keeps three's counts of shader programs, textures, and geometries, and the tool lists the ticks where any of them grew: a program that appears after the green light was compiled on the frame that first drew it, and a texture was uploaded on it. These counts do not depend on how busy the machine is. Each frame also keeps the `performance.now()` it started at; the tool lines that clock up with the trace's through a `console.timeStamp` mark, which is how a worst frame is matched with the trace events that overlap it.

| Part | What it covers |
| --- | --- |
| `sim` | Pilot inputs and `stepRace` for the ticks this frame |
| `other` | Sound, HUD reports, the governor, and the frame meter |
| `riders` | Bike placement and every figure's pose blend and bone writes |
| `fleet` | Placing every traffic car and writing the instance buffers |
| `camera` | The chase camera |
| `world` | City and road chunk visibility, the shadow rig, the sky |
| `matrices` | `scene.updateMatrixWorld` |
| `normal` | The normal and depth pass for the outlines, without the shadow map |
| `shadow` | The shadow map, rendered inside the normal pass |
| `main` | The main scene pass into the multisampled target |
| `line`, `bloom`, `grade` | The outline, bloom, and grade passes |

On ANGLE over Metal the timer queries answer, but the per-pass GPU times they give add up to more than the frame interval, so treat them as unreliable there and compare `?ratio=1` against `?ratio=2` to see fill cost instead.
