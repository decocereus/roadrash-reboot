# Performance

`tools/perf` holds the perf gate, which holds tick cost, allocations, bytes, frame pacing and render counts to `budgets.json`, the frame bench `measure.ts`, and the play-test session reader `session.ts`.

## The perf gate

| Command | What it checks | Where it runs |
| --- | --- | --- |
| `pnpm check:perf` | `budgets.json` and the baseline in `baselines/` against their schema, the scenario registry and each other. It measures nothing and takes about a second. | `pnpm check`, so also the CI static job |
| `pnpm perf` | The Node lane (throughput, tick p95 and p99, allocated bytes per tick) and the build lane (route, game, Worker and client bytes, the seventeen GLBs and the decoded size of their textures), side A against side B in one run. | `pnpm verify` and the CI `perf` job |
| `pnpm perf:gpu` | Frame pacing, render counts (draw calls, triangles, shader programs and textures), and shader programs or textures first created mid-race in the two Slag Row scenarios, in two windowed browser runs on a real GPU: Helium on this Mac, Chromium on vimaan. | Locally, by hand. CI never runs it. |

Render counts are checked only by `pnpm perf:gpu`, on a machine with a row in `packages/devtools/src/browser-host.ts`. CI has no GPU, and on a software renderer (SwiftShader) the pack scene draws about one frame a second, too slow to fill a measured window, so there is no CI count lane. A change that adds draw calls, triangles, programs or textures passes CI and fails `pnpm perf:gpu`, so run the GPU lane before you merge a change to the renderer, the scene or the assets.

### Budgets and the baseline

`budgets.json` has one row per metric, scenario and environment. Each row gives the limit, its direction and unit, the paired B/A margin if there is one, the baseline value it came from, the derivation, and the id of the run that measured the baseline. The environments are the Node runner (`node-darwin-arm64` for this Mac, `node-linux-x64` for CI), `build` for bytes, which do not depend on the machine, and one GPU environment per browser host: `gpu-helium-metal` on this Mac and `gpu-chromium-nvidia` on vimaan, a Linux laptop with a GTX 1650 Ti. A GPU number is judged only against its own environment's rows and is never compared with another machine's. Each Node environment also has a calibration profile: `c0`, the median time of the fixed calibration workload on that runner, and the run that measured it.

The four `snapshot.*` rows measure side B alone, because the race snapshot does not exist at the baseline revision, the way a new GLB does not. `tools/perf/snapshot.ts` is their child: it rides the scenario's window with a second race of the same setup one tick ahead as the restore destination, and records, for every tick, how long `writeSnapshot`, `restoreInto` and `hashRace` take and how many bytes the snapshot holds. It runs three times per scenario on side B, and the ms rows are divided by the runner's calibration scale like the other timings. `node.ts` never imports the snapshot codec, so side A's children still run with the current harness copied over an older revision.

The six `room.*` rows measure side B alone as well, because no room exists at the baseline revision. `tools/perf/room.ts` is their child. It seats four riders on the scenario's race with weaving scripted controls and a client six ticks ahead of the room. `room.tick.p95` times `accept` for every seat, `step` and `writeTick`. `room.confirm.p95` times `readTick` and `confirm` on a tick the client guessed right, and `room.rollback.p95` on one it guessed wrong, which restores the confirmed race and resimulates up to the lead. `room.allocatedBytesPerTick` samples the server's work alone and `room.client.allocatedBytesPerTick` the client's over recorded packets, each as the least of three sampled windows of the same work, because unoptimized code allocates about 500 KB per tick, so a window sampled while V8 still optimizes reads how busy the runner is, and that noise only ever adds bytes. `room.frame.allocatedBytesPerTick` samples two `TickFrame`s cleared, filled and compared, which is the map churn the room and each client pay per tick and resimulated tick.

| Metric | Limit | Paired B/A |
| --- | --- | --- |
| `sim.ticksPerSecond` | at least 0.90 x the calibrated baseline median | at least 0.90 |
| `sim.tick.p95`, `sim.tick.p99` | at most 1.15 and 1.20 x the calibrated baseline median | at most 1.15, 1.20 |
| `sim.allocatedBytesPerTick` | at most 1.10 x the baseline median, never calibrated | at most 1.10 |
| `snapshot.write.p95`, `snapshot.restore.p95`, `snapshot.hash.p95` | at most 1.15 x the calibrated baseline median | none, side B only |
| `snapshot.bytes.max` | the baseline size exactly | none, side B only |
| `roadLife.tick.p95`, `lobby.tick.p95` | at most 1.15 x the calibrated baseline median | none, side B only |
| `room.tick.p95`, `room.confirm.p95`, `room.rollback.p95` | at most 1.15 x the calibrated baseline median | none, side B only |
| `room.allocatedBytesPerTick`, `room.client.allocatedBytesPerTick`, `room.frame.allocatedBytesPerTick` | at most 1.10 x the baseline median, never calibrated | none, side B only |
| `bytes.*.raw`, `bytes.*.gzip` | the baseline plus 4,096 B or 2%, whichever is larger | none |
| `assets.glb.*`, `assets.texture.total` | the baseline size exactly | none |
| `render.calls.max`, `render.triangles.max` | ceil(1.05 x the largest frame in any baseline window, either side) | none |
| `render.programs.max`, `render.textures.max` | the largest baseline count plus one | none |
| `riders.cpu.p95` | twice the worst B window at the first revision that plants the riders' hands every frame | none |
| `frame.interval.*`, `frame.missedFraction`, `main.longTask.*` | the owner's caps, in the GPU lane's table below | at most 1.10 / 1.15 / 1.20 for p50 / p95 / p99 |

