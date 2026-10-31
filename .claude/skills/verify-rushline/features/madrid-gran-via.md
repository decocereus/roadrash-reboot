# Puerta de Alcalá into Gran Vía

A greybox of 2,438 m of central Madrid, a 90 m run-up and 2,348 m of fitted street: Alcalá from Puerta de Alcalá through Plaza de Cibeles, past Metrópolis onto Gran Vía, down past Telefónica and Carrión, into Plaza de España. The player rides a two-lane-each-way street walled by grey blocks at the corridor's estimated heights, over paved ground, with grass only at the Retiro edge and the Plaza de España garden. It answers one question, whether a city street of this length reads as a city and rides well at speed, and it is reached only by a development URL. No menu, career race or bar screen leads to it.

## Sub-features

- `alone`: the player only, no rivals, no police, no traffic.
- `field`: the practice field at the chosen level, no traffic.
- `traffic`: the field and the stretch's traffic.
- `alcala`: the run-up and the Puerta de Alcalá roundabout, 0 to 210 m, the bend built to a 25 m radius, taken from the grid.
- `espana`: Plaza de España, 2,120 to 2,220 m, a junction built to a 25 m radius that the rider slows for.
- `scenery`: paved world-space ground, 76 footprint blocks, six landmark massings, two grass patches with trees, street lamps.

## How to get to it (user POV)

Development build only: open `/?ride=madrid-gran-via`. Add `&bike=<bike id>` to choose the bike (default `ostra-sesta-600`, also `halden-wren-400` and the other ids in `packages/sim/src/bikes.ts`) and `&with=alone`, `&with=field` or `&with=traffic` (the default). `&level=<n>` sets the field's level. The production build ignores all of them.

## Driving it with rv

Preconditions: a slot from `rv up` on this checkout and a passing `rv doctor`.

- Ride alone on the Sesta: `rv open --run <run> "/?ride=madrid-gran-via&bike=ostra-sesta-600&with=alone&autopilot&prof&fps" --until race`, then `rv shot --run <run> alcala`. The HUD reads 1ST of 1 and the overlay holds the display's own pace, 120 fps on a 120 Hz Mac, at rung 0 of 8. Shoot the countdown as well, `rv shot --run <run> grid`, and check that Puerta de Alcalá reads as a gate rather than a wall. The rider sits 103 m short of it on the run-up and 24° off its axis, so the gate stands left of centre with the road running past its right side, its upper half clear above the nearer Retiro wall: four piers, three openings with the sunset showing through them, one entablature across all four and a raised attic over the middle. A single slab with no opening, or one pier filling the edge of the frame, means the run-up or the start pose has moved.
- Freeze at each landmark: `rv open --run <run> "/?ride=madrid-gran-via&bike=ostra-sesta-600&with=alone&autopilot&hold=at&holdafter=<metres>" --until held`, then `rv shot --run <run> <name>`. Distances count from the grid, so they all moved 90 m with the run-up. Useful ones, with the speed the pilot Sesta passes them at, give or take a km/h between runs: 150 Puerta de Alcalá 93 km/h, 380 the Cibeles fountain 188, 760 Metrópolis 132, 1280 Telefónica 211, 1670 Carrión 132, 2180 Plaza de España 88. A loaded machine is the one thing that breaks this recipe: the race runs on the browser's frames, so when something else is eating the CPU `--until held` times out, the race keeps going and the shot catches the rider somewhere else. Check the held speed against the list before you read the frame. The freeze catches the rider at that distance, not at the slowest point of the bend after it, which is why these run above the slowest corner speeds in `docs/madrid-corridor.md`. Read the speed with `rv js --run <run> 'document.querySelector("[role=meter][aria-label=Speed]").getAttribute("aria-valuenow")'`.
- What each freeze should show: blocks wall both sides at every one of the six, chevrons stand before the first bend as well as the Cibeles one, the fountain stands as an island, a low twelve-sided basin with a column on it and open paving all round, built against nothing, Metrópolis carries a crown that steps in and tapers against the sky instead of a flat-topped prism, the Telefónica massing closes the street from Metrópolis, trees stand only on the Plaza de España garden, and no mountain shows anywhere. The backdrop ring is drawn behind a road whose ground is grass and behind no road whose ground is paved.
- Ride with the field or with traffic: swap `with=alone` for `with=field` or `with=traffic`. The grid fills with rivals; traffic adds cars in both lanes.
- Measure a lap: `rv open --run <run> "/?ride=madrid-gran-via&bike=ostra-sesta-600&with=alone&autopilot&prof" --until race`, `rv sample --run <run> gran-via-lap --seconds 30`, then `rv wait --run <run> 'document.querySelector("[aria-label=Finish]") !== null' --timeout 120`. The finish menu shows no time. The headless pilot on the same seed finishes alone on the Sesta in 60.2 s and on the Wren in 63.6 s, the run-up costing 3.2 s of each.
- Measure the scene alone: `rv open --run <run> "/?ride=madrid-gran-via&with=alone&autopilot&prof&fps&at=1190" --until race` then `rv sample --run <run> gran-via-dense --seconds 20` puts the rider in the deepest part of the canyon, 1,100 m of street past the run-up. `at` moves the player alone, so the rivals stay on the grid and this measures the city, not the field.
- Measure the busiest frame: ride the whole lap from the grid, `rv open --run <run> "/?ride=madrid-gran-via&with=traffic&autopilot&prof&fps" --until race` then `rv sample --run <run> gran-via-lap-traffic --seconds 40`, which keeps the pack and the cars around the rider all the way. The overlay and a one-frame read both give a moment, not the peak; sweep the profile for that:

  ```
  rv js --run <run> '(() => { const p = globalThis.__rushlineProfile; const f = p.window(600, p.info().tick); const sum = (a) => a.reduce((t, v) => t + (v ?? 0), 0); let best = { calls: 0 }, tri = 0, total = 0; for (const frame of f) { const c = sum(frame.calls); total += c; if (c > best.calls) best = { calls: c, tick: frame.tick, triangles: sum(frame.triangles) }; tri = Math.max(tri, sum(frame.triangles)); } return JSON.stringify({ frames: f.length, meanCalls: Math.round(total / f.length), peak: best, peakTriangles: tri }); })()'
  ```

  Start the window at 600, not 1: the frames right after the page loads draw 2,072 calls and 5.6 million triangles and would drown the race. On 2026-10-30 it returned 5,622 frames, 191 calls mean, a peak of 218 calls at tick 720 with 1,962,021 triangles, and 1,991,423 triangles at their own peak. `docs/madrid-corridor.md#puerta-de-alcalá-into-gran-vía` holds the rest of the table and why the stretch takes no `budgets.json` row.

