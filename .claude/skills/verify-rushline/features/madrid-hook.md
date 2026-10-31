# Casa de Campo hook

A greybox of the Madrid corridor's Casa de Campo hook: Paseo del Embarcadero along the lake, an S-bend by the boathouse, then Glorieta de los Patines. The player rides 1,039 metres of fitted road through grey blocks, simple trees and a flat lake. It answers one question, whether the hook rides well at speed, and it is reached only by a development URL. No menu, career race or bar screen leads to it.

## Sub-features

- `alone`: the player only, no rivals, no police, no traffic.
- `field`: the practice field at the chosen level, no traffic.
- `traffic`: the field and the hook's traffic.
- `sbend`: the Embarcadero S-bend, 430 to 630 m, built to a 35 m radius.
- `patines`: Glorieta de los Patines, 780 to 1,020 m, a junction built to a 25 m radius that the rider slows for.
- `scenery`: world-space ground under its grass cover, 48 grey blocks from the footprints, the traced lake and trees.

## How to get to it (user POV)

Development build only: open `/?ride=madrid-hook`. Add `&bike=<bike id>` to choose the bike (default `ostra-sesta-600`, also `halden-wren-400` and the other ids in `packages/sim/src/bikes.ts`) and `&with=alone`, `&with=field` or `&with=traffic` (the default). `&level=<n>` sets the field's level. The production build ignores all of them.

## Driving it with rv

Preconditions: a slot from `rv up` on this checkout and a passing `rv doctor`.

- Ride alone on the Sesta: `rv open --run <run> "/?ride=madrid-hook&bike=ostra-sesta-600&with=alone&autopilot&prof&fps" --until race`, then `rv shot --run <run> hook-start`. The HUD reads 1ST of 1, the overlay holds 60 fps.
- Freeze in the S-bend: `rv open --run <run> "/?ride=madrid-hook&bike=ostra-sesta-600&with=alone&autopilot&hold=at&holdafter=532" --until held`, then `rv js --run <run> 'document.querySelector("[role=meter][aria-label=Speed]").getAttribute("aria-valuenow")'` and `rv shot --run <run> sbend`. The Sesta reads about 60 km/h, the Wren about 69, the lake lies to the right.
- Freeze at Patines: the same with `holdafter=853`. The Sesta reads about 54 km/h, the Wren about 61.
- Ride with the field or with traffic: swap `with=alone` for `with=field` or `with=traffic`. The grid fills with rivals; traffic adds cars in both lanes.
- Measure a lap: `rv open --run <run> "/?ride=madrid-hook&bike=ostra-sesta-600&with=alone&autopilot&prof" --until race`, `rv sample --run <run> hook-lap --seconds 30`, then `rv wait --run <run> 'document.querySelector("[aria-label=Finish]") !== null' --timeout 90` for the finish. The finish menu shows no time. The headless pilot on the same seed finishes alone on the Sesta in 35.1 s and on the Wren in 35.0 s, and the Helium speeds at both places match it.
- Measure camera steadiness without a browser: `pnpm test apps/web/test/madrid-camera.test.ts` rides the pilot on every road and both Madrid stretches, drives the real chase camera, and fails if a stretch's straights shake more than the shakiest existing road's. `docs/madrid-corridor.md` has the numbers.
- Read the fitted numbers without a browser: `pnpm madrid:stretch --id madrid-hook` regenerates `packages/track/src/tracks/madrid-hook.ts`, its scenery and its blocks module, and prints the distance from the street, the curvature and grade change sign flips per kilometre, the grade fit, the blocks kept and the lake clearance. A clean `git diff` after it proves the plan matches its inputs.

## Gotchas

- The hook borrows Slag Row's road id for the field draw, the police officer and the result, so the ride-out card and the results screen say Slag Row. The track, length and lap time are the hook's.
- Police posts start at 1,500 m, past the hook's finish at 1,039 m, so no cop rides on the hook in any mode.
- The race starts within 80 m of the game origin and ends 200 m past the street's end at 4,650 m. Hazards keep the 450 m start clearance, so level 1 shows one pothole, on the Patines approach.
- Tree positions are procedural, not surveyed. Blocks take the corridor's estimated heights.
- `?hold=at` freezes on the first tick past the distance, so speeds read a few km/h either side of the slowest point.