Every Node child runs with `--no-concurrent-recompilation`. With the background compiler on, what the optimised code inlines depends on when each compile job finishes, so identical code settles into one of two states per run. On CI `pack-riding-v1` then read about 30 or about 47 kB per tick, `sim.tick.p95` about 0.105 or about 0.13 ms, and `reference-v1` `room.allocatedBytesPerTick` about 28 or about 31 kB, and the pairs were too few to hide it. Compiling on the main thread takes the timing of the compile jobs out of the run. It also makes the readings slower than the background compiler's best, so these rows are for comparing two sides and do not say what a player's tick costs.

Every Node child also gets its own `PERF_LAYOUT_PADDING`, 0 to 16,383 bytes of environment hashed from its file name. The size of the environment moves the start of the stack, and about 3% of positions on an M4 Pro make `reference-v1` read `sim.tick.p95` about 0.07 ms against about 0.049 ms. One fixed layout put all five samples of a side in that band, so a longer `PATH` under `pnpm verify` failed the paired limit at 1.44 x while `pnpm perf` passed. With a layout per child a bad position costs one sample, and the median drops it.

`baselines/post-step8.json` is the baseline summary. It holds the revisions, the harness digest, each scenario's hash and window, each run's identity (machine, runtime, browser and display), every observed value a limit came from, and the track compile time, which is recorded and has no budget. The raw samples sit beside it as gzipped JSON, which `gunzip -c` reads. The baseline revision is `caea29f`, the change that gave each road one layout. All Node rows and both Node profiles come from one run per platform at that revision: `one-layout.node-darwin-arm64.json.gz`, measured on this Mac, and `one-layout.node-linux-x64.json.gz`, from the one of five parallel baseline jobs in CI that landed on an AMD EPYC 7763. The Mac's render-count and frame rows still come from a GPU-lane run of `094d561`, `post-step8.trucks.gpu-helium-metal.json.gz`, at the 1283x790 page `rv` opens since Helium 0.20, because the lid was closed when the new baseline was measured. Measure them again with the next Mac GPU run. Their render limits are looser than they need to be until then, since the windows draw less than the old ones did. The route, game and client bytes and the GLB rows for the bike, the car, the van, the three generic riders still come from the first baseline's Mac run at `fd677a7`, `post-step8.node-darwin-arm64.json.gz`, because the owner holds the art's bytes red until they move to a CDN. `bytes.route.root.raw`, `assets.glb.truck` and `assets.glb.total` come from this revision's Mac run instead, because the truck is a new GLB and the root route's previous row came from the run this one replaces. The two Worker rows come from their own build-lane run of `fd677a7`, `post-step8.worker.json.gz`, because the first baseline counted `server.js` alone. The Seraph, Ghost and Oni GLB rows come from a build-lane run at `6e6ea5a`, the first revision that ships them, `post-step8.bikes.json.gz`. The six celebrity GLB rows and `assets.texture.total` come from a build-lane run at `6011594`, the first revision that ships all six measured riders on this baseline's harness, `post-step8.six-celebrities.json.gz`. The two `riders.cpu.p95` rows come from a GPU-lane run of `b8705dd` against the change that plants the riders' hands every frame, `post-step8.riders.json.gz`, which keeps the riders column of every capture's frames. `assets.texture.total` is what every texture embedded in the shipped GLBs takes on the GPU, each decoded to RGBA8 with its full mip chain; the build lane reads each image's size from its lossless WebP header and fails on any other format, because `tools/blender/compress.ts` writes only lossless WebP. A GLB's limit is its exact size, so the revision does not change it. The GLB inventory check applies to side B only, because side A is an older revision that can predate a model. GitHub's runners differ in speed in a way the calibration workload does not fully see. At `094d561` the same harness read `sim.tick.p95` on `pack-riding-v1` at about 0.20 ms on an AMD EPYC 9V45, 0.32 ms on an Intel Xeon and 0.37 ms on a 9V74 and a 7763, scaled by each runner's own calibration. Scaled by the 7763's calibration, as the gate does, those read about 0.25, 0.34, 0.32 and 0.37 ms, so the 7763 is the slowest seen. The baseline run is on a 7763, and every Linux timing row carries an extra 1.3 x because earlier runs on that model read up to 1.1 x it. These rows catch less on a fast runner. The paired A/B limits on `sim.ticksPerSecond` and `sim.tick.*` do not depend on the runner and catch a slowdown there. The `snapshot.*`, `room.*` and `roadLife.*` timing rows are side B only, so on CI they catch only a large slowdown, and this Mac's rows catch the rest in `pnpm perf`. The `gpu-chromium-nvidia` rows come from a GPU-lane run on vimaan of this baseline revision against itself, `one-layout.vimaan.gpu-chromium-nvidia.json.gz`. Vimaan has no campaign at the revision that first planted the riders' hands, so its two `riders.cpu.p95` rows stay twice the worst B window of its first campaign, `post-step8.vimaan.gpu-chromium-nvidia.json.gz`. The Mac's `roadLife.tick.p95` comes from `districts.node-darwin-arm64.json.gz`, the road-life lane of a gate run at `baa60e4`, because Breakwater Run's districts moved `harbour-cross` from 1,700 to 560 m. The window moved with it onto the pack, which is why the row reads 0.82 ms where the old window read 0.23 ms: replayed on the same machine, the old road's worst window is 0.99 ms and the new road's is 0.86 ms. The `node-linux-x64` row still names the previous window until a CI run measures this one. `budgets.json` names the summary and each raw file with its SHA-256. `pnpm check:perf` fails when a hash, a scenario hash, a required row, or a limit's baseline value does not match.

