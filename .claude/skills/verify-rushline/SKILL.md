---
name: verify-rushline
description: Launch and drive Rushline, the Three.js motorcycle combat racer in apps/web, in a windowed Helium over Chrome DevTools to prove a change works the way a player sees it - menus, races, jumps, career money, frame rate. Use after any change to apps/web, packages/sim, packages/track, packages/career, or packages/ui, when asked to run, screenshot, play-test, or profile the game, or when tests pass but nobody has looked at the game. Also lists the non-browser proofs (pnpm check, pnpm build, the perf gate).
---

# Verify Rushline

Rushline is a browser game. A change is verified when you have driven the real game in a real browser, captured what happened, and run the repo's checks. Passing tests do not show that it plays well (AGENTS.md).

Everything below goes through one helper, `rv`. Run it from the root of the checkout you are verifying, so the instance serves that checkout's code:

```sh
.claude/skills/verify-rushline/scripts/rv help
```

`rv` is a thin wrapper over `node tools/verify/rushline.ts`. The TypeScript lives in `tools/verify/` so the repo's lint and typecheck cover it. It reuses `@racer/devtools`: `packages/devtools/src/cdp.ts`, `chrome.ts`, and `analysis.ts`, which `tools/perf` uses too.

If `rv` itself takes many seconds to start, run `node tools/verify/rushline.ts` with the same arguments. On 2026-10-22 macOS took about 35 seconds to execute each script marked `com.apple.provenance`, the `rv` script and every `node_modules/.bin` shim among them, while `node` started at once.

## Rules that are not negotiable

- **Ports 1350 and 1351 belong to the user.** `pnpm dev` (alchemy dev, Vite with hot reload) runs on 1350 and the user's built play server runs on 1351 (`NODE_ENV=development vite build --mode development`, then `vite preview --mode development --host 127.0.0.1 --port 1351`). Since 2026-10-16 the user's tunnel URL `https://e9043c829ff09a21.e6iaysyqomua.opentunnel.xyz` points at 1351, so restarting or rebuilding it breaks what the user is sharing. Never start, stop, rebuild, reload, or drive 1350, 1351, or the tunnel unless the user tells you to. `rv` refuses the two ports unless you pass `--user-asked`.
- **Verification instances live in slots.** Slot n serves on port 1410+n and its browser listens for DevTools on 9410+n, n from 0 to 9. `rv up` takes the first free slot and writes a claim file to `$TMPDIR/rushline-verify/slot-<n>.json`. Every other command needs `--run <id>` and refuses a run id that does not own its slot. Never drive a slot another run holds; `rv list` shows them. Other agents may hold 1352-1409 and DevTools 9333-9409 at the same time.
- **No headless Chrome for verification.** The user's rule (2026-10-16): drive the game in Helium (`/Applications/Helium.app`), a windowed Chromium, with a throwaway `--user-data-dir`, never the user's own profile. `rv up` launches it with `open -g -n`, so it opens behind the user's windows and does not take keyboard focus. It is muted unless you pass `--sound`.
- **Input goes through DevTools only.** `rv press` and `rv click` send `Input.dispatchKeyEvent` and `Input.dispatchMouseEvent` to the page. They never move the user's mouse or type on their keyboard. Never call `Page.bringToFront` or activate the window.
- **Kill only what you started.** `rv down` stops the PIDs its claim file recorded, after checking each PID is still the process it started (vite.js, Helium, rushline.ts). Never kill by process name, and never `pkill node` or `pkill Helium`.
- **Never build into a directory another server serves.** The user's 1351 server and other agents' preview servers serve `apps/web/dist` of their checkouts. `rv up` builds into `apps/web/node_modules/.rushline-verify/slot-<n>` instead, which is git-ignored and inside `apps/web` so the server bundle still resolves `react`.

## Launch

```sh
.claude/skills/verify-rushline/scripts/rv up --path "/?ride=breakwater-run&at=3700&autopilot&prof"
```

`rv up` does five things and prints each:

