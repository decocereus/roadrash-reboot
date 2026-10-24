# Performance

`tools/perf` holds the perf gate, which holds tick cost, allocations, bytes, frame pacing and render counts to `budgets.json`, the frame bench `measure.ts`, and the play-test session reader `session.ts`.

## The perf gate

| Command | What it checks | Where it runs |
| --- | --- | --- |
| `pnpm check:perf` | `budgets.json` and the baseline in `baselines/` against their schema, the scenario registry and each other. It measures nothing and takes about a second. | `pnpm check`, so also the CI static job |
| `pnpm perf` | The Node lane (throughput, tick p95 and p99, allocated bytes per tick) and the build lane (route, game, Worker and client bytes, the eleven GLBs and the decoded size of their textures), side A against side B in one run. | `pnpm verify` and the CI `perf` job |
| `pnpm perf:gpu` | Frame pacing, render counts (draw calls, triangles, shader programs and textures), and shader programs or textures first created mid-race in the two Slag Row scenarios, in two windowed Helium runs on this Mac's GPU. | Locally, by hand. CI never runs it. |

Render counts are checked only by `pnpm perf:gpu`, on this Mac. CI has no GPU, and on a software renderer (SwiftShader) the pack scene draws about one frame a second, too slow to fill a measured window, so there is no CI count lane. A change that adds draw calls, triangles, programs or textures passes CI and fails `pnpm perf:gpu`, so run the GPU lane before you merge a change to the renderer, the scene or the assets.

### Budgets and the baseline

`budgets.json` has one row per metric, scenario and environment. Each row gives the limit, its direction and unit, the paired B/A margin if there is one, the baseline value it came from, the derivation, and the id of the run that measured the baseline. The environments are the Node runner (`node-darwin-arm64` for this Mac, `node-linux-x64` for CI), `build` for bytes, which do not depend on the machine, and `gpu-helium-metal` for the GPU lane. Each Node environment also has a calibration profile: `c0`, the median time of the fixed calibration workload on that runner, and the run that measured it.

| Metric | Limit | Paired B/A |
| --- | --- | --- |
| `sim.ticksPerSecond` | at least 0.90 x the calibrated baseline median | at least 0.90 |
| `sim.tick.p95`, `sim.tick.p99` | at most 1.15 and 1.20 x the calibrated baseline median | at most 1.15, 1.20 |
| `sim.allocatedBytesPerTick` | at most 1.10 x the baseline median, never calibrated | at most 1.10 |
| `bytes.*.raw`, `bytes.*.gzip` | the baseline plus 4,096 B or 2%, whichever is larger | none |
| `assets.glb.*`, `assets.texture.total` | the baseline size exactly | none |
| `render.calls.max`, `render.triangles.max` | ceil(1.05 x the largest frame in any baseline window, either side) | none |
| `render.programs.max`, `render.textures.max` | the largest baseline count plus one | none |
| `riders.cpu.p95` | twice the worst B window at the first revision that plants the riders' hands every frame | none |
| `frame.interval.*`, `frame.missedFraction`, `main.longTask.*` | the owner's caps, in the GPU lane's table below | at most 1.10 / 1.15 / 1.20 for p50 / p95 / p99 |

`baselines/post-step8.json` is the baseline summary. It holds the revisions, the harness digest, each scenario's hash and window, each run's identity (machine, runtime, browser and display), every observed value a limit came from, and the track compile time, which is recorded and has no budget. The raw samples sit beside it as gzipped JSON, which `gunzip -c` reads. The two Worker rows come from their own build-lane run of the same side A, `post-step8.worker.json.gz`, because the first baseline counted `server.js` alone. The Seraph, Ghost and Oni GLB rows come from a build-lane run at `6e6ea5a`, the first revision that ships them, `post-step8.bikes.json.gz`. The Kylie and Ronaldo GLB rows and `assets.texture.total` come from a build-lane run at `c943fea`, the first revision that ships them, `post-step8.celebrities.json.gz`. The two `riders.cpu.p95` rows come from a GPU-lane run of `b8705dd` against the change that plants the riders' hands every frame, `post-step8.riders.json.gz`, which keeps the riders column of every capture's frames. `assets.texture.total` is what every texture embedded in the shipped GLBs takes on the GPU, each decoded to RGBA8 with its full mip chain; the build lane reads each image's size from its lossless WebP header and fails on any other format, because `tools/blender/compress.ts` writes only lossless WebP. A GLB's limit is its exact size, so the revision does not change it. The GLB inventory check applies to side B only, because side A is an older revision that can predate a model. `budgets.json` names the summary and each raw file with its SHA-256. `pnpm check:perf` fails when a hash, a scenario hash, a required row, or a limit's baseline value does not match.