Nothing rewrites the budgets. To measure a new baseline, run `node tools/perf/gate.ts baseline --baseline-ref <rev>` on this Mac and in the CI perf job, and run `pnpm perf:gpu`. Then update `budgets.json`, the summary, the raw files and their hashes together, and explain each changed limit in the pull request.

A baseline run scales its timings by its own calibration and proposes that calibration as the new node profile. To add a row without replacing the profile, gunzip the raw samples and read the `observed` value from `node tools/perf/gate.ts --evaluate <samples.json>`, which scales by the retained profile the way the gate will. A value copied from the proposal leaves more headroom than its derivation says.

### Scenarios

`src/scenarios.ts` registers two 601-tick windows. On every tick the player must be riding at 20 m/s or more, with the pinned number of rivals within 150 m ahead, and the rival total must match exactly. An emptier window or a crash fails before any timing is judged.

- `reference-v1` is the `?stress=reference` race, Slag Row on seed 31 with the starting bike and tier 1's field, ticks 3849 to 4449, with 7 to 8 rivals ahead.
- `pack-riding-v1` is the `?stress` race, Slag Row on seed 8 with tier 3's field and eight police, ticks 2028 to 2628, with 10 to 12 rivals ahead.

Until October 25, 2026 the windows were ticks 1727 to 2327 with 10 rivals ahead on every tick, and ticks 2165 to 2765 with 11 to 13. Centred bars that follow gentle curves spread both fields, and no 601-tick window in the first 7,200 ticks of either race holds those counts any more, so each window is now the one the selection rule picks and its band is what that window holds. Until the handling change of November 2026 they were ticks 1811 to 2411 and ticks 2107 to 2707. Bends that need the bars moved the riders again. Until the moving trucks of November 2026 `pack-riding-v1` was ticks 3017 to 3617 with 6 to 14 rivals ahead. Trucks and shorter wipeouts moved that field, and `reference-v1` still picks the same window with the same workload digest. The search now starts at tick 1800, after 30 s of racing. From tick 600 the rule picked ticks 600 to 1200 in both races, where the same code read `sim.tick.p95` 29% apart between two sides on CI, because slow ticks come in bursts and the p95 of a 601-tick window lands on the edge of them. Until roads went to one layout on November 4, 2026 they were ticks 5679 to 6279 and ticks 2918 to 3518. The roads now end at 8.5 km and riders moved home, so the fields ride differently, and each window is again the one the selection rule picks. A window's cost depends on where in the race it sits: on the code before that change, the `reference-v1` race read a tick p95 of 0.058 ms at ticks 5679 to 6279 and 0.198 ms at ticks 3849 to 4449, and after it 0.188 ms at ticks 3849 to 4449. So the higher `sim.tick` limits since then come from the window moving, not from a slower simulation.

Each scenario's hash covers its window, its race setup and the road it runs on. The road enters as the compiled track: the sampled centreline with every zero counted as +0, the lanes, props, truck starts and hazards, and the plan's race settings. How the plan writes its geometry stays out, so a change to the track format that compiles the same road keeps the hash, and side A at an older revision still matches side B. The compiled crossings enter only when the road has one, so a road without junctions or crossings hashes as it did before they existed, and side A, whose tracks predate crossings, hashes the same road. Every side reports its own hash, and a side whose hash differs from the registry's fails before any timing is judged.

