# Rushline verification map

This directory is the maintained source for verifying what a player of Rushline sees and does. Read this index before driving the game, then use the matching feature file as the recipe. All commands run from the root of the checkout under test; `rv` below means `.claude/skills/verify-rushline/scripts/rv`, and `<run>` is the id `rv up` printed.

## Baseline preconditions

- A slot from `rv up` (ports 1410-1419, DevTools 9410-9419), serving a development-mode build of this checkout. Never 1350, 1351, or the user's tunnel.
- `rv doctor --run <run>` passes: our server and Helium PIDs on our ports, a current build, a visible page, the Metal renderer, no console errors.
- A fresh browser profile: no career save, sound muted, focus left with the user.
- Desktop viewport from the 1512 x 860 window at device pixel ratio 2.

## Driving conventions

- Start each recipe from `rv open --run <run> "<path>"` so it does not depend on the previous one. A page load resets the game; the save survives it.
- Reach controls by their visible label and their menu's `aria-label` with `rv click "<label>" --within "<menu>"`. Do not click coordinates.
- Drive the bike with `rv press` and `KeyboardEvent.code` names: `ArrowUp`/`KeyW` throttle, `ArrowDown`/`KeyS` brake, `ArrowLeft`/`ArrowRight` or `KeyA`/`KeyD` steer, `Space`/`KeyJ` punch, `ShiftLeft`/`KeyK` kick, `Escape` pause, `KeyR` restart a single race, `KeyM` mute.
- Use URL flags (`?ride`, `?at`, `?autopilot`, `?hold`, `?swerve`) to reach a moment fast, and say so in the report. They skip the menus, so they never prove a menu path.
- Keep every `rv` call literal: no shell variables or loops (the worktree guard rejects them).

## Proof and skip reporting

- Capture the action and the result: an `rv aria` or `rv shot` before and after, with `journal.jsonl` holding the commands in between.
- Read the state behind the screen too: the speed meter's `aria-valuenow`, `__rushlineProfile.info().tick`, `__rushlineHeld`, or the save in `localStorage["rushline.career"]`.
- Look at every screenshot you cite; a captured PNG is not proof until someone has looked at it.
- Report console errors from `rv console --run <run> errors`, or say there were none.
- Name the feature file and sub-feature id with each artifact, and the URL flags used.
- If a path cannot be reached, report the command you ran and the precondition that failed. Do not report a skipped entry point as verified through another.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing what the player sees. It then has exactly four H2 sections in this order:

1. `Sub-features`: short ids, one line each.
2. `How to get to it (user POV)`: every way a player reaches it.
3. `Driving it with rv`: starts with `Preconditions:`, then labelled bullets that pair a player action with the exact `rv` command and the observable result.
4. `Gotchas`: traps that waste or invalidate a run.

Keep implementation detail out of the map: name player paths, stable handles, required state, commands, and observable proof.

## Features

- [Data credits](./credits.md): Settings link, source notices and the full building data licence.
- [Casa de Campo hook](./madrid-hook.md): the development-only Madrid park greybox, ridden alone, with the field or with traffic, and its two forced places.
- [Puerta de Alcalá into Gran Vía](./madrid-gran-via.md): the development-only Madrid city greybox, 2,348 m from the gate to Plaza de España, its two slow places and its five landmarks.

- [Back room and single race](./single-race.md): the back room, route board, ride-out card, starting, pausing, restarting, and quitting a single race.
- [Riding and fighting](./riding-and-fighting.md): throttle, brake, steering, punches and kicks, crashing, getting back on, the cop warning, and the finish.
- [Jumps](./jumps.md): ramps, time in the air, landings, and landing dust.
- [Roadside clearance](./roadside-clearance.md): signs, trees, posts and ramp beacons that give way to the chase camera on the shoulder, and signs that never show what stands behind them.
- [Road hazards](./hazards.md): where oil, rocks, and potholes lie, how each draws, what contact costs by speed, what missing one costs, and the frame rate with them on screen.
- [Career](./career.md): a new career, the clubhouse, a career race settled into money and qualification, the garage, and the save across reloads.
- [Race rules](./race-rules.md): the served field size and level count, a ten-racer grid, a three-level career, and the save a level above them refused.
- [Game art](./art.md): the `/art/<key>` route, the bar's and the race's art loaded from it, the local cache refilled from the deployed game, and the deployed game reading R2.
- [Frame rate and load](./frame-rate.md): the stress race, frame sampling, throttled play, traces, first load on a slow network, the perf gate on the GPU, and the measure.ts A/B.