1. Claims a slot and names the run, for example `20261016-003447-s0`. The last line of its output is `RUN=<id>`; pass that id to every later command.
2. Builds the checkout in development mode (`NODE_ENV=development vite build --mode development`, the same build the user's 1351 server uses, so the DEV-only URL flags work) into the slot's build directory. About 10 seconds.
3. Starts `vite preview --mode development` on 127.0.0.1:1410+n and waits until it serves the page titled Rushline.
4. Opens Helium at `--path` on that server with `--use-angle=metal --enable-gpu --ignore-gpu-blocklist --window-size=1512,860` and background throttling turned off, so a covered window keeps rendering.
5. Starts a console watcher that stays attached to the page and appends every console call, uncaught exception, browser log entry, and navigation to `console.jsonl`. The watcher also holds any CPU or network throttling (see Drive).

Options:

| Flag | Meaning |
| --- | --- |
| `--path "/?..."` | First page to open. Default `/`, the Lowside bar. |
| `--dev` | Run the Vite dev server instead of a build. Hot reload, no rebuild step, slower first load (about 20 s to a race). Use it while iterating; use the default build for the final proof. |
| `--cpu n`, `--network fast4g\|slow4g\|3g` | Start throttled. |
| `--slot n` | Ask for a particular slot; fails if it is taken. |
| `--sound` | Do not mute the browser. Only when you need to hear the engine and the user agreed. |
| `--server http://127.0.0.1:1351/ --user-asked` | Drive an existing server instead of starting one. Only when the user said so. `rv down` never stops a server it did not start. |

If `rv up` fails partway it tears down what it started and releases the slot. A claim whose processes have all died is reclaimed by the next `rv up`.

After a source change on a build instance, run `rv rebuild --run <id>`, then `rv open` the page again. A `--dev` instance reloads itself, but a reload ends the race in progress.

## Doctor

Run this first, and again whenever anything looks off:

```sh
.claude/skills/verify-rushline/scripts/rv doctor --run <id>
```

It only reads. Each line is `ok` or `FAIL`, and the exit code is 1 if any check failed:

- The server port's listener is the PID this run started (or, for `--server`, that something answers), and it serves the Rushline page.
- For a build instance: the build came from the current `HEAD`, and no file under `apps/web/src`, `apps/web/public`, or `packages/` changed after it. If one did, `rv rebuild`.
- The DevTools port's listener is the Helium PID this run started, and the console watcher is alive, with the throttling it holds.
- The page is on this run's server, `document.visibilityState` is `visible` (a hidden page pauses the race and stops frames), and the WebGL renderer is `ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro, ...)`, never SwiftShader.
- The console has no errors or uncaught exceptions. The 404 for `/favicon.ico` is known noise (the app ships no favicon) and does not count.

## Drive

Read `features/README.md`, then the feature file for what you changed. Each recipe lists the user's paths and the exact `rv` commands.

| Command | What it does |
| --- | --- |
| `rv open --run <id> "/?flags" [--until bar\|race\|held\|<js>]` | Navigate the page, wait for load, then optionally until a signal. Prints both times. `bar` is the Lowside's menu, `race` is the race HUD's speed meter, `held` is a `?hold=` freeze. |
| `rv click --run <id> "<label>" [--within "<aria-label>"]` | Click the visible control whose text reads the label (case does not matter; menus render upper case). `--within` scopes to the element with that `aria-label`: a menu (`Clubhouse`, `Back room`, `Route board`, `Pause`, `Finish`, `Results`, `Garage`, `Catalogue`) or a confirm dialog (`Quit race`, `Buy`, `Sell`, `Start over`, `The envelope`). It fails if the control is disabled, hidden under an `inert` overlay, or covered at its centre, and lists what is on screen. |
| `rv press --run <id> ArrowUp KeyJ [--hold ms]` | Hold the keys together for `--hold` ms (default 120), then release. Uses `KeyboardEvent.code` names. |
| `rv wait --run <id> <signal or js> [--timeout s]` | Poll until the expression is truthy. Default timeout 60 s. |
| `rv js --run <id> '<expression>'` | `Runtime.evaluate` with promises awaited; prints the JSON value. |
| `rv shot --run <id> <name>` | PNG screenshot to the evidence folder. |
| `rv aria --run <id> <name>` | The accessibility tree as indented text: roles, names, and states such as `focused`, `disabled`, `pressed`. Prints it and saves `<name>.aria.txt`. |
| `rv screencast --run <id> <name> [--seconds s] [--every n]` | `Page.startScreencast` frames as JPEGs at 1512 px wide, with a `frames.json` of timestamps. It delivered 60 frames a second in the proof run. It shows motion; for frame times use `rv sample`. |
| `rv sample --run <id> <name> [--seconds s]` | Reads `globalThis.__rushlineProfile` before and after the wait and reports frames, fps, frame-interval percentiles, frames over 20 and 33 ms, JS ms per frame, draw calls, pixel ratio, and quality rung. The page must be open with `&prof` (or `?stress`). |
| `rv trace --run <id> <name> [--seconds s]` | A DevTools trace including the GPU process (`gpu`, `disabled-by-default-gpu.service`, `viz`, `devtools.timeline`, `toplevel`). Saves `<name>.trace.json`, which the DevTools Performance panel and Perfetto open, and prints long tasks, GC pauses, and the busiest threads (CrRendererMain, CrGpuMain, VizCompositorThread). Keep it to 10 s or less. |
| `rv throttle --run <id> [--cpu n] [--network off\|fast4g\|slow4g\|3g]` | Restarts the console watcher holding `Emulation.setCPUThrottlingRate` and `Network.emulateNetworkConditions`. Throttling lasts while the watcher is attached, survives navigation, and every sample and trace records it. `--cpu 1 --network off` clears it. |
| `rv console --run <id> [errors]` | Print what the watcher captured. |
| `rv list` | Every claimed slot, its run, and whether its processes are up. |

### Game state you can read

The game exposes no general state object, so read what a player sees, plus the development hooks:

- **Speed:** `document.querySelector("[role=meter][aria-label=Speed]").getAttribute("aria-valuenow")`, in km/h. The meter exists only during a race.
- **Race clock:** with `&prof`, `globalThis.__rushlineProfile.info()` returns `{ frames, tick, renderer, gpuTimer, parts }`, and `window(fromTick, toTick)` returns per-frame samples (interval, CPU ms per part, draw calls, triangles, pixel ratio, rung, three's program, texture, and geometry counts, and `created`, the programs and textures the WebGL context has created so far). The tick is the simulation tick at 60 per second of race time.
- **Freeze frames:** with `?hold=`, `globalThis.__rushlineHeld` turns `true` when the race freezes, and `globalThis.__rushlineRelease()` resumes it.
- **The save:** `JSON.parse(localStorage.getItem("rushline.career"))`. Each slot is its own origin with a fresh profile, so every run starts with no save.
- **Screens:** `rv aria` shows the menu that is up and which item has focus.

### Development URL flags

These work in the development build `rv up` serves and in `pnpm dev`; the production build ignores the ones marked DEV.

| Flag | Effect |
| --- | --- |
| `?ride=<roadId>&level=<n>` (DEV) | Skip the menus and start a quick race at once: seed 31, Ostra Sesta 600, at any level the served rules hold (1 to 3 by default); a higher `level` rides level 1. Roads: `breakwater-run`, `cinder-wash`, `hollow-pine-road`, `slag-row`, `ridge-road`, and `madrid-hook`, the Casa de Campo greybox in `features/madrid-hook.md`. |
| `?bike=<bikeId>&with=alone\|field\|traffic` (DEV) | With `?ride`: the player's bike (ids in `packages/sim/src/bikes.ts`), and who rides along. `alone` drops rivals, police and traffic, `field` drops traffic, `traffic` is the full race and the default. |
| `?at=<metres>` (DEV) | Put the player this far along the road at the start of every race the page starts, including career races. |
| `?autopilot` (DEV) | The AI pilot rides the player's bike, including ramps. The player's rider is built pilot-controlled, so the keys, `?straight` and `?swerve` do nothing. |
| `?hazard=<id>&before=<m>` (DEV) | Put the player on that road hazard's line, `before` metres (default 150) ahead of it. Ids are per road (`hazard-3` on Breakwater Run), listed by the node command in `features/hazards.md`. With `?kmh=<n>` for the starting speed, `?straight` to hold that line at full throttle, and `?clear` to move traffic out of the way. |
| `?swerve=<m>&swervefor=<m>&swerveto=<-1..1>` (DEV) | After `swerve` metres, force the steer to `swerveto` (default 1, right) for `swervefor` metres (default 25). It steers a player you ride, so pair it with `?straight` for a hands-off run; it does nothing under `?autopilot`. |
| `?hold=air\|at\|near\|<event>&holdafter=<n>` (DEV) | Freeze the race: `air` after n ticks airborne, `at` at n metres, `near` when the `?hazard=` hazard is n metres ahead, or n ticks after the player's event of that kind (`land`, `crash`, `remount`, `finish`, `hit`, `hazard`, `nearMiss`, `busted`, ...). Fires once per page load. |
| `?road=<n>` (DEV) | Which road the hidden attract race loads first while the game boots. |
| `?stress`, `?stress=reference` | The fixed benchmark races from `apps/web/src/career/bench.ts`, on the pilot, in any build. |
| `?prof`, `?prof=gpu` | Record per-frame costs into `__rushlineProfile`; `gpu` adds timer queries ANGLE on Metal answers wrongly. `?stress` implies `?prof`. |
| `?fps` | An overlay with fps, frame time, worst frame, pixel ratio, rung, pace, refresh, draw calls, triangles. |
| `?ratio=<n>`, `?hz=<n>` | Pin the pixel ratio or the detected refresh rate. |
| `?rung=<n>` | Pin a rung of the quality ladder: 0 full, 1 shadow 2048, 2 lean bloom, 3 no multisampling, then the pixel ratio in steps of 0.1. The governor stays off. |

Ramps, by kilometre: Breakwater Run 4.05 and 5.42, Cinder Wash 4.25 and 5.30, Hollow Pine Road 3.33 and 7.76, Slag Row 4.72 and 7.28 (and 10.88 on level-4 roads, which only a rules file serving four or more levels rides), Ridge Road 8.29. Every ramp sits right of the centre line. Roads end between 8.45 and 9.25 km at level 1 and 1,150 m later per level.

### Alternative: the T3 Code browser

When the main agent runs inside T3 Code it has a built-in browser with `preview_*` tools: `preview_open`, `preview_navigate`, `preview_click`, `preview_press`, `preview_evaluate` (a CDP-style evaluate), `preview_snapshot`, `preview_wait_for`, and `preview_recording_start` / `preview_recording_stop`. Point it at a slot's URL from `rv up`, never at 1350, 1351, or the user's tunnel. Its limits decide what it is good for:

- A preview tab opened while its thread is not on screen reports `document.visibilityState` as hidden. The game's `requestAnimationFrame` loop does not advance in a hidden tab, so a race sits at the countdown "3" forever and `__rushlineHeld` never turns true. Check visibility with `preview_evaluate` first.
- `preview_evaluate` times out after 15 seconds, so poll long waits in short calls instead of awaiting a promise.
- It has no traces, no CPU or network throttling, and no console watcher, and it renders at a low frame rate (about 9 fps was seen in October 2026).

So use it for load, console, menu, and state checks while the tab is visible, where the user can watch. For anything that needs the race to run (riding, jumps, crashes, a career race to the flag, frame rate), use Helium through `rv`, which is the default. Subagents usually do not have the `preview_*` tools; `rv` works everywhere.

## Evidence

Every run writes to `tools/perf/results/verify/<run>/` under the main checkout, even when you work in a worktree, so the proof outlives both `rv down` and the worktree. The folder is git-ignored. It holds:

- `journal.jsonl`: every `rv` command with its arguments, time, and result. This is the record of the actions.
- `console.jsonl`: console calls, exceptions, browser log entries, navigations, and throttle changes.
- `build.log`, `server.log`, `watch.log`.
- The `shot`, `aria`, `screencast`, `trace`, and `sample` artifacts you named.

Proof standards:

- Drive the player's path: the menus with `rv click`, the bike with `rv press`. The URL flags are for reaching a moment quickly (`?at=`, `?hold=`, `?autopilot`); say when you used them, and do not report a flag-driven path as proof of the menu path it skips.
- Capture the action and the result, not only the last screen: an `aria` snapshot before and after a menu action, a screenshot at the moment that matters, the `journal.jsonl` lines between.
- Check side effects as well as the screen: read the save after a career action, read the speed meter after pressing throttle, read the profile's tick or samples after a performance change.
- Report console errors and exceptions from the run, or say there were none.
- For anything about how it plays or looks, look at the screenshots yourself before you claim it.

## Cleanup

```sh
.claude/skills/verify-rushline/scripts/rv down --run <id>
```

It stops the watcher, Helium, and the server it started (checking each PID first), deletes the browser profile, the slot's build directory, and the claim file, and prints the evidence folder and how many entries it holds. It never deletes evidence. Run it after every attempt, including failed ones, so no process or port is stranded. Then `rv list` should not show your run.

## Proofs outside the browser

Run these after every source change, as AGENTS.md requires:

- `pnpm check`: oxfmt, oxlint with the anti-slop and rushline rules, the rule tests and ledger, `check:roots`, `check:dead` (knip), `tsrs` for the root and every workspace, then Vitest. The tests in `packages/sim` pin the feel (acceleration, braking distance, bend push, which bend cannot be taken flat out, when the crest launches). When a tuning change breaks one, decide whether the feel or the test is wrong and say which in the commit.
- `pnpm build`: the production build of every package.
- `pnpm perf`: the perf gate's Node and build lanes, side A (a `/tmp` clone at the baseline revision in `tools/perf/budgets.json`) against this checkout. It fails on throughput, tick p95 or p99, allocations per tick, bundle or Worker bytes, or a GLB over budget, or on a window whose workload changed. `pnpm verify` runs it after the build, and so does CI's `perf` job. `pnpm check:perf` only checks the budgets file and baseline, in about a second.

### The perf gate on the GPU

`pnpm perf:gpu` is the only check of frame pacing and render counts (draw calls, triangles, shader programs and textures), and the only check of warm-up: it fails `first-use` when the WebGL context creates a shader program or a texture on a frame after the first of one of B's two Slag Row races, and names the frame and tick. It sees only what those races draw, so a resource that only another road or an effect they do not trigger draws still passes, as does one first drawn on the start grid or a geometry. CI has no GPU and no count lane, so run it yourself after a change to the renderer, the scene, the assets, or anything in the frame loop, and before you call the change done. It drives two `rv` runs, side A from a `/tmp` clone at the baseline revision and side B from this checkout, and judges five alternating pairs per scenario against `tools/perf/budgets.json`. `tools/perf/README.md`, "Real-GPU frame lane", has the commands. Before it starts:

1. Check `ps` for other agents' heavy `node`, `vitest`, `vite` or `pnpm` processes and wait for a quiet machine.
2. Start both runs with `rv up --slot <n> --path /kit`, run `rv doctor` on both, and leave both windows alone: a resized window changes the page size, and the lane refuses the campaign.
3. Do not change display settings. The lane sets the game's own frame rate to 60, which a 120 Hz display draws on every second vsync.
4. Afterwards `rv down` both runs and delete the `/tmp` clone.

### Frame cost with measure.ts

`tools/perf/measure.ts` measures uncapped frame cost on the `pack-riding-v1` window of the `?stress` race, which is useful while you work on a change but is not a gate. Read `tools/perf/README.md`. It launches headless Chrome by default, which is allowed for this bench because it measures uncapped frame cost, not how the game looks; pass `--browser helium` to run the same bench in a windowed Helium. To compare a change:

1. Build and serve each side from its own checkout on its own port: an `rv up` slot works (`rv up --path "/?stress&ratio=2"` in the baseline checkout and again in the changed one), or follow the README's `vite build --sourcemap` and `vite preview --port <free port>`.
2. Pin the pixel ratio with `?ratio=2`, so the governor's pacing does not hide headroom.
3. Interleave: run `node tools/perf/measure.ts --url "http://127.0.0.1:<port>/?stress&ratio=2" --label <side> --runs 1 --port <free DevTools port>` alternately for A and B, five or more times each, rather than all of A then all of B. The machine is often loaded by other agents, and interleaving spreads that load over both sides. Compare the means and the spread, and quote the load the tool prints.
4. Use a DevTools port no one else holds (`--port`); its default 9333 is often taken.
5. `--out` is relative to the current directory, and a worktree's `tools/perf/results` disappears with the worktree. Pass the run's evidence folder (the absolute path `rv up` printed) to keep the JSON.

`rv sample` and `rv throttle` are for questions measure.ts does not answer: how a moment feels under throttling, what the governor does over time, or frame pacing in a real window at the display's refresh.

### Approximating a MacBook Air

The development machine is an M4 Pro. DevTools can slow the main thread but not the GPU:

- `rv throttle --run <id> --cpu 2` roughly matches a base M1 or M2 Air's main thread; `--cpu 4` is the pessimistic case. At `--cpu 4` the stress race showed about twice the JS per frame and the governor stepping down quality rungs.
- GPU fill cost is not emulated. Compare `?ratio=1` with `?ratio=2` to see how much of a frame is fill, and treat a pass that is GPU-bound on the M4 Pro as at risk on an Air.
- `--network fast4g` or `slow4g` shows the first-load cost of the models and textures. A race HUD took about 20 s on `fast4g` against the dev server.

## Sandbox notes for worktree agents

The Claude Code worktree guard rejects some command shapes before they run. Keep `rv` calls literal: no shell variables, no `for` loops, no `$(...)`, no `cd` partway through a chain, and chain with `&&`. That is why the evaluate command is called `rv js` and not `eval`.

## Keeping this skill honest

When the app changes, update the feature files with `/maintain-verification-skill`. A recipe that no longer runs is worse than none.