The harness runs on side A as well, so it drives a race only in ways both sides understand. The race plans every pilot rider inside `step`, in index order, so the harness builds it with the player pilot-controlled and steps it with an empty input frame. A race ends on the player's `finish`, `busted` or `wrecked` event, the same rule the career's race log uses, and the workload reads the player through `riderOf`.

`node tools/perf/gate.ts --select-window` replays both races and checks that the registered windows are still the ones the fixed selection rule picks.

`road-life-v1` is the third window, and it runs on side B alone, because the roads at the baseline revision have no junctions and a window on them could not hold the same race on both sides. It is `roadLifeSetup` in `packages/career/src/bench.ts`, Breakwater Run on seed 8 with the full field, ticks 840 to 1,440, as the pack rides through `harbour-cross` at 560 m, which is the road's costliest window. Its one budget row, `roadLife.tick.p95`, covers the whole race step, cross cars and the pilot's forecast of them included. Each of five child runs measures a warmed second pass. The window checks only that at least four cross cars stay on the road and that three racers reach a junction, so a change to how riders ride does not invalidate it. It is not in the scenario registry, and the windows the registry pins are untouched.

`lobby-v1` is the fourth window, on side B alone for the same reason, because the baseline revision predates the bar. `tools/perf/src/node-lobby.ts` steps eight riders across the bar floor with each other as blockers, the door moment's load, and each tick one rider plans a new route. A plain step takes about 3 microseconds and a route takes about 0.45 ms, so a window of plain steps would put the plans beyond its p95. Its one row, `lobby.tick.p95`, is therefore the cost of the costliest kind of tick. Each of five child runs measures a warmed second pass. The window checks that at least four riders keep moving and that the plans find routes.

### `pnpm perf`

Side A is a `/tmp` clone of the revision that `budgets.json` names, installed with `pnpm install --prefer-offline --frozen-lockfile`, with the current harness copied over it. It installs from the local store and fetches only what the store and metadata cache lack: when side B's lockfile differs from side A's, pnpm's supply-chain check has to verify A's lockfile, and that needs registry metadata that a fully offline install cannot fetch. `--baseline-ref <rev>` picks another revision. Side B is this checkout. The clone is deleted when the run ends. For each scenario, the Node lane runs one validation pass per side, five timing pairs in alternating order with six calibration blocks around them, and three allocation pairs, each in a fresh child process. The build lane runs a fresh production build of each side. A route's bytes are the root's and the route's Start preloads and every chunk they import statically, with their CSS and assets, plus every stylesheet. The Worker's bytes are every server chunk the entry reaches through static or dynamic imports, each file once, because the entry loads the router, the Start setup and every route on demand. A manifest edge to a chunk that does not exist fails the lane.

Exit 0 means every required metric passed. Exit 1 is a budget, workload, measurement or evidence failure, and exit 2 is a bad flag, budgets file or baseline ref. Evidence goes to `results/<comparison id>/`. `--lanes node` or `--lanes build` runs part of the gate, prints `INCOMPLETE` and exits 1. `--evaluate <samples.json>` judges saved samples again.

CI runs `pnpm perf` in the `perf` job of `.github/workflows/quality.yml`, on `ubuntu-24.04`, beside the static and test jobs and with a 15-minute timeout. It uploads `tools/perf/results` as the `perf-results` artifact even when it fails. The CI runner is judged against its own Node profile, `node-linux-x64`, and the same byte budgets as this Mac.

## Frame measurement

`measure.ts` drives a browser over the DevTools protocol, waits for a tick window in a race, and prints frame times, the cost of each part of the frame, draw calls, triangles, GC pauses, long tasks, and the WebGL renderer. The entry reads the flags with `src/measure-options.ts` and runs `src/measure.ts` on Effect. `src/measure-page.ts` waits for ticks, takes the screenshots and runs the trace, `src/measure-model.ts` decodes the page's samples and works out the summary, and `src/measure-report.ts` prints it. `@racer/devtools` launches the browser and owns the DevTools session, `@effect/platform-node` supplies the HTTP client, the WebSocket and the file system, and `effect/Schema` decodes what Chrome sends back.

### Serve the production build

Ports 1350 and 1351 belong to the play server. Use 1352 or higher.

```sh
cd apps/web
pnpm exec vite build --sourcemap
pnpm exec vite preview --port 1352 --strictPort
```

