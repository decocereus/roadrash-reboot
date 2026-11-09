# Netcode compare

A player meets a netcode change as the other rider's bike: where it is drawn, whether it snaps sideways, whether a strike they press lands and how soon it shows on the other screen. This recipe judges a change that way. It runs `pnpm rooms:fights` on the base build and on the head build, each in its own worktree, alternating, and `pnpm rooms:compare` judges every run on its own against one rule table, `RULES` in `tools/rooms/src/fight-compare.ts`. Use it for any change to how a client predicts, settles or draws a remote rider, such as `packages/sim/src/room*.ts`, `apps/rooms/src/seat-client.ts` or `apps/web/src/game/rider-fight.ts`, so a pull request's own tests are not the only evidence.

A rule fails only when every head run breaks its bound. Runs of one build differ widely on lossy links, as the spreads below show, so the gate is built to avoid failing on that noise, at the cost of passing a regression that shows in only some runs. Such a rule reads `mixed`, and the report shows every run's value, so a reviewer sees it.

## Sub-features

- `nc-run`: `pnpm rooms:fights` runs once per build per turn, from that build's worktree against that build's Worker, alternating base and head, three times each.
- `nc-compare`: `pnpm rooms:compare --base <dir>[,<dir>...] --head <dir>[,<dir>...] [--out <file.md>]` reads every `<link>.json` in each folder and prints one table per link, with each run's value for each rule in its own column (`Base 1`, `Head 1` and so on, in the order of the folders), the bound and the verdict. Then it prints a verdict list and exits 1 when any check fails.
- `nc-per-run`: each rule turns a run into one value. A limit fails when every head run is over it and no base run is. A no-worse rule's bound is the base's worst run plus the rule's margin, and it fails when every head run is over that bound.
- `nc-mixed`: a rule that some head runs break and others keep reads `mixed`. It does not fail, and the summary line ends `, with <n> mixed`. Its verdict line names how many head runs broke the bound.
- `nc-strikes`: `strikes-failed`, a limit of 0 failed strikes in a run. A strike fails when the tool's row reads `FAIL`, or reads `room ran no strike`, where the attacker pressed and the room ran no strike in up to three tries. The ceiling is the tool's own pass rule. Measured on 2026-11-09: no strike failed in 18 runs of main's netcode over home, mobile and bursts.
- `nc-presses`: `presses-dropped`, no worse than the base's worst run, with no share or slack, on the summed `lostPresses` of a run. Measured on 2026-11-09: main's netcode dropped 3 to 5 presses, all in one strike, in 4 of 12 runs on mobile and bursts, and none in 6 runs on home.
- `nc-drawn`: `rival-drawn-off`, no worse than the base's worst run plus 25% and 0.10 m, on the worse drawn `errorP95Metres` of the two windows' tracks in a run. Measured on 2026-11-09 over six runs of main's netcode: 0.24 to 0.28 m on home, 1.08 to 1.21 m on mobile and 1.51 to 3.92 m on bursts. PR #198 read 0.54 to 0.67 m on home and 1.94 to 2.13 m on mobile, over the bound in every run.
- `nc-snap`: `rival-snap`, a limit of a bike's width, `2 * BIKE_HALF_WIDTH` = 0.76 m, on the worst `worstStepMetres` in a run. It samples the other rider's drawn sideways place, `x`, between two frames in a row where the guessed race and the room both have that rider riding. A jump wider than the bike puts it where none of it was a frame before. Ordinary motion stays far under it. The fastest sideways limit of any bike at its top gear is 7.34 m/s (Halden Wren 400, from `lateralSpeedLimit` and `packages/content/src/bikes.ts`), and a kick's shove adds 3.2 m/s, which is 0.18 m in a 60 Hz frame and 0.35 m in a frame twice as long. Measured on 2026-11-09: main's netcode moved at most 0.11 to 0.20 m on home, snapped 3.30 to 4.11 m in 5 of 6 runs on mobile and 3.86 to 12.39 m in all 6 runs on bursts. PR #198 read 0.12 to 0.23 m on every link.
- `nc-hit`: `attacker-off-at-hit`, a limit of half the bare hand's sideways reach, `weapons.none.reachX / 2` = 1.10 m, on the worst `drawnErrorAtHitMetres` in a run. The room lands a strike only inside that reach, so an attacker drawn further off than half of it can land a hit from a bike the victim sees out of reach. Measured on 2026-11-09 over six runs of main's netcode: 0.08 to 0.51 m on home, 0.13 to 1.30 m on mobile, over the limit in 1 run, and 0.40 to 4.49 m on bursts, over it in 4 runs. PR #198 read 2.69 and 2.82 m on mobile.
- `nc-timing`: `press-to-strike-out`, no worse than the base's worst run plus 15% and one tick (16.7 ms at the sim's 60 Hz), on the median `pressToStrikeOutMs` of a run. A strike starts and plays on the room's ticks, so a median that moved by less than one tick is frame sampling, not a later strike. Measured on 2026-11-09 over six runs of main's netcode: 209 to 227 ms on home, 387 to 539 ms on mobile and 337 to 752 ms on bursts.
- `nc-known-gap`: a limit that any base run breaks reads `known gap` when the head breaks it too, and does not fail.
- `nc-no-sample`: a measure the base sampled and the head did not, such as no strike drawn out at all, fails. A measure neither build sampled reads `not judged`.
- `nc-one-sided`: a link only one build ran reads `Only <build> ran this link` and fails as `link-on-both`.

