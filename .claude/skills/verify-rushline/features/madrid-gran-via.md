# Puerta de Alcalá into Gran Vía

A greybox of 2,348 m of central Madrid: Alcalá from Puerta de Alcalá through Plaza de Cibeles, past Metrópolis onto Gran Vía, down past Telefónica and Carrión, into Plaza de España. The player rides a two-lane-each-way street walled by grey blocks at the corridor's estimated heights, over paved ground, with grass only at the Retiro edge and the Plaza de España garden. It answers one question, whether a city street of this length reads as a city and rides well at speed, and it is reached only by a development URL. No menu, career race or bar screen leads to it.

## Sub-features

- `alone`: the player only, no rivals, no police, no traffic.
- `field`: the practice field at the chosen level, no traffic.
- `traffic`: the field and the stretch's traffic.
- `alcala`: the Puerta de Alcalá roundabout, 0 to 120 m, built to a 25 m radius, taken from the grid.
- `espana`: Plaza de España, 2,030 to 2,130 m, a junction built to a 25 m radius that the rider slows for.
- `scenery`: paved world-space ground, 77 footprint blocks, five landmark massings, two grass patches with trees, street lamps.

## How to get to it (user POV)

Development build only: open `/?ride=madrid-gran-via`. Add `&bike=<bike id>` to choose the bike (default `ostra-sesta-600`, also `halden-wren-400` and the other ids in `packages/sim/src/bikes.ts`) and `&with=alone`, `&with=field` or `&with=traffic` (the default). `&level=<n>` sets the field's level. The production build ignores all of them.

## Driving it with rv

Preconditions: a slot from `rv up` on this checkout and a passing `rv doctor`.

- Ride alone on the Sesta: `rv open --run <run> "/?ride=madrid-gran-via&bike=ostra-sesta-600&with=alone&autopilot&prof&fps" --until race`, then `rv shot --run <run> alcala`. The HUD reads 1ST of 1, the overlay holds the display's own pace, 120 fps on a 120 Hz Mac, at rung 0 of 8, and the gate's piers fill the right edge of the frame, square to the camera, as the countdown runs.
- Freeze at each landmark: `rv open --run <run> "/?ride=madrid-gran-via&bike=ostra-sesta-600&with=alone&autopilot&hold=at&holdafter=<metres>" --until held`, then `rv shot --run <run> <name>`. Useful distances, with the speed the Sesta held at on 2026-10-30, give or take a km/h between runs: 60 Puerta de Alcalá 93 km/h, 300 Cibeles 189, 780 Metrópolis 158, 1190 Telefónica 211, 1580 Carrión 130, 2090 Plaza de España 86. The freeze catches the rider at that distance, not at the slowest point of the bend after it, which is why these run above the slowest corner speeds in `docs/madrid-corridor.md`. Read the speed with `rv js --run <run> 'document.querySelector("[role=meter][aria-label=Speed]").getAttribute("aria-valuenow")'`.
- What each freeze should show: blocks wall both sides at every one of the six, the chevrons stand before the Cibeles bend, the Telefónica massing closes the street from Metrópolis, trees stand only on the Plaza de España garden, and no mountain shows anywhere. The backdrop ring is drawn behind a road whose ground is grass and behind no road whose ground is paved.
- Ride with the field or with traffic: swap `with=alone` for `with=field` or `with=traffic`. The grid fills with rivals; traffic adds cars in both lanes.
- Measure a lap: `rv open --run <run> "/?ride=madrid-gran-via&bike=ostra-sesta-600&with=alone&autopilot&prof" --until race`, `rv sample --run <run> gran-via-lap --seconds 30`, then `rv wait --run <run> 'document.querySelector("[aria-label=Finish]") !== null' --timeout 120`. The finish menu shows no time. The headless pilot on the same seed finishes alone on the Sesta in 57.0 s and on the Wren in 60.3 s.
- Measure the scene alone: `rv open --run <run> "/?ride=madrid-gran-via&with=alone&autopilot&prof&fps&at=1100" --until race` then `rv sample --run <run> gran-via-dense --seconds 20` puts the rider in the deepest part of the canyon. `at` moves the player alone, so the rivals stay on the grid and this measures the city, not the field.
- Measure the busiest frame: ride the whole lap from the grid, `rv open --run <run> "/?ride=madrid-gran-via&with=traffic&autopilot&prof&fps" --until race` then `rv sample --run <run> gran-via-lap-traffic --seconds 40`, which keeps the pack and the cars around the rider all the way. Read the counts with `rv js --run <run> 'document.body.innerText.split("\n").filter((line) => line.includes("tris")).join(" | ")'` and the shader programs with `rv js --run <run> '(() => { const p = globalThis.__rushlineProfile; const i = p.info(); return JSON.stringify(p.window(i.tick - 60, i.tick).at(-1).programs); })()'`. `docs/madrid-corridor.md#puerta-de-alcalá-into-gran-vía` holds what both returned, and why the stretch takes no budget row.
- Measure camera steadiness without a browser: `pnpm test apps/web/test/madrid-camera.test.ts` rides the pilot on every road and both Madrid stretches and fails if a stretch's straights shake more than the shakiest existing road's.
- Read the fitted numbers without a browser: `pnpm madrid:stretch --id madrid-gran-via` regenerates the plan, its scenery and its three block modules and prints the distance from the street, the sign flips per kilometre, the grade fit, the blocks kept and dropped, and each landmark's massing. A clean `git diff` after it proves the plan matches its inputs.

## Gotchas

- The stretch borrows Slag Row's road id for the field draw, the police officer and the result, as the hook does, so the ride-out card and the results screen say Slag Row. The track, length and lap time are the stretch's.
- Police posts start at 1,500 m, so a cop can ride the last 850 m when police are in the race. `with=alone` drops them.
- The race starts at the north edge of the Puerta de Alcalá roundabout and the first bend is a 25 m radius inside the first 120 m. A rider who holds full throttle off the grid runs wide there; the pilot does not.
- Buildings are the corridor's machine-estimated heights, most of them 13 to 23 m, so Gran Vía's walls are the right height but not the right buildings. Landmark massing is authored prisms, not the real shapes.
- Trees stand only on the two grass patches. Paving has none, which is what the real street looks like from a bike.
- `?hold=at` freezes on the first tick past the distance, so speeds read a few km/h either side of the slowest point.