`--sourcemap` only adds `.map` files and a trailing comment to each chunk, so the code that runs is the production bundle. The maps let a CPU profile name functions by source file and line. Stop the server by its pid when you are done. `lsof -ti tcp:1352` on macOS and `ss -ltnp "sport = :1352"` on Linux name it.

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
| `--url` | required | Page to load. Pin the ratio with `?ratio=` so the 60 Hz pacing does not hide the headroom. Add `&preset=full`, `balanced` or `lean` to measure a preset the device check would not pick. |
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
| `--browser` | `headless` | `headless` or `windowed`, on whichever browser this machine's row in `packages/devtools/src/browser-host.ts` names. On this Mac that is headless Google Chrome and a windowed Helium, opened behind the other windows with `open -g` so it does not take focus. On vimaan it is Chromium, and `windowed` holds the on-demand desktop session for the whole bench. |
| `--width`, `--height`, `--scale` | 1512, 860, 2 | Viewport and device scale factor. |
| `--out` | `tools/perf/results` | Where JSON, traces, and screenshots go. The folder is ignored by git. |

Each run launches the host's browser with a new temporary profile that is deleted when the run ends, fails or is interrupted, `--force-device-scale-factor`, `--disable-gpu-vsync --disable-frame-rate-limit` so frames are not capped, and the host's GPU flags: `--use-angle=metal --enable-gpu --ignore-gpu-blocklist` on this Mac, `--use-gl=angle --use-angle=gl-egl` headless and `--use-gl=angle --use-angle=gl` windowed on vimaan. The summary prints the unmasked renderer string. It should read `ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro, ...)` on this Mac and `ANGLE (NVIDIA Corporation, NVIDIA GeForce GTX 1650 Ti ...)` on vimaan, and never SwiftShader.

`measure.ts`, `pnpm perf:gpu` and `pnpm perf`, including `pnpm perf baseline`, take one exclusive claim, `$TMPDIR/rushline-verify/bench.lock`, because two benches at once skew each other. A second `measure.ts` or `perf:gpu` fails at once and names the holder's pid and command, because its browsers are already open. `pnpm perf` queues instead, for up to an hour, and exits 3 with no verdict if the holder is still there. A bench also refuses to start while a browser from any other `rv` run is open, and while it holds the claim `rv up`, `open`, `click`, `press` and `rebuild` fail and name it. `perf:gpu` allows its two runs. A campaign of several commands, or one that drives `rv` itself, runs as `rv bench <label> -- <command> [args]`: the claim covers the whole command, and its child processes draw and measure under it. A checkout older than this rule does not honour the refusal. A claim whose pid has died is recovered, by one process at a time: the process that takes `bench.lock.clearing` re-reads the claim and removes it only if it is still dead. Plain `rv` verification takes no claim.

`pnpm perf` also judges the machine's load, because timing rows fail on load alone. With the `node` lane, it waits up to 10 minutes for the one-minute load average to fall to three quarters of the logical CPUs, 9 on this Mac, and exits 3 with no verdict if it does not. It reads the load again after each scenario. A peak over the limit, or a calibration that drifted during a timed run, ends the run in `NO VERDICT` with exit code 3, whatever the rows say. Drift counts because the load is only read between scenarios: one run here drifted 40% and the load never read above 7.4. `result.json` records the limit and the peak. Do not commit a baseline from that run. CI skips the load check, because its runner does nothing else, so CI's perf job gives the verdict when this machine stays busy.

### The page side

`?stress` starts a fixed race as soon as the game loads and puts the player on the pilot: Slag Row with tier 3's field, the full field of fourteen, seed 8, the player on the Ostra Sesta 600 with aggression 0.8, rivals given the most aggression toward the player and a grudge against them, eight police with a 250 m sight range, and pacing of `leadEase` 0.8 and `catchUp` 0.6, which holds the pack around the player. `?stress=reference` is the ordinary Slag Row race with tier 1's field on the starting bike on seed 31. `packages/career/src/bench.ts` builds both setups, and `apps/web/src/career/bench.ts` reads the URL.

By default `measure.ts` measures `benchWindows.stress` from `packages/sim/src/bench-window.ts`, ticks 2918 to 3518, which is the perf gate's `pack-riding-v1` window. The player rides through the whole window at 24 m/s or more, with 8 to 14 rivals within 150 m ahead. The race depends on the AI pilot in `packages/sim/src/pilot.ts` and the `pilot-*.ts` files beside it, so a change to them can move or empty the window. `pnpm perf` then fails the workload check, and `node tools/perf/gate.ts --select-window` lists the eligible windows. Until October 22, 2026 the window was ticks 2880 to 3480, where the player crashed and spent 383 of the 601 ticks off the bike.

`?prof` records without starting a race, and `?stress` implies it. The frame loop then records, per frame, the CPU time of each part and the draw calls and triangles each pass submits. Where `EXT_disjoint_timer_query_webgl2` is exposed it also times each part on the GPU. Samples sit in preallocated typed arrays and `globalThis.__rushlineProfile` reads them out: `info()` and `window(fromTick, toTick)`. Each frame also keeps three's counts of shader programs, textures, and geometries, and the tool lists the ticks where any of them grew: a program that appears after the green light was compiled on the frame that first drew it, and a texture was uploaded on it. Each frame also keeps `created`, how many programs and textures the WebGL context has created since the profiler started, counted in wrappers around its `createProgram` and `createTexture`. These counts do not depend on how busy the machine is. Each frame also keeps the `performance.now()` it started at; the tool lines that clock up with the trace's through a `console.timeStamp` mark, which is how a worst frame is matched with the trace events that overlap it.