Nothing rewrites the budgets. To measure a new baseline, run `node tools/perf/gate.ts baseline --baseline-ref <rev>` on this Mac and in the CI perf job, and run `pnpm perf:gpu`. Then update `budgets.json`, the summary, the raw files and their hashes together, and explain each changed limit in the pull request.

### Scenarios

`src/scenarios.ts` registers two 601-tick windows. On every tick the player must be riding at 20 m/s or more, with the pinned number of rivals within 150 m ahead, and the rival total must match exactly. An emptier window or a crash fails before any timing is judged.

- `reference-v1` is Slag Row level 1 on seed 31 with the starting bike, ticks 1811 to 2411, with 9 to 11 rivals ahead.
- `pack-riding-v1` is the `?stress` race, Slag Row level 5 on seed 8 with eight police, ticks 2107 to 2707, with 10 to 13 rivals ahead. Despite its name, the player trails the pack in this window, 12th to 15th of 15.

Until October 25, 2026 the windows were ticks 1727 to 2327 with 10 rivals ahead on every tick, and ticks 2165 to 2765 with 11 to 13. Centred bars that follow gentle curves spread both fields, and no 601-tick window in the first 7,200 ticks of either race holds those counts any more, so each window is now the one the selection rule picks and its band is what that window holds.

Each scenario's hash covers its window, its race setup and the road it runs on. The road enters as the compiled track: the sampled centreline with every zero counted as +0, the lanes, props, ramps and hazards, and the plan's race settings. How the plan writes its geometry stays out, so a change to the track format that compiles the same road keeps the hash, and side A at an older revision still matches side B. Every side reports its own hash, and a side whose hash differs from the registry's fails before any timing is judged.

The harness runs on side A as well, so it drives a race only in ways both sides understand. The race plans every pilot rider inside `step`, in index order, so the harness builds it with the player pilot-controlled and steps it with an empty input frame. A race ends on the player's `finish`, `busted` or `wrecked` event, the same rule the career's race log uses, and the workload reads the player through `riderOf`.

`node tools/perf/gate.ts --select-window` replays both races and checks that the registered windows are still the ones the fixed selection rule picks.

### `pnpm perf`

Side A is a `/tmp` clone of the revision that `budgets.json` names, installed with `pnpm install --prefer-offline --frozen-lockfile`, with the current harness copied over it. It installs from the local store and fetches only what the store and metadata cache lack: when side B's lockfile differs from side A's, pnpm's supply-chain check has to verify A's lockfile, and that needs registry metadata that a fully offline install cannot fetch. `--baseline-ref <rev>` picks another revision. Side B is this checkout. The clone is deleted when the run ends. For each scenario, the Node lane runs one validation pass per side, five timing pairs in alternating order with six calibration blocks around them, and three allocation pairs, each in a fresh child process. The build lane runs a fresh production build of each side. A route's bytes are the root's and the route's Start preloads and every chunk they import statically, with their CSS and assets, plus every stylesheet. The Worker's bytes are every server chunk the entry reaches through static or dynamic imports, each file once, because the entry loads the router, the Start setup and every route on demand. A manifest edge to a chunk that does not exist fails the lane.

Exit 0 means every required metric passed. Exit 1 is a budget, workload, measurement or evidence failure, and exit 2 is a bad flag, budgets file or baseline ref. Evidence goes to `results/<comparison id>/`. `--lanes node` or `--lanes build` runs part of the gate, prints `INCOMPLETE` and exits 1. `--evaluate <samples.json>` judges saved samples again.

CI runs `pnpm perf` in the `perf` job of `.github/workflows/quality.yml`, on `ubuntu-24.04`, beside the static and test jobs and with a 15-minute timeout. It uploads `tools/perf/results` as the `perf-results` artifact even when it fails. The CI runner is judged against its own Node profile, `node-linux-x64`, and the same byte budgets as this Mac.

## Frame measurement

`measure.ts` drives headless Chrome over the DevTools protocol, waits for a tick window in a race, and prints frame times, the cost of each part of the frame, draw calls, triangles, GC pauses, long tasks, and the WebGL renderer. The entry reads the flags with `src/measure-options.ts` and runs `src/measure.ts` on Effect. `src/measure-page.ts` waits for ticks, takes the screenshots and runs the trace, `src/measure-model.ts` decodes the page's samples and works out the summary, and `src/measure-report.ts` prints it. `@racer/devtools` launches the browser and owns the DevTools session, `@effect/platform-node` supplies the HTTP client, the WebSocket and the file system, and `effect/Schema` decodes what Chrome sends back.