## How to get to it (user POV)

- A player never runs it. A reviewer of a netcode pull request runs it before approving, and the author runs it before asking for review.
- It runs on the Mac (Astra), never on vimaan, because multiplayer seats and fight checks run on the Mac as two windows (`docs/gpu-work.md`, line 7).

## Driving it with rv

`rv` below is `.claude/skills/verify-rushline/scripts/rv`, run from a worktree, as in `SKILL.md`.

Preconditions:

- The Mac, with `rv list` showing slots 3 and 4 free, or two other free slots for `--slots`. Another agent's `rv` slots or Workers may be running, so pick slots and ports nobody holds and kill only processes you started.
- No other `rooms:fights` run on the machine. The tool's two lag links listen on 1443 and 1444, so `lsof -nP -iTCP:1443 -iTCP:1444 -sTCP:LISTEN` prints nothing.
- The base commit `<base>` (the pull request's merge base, usually the tip of `main` it branched from) and the head commit `<head>`.
- An evidence folder under the main checkout's `tools/perf/results/verify/`, such as `tools/perf/results/verify/compare-pr-<number>/`, which outlives both worktrees. `<evidence>` below is its absolute path, because each command runs from a different worktree. Never delete anything under `tools/perf/results/verify`.

- **Same measuring tool.** Run `git diff --stat <base> <head> -- tools/rooms/fights.ts tools/rooms/lag.ts tools/rooms/src/lag.ts 'tools/rooms/src/fight*.ts' ':!tools/rooms/src/fight-compare.ts'`. It prints nothing when both builds measure with the same tool. If it lists files, run the base build's tool against both builds. In the head worktree, `git checkout <base> -- <each listed file>`, and say so in the report. If the head changed what the probe reads, the two builds cannot be measured by one tool, and the comparison does not apply.
- **Two worktrees.** `git worktree add --detach <worktrees>/compare-<number>-base <base>` and the same with `-head` and `<head>`, where `<worktrees>` is a folder outside the shared checkout. Run `pnpm install --frozen-lockfile --prefer-offline` in each.
- **One build's Worker.** In the base worktree, start `RUSHLINE_WEB_PORT=1420 RUSHLINE_ROOMS_PORT=1421 pnpm exec alchemy dev --stage verify` as a background command and note its PID. In the head worktree use 1422 and 1423. Use free ports from 1420 up, never 1350 or 1351. The Worker is up when `curl -s http://127.0.0.1:1421/rooms/probe-1` answers with the room's JSON.
- **Stop a Worker.** The PID you noted is pnpm's, and under it run the alchemy CLI, node and workerd. Find them with `pgrep -P` on that PID and again on each PID it prints, kill them deepest first and then the noted PID, and check that `lsof -nP -iTCP:1420-1423 -sTCP:LISTEN` prints nothing.
- **One run.** From that build's worktree, `pnpm rooms:fights --rooms-port 1421 --out <evidence>/base-1 --links home,mobile --slots 3,4`. The folder then holds `home.json`, `mobile.json` and `table.md`. Stop that build's Worker before you start the other's, so only one build runs at a time.
- **Bursts.** Add `bursts` to `--links` of every run only for a change about loss bursts. Its runs spread so widely that most of its rules read `mixed`.
- **Alternate.** Run base-1, head-1, base-2, head-2, base-3, head-3, each against its own build's Worker and from its own worktree, so a change in the Mac's load reaches both builds alike. Run three each. With two, main's netcode against itself still failed in some pairings of the 2026-11-09 runs. With three, none of the 20 ways to split six of those runs into two builds failed.
- **Compare.** In the head worktree, put back every file the measuring-tool step swapped with `git checkout <head> -- <each listed file>`, because the head's comparer imports them. Then run `pnpm rooms:compare --base <evidence>/base-1,<evidence>/base-2,<evidence>/base-3 --head <evidence>/head-1,<evidence>/head-2,<evidence>/head-3 --out <evidence>/compare.md`. A pass exits 0 and its last verdict line reads `Head passes all <n> checks.`, or ends `, with <m> mixed.` A regression exits 1, and each `- FAIL <link> <rule>.` line names how many head runs broke which bound, what the player loses and the measured spread. Read every table and every `mixed` line too, because a pass can hide a regression that shows in only some runs, and a large `known gap` move.
- **Cleanup.** Stop each Worker you started as above. `rooms:fights` closes its own `rv` windows. After an interrupted run, `rv down --run <run>` for each run it opened, then `rv list` shows none of yours. Remove both worktrees with `git worktree remove --force <dir>`, because each holds `node_modules` and `.alchemy`, then `git worktree prune`. Keep the six fights folders and `compare.md` in the evidence folder, and name it in the report.

## Gotchas

- On a fresh worktree the first run can fail with Vite's `504 (Outdated Optimize Dep)`, because the dev server optimised its dependencies while a page loaded. Run that build again before you count it.
- A Worker or `rv` slot left from another agent can answer on the port you meant to use. Check `curl` reaches your Worker after you start it, and never stop a process by name, such as `pkill workerd`.
- `rooms:compare` exits 1 for a link only one build ran. Pass the same `--links` to every run.
- A `known gap` or a `mixed` passes the head, but each may be a defect a player meets. Name each one in the report, and for a `mixed`, say whether more runs of both builds settled it.