| Part | What it covers |
| --- | --- |
| `sim` | Pilot inputs and `stepRace` for the ticks this frame |
| `other` | Sound, HUD reports, and the frame meter |
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

A headless browser is allowed here because the bench measures uncapped frame cost. Verifying how the game looks and plays uses a windowed browser. See `.claude/skills/verify-rushline/SKILL.md`.

## Real-GPU frame lane

`pnpm perf:gpu` measures frame pacing the way a player sees it, and the render counts, in two windowed browser runs that `rv` owns, at normal vsync, on this machine's GPU. CI does not run it. Side A is a clone at the baseline revision, never a worktree. Side B is this checkout. Both run under this checkout's `rv`, because the baseline revision's own `rv` knows only macOS, and `rv` serves whichever checkout its working directory is in. Every limit comes from `budgets.json`, in the environment this machine's host row names, and the lane exits 2 when that file is incomplete.

```sh
git clone --no-hardlinks . /tmp/rushline-perf-gpu-a
git -C /tmp/rushline-perf-gpu-a checkout --detach <baseline revision>
(cd /tmp/rushline-perf-gpu-a && pnpm install --prefer-offline --frozen-lockfile)
(cd /tmp/rushline-perf-gpu-a && node "$OLDPWD/tools/verify/rushline.ts" up --slot 0 --path /kit)
node tools/verify/rushline.ts up --slot 1 --path /kit
pnpm perf:gpu --a <A run> --b <B run> --baseline-ref <baseline revision>
node tools/verify/rushline.ts down --run <A run>
node tools/verify/rushline.ts down --run <B run>
rm -rf /tmp/rushline-perf-gpu-a
```

On vimaan, put the clone in `/var/tmp/rushline-perf-gpu-a`. `/tmp` there is a 3.8 GB tmpfs in RAM, and A's `node_modules` alone is 1.8 GB, which `/tmp` cannot hardlink from the pnpm store on the other filesystem.

Without `--baseline-ref`, A must serve the revision named in `tools/perf/budgets.json`. The lane refuses runs that serve another revision or another checkout. It also requires every `rv doctor` check except console errors, because `/kit` logs a hydration error on load (a `<div>` inside a `<p>`). Instead, the lane counts console errors during each race and fails on any.

For each side, the lane:

1. Sets the game's own frame-rate setting to 60 in `localStorage` and measures the page's `requestAnimationFrame` rate. On a 120 Hz display the game then draws every second vsync. The lane never changes display settings.
2. Warms each scenario once, to tick 120.
3. Runs five pairs per scenario, alternating which side goes first. Only the measured side renders; the other waits on `/kit`. Each sample opens a fresh race at `?stress&rung=0` or `?stress=reference&rung=0` (the host's own preset, pacer on; `rung=0` stays in the URL only for side A's older revision), installs a buffered long-task observer before the window starts, waits for the window's last tick, and reads the benchmark rows, the frame records and the long tasks. On side B it also reads `created` on every frame since the race's first.

A sample fails if any of these is wrong: the window's workload, rider counts, tick times, visibility or frame-rate setting, a frame's race, a pixel ratio that changes during the window, or a size epoch, any discarded simulation time, fewer than 120 frames, a missing counter, or a console error. Every sample must also have the same page size and device pixel ratio. The lane stops before warming up if A's and B's windows already differ, which happens when a window is resized; restart that run.

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
| `render.calls.max`, `render.triangles.max` | per scenario, ceil(1.05 x the baseline maximum). Triangles over their limit print `WARN` and do not fail, because frame time per scene is the limit that blocks | none |
| `render.programs.max`, `render.textures.max` | per scenario, the baseline maximum + 1 | none |
| `riders.cpu.p95` | per scenario, twice the worst B window at the first revision that plants the riders' hands every frame | none |

Every one of B's five windows must hold the interval caps, the missed-fraction cap and the riders cap on its own, so one bad window fails even when the other four are smooth: the observed value is the worst window's, and the line also prints both sides' values pooled over all five windows. The long-task values sum the five windows. The paired ratio is the median of the five per-pair ratios. A missed slot is `max(0, round(interval / 16.667 ms) - 1)`, and the missed fraction is missed slots over frames plus missed slots. A long task counts when it overlaps the window. Its blocking time is the part after its first 50 ms, clipped to the window. A frame's draw calls and triangles are the sum of its passes, and each count metric is the largest frame in any of B's windows. Programs and textures are three's live counts on that frame. A frame's riders time is the `riders` part of its CPU profile, which poses and places every rider and bike; the capture names its parts, so the lane reads that column by name. The lane also prints both sides' peaks, worst frame and frame CPU time.

