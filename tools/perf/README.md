# Frame measurement

`measure.ts` drives headless Chrome over the DevTools protocol, waits for a tick window in a race, and prints frame times, the cost of each part of the frame, draw calls, triangles, GC pauses, long tasks, and the WebGL renderer. The entry reads the flags with `src/measure-options.ts` and runs `src/measure.ts` on Effect. `src/measure-page.ts` waits for ticks, takes the screenshots and runs the trace, `src/measure-model.ts` decodes the page's samples and works out the summary, and `src/measure-report.ts` prints it. `@racer/devtools` launches the browser and owns the DevTools session, `@effect/platform-node` supplies the HTTP client, the WebSocket and the file system, and `effect/Schema` decodes what Chrome sends back.

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
node tools/perf/measure.ts --url "http://localhost:1352/?stress&ratio=2" --label shots --runs 1 --no-trace --shots 2978,3120,3300
node tools/perf/measure.ts --url "http://localhost:1352/?stress&ratio=2" --label first-run --runs 4 --first-run
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `--url` | required | Page to load. Pin the ratio with `?ratio=` so the governor's 60 Hz pacing does not hide the headroom. A browser that reports a modest GPU starts without multisampling; add `&rung=0` to measure full quality there, or `&rung=3` to measure the multisampling-off rung anywhere. |
| `--runs` | 3 | Fresh browser per run; the summary shows the mean and the spread across runs. |
| `--from`, `--to` | the bench window | Tick range measured, inclusive. The default comes from `benchWindow` in `packages/sim/src/bench-window.ts`. |
| `--first-run` | off | Start the trace during the countdown and measure from the green light, tick 1, so first-use stalls (shader compiles, texture uploads, the first city chunk of a kind) land in the window. The trace adds the `toplevel` and `gpu` categories so a stall that happens outside JavaScript still shows up, in the GPU process. |
| `--worst` | 5 | For each run, list this many of the longest frames with the CPU time of each part and the longest trace events on any thread that overlap the frame. |
| `--cpu-profile` | off | Sample the main thread every 100 µs in the window and list the top self-time functions. |
| `--alloc-profile` | off | Sample allocations in the window with V8's sampling heap profiler, every 4 kB on average and counting objects the GC has already collected, and list the sites that allocate the most. This is where minor GC pauses come from. |
| `--save-trace` | off | Write the window's trace as `<label>-run<n>-trace.json`, which the DevTools Performance panel opens. |
| `--no-trace` | off | Skip the trace, which otherwise runs to count GC pauses and long tasks. |
| `--shots` | none | Comma-separated ticks to screenshot. |
| `--port` | 9333 | DevTools port. |
| `--browser` | `chrome` | `chrome` is headless Google Chrome. `helium` is a windowed Helium, opened behind the other windows with `open -g` so it does not take focus. |
| `--width`, `--height`, `--scale` | 1512, 860, 2 | Viewport and device scale factor. |
| `--out` | `tools/perf/results` | Where JSON, traces, and screenshots go. The folder is ignored by git. |

Each run launches `/Applications/Google Chrome.app` with `--headless=new` (or Helium, windowed, with `--browser helium`), a new temporary profile that is deleted when the run ends, fails or is interrupted, `--force-device-scale-factor`, `--disable-gpu-vsync --disable-frame-rate-limit` so frames are not capped, and `--use-angle=metal --enable-gpu --ignore-gpu-blocklist`. The summary prints the unmasked renderer string; it should read `ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro, ...)` and never SwiftShader.

## The page side

`?stress` starts a fixed race as soon as the game loads and puts the player on the pilot: Slag Row at level 5, the full field of fourteen, seed 8, the player on the Ostra Sesta 600 with aggression 0.8, rivals given the most aggression toward the player and a grudge against them, eight police with a 250 m sight range, and pacing of `leadEase` 0.8 and `catchUp` 0.6, which holds the pack around the player. `?stress=reference` is the ordinary Slag Row level 1 race on the starting bike on seed 31. Both are in `apps/web/src/career/bench.ts`.