- Check the scenery's cost without a browser: `pnpm test apps/web/test/madrid-scenery.test.ts` builds each stretch's greybox and fails if its draw calls, triangles or block count pass the budget it holds. This is where the city's per-frame cost is budgeted, because the GPU lane's baseline predates both stretches.
- Measure camera steadiness without a browser: `pnpm test apps/web/test/madrid-camera.test.ts` rides the pilot on every road and both Madrid stretches and fails if a stretch's straights shake more than the shakiest existing road's.
- Read the fitted numbers without a browser: `pnpm madrid:stretch --id madrid-gran-via` regenerates the plan, its scenery and its three block modules and prints the distance from the street, the sign flips per kilometre, the grade fit, the blocks kept and dropped, and each landmark's massing. A clean `git diff` after it proves the plan matches its inputs, and `pnpm madrid:stretch --check` proves the same thing without writing anything: it rebuilds both stretches in memory and names the first field that differs from the committed modules. `pnpm check` runs it.

## Gotchas

- The stretch borrows Slag Row's road id for the field draw, the police officer and the result, as the hook does, so the ride-out card and the results screen say Slag Row. The track, length and lap time are the stretch's.
- Police posts start 1,500 m from the grid, which is 1,410 m of street, so a cop can ride the last 940 m when police are in the race. `with=alone` drops them.
- The grid sits 90 m east of the Puerta de Alcalá roundabout, on a straight level run-up that exists so the gate reads from the start line. The first bend is a 25 m radius between 90 and 210 m. A rider who holds full throttle off the grid runs wide there; the pilot does not.
- Buildings are the corridor's machine-estimated heights, most of them 13 to 23 m, so Gran Vía's walls are the right height but not the right buildings. Landmark massing is authored prisms, not the real shapes.
- Trees stand only on the two grass patches. Paving has none, which is what the real street looks like from a bike.
- `?hold=at` freezes on the first tick past the distance, so speeds read a few km/h either side of the slowest point.