Evidence goes to `tools/perf/results/gpu-<time>-<A>-<B>/`: every raw page capture, `samples.json`, both doctor outputs before and after, and `result.json` with the budgets file and its hash, the environment, the display facts the host row's probes collect, sides, order, observations and file hashes.

### Vimaan

vimaan has no running desktop, so `rv up` starts one on demand. `packages/devtools/src/desktop.ts` owns it: a claim file holds the Hyprland pid, its Xwayland display and who holds it, and the last holder to leave stops it. A compositor someone else started is used and never stopped, but its layout usually changes the page, and the lane then refuses it. It needs a logind seat that can open, which the owner's console login on tty1 gives. These facts decide how a run looks there, and each was measured on 2026-11-03:

- The window goes through Xwayland with PRIME offload, because Wayland with `--render-node-override` crashes the GPU process and default Wayland uses the Intel GPU.
- `packages/devtools/src/rushline-desktop.conf` floats every window. A tiled window ignores `--window-size`, and opening a second run would resize the first, which the lane refuses.
- `--force-device-scale-factor=2` with the 1512x860 window gives a 1512x773 page at device pixel ratio 2, the ratio every sample must have. `pnpm perf:gpu` refuses any other page before warm-up, because the `gpu-chromium-nvidia` rows were measured on this one. That is 4.7 million pixels against 4.1 million on this Mac. The window is 3024x1720, larger than the 1920x1080 panel. Hyprland draws only what fits, and the game still renders the whole canvas. A fully covered window keeps its 16.7 ms frames.
- `--disable-features=BackForwardCache` keeps a parked side from holding VRAM. Without it the card's 4 GB filled with three finished races on `/kit`, about 1.1 GB each, and the other side's next race fell to a 116 ms median frame. With it a parked page holds about 120 MB. This Mac's unified memory never showed the problem, so its row does not carry the flag.
- The browser is `/usr/lib/chromium/chromium`, not `/usr/bin/chromium`, because that launcher adds the owner's `~/.config/chromium-flags.conf`, which loads extensions and asks for Wayland.

A full campaign took 30.7 minutes here on 2026-11-03.

### Intel

The UHD 630 in vimaan stands in for thin laptops. `RUSHLINE_BROWSER_HOST=linux-intel` selects its row, which leaves out the PRIME variables so Chromium stays on the Intel GPU. It runs a floating 1919x992 page at device pixel ratio 1. The two browsers of a campaign must have the same page size, and a fullscreen window would give one 1920x1080 and the other less. `presets.ts` gives this GPU the `lean` preset by itself, so the canvas is 1402x725 at ratio 0.73, about the pixel count of 1344x756 on a fullscreen page. `rv up` records the host in the slot, so `rv doctor` requires `Intel` in the renderer without the setting being repeated. The setting is checked against the tuple of hosts, and a value outside it stops the command.

**The `gpu-chromium-intel` frame rows are a floor, not the 60 fps cap, and the owner accepted that on 2026-11-05.** The UHD 630 does not reach 60 fps. The rows stop it getting worse and say nothing about whether it is good enough. A row's `value` is 1.1 x the worst window for p50, 1.15 x for p95, 1.2 x for p99 and for missed share, and its `derivation` says so. Render counts follow the NVIDIA rule: calls and triangles at 1.05 x, programs and textures at the maximum plus 1, `riders.cpu.p95` at 2 x. Replacing the floor with the caps needs a machine that holds them.

Campaign `gpu-2026-11-05T13-01-24-628Z-4a3249a-4a3249a`, setting 60, `ANGLE (Intel, Mesa Intel(R) UHD Graphics 630 (CFL GT2), OpenGL 4.6)`, worst of 5 windows per side:

| Scenario | fps, B / A | p50 ms | p95 ms | p99 ms | Missed | Calls | Triangles |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `reference-v1` | 56.0 / 55.7 | 18.2 / 18.0 | 21.8 / 21.9 | 23.2 / 22.9 | 0.18% / 0.36% | 508 | 1,605,457 |
| `pack-riding-v1` | 50.3 / 50.6 | 19.9 / 19.8 | 23.1 / 22.5 | 39.9 / 24.9 | 2.18% / 1.18% | 522 | 2,066,211 |

One B window on `pack-riding-v1` read 39.9 ms at p99 where the pooled figure is 25.3 ms, so that row's limit of 47.88 ms is loose.

In a stress race and a whole Breakwater Run, before and after the lean preset and shared depth, three capped runs of the stress window and one of the road, the frame rate went from 37.7 to 52.5 fps and from 37.7 to 49.9 fps. The time over 36 ms went from 3.5% to 0.6% and from 2.1% to 0.6%. These runs were on a fullscreen page, so don't compare them with the campaign above.