### Serve the production build

Ports 1350 and 1351 belong to the play server. Use 1352 or higher.

```sh
cd apps/web
pnpm exec vite build --sourcemap
pnpm exec vite preview --port 1352 --strictPort
```

`--sourcemap` only adds `.map` files and a trailing comment to each chunk, so the code that runs is the production bundle. The maps let a CPU profile name functions by source file and line. Stop the server by port when you are done: `lsof -ti tcp:1352 | xargs kill`.

### Run

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
| `--from`, `--to` | the bench window | Tick range measured, inclusive. The default is `benchWindows.stress` in `packages/sim/src/bench-window.ts`, the `pack-riding-v1` window. |
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

### The page side

`?stress` starts a fixed race as soon as the game loads and puts the player on the pilot: Slag Row at level 5, the full field of fourteen, seed 8, the player on the Ostra Sesta 600 with aggression 0.8, rivals given the most aggression toward the player and a grudge against them, eight police with a 250 m sight range, and pacing of `leadEase` 0.8 and `catchUp` 0.6, which holds the pack around the player. `?stress=reference` is the ordinary Slag Row level 1 race on the starting bike on seed 31. `packages/career/src/bench.ts` builds both setups, and `apps/web/src/career/bench.ts` reads the URL.

By default `measure.ts` measures `benchWindows.stress` from `packages/sim/src/bench-window.ts`, ticks 2107 to 2707, which is the perf gate's `pack-riding-v1` window. The player rides through the whole window at 43 m/s or more in 12th to 15th of 15, with 10 to 13 rivals within 150 m ahead. The race depends on the AI pilot in `packages/sim/src/pilot.ts` and the `pilot-*.ts` files beside it, so a change to them can move or empty the window. `pnpm perf` then fails the workload check, and `node tools/perf/gate.ts --select-window` lists the eligible windows. Until October 22, 2026 the window was ticks 2880 to 3480, where the player crashed and spent 383 of the 601 ticks off the bike.

`?prof` records without starting a race, and `?stress` implies it. The frame loop then records, per frame, the CPU time of each part and the draw calls and triangles each pass submits. Where `EXT_disjoint_timer_query_webgl2` is exposed it also times each part on the GPU. Samples sit in preallocated typed arrays and `globalThis.__rushlineProfile` reads them out: `info()` and `window(fromTick, toTick)`. Each frame also keeps three's counts of shader programs, textures, and geometries, and the tool lists the ticks where any of them grew: a program that appears after the green light was compiled on the frame that first drew it, and a texture was uploaded on it. Each frame also keeps `created`, how many programs and textures the WebGL context has created since the profiler started, counted in wrappers around its `createProgram` and `createTexture`. These counts do not depend on how busy the machine is. Each frame also keeps the `performance.now()` it started at; the tool lines that clock up with the trace's through a `console.timeStamp` mark, which is how a worst frame is matched with the trace events that overlap it.

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

## Real-GPU frame lane

`pnpm perf:gpu` measures frame pacing the way a player sees it, and the render counts, in two windowed Helium runs that `rv` owns, at normal vsync, on this Mac's GPU. CI does not run it. Side A is a `/tmp` clone at the baseline revision, never a worktree. Side B is this checkout. Every limit comes from `budgets.json`, environment `gpu-helium-metal`, and the lane exits 2 when that file is incomplete.

```sh
git clone --no-hardlinks . /tmp/rushline-perf-gpu-a
git -C /tmp/rushline-perf-gpu-a checkout --detach <baseline revision>
(cd /tmp/rushline-perf-gpu-a && pnpm install --prefer-offline --frozen-lockfile)
(cd /tmp/rushline-perf-gpu-a && node tools/verify/rushline.ts up --slot 0 --path /kit)
node tools/verify/rushline.ts up --slot 1 --path /kit
pnpm perf:gpu --a <A run> --b <B run> --baseline-ref <baseline revision>
node tools/verify/rushline.ts down --run <A run>
node tools/verify/rushline.ts down --run <B run>
rm -rf /tmp/rushline-perf-gpu-a
```

Without `--baseline-ref`, A must serve the revision named in `tools/perf/budgets.json`. The lane refuses runs that serve another revision or another checkout. It also requires every `rv doctor` check except console errors, because `/kit` logs a hydration error on load (a `<div>` inside a `<p>`). Instead, the lane counts console errors during each race and fails on any.

For each side, the lane:

1. Sets the game's own frame-rate setting to 60 in `localStorage` and measures the page's `requestAnimationFrame` rate. On a 120 Hz display the game then draws every second vsync. The lane never changes display settings.
2. Warms each scenario once, to tick 120.
3. Runs five pairs per scenario, alternating which side goes first. Only the measured side renders; the other waits on `/kit`. Each sample opens a fresh race at `?stress&rung=0` or `?stress=reference&rung=0` (pixel ratio 2, governor off, pacer on), installs a buffered long-task observer before the window starts, waits for the window's last tick, and reads the benchmark rows, the frame records and the long tasks. On side B it also reads `created` on every frame since the race's first.

A sample fails if any of these is wrong: the window's workload, rider counts, tick times, visibility or frame-rate setting, a frame's race, rung, pixel ratio or size epoch, any discarded simulation time, fewer than 120 frames, a missing counter, or a console error. Every sample must also have the same page size and device pixel ratio. The lane stops before warming up if A's and B's windows already differ, which happens when a window is resized; restart that run.

Each of B's races must also create no shader program and no texture after its first frame. The lane subtracts `created` on the first countdown frame from `created` on the window's last tick, so any program compiled or texture created in between fails it, work that can stall a frame, as a new shader variant did for 125 ms at tick 268 before `ba109d2`. It counts creations rather than three's live counts, because three can release a resource and create its replacement on one frame: a texture whose `wrapS` changes gets a new WebGL texture and loses the old one, and the live count stays the same. The lane fails with the resource, how many were created, and the frame and tick of each creation:

```text
FAIL first-use pack-riding-v1 side=B pack-riding-v1-pair0-B.json programs created after the first race frame: 1 (+1 at frame=705 tick=439)
```

Fix it by staging what that frame first drew in `apps/web/src/game/staging.ts`, so warm-up draws it before the green light. When every race holds, the lane prints `ok   first-use side=B created no shader program or texture after the first race frame in 10 races of reference-v1 and pack-riding-v1; what only other roads or untriggered effects draw is unchecked`. These counts do not depend on how busy the machine is, so this check holds on a loaded machine even when the timing limits do not. It has these limits:

- It sees only what the two scenarios draw, both on Slag Row. A resource that only another road draws, or only an effect these races do not trigger, passes.
- The first race frame is the reference, so a resource first drawn on it, at the start grid, counts as warmed.
- Geometries are not checked, because city chunks stream in and hazard pools grow during a race by design. A geometry uploaded on first use, as each weapon's was before `8f6ebfe`, is for review.
- A texture uploaded again into the WebGL texture it already has, through `needsUpdate` with unchanged settings, creates nothing and passes.
- Side A is not judged, because it is the baseline revision, so the lane does not read its `created`.

| Metric | Limit | Paired B/A |
| --- | --- | --- |
| `frame.interval.p50` / `p95` / `p99` | 17.5 / 20 / 33.334 ms, the owner's caps | 1.10 / 1.15 / 1.20 |
| `frame.missedFraction` | 0.01, the owner's cap | none |
| `main.longTask.count` | 0, the owner's cap | none |
| `main.longTask.blockingMs` | 0 ms, the owner's cap | none |
| `render.calls.max`, `render.triangles.max` | per scenario, ceil(1.05 x the baseline maximum) | none |
| `render.programs.max`, `render.textures.max` | per scenario, the baseline maximum + 1 | none |
| `riders.cpu.p95` | per scenario, twice the worst B window at the first revision that plants the riders' hands every frame | none |

Every one of B's five windows must hold the interval caps, the missed-fraction cap and the riders cap on its own, so one bad window fails even when the other four are smooth: the observed value is the worst window's, and the line also prints both sides' values pooled over all five windows. The long-task values sum the five windows. The paired ratio is the median of the five per-pair ratios. A missed slot is `max(0, round(interval / 16.667 ms) - 1)`, and the missed fraction is missed slots over frames plus missed slots. A long task counts when it overlaps the window. Its blocking time is the part after its first 50 ms, clipped to the window. A frame's draw calls and triangles are the sum of its passes, and each count metric is the largest frame in any of B's windows. Programs and textures are three's live counts on that frame. A frame's riders time is the `riders` part of its CPU profile, which poses and places every rider and bike; the capture names its parts, so the lane reads that column by name. The lane also prints both sides' peaks, worst frame and frame CPU time.

Evidence goes to `tools/perf/results/gpu-<time>-<A>-<B>/`: every raw page capture, `samples.json`, both doctor outputs before and after, and `result.json` with the budgets file and its hash, the display facts, sides, order, observations and file hashes.

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