The window, ticks 2880 to 3480, is ten seconds of race time that opens with the player at about 1,510 m. The race depends on the AI pilot in `packages/sim/src/pilot.ts` and the `pilot-*.ts` files beside it, so a change to them moves the window. The bench was last re-aimed when the pilot learned to ride ramps: on seed 31 the pack stretched out and the old window was nearly empty road, so the stress seed became 8. A replay of the window on October 21, 2026, sampling all 601 ticks, measured this workload. Between 3 and 10 rivals are within 150 m ahead of the player, 7.0 on average, and the player is 7th to 11th of 15. 31 to 33 cars are within the fleet's reach, which is Lowtown's 1,100 m fog plus 200 m ahead and 40 m behind. The nearest police rider is between 0 and 64 m away, 35 m on average. The player is off the bike for most of the window: riding for 218 ticks, thrown for 252, lying for 30, and running back to the bike for 101. The window therefore measures a crash and the recovery inside the pack, not ten seconds of riding in it.

To find a window again, step `benchPlan("stress")` with `pilotInput` for every rider each tick, as `readInputs` in `apps/web/src/game/game.ts` does, and count rivals within 150 m ahead and the distance to the nearest awake officer per second.

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

Headless Chrome is allowed here because the bench measures uncapped frame cost. Verifying how the game looks and plays uses a windowed Helium; see `.claude/skills/verify-rushline/SKILL.md`.

## Play-test recordings

A play test on another machine, such as the MacBook Air reaching this Mac through a tunnel, records into the same build it plays. The play server is the development-mode build served by `vite preview`:

```sh
cd apps/web
NODE_ENV=development pnpm exec vite build --mode development
NODE_ENV=development pnpm exec vite preview --mode development --host 127.0.0.1 --port <port>
```

`vite preview` runs the built TanStack Start server, so `POST /api/telemetry` works on it, and `vite.config.ts` mounts the local store for `vite preview` and `vite dev`: each session is appended to `tools/perf/results/sessions/<sessionId>.jsonl`, one acknowledged batch per line. The preview server loads the server build once, so restart it after every rebuild; otherwise it serves HTML that names the previous build's assets.

In the game, Settings (from the title or the pause menu) turns on the frame meter, recording, and automatic upload, and sets the test device to MacBook Air or MacBook Pro. Recording and upload are off until the tester turns them on, and the settings live in `localStorage` under `rushline.settings.v1`, apart from the career save. B while riding stamps a report marker. Send report uploads the current recording and anything still queued, and shows the report id, which is the session's short id and the batch number.

With recording on, every 30 seconds the page turns its rings into one batch of at most 48 KiB: the frame-interval histogram (8.33, 16.67, 23.33, 33.33, 50, 100, 250, and 1000 ms edges plus overflow), the 32 slowest frames with each part's CPU time, and the events since the last batch. Events are governor changes with the quality before and after and the reason, canvas resizes with their size generation, frames whose drawing a resize cleared before it was presented, unfinished render passes, WebGL context loss, errors with query strings stripped, visibility changes, race start, green, end, crash and quit, and report markers. Batches are numbered per session, sent oldest first, removed only once the collector acknowledges them, retried with backoff, and deduplicated by session and batch number on the server. The queue holds 24 batches and counts what it drops.

### Read a session

`session.ts` runs `src/session.ts`, which reads the flags and loads the JSONL files. `src/session-summary.ts` works out each summary and `src/session-report.ts` prints it.

```sh
node tools/perf/session.ts --dir tools/perf/results/sessions
node tools/perf/session.ts --device air
node tools/perf/session.ts --session 3f0c2a1e --worst 20
node tools/perf/session.ts --session 3f0c2a1e --json
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `--dir` | `tools/perf/results/sessions` | Where the JSONL sessions are. |
| `--device` | any | Only sessions whose tester picked this device: `air`, `pro`, or `unspecified`. |
| `--session` | the latest | A session id or its first characters. |
| `--worst` | 10 | How many of the slowest frames to list. |
| `--json` | off | Print the summaries as JSON. |

The summary lists every session that matches, then the latest in full: the build sha and whether the checkout was dirty, the device, the batches received and any numbers missing, the histogram, the quality timeline, race and report markers with the quality changes and slow frames within two seconds of each marker, the slowest frames with their top parts, the simulation time thrown away by the 0.1 s clamp, faults, and the black-frame suspects ranked: a resize after a draw first, then a lost context, an unfinished render pass, and stalls of 100 ms or more, higher when a quality change or resize happened on the same frame.

### For agents

`globalThis.__rushlineDiagnostics` answers over the DevTools protocol in any build: `info()` is the session, `snapshot()` the phase, race, tick, quality, context state, queued batches, and dropped records, `frames(afterFrame, limit)` the profiler's frames after a frame id, `events(afterSeq, limit)` the recorded events after a sequence number, and `flush()` queues a batch now. `globalThis.__rushlineProfile` works as before.