The campaign's `result.json` reads `ok: false`, for two reasons. The temporary budgets it ran against held placeholder frame caps, and `doctor-after` failed on both sides with `FileSystem.writeFile (/tmp/rushline-verify/desktop.lock.<id>/<id>)`, whose cause is untraced. No workload check failed, and all 20 samples were captured.

The lane turns Race data off, on every host. `/api/events` answers 500 under `vite preview`, because the route imports `cloudflare:workers`, and a failed beacon is a console error, which fails the sample.

To look at a stress race on this GPU outside the lane:

```sh
RUSHLINE_BROWSER_HOST=linux-intel node tools/verify/rushline.ts up --path "/?stress"
node tools/verify/rushline.ts wait --run <run> 'globalThis.__rushlineBench.info().lastTick >= 3518' --timeout 240
node tools/verify/rushline.ts js --run <run> 'globalThis.__rushlineProfile.window(2918, 3518).map((frame) => frame.interval)'
```

**The bar has a tick row, `lobby.tick.p95`, and no frame rows yet.** The frame rows wait on a vimaan run. It reads well on both cards. `/bar?prof&time=dusk`, Angled camera, 7 stand-in riders, three 20 s samples each in a development build on `1966237`:

| Card | Page, render ratio | fps | p50 ms | p95 ms | p99 ms | Over 20 ms | JS ms per frame | Calls | Triangles |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GTX 1650 Ti | 1512x773, 2 | 60.1 | 16.7 | 16.7 | 16.8 | 0 of 1,202 | 2.4 to 3.0 | 102 | 834,473 |
| UHD 630 | 1920x1080, 0.7 | 59.3 to 59.7 | 16.7 | 17.2 to 17.3 | 24.0 to 33.2 | 21 to 22 of about 1,190 | 4.9 to 5.1 | 102 | 834,473 |

The UHD 630 applies the bar's lean settings by itself, because `presets.ts` gives its name the `lean` preset. About 1% of its frames miss a vsync. JS is about 5 ms of a 16.7 ms frame, so the main thread is not the limit, but no GPU timer query separated the GPU from the compositor. p99 is noisy there, because a handful of frames moves it. The panel stops at 60 Hz, so the GTX 1650 Ti's numbers hide any headroom. The Whole room camera adds about 63,000 triangles and 0.6 ms of JS on the UHD 630. Measure again after a change to `post.ts`.

### Adding a host

Give it a row in `packages/devtools/src/browser-host.ts`. A row with `perfEnvironment: null` runs under `rv` and `measure.ts`, and `pnpm perf:gpu` refuses it. With an environment, `pnpm check:perf` fails until `budgets.json` has that environment's rows. Run a first campaign with `--budgets` pointing at a copy of the file that holds placeholder rows, so `result.json` records the counts without judging them. The frame, missed-frame and long-task rows keep the owner's caps. Derive the render-count rows from that campaign the way the table above says, and `riders.cpu.p95` as twice its worst B window. Add the raw captures to `baselines/` as gzipped JSON, the run and its observations to the summary, and the raw file and both hashes to `budgets.json`. No other environment's row changes.

## Play-test recordings

A play test on another machine, such as the MacBook Air reaching this Mac through a tunnel, records into the same build it plays. The play server is the development-mode build served by `vite preview`:

```sh
cd apps/web
NODE_ENV=development pnpm exec vite build --mode development
NODE_ENV=development pnpm exec vite preview --mode development --host 127.0.0.1 --port <port>
```

`vite preview` runs the built TanStack Start server, so `POST /api/telemetry` works on it, and `vite.config.ts` mounts the local store for `vite preview` and `vite dev`: each session is appended to `tools/perf/results/sessions/<sessionId>.jsonl`, one acknowledged batch per line. The preview server loads the server build once, so restart it after every rebuild; otherwise it serves HTML that names the previous build's assets.

Open the game with `?tester` in the address. Settings (from the title or the pause menu) then turns on the frame meter, recording, and automatic upload, and sets the test device to MacBook Air or MacBook Pro. Recording and upload are off until the tester turns them on, and the settings live in `localStorage` under `rushline.settings.v1`, apart from the career save. B while riding stamps a report marker. Send report uploads the current recording and anything still queued, and shows the report id, which is the session's short id and the batch number.

With recording on, every 30 seconds the page turns its rings into one batch of at most 48 KiB: the frame-interval histogram (8.33, 16.67, 23.33, 33.33, 50, 100, 250, and 1000 ms edges plus overflow), the 32 slowest frames with each part's CPU time, and the events since the last batch. Events are canvas resizes with their size generation, frames whose drawing a resize cleared before it was presented, unfinished render passes, WebGL context loss, errors with query strings stripped, visibility changes, race start, green, end, crash and quit, and report markers. Batches are numbered per session, sent oldest first, removed only once the collector acknowledges them, retried with backoff, and deduplicated by session and batch number on the server. The queue holds 24 batches and counts what it drops.

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
