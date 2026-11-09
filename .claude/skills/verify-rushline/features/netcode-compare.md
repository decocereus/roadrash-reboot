# Netcode compare

A player meets a netcode change as the other rider's bike: where it is drawn, whether it snaps sideways, whether a strike they press lands and how soon it shows on the other screen. This recipe judges a change that way. It runs `pnpm rooms:fights` on the base build and on the head build, each in its own worktree, alternating, and `pnpm rooms:compare` pools each build's runs per link and holds the head to one rule table, `RULES` in `tools/rooms/src/fight-compare.ts`. Use it for any change to how a client predicts, settles or draws a remote rider, such as `packages/sim/src/room*.ts`, `apps/rooms/src/seat-client.ts` or `apps/web/src/game/rider-fight.ts`, so a pull request's own tests are not the only evidence.

## Sub-features

- `nc-run`: `pnpm rooms:fights` runs once per build per turn, from that build's worktree against that build's Worker, alternating base and head, at least twice each.
- `nc-compare`: `pnpm rooms:compare --base <dir>[,<dir>...] --head <dir>[,<dir>...] [--out <file.md>]` reads every `<link>.json` in each folder, prints one table per link with each build's judged value, median, worst and sample count, then a verdict list, and exits 1 when any check fails.
- `nc-strikes`: `strikes-failed`, a limit of 0 on the worst run. A strike fails when the tool's row reads `FAIL`, or reads `room ran no strike`, where the attacker pressed and the room ran no strike in up to three tries. The ceiling is the tool's own pass rule.
- `nc-presses`: `presses-dropped`, no worse than base with no share or slack, on the mean per run of the summed `lostPresses`. Base dropped none on any link in the PR #198 runs, so any press the head drops is new. The mean per run keeps builds with different run counts fair.
- `nc-drawn`: `rival-drawn-off`, no worse than base plus 25% and 0.10 m, on the worst drawn `errorP95Metres` over both windows' tracks and every run. The bound comes from main against itself in two runs on the Mac, which read 0.21 and 0.28 m on home and 1.05 and 1.14 m on mobile. The better run plus 25% and 0.10 m covers the other (0.36 m against 0.28, 1.41 m against 1.14). PR #198's 0.49 to 0.67 m on home and 1.92 to 2.13 m on mobile break it.
- `nc-snap`: `rival-snap`, a limit of a bike's width, `2 * BIKE_HALF_WIDTH` = 0.76 m, on the worst `worstStepMetres`. It samples the other rider's drawn sideways place, `x`, between two frames in a row where the guessed race and the room both have that rider riding. A jump wider than the bike puts it where none of it was a frame before. Ordinary motion stays far under it. The fastest sideways limit of any bike at its top gear is 7.34 m/s (Halden Wren 400, from `lateralSpeedLimit` and `packages/content/src/bikes.ts`), and a kick's shove adds 3.2 m/s, which is 0.18 m in a 60 Hz frame and 0.35 m in a frame twice as long. Measured: 0.07 m on a local link, 0.18 to 0.22 m on PR #198's mobile and bursts runs, and 3.30 to 7.82 m for main's snaps on those links.
- `nc-hit`: `attacker-off-at-hit`, a limit of half the bare hand's sideways reach, `weapons.none.reachX / 2` = 1.10 m, on the worst `drawnErrorAtHitMetres`. The room lands a strike only inside that reach, so an attacker drawn further off than half of it can land a hit from a bike the victim sees out of reach. In the PR #198 runs main broke it on mobile (1.30 m) and bursts (2.64 m), so those links read `known gap` until a change fixes them.
- `nc-timing`: `press-to-strike-out`, no worse than base plus 15% and one tick (16.7 ms at the sim's 60 Hz), on the median `pressToStrikeOutMs`. A strike starts and plays on the room's ticks, so a median that moved by less than one tick is frame sampling, not a later strike. The 15% share is the starting value and has no measured base-against-base spread yet.
- `nc-known-gap`: a limit the base breaks too reads `known gap` and does not fail. A limit only the head breaks fails.
- `nc-no-sample`: a measure the base sampled and the head did not, such as no strike drawn out at all, fails. A measure neither build sampled reads `not judged`.
- `nc-one-sided`: a link only one build ran reads `Only <build> ran this link` and fails as `link-on-both`.

## How to get to it (user POV)

- A player never runs it. A reviewer of a netcode pull request runs it before approving, and the author runs it before asking for review.
- It runs on the Mac (Astra), never on vimaan, because multiplayer seats and fight checks run on the Mac as two windows (`docs/gpu-work.md`, line 7).

## Driving it with rv

Preconditions:

- The Mac, with `rv list` showing slots 3 and 4 free, or two other free slots for `--slots`. Another agent's `rv` slots or Workers may be running, so pick slots and ports nobody holds and kill only processes you started.
- No other `rooms:fights` run on the machine. The tool's two lag links listen on 1443 and 1444, so `lsof -nP -iTCP:1443 -iTCP:1444 -sTCP:LISTEN` prints nothing.
- The base commit `<base>` (the pull request's merge base, usually the tip of `main` it branched from) and the head commit `<head>`.
- An evidence folder under the main checkout's `tools/perf/results/verify/`, such as `tools/perf/results/verify/compare-pr-<number>/`, which outlives both worktrees. `<evidence>` below is its absolute path, because each command runs from a different worktree. Never delete anything under `tools/perf/results/verify`.

- **Same measuring tool.** Run `git diff --stat <base> <head> -- tools/rooms/fights.ts tools/rooms/lag.ts tools/rooms/src/lag.ts 'tools/rooms/src/fight*.ts' ':!tools/rooms/src/fight-compare.ts'`. It prints nothing when both builds measure with the same tool. If it lists files, run the base build's tool against both builds. In the head worktree, `git checkout <base> -- <each listed file>`, and say so in the report. If the head changed what the probe reads, the two builds cannot be measured by one tool, and the comparison does not apply.
- **Two worktrees.** `git worktree add --detach <worktrees>/compare-<number>-base <base>` and the same with `-head` and `<head>`, where `<worktrees>` is a folder outside the shared checkout. Run `pnpm install --frozen-lockfile --prefer-offline` in each.
- **One build's Worker.** In the base worktree, start `RUSHLINE_WEB_PORT=1420 RUSHLINE_ROOMS_PORT=1421 pnpm exec alchemy dev --stage verify` as a background command and note its PID. In the head worktree use 1422 and 1423. Use free ports from 1420 up, never 1350 or 1351. The Worker is up when `curl -s http://127.0.0.1:1421/rooms/x` answers with the room's JSON.
- **One run.** From that build's worktree, `pnpm rooms:fights --rooms-port 1421 --out <evidence>/base-1 --links home,mobile,bursts --slots 3,4`. The folder then holds `home.json`, `mobile.json`, `bursts.json` and `table.md`. Stop that build's Worker before you start the other's, so only one build runs at a time.
- **Alternate.** Run base-1, head-1, base-2, head-2, each against its own build's Worker and from its own worktree, so a change in the Mac's load reaches both builds alike. Two runs each is the least that counts.
- **Compare.** From a checkout that has `rooms:compare`, the head worktree or the shared checkout on current `main`, run `pnpm rooms:compare --base <evidence>/base-1,<evidence>/base-2 --head <evidence>/head-1,<evidence>/head-2 --out <evidence>/compare.md`. A pass exits 0 and its last verdict line reads `Head passes all <n> checks.` A regression exits 1, and each `- FAIL <link> <rule>.` line names the measure, the head's value, the bound and what the player loses. Read every table too, because a pass can hide a large `known gap` move.
- **A close call.** A run fights four strikes per link, eight over two runs, which is a small sample. Treat one dropped press, or a p95 change under 25%, as a reason to run base-3 and head-3 and compare all the runs, not as a verdict.
- **Cleanup.** Stop the Workers you started by the PIDs you noted. `rooms:fights` closes its own `rv` windows. After an interrupted run, `rv down --run <run>` for each run it opened, then `rv list` shows none of yours. Remove both worktrees with `git worktree remove --force <dir>`, because each holds `node_modules` and `.alchemy`, then `git worktree prune`. Keep the four or more fights folders and `compare.md` in the evidence folder, and name it in the report.

## Gotchas

- On a fresh worktree the first run can fail with Vite's `504 (Outdated Optimize Dep)`, because the dev server optimised its dependencies while a page loaded. Run that build again before you count it.
- A Worker or `rv` slot left from another agent can answer on the port you meant to use. Check `curl` reaches your Worker after you start it, and never stop a process by name, such as `pkill workerd`.
- `rooms:compare` exits 1 for a link only one build ran. Pass the same `--links` to every run.
- A `known gap` passes the head, but it is still a defect a player meets. Name each one in the report.
